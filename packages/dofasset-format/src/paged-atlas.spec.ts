import { expect, test } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { readAnimations } from "./binary-reader";
import { compileSprite } from "./sprite-compile";

test("paginated atlases compile both pages, including identical rectangles and definition IDs", () => {
  const dir = mkdtempSync(join(tmpdir(), "dofus-atlas-"));
  try {
    writeFileSync(
      join(dir, "manifest.json"),
      JSON.stringify({ animations: { anim1: {} } })
    );
    writeFileSync(
      join(dir, "atlas.json"),
      JSON.stringify({
        version: 1,
        animation: "anim1",
        width: 10,
        height: 10,
        offsetX: 0,
        offsetY: 0,
        fps: 60,
        frames: [0, 1].map((page) => ({
          id: `frame_${page}`,
          x: 0,
          y: 0,
          width: 10,
          height: 10,
          offsetX: 0,
          offsetY: 0,
          page,
        })),
        frameOrder: ["frame_0", "frame_1"],
        duplicates: {},
        pages: [{ file: "atlas_0.svg" }, { file: "atlas_1.svg" }],
      })
    );
    for (const [page, color] of ["#ff0000", "#0000ff"].entries()) {
      writeFileSync(
        join(dir, `atlas_${page}.svg`),
        `<svg width="10" height="10" xmlns="http://www.w3.org/2000/svg"><defs><clipPath id="clip"><rect x="0" y="0" width="10" height="10"/></clipPath><g id="shape"><path d="M0 0L10 0L10 10Z" fill="${color}"/></g></defs><g clip-path="url(#clip)"><g transform="translate(0,0)"><use href="#shape"/></g></g></svg>`
      );
    }
    const compiled = compileSprite(dir, { assetId: 1100 });
    const [animation] = readAnimations(compiled.bytes);
    expect(compiled.animations).toBe(1);
    expect(compiled.stats.frames).toBe(2);
    expect(animation?.frameIds).toHaveLength(2);
    expect(animation?.frameIds[0]).not.toBe(animation?.frameIds[1]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
