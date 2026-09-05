import { randomUUID } from "node:crypto";

import type { TransactionalAdapterKysely } from "@nestjs-cls/transactional-adapter-kysely";
import type { DB, ItemRow } from "@shared/db/schema";
import { create } from "@bufbuild/protobuf";
import {
  type AdminCommandRequest,
  type AdminCommandResponse,
  AdminCommandResponseSchema,
  AdminCommandSource,
  AdminCommandStatus,
  AdminItemRoll,
  type AdminPlayerSearchRequest,
  type AdminPlayerSearchResponse,
  AdminPlayerSearchResponseSchema,
  type AdminPlayerSummary,
  AdminPlayerSummarySchema,
  AdminResourceKind,
  AdminResourceMode,
  AdminRestoreKind,
  AdminTeleportMode,
} from "@dofus/proto/admin_pb";
import { DofusMessageSchema } from "@dofus/proto/server_messages_pb";
import { SpellListSchema } from "@dofus/proto/spells_pb";
import { InventoryFramesService } from "@modules/inventory/inventory.frames.service";
import { InventoryRepository } from "@modules/inventory/inventory.repository";
import {
  perfectItemEffects,
  rollItemEffects,
} from "@modules/inventory/item-effects";
import { ItemTemplateCacheService } from "@modules/inventory/item-template.cache";
import { MapCacheService } from "@modules/maps/maps.cache.service";
import { MapTransitionService } from "@modules/maps/maps.transition.service";
import { PlayerPresenceService } from "@modules/player-presence/player-presence.service";
import { expectedCapital } from "@modules/players/players.capital";
import {
  MAX_LEVEL,
  xpForLevel,
} from "@modules/players/players.progression.constants";
import { levelForExperience } from "@modules/players/players.progression.service";
import { SpellsService } from "@modules/spells/spells.service";
import { ENERGY_MAX, maxLifePoints } from "@modules/stats/stats.constants";
import { StatsService } from "@modules/stats/stats.service";
import { Injectable } from "@nestjs/common";
import { TransactionHost } from "@nestjs-cls/transactional";
import { GatewayFrameService } from "@shared/gateway-adapter/gateway-frame.service";
import { SessionRegistry } from "@shared/gateway-adapter/session-registry";

import {
  type AdminPlayerRow,
  AdminRepository,
  type AuditWrite,
} from "./admin.repository";

const MAX_BIGINT = 9_223_372_036_854_775_807n;
const MAX_ITEM_QUANTITY = 1_000_000;
const MAX_POINTS = 2_147_483_647n;

class AdminCommandError extends Error {}

interface ExecutionRefresh {
  playerId: string;
  inventoryItem?: ItemRow;
  stats?: boolean;
  spells?: boolean;
  teleport?: { mapId: number; cellId: number; direction: number };
}

@Injectable()
export class AdminService {
  constructor(
    private readonly repo: AdminRepository,
    private readonly sessions: SessionRegistry,
    private readonly presence: PlayerPresenceService,
    private readonly inventory: InventoryRepository,
    private readonly itemTemplates: ItemTemplateCacheService,
    private readonly inventoryFrames: InventoryFramesService,
    private readonly maps: MapCacheService,
    private readonly transitions: MapTransitionService,
    private readonly stats: StatsService,
    private readonly spells: SpellsService,
    private readonly frames: GatewayFrameService,
    private readonly txHost: TransactionHost<TransactionalAdapterKysely<DB>>
  ) {}

  async capabilities(sessionId: string): Promise<{
    enabled: boolean;
    selfPlayerId: string;
  }> {
    const session = this.sessions.get(sessionId);
    if (!session?.accountId || !session.characterId) {
      return { enabled: false, selfPlayerId: "" };
    }
    return {
      enabled: await this.repo.isAdmin(session.accountId),
      selfPlayerId: session.characterId,
    };
  }

