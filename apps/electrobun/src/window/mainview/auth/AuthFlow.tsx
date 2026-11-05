import { useSelector } from "@xstate/react";
import { useEffect, useMemo } from "react";

import type { GameClient } from "@/game/game-client";
import { loginActor } from "@/game/machines/actors";

import { CharacterSelectScreen } from "./CharacterSelectScreen";
import { LoginScreen } from "./LoginScreen";
import { clearQuickConnect, pendingQuickConnect } from "./quick-connect";
import { ServerSelectScreen } from "./ServerSelectScreen";

interface Props {
  client: GameClient;
  onEnterGame: () => void;
}

/**
 * Orchestrates the pre-game flow against a GameClient owned by the parent
 * (App). Subscribes to loginActor and drives automatic follow-ups after
 * auth / server-select / character-select. The GameClient is NOT torn down
 * when this component unmounts — the in-game renderer keeps using the same
 * authenticated WebSocket session.
 */
export function AuthFlow({ client, onEnterGame }: Props) {
  const state = useSelector(loginActor, (s) => s.value);
  const context = useSelector(loginActor, (s) => s.context);

  // Auto-request servers once authenticated.
  useEffect(() => {
    if (state === "waitingServers") {
      client.requestServers();
    }
  }, [state, client]);

  // Auto-request characters once a server is selected.
  useEffect(() => {
    if (state === "waitingCharacters") {
      client.requestCharacters();
    }
  }, [state, client]);

  // A quick connect walks the rest of the flow on its own — that is the
  // whole point of it. Both steps only fire when the choice is
  // unambiguous; anything else falls through to the normal screen rather
  // than picking for the player.
  useEffect(() => {
    if (state !== "serverSelect" || !pendingQuickConnect()) {
      return;
    }

    const playable = context.servers.filter(
      (server) => server.isSelectable && server.characterCount > 0
    );
    const only = playable.length === 1 ? playable[0] : undefined;

    if (only) {
      client.selectServer(only.serverId);
    }
  }, [state, context.servers, client]);

  useEffect(() => {
    const account = pendingQuickConnect();

    if (state !== "characterSelect" || !account) {
      return;
    }

    // The roster names the character it was generated from; fall back to
    // the only one when it does not, so an account seeded since still
    // works.
    const named = context.characters.find(
      (character) => character.name === account.character
    );
    const target =
      named ??
      (context.characters.length === 1 ? context.characters[0] : undefined);

    if (target) {
      client.selectCharacter(Number(target.id));
    }
  }, [state, context.characters, client]);

  // Release the quick connect once it has arrived or given up, so a
  // hand-typed sign-in afterwards is not walked through by the previous
  // one's roster entry.
  useEffect(() => {
    if (state === "inGame" || state === "failed") {
      clearQuickConnect();
    }
  }, [state]);

  // Hand off to in-game renderer when fully loaded.
  useEffect(() => {
    if (state === "inGame") {
      onEnterGame();
    }
  }, [state, onEnterGame]);

  const busy = useMemo(
    () =>
      state === "authenticating" ||
      state === "waitingServers" ||
      state === "selectingServer" ||
      state === "waitingCharacters" ||
      state === "loadingCharacter",
    [state]
  );

  if (state === "idle" || state === "authenticating" || state === "failed") {
    return (
      <LoginScreen
        client={client}
        failureReason={context.failureReason}
        busy={busy}
      />
    );
  }

  if (
    state === "waitingServers" ||
    state === "serverSelect" ||
    state === "selectingServer"
  ) {
    return (
      <ServerSelectScreen
        client={client}
        servers={context.servers}
        busy={busy}
      />
    );
  }

  if (
    state === "waitingCharacters" ||
    state === "characterSelect" ||
    state === "loadingCharacter"
  ) {
    return (
      <CharacterSelectScreen
        client={client}
        characters={context.characters}
        busy={busy}
      />
    );
  }

  return null;
}
