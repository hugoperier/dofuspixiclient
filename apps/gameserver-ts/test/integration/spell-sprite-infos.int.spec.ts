import { beforeAll, describe, expect, test } from "bun:test";

import type { DB } from "@core/shared/db/schema.ts";
import type { Kysely } from "kysely";
import { LangsService } from "@core/modules/langs/langs.service.ts";
import { SpellsRepository } from "@core/modules/spells/spells.repository.ts";
import { SpellsService } from "@core/modules/spells/spells.service.ts";
import { Test } from "@nestjs/testing";

import { createTestDatabaseModule, setupTestDatabase } from "./harness.ts";

/**
 * Migration 0068 → `SpellsService.spellLevel`: the `sorts.spriteInfos`
 * values 1.29 sent in `GA;300` reach every rank of the spell. The oracle
 * is the dump itself (`assets/sources/starloco/sorts.sql`):
 *
 *   95  Horloge          512  '51,1,1'
 *   91  Frappe de Xélor  513  '51,0,1'
 *   82  Contre           504  '10,1,1'
 *
 * See QA-181.
 */
describe("spriteInfos on spell levels (integration)", () => {
  let service: SpellsService;

  beforeAll(async () => {
    const harness = await setupTestDatabase();
    const db: Kysely<DB> = harness.db;

    const moduleRef = await Test.createTestingModule({
      imports: [createTestDatabaseModule(db)],
      providers: [
        SpellsService,
        SpellsRepository,
        { provide: LangsService, useValue: { getSpellSync: () => undefined } },
      ],
    }).compile();

    service = moduleRef.get(SpellsService);
  });

  test("Horloge anchors at the world origin, cast pose anim1", async () => {
    expect(await service.spellLevel(95, 6)).toMatchObject({
      visualGfxId: 512,
      displayType: 51,
      castAnimation: 1,
      spriteInFront: true,
    });
  });

  test("Frappe de Xélor plays the contact pose anim0", async () => {
    expect(await service.spellLevel(91, 1)).toMatchObject({
      visualGfxId: 513,
      displayType: 51,
      castAnimation: 0,
    });
  });

  test("Contre anchors on the caster, not the target", async () => {
    expect((await service.spellLevel(82, 3))?.displayType).toBe(10);
  });
});