  async searchPlayers(
    sessionId: string,
    request: AdminPlayerSearchRequest
  ): Promise<AdminPlayerSearchResponse> {
    const requestId = normalizeRequestId(request.requestId);
    const session = this.sessions.get(sessionId);
    const source = sourceName(request.source);
    const actorAccountId = session?.accountId ?? "0";
    const audit = (input: Partial<AuditWrite>) =>
      this.repo.writeAudit({
        requestId,
        actorAccountId,
        actorPlayerId: session?.characterId || null,
        targetPlayerId: null,
        source,
        command: "search_players",
        parameters: { query: request.query.trim(), limit: request.limit },
        beforeState: null,
        afterState: null,
        result: "error",
        error: null,
        ...input,
      });

    if (!session?.accountId || !session.characterId) {
      return create(AdminPlayerSearchResponseSchema, {
        requestId,
        status: AdminCommandStatus.FORBIDDEN,
        message: "Session de jeu non authentifiée.",
      });
    }
    if (!(await this.repo.isAdmin(session.accountId))) {
      await audit({ result: "forbidden", error: "accounts.is_admin=false" });
      return create(AdminPlayerSearchResponseSchema, {
        requestId,
        status: AdminCommandStatus.FORBIDDEN,
        message: "Accès administrateur refusé.",
      });
    }
    if (!isUuid(request.requestId) || !isKnownSource(request.source)) {
      await audit({ error: "invalid request metadata" });
      return create(AdminPlayerSearchResponseSchema, {
        requestId,
        status: AdminCommandStatus.ERROR,
        message: "Requête administrateur invalide.",
      });
    }

    const query = request.query.trim();
    if (query.length === 0 || query.length > 64) {
      await audit({ error: "invalid search query" });
      return create(AdminPlayerSearchResponseSchema, {
        requestId,
        status: AdminCommandStatus.ERROR,
        message: "Saisissez un nom ou un #ID valide.",
      });
    }

    const rows = await this.repo.searchPlayers(
      query,
      Math.max(1, Math.min(request.limit || 20, 20))
    );
    await audit({
      result: "success",
      afterState: { resultCount: rows.length },
    });
    return create(AdminPlayerSearchResponseSchema, {
      requestId,
      status: AdminCommandStatus.SUCCESS,
      message: `${rows.length} personnage(s) trouvé(s).`,
      players: rows.map((row) => this.toSummary(row, session.characterId)),
    });
  }

