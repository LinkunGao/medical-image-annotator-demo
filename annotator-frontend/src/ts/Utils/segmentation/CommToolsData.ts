import {
  IDownloadImageConfig,
  IProtected,
  IGUIStates,
  INrrdStates,
  ICursorPage,
  IPaintImage,
  IPaintImages,
  IConvertObjType,
  ICommXYZ,
  INewMaskData
} from "./coreTools/coreType";
import { MaskVolume } from "./core";
import { switchPencilIcon } from "../utils";
import { enableDownload } from "./coreTools/divControlTools";

export class CommToolsData {
  baseCanvasesSize: number = 1;

  // Cache for MaskVolume slice reads to improve performance
  private sliceImageCache: Map<string, ImageData> = new Map();
  private _prewarmTimer: ReturnType<typeof setTimeout> | undefined;

  nrrd_states: INrrdStates = {
    originWidth: 0,
    originHeight: 0,
    nrrd_x_mm: 0,
    nrrd_y_mm: 0,
    nrrd_z_mm: 0,
    nrrd_x_pixel: 0,
    nrrd_y_pixel: 0,
    nrrd_z_pixel: 0,
    changedWidth: 0,
    changedHeight: 0,
    oldIndex: 0,
    currentIndex: 0,
    maxIndex: 0,
    minIndex: 0,
    RSARatio: 0,
    voxelSpacing: [],
    spaceOrigin: [],
    dimensions: [],
    loadMaskJson: false,
    ratios: { x: 1, y: 1, z: 1 },
    sharedPlace: { x: [-1], y: [-1], z: [-1] },
    contrastNum: 0,

    showContrast: false,
    enableCursorChoose: false,
    isCursorSelect: false,
    cursorPageX: 0,
    cursorPageY: 0,
    sphereOrigin: { x: [0, 0, 0], y: [0, 0, 0], z: [0, 0, 0] },
    tumourSphereOrigin: null,
    skinSphereOrigin: null,
    ribSphereOrigin: null,
    nippleSphereOrigin: null,
    tumourColor: "#00ff00",
    skinColor: "#FFEB3B",
    ribcageColor: "#2196F3",
    nippleColor: "#E91E63",

    spherePlanB: true,
    sphereRadius: 5,
    Mouse_Over_x: 0,
    Mouse_Over_y: 0,
    Mouse_Over: false,
    stepClear: 1,
    sizeFoctor: this.baseCanvasesSize,
    clearAllFlag: false,
    previousPanelL: -99999,
    previousPanelT: -99999,
    switchSliceFlag: false,
    layers: ["layer1", "layer2", "layer3"],

    configKeyBoard: false,
    keyboardSettings: {
      draw: "Shift",
      undo: "z",
      contrast: ["Control", "Meta"],
      crosshair: "s",
      mouseWheel: "Scroll:Zoom",
    },

    getMask: (
      mask: ImageData,
      sliceId: number,
      layer: string,
      width: number,
      height: number,
      clearAllFlag: boolean
    ) => { },
    getSphere: (sphereOrigin: number[], sphereRadius: number) => { },
    getCalculateSpherePositions: (tumourSphereOrigin: ICommXYZ | null, skinSphereOrigin: ICommXYZ | null, ribSphereOrigin: ICommXYZ | null, nippleSphereOrigin: ICommXYZ | null, aixs: "x" | "y" | "z") => { },
    drawStartPos: { x: 1, y: 1 },
  };

  cursorPage: ICursorPage = {
    x: {
      cursorPageX: 0,
      cursorPageY: 0,
      index: 0,
      updated: false,
    },
    y: {
      cursorPageX: 0,
      cursorPageY: 0,
      index: 0,
      updated: false,
    },
    z: {
      cursorPageX: 0,
      cursorPageY: 0,
      index: 0,
      updated: false,
    },
  };

