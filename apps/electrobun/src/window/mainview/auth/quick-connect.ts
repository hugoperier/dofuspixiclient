import { IS_DEV_BUILD } from "@/utils/build-env";

/**
 * Quick connect — one click from the login screen into the game, for the
 * accounts this machine has seeded.
 *
 * `just dev-accounts` writes the roster; the Vite dev server serves it at
 * `/__dev-accounts` and a production bundle has no such route, so
 * `loadQuickConnectRoster` resolves to an empty list there and the strip
 * never renders. It carries derived keys, not passwords: that is what
 * `AccountSendIdentity` sends anyway, and it makes the click instant.
 */

export interface QuickConnectAccount {
  username: string;
  label: string;
  /** The character to walk in as, when the roster named one. */
  character: string | null;
  level: number | null;
  classId: number | null;
  passwordKey: string;
}

const ROSTER_URL = "/__dev-accounts";

/**
 * The account a quick connect is currently walking through the flow, or
 * null for a hand-typed sign-in.
 *
 * Module state rather than React state because the follow-through spans
 * three screens: `AuthFlow` reads it after the server list and again
 * after the character list, both of which arrive long after the button
 * that started it has unmounted.
 */
let pending: QuickConnectAccount | null = null;

export function beginQuickConnect(account: QuickConnectAccount): void {
  pending = account;
}

export function pendingQuickConnect(): QuickConnectAccount | null {
  return pending;
}

/** Called once the flow has landed in game, or given up. */
export function clearQuickConnect(): void {
  pending = null;
}

/**
 * Fetch the roster. Never throws: no dev server, no file, or a malformed
 * one all mean the same thing to the caller — nothing to offer.
 */
export async function loadQuickConnectRoster(): Promise<QuickConnectAccount[]> {
  if (!IS_DEV_BUILD) {
    return [];
  }

  try {
    const response = await fetch(ROSTER_URL, { cache: "no-store" });

    if (!response.ok) {
      return [];
    }

    const body = (await response.json()) as {
      accounts?: QuickConnectAccount[];
    };

    return (body.accounts ?? []).filter(
      (account) =>
        typeof account.username === "string" &&
        typeof account.passwordKey === "string"
    );
  } catch {
    return [];
  }
}