  async execute(
    sessionId: string,
    request: AdminCommandRequest
  ): Promise<AdminCommandResponse> {
    const requestId = normalizeRequestId(request.requestId);
    const session = this.sessions.get(sessionId);
    const source = sourceName(request.source);
    const command = commandName(request);

    if (!session?.accountId || !session.characterId) {
      return this.response(request, requestId, AdminCommandStatus.FORBIDDEN, {
        command,
        message: "Session de jeu non authentifiée.",
      });
    }

    const allowed = await this.repo.isAdmin(session.accountId);
    const previous = await this.repo.findAudit(requestId);
    if (!allowed) {
      if (!previous) {
        await this.repo.writeAudit({
          requestId,
          actorAccountId: session.accountId,
          actorPlayerId: session.characterId,
          targetPlayerId: null,
          source,
          command,
          parameters: sanitizedParameters(request),
          beforeState: null,
          afterState: null,
          result: "forbidden",
          error: "accounts.is_admin=false",
        });
      }
      return this.response(request, requestId, AdminCommandStatus.FORBIDDEN, {
        command,
        message: "Accès administrateur refusé.",
      });
    }

    if (!isUuid(request.requestId) || !isKnownSource(request.source)) {
      if (!previous) {
        await this.repo.writeAudit({
          requestId,
          actorAccountId: session.accountId,
          actorPlayerId: session.characterId,
          targetPlayerId: null,
          source,
          command,
          parameters: sanitizedParameters(request),
          beforeState: null,
          afterState: null,
          result: "error",
          error: "invalid request metadata",
        });
      }
      return this.response(request, requestId, AdminCommandStatus.ERROR, {
        command,
        message: "Requête administrateur invalide.",
      });
    }

    if (previous && previous.actorAccountId !== session.accountId) {
      return this.response(request, requestId, AdminCommandStatus.FORBIDDEN, {
        command,
        message: "Identifiant de requête déjà utilisé.",
      });
    }
    if (previous && previous.result !== "confirmation_required") {
      const target = previous.targetPlayerId
        ? await this.repo.findPlayerById(previous.targetPlayerId)
        : undefined;
      return this.response(
        request,
        requestId,
        statusFromAudit(previous.result),
        {
          command: previous.command,
          message: previous.error ?? "Résultat déjà appliqué.",
          before: stringifyState(previous.beforeState),
          after: stringifyState(previous.afterState),
          ...(target
            ? { target: this.toSummary(target, session.characterId) }
            : {}),
        }
      );
    }
    if (
      previous?.result === "confirmation_required" &&
      (!request.confirmed ||
        confirmationFingerprint(previous.parameters) !==
          confirmationFingerprint(sanitizedParameters(request)))
    ) {
      return this.response(request, requestId, AdminCommandStatus.FORBIDDEN, {
        command,
        message:
          "La commande confirmée ne correspond pas à la demande initiale.",
      });
    }

    let target: AdminPlayerRow;
    try {
      target = await this.resolveTarget(request, session.characterId);
      await this.validateCommand(request, target, session.characterId);
    } catch (error) {
      const message = errorMessage(error);
      await this.repo.writeAudit({
        requestId,
        actorAccountId: session.accountId,
        actorPlayerId: session.characterId,
        targetPlayerId: null,
        source,
        command,
        parameters: sanitizedParameters(request),
        beforeState: null,
        afterState: null,
        result: "error",
        error: message,
      });
      return this.response(request, requestId, AdminCommandStatus.ERROR, {
        command,
        message,
      });
    }

    if (
      source === "drawer" &&
      !request.confirmed &&
      requiresConfirmation(request, target, session.characterId)
    ) {
      const before = snapshot(target);
      await this.repo.writeAudit({
        requestId,
        actorAccountId: session.accountId,
        actorPlayerId: session.characterId,
        targetPlayerId: target.id,
        source,
        command,
        parameters: sanitizedParameters(request),
        beforeState: before,
        afterState: null,
        result: "confirmation_required",
        error: null,
      });
      return this.response(
        request,
        requestId,
        AdminCommandStatus.CONFIRMATION_REQUIRED,
        {
          command,
          message: confirmationMessage(request, target),
          before: stringifyState(before),
          target: this.toSummary(target, session.characterId),
        }
      );
    }

    const affectedPlayerId = affectedPlayerFor(
      request,
      target.id,
      session.characterId
    );
    const affectedBefore =
      affectedPlayerId === target.id
        ? target
        : await this.repo.findPlayerById(affectedPlayerId);
    if (!affectedBefore) {
      return this.response(request, requestId, AdminCommandStatus.ERROR, {
        command,
        message: "Le personnage affecté est introuvable.",
        target: this.toSummary(target, session.characterId),
      });
    }
    const before = snapshot(affectedBefore);
    let after: AdminPlayerRow;
    let afterState: Record<string, unknown>;
    let refresh: ExecutionRefresh | undefined;

    try {
      ({ after, afterState, refresh } = await this.txHost.withTransaction(
        async () => {
          const liveTarget = await this.repo.findPlayerById(target.id);
          if (!liveTarget) {
            throw new AdminCommandError("Le personnage cible n’existe plus.");
          }
          const execution = await this.applyCommand(
            request,
            liveTarget,
            session.characterId
          );
          const updated = await this.repo.findPlayerById(target.id);
          if (!updated) {
            throw new AdminCommandError("Impossible de relire la cible.");
          }
          const updatedAffected =
            affectedPlayerId === target.id
              ? updated
              : await this.repo.findPlayerById(affectedPlayerId);
          if (!updatedAffected) {
            throw new AdminCommandError(
              "Impossible de relire le personnage affecté."
            );
          }
          const updatedState = snapshot(updatedAffected);
          await this.repo.writeAudit({
            requestId,
            actorAccountId: session.accountId,
            actorPlayerId: session.characterId,
            targetPlayerId: target.id,
            source,
            command,
            parameters: sanitizedParameters(request),
            beforeState: before,
            afterState: updatedState,
            result: "success",
            error: null,
          });
          return {
            after: updated,
            afterState: updatedState,
            refresh: execution,
          };
        }
      ));
    } catch (error) {
      const message = errorMessage(error);
      await this.repo.writeAudit({
        requestId,
        actorAccountId: session.accountId,
        actorPlayerId: session.characterId,
        targetPlayerId: target.id,
        source,
        command,
        parameters: sanitizedParameters(request),
        beforeState: before,
        afterState: null,
        result: "error",
        error: message,
      });
      return this.response(request, requestId, AdminCommandStatus.ERROR, {
        command,
        message,
        before: stringifyState(before),
        target: this.toSummary(target, session.characterId),
      });
    }

    await this.refreshOnline(refresh);
    const message = successMessage(request, target);
    return this.response(request, requestId, AdminCommandStatus.SUCCESS, {
      command,
      message,
      before: stringifyState(before),
      after: stringifyState(afterState),
      target: this.toSummary(after, session.characterId),
    });
  }