  gui_states: IGUIStates = {
    mainAreaSize: 3,
    dragSensitivity: 75,
    Eraser: false,
    globalAlpha: 0.7,
    lineWidth: 2,
    color: "#f50a33",
    segmentation: true,
    fillColor: "#00ff00",
    brushColor: "#00ff00",
    brushAndEraserSize: 15,
    cursor: "dot",
    layer: "layer1",
    cal_distance: "tumour",
    sphere: false,
    calculator: false,
    readyToUpdate: true,
    defaultPaintCursor: switchPencilIcon("dot"),
    max_sensitive: 100,
    // EraserSize: 25,
    clear: () => {
      this.clearPaint();
    },
    clearAll: () => {
      const text = "Are you sure remove annotations on All slice?";
      if (confirm(text) === true) {
        this.nrrd_states.clearAllFlag = true;
        this.clearPaint();
        this.clearStoreImages();
      }
      this.nrrd_states.clearAllFlag = false;
    },
    undo: () => {
      this.undoLastPainting();
    },
    downloadCurrentMask: () => {
      const config: IDownloadImageConfig = {
        axis: this.protectedData.axis,
        currentIndex: this.nrrd_states.currentIndex,
        drawingCanvas: this.protectedData.canvases.drawingCanvas,
        originWidth: this.nrrd_states.originWidth,
        originHeight: this.nrrd_states.originHeight,
      };
      enableDownload(config);
    },
    resetZoom: () => {
      this.nrrd_states.sizeFoctor = this.baseCanvasesSize;
      this.gui_states.mainAreaSize = this.baseCanvasesSize;
      this.resizePaintArea(this.nrrd_states.sizeFoctor);
      this.resetPaintAreaUIPosition();
    },
  };
  protectedData: IProtected;
  constructor(container: HTMLElement, mainAreaContainer: HTMLElement) {
    const canvases = this.generateCanvases();

    // Get NRRD dimensions (will be set later when NRRD loads)
    // Default to 1x1x1 for now, will be re-initialized in NrrdTools when dimensions are known
    const dims = this.nrrd_states.dimensions;
    const [width, height, depth] = dims.length === 3 ? dims : [1, 1, 1];

    this.protectedData = {
      container,
      mainAreaContainer,
      allSlicesArray: [],
      displaySlices: [],
      backUpDisplaySlices: [],
      skipSlicesDic: {},
      currentShowingSlice: undefined,
      mainPreSlices: undefined,
      Is_Shift_Pressed: false,
      Is_Ctrl_Pressed: false,
      Is_Draw: false,
      axis: "z",
      maskData: {
        // Volumetric storage (Phase 3 — only storage mechanism)
        volumes: {
          layer1: new MaskVolume(width, height, depth, 4),
          layer2: new MaskVolume(width, height, depth, 4),
          layer3: new MaskVolume(width, height, depth, 4),
        },
      },
      canvases: {
        originCanvas: null,
        drawingCanvas: canvases[0],
        displayCanvas: canvases[1],
        drawingCanvasLayerMaster: canvases[2],
        drawingCanvasLayerOne: canvases[3],
        drawingCanvasLayerTwo: canvases[4],
        drawingCanvasLayerThree: canvases[5],
        drawingSphereCanvas: canvases[6],
        emptyCanvas: canvases[7],
      },
      ctxes: {
        drawingCtx: canvases[0].getContext("2d") as CanvasRenderingContext2D,
        displayCtx: canvases[1].getContext("2d") as CanvasRenderingContext2D,
        drawingLayerMasterCtx: canvases[2].getContext(
          "2d"
        ) as CanvasRenderingContext2D,
        drawingLayerOneCtx: canvases[3].getContext(
          "2d"
        ) as CanvasRenderingContext2D,
        drawingLayerTwoCtx: canvases[4].getContext(
          "2d"
        ) as CanvasRenderingContext2D,
        drawingLayerThreeCtx: canvases[5].getContext(
          "2d"
        ) as CanvasRenderingContext2D,
        drawingSphereCtx: canvases[6].getContext(
          "2d"
        ) as CanvasRenderingContext2D,
        emptyCtx: canvases[7].getContext("2d", {
          willReadFrequently: true,
        }) as CanvasRenderingContext2D,
      },
    };
  }

