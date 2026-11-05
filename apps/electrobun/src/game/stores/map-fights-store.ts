import type { GameChallenge, GameTeam, FightMapTeam, TeamMember } from "@dofus/proto/game_pb";
import type { FightListEntry, FightsDetails } from "@dofus/proto/misc_pb";
import { ExternalStore } from "./game-store";

export interface MapFightTeam { info: FightMapTeam; members: TeamMember[] }
export interface MapFight { id: number; type: number; teams: MapFightTeam[] }
export interface MapFightsState {
  markers: Map<number, MapFight>;
  fights: FightListEntry[];
  count: number;
  open: boolean;
  selectedId: number | null;
  details: FightsDetails | null;
}
const initial = (): MapFightsState => ({ markers: new Map(), fights: [], count: 0, open: false, selectedId: null, details: null });
export const mapFightsStore = new ExternalStore<MapFightsState>(initial());
export function resetMapFights(): void { mapFightsStore.replaceState(initial()); }
export function closeFightBrowser(): void { mapFightsStore.setState({ open: false }); }
export function applyMapFight(payload: GameChallenge): void {
  if (!payload.fightId) return;
  const markers = new Map(mapFightsStore.getSnapshot().markers);
  if (payload.operation === 2) markers.delete(payload.fightId);
  else markers.set(payload.fightId, { id: payload.fightId, type: payload.fightType, teams: payload.teams.map((info) => ({ info, members: [] })) });
  mapFightsStore.setState({ markers });
}
export function applyMapTeam(payload: GameTeam): void {
  const state = mapFightsStore.getSnapshot();
  const fight = state.markers.get(payload.fightId);
  if (!fight) return;
  const markers = new Map(state.markers);
  const teams = fight.teams.map((team) => {
    if (team.info.teamId !== payload.teamId) return team;
    const members = new Map(team.members.map((member) => [member.spriteId, member]));
    for (const member of payload.members) {
      if (member.operation === 2) members.delete(member.spriteId);
      else members.set(member.spriteId, member);
    }
    return { ...team, members: [...members.values()] };
  });
  markers.set(fight.id, { ...fight, teams });
  mapFightsStore.setState({ markers });
}
export function applyFightList(fights: FightListEntry[]): void {
  const state = mapFightsStore.getSnapshot();
  const selectedId = fights.some((fight) => fight.fightId === state.selectedId) ? state.selectedId : null;
  mapFightsStore.setState({ fights, count: fights.length, selectedId, details: selectedId === null ? null : state.details });
}
export function teamJoinLabel(team: MapFightTeam): string {
  if (team.info.isMonster) return "Vous ne pouvez pas rejoindre les monstres";
  if (team.info.locked) return "Équipe verrouillée";
  if (team.members.length >= team.info.capacity) return "Équipe complète";
  return "Rejoindre";
}
export function canJoinMapTeam(team: MapFightTeam): boolean { return teamJoinLabel(team) === "Rejoindre"; }
export const fightMarkerColor = (fightId: number): number => Math.floor((Math.cos(fightId) + 1) * 8388607);
