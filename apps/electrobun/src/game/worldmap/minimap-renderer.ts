import type { Application, Texture } from "pixi.js";
import { Assets, Container, Graphics, Sprite } from "pixi.js";

import type {
  HintManifest,
  HintsLayering,
  WorldMapManifest,
} from "@/game/types/worldmap";
import { getMapLangCoords } from "@/game/lang/maps-lang";
import { drawPositionMarker } from "@/game/worldmap/position-marker";
import { getSubareaIndex } from "@/game/worldmap/subarea-index";
import {
  filterHintsByArea,
  loadWorldMapData,
  mapCoordToPixel,
  pixelToMapCoord,
  selectVisibleTiles,
} from "@/game/worldmap/world-map-data";

interface MinimapRendererConfig {
  app: Application;
  parentContainer?: Container;
  centerOnMapId?: number;
  centerOnCoordinates?: { x: number; y: number };
}

export class MinimapRenderer {
  private worldContainer: Container;
  private mapContainer: Container;
  private hintsContainer: Container;
  private positionMarker: Graphics;

  private manifest: WorldMapManifest | null = null;
  private hintManifest: HintManifest | null = null;
  private hintsLayering: HintsLayering | null = null;

  private currentSuperarea = 0;

  private app: Application;
  private uniformGraphics: Graphics;
  private overviewSprite: Sprite | null = null;
  private tileSprites = new Map<string, Sprite>();
  private centerPixel: { x: number; y: number } | null = null;
  private hintSprites: Sprite[] = [];

  private centerMapId?: number;
  private initialCenterCoordinates?: { x: number; y: number };
  private animationFrame: number | null = null;

  constructor(config: MinimapRendererConfig) {
    this.centerMapId = config.centerOnMapId;
    this.initialCenterCoordinates = config.centerOnCoordinates;

    this.app = config.app;
    this.worldContainer = new Container();
    this.mapContainer = new Container();
    this.hintsContainer = new Container();
    this.positionMarker = new Graphics();
    this.uniformGraphics = new Graphics();

    this.mapContainer.addChild(this.uniformGraphics);
    this.worldContainer.addChild(this.mapContainer);
    this.worldContainer.addChild(this.positionMarker);
    this.worldContainer.addChild(this.hintsContainer);

    const parent = config.parentContainer ?? config.app.stage;
    parent.addChild(this.worldContainer);
  }

  async loadWorldMap(superarea: number = 0): Promise<void> {
    this.currentSuperarea = superarea;

    const data = await loadWorldMapData(superarea);
    this.manifest = data.manifest;
    this.hintManifest = data.hintManifest;
    this.hintsLayering = data.hintsLayering;

    await this.renderMap();
    await this.renderHints();

    if (this.centerMapId) {
      this.centerOnMap(this.centerMapId);
    } else if (this.initialCenterCoordinates) {
      this.centerOnCoordinates(
        this.initialCenterCoordinates.x,
        this.initialCenterCoordinates.y
      );
    }
  }

  private async renderMap(): Promise<void> {
    if (!this.manifest) {
      return;
    }

    for (const sprite of this.tileSprites.values()) {
      sprite.destroy({ texture: false });
    }

    this.tileSprites.clear();
    this.uniformGraphics.clear();

    if (this.overviewSprite) {
      this.overviewSprite.destroy({ texture: false });
      this.overviewSprite = null;
    }

    const manifest = this.manifest;
    const size = manifest.tile_size;

    // Les tuiles unies deviennent des aplats : la minimap montait elle aussi
    // les 1024 tuiles d'Amakna, sur sa propre Application Pixi, pour n'en
    // afficher que quelques-unes dans un cercle de 119 px.
    for (const [hex, cells] of Object.entries(manifest.uniform_tiles ?? {})) {
      for (const [x, y] of cells) {
        this.uniformGraphics.rect(x * size, y * size, size, size);
      }

      this.uniformGraphics.fill({ color: Number.parseInt(hex, 16) });
    }

    if (manifest.overview) {
      try {
        const url = `/assets/maps/world/${manifest.worldmap}/${manifest.overview}`;
        const texture = (await Assets.load(url)) as Texture | undefined;

        if (texture) {
          const plane = manifest.grid_size * manifest.tile_size;
          const sprite = new Sprite(texture);

          sprite.width = plane;
          sprite.height = plane;
          this.mapContainer.addChildAt(sprite, 0);
          this.overviewSprite = sprite;
        }
      } catch {
        // L'aperçu manque : les tuiles de détail suffisent.
      }
    }

    this.refreshVisibleTiles();
  }