  private async resolveTarget(
    request: AdminCommandRequest,
    selfPlayerId: string
  ): Promise<AdminPlayerRow> {
    const identifier = request.target?.identifier;
    if (!identifier?.case) {
      throw new AdminCommandError("Une cible explicite est obligatoire.");
    }
    if (identifier.case === "self") {
      const self = await this.repo.findPlayerById(selfPlayerId);
      if (!self) {
        throw new AdminCommandError("Votre personnage est introuvable.");
      }
      return self;
    }
    if (identifier.case === "playerId") {
      const target = await this.repo.findPlayerById(identifier.value);
      if (!target) {
        throw new AdminCommandError(
          `Personnage #${identifier.value} introuvable.`
        );
      }
      return target;
    }
    const rows = await this.repo.findPlayersByExactName(
      identifier.value.trim()
    );
    if (rows.length === 0) {
      throw new AdminCommandError(
        `Personnage « ${identifier.value} » introuvable.`
      );
    }
    if (rows.length > 1) {
      throw new AdminCommandError(
        "Nom ambigu : utilisez le #ID du personnage."
      );
    }
    return rows[0] as AdminPlayerRow;
  }

  private async validateCommand(
    request: AdminCommandRequest,
    target: AdminPlayerRow,
    selfPlayerId: string
  ): Promise<void> {
    const command = request.command;
    if (!command.case) {
      throw new AdminCommandError("Commande administrateur manquante.");
    }
    if (command.case === "grantItem") {
      if (
        !Number.isInteger(command.value.itemId) ||
        command.value.itemId <= 0
      ) {
        throw new AdminCommandError("ID d’objet invalide.");
      }
      if (
        !Number.isInteger(command.value.quantity) ||
        command.value.quantity < 1 ||
        command.value.quantity > MAX_ITEM_QUANTITY
      ) {
        throw new AdminCommandError(
          `La quantité doit être comprise entre 1 et ${MAX_ITEM_QUANTITY}.`
        );
      }
      if (
        ![
          AdminItemRoll.NORMAL,
          AdminItemRoll.PERFECT,
          AdminItemRoll.EMPTY,
        ].includes(command.value.roll)
      ) {
        throw new AdminCommandError("Type de jet invalide.");
      }
      if (!(await this.itemTemplates.load(command.value.itemId))) {
        throw new AdminCommandError(
          `Objet #${command.value.itemId} introuvable.`
        );
      }
      return;
    }
    if (command.case === "changeResource") {
      parseAmount(
        command.value.amount,
        command.value.mode === AdminResourceMode.SET
      );
      if (
        ![
          AdminResourceKind.KAMAS,
          AdminResourceKind.XP,
          AdminResourceKind.STAT_POINTS,
          AdminResourceKind.SPELL_POINTS,
        ].includes(command.value.resource)
      ) {
        throw new AdminCommandError("Ressource invalide.");
      }
      if (
        ![
          AdminResourceMode.ADD,
          AdminResourceMode.REMOVE,
          AdminResourceMode.SET,
        ].includes(command.value.mode)
      ) {
        throw new AdminCommandError("Mode de modification invalide.");
      }
      return;
    }
    if (command.case === "setLevel") {
      if (
        !Number.isInteger(command.value.level) ||
        command.value.level < 1 ||
        command.value.level > MAX_LEVEL
      ) {
        throw new AdminCommandError(
          `Le niveau doit être compris entre 1 et ${MAX_LEVEL}.`
        );
      }
      return;
    }
    if (command.case === "restore") {
      if (
        ![
          AdminRestoreKind.LIFE,
          AdminRestoreKind.ENERGY,
          AdminRestoreKind.ALL,
        ].includes(command.value.kind)
      ) {
        throw new AdminCommandError("Type de restauration invalide.");
      }
      return;
    }

    if (command.case !== "teleport") {
      throw new AdminCommandError("Commande administrateur invalide.");
    }
    const teleport = command.value;
    if (
      ![
        AdminTeleportMode.SELF_TO_TARGET,
        AdminTeleportMode.TARGET_TO_SELF,
        AdminTeleportMode.TARGET_TO_MAP,
      ].includes(teleport.mode)
    ) {
      throw new AdminCommandError("Mode de téléportation invalide.");
    }
    if (
      teleport.mode === AdminTeleportMode.SELF_TO_TARGET &&
      target.id === selfPlayerId
    ) {
      throw new AdminCommandError("Vous êtes déjà la cible.");
    }
    if (teleport.mode === AdminTeleportMode.TARGET_TO_MAP) {
      await this.validatedCell(teleport.mapId, teleport.cellId);
    }
  }

