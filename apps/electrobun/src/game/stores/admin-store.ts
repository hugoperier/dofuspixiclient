import type {
  AdminCommandRequest,
  AdminCommandResponse,
  AdminPlayerSummary,
} from "@dofus/proto/admin_pb";

import { ExternalStore } from "./game-store";

export interface AdminActivityEntry {
  id: string;
  at: Date;
  response: AdminCommandResponse;
}

export interface PendingAdminConfirmation {
  request: AdminCommandRequest;
  message: string;
}

export interface AdminState {
  enabled: boolean;
  selfPlayerId: string;
  isOpen: boolean;
  searching: boolean;
  searchResults: AdminPlayerSummary[];
  selectedTarget: AdminPlayerSummary | null;
  requestedTargetId: string | null;
  activity: AdminActivityEntry[];
  pending: PendingAdminConfirmation | null;
}

const initialState: AdminState = {
  enabled: false,
  selfPlayerId: "",
  isOpen: false,
  searching: false,
  searchResults: [],
  selectedTarget: null,
  requestedTargetId: null,
  activity: [],
  pending: null,
};

export const adminStore = new ExternalStore<AdminState>(initialState);

export function setAdminCapabilities(
  enabled: boolean,
  selfPlayerId: string
): void {
  adminStore.setState({
    enabled,
    selfPlayerId,
    ...(!enabled ? { isOpen: false, selectedTarget: null, pending: null } : {}),
  });
}

export function openAdminDrawer(): void {
  if (adminStore.getSnapshot().enabled) {
    adminStore.setState({ isOpen: true });
  }
}

export function closeAdminDrawer(): void {
  adminStore.setState({ isOpen: false, pending: null });
}

export function toggleAdminDrawer(): void {
  const state = adminStore.getSnapshot();
  if (state.enabled) {
    adminStore.setState({ isOpen: !state.isOpen, pending: null });
  }
}

export function requestAdminTarget(playerId: string): void {
  if (!adminStore.getSnapshot().enabled) {
    return;
  }
  adminStore.setState({
    isOpen: true,
    requestedTargetId: playerId,
    searching: true,
  });
}

export function setAdminSearching(searching: boolean): void {
  adminStore.setState({ searching });
}

export function setAdminSearchResults(results: AdminPlayerSummary[]): void {
  const state = adminStore.getSnapshot();
  const requested = state.requestedTargetId
    ? results.find((player) => player.playerId === state.requestedTargetId)
    : undefined;
  adminStore.setState({
    searching: false,
    searchResults: results,
    ...(requested
      ? { selectedTarget: requested, requestedTargetId: null }
      : {}),
  });
}

export function selectAdminTarget(target: AdminPlayerSummary | null): void {
  adminStore.setState({ selectedTarget: target, requestedTargetId: null });
}

export function addAdminActivity(response: AdminCommandResponse): void {
  const state = adminStore.getSnapshot();
  const selectedTarget =
    response.target &&
    state.selectedTarget?.playerId === response.target.playerId
      ? response.target
      : state.selectedTarget;
  adminStore.setState({
    activity: [
      { id: `${response.requestId}-${Date.now()}`, at: new Date(), response },
      ...state.activity,
    ].slice(0, 50),
    selectedTarget,
  });
}

export function setAdminPending(
  pending: PendingAdminConfirmation | null
): void {
  adminStore.setState({ pending });
}