  // ── Volume Accessor Helpers (Phase 2) ──────────────────────────────────

  /**
   * Get MaskVolume for a specific layer
   *
   * @param layer - Layer name: "layer1", "layer2", or "layer3"
   * @returns MaskVolume instance for the specified layer
   *
   * @example
   * ```ts
   * const volume = this.getVolumeForLayer("layer1");
   * volume.setVoxel(x, y, z, 255);
   * ```
   */
  getVolumeForLayer(layer: string): MaskVolume {
    const { volumes } = this.protectedData.maskData;
    switch (layer) {
      case "layer1":
        return volumes.layer1;
      case "layer2":
        return volumes.layer2;
      case "layer3":
        return volumes.layer3;
      default:
        // Fallback to layer1 for invalid input
        return volumes.layer1;
    }
  }

  /**
   * Get MaskVolume for the currently active layer
   *
   * @returns MaskVolume instance for the current layer
   *
   * @example
   * ```ts
   * const volume = this.getCurrentVolume();
   * const slice = volume.getSliceImageData(50, 'z');
   * ```
   */
  getCurrentVolume(): MaskVolume {
    return this.getVolumeForLayer(this.gui_states.layer);
  }

  /**
   * Get all three MaskVolume instances
   *
   * @returns Object containing all three layer volumes
   *
   * @example
   * ```ts
   * const { layer1, layer2, layer3 } = this.getAllVolumes();
   * layer1.clear();
   * ```
   */
  getAllVolumes(): INewMaskData {
    return this.protectedData.maskData.volumes;
  }

  // ───────────────────────────────────────────────────────────────────────

  private generateCanvases() {
    const canvasArr: Array<HTMLCanvasElement> = [];
    for (let i = 0; i < 8; i++) {
      const canvas = document.createElement("canvas");
      canvasArr.push(canvas);
    }
    return canvasArr;
  }