  private async applyCommand(
    request: AdminCommandRequest,
    target: AdminPlayerRow,
    selfPlayerId: string
  ): Promise<ExecutionRefresh> {
    const command = request.command;
    if (command.case === "grantItem") {
      const template = await this.itemTemplates.load(command.value.itemId);
      if (!template) {
        throw new AdminCommandError("L’objet n’existe plus.");
      }
      const effects =
        command.value.roll === AdminItemRoll.EMPTY
          ? [{ id: 0, param1: 0, param2: 0, param3: "admin-empty" }]
          : command.value.roll === AdminItemRoll.PERFECT
            ? perfectItemEffects(template.effects)
            : rollItemEffects(template.effects);
      const item = await this.inventory.insertItem({
        playerId: target.id,
        templateId: command.value.itemId,
        quantity: command.value.quantity,
        effects,
      });
      return { playerId: target.id, inventoryItem: item, stats: true };
    }
    if (command.case === "changeResource") {
      return this.changeResource(
        target,
        command.value.resource,
        command.value.mode,
        command.value.amount
      );
    }
    if (command.case === "setLevel") {
      await this.reconcileLevel(
        target,
        command.value.level,
        BigInt(xpForLevel(command.value.level))
      );
      return { playerId: target.id, stats: true, spells: true };
    }
    if (command.case === "restore") {
      const base = await this.repo.playerStats(target.id);
      const equipment = await this.stats.computeEquipmentStats(target.id);
      const values: { life?: number; energy?: number; lifeUpdatedAt?: Date } =
        {};
      if (command.value.kind !== AdminRestoreKind.ENERGY) {
        values.life = maxLifePoints(
          target.level,
          (base?.vitality ?? 0) + equipment.vitality
        );
        values.lifeUpdatedAt = new Date();
      }
      if (command.value.kind !== AdminRestoreKind.LIFE) {
        values.energy = ENERGY_MAX;
      }
      await this.repo.setPlayerValues(target.id, values);
      return { playerId: target.id, stats: true };
    }

    if (command.case !== "teleport") {
      throw new AdminCommandError("Commande administrateur invalide.");
    }
    const teleport = command.value;
    let moving = target;
    let mapId = teleport.mapId;
    let cellId = teleport.cellId;
    if (teleport.mode === AdminTeleportMode.SELF_TO_TARGET) {
      const self = await this.repo.findPlayerById(selfPlayerId);
      if (!self) {
        throw new AdminCommandError("Votre personnage est introuvable.");
      }
      moving = self;
      mapId = target.mapId;
      cellId = target.cellId;
      await this.validatedCell(mapId, cellId);
    } else if (teleport.mode === AdminTeleportMode.TARGET_TO_SELF) {
      const self = await this.repo.findPlayerById(selfPlayerId);
      if (!self) {
        throw new AdminCommandError("Votre personnage est introuvable.");
      }
      mapId = self.mapId;
      cellId = self.cellId;
      await this.validatedCell(mapId, cellId);
    }
    await this.repo.setPlayerValues(moving.id, {
      mapId,
      cellId,
      direction: moving.direction,
    });
    return {
      playerId: moving.id,
      teleport: { mapId, cellId, direction: moving.direction },
    };
  }

