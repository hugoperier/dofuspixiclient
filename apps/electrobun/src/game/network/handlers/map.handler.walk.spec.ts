import { describe, expect, test } from "bun:test";

import { create } from "@bufbuild/protobuf";

import { MapHandler } from "@/game/network/handlers/map.handler";
import { MessageHandler } from "@/game/network/message-handler";
import {
  ActionMovementSchema,
  DofusMessageSchema,
  GameActionSchema,
} from "@/game/network/protocol";
import { logBuffer } from "@/utils/logger";

/**
 * The probes around the walk animation.
 *
 * `handleActorPath` awaits the whole animation and only then commits the
 * landing cell, clears `isMoving` and sends the ack. Anything that runs during
 * that await — a `handleMapData` from a map change, most of all — resets the
 * same fields underneath it, and what wakes up afterwards writes a cell that
 * belongs to the map it just left and acks an action the server has already
 * replaced.
 *
 * These tests do not fix that. They pin the instrumentation that makes it
 * legible in a journal, because from the outside it looks exactly like "the
 * character walked somewhere odd and stopped answering clicks".
 */

const SELF = "1";

function harness() {
  const messages = new MessageHandler();
  const sent: string[] = [];

  /** Resolved by the test, so the await inside `handleActorPath` can be held open. */
  let releaseAnimation: (() => void) | undefined;

  const battlefield = {
    moveWorldActor: () =>
      new Promise<void>((resolve) => {
        releaseAnimation = resolve;
      }),
    getWorldActorRenderer: () => ({ getPlayerCell: () => 268 }),
    setCellInteractive: () => {},
    getSpriteAnchor: () => ({ x: 0, y: 0 }),
    getCellHarvestJob: () => 0,
  };

  const handler = new MapHandler(
    messages,
    {
      send: () => {
        sent.push("frame");
        return true;
      },
    } as never,
    { playSound: () => {} } as never,
    {
      getCurrentCharacter: () => ({ id: 1, spriteId: SELF }),
      setMapPosition: () => {},
    } as never,
    () => battlefield as never
  );

  const walk = (cells: number[]) =>
    messages.handle(
      create(DofusMessageSchema, {
        payload: {
          case: "gameAction",
          value: create(GameActionSchema, {
            actionType: 1,
            spriteId: SELF,
            sequenceId: 3,
            actionData: {
              case: "movement",
              value: create(ActionMovementSchema, { pathCells: cells }),
            },
          }),
        },
      })
    );

  /** Stands in for `handleMapData`, which needs a real map payload to run. */
  const setCurrentMap = (mapId: number | null) => {
    (handler as unknown as { currentMapId: number | null }).currentMapId =
      mapId;
  };

  return {
    handler,
    sent,
    walk,
    setCurrentMap,
    release: () => releaseAnimation?.(),
    /** Lets the microtask queue drain so the tail of `handleActorPath` runs. */
    settle: () => new Promise((resolve) => setTimeout(resolve, 0)),
  };
}

function messagesMatching(pattern: RegExp): string[] {
  return logBuffer
    .snapshot()
    .filter((entry) => pattern.test(entry.msg))
    .map((entry) => entry.msg);
}

describe("walk instrumentation", () => {
  test("logs the whole path when the walk starts, not just its ends", async () => {
    logBuffer.clear();

    const h = harness();

    h.setCurrentMap(7411);
    h.walk([153, 168, 183, 198, 268]);

    const start = messagesMatching(/^walk start/);

    expect(start).toHaveLength(1);
    expect(start[0]).toContain("seq=3");
    expect(start[0]).toContain("map=7411");
    expect(start[0]).toContain("4 step(s)");
    expect(start[0]).toContain("153 → 268");
    expect(start[0]).toContain("[153,168,183,198,268]");

    h.release();
    await h.settle();
  });

  test("a map change during the animation is reported, not silently absorbed", async () => {
    logBuffer.clear();

    const h = harness();

    h.setCurrentMap(7411);
    h.walk([153, 168, 268]);

    // The map changed while the sprite was still animating: this is the
    // interleaving that makes a character land on a cell of the map it left.
    h.setCurrentMap(7412);
    h.release();
    await h.settle();

    const warned = messagesMatching(/^walk finished on a different map/);

    expect(warned).toHaveLength(1);
    expect(warned[0]).toContain("start=7411");
    expect(warned[0]).toContain("now=7412");
  });

  test("an uneventful walk does not warn", async () => {
    logBuffer.clear();

    const h = harness();

    h.setCurrentMap(7411);
    h.walk([153, 168, 268]);
    h.release();
    await h.settle();

    expect(messagesMatching(/different map/)).toHaveLength(0);
    expect(messagesMatching(/^walk end/)).toHaveLength(1);
  });

  test("the landing line names the expected cell when it differs", async () => {
    logBuffer.clear();

    const h = harness();

    h.setCurrentMap(7411);
    // The renderer reports cell 268 (see the harness); the path ends on 300,
    // which is what an interrupted walk looks like.
    h.walk([153, 168, 300]);
    h.release();
    await h.settle();

    const end = messagesMatching(/^walk end/);

    expect(end).toHaveLength(1);
    expect(end[0]).toContain("cell=268");
    expect(end[0]).toContain("(expected 300)");
  });
});