  /**
   * Rewrite this {clearPaint} function under DrawToolCore
   */
  clearPaint() {
    throw new Error(
      "Child class must implement abstract clearPaint, currently you can find it in DrawToolCore."
    );
  }
  /**
   * Rewrite this {undoLastPainting} function under DrawToolCore
   */
  undoLastPainting() {
    throw new Error(
      "Child class must implement abstract undoLastPainting, currently you can find it in DrawToolCore."
    );
  }
  /**
   * Rewrite this {clearStoreImages} function under NrrdTools
   */
  clearStoreImages() {
    throw new Error(
      "Child class must implement abstract clearStoreImages, currently you can find it in NrrdTools."
    );
  }
  /**
   * Rewrite this {createEmptyPaintImage} function under NrrdTools
   */
  createEmptyPaintImage(
    dimensions: Array<number>,
    paintImages: IPaintImages
  ) {
    throw new Error(
      "Child class must implement abstract clearStoreImages, currently you can find it in NrrdTools."
    );
  }
  /**
   * Rewrite this {resizePaintArea} function under NrrdTools
   */
  resizePaintArea(factor: number) {
    throw new Error(
      "Child class must implement abstract resizePaintArea, currently you can find it in NrrdTools."
    );
  }
  /**
   * Rewrite this {setIsDrawFalse} function under NrrdTools
   */
  setIsDrawFalse(target: number) {
    throw new Error(
      "Child class must implement abstract setIsDrawFalse, currently you can find it in NrrdTools."
    );
  }
  /**
   * Rewrite this {updateOriginAndChangedWH} function under NrrdTools
   */
  updateOriginAndChangedWH() {
    throw new Error(
      "Child class must implement abstract updateOriginAndChangedWH, currently you can find it in NrrdTools."
    );
  }
  /**
   * Rewrite this {flipDisplayImageByAxis} function under NrrdTools
   */
  flipDisplayImageByAxis() {
    throw new Error(
      "Child class must implement abstract flipDisplayImageByAxis, currently you can find it in NrrdTools."
    );
  }
  /**
   * Rewrite this {resetPaintAreaUIPosition} function under NrrdTools
   */
  resetPaintAreaUIPosition(l?: number, t?: number) {
    throw new Error(
      "Child class must implement abstract resetPaintAreaUIPosition, currently you can find it in NrrdTools."
    );
  }
  /**
   * Rewrite this {resetPaintAreaUIPosition} function under NrrdTools
   */
  setEmptyCanvasSize(axis?: "x" | "y" | "z") {
    throw new Error(
      "Child class must implement abstract setEmptyCanvasSize, currently you can find it in NrrdTools."
    );
  }
  /**
   * Rewrite this {convertCursorPoint} function under NrrdTools
   */
  convertCursorPoint(
    from: "x" | "y" | "z",
    to: "x" | "y" | "z",
    cursorNumX: number,
    cursorNumY: number,
    currentSliceIndex: number
  ): IConvertObjType | undefined {
    throw new Error(
      "Child class must implement abstract convertCursorPoint, currently you can find it in NrrdTools."
    );
  }
  /**
   * Rewrite this {resetLayerCanvas} function under NrrdTools
   */
  resetLayerCanvas() {
    throw new Error(
      "Child class must implement abstract resetLayerCanvas, currently you can find it in NrrdTools."
    );
  }
  /**
   * Rewrite this {setSyncsliceNum} function under NrrdTools
   */
  setSyncsliceNum() {
    throw new Error(
      "Child class must implement abstract setSyncsliceNum, currently you can find it in NrrdTools."
    );
  }
  /**
   * Rewrite this {redrawDisplayCanvas} function under NrrdTools
   */
  redrawDisplayCanvas() {
    throw new Error(
      "Child class must implement abstract redrawDisplayCanvas, currently you can find it in NrrdTools."
    );
  }

  /**
   * Get a painted mask image (IPaintImage) based on current axis and input slice index.
   *
   * Phase 2: Primary path reads from MaskVolume using getSliceRawImageData
   * for lossless RGBA round-trip with caching; falls back to legacy IPaintImages.
   *
   * @param axis "x" | "y" | "z"
   * @param sliceIndex number
   * @param paintedImages IPaintImages, All painted mask images.
   * @returns IPaintImage with the mask for the given slice, or undefined if not found
   */
  filterDrawedImage(
    axis: "x" | "y" | "z",
    sliceIndex: number,
    paintedImages: IPaintImages
  ): IPaintImage | undefined {
    // Primary: read raw RGBA from MaskVolume (lossless round-trip) with caching
    try {
      const volume = this.getCurrentVolume();

      if (volume) {
        // Check cache first
        const cacheKey = `${this.gui_states.layer}_${axis}_${sliceIndex}`;
        let imageData = this.sliceImageCache.get(cacheKey);

        if (!imageData) {
          imageData = volume.getSliceRawImageData(sliceIndex, axis);
          this.sliceImageCache.set(cacheKey, imageData);
        }

        return { index: sliceIndex, image: imageData };
      }
    } catch (err) {
      // Volume not ready or slice out of bounds — fall through to legacy path
    }

    // Fallback: legacy IPaintImages lookup
    const legacyResult = paintedImages[axis].filter((item) => {
      return item.index === sliceIndex;
    })[0];
    return legacyResult;
  }

  private hasNonZeroPixels(imageData: ImageData): boolean {
    const data = imageData.data;
    // Quick check: only scan first 256 pixels for performance
    const limit = Math.min(256 * 4, data.length);
    for (let i = 0; i < limit; i += 4) {
      if (data[i] !== 0 || data[i+1] !== 0 || data[i+2] !== 0 || data[i+3] !== 0) {
        return true;
      }
    }
    return false;
  }

