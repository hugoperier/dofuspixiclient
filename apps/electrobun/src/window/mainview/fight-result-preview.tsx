import { create } from "@bufbuild/protobuf";
import {
  FightItemDropSchema,
  FightResultSchema,
  GameEndSchema,
} from "@dofus/proto/game_pb";
import { useState } from "react";
import { createRoot } from "react-dom/client";

import { FightResultWindow } from "@/hud/fight/FightResultWindow";
import {
  resultFixture,
  resultTemplates,
} from "@/hud/fight/fight-result.fixture";
import "./index.css";
import "./typography.css";

function Preview() {
  const [closed, setClosed] = useState(false);
  const params = new URLSearchParams(location.search);
  const width = Number(params.get("width")) || 914;
  const height = Number(params.get("height")) || 532;
  const result = create(GameEndSchema, resultFixture);
  if (params.get("scenario") === "large") {
    result.results = [0, 1].flatMap((team) =>
      Array.from({ length: 8 }, (_, index) => ({
        ...create(FightResultSchema, resultFixture.results[0]),
        spriteId: `${team}:${index}`,
        team,
        name:
          index === 0
            ? "Un nom de combattant particulièrement long"
            : `Combattant ${index + 1}`,
      }))
    );
    const first = result.results[0];
    if (first) {
      first.itemsWon = Array.from({ length: 20 }, (_, index) =>
        create(FightItemDropSchema, { itemId: index + 1, quantity: 1 })
      );
    }
  }
  if (params.get("scenario") === "legacy") {
    result.challenges = [];
    result.results = result.results.slice(0, 1).map((entry) => ({
      ...entry,
      isPlayer: undefined,
      experience: undefined,
      itemsWon: [],
    }));
  }
  return (
    <main
      style={{ position: "relative", width, height, background: "#22251e" }}
    >
      {closed ? (
        <p style={{ color: "white" }}>Fenêtre fermée</p>
      ) : (
        <FightResultWindow
          result={result}
          templates={resultTemplates}
          playArea={{ width, height }}
          onClose={() => setClosed(true)}
        />
      )}
    </main>
  );
}

if (import.meta.env.DEV) {
  document.body.style.margin = "0";
  const element = document.getElementById("app");
  if (element) {
    createRoot(element).render(<Preview />);
  }
}
