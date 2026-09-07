import {
  type Application,
  Assets,
  BlurFilter,
  Container,
  type FederatedPointerEvent,
  Graphics,
  Rectangle,
  Sprite,
  Text,
  TextStyle,
  type Texture,
} from "pixi.js";

import type {
  HintGroup,
  HintManifest,
  HintSpriteData,
  HintsLayering,
  WorldMapManifest,
  WorldMapMarker,
  WorldMapTool,
} from "@/game/types/worldmap";
import {
  getMapLangCoords,
  getMapNames,
  loadMapsLang,
} from "@/game/lang/maps-lang";
import {
  addMarker,
  removeMarker,
  setHoveredSubarea,
  setWorldMapZoom,
  worldMapStore,
} from "@/game/stores/worldmap-store";
import {
  SUBAREA_HIGHLIGHT_ALPHA,
  SUBAREA_HIGHLIGHT_COLOR,
  WORLDMAP_CONSTANTS,
} from "@/game/types/worldmap";
import { animateSprite } from "@/game/worldmap/animations";
import {
  drawMarkerFlag,
  drawPositionMarker,
} from "@/game/worldmap/position-marker";
import { getSubareaIndex } from "@/game/worldmap/subarea-index";
import {
  contentExtent,
  filterHintsByArea,
  loadWorldMapData,
  mapCoordToPixel,
  pixelToMapCoord,
  selectVisibleTiles,
  shouldLoadDetailTiles,
} from "@/game/worldmap/world-map-data";

interface HintSprite extends Sprite, HintSpriteData {}

interface WorldMapRendererConfig {
  app: Application;
  parentContainer?: Container;
  onTeleport?: (mapId: number) => void;
  /** Clic droit sur un marqueur — la React ouvre le menu contextuel. */
  onMarkerContextMenu?: (
    marker: WorldMapMarker,
    screenX: number,
    screenY: number
  ) => void;
}

export class WorldMapRenderer {
  private app: Application;
  private root: Container;
  private worldContainer: Container;
  private mapContainer: Container;
  private hintsContainer: Container;
  private uiContainer: Container;

  private tooltip: Container;
  private tooltipText: Text;
  private tooltipBg: Graphics;

  private manifest: WorldMapManifest | null = null;
  private hintManifest: HintManifest | null = null;
  private hintsLayering: HintsLayering | null = null;

  private enabledCategories = new Set<number>([1, 2, 3, 4, 5, 6]);
  private currentSuperarea = 0;
  private currentZoom: number = WORLDMAP_CONSTANTS.DEFAULT_ZOOM;
  /**
   * Scale factor so that at DEFAULT_ZOOM (50), the full game map fits the viewport.
   * Zoom then scales linearly: scale = baseScale * (currentZoom / DEFAULT_ZOOM).
   * This matches the original MapNavigator.as behavior where cell size = _nWPage * _nZoom / 100.
   */
  private baseScale = 1;

  private isDragging = false;
  private dragStart = { x: 0, y: 0 };
  private wheelHandler: ((e: WheelEvent) => void) | null = null;

  private gridContainer: Container;
  private gridGraphics: Graphics;
  private showGrid = false;

  private positionMarker: Graphics;

  /** Aperçu basse résolution : le fond peint dès la première frame. */
  private overviewSprite: Sprite | null = null;
  /** Les tuiles unies, en rectangles pleins — aucune requête. */
  private uniformGraphics: Graphics;
  /** Tuiles de détail montées, par nom de fichier. */
  private tileSprites = new Map<string, Sprite>();
  private tileRequest = 0;
  private refreshHandle: number | null = null;

  /** Silhouette de la sous-zone survolée. */
  private highlightGraphics: Graphics;
  private hoveredSubareaId: number | null = null;
  private lastHoverKey: string | null = null;

  private markersContainer: Container;
  private markerGraphics = new Map<string, Graphics>();
  private storeUnsubscribe: (() => void) | null = null;

  private tool: WorldMapTool = "move";
  /** Hauteur de la barre d'outils React, qui mange le haut du canevas. */
  private topInset = 0;
  private playerMapId: number | null = null;
  private onMarkerContextMenu?: (
    marker: WorldMapMarker,
    screenX: number,
    screenY: number
  ) => void;

  private hintGroups = new Map<string, HintGroup>();
  private collapseTimers = new Map<string, number>();
  private activeGroupKey: string | null = null;
  private groupShadows = new Map<string, Sprite[]>();
  private viewWidth: number;
  private viewHeight: number;
  private onTeleport?: (mapId: number) => void;
  private dragDistance = 0;
  private pointerDownPos = { x: 0, y: 0 };
  private lastClickTime = 0;
  private lastClickPos = { x: 0, y: 0 };
  /** L'infobulle affiche les coordonnées du survol, pas un nom de hint. */
  private coordTooltipVisible = false;

