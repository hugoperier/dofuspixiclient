import {
  requestAdminTarget,
  toggleAdminDrawer,
} from "@/game/stores/admin-store";

export function toggleAdmin(): void {
  toggleAdminDrawer();
}

export function targetPlayerInAdmin(playerId: number): void {
  requestAdminTarget(String(playerId));
  window.dispatchEvent(
    new CustomEvent("dofus:admin-target-requested", {
      detail: { playerId: String(playerId) },
    })
  );
}
