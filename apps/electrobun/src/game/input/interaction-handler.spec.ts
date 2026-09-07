import { describe, expect, it } from "bun:test";

import { Container } from "pixi.js";

import { InteractionHandler } from "./interaction-handler";

/**
 * Le drapeau `enabled` ne gardait que la molette, et personne ne l'écrivait.
 * Les trois gestionnaires de pointeur vivent sur `app.stage`
 * (`battlefield/bootstrap.ts:219-222`), qui est un ancêtre du conteneur de la
 * carte du monde : ses clics remontaient jusqu'au jeu et déplaçaient le
 * personnage.
 */

function makeHandler() {
  const calls = { ground: [] as Array<[number, number]>, hover: 0, picks: 0 };

  const canvas = {
    addEventListener: () => {},
    removeEventListener: () => {},
    getBoundingClientRect: () => ({ left: 0, top: 0 }),
  } as unknown as HTMLCanvasElement;

  const pickingSystem = {
    pick: () => {
      calls.picks++;
      return null;
    },
    markDirty: () => {},
  } as unknown as import("@/game/render/picking-system").PickingSystem;

  const handler = new InteractionHandler({
    mapContainer: new Container(),
    pickingSystem,
    canvas,
    onGroundClick: (x, y) => calls.ground.push([x, y]),
    onGroundHover: () => {
      calls.hover++;
    },
  });

  return { handler, calls };
}

const event = (x: number, y: number) =>
  ({ global: { x, y } }) as unknown as import("pixi.js").FederatedPointerEvent;

describe("InteractionHandler.enabled", () => {
  it("déplace au clic quand la souris du jeu est active", () => {
    const { handler, calls } = makeHandler();

    handler.handlePointerDown(event(100, 100));
    handler.handlePointerUp();

    expect(calls.ground).toHaveLength(1);
  });

  it("n'émet aucun déplacement quand elle est coupée", () => {
    const { handler, calls } = makeHandler();

    handler.enabled = false;
    handler.handlePointerDown(event(100, 100));
    handler.handlePointerUp();

    expect(calls.ground).toEqual([]);
  });

  it("ne survole ni ne teste le picking quand elle est coupée", () => {
    const { handler, calls } = makeHandler();

    handler.enabled = false;
    handler.handlePointerMove(event(120, 120));

    expect(calls.hover).toBe(0);
    expect(calls.picks).toBe(0);
  });

  it("ne relâche pas un drag entamé avant la coupure", () => {
    const { handler, calls } = makeHandler();

    // Clic enfoncé sur la carte, puis la carte du monde s'ouvre par-dessus.
    handler.handlePointerDown(event(100, 100));
    handler.enabled = false;
    handler.handlePointerUp();

    expect(calls.ground).toEqual([]);
  });

  it("retrouve son comportement une fois rétablie", () => {
    const { handler, calls } = makeHandler();

    handler.enabled = false;
    handler.enabled = true;
    handler.handlePointerDown(event(100, 100));
    handler.handlePointerUp();

    expect(calls.ground).toHaveLength(1);
  });
});