  constructor(config: WorldMapRendererConfig) {
    this.app = config.app;
    this.root = config.parentContainer ?? this.app.stage;
    this.viewWidth = this.app.screen.width;
    this.viewHeight = this.app.screen.height;

    this.worldContainer = new Container();
    this.mapContainer = new Container();
    this.gridContainer = new Container();
    this.gridGraphics = new Graphics();
    this.gridContainer.addChild(this.gridGraphics);
    this.hintsContainer = new Container();
    this.uiContainer = new Container();

    this.positionMarker = new Graphics();
    this.uniformGraphics = new Graphics();
    this.highlightGraphics = new Graphics();
    this.markersContainer = new Container();

    // Ordre de pile : aperçu et aplats en fond, puis les tuiles de détail, la
    // teinte de survol, la grille, le repère, les hints, les marqueurs.
    this.mapContainer.addChild(this.uniformGraphics);
    this.worldContainer.addChild(this.mapContainer);
    this.worldContainer.addChild(this.highlightGraphics);
    this.worldContainer.addChild(this.gridContainer);
    this.worldContainer.addChild(this.positionMarker);
    this.worldContainer.addChild(this.hintsContainer);
    this.worldContainer.addChild(this.markersContainer);

    this.root.addChild(this.worldContainer);
    this.root.addChild(this.uiContainer);

    this.tooltip = new Container();
    this.tooltip.visible = false;

    this.tooltipBg = new Graphics();
    this.tooltip.addChild(this.tooltipBg);

    this.tooltipText = new Text({
      text: "",
      style: new TextStyle({
        fontFamily: "bitMini6",
        fontSize: 14,
        fill: 0xffffff,
      }),
    });
    this.tooltipText.x = 8;
    this.tooltipText.y = 6;
    this.tooltip.addChild(this.tooltipText);

    this.root.addChild(this.tooltip);

    this.onTeleport = config.onTeleport;
    this.onMarkerContextMenu = config.onMarkerContextMenu;
    this.setupControls();
    this.subscribeToStore();
  }

  /** Current render scale — baseScale × zoom. At MIN_ZOOM (10) the map fits the viewport. */
  private getScale(): number {
    return this.baseScale * this.currentZoom;
  }

  private setupControls(): void {
    this.worldContainer.eventMode = "static";
    // `show()` arme `eventMode` et la `hitArea` ; au repos le renderer ne doit
    // rien intercepter du jeu qui tourne dessous.
    this.root.eventMode = "none";

    this.setupPropagationGuard();
    this.setupZoomControl();
    this.setupDragControl();
    this.setupHoverTracking();
    this.setupGroupTracking();
  }

  /**
   * Les gestionnaires de souris du jeu sont posés sur `app.stage`
   * (`battlefield/bootstrap.ts:219-222`), qui est un ancêtre de ce conteneur :
   * les événements Pixi remontent, donc un clic sur la carte du monde arrivait
   * aussi au jeu et devenait un déplacement.
   *
   * `InteractionHandler.enabled` est la vraie coupure, décidée par
   * `MapRenderer` sur l'état d'ouverture. Ceci ferme le chemin à la source,
   * pour tout autre écouteur qui vivrait sur le stage.
   */
  private setupPropagationGuard(): void {
    const stop = (e: FederatedPointerEvent) => {
      if (this.worldContainer.visible) {
        e.stopPropagation();
      }
    };

    this.root.on("pointerdown", stop);
    this.root.on("pointermove", stop);
    this.root.on("pointerup", stop);
    this.root.on("pointerupoutside", stop);
    this.root.on("pointertap", stop);
  }

