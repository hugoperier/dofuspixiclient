import { create } from "@bufbuild/protobuf";
import { FightGetDetailsRequestSchema } from "@dofus/proto/misc_pb";
import type { MessageHandler } from "../message-handler";
import type { Connection } from "../connection";
import { encodeClient } from "../protocol";
import { applyMapFight, applyMapTeam, applyFightList, mapFightsStore, resetMapFights, closeFightBrowser } from "@/game/stores/map-fights-store";

export function registerFightDirectory(mh: MessageHandler, connection: Pick<Connection, "send">): (() => void)[] {
  return [
    mh.on("gameMapData", resetMapFights),
    mh.on("gameJoin", () => { closeFightBrowser(); mapFightsStore.setState({ markers: new Map() }); }),
    mh.on("gameChallenge", applyMapFight),
    mh.on("gameTeam", applyMapTeam),
    mh.on("fightsCount", (payload) => mapFightsStore.setState({ count: payload.count })),
    mh.on("fightsList", (payload) => {
      applyFightList(payload.fights);
      const { open, selectedId } = mapFightsStore.getSnapshot();
      if (open && selectedId !== null) connection.send(encodeClient("fightGetDetails", create(FightGetDetailsRequestSchema, { fightId: selectedId })));
    }),
    mh.on("fightsDetails", (details) => {
      if (details.fightId === mapFightsStore.getSnapshot().selectedId) mapFightsStore.setState({ details });
    }),
  ];
}
