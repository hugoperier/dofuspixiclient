import { useEffect, useState } from "react";

import type { GameClient } from "@/game/game-client";

import {
  beginQuickConnect,
  loadQuickConnectRoster,
  type QuickConnectAccount,
} from "./quick-connect";

interface Props {
  client: GameClient;
  disabled: boolean;
}

/**
 * One button per locally seeded account, under the sign-in form.
 *
 * Renders nothing at all when the roster is empty — no dev server, no
 * `dev-accounts.json`, or a production bundle — so the login screen is
 * unchanged for anyone who has not run `just dev-accounts`.
 */
export function QuickConnectStrip({ client, disabled }: Props) {
  const [accounts, setAccounts] = useState<QuickConnectAccount[]>([]);
  const [connecting, setConnecting] = useState<string | null>(null);

  useEffect(() => {
    let live = true;

    loadQuickConnectRoster().then((roster) => {
      if (live) {
        setAccounts(roster);
      }
    });

    return () => {
      live = false;
    };
  }, []);

  if (accounts.length === 0) {
    return null;
  }

  const connect = async (account: QuickConnectAccount) => {
    setConnecting(account.username);
    beginQuickConnect(account);
    await client.loginWithKey(account.username, account.passwordKey);
  };

  return (
    <div className="mt-5 border-t border-white/10 pt-4">
      <div className="mb-2 flex items-baseline justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-neutral-400">
          Connexion rapide
        </span>
        <span className="text-[11px] text-neutral-600">dev</span>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {accounts.map((account) => (
          <button
            key={account.username}
            type="button"
            disabled={disabled || connecting !== null}
            title={account.character ?? account.username}
            onClick={() => connect(account)}
            className="rounded bg-neutral-800/80 px-2.5 py-1 text-xs text-neutral-200 ring-1 ring-white/10 transition hover:bg-neutral-700 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
          >
            {connecting === account.username ? "…" : account.label}
          </button>
        ))}
      </div>
    </div>
  );
}