  private async changeResource(
    target: AdminPlayerRow,
    resource: AdminResourceKind,
    mode: AdminResourceMode,
    rawAmount: string
  ): Promise<ExecutionRefresh> {
    const amount = parseAmount(rawAmount, mode === AdminResourceMode.SET);
    const current =
      resource === AdminResourceKind.KAMAS
        ? BigInt(target.kamas)
        : resource === AdminResourceKind.XP
          ? BigInt(target.experience)
          : resource === AdminResourceKind.STAT_POINTS
            ? BigInt(target.statsPoints)
            : BigInt(target.spellPoints);
    const next =
      mode === AdminResourceMode.SET
        ? amount
        : mode === AdminResourceMode.ADD
          ? current + amount
          : current - amount;
    const maximum =
      resource === AdminResourceKind.KAMAS || resource === AdminResourceKind.XP
        ? MAX_BIGINT
        : MAX_POINTS;
    if (next < 0n) {
      throw new AdminCommandError("Le retrait rendrait la valeur négative.");
    }
    if (next > maximum) {
      throw new AdminCommandError("La valeur dépasse la capacité de stockage.");
    }

    if (resource === AdminResourceKind.XP) {
      const level = levelForExperience(
        1,
        next > BigInt(Number.MAX_SAFE_INTEGER)
          ? Number.MAX_SAFE_INTEGER
          : Number(next)
      );
      await this.reconcileLevel(target, level, next);
      return { playerId: target.id, stats: true, spells: true };
    }
    if (resource === AdminResourceKind.KAMAS) {
      await this.repo.setPlayerValues(target.id, { kamas: String(next) });
    } else if (resource === AdminResourceKind.STAT_POINTS) {
      await this.repo.setPlayerValues(target.id, { statsPoints: Number(next) });
    } else {
      await this.repo.setPlayerValues(target.id, { spellPoints: Number(next) });
    }
    return { playerId: target.id, stats: true };
  }

