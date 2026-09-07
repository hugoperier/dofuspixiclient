import type { ConnectionConfig, ConnectionState } from "@/game/types";
import { getClientId } from "@/utils/client-id";
import { createLogger } from "@/utils/logger";

import { isTerminalClose, WS_CLOSE_NORMAL } from "./close-codes";
import {
  type DofusMessage,
  decodeServer,
  describeClientFrame,
} from "./protocol";

const log = createLogger("Connection");

export type ConnectionEvent =
  | { type: "connected" }
  | { type: "disconnected"; code: number; reason: string }
  | { type: "error"; error: Error }
  | { type: "message"; message: DofusMessage }
  | { type: "reconnecting"; attempt: number }
  // Every reconnect attempt has been spent. Without this the caller saw a
  // `disconnected` event, then nothing — indistinguishable from a healthy idle
  // link, which is how the UI ended up lying about being connected (QA-046).
  | { type: "failed"; attempts: number };

export type ConnectionEventListener = (event: ConnectionEvent) => void;

const DEFAULT_CONFIG: Required<ConnectionConfig> = {
  url: "ws://localhost:8080",
  reconnectInterval: 3000,
  maxReconnectAttempts: 5,
};

// A new socket only helps when the old one died of something a new one could
// survive. A clean close was asked for; a terminal close means the server ended
// the session on purpose — reconnecting there would hand us a live socket and
// nothing else, which is the zombie session QA-046 is about.
function isRetryable(code: number): boolean {
  return code !== WS_CLOSE_NORMAL && !isTerminalClose(code);
}

/**
 * Hangs this tab's `clientId` off the WebSocket URL.
 *
 * The gateway logs it once beside the `sessionId` it mints, which is the only
 * thing that lets a client log line and a server log line about the same click
 * be recognised as the same event — nothing on the wire carries a correlation
 * id, and the `sessionId` never travels back to the client.
 *
 * It has to survive the authd → gamed pivot, so it is applied on every
 * `connect()` rather than once at construction.
 */
function withClientId(url: string): string {
  try {
    const parsed = new URL(url);

    parsed.searchParams.set("clientId", getClientId());

    return parsed.toString();
  } catch {
    // A URL the parser refuses is one the WebSocket will refuse too; hand it
    // back untouched and let the socket produce the real error.
    return url;
  }
}

export class Connection {
  private config: Required<ConnectionConfig>;
  private socket: WebSocket | null = null;
  private state: ConnectionState = "disconnected";
  private reconnectAttempts = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private listeners: Set<ConnectionEventListener> = new Set();
  private messageQueue: Uint8Array[] = [];

  constructor(config: ConnectionConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  getState(): ConnectionState {
    return this.state;
  }

  // setUrl points the connection at a different WS endpoint. Used to pivot
  // from authd → gamed once an auth ticket is acquired (Dofus split-binary
  // architecture: one process handles login + server list, another handles
  // in-game traffic). Resets the reconnect counter so future drops on the
  // new endpoint can recover.
  setUrl(url: string): void {
    this.config.url = url;
    this.reconnectAttempts = 0;
  }

  isConnected(): boolean {
    return (
      this.state === "connected" && this.socket?.readyState === WebSocket.OPEN
    );
  }

  addEventListener(listener: ConnectionEventListener): void {
    this.listeners.add(listener);
  }

  removeEventListener(listener: ConnectionEventListener): void {
    this.listeners.delete(listener);
  }

  private emit(event: ConnectionEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (e) {
        log.error("Connection listener error:", e);
      }
    }
  }

  connect(): void {
    if (this.state === "connecting" || this.state === "connected") {
      return;
    }

    this.state = "connecting";
    this.clearReconnectTimer();

    try {
      this.socket = new WebSocket(withClientId(this.config.url));
      this.socket.binaryType = "arraybuffer";
      this.socket.onopen = this.handleOpen.bind(this);
      this.socket.onclose = this.handleClose.bind(this);
      this.socket.onerror = this.handleError.bind(this);
      this.socket.onmessage = this.handleMessage.bind(this);
    } catch (error) {
      this.state = "disconnected";
      this.emit({ type: "error", error: error as Error });
      this.scheduleReconnect();
    }
  }

  disconnect(): void {
    this.clearReconnectTimer();
    this.reconnectAttempts = this.config.maxReconnectAttempts;

    if (this.socket) {
      this.socket.close(WS_CLOSE_NORMAL, "Client disconnect");
      this.socket = null;
    }

    this.state = "disconnected";
  }

  send(data: Uint8Array): boolean {
    if (!this.socket || !this.isConnected()) {
      // Queued, not sent — and callers routinely discard the return value.
      // `GameClient.move` in particular marks the move in flight *before*
      // calling this, so a queued frame leaves the client believing it is
      // walking while nothing left the machine; only the 2 s timeout in
      // `MapHandler.isSelfMoveInFlight` then frees it. Worth a line every
      // time, not a trace channel.
      this.messageQueue.push(data);
      log.warn(
        `send queued (socket ${this.state}): ${data.byteLength} B, ` +
          `${this.messageQueue.length} frame(s) waiting`
      );
      return false;
    }

    try {
      this.socket.send(data);
      log.trace("net", () => `→ ${describeClientFrame(data)}`);
      return true;
    } catch (e) {
      log.error("send failed:", e);
      return false;
    }
  }

  private flushMessageQueue(): void {
    while (this.messageQueue.length > 0 && this.isConnected()) {
      const next = this.messageQueue.shift();

      if (next) {
        this.send(next);
      }
    }
  }

  private handleOpen(): void {
    this.state = "connected";
    this.reconnectAttempts = 0;
    this.emit({ type: "connected" });
    this.flushMessageQueue();
  }

  private handleClose(event: CloseEvent): void {
    this.socket = null;
    this.state = "disconnected";
    this.emit({ type: "disconnected", code: event.code, reason: event.reason });

    if (isRetryable(event.code)) {
      this.scheduleReconnect();
    }
  }

  private handleError(): void {
    this.emit({ type: "error", error: new Error("WebSocket error") });
  }

  private handleMessage(event: MessageEvent): void {
    try {
      const message = decodeServer(event.data as ArrayBuffer);

      log.trace("net", () => `← ${message.payload.case ?? "?"}`);

      this.emit({ type: "message", message });
    } catch (e) {
      log.error("Failed to decode message:", e);
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.config.maxReconnectAttempts) {
      this.emit({ type: "failed", attempts: this.reconnectAttempts });
      return;
    }

    this.clearReconnectTimer();
    this.state = "reconnecting";
    this.reconnectAttempts++;
    this.emit({ type: "reconnecting", attempt: this.reconnectAttempts });
    this.reconnectTimer = setTimeout(
      () => this.connect(),
      this.config.reconnectInterval
    );
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  destroy(): void {
    this.disconnect();
    this.listeners.clear();
    this.messageQueue = [];
  }
}