  /**
   * Clear the cache for a specific slice when it's modified.
   * Called after drawing operations to ensure fresh data on next read.
   *
   * @param layer - Layer name: "layer1", "layer2", or "layer3"
   * @param axis - Axis: "x", "y", or "z"
   * @param sliceIndex - Slice index
   */
  clearSliceCache(layer: string, axis: "x" | "y" | "z", sliceIndex: number): void {
    const cacheKey = `${layer}_${axis}_${sliceIndex}`;
    this.sliceImageCache.delete(cacheKey);
  }

  /**
   * Clear all cached slice images.
   * Called when clearing all masks or switching datasets.
   */
  clearAllSliceCache(): void {
    if (this._prewarmTimer !== undefined) {
      clearTimeout(this._prewarmTimer);
      this._prewarmTimer = undefined;
    }
    this.sliceImageCache.clear();
  }

  /**
   * Pre-warm the slice cache for a given axis in the background.
   * Uses setTimeout(0) batches to avoid blocking the UI thread.
   *
   * @param axis - Axis to pre-warm: "x", "y", or "z"
   */
  prewarmCacheForAxis(axis: "x" | "y" | "z"): void {
    // Cancel any pending pre-warm
    if (this._prewarmTimer !== undefined) {
      clearTimeout(this._prewarmTimer);
      this._prewarmTimer = undefined;
    }

    const layers = ["layer1", "layer2", "layer3"] as const;
    let maxSlice: number;
    try {
      const vol = this.getVolumeForLayer("layer1");
      const dims = vol.getDimensions();
      maxSlice = axis === "x" ? dims.width : axis === "y" ? dims.height : dims.depth;
    } catch {
      return; // Volume not ready
    }

    if (maxSlice <= 1) return;

    const BATCH_SIZE = 10;
    let current = 0;

    const warmBatch = () => {
      const end = Math.min(current + BATCH_SIZE, maxSlice);
      for (let s = current; s < end; s++) {
        for (const layer of layers) {
          const cacheKey = `${layer}_${axis}_${s}`;
          if (!this.sliceImageCache.has(cacheKey)) {
            try {
              const volume = this.getVolumeForLayer(layer);
              if (volume) {
                const imageData = volume.getSliceRawImageData(s, axis);
                this.sliceImageCache.set(cacheKey, imageData);
              }
            } catch { /* skip invalid slices */ }
          }
        }
      }
      current = end;
      if (current < maxSlice) {
        this._prewarmTimer = setTimeout(warmBatch, 0);
      } else {
        this._prewarmTimer = undefined;
      }
    };

    this._prewarmTimer = setTimeout(warmBatch, 0);
  }

  /**
   * Get cached slice ImageData for a specific layer.
   * Public method for tools to access cached slice data.
   *
   * @param layer - Layer name: "layer1", "layer2", or "layer3"
   * @param axis - Axis: "x", "y", or "z"
   * @param sliceIndex - Slice index
   * @returns Cached ImageData or newly created ImageData
   */
  getCachedSliceImageData(
    layer: string,
    axis: "x" | "y" | "z",
    sliceIndex: number
  ): ImageData | null {
    const cacheKey = `${layer}_${axis}_${sliceIndex}`;

    // Check cache first
    let imageData = this.sliceImageCache.get(cacheKey);

    if (imageData) {
      return imageData;
    }

    // Cache miss - read from volume
    try {
      const volume = this.getVolumeForLayer(layer);
      if (volume) {
        imageData = volume.getSliceRawImageData(sliceIndex, axis);
        // Store in cache
        this.sliceImageCache.set(cacheKey, imageData);
        return imageData;
      }
    } catch (err) {
      console.warn(`Failed to get cached slice data for ${layer} ${axis} ${sliceIndex}:`, err);
    }

    return null;
  }
}