  /**
   * Rayon visible autour du centre, en pixels du plan de tuiles. La minimap
   * tient dans un cercle de bannière, donc deux ou trois tuiles suffisent.
   */
  private visibleRadius(): number {
    const scale = this.worldContainer.parent?.scale.x ?? 1;
    const side = Math.max(this.app.screen.width, this.app.screen.height, 128);

    return side / Math.max(scale, 0.01) / 2;
  }

  private refreshVisibleTiles(): void {
    const manifest = this.manifest;
    const center = this.centerPixel;

    if (!manifest || !center) {
      return;
    }

    const radius = this.visibleRadius();
    const wanted = selectVisibleTiles(manifest, {
      left: center.x - radius,
      top: center.y - radius,
      right: center.x + radius,
      bottom: center.y + radius,
    });

    const wantedNames = new Set(wanted.map((t) => t.file));

    for (const [file, sprite] of this.tileSprites) {
      if (!wantedNames.has(file)) {
        sprite.destroy({ texture: false });
        this.tileSprites.delete(file);
      }
    }

    const missing = wanted.filter((t) => !this.tileSprites.has(t.file));

    if (missing.length === 0) {
      return;
    }

    const urls = missing.map(
      (t) => `/assets/maps/world/${manifest.worldmap}/${t.file}`
    );

    void Assets.load(urls)
      .then((textures: Record<string, Texture>) => {
        for (const tile of missing) {
          const url = `/assets/maps/world/${manifest.worldmap}/${tile.file}`;
          const texture = textures[url];

          if (!texture || this.tileSprites.has(tile.file)) {
            continue;
          }

          if (texture.source) {
            texture.source.autoGenerateMipmaps = true;
            texture.source.scaleMode = "linear";
            texture.source.updateMipmaps();
          }

          const sprite = new Sprite(texture);
          sprite.x = tile.x * manifest.tile_size;
          sprite.y = tile.y * manifest.tile_size;

          this.mapContainer.addChild(sprite);
          this.tileSprites.set(tile.file, sprite);
        }
      })
      .catch(() => {
        // Tuile manquante : l'aperçu tient lieu de fond.
      });
  }

  private async renderHints(): Promise<void> {
    if (!this.hintsLayering || !this.manifest || !this.hintManifest) {
      return;
    }

    this.hintsContainer.removeChildren();
    this.hintSprites = [];

    const { bounds } = this.manifest;
    const enabledCategories = new Set<number>([1, 2, 3, 4, 5, 6]);

    const filteredHints = filterHintsByArea(
      this.hintsLayering,
      enabledCategories,
      this.currentSuperarea
    );

    const hintUrls = new Set<string>();

    const hintsToRender: Array<{
      pixelX: number;
      pixelY: number;
      hintInfo: {
        file: string;
        width: number;
        height: number;
        offsetX: number;
        offsetY: number;
      };
      texturePath: string;
    }> = [];

    for (const { overlay, hint } of filteredHints) {
      const gfxID = hint.gfxID.toString();
      const hintInfo = this.hintManifest.graphics[gfxID];

      if (!hintInfo) {
        continue;
      }

      const [pixelX, pixelY] = mapCoordToPixel(
        overlay.x,
        overlay.y,
        bounds.xMin,
        bounds.yMin
      );

      const texturePath = `/assets/maps/hints/${hintInfo.file}`;

      hintsToRender.push({ pixelX, pixelY, hintInfo, texturePath });
      hintUrls.add(texturePath);
    }

    if (hintUrls.size === 0) {
      return;
    }

    const loadedTextures = await Assets.load([...hintUrls]);

    // Enable mipmaps on hint textures for smooth downscaling
    for (const texture of Object.values(loadedTextures)) {
      if (texture?.source) {
        texture.source.autoGenerateMipmaps = true;
        texture.source.updateMipmaps();
      }
    }

    const targetSize = 30;

    for (const hintData of hintsToRender) {
      const texture = loadedTextures[hintData.texturePath];

      if (!texture) {
        continue;
      }

      const sprite = new Sprite(texture);
      sprite.anchor.set(0.5, 0.5);

      sprite.x =
        hintData.pixelX +
        hintData.hintInfo.offsetX +
        hintData.hintInfo.width / 2;
      sprite.y =
        hintData.pixelY +
        hintData.hintInfo.offsetY +
        hintData.hintInfo.height / 2;
      const maxDim = Math.max(texture.width, texture.height);
      const hintScale = maxDim > 0 ? targetSize / maxDim : 1;
      sprite.scale.set(hintScale);

      this.hintSprites.push(sprite);
      this.hintsContainer.addChild(sprite);
    }
  }