  private async reconcileLevel(
    target: AdminPlayerRow,
    level: number,
    experience: bigint
  ): Promise<void> {
    const base = await this.repo.playerStats(target.id);
    if (!base) {
      throw new AdminCommandError("Caractéristiques de la cible introuvables.");
    }
    const above = await this.repo.classSpellsAboveLevel(
      target.id,
      target.class,
      level
    );
    if (above.some((spell) => spell.level > 1)) {
      throw new AdminCommandError(
        "Rétrogradation refusée : un sort qui serait retiré a été amélioré."
      );
    }
    const removed = new Set(above.map((spell) => spell.spellId));
    const spellRows = await this.repo.playerSpells(target.id);
    const capital = expectedCapital({
      classId: target.class,
      level,
      stats: {
        strength: base.strength,
        vitality: base.vitality,
        wisdom: base.wisdom,
        chance: base.chance,
        agility: base.agility,
        intelligence: base.intelligence,
      },
      spellLevels: spellRows
        .filter((spell) => !removed.has(spell.spellId))
        .map((spell) => spell.level),
    });
    if (capital.statsPoints < 0 || capital.spellPoints < 0) {
      throw new AdminCommandError(
        "Rétrogradation refusée : les points dépensés dépassent le capital du nouveau niveau."
      );
    }
    await this.repo.deleteClassSpellsAboveLevel(target.id, target.class, level);
    await this.repo.setPlayerValues(target.id, {
      level,
      experience: String(experience),
      statsPoints: capital.statsPoints,
      spellPoints: capital.spellPoints,
    });
    await this.spells.learnClassSpells(target.id, target.class, level);
  }

  private async validatedCell(mapId: number, cellId: number): Promise<void> {
    if (!Number.isInteger(mapId) || !Number.isInteger(cellId) || cellId < 0) {
      throw new AdminCommandError("Carte ou cellule invalide.");
    }
    const map = await this.maps.load(mapId);
    if (!map) {
      throw new AdminCommandError(`Carte #${mapId} introuvable.`);
    }
    const cell = map.cells[cellId];
    if (!cell || !cell.active || !cell.walkable) {
      throw new AdminCommandError(
        `La cellule ${cellId} de la carte ${mapId} n’est pas marchable.`
      );
    }
  }

  private async refreshOnline(refresh?: ExecutionRefresh): Promise<void> {
    if (!refresh) {
      return;
    }
    const online = this.presence.getByCharacter(refresh.playerId);
    if (!online) {
      return;
    }
    if (refresh.teleport) {
      await this.transitions.teleport(
        online.sessionId,
        refresh.playerId,
        refresh.teleport.mapId,
        refresh.teleport.cellId,
        refresh.teleport.direction
      );
      return;
    }
    if (refresh.inventoryItem) {
      await this.inventoryFrames.sendTemplateFor(
        online.sessionId,
        refresh.inventoryItem.templateId
      );
      this.inventoryFrames.sendItemAdd(online.sessionId, refresh.inventoryItem);
    }
    if (refresh.stats) {
      await this.stats.sendStats(online.sessionId, refresh.playerId);
    }
    if (refresh.spells) {
      const entries = await this.spells.buildSpellList(refresh.playerId);
      this.frames.broadcast(
        [online.sessionId],
        create(DofusMessageSchema, {
          payload: {
            case: "spellList",
            value: create(SpellListSchema, { spells: entries }),
          },
        })
      );
    }
  }

  private toSummary(row: AdminPlayerRow, selfId: string): AdminPlayerSummary {
    const online = this.presence.getByCharacter(row.id);
    return create(AdminPlayerSummarySchema, {
      playerId: row.id,
      playerName: row.name,
      accountId: row.accountId,
      accountPseudo: row.accountPseudo,
      online: online !== undefined,
      level: row.level,
      experience: row.experience,
      kamas: row.kamas,
      life: row.life,
      energy: row.energy,
      statPoints: row.statsPoints,
      spellPoints: row.spellPoints,
      mapId: online?.mapId ?? row.mapId,
      cellId: online?.cellId ?? row.cellId,
      self: row.id === selfId,
    });
  }

  private response(
    request: AdminCommandRequest,
    requestId: string,
    status: AdminCommandStatus,
    values: {
      command?: string;
      message?: string;
      before?: string;
      after?: string;
      target?: AdminPlayerSummary;
    }
  ): AdminCommandResponse {
    return create(AdminCommandResponseSchema, {
      requestId,
      source: request.source,
      status,
      command: values.command ?? "",
      message: values.message ?? "",
      before: values.before ?? "",
      after: values.after ?? "",
      ...(values.target ? { target: values.target } : {}),
    });
  }
}

