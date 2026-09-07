/** Visual QA only; never injected into the fight store or sent by the server. */
import { create } from "@bufbuild/protobuf";
import { GameEndSchema } from "@dofus/proto/game_pb";
import { ItemTemplateDataSchema } from "@dofus/proto/items_pb";

export const resultFixture = create(GameEndSchema, {
  durationMs: 960000,
  winnerTeam: 0,
  challenges: [
    {
      challengeId: 1,
      name: "Zombie",
      succeeded: false,
      xpBonusPct: 25,
      dropBonusPct: 25,
    },
    {
      challengeId: 2,
      name: "Statue",
      succeeded: false,
      xpBonusPct: 50,
      dropBonusPct: 50,
    },
  ],
  results: [
    {
      spriteId: "1",
      name: "Durbix",
      level: 180,
      xpWon: 600292n,
      xpGuild: 122n,
      kamaWon: 168n,
      isPlayer: true,
      experience: { current: 50n, levelFloor: 0n, nextLevelFloor: 100n },
      itemsWon: [
        { itemId: 8083, quantity: 1 },
        { itemId: 10843, quantity: 1 },
        { itemId: 312, quantity: 1 },
      ],
    },
    {
      spriteId: "2",
      name: "Bargogs",
      level: 161,
      xpWon: 319731n,
      xpGuild: 168n,
      xpMount: 673n,
      kamaWon: 112n,
      isPlayer: true,
      experience: { current: 80n, levelFloor: 0n, nextLevelFloor: 100n },
      itemsWon: [
        { itemId: 10843, quantity: 1 },
        { itemId: 312, quantity: 1 },
      ],
    },
    {
      spriteId: "3",
      name: "shadowolflo",
      level: 190,
      xpWon: 480760n,
      xpGuild: 98n,
      xpMount: 1962n,
      kamaWon: 47n,
      isPlayer: true,
      experience: { current: 78n, levelFloor: 0n, nextLevelFloor: 100n },
      itemsWon: [
        { itemId: 10843, quantity: 1 },
        { itemId: 312, quantity: 1 },
      ],
    },
    {
      spriteId: "4",
      name: "Scotche",
      level: 162,
      xpWon: 318155n,
      xpGuild: 64n,
      kamaWon: 146n,
      isPlayer: true,
      experience: { current: 20n, levelFloor: 0n, nextLevelFloor: 100n },
      itemsWon: [
        { itemId: 350, quantity: 1 },
        { itemId: 10843, quantity: 1 },
      ],
    },
    {
      spriteId: "-1",
      name: "Krtek",
      level: 430,
      team: 1,
      isDead: true,
      isPlayer: false,
    },
  ],
});

export const resultTemplates = new Map(
  [
    create(ItemTemplateDataSchema, {
      id: 8083,
      name: "Os de Pékeualak",
      typeId: 47,
      gfxId: 10,
    }),
    create(ItemTemplateDataSchema, {
      id: 10843,
      name: "Note sur Krtek",
      typeId: 24,
      gfxId: 176,
    }),
    create(ItemTemplateDataSchema, {
      id: 312,
      name: "Fer",
      typeId: 39,
      gfxId: 24,
    }),
    create(ItemTemplateDataSchema, {
      id: 350,
      name: "Argent",
      typeId: 39,
      gfxId: 28,
    }),
  ].map((item) => [item.id, item])
);