  centerOnMap(mapId: number, animate = false): void {
    if (!this.manifest) {
      return;
    }

    const mapCoord = getMapLangCoords(mapId);

    if (!mapCoord) {
      return;
    }

    const { bounds } = this.manifest;
    const [pixelX, pixelY] = mapCoordToPixel(
      mapCoord.x,
      mapCoord.y,
      bounds.xMin,
      bounds.yMin
    );

    if (animate) {
      this.animateCenter(pixelX, pixelY);
    } else {
      this.applyCenter(pixelX, pixelY);
    }
  }

  centerOnCoordinates(x: number, y: number): void {
    if (!this.manifest) {
      return;
    }

    const { bounds } = this.manifest;
    const [pixelX, pixelY] = mapCoordToPixel(x, y, bounds.xMin, bounds.yMin);

    this.applyCenter(pixelX, pixelY);
  }

  private applyCenter(pixelX: number, pixelY: number): void {
    this.worldContainer.x = -pixelX;
    this.worldContainer.y = -pixelY;
    this.drawPositionMarker(pixelX, pixelY);
  }

  private animateCenter(targetX: number, targetY: number): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }

    const startX = -this.worldContainer.x;
    const startY = -this.worldContainer.y;
    const startTime = performance.now();
    const duration = 300;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - (1 - progress) ** 3;

      const currentX = startX + (targetX - startX) * eased;
      const currentY = startY + (targetY - startY) * eased;

      this.worldContainer.x = -currentX;
      this.worldContainer.y = -currentY;
      this.drawPositionMarker(currentX, currentY);

      if (progress < 1) {
        this.animationFrame = requestAnimationFrame(animate);
      } else {
        this.animationFrame = null;
      }
    };

    this.animationFrame = requestAnimationFrame(animate);
  }

  private drawPositionMarker(pixelX: number, pixelY: number): void {
    this.centerPixel = { x: pixelX, y: pixelY };
    drawPositionMarker(this.positionMarker, pixelX, pixelY);
    this.refreshVisibleTiles();
  }

  /**
   * Convert a global screen point to a map ID by tracing through the minimap's transforms.
   */
  getMapIdAtPoint(globalX: number, globalY: number): number | null {
    if (!this.manifest) {
      return null;
    }

    const localPoint = this.worldContainer.toLocal({ x: globalX, y: globalY });
    const { bounds } = this.manifest;
    const gameCoord = pixelToMapCoord(
      localPoint.x,
      localPoint.y,
      bounds.xMin,
      bounds.yMin
    );

    return (
      getSubareaIndex(this.currentSuperarea)?.mapAt(gameCoord.x, gameCoord.y) ??
      null
    );
  }

  show(): void {
    this.worldContainer.visible = true;
  }

  hide(): void {
    this.worldContainer.visible = false;
  }

  destroy(): void {
    if (this.animationFrame !== null) {
      cancelAnimationFrame(this.animationFrame);
    }

    this.worldContainer.destroy({ children: true, texture: false });
  }
}