  /** Coordonnées d'un `WheelEvent` relatives au canevas, pas à la fenêtre. */
  private canvasPoint(e: WheelEvent): { x: number; y: number } {
    const rect = this.app.canvas?.getBoundingClientRect();

    if (!rect) {
      return { x: e.clientX, y: e.clientY };
    }

    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  private setupZoomControl(): void {
    this.wheelHandler = (e: WheelEvent) => {
      e.preventDefault();

      if (!this.manifest) {
        return;
      }

      const { ZOOM_STEP } = WORLDMAP_CONSTANTS;
      const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;

      // Le canevas n'est pas collé au coin de la fenêtre : `clientX` seul
      // décalait l'ancrage du zoom de tout l'offset du canevas.
      this.zoomAt(this.currentZoom + delta, this.canvasPoint(e));
    };

    // Posé par `show()` seulement — voir le commentaire là-bas.
  }

  /** Zoome en gardant fixe le point écran donné. */
  private zoomAt(zoom: number, anchor: { x: number; y: number }): void {
    const { MIN_ZOOM, MAX_ZOOM } = WORLDMAP_CONSTANTS;
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

    if (next === this.currentZoom) {
      return;
    }

    const worldX = (anchor.x - this.worldContainer.x) / this.getScale();
    const worldY = (anchor.y - this.worldContainer.y) / this.getScale();

    this.currentZoom = next;
    const scale = this.getScale();

    this.worldContainer.scale.set(scale);
    this.worldContainer.x = anchor.x - worldX * scale;
    this.worldContainer.y = anchor.y - worldY * scale;
    this.clampPosition();
    this.scheduleTileRefresh();
    this.refreshHighlight();
    setWorldMapZoom(next);
  }

  /** Zoom depuis la barre d'outils : ancré au centre de la vue. */
  setZoom(zoom: number): void {
    this.zoomAt(zoom, {
      x: this.viewWidth / 2,
      y: (this.topInset + this.viewHeight) / 2,
    });
  }

  private clampPosition(): void {
    if (!this.manifest) {
      return;
    }

    // L'étendue du contenu, pas celle de la planche de tuiles : la planche fait
    // 8192 px de côté alors que le monde n'en occupe que 6678 × 5184, et borner
    // sur la planche laissait paner dans le vide.
    const { width, height } = contentExtent(this.manifest);
    const scale = this.getScale();
    const scaledW = width * scale;
    const scaledH = height * scale;

    const minX = this.viewWidth - scaledW;
    const minY = this.viewHeight - scaledH;
    const maxX = 0;
    const maxY = this.topInset;

    this.worldContainer.x =
      scaledW <= this.viewWidth
        ? (this.viewWidth - scaledW) / 2
        : Math.max(minX, Math.min(maxX, this.worldContainer.x));

    this.worldContainer.y =
      scaledH <= this.viewHeight - this.topInset
        ? this.topInset + (this.viewHeight - this.topInset - scaledH) / 2
        : Math.max(minY, Math.min(maxY, this.worldContainer.y));
  }

  private setupDragControl(): void {
    this.root.on("pointerdown", (e) => {
      if (e.global.y < this.topInset) {
        return;
      }

      // Le bouton droit sert au menu contextuel d'un marqueur, pas au pan.
      if (e.button === 2) {
        this.handleRightClick(e.global.x, e.global.y);
        return;
      }

      // Le pan reste disponible même avec l'outil marqueur : ce qui distingue
      // les modes, c'est ce que fait un clic *sans* glissé.
      this.isDragging = true;
      this.dragDistance = 0;
      this.pointerDownPos.x = e.global.x;
      this.pointerDownPos.y = e.global.y;
      this.dragStart.x = e.global.x - this.worldContainer.x;
      this.dragStart.y = e.global.y - this.worldContainer.y;

      if (this.app.canvas) {
        this.app.canvas.style.cursor = "grabbing";
      }
    });

    // `globalpointermove` et pas `pointermove` : un glissé rapide qui sort du
    // conteneur perdait ses événements en cours de route. C'est déjà ce que
    // fait le suivi des groupes de hints.
    this.root.on("globalpointermove", (e) => {
      if (!this.isDragging) {
        return;
      }

      const dx = e.global.x - this.pointerDownPos.x;
      const dy = e.global.y - this.pointerDownPos.y;
      this.dragDistance = Math.sqrt(dx * dx + dy * dy);
      this.worldContainer.x = e.global.x - this.dragStart.x;
      this.worldContainer.y = e.global.y - this.dragStart.y;
      this.clampPosition();
      this.scheduleTileRefresh();
    });

    const stopDrag = (e?: { global: { x: number; y: number } }) => {
      const wasDrag = this.dragDistance > 5;
      this.isDragging = false;

      if (this.app.canvas) {
        this.app.canvas.style.cursor = this.cursorForTool();
      }

      if (wasDrag || !e || e.global.y < this.topInset) {
        return;
      }

      this.handleClick(e.global.x, e.global.y);

      const now = performance.now();
      const dx = e.global.x - this.lastClickPos.x;
      const dy = e.global.y - this.lastClickPos.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (now - this.lastClickTime < 400 && dist < 20) {
        this.handleDoubleClick(e.global.x, e.global.y);
        this.lastClickTime = 0;
      } else {
        this.lastClickTime = now;
        this.lastClickPos.x = e.global.x;
        this.lastClickPos.y = e.global.y;
      }
    };

    this.root.on("pointerup", (e) => stopDrag(e));
    this.root.on("pointerupoutside", () => stopDrag());
  }

  private cursorForTool(): string {
    return this.tool === "marker" ? "crosshair" : "grab";
  }

  /** Écran -> coordonnées de carte, ou `null` hors du monde. */
  private screenToMapCoord(
    screenX: number,
    screenY: number
  ): { x: number; y: number } | null {
    if (!this.manifest) {
      return null;
    }

    const { bounds } = this.manifest;
    const scale = this.getScale();
    const localX = (screenX - this.worldContainer.x) / scale;
    const localY = (screenY - this.worldContainer.y) / scale;

    return pixelToMapCoord(localX, localY, bounds.xMin, bounds.yMin);
  }

  /**
   * Le survol : nom de zone dans la barre, silhouette teintée, infobulle des
   * coordonnées. On ne recalcule qu'au changement de case — le 1.29 fait pareil
   * avec sa garde `_oLastCoordsOver` (`MapNavigator.as:562-597`).
   */
  private setupHoverTracking(): void {
    this.root.on("globalpointermove", (e) => {
      if (!this.worldContainer.visible || this.isDragging) {
        return;
      }

      if (e.global.y < this.topInset) {
        this.clearHover();
        return;
      }

      const coord = this.screenToMapCoord(e.global.x, e.global.y);

      if (!coord) {
        return;
      }

      const key = `${coord.x},${coord.y}`;

      if (key !== this.lastHoverKey) {
        this.lastHoverKey = key;
        this.updateHover(coord.x, coord.y);
      }

      if (this.coordTooltipVisible) {
        this.updateTooltipPosition(e.global.x, e.global.y);
      }
    });
  }

  private updateHover(x: number, y: number): void {
    const index = getSubareaIndex(this.currentSuperarea);
    const subareaId = index?.subareaAt(x, y) ?? null;

    if (subareaId === null) {
      this.clearHover();
      return;
    }

    this.coordTooltipVisible = true;
    this.showTooltip(`${x}, ${y}`, 0, 0);

    if (subareaId !== this.hoveredSubareaId) {
      this.hoveredSubareaId = subareaId;
      this.refreshHighlight();

      const mapId = index?.mapAt(x, y) ?? null;
      const names = mapId === null ? null : getMapNames(mapId, subareaId);

      setHoveredSubarea(names);
    }
  }

  private clearHover(): void {
    this.lastHoverKey = null;

    if (this.hoveredSubareaId !== null) {
      this.hoveredSubareaId = null;
      this.highlightGraphics.clear();
      setHoveredSubarea(null);
    }

    if (this.coordTooltipVisible) {
      this.coordTooltipVisible = false;
      this.hideTooltip();
    }
  }

  /**
   * La silhouette de la sous-zone survolée : l'union de ses cases, teintée.
   *
   * Le 1.29 attachait un clip `subarea_<id>` déjà dessiné dans le SWF
   * (`MapNavigator.addSubareaClip`), qui n'a jamais été exporté ici. Sauté au
   * zoom minimal, comme lui (`MapExplorer.as:729`).
   */
  private refreshHighlight(): void {
    this.highlightGraphics.clear();

    if (
      this.hoveredSubareaId === null ||
      !this.manifest ||
      this.currentZoom <= WORLDMAP_CONSTANTS.MIN_ZOOM
    ) {
      return;
    }

    const index = getSubareaIndex(this.currentSuperarea);
    const cells = index?.cellsOf(this.hoveredSubareaId) ?? [];

    if (cells.length === 0) {
      return;
    }

    const { bounds } = this.manifest;
    const { DISPLAY_WIDTH, DISPLAY_HEIGHT, CHUNK_SIZE } = WORLDMAP_CONSTANTS;
    const cellW = DISPLAY_WIDTH / CHUNK_SIZE;
    const cellH = DISPLAY_HEIGHT / CHUNK_SIZE;

    for (const cell of cells) {
      const [px, py] = mapCoordToPixel(
        cell.x,
        cell.y,
        bounds.xMin,
        bounds.yMin
      );

      this.highlightGraphics.rect(px - cellW / 2, py - cellH / 2, cellW, cellH);
    }

    this.highlightGraphics.fill({
      color: SUBAREA_HIGHLIGHT_COLOR,
      alpha: SUBAREA_HIGHLIGHT_ALPHA,
    });
  }

  private handleClick(screenX: number, screenY: number): void {
    if (this.tool !== "marker") {
      return;
    }

    const coord = this.screenToMapCoord(screenX, screenY);
    const index = getSubareaIndex(this.currentSuperarea);

    // Pas de marqueur dans le vide : hors du monde il ne désignerait rien.
    if (!coord || index?.subareaAt(coord.x, coord.y) == null) {
      return;
    }

    const { markerColor } = worldMapStore.getSnapshot();
    addMarker(coord.x, coord.y, markerColor);
  }

  private handleRightClick(screenX: number, screenY: number): void {
    const marker = this.markerAt(screenX, screenY);

    if (!marker) {
      return;
    }

    if (this.onMarkerContextMenu) {
      this.onMarkerContextMenu(marker, screenX, screenY);
      return;
    }

    removeMarker(marker.id);
  }

  private markerAt(screenX: number, screenY: number): WorldMapMarker | null {
    const coord = this.screenToMapCoord(screenX, screenY);

    if (!coord) {
      return null;
    }

    const { markers } = worldMapStore.getSnapshot();

    return markers.find((m) => m.x === coord.x && m.y === coord.y) ?? null;
  }

  private handleDoubleClick(screenX: number, screenY: number): void {
    if (!this.onTeleport) {
      return;
    }

    const coord = this.screenToMapCoord(screenX, screenY);
    const mapId = coord
      ? (getSubareaIndex(this.currentSuperarea)?.mapAt(coord.x, coord.y) ??
        null)
      : null;

    if (mapId != null) {
      this.onTeleport(mapId);
    }
  }

  async loadWorldMap(superarea: number = 0): Promise<void> {
    this.currentSuperarea = superarea;

    // `centerOnMapId` et l'index de sous-zones lisent tous deux le bundle de
    // noms ; il est déjà en vol pour le libellé du HUD, donc c'est gratuit.
    const [data] = await Promise.all([
      loadWorldMapData(superarea),
      loadMapsLang(),
    ]);
    this.manifest = data.manifest;
    this.hintManifest = data.hintManifest;
    this.hintsLayering = data.hintsLayering;

    await this.renderMap();
    this.drawGrid();
    this.renderMarkers();
    await this.renderHints();
  }

  /**
   * Le fond de carte, en trois couches.
   *
   * Avant, cette méthode montait les 1024 tuiles d'Amakna d'un coup : 1024
   * requêtes, 1024 `updateMipmaps()` et 1024 fondus rAF dans la même frame,
   * dont 754 pour des tuiles d'une seule couleur. D'où la seconde ou deux
   * d'attente à l'ouverture.
   *
   * Maintenant l'aperçu et les aplats peignent la planche entière tout de
   * suite, sans rien attendre, et seules les tuiles visibles sont demandées.
   */
  private async renderMap(): Promise<void> {
    if (!this.manifest) {
      return;
    }

    this.clearTiles();
    this.centerMap();
    this.drawUniformTiles();
    await this.mountOverview();
    this.refreshVisibleTiles();
  }

  private clearTiles(): void {
    for (const sprite of this.tileSprites.values()) {
      sprite.destroy({ texture: false });
    }

    this.tileSprites.clear();
    this.uniformGraphics.clear();

    if (this.overviewSprite) {
      this.overviewSprite.destroy({ texture: false });
      this.overviewSprite = null;
    }
  }

  /**
   * Les tuiles unies, en rectangles pleins. Exact au pixel : la tuile n'avait
   * qu'une couleur, donc le rectangle la reproduit tel quel — et rien n'est
   * téléchargé.
   */
  private drawUniformTiles(): void {
    const manifest = this.manifest;

    if (!manifest?.uniform_tiles) {
      return;
    }

    const size = manifest.tile_size;

    for (const [hex, cells] of Object.entries(manifest.uniform_tiles)) {
      for (const [x, y] of cells) {
        this.uniformGraphics.rect(x * size, y * size, size, size);
      }

      this.uniformGraphics.fill({ color: Number.parseInt(hex, 16) });
    }
  }

  /** L'aperçu basse résolution, étiré sur toute la planche. */
  private async mountOverview(): Promise<void> {
    const manifest = this.manifest;

    if (!manifest?.overview) {
      return;
    }

    const url = `/assets/maps/world/${manifest.worldmap}/${manifest.overview}`;

    try {
      const texture = (await Assets.load(url)) as Texture | undefined;

      if (!texture || !this.manifest) {
        return;
      }

      const plane = manifest.grid_size * manifest.tile_size;
      const sprite = new Sprite(texture);

      sprite.width = plane;
      sprite.height = plane;
      sprite.eventMode = "none";

      // Sous les aplats et les tuiles de détail.
      this.mapContainer.addChildAt(sprite, 0);
      this.overviewSprite = sprite;
    } catch {
      // Manifeste non optimisé, ou aperçu absent : les tuiles suffisent.
    }
  }

  /** Le rectangle visible, en pixels du plan de tuiles. */
  private visibleRect(): {
    left: number;
    top: number;
    right: number;
    bottom: number;
  } {
    const scale = this.getScale();

    return {
      left: -this.worldContainer.x / scale,
      top: (this.topInset - this.worldContainer.y) / scale,
      right: (this.viewWidth - this.worldContainer.x) / scale,
      bottom: (this.viewHeight - this.worldContainer.y) / scale,
    };
  }

  /** Coalesce les rafraîchissements pendant un pan ou un zoom continu. */
  private scheduleTileRefresh(): void {
    if (this.refreshHandle !== null) {
      return;
    }

    this.refreshHandle = requestAnimationFrame(() => {
      this.refreshHandle = null;
      this.refreshVisibleTiles();
    });
  }

  private refreshVisibleTiles(): void {
    const manifest = this.manifest;

    if (!manifest) {
      return;
    }

    // Au dézoom, l'aperçu est déjà plus fin que ce qui sera affiché : inutile
    // de télécharger quoi que ce soit.
    if (!shouldLoadDetailTiles(manifest, this.getScale())) {
      this.dropTilesOutside(new Set());
      return;
    }

    const wanted = selectVisibleTiles(manifest, this.visibleRect());
    const wantedNames = new Set(wanted.map((t) => t.file));

    this.dropTilesOutside(wantedNames);

    const missing = wanted.filter((t) => !this.tileSprites.has(t.file));

    if (missing.length === 0) {
      return;
    }

    const request = ++this.tileRequest;
    const urls = missing.map(
      (t) => `/assets/maps/world/${manifest.worldmap}/${t.file}`
    );

    // Un seul `Assets.load` pour le lot : Pixi mutualise les requêtes et ne
    // retéléchargera pas une tuile déjà en cache.
    void Assets.load(urls)
      .then((textures: Record<string, Texture>) => {
        // Un pan rapide peut avoir invalidé le lot entre-temps.
        if (request !== this.tileRequest || !this.manifest) {
          return;
        }

        for (const tile of missing) {
          const url = `/assets/maps/world/${manifest.worldmap}/${tile.file}`;
          const texture = textures[url];

          if (!texture || this.tileSprites.has(tile.file)) {
            continue;
          }

          if (texture.source) {
            texture.source.autoGenerateMipmaps = true;
            texture.source.updateMipmaps();
          }

          const sprite = new Sprite(texture);
          sprite.x = tile.x * manifest.tile_size;
          sprite.y = tile.y * manifest.tile_size;
          sprite.eventMode = "none";

          this.mapContainer.addChild(sprite);
          this.tileSprites.set(tile.file, sprite);
        }
      })
      .catch(() => {
        // Tuile manquante : l'aperçu tient lieu de fond.
      });
  }

  private dropTilesOutside(wanted: Set<string>): void {
    for (const [file, sprite] of this.tileSprites) {
      if (!wanted.has(file)) {
        sprite.destroy({ texture: false });
        this.tileSprites.delete(file);
      }
    }
  }

  setViewSize(w: number, h: number): void {
    this.viewWidth = w;
    this.viewHeight = h;

    if (this.worldContainer.visible) {
      this.root.hitArea = new Rectangle(0, 0, w, h);
    }
  }

  /** Hauteur de la barre d'outils React, qui n'appartient pas à la carte. */
  setTopInset(px: number): void {
    this.topInset = px;
  }

  private centerMap(): void {
    if (!this.manifest) {
      return;
    }

    const { bounds } = this.manifest;
    const { DISPLAY_WIDTH, DISPLAY_HEIGHT } = WORLDMAP_CONSTANTS;

    // Game map extent in tile pixel space
    const chunksW = bounds.xMax - bounds.xMin + 1;
    const chunksH = bounds.yMax - bounds.yMin + 1;
    const mapPixelW = chunksW * DISPLAY_WIDTH;
    const mapPixelH = chunksH * DISPLAY_HEIGHT;

    // At MIN_ZOOM (10), the full game map fits the viewport.
    // At MAX_ZOOM (100), you see ~1/10th of the map per axis (~14 cells across ≈ 4×4 grid).
    // This matches the original Dofus MapExplorer zoom behavior.
    const fitScale = Math.min(
      this.viewWidth / mapPixelW,
      (this.viewHeight - this.topInset) / mapPixelH
    );
    this.baseScale = fitScale / WORLDMAP_CONSTANTS.MIN_ZOOM;

    this.currentZoom = WORLDMAP_CONSTANTS.DEFAULT_ZOOM;

    const scale = this.getScale();
    this.worldContainer.scale.set(scale);
    // Sur le contenu (6678 × 5184), pas sur la planche de tuiles (8192²) :
    // centrer sur la planche décalait la vue vers le vide de droite et du bas.
    this.worldContainer.x = (this.viewWidth - mapPixelW * scale) / 2;
    this.worldContainer.y =
      this.topInset + (this.viewHeight - this.topInset - mapPixelH * scale) / 2;
    this.clampPosition();
    setWorldMapZoom(this.currentZoom);
  }

  private drawGrid(): void {
    if (!this.manifest) {
      return;
    }

    this.gridGraphics.clear();

    if (!this.showGrid) {
      return;
    }

    const { bounds } = this.manifest;
    const { DISPLAY_WIDTH, DISPLAY_HEIGHT, CHUNK_SIZE } = WORLDMAP_CONSTANTS;

    // Bounds are inclusive — each chunk is one SWF sprite rendered at DISPLAY_WIDTH × DISPLAY_HEIGHT
    const chunksX = bounds.xMax - bounds.xMin + 1;
    const chunksY = bounds.yMax - bounds.yMin + 1;

    // Each chunk is exactly DISPLAY_WIDTH × DISPLAY_HEIGHT pixels in tile space
    const totalW = chunksX * DISPLAY_WIDTH;
    const totalH = chunksY * DISPLAY_HEIGHT;

    // Pixels per game-map cell within a chunk
    const cellW = DISPLAY_WIDTH / CHUNK_SIZE;
    const cellH = DISPLAY_HEIGHT / CHUNK_SIZE;

    const totalCellsX = chunksX * CHUNK_SIZE;
    const totalCellsY = chunksY * CHUNK_SIZE;

    const gridColor = 0x000000;
    const gridAlpha = 0.12;

    // Vertical lines
    for (let i = 0; i <= totalCellsX; i++) {
      const x = i * cellW;
      this.gridGraphics.rect(x, 0, 1, totalH);
      this.gridGraphics.fill({ color: gridColor, alpha: gridAlpha });
    }

    // Horizontal lines
    for (let j = 0; j <= totalCellsY; j++) {
      const y = j * cellH;
      this.gridGraphics.rect(0, y, totalW, 1);
      this.gridGraphics.fill({ color: gridColor, alpha: gridAlpha });
    }
  }

  setGridVisible(visible: boolean): void {
    if (this.showGrid === visible) {
      return;
    }

    this.showGrid = visible;
    this.drawGrid();
  }

  private async renderHints(): Promise<void> {
    if (!this.hintsLayering || !this.manifest || !this.hintManifest) {
      return;
    }

    this.hintsContainer.removeChildren();
    this.clearHintGroups();

    const { bounds } = this.manifest;

    const filteredHints = filterHintsByArea(
      this.hintsLayering,
      this.enabledCategories,
      this.currentSuperarea
    );

    const hintUrls = new Set<string>();

    const hintsToRender: Array<{
      hint: { name: string; categoryID: number; gfxID: number; mapID: number };
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

      hintsToRender.push({ hint, pixelX, pixelY, hintInfo, texturePath });
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

    const positionGroups = this.groupHintsByPosition(hintsToRender);

    for (const [posKey, groupData] of positionGroups) {
      this.createHintGroup(posKey, groupData, loadedTextures);
    }
  }

  private groupHintsByPosition(
    hints: Array<{
      hint: { name: string; categoryID: number; gfxID: number; mapID: number };
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
    }>
  ): Map<string, typeof hints> {
    const groups = new Map<string, typeof hints>();

    for (const hintData of hints) {
      const posKey = `${Math.round(hintData.pixelX)},${Math.round(hintData.pixelY)}`;
      const group = groups.get(posKey) ?? [];

      group.push(hintData);
      groups.set(posKey, group);
    }

    return groups;
  }

  private createHintGroup(
    posKey: string,
    groupData: Array<{
      hint: { name: string; categoryID: number; gfxID: number; mapID: number };
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
    }>,
    textures: Record<string, import("pixi.js").Texture>
  ): void {
    if (!this.hintManifest) {
      return;
    }

    const sprites: HintSprite[] = [];

    for (let i = 0; i < groupData.length; i++) {
      const hintData = groupData[i];
      const texture = textures[hintData.texturePath];

      if (!texture) {
        continue;
      }

      const sprite = new Sprite(texture) as HintSprite;
      sprite.anchor.set(0.5, 0.5);

      const halfWidth = hintData.hintInfo.width / 2;
      const halfHeight = hintData.hintInfo.height / 2;
      const baseX = hintData.pixelX + hintData.hintInfo.offsetX + halfWidth;
      const baseY = hintData.pixelY + hintData.hintInfo.offsetY + halfHeight;

      sprite.baseX = baseX;
      sprite.baseY = baseY;
      sprite.hintData = hintData.hint;
      sprite.groupKey = posKey;

      if (groupData.length > 1) {
        sprite.x = baseX + i * 2;
        sprite.y = baseY + i * 2;
      } else {
        sprite.x = baseX;
        sprite.y = baseY;
      }

      const targetSize = 30;
      const maxDim = Math.max(texture.width, texture.height);
      const hintScale = maxDim > 0 ? targetSize / maxDim : 1;
      sprite.scale.set(hintScale);
      sprite.eventMode = "static";
      sprite.cursor = "pointer";

      sprites.push(sprite);
      this.hintsContainer.addChild(sprite);
    }

    if (sprites.length === 0) {
      return;
    }

    const group: HintGroup = {
      sprites,
      hitArea: null,
      visualCircle: null,
      isSpread: false,
    };

    this.hintGroups.set(posKey, group);

    if (sprites.length > 1) {
      this.setupMultiHintInteractions(posKey, sprites);
    } else {
      this.setupSingleHintInteractions(sprites[0]);
    }
  }

  private setupMultiHintInteractions(
    posKey: string,
    sprites: HintSprite[]
  ): void {
    // Sprite pointerover triggers spread + tooltip.
    // Collapse is handled by the global pointermove on worldContainer (setupGroupTracking).
    for (const sprite of sprites) {
      sprite.on("pointerover", (e) => {
        this.activeGroupKey = posKey;
        this.spreadHints(posKey);
        this.showTooltip(sprite.hintData.name, e.global.x, e.global.y);
      });

      sprite.on("pointermove", (e) => {
        this.updateTooltipPosition(e.global.x, e.global.y);
      });

      sprite.on("pointerout", () => {
        this.hideTooltip();
      });
    }
  }

  /** Global pointermove: collapse the active group when cursor moves far enough away. */
  private setupGroupTracking(): void {
    this.worldContainer.on("globalpointermove", (e) => {
      if (!this.activeGroupKey) {
        return;
      }

      const group = this.hintGroups.get(this.activeGroupKey);

      if (!group || !group.isSpread) {
        this.activeGroupKey = null;
        return;
      }

      const firstSprite = group.sprites[0] as HintSprite;

      // Convert group center to screen coordinates
      const centerScreen = this.worldContainer.toGlobal({
        x: firstSprite.baseX,
        y: firstSprite.baseY,
      });
      const dx = e.global.x - centerScreen.x;
      const dy = e.global.y - centerScreen.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Collapse when cursor is more than 150 screen pixels from group center
      if (dist > 150) {
        this.collapseHints(this.activeGroupKey);
        this.hideTooltip();
        this.activeGroupKey = null;
      }
    });
  }

  private setupSingleHintInteractions(sprite: HintSprite): void {
    sprite.on("pointerover", (e) => {
      this.showTooltip(sprite.hintData.name, e.global.x, e.global.y);
    });

    sprite.on("pointermove", (e) => {
      this.updateTooltipPosition(e.global.x, e.global.y);
    });

    sprite.on("pointerout", () => {
      this.hideTooltip();
    });
  }

  private spreadHints(groupKey: string): void {
    const timer = this.collapseTimers.get(groupKey);

    if (timer) {
      clearTimeout(timer);
      this.collapseTimers.delete(groupKey);
    }

    const group = this.hintGroups.get(groupKey);

    if (!group || group.sprites.length <= 1 || group.isSpread) {
      return;
    }

    group.isSpread = true;

    const firstSprite = group.sprites[0] as HintSprite;
    const baseX = firstSprite.baseX;
    const baseY = firstSprite.baseY;

    const cardSpacing = 30;
    const maxRotation = 15;
    const angleStep = (maxRotation * 2) / (group.sprites.length - 1);

    const shadows: Sprite[] = [];
    const firstIdx = this.hintsContainer.getChildIndex(group.sprites[0]);

    group.sprites.forEach((sprite, index) => {
      const targetX =
        baseX + (index - (group.sprites.length - 1) / 2) * cardSpacing;
      const rotation = -maxRotation + index * angleStep;

      // Create a shadow sprite: a blurred, darkened copy offset behind the original
      const shadow = new Sprite(sprite.texture);
      shadow.anchor.copyFrom(sprite.anchor);
      shadow.scale.copyFrom(sprite.scale);
      shadow.x = sprite.x + 2;
      shadow.y = sprite.y + 2;
      shadow.alpha = 0.4;
      shadow.tint = 0x000000;
      shadow.filters = [new BlurFilter({ strength: 3, quality: 2 })];
      shadow.eventMode = "none";
      this.hintsContainer.addChildAt(shadow, firstIdx);
      shadows.push(shadow);

      animateSprite(shadow, targetX + 2, baseY + 2, 150, rotation);
      animateSprite(sprite, targetX, baseY, 150, rotation);
    });

    this.groupShadows.set(groupKey, shadows);
  }

  private collapseHints(groupKey: string): void {
    const existingTimer = this.collapseTimers.get(groupKey);

    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    const timer = window.setTimeout(() => {
      const group = this.hintGroups.get(groupKey);

      if (!group || !group.isSpread) {
        return;
      }

      group.isSpread = false;

      // Remove shadow sprites
      const shadows = this.groupShadows.get(groupKey);

      if (shadows) {
        for (const s of shadows) {
          s.destroy();
        }

        this.groupShadows.delete(groupKey);
      }

      group.sprites.forEach((sprite, index) => {
        const hintSprite = sprite as HintSprite;
        animateSprite(
          sprite,
          hintSprite.baseX + index * 2,
          hintSprite.baseY + index * 2,
          150,
          0
        );
      });

      this.collapseTimers.delete(groupKey);
    }, 250);

    this.collapseTimers.set(groupKey, timer);
  }

  private clearHintGroups(): void {
    this.collapseTimers.forEach((timer) => void clearTimeout(timer));
    this.collapseTimers.clear();
    this.groupShadows.forEach((shadows) => {
      for (const s of shadows) {
        s.destroy();
      }
    });
    this.groupShadows.clear();
    this.hintGroups.clear();
  }

  private showTooltip(text: string, x: number, y: number): void {
    this.tooltipText.text = text;

    const padding = 8;
    const width = this.tooltipText.width + padding * 2;
    const height = this.tooltipText.height + padding * 1.5;

    this.tooltipBg.clear();
    this.tooltipBg.rect(0, 0, width, height);
    this.tooltipBg.fill({ color: 0x000000, alpha: 0.7 });
    this.tooltipBg.stroke({ color: 0xffffff, width: 1, alpha: 0.5 });

    this.updateTooltipPosition(x, y);
    this.tooltip.visible = true;
  }

  private updateTooltipPosition(x: number, y: number): void {
    const offset = 15;

    let tooltipX = x + offset;
    let tooltipY = y + offset;

    if (tooltipX + this.tooltip.width > this.viewWidth) {
      tooltipX = x - this.tooltip.width - offset;
    }

    if (tooltipY + this.tooltip.height > this.viewHeight) {
      tooltipY = y - this.tooltip.height - offset;
    }

    this.tooltip.x = tooltipX;
    this.tooltip.y = tooltipY;
  }

  private hideTooltip(): void {
    this.tooltip.visible = false;
  }

  show(): void {
    this.worldContainer.visible = true;
    this.uiContainer.visible = true;

    // La `hitArea` couvre tout le canevas : sans ça `pointerdown` ne partirait
    // pas hors tuile. Elle ne doit donc exister que pendant que la carte est
    // ouverte, sinon elle avale les clics du jeu dessous.
    this.root.eventMode = "static";
    this.root.hitArea = new Rectangle(0, 0, this.viewWidth, this.viewHeight);

    // Le listener était posé au constructeur et retiré au seul `destroy()` :
    // une fois la carte fermée, la molette continuait de zoomer dans le vide
    // pour le reste de la session.
    if (this.wheelHandler) {
      this.app.canvas?.addEventListener("wheel", this.wheelHandler, {
        passive: false,
      });
    }

    this.refreshVisibleTiles();
  }

  hide(): void {
    this.worldContainer.visible = false;
    this.uiContainer.visible = false;
    this.hideTooltip();
    this.clearHover();
    this.isDragging = false;

    this.root.eventMode = "none";
    this.root.hitArea = null;

    if (this.wheelHandler) {
      this.app.canvas?.removeEventListener("wheel", this.wheelHandler);
    }

    if (this.app.canvas) {
      this.app.canvas.style.cursor = "default";
    }

    // Collapse any spread group immediately (without destroying group data)
    if (this.activeGroupKey) {
      const group = this.hintGroups.get(this.activeGroupKey);

      if (group?.isSpread) {
        group.isSpread = false;

        const shadows = this.groupShadows.get(this.activeGroupKey);

        if (shadows) {
          for (const s of shadows) {
            s.destroy();
          }

          this.groupShadows.delete(this.activeGroupKey);
        }

        group.sprites.forEach((sprite, index) => {
          const hs = sprite as HintSprite;
          sprite.x = hs.baseX + index * 2;
          sprite.y = hs.baseY + index * 2;
          sprite.rotation = 0;
        });
      }

      this.activeGroupKey = null;
    }

    // Clear pending collapse timers but keep hintGroups intact
    this.collapseTimers.forEach((timer) => {
      clearTimeout(timer);
    });
    this.collapseTimers.clear();
  }

  /** Center the view on a specific map ID. */
  centerOnMapId(mapId: number): void {
    this.playerMapId = mapId;

    if (!this.manifest) {
      return;
    }

    const coord = getMapLangCoords(mapId);

    if (!coord) {
      return;
    }

    const { bounds } = this.manifest;
    const [pixelX, pixelY] = mapCoordToPixel(
      coord.x,
      coord.y,
      bounds.xMin,
      bounds.yMin
    );

    const scale = this.getScale();
    this.worldContainer.x = this.viewWidth / 2 - pixelX * scale;
    this.worldContainer.y =
      (this.topInset + this.viewHeight) / 2 - pixelY * scale;
    this.clampPosition();
    drawPositionMarker(this.positionMarker, pixelX, pixelY);
    this.scheduleTileRefresh();
  }

  /** Le bouton « Centrer sur moi » de la barre (`_btnCenterOnMe` en 1.29). */
  centerOnPlayer(): void {
    if (this.playerMapId !== null) {
      this.centerOnMapId(this.playerMapId);
    }
  }

  // ── Pilotage depuis la barre React ──────────────────────────────────────

  setTool(tool: WorldMapTool): void {
    this.tool = tool;

    if (this.app.canvas) {
      this.app.canvas.style.cursor = this.cursorForTool();
    }
  }

  setCategoryEnabled(categoryId: number, enabled: boolean): void {
    const has = this.enabledCategories.has(categoryId);

    if (has === enabled) {
      return;
    }

    if (enabled) {
      this.enabledCategories.add(categoryId);
    } else {
      this.enabledCategories.delete(categoryId);
    }

    void this.renderHints();
  }

  /**
   * Les marqueurs du joueur, redessinés à chaque changement du store. Il y en a
   * une poignée : tout refaire coûte moins cher que de diffuser.
   */
  private renderMarkers(): void {
    if (!this.manifest) {
      return;
    }

    for (const graphics of this.markerGraphics.values()) {
      graphics.destroy();
    }

    this.markerGraphics.clear();

    const { bounds } = this.manifest;
    const { markers } = worldMapStore.getSnapshot();

    for (const marker of markers) {
      const [pixelX, pixelY] = mapCoordToPixel(
        marker.x,
        marker.y,
        bounds.xMin,
        bounds.yMin
      );

      const graphics = new Graphics();
      drawMarkerFlag(graphics, pixelX, pixelY, marker.color);
      graphics.eventMode = "none";

      this.markersContainer.addChild(graphics);
      this.markerGraphics.set(marker.id, graphics);
    }
  }

  private subscribeToStore(): void {
    let lastMarkers = worldMapStore.getSnapshot().markers;

    this.storeUnsubscribe = worldMapStore.subscribe(() => {
      const { markers } = worldMapStore.getSnapshot();

      if (markers !== lastMarkers) {
        lastMarkers = markers;
        this.renderMarkers();
      }
    });
  }

  destroy(): void {
    if (this.wheelHandler) {
      this.app.canvas?.removeEventListener("wheel", this.wheelHandler);
      this.wheelHandler = null;
    }

    if (this.refreshHandle !== null) {
      cancelAnimationFrame(this.refreshHandle);
      this.refreshHandle = null;
    }

    this.storeUnsubscribe?.();
    this.storeUnsubscribe = null;

    this.root.eventMode = "none";
    this.root.hitArea = null;

    this.clearHintGroups();
    this.worldContainer.destroy({ children: true, texture: false });
    this.uiContainer.destroy({ children: true, texture: false });
    this.tooltip.destroy({ children: true, texture: false });
  }
}