function normalizeRequestId(value: string): string {
  const id = value.trim();
  return id.length > 0 && id.length <= 128 ? id : randomUUID();
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

function isKnownSource(source: AdminCommandSource): boolean {
  return (
    source === AdminCommandSource.DRAWER || source === AdminCommandSource.CHAT
  );
}

function sourceName(source: AdminCommandSource): "drawer" | "chat" {
  return source === AdminCommandSource.CHAT ? "chat" : "drawer";
}

function statusFromAudit(result: AuditWrite["result"]): AdminCommandStatus {
  return {
    confirmation_required: AdminCommandStatus.CONFIRMATION_REQUIRED,
    success: AdminCommandStatus.SUCCESS,
    error: AdminCommandStatus.ERROR,
    forbidden: AdminCommandStatus.FORBIDDEN,
  }[result];
}

function commandName(request: AdminCommandRequest): string {
  const command = request.command;
  if (command.case === "teleport") {
    const names: Partial<Record<AdminTeleportMode, string>> = {
      [AdminTeleportMode.SELF_TO_TARGET]: "teleport_self_to_target",
      [AdminTeleportMode.TARGET_TO_SELF]: "teleport_target_to_self",
      [AdminTeleportMode.TARGET_TO_MAP]: "teleport_target_to_map",
    };
    return names[command.value.mode] ?? "teleport";
  }
  return command.case ?? "unknown";
}

function sanitizedParameters(request: AdminCommandRequest): unknown {
  return {
    target: request.target?.identifier,
    command: request.command,
    confirmed: request.confirmed,
  };
}

function confirmationFingerprint(value: unknown): string {
  const parameters = value as {
    target?: unknown;
    command?: unknown;
  };
  return JSON.stringify({
    target: parameters?.target,
    command: parameters?.command,
  });
}

function snapshot(player: AdminPlayerRow): Record<string, unknown> {
  return {
    playerId: player.id,
    level: player.level,
    experience: player.experience,
    kamas: player.kamas,
    life: player.life,
    energy: player.energy,
    statsPoints: player.statsPoints,
    spellPoints: player.spellPoints,
    mapId: player.mapId,
    cellId: player.cellId,
  };
}

function affectedPlayerFor(
  request: AdminCommandRequest,
  targetPlayerId: string,
  actorPlayerId: string
): string {
  return request.command.case === "teleport" &&
    request.command.value.mode === AdminTeleportMode.SELF_TO_TARGET
    ? actorPlayerId
    : targetPlayerId;
}

function stringifyState(value: unknown): string {
  return value === null || value === undefined ? "" : JSON.stringify(value);
}

function parseAmount(raw: string, allowZero: boolean): bigint {
  if (!/^\d+$/.test(raw.trim())) {
    throw new AdminCommandError("Le montant doit être un entier positif.");
  }
  const amount = BigInt(raw.trim());
  if ((!allowZero && amount === 0n) || amount > MAX_BIGINT) {
    throw new AdminCommandError("Montant hors limites.");
  }
  return amount;
}

function requiresConfirmation(
  request: AdminCommandRequest,
  target: AdminPlayerRow,
  actorPlayerId: string
): boolean {
  const command = request.command;
  if (command.case === "teleport") {
    return (
      command.value.mode !== AdminTeleportMode.SELF_TO_TARGET &&
      target.id !== actorPlayerId
    );
  }
  if (command.case === "changeResource") {
    return command.value.mode !== AdminResourceMode.ADD;
  }
  return command.case === "setLevel" && command.value.level < target.level;
}

function confirmationMessage(
  request: AdminCommandRequest,
  target: AdminPlayerRow
): string {
  return `Confirmer ${commandName(request)} sur ${target.name} (#${target.id}) ?`;
}

function successMessage(
  request: AdminCommandRequest,
  target: AdminPlayerRow
): string {
  return `${commandName(request)} appliquée à ${target.name} (#${target.id}).`;
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "Erreur administrateur inconnue.";
}
