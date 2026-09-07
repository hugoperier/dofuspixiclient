import { create, fromBinary, toBinary } from "@bufbuild/protobuf";
import {
  type ClientMessage,
  ClientMessageSchema,
  type DofusMessage,
  DofusMessageSchema,
} from "@dofus/proto";

export type ClientPayload = ClientMessage["payload"];
export type ServerPayload = DofusMessage["payload"];
export type ClientPayloadCase = Exclude<ClientPayload["case"], undefined>;
export type ServerPayloadCase = Exclude<ServerPayload["case"], undefined>;

export type ServerPayloadValue<C extends ServerPayloadCase> = Extract<
  ServerPayload,
  { case: C }
>["value"];

export type ClientPayloadValue<C extends ClientPayloadCase> = Extract<
  ClientPayload,
  { case: C }
>["value"];

export function encodeClient<C extends ClientPayloadCase>(
  caseName: C,
  value: ClientPayloadValue<C>
): Uint8Array {
  const envelope = create(ClientMessageSchema, {
    payload: { case: caseName, value } as ClientPayload,
  });
  return toBinary(ClientMessageSchema, envelope);
}

export function decodeServer(data: ArrayBuffer | Uint8Array): DofusMessage {
  const bytes = data instanceof ArrayBuffer ? new Uint8Array(data) : data;
  return fromBinary(DofusMessageSchema, bytes);
}

/**
 * Names an outbound frame for the `net` trace channel.
 *
 * `Connection.send` only ever sees a `Uint8Array` — the payload case was
 * erased by `encodeClient` at one of its 56 call sites — so recovering the
 * name means decoding the envelope again. That is why this is only ever
 * called from inside a `log.trace("net", …)` thunk: the cost is real, and it
 * is paid solely while the channel is armed.
 */
export function describeClientFrame(bytes: Uint8Array): string {
  try {
    const decoded = fromBinary(ClientMessageSchema, bytes);

    return `${decoded.payload.case ?? "?"} (${bytes.byteLength} B)`;
  } catch {
    return `<undecodable> (${bytes.byteLength} B)`;
  }
}

export type { ClientMessage, DofusMessage };

export * from "@dofus/proto";
