import {
  nrrdSliceType,
  exportPaintImageType,
  storeExportPaintImageType,
  loadingBarType,
} from "../../types/types";
import { GUI } from "dat.gui";
import { setupGui } from "./coreTools/gui";

import { autoFocusDiv } from "./coreTools/divControlTools";
import {
  IPaintImage,
  IPaintImages,
  IStoredPaintImages,
  ISkipSlicesDictType,
  IMaskData,
  IDragOpts,
  IGuiParameterSettings
} from "./coreTools/coreType";
import { DragOperator } from "./DragOperator";
import { DrawToolCore } from "./DrawToolCore";
import { MaskVolume } from "./core";

export class NrrdTools extends DrawToolCore {
  container: HTMLDivElement;

  // A base conatainer to append displayCanvas and drawingCanvas
  dragOperator: DragOperator;
  storedPaintImages: IStoredPaintImages | undefined;

  private paintedImage: IPaintImage | undefined;

  private initState: boolean = true;
  private preTimer: any;
  private guiParameterSettings: IGuiParameterSettings | undefined;
  private _sliceRAFId: number | null = null;
  private _pendingSliceStep: number = 0;

  constructor(container: HTMLDivElement) {
    super(container);
    this.container = container;

    // Phase 3: storedPaintImages removed (legacy ImageData storage no longer used)

    this.protectedData.previousDrawingImage =
      this.protectedData.ctxes.emptyCtx.createImageData(1, 1);
    this.init();
    this.dragOperator = new DragOperator(
      this.container,
      this.nrrd_states,
      this.gui_states,
      this.protectedData,
      this.drawingPrameters,
      this.setSyncsliceNum.bind(this),
      this.setIsDrawFalse.bind(this),
      this.flipDisplayImageByAxis.bind(this),
      this.setEmptyCanvasSize.bind(this),
      this.getCachedSliceImageData.bind(this)
    );

    // Inject EventRouter into DragOperator for centralized event handling
    if (this.eventRouter) {
      this.dragOperator.setEventRouter(this.eventRouter);
    }
  }

  /**
   * core function for drag slices
   * @param opts
   */
  drag(opts?: IDragOpts) {
    this.dragOperator.drag(opts);
  }
  // draw(opts?: IDrawOpts) {
  //   this.drawOperator.draw(opts);
  // }
  // start() {
  //   console.log(this.drawOperator.start);

  //   return this.drawOperator.start;
  // }

  /**
   * Set the Draw Display Canvas base size
   * @param size number
   */
  setBaseDrawDisplayCanvasesSize(size: number) {
    if (size > 8) {
      this.baseCanvasesSize = 8;
    } else if (size < 1 || typeof size !== "number") {
      this.baseCanvasesSize = 1;
    } else {
      this.baseCanvasesSize = size;
    }
  }

  setDisplaySliceIndexPanel(panel: HTMLDivElement) {
    this.dragOperator.setShowDragNumberDiv(panel);
  }

  /**
   * Enable the drag function for contrast images window center and window high.
   * @param callback 
   */
  enableContrastDragEvents(callback: (step: number, towards: "horizental" | "vertical") => void) {
    this.setupConrastEvents(callback)
  }

  /**
   * Set up GUI for drawing panel
   * @param gui GUI
   */
  setupGUI(gui: GUI) {
    let modeFolder: GUI;
    modeFolder = gui.addFolder("Mode Parameters");
    const guiOptions = {
      modeFolder,
      dragOperator: this.dragOperator,
      gui_states: this.gui_states,
      nrrd_states: this.nrrd_states,
      drawingCanvas: this.protectedData.canvases.drawingCanvas,
      drawingPrameters: this.drawingPrameters,
      eraserUrls: this.eraserUrls,
      pencilUrls: this.pencilUrls,
      mainPreSlices: this.protectedData.mainPreSlices,
      protectedData: this.protectedData,
      removeDragMode: this.dragOperator.removeDragMode,
      configDragMode: this.dragOperator.configDragMode,
      clearPaint: this.clearPaint,
      clearStoreImages: this.clearStoreImages,
      updateSlicesContrast: this.updateSlicesContrast,
      setMainAreaSize: this.setMainAreaSize,
      resetPaintAreaUIPosition: this.resetPaintAreaUIPosition,
      resizePaintArea: this.resizePaintArea,
      repraintCurrentContrastSlice: this.repraintCurrentContrastSlice,
      setSyncsliceNum: this.setSyncsliceNum,
      resetLayerCanvas: this.resetLayerCanvas,
      redrawDisplayCanvas: this.redrawDisplayCanvas,
      reloadMaskToLayer: this.reloadMaskToLayer,
      flipDisplayImageByAxis: this.flipDisplayImageByAxis,
      filterDrawedImage: this.filterDrawedImage,
      setEmptyCanvasSize: this.setEmptyCanvasSize,
      storeAllImages: this.storeAllImages,
      drawImageOnEmptyImage: this.drawImageOnEmptyImage,
      checkSharedPlaceSlice: this.checkSharedPlaceSlice,
      replaceArray: this.replaceArray,
      findSliceInSharedPlace: this.findSliceInSharedPlace,
      sliceArrayH: this.sliceArrayH,
      sliceArrayV: this.sliceArrayV,
      storeImageToAxis: this.storeImageToAxis,
      replaceVerticalColPixels: this.replaceVerticalColPixels,
      replaceHorizontalRowPixels: this.replaceHorizontalRowPixels,
      storeEachLayerImage: this.storeEachLayerImage,
      storeImageToLayer: this.storeImageToLayer,
      getRestLayer: this.getRestLayer,
      setIsDrawFalse: this.setIsDrawFalse,
      // initPaintImages: this.initPaintImages,
      // createEmptyPaintImage: this.createEmptyPaintImage,
    };
    this.guiParameterSettings = setupGui(guiOptions);
  }

  getGuiSettings() {
    if (!!this.guiParameterSettings) {
      // update image volume
      this.guiParameterSettings.windowHigh.value = this.guiParameterSettings.windowLow.value = this.protectedData.mainPreSlices.volume;
      this.guiParameterSettings.windowHigh.max = this.guiParameterSettings.windowLow.max = this.protectedData.mainPreSlices.volume.max;
      this.guiParameterSettings.windowHigh.min = this.guiParameterSettings.windowLow.min = this.protectedData.mainPreSlices.volume.min;
    }

    return {
      guiState: this.gui_states,
      guiSetting: this.guiParameterSettings,
    };
  }

  /**
   * A initialise function for nrrd_tools
   */
  private init() {
    this.protectedData.mainAreaContainer.classList.add(
      "copper3D_drawingCanvasContainer"
    );
    this.container.appendChild(this.protectedData.mainAreaContainer);
    autoFocusDiv(this.container);

    this.setShowInMainArea();
  }

  /**
   *
   * entry function
   *   * {
   *    x:slice,
   *    y:slice,
   *    z:slice
   * }
   *
   * @param allSlices - all nrrd contrast slices
 
   */
  setAllSlices(allSlices: Array<nrrdSliceType>) {
    this.protectedData.allSlicesArray = [...allSlices];

    const randomSlice = this.protectedData.allSlicesArray[0];
    this.nrrd_states.nrrd_x_mm = randomSlice.z.canvas.width;
    this.nrrd_states.nrrd_y_mm = randomSlice.z.canvas.height;
    this.nrrd_states.nrrd_z_mm = randomSlice.x.canvas.width;
    this.nrrd_states.nrrd_x_pixel = randomSlice.x.volume.dimensions[0];
    this.nrrd_states.nrrd_y_pixel = randomSlice.x.volume.dimensions[1];
    this.nrrd_states.nrrd_z_pixel = randomSlice.x.volume.dimensions[2];

    this.nrrd_states.voxelSpacing = randomSlice.x.volume.spacing;
    this.nrrd_states.ratios.x = randomSlice.x.volume.spacing[0];
    this.nrrd_states.ratios.y = randomSlice.x.volume.spacing[1];
    this.nrrd_states.ratios.z = randomSlice.x.volume.spacing[2];
    this.nrrd_states.dimensions = randomSlice.x.volume.dimensions;

    // Phase 2 Day 9: Re-initialize MaskVolume with real NRRD dimensions.
    // This replaces the 1×1×1 placeholders from CommToolsData constructor
    // and "turns on" all Day 7/8 volume read/write paths.
    // Clear stale cache from previous case before creating new volumes
    this.clearAllSliceCache();
    const [vw, vh, vd] = this.nrrd_states.dimensions;
    this.protectedData.maskData.volumes = {
      layer1: new MaskVolume(vw, vh, vd, 4),
      layer2: new MaskVolume(vw, vh, vd, 4),
      layer3: new MaskVolume(vw, vh, vd, 4),
    };
    // Pre-warm cache for the default axis (z) in the background
    this.prewarmCacheForAxis(this.protectedData.axis);

    this.nrrd_states.spaceOrigin = (
      randomSlice.x.volume.header.space_origin as number[]
    ).map((item) => {
      return item * 1;
    }) as [];

    this.protectedData.allSlicesArray.forEach((item, index) => {
      item.x.contrastOrder = index;
      item.y.contrastOrder = index;
      item.z.contrastOrder = index;
    });

    this.nrrd_states.sharedPlace.x = this.getSharedPlace(
      this.nrrd_states.dimensions[0],
      this.nrrd_states.ratios.x
    );
    this.nrrd_states.sharedPlace.y = this.getSharedPlace(
      this.nrrd_states.dimensions[1],
      this.nrrd_states.ratios.y
    );
    this.nrrd_states.sharedPlace.z = this.getSharedPlace(
      this.nrrd_states.dimensions[2],
      this.nrrd_states.ratios.z
    );

    // Phase 3: initPaintImages removed (MaskVolume initialized separately)
    // this.initPaintImages(this.nrrd_states.dimensions);

    // init displayslices array, the axis default is "z"
    this.setDisplaySlicesBaseOnAxis();
    this.afterLoadSlice();
  }

  private loadingMaskByLayer(
    masks: exportPaintImageType[],
    index: number,
    imageData: ImageData
  ) {
    let imageDataLable = this.protectedData.ctxes.emptyCtx.createImageData(
      this.nrrd_states.nrrd_x_pixel,
      this.nrrd_states.nrrd_y_pixel
    );
    this.setEmptyCanvasSize();
    for (let j = 0; j < masks[index].data.length; j++) {
      imageDataLable.data[j] = masks[index].data[j];
      imageData.data[j] += masks[index].data[j];
    }
    return imageDataLable;
  }

  setMasksData(
    masksData: storeExportPaintImageType,
    loadingBar?: loadingBarType
  ) {
    console.log("setMask data", masksData);
    
    if (!!masksData) {
      this.nrrd_states.loadMaskJson = true;
      if (loadingBar) {
        let { loadingContainer, progress } = loadingBar;
        loadingContainer.style.display = "flex";
        progress.innerText = "Loading masks data......";
      }

      this.setEmptyCanvasSize();

      const len = masksData["layer1"].length;
      for (let i = 0; i < len; i++) {
        let imageData = this.protectedData.ctxes.emptyCtx.createImageData(
          this.nrrd_states.nrrd_x_pixel,
          this.nrrd_states.nrrd_y_pixel
        );
        let imageDataLayer1, imageDataLayer2, imageDataLayer3;
        if (masksData["layer1"][i].data.length > 0) {
          this.setEmptyCanvasSize();
          imageDataLayer1 = this.loadingMaskByLayer(
            masksData["layer1"],
            i,
            imageData
          );
          this.protectedData.ctxes.emptyCtx.putImageData(imageDataLayer1, 0, 0);
          this.storeEachLayerImage(i, "layer1");
        }
        if (masksData["layer2"][i].data.length > 0) {
          this.setEmptyCanvasSize();
          imageDataLayer2 = this.loadingMaskByLayer(
            masksData["layer2"],
            i,
            imageData
          );
          this.protectedData.ctxes.emptyCtx.putImageData(imageDataLayer2, 0, 0);
          this.storeEachLayerImage(i, "layer2");
        }
        if (masksData["layer3"][i].data.length > 0) {
          this.setEmptyCanvasSize();
          imageDataLayer3 = this.loadingMaskByLayer(
            masksData["layer3"],
            i,
            imageData
          );
          this.protectedData.ctxes.emptyCtx.putImageData(imageDataLayer3, 0, 0);
          this.storeEachLayerImage(i, "layer3");
        }
        this.setEmptyCanvasSize();
        this.protectedData.ctxes.emptyCtx.putImageData(imageData, 0, 0);
        this.storeAllImages(i, "default");
      }

      this.nrrd_states.loadMaskJson = false;
      this.gui_states.resetZoom();
      if (loadingBar) {
        loadingBar.loadingContainer.style.display = "none";
      }
    }
  }

  private setShowInMainArea() {
    this.nrrd_states.showContrast = true;
  }

  getCurrentImageDimension() {
    return this.nrrd_states.dimensions;
  }

  getVoxelSpacing() {
    return this.nrrd_states.voxelSpacing;
  }
  getSpaceOrigin() {
    return this.nrrd_states.spaceOrigin;
  }
  getMaskData(): IMaskData {
    console.log("getMaskData:", this.protectedData.maskData);

    return this.protectedData.maskData;
  }

  // set calculate distance sphere position
  setCalculateDistanceSphere(x: number, y: number, sliceIndex: number, cal_position: "tumour" | "skin" | "nipple" | "ribcage") {
    this.nrrd_states.sphereRadius = 5;

    // move to tumour slice
    const steps = sliceIndex - this.nrrd_states.currentIndex;
    this.setSliceMoving(steps * this.protectedData.displaySlices.length)

    // mock mouse down
    // if user zoom the panel, we need to consider the size factor 
    this.drawCalSphereDown(x * this.nrrd_states.sizeFoctor, y * this.nrrd_states.sizeFoctor, sliceIndex, cal_position);
    // mock mouse up
    this.drawCalSphereUp()

  }

  private getSharedPlace(len: number, ratio: number): number[] {
    let old = -1;
    let same: number[] = [];
    let temp = new Set<number>();
    for (let i = 0; i < len; i++) {
      const index = Math.floor(i * ratio);
      if (index === old) {
        temp.add(i - 1);
        temp.add(i);
      } else {
        old = index;
      }
    }

    temp.forEach((value) => {
      same.push(value);
    });
    return same;
  }

  /**
   * init all painted images for store images
   * @param dimensions
   */

  // private initPaintImages(dimensions: Array<number>) {
  //   this.createEmptyPaintImage(
  //     dimensions,
  //     this.protectedData.maskData.paintImages
  //   );
  //   this.createEmptyPaintImage(
  //     dimensions,
  //     this.protectedData.maskData.paintImagesLayer1
  //   );
  //   this.createEmptyPaintImage(
  //     dimensions,
  //     this.protectedData.maskData.paintImagesLayer2
  //   );
  //   this.createEmptyPaintImage(
  //     dimensions,
  //     this.protectedData.maskData.paintImagesLayer3
  //   );
  // }

  // createEmptyPaintImage(
  //   dimensions: Array<number>,
  //   paintImages: IPaintImages
  // ) {
  //   for (let i = 0; i < dimensions[0]; i++) {
  //     const markImage_x = this.protectedData.ctxes.emptyCtx.createImageData(
  //       this.nrrd_states.nrrd_z_pixel,
  //       this.nrrd_states.nrrd_y_pixel
  //     );
  //     const initMark_x: IPaintImage = {
  //       index: i,
  //       image: markImage_x,
  //     };
  //     paintImages.x.push(initMark_x);
  //   }
  //   // for y slices' marks
  //   for (let i = 0; i < dimensions[1]; i++) {
  //     const markImage_y = this.protectedData.ctxes.emptyCtx.createImageData(
  //       this.nrrd_states.nrrd_x_pixel,
  //       this.nrrd_states.nrrd_z_pixel
  //     );
  //     const initMark_y: IPaintImage = {
  //       index: i,
  //       image: markImage_y,
  //     };
  //     paintImages.y.push(initMark_y);
  //   }
  //   // for z slices' marks
  //   for (let i = 0; i < dimensions[2]; i++) {
  //     const markImage_z = this.protectedData.ctxes.emptyCtx.createImageData(
  //       this.nrrd_states.nrrd_x_pixel,
  //       this.nrrd_states.nrrd_y_pixel
  //     );
  //     const initMark_z: IPaintImage = {
  //       index: i,
  //       image: markImage_z,
  //     };
  //     paintImages.z.push(initMark_z);
  //   }
  // }

  /**
   * Switch all contrast slices' orientation
   * @param {string} aixs:"x" | "y" | "z"
   *  */
  setSliceOrientation(axisTo: "x" | "y" | "z") {
    let convetObj;
    console.log("switch to axis:", axisTo);
    if (this.nrrd_states.enableCursorChoose || this.gui_states.sphere) {
      if (this.protectedData.axis === "z") {
        this.cursorPage.z.index = this.nrrd_states.currentIndex;
        this.cursorPage.z.cursorPageX = this.nrrd_states.cursorPageX;
        this.cursorPage.z.cursorPageY = this.nrrd_states.cursorPageY;
      } else if (this.protectedData.axis === "x") {
        this.cursorPage.x.index = this.nrrd_states.currentIndex;
        this.cursorPage.x.cursorPageX = this.nrrd_states.cursorPageX;
        this.cursorPage.x.cursorPageY = this.nrrd_states.cursorPageY;
      } else if (this.protectedData.axis === "y") {
        this.cursorPage.y.index = this.nrrd_states.currentIndex;
        this.cursorPage.y.cursorPageX = this.nrrd_states.cursorPageX;
        this.cursorPage.y.cursorPageY = this.nrrd_states.cursorPageY;
      }
      if (axisTo === "z") {
        if (this.nrrd_states.isCursorSelect && !this.cursorPage.z.updated) {
          if (this.protectedData.axis === "x") {
            // convert x to z
            convetObj = this.convertCursorPoint(
              "x",
              "z",
              this.cursorPage.x.cursorPageX,
              this.cursorPage.x.cursorPageY,
              this.cursorPage.x.index
            );
          }
          if (this.protectedData.axis === "y") {
            // convert y to z
            convetObj = this.convertCursorPoint(
              "y",
              "z",
              this.cursorPage.y.cursorPageX,
              this.cursorPage.y.cursorPageY,
              this.cursorPage.y.index
            );
          }
        } else {
          // not cursor select, freedom to switch x -> z or y -> z and z -> x or z -> y
          this.nrrd_states.currentIndex = this.cursorPage.z.index;
          this.nrrd_states.oldIndex =
            this.cursorPage.z.index * this.nrrd_states.ratios.z;
          this.nrrd_states.cursorPageX = this.cursorPage.z.cursorPageX;
          this.nrrd_states.cursorPageY = this.cursorPage.z.cursorPageY;
        }
      } else if (axisTo === "x") {
        if (this.nrrd_states.isCursorSelect && !this.cursorPage.x.updated) {

          if (this.protectedData.axis === "z") {
            // convert z to x
            convetObj = this.convertCursorPoint(
              "z",
              "x",
              this.cursorPage.z.cursorPageX,
              this.cursorPage.z.cursorPageY,
              this.cursorPage.z.index
            );
          }

          if (this.protectedData.axis === "y") {
            // convert y to x
            convetObj = this.convertCursorPoint(
              "y",
              "x",
              this.cursorPage.y.cursorPageX,
              this.cursorPage.y.cursorPageY,
              this.cursorPage.y.index
            );
          }
        } else {
          // not cursor select, freedom to switch z -> x or y -> x and x -> z or x -> y
          this.nrrd_states.currentIndex = this.cursorPage.x.index;
          this.nrrd_states.oldIndex =
            this.cursorPage.x.index * this.nrrd_states.ratios.x;
          this.nrrd_states.cursorPageX = this.cursorPage.x.cursorPageX;
          this.nrrd_states.cursorPageY = this.cursorPage.x.cursorPageY;
        }
      } else if (axisTo === "y") {
        if (this.nrrd_states.isCursorSelect && !this.cursorPage.y.updated) {
          if (this.protectedData.axis === "z") {
            // convert z to y
            convetObj = this.convertCursorPoint(
              "z",
              "y",
              this.cursorPage.z.cursorPageX,
              this.cursorPage.z.cursorPageY,
              this.cursorPage.z.index
            );
          }
          if (this.protectedData.axis === "x") {
            // convert x to y
            convetObj = this.convertCursorPoint(
              "x",
              "y",
              this.cursorPage.x.cursorPageX,
              this.cursorPage.x.cursorPageY,
              this.cursorPage.x.index
            );
          }
        } else {
          // not cursor select, freedom to switch z -> y or x -> y and y -> z or y -> x
          this.nrrd_states.currentIndex = this.cursorPage.y.index;
          this.nrrd_states.oldIndex =
            this.cursorPage.y.index * this.nrrd_states.ratios.y;
          this.nrrd_states.cursorPageX = this.cursorPage.y.cursorPageX;
          this.nrrd_states.cursorPageY = this.cursorPage.y.cursorPageY;
        }
      }

      if (convetObj) {
        // update convert cursor point, when cursor select
        this.nrrd_states.currentIndex = convetObj.currentIndex;
        this.nrrd_states.oldIndex = convetObj.oldIndex;
        this.nrrd_states.cursorPageX = convetObj.convertCursorNumX;
        this.nrrd_states.cursorPageY = convetObj.convertCursorNumY;

        convetObj = undefined;
        switch (axisTo) {
          case "x":
            this.cursorPage.x.updated = true;
            break;
          case "y":
            this.cursorPage.y.updated = true;
            break;
          case "z":
            this.cursorPage.z.updated = true;
            break;
        }
      }

      if (
        this.cursorPage.x.updated &&
        this.cursorPage.y.updated &&
        this.cursorPage.z.updated
      ) {
        // one point convert to all axis, reset all updated status
        this.nrrd_states.isCursorSelect = false;
      }
    }

    this.protectedData.axis = axisTo;
    this.resetDisplaySlicesStatus();
    // Pre-warm cache for the new axis in the background
    this.prewarmCacheForAxis(axisTo);
    // for sphere plan a
    if (this.gui_states.sphere && !this.nrrd_states.spherePlanB) {
      this.drawSphere(
        this.nrrd_states.sphereOrigin[axisTo][0] * this.nrrd_states.sizeFoctor,
        this.nrrd_states.sphereOrigin[axisTo][1] * this.nrrd_states.sizeFoctor,
        this.nrrd_states.sphereRadius
      );
    }
  }

  addSkip(index: number) {
    this.protectedData.skipSlicesDic[index] =
      this.protectedData.backUpDisplaySlices[index];
    if (index >= this.protectedData.displaySlices.length) {
      this.nrrd_states.contrastNum = this.protectedData.displaySlices.length;
    } else {
      this.nrrd_states.contrastNum = index;
    }

    this.resetDisplaySlicesStatus();
  }

  removeSkip(index: number) {
    this.protectedData.skipSlicesDic[index] = undefined;
    this.nrrd_states.contrastNum = 0;
    this.resetDisplaySlicesStatus();
  }

  clear() {
    // To effectively reduce the js memory garbage
    this.protectedData.allSlicesArray.length = 0;
    this.protectedData.displaySlices.length = 0;
    this.undoArray.length = 0;

    // Phase 3: Reset MaskVolume storage to 1×1×1 placeholders
    this.protectedData.maskData.volumes = {
      layer1: new MaskVolume(1, 1, 1, 4),
      layer2: new MaskVolume(1, 1, 1, 4),
      layer3: new MaskVolume(1, 1, 1, 4),
    };

    // Clear slice cache
    this.clearAllSliceCache();

    this.clearDictionary(this.protectedData.skipSlicesDic);

    // this.nrrd_states.previousPanelL = this.nrrd_states.previousPanelT = -99999;
    this.protectedData.canvases.displayCanvas.style.left =
      this.protectedData.canvases.drawingCanvas.style.left = "";
    this.protectedData.canvases.displayCanvas.style.top =
      this.protectedData.canvases.drawingCanvas.style.top = "";

    this.protectedData.backUpDisplaySlices.length = 0;
    this.protectedData.mainPreSlices = undefined;
    this.protectedData.currentShowingSlice = undefined;
    this.protectedData.previousDrawingImage =
      this.protectedData.ctxes.emptyCtx.createImageData(1, 1);
    this.initState = true;
    this.protectedData.axis = "z";
    this.nrrd_states.sizeFoctor = this.baseCanvasesSize;
    this.gui_states.mainAreaSize = this.baseCanvasesSize;
    this.resetLayerCanvas();
    this.protectedData.canvases.drawingCanvas.width =
      this.protectedData.canvases.drawingCanvas.width;
    this.protectedData.canvases.displayCanvas.width =
      this.protectedData.canvases.displayCanvas.width;

    this.nrrd_states.tumourSphereOrigin = null;
    this.nrrd_states.ribSphereOrigin = null;
    this.nrrd_states.skinSphereOrigin = null;
    this.nrrd_states.nippleSphereOrigin = null;
  }

  setSliceMoving(step: number) {
    if (this.protectedData.mainPreSlices) {
      // Accumulate steps so no keydown events are lost
      this._pendingSliceStep += step;

      // RAF throttle: render at most once per frame, but apply ALL accumulated steps
      if (this._sliceRAFId !== null) return;

      this._sliceRAFId = requestAnimationFrame(() => {
        this._sliceRAFId = null;
        const totalStep = this._pendingSliceStep;
        this._pendingSliceStep = 0;

        this.protectedData.Is_Draw = true;
        this.setSyncsliceNum();
        this.dragOperator.updateIndex(totalStep);
        this.setIsDrawFalse(1000);
      });
    }
  }

  setMainAreaSize(factor: number) {
    this.nrrd_states.sizeFoctor = factor;

    if (this.nrrd_states.sizeFoctor >= 8) {
      this.nrrd_states.sizeFoctor = 8;
    } else if (this.nrrd_states.sizeFoctor <= 1) {
      this.nrrd_states.sizeFoctor = 1;
    }
    this.resizePaintArea(this.nrrd_states.sizeFoctor);
    this.resetPaintAreaUIPosition();
    // this.setIsDrawFalse(1000);
  }

  getContainer() {
    return this.protectedData.mainAreaContainer;
  }
  getDrawingCanvas() {
    return this.protectedData.canvases.drawingCanvas;
  }
  getNrrdToolsSettings() {
    return this.nrrd_states;
  }

  getMaxSliceNum(): number[] {
    if (this.nrrd_states.showContrast) {
      return [
        this.nrrd_states.maxIndex,
        this.nrrd_states.maxIndex * this.protectedData.displaySlices.length,
      ];
    } else {
      return [this.nrrd_states.maxIndex];
    }
  }
  getCurrentSlicesNumAndContrastNum() {
    return {
      currentIndex: this.nrrd_states.currentIndex,
      contrastIndex: this.nrrd_states.contrastNum,
    };
  }

  getCurrentSliceIndex() {
    return Math.ceil(
      this.protectedData.mainPreSlices.index / this.nrrd_states.RSARatio
    );
  }

  getIsShowContrastState() {
    return this.nrrd_states.showContrast;
  }

  /**
   * Give a delay time to finish the last drawing before upcoming interrupt opreations.
   * Give a delay time number (ms) to disable the draw function,
   * After your interrupt opeartion, you should enable the draw fucntion.
   * @param target number
   */
  setIsDrawFalse(target: number) {
    this.preTimer = setTimeout(() => {
      this.protectedData.Is_Draw = false;
      if (this.preTimer) {
        window.clearTimeout(this.preTimer);
        this.preTimer = undefined;
      }
    }, target);
  }

  private setDisplaySlicesBaseOnAxis() {
    this.protectedData.displaySlices.length = 0;
    this.protectedData.backUpDisplaySlices.length = 0;

    this.protectedData.allSlicesArray.forEach((slices) => {
      this.protectedData.backUpDisplaySlices.push(
        slices[this.protectedData.axis]
      );
    });

    this.loadDisplaySlicesArray();
  }

  private loadDisplaySlicesArray() {
    const remainSlices = Object.values(this.protectedData.skipSlicesDic);
    if (remainSlices.length === 0) {
      // load all display slices
      this.protectedData.backUpDisplaySlices.forEach((slice, index) => {
        this.protectedData.skipSlicesDic[index] = slice;
        this.protectedData.displaySlices.push(slice);
      });
    } else {
      remainSlices.forEach((slice, index) => {
        if (!!slice) {
          this.protectedData.displaySlices.push(
            this.protectedData.backUpDisplaySlices[index]
          );
          this.protectedData.skipSlicesDic[index] =
            this.protectedData.backUpDisplaySlices[index];
        }
      });
    }
  }

  switchAllSlicesArrayData(allSlices: Array<nrrdSliceType>) {
    this.protectedData.allSlicesArray.length = 0;
    this.protectedData.allSlicesArray = [...allSlices];
    this.resetDisplaySlicesStatus();
  }

  private resetDisplaySlicesStatus() {
    // reload slice data
    this.setDisplaySlicesBaseOnAxis();
    // reset canvas attribute for drag and draw
    this.setupConfigs();
  }

  private setupConfigs() {
    // reset main slice
    this.setMainPreSlice();
    // update the max index for drag and slider
    this.updateMaxIndex();
    // reset origin canvas and the nrrd_states origin Width/height
    // reset the current index
    this.setOriginCanvasAndPre();
    // update the show number div on top area
    this.dragOperator.updateShowNumDiv(this.nrrd_states.contrastNum);
    // repaint all contrast images
    this.repraintCurrentContrastSlice();
    // resize the draw/drawOutLayer/display canvas size
    this.resizePaintArea(this.nrrd_states.sizeFoctor);
    this.resetPaintAreaUIPosition();
  }

  private setMainPreSlice() {
    this.protectedData.mainPreSlices = this.protectedData.displaySlices[0];
    if (this.protectedData.mainPreSlices) {
      this.nrrd_states.RSARatio = this.protectedData.mainPreSlices.RSARatio;
    }
  }

  private setOriginCanvasAndPre() {
    if (this.protectedData.mainPreSlices) {
      if (this.nrrd_states.oldIndex > this.nrrd_states.maxIndex)
        this.nrrd_states.oldIndex = this.nrrd_states.maxIndex;

      if (this.initState) {
        this.nrrd_states.oldIndex =
          this.protectedData.mainPreSlices.initIndex *
          this.nrrd_states.RSARatio;
        this.nrrd_states.currentIndex =
          this.protectedData.mainPreSlices.initIndex;
      } else {
        // !need to change
        // todo
        this.protectedData.mainPreSlices.index = this.nrrd_states.oldIndex;
      }

      this.protectedData.canvases.originCanvas =
        this.protectedData.mainPreSlices.canvas;

      this.updateOriginAndChangedWH();
    }
  }

  private afterLoadSlice() {
    this.setMainPreSlice();
    this.setOriginCanvasAndPre();
    this.protectedData.currentShowingSlice = this.protectedData.mainPreSlices;
    this.nrrd_states.oldIndex =
      this.protectedData.mainPreSlices.initIndex * this.nrrd_states.RSARatio;
    this.nrrd_states.currentIndex = this.protectedData.mainPreSlices.initIndex;
    this.undoArray = [
      {
        sliceIndex: this.nrrd_states.currentIndex,
        layers: { layer1: [], layer2: [], layer3: [] },
      },
    ];

    // compute max index
    this.updateMaxIndex();
    this.dragOperator.updateShowNumDiv(this.nrrd_states.contrastNum);
    this.initState = false;
  }

  private updateMaxIndex() {
    if (this.protectedData.mainPreSlices) {
      this.nrrd_states.maxIndex = this.protectedData.mainPreSlices.MaxIndex;
    }
  }

  /**
   * Update the original canvas size, allow set to threejs load one (pixel distance not the mm).
   * Then update the changedWidth and changedHeight based on the sizeFoctor.
   */
  updateOriginAndChangedWH() {
    this.nrrd_states.originWidth =
      this.protectedData.canvases.originCanvas.width;
    this.nrrd_states.originHeight =
      this.protectedData.canvases.originCanvas.height;

    // In html the width and height is pixels,
    // So the value must be int
    // Therefore, we must use Math.floor rather than using Math.ceil
    this.nrrd_states.changedWidth =
      Math.floor(this.nrrd_states.originWidth * Number(this.nrrd_states.sizeFoctor));
    this.nrrd_states.changedHeight =
      Math.floor(this.nrrd_states.originWidth * Number(this.nrrd_states.sizeFoctor));
    this.resizePaintArea(this.nrrd_states.sizeFoctor);
    this.resetPaintAreaUIPosition();
  }

  /**
   * Keep all contrast slice index to same.
   * Synchronize the slice indexes of all the contrasts so that they are consistent with the main slice's index.
   */
  setSyncsliceNum() {
    this.protectedData.displaySlices.forEach((slice, index) => {
      if (index !== 0) {
        slice.index = this.protectedData.mainPreSlices.index;
      }
    });
  }

  appendLoadingbar(loadingbar: HTMLDivElement) {
    this.protectedData.mainAreaContainer.appendChild(loadingbar);
  }

  clearStoreImages() {
    // Phase 3: Re-init MaskVolume with current dimensions
    if (this.nrrd_states.dimensions.length === 3) {
      const [w, h, d] = this.nrrd_states.dimensions;
      this.protectedData.maskData.volumes = {
        layer1: new MaskVolume(w, h, d, 4),
        layer2: new MaskVolume(w, h, d, 4),
        layer3: new MaskVolume(w, h, d, 4),
      };
    }

    // Clear slice cache
    this.clearAllSliceCache();
  }

  /**
   * Reset the draw and display canvases layout after mouse pan.
   * If no params in, then center the draw and display canvases.
   * @param l number, Offset to the left
   * @param t number, Offset to the top
   */
  resetPaintAreaUIPosition(l?: number, t?: number) {
    if (l && t) {
      this.protectedData.canvases.displayCanvas.style.left =
        this.protectedData.canvases.drawingCanvas.style.left = l + "px";
      this.protectedData.canvases.displayCanvas.style.top =
        this.protectedData.canvases.drawingCanvas.style.top = t + "px";
    } else {
      this.protectedData.canvases.displayCanvas.style.left =
        this.protectedData.canvases.drawingCanvas.style.left = "";
      this.protectedData.canvases.displayCanvas.style.top =
        this.protectedData.canvases.drawingCanvas.style.top = "";

      this.protectedData.mainAreaContainer.style.justifyContent = "center";
      this.protectedData.mainAreaContainer.style.alignItems = "center";
    }
  }

  /**
   * Clear masks on drawingCanvas layers.
   */
  resetLayerCanvas() {
    this.protectedData.canvases.drawingCanvasLayerMaster.width =
      this.protectedData.canvases.drawingCanvasLayerMaster.width;
    this.protectedData.canvases.drawingCanvasLayerOne.width =
      this.protectedData.canvases.drawingCanvasLayerOne.width;
    this.protectedData.canvases.drawingCanvasLayerTwo.width =
      this.protectedData.canvases.drawingCanvasLayerTwo.width;
    this.protectedData.canvases.drawingCanvasLayerThree.width =
      this.protectedData.canvases.drawingCanvasLayerThree.width;
  }

  redrawMianPreOnDisplayCanvas() {
    this.protectedData.canvases.displayCanvas.width =
      this.protectedData.canvases.displayCanvas.width;
    this.protectedData.canvases.displayCanvas.height =
      this.protectedData.canvases.displayCanvas.height;
    this.protectedData.canvases.originCanvas.width =
      this.protectedData.canvases.originCanvas.width;
    if (this.protectedData.mainPreSlices) {
      this.protectedData.mainPreSlices.repaint.call(
        this.protectedData.mainPreSlices
      );

      this.flipDisplayImageByAxis();
      this.protectedData.ctxes.displayCtx?.drawImage(
        this.protectedData.canvases.originCanvas,
        0,
        0,
        this.nrrd_states.changedWidth,
        this.nrrd_states.changedHeight
      );
      this.resizePaintArea(this.nrrd_states.sizeFoctor);
    }
  }

  /**
   * Resize the draw and display canvas size based on the input size factor number.
   * @param factor number
   */
  resizePaintArea(factor: number) {
    /**
     * clear canvas
     */

    this.protectedData.canvases.originCanvas.width =
      this.protectedData.canvases.originCanvas.width;
    this.protectedData.canvases.displayCanvas.width =
      this.protectedData.canvases.displayCanvas.width;
    this.protectedData.canvases.drawingCanvas.width =
      this.protectedData.canvases.drawingCanvas.width;
    this.resetLayerCanvas();

    this.nrrd_states.changedWidth = Math.floor(this.nrrd_states.originWidth * factor);
    this.nrrd_states.changedHeight = Math.floor(this.nrrd_states.originHeight * factor);

    /**
     * resize canvas
     */
    this.protectedData.canvases.displayCanvas.width =
      this.nrrd_states.changedWidth;
    this.protectedData.canvases.displayCanvas.height =
      this.nrrd_states.changedHeight;
    this.protectedData.canvases.drawingCanvas.width =
      this.nrrd_states.changedWidth;
    this.protectedData.canvases.drawingCanvas.height =
      this.nrrd_states.changedHeight;
    this.protectedData.canvases.drawingCanvasLayerMaster.width =
      this.nrrd_states.changedWidth;
    this.protectedData.canvases.drawingCanvasLayerMaster.height =
      this.nrrd_states.changedHeight;
    this.protectedData.canvases.drawingCanvasLayerOne.width =
      this.nrrd_states.changedWidth;
    this.protectedData.canvases.drawingCanvasLayerOne.height =
      this.nrrd_states.changedHeight;
    this.protectedData.canvases.drawingCanvasLayerTwo.width =
      this.nrrd_states.changedWidth;
    this.protectedData.canvases.drawingCanvasLayerTwo.height =
      this.nrrd_states.changedHeight;
    this.protectedData.canvases.drawingCanvasLayerThree.width =
      this.nrrd_states.changedWidth;
    this.protectedData.canvases.drawingCanvasLayerThree.height =
      this.nrrd_states.changedHeight;

    this.redrawDisplayCanvas();

    // Phase 3: Reload masks from MaskVolume instead of paintImages arrays
    this.reloadMasksFromVolume();
  }

  /**
   * Phase 3: Reload all mask layers from MaskVolume with caching
   * Replaces the old reloadMaskToLayer approach
   */
  private reloadMasksFromVolume(): void {
    const axis = this.protectedData.axis;
    let sliceIndex = this.nrrd_states.currentIndex;

    // Clamp sliceIndex to valid range for current axis
    // (currentIndex may not be updated yet when switching axes)
    try {
      const vol = this.getVolumeForLayer("layer1");
      const dims = vol.getDimensions();
      const maxSlice = axis === "x" ? dims.width : axis === "y" ? dims.height : dims.depth;
      if (sliceIndex >= maxSlice) sliceIndex = maxSlice - 1;
      if (sliceIndex < 0) sliceIndex = 0;
    } catch { /* volume not ready */ }

    // Save current layer
    const originalLayer = this.gui_states.layer;

    // Draw layer1 (temporarily switch to layer1 for cache key)
    this.gui_states.layer = "layer1";
    this.drawMaskLayerFromVolumeWithCache(
      axis,
      sliceIndex,
      this.protectedData.ctxes.drawingLayerOneCtx
    );

    // Draw layer2
    this.gui_states.layer = "layer2";
    this.drawMaskLayerFromVolumeWithCache(
      axis,
      sliceIndex,
      this.protectedData.ctxes.drawingLayerTwoCtx
    );

    // Draw layer3
    this.gui_states.layer = "layer3";
    this.drawMaskLayerFromVolumeWithCache(
      axis,
      sliceIndex,
      this.protectedData.ctxes.drawingLayerThreeCtx
    );

    // Restore original layer
    this.gui_states.layer = originalLayer;

    // Composite all layers to master canvas
    this.compositeAllLayers();
  }

  /**
   * Draw layer mask using the slice cache for better performance
   */
  private drawMaskLayerFromVolumeWithCache(
    axis: "x" | "y" | "z",
    sliceIndex: number,
    ctx: CanvasRenderingContext2D
  ): void {
    // Clear the layer canvas first
    ctx.clearRect(0, 0, this.nrrd_states.changedWidth, this.nrrd_states.changedHeight);

    try {
      // Use the proper cache accessor from CommToolsData
      const imageData = this.getCachedSliceImageData(
        this.gui_states.layer,
        axis,
        sliceIndex
      );

      if (imageData) {
        this.setEmptyCanvasSize();
        this.protectedData.ctxes.emptyCtx.putImageData(imageData, 0, 0);
        ctx.drawImage(
          this.protectedData.canvases.emptyCanvas,
          0,
          0,
          this.nrrd_states.changedWidth,
          this.nrrd_states.changedHeight
        );
      }
    } catch (err) {
      console.warn(`Failed to draw cached mask layer for slice ${sliceIndex}:`, err);
    }
  }


  /**
   * Composite all 3 layer canvases to the master display canvas
   */
  private compositeAllLayers(): void {
    const masterCtx = this.protectedData.ctxes.drawingLayerMasterCtx;
    const width = this.nrrd_states.changedWidth;
    const height = this.nrrd_states.changedHeight;

    // Clear master canvas
    masterCtx.clearRect(0, 0, width, height);

    // Composite layer1
    masterCtx.drawImage(
      this.protectedData.canvases.drawingCanvasLayerOne,
      0,
      0,
      width,
      height
    );

    // Composite layer2
    masterCtx.drawImage(
      this.protectedData.canvases.drawingCanvasLayerTwo,
      0,
      0,
      width,
      height
    );

    // Composite layer3
    masterCtx.drawImage(
      this.protectedData.canvases.drawingCanvasLayerThree,
      0,
      0,
      width,
      height
    );
  }

  /**
   * @deprecated Phase 3: Legacy method - use reloadMasksFromVolume instead
   * Used to init the mask on each Layer and reload
   * @param paintImages
   * @param ctx
   */
  private reloadMaskToLayer(
    paintImages: IPaintImages,
    ctx: CanvasRenderingContext2D
  ) {
    let paintedImage;
    switch (this.protectedData.axis) {
      case "x":
        if (paintImages.x.length > 0) {
          paintedImage = this.filterDrawedImage(
            "x",
            this.nrrd_states.currentIndex,
            paintImages
          );
        } else {
          paintedImage = undefined;
        }
        break;
      case "y":
        if (paintImages.y.length > 0) {
          paintedImage = this.filterDrawedImage(
            "y",
            this.nrrd_states.currentIndex,
            paintImages
          );
        } else {
          paintedImage = undefined;
        }

        break;
      case "z":
        if (paintImages.z.length > 0) {
          paintedImage = this.filterDrawedImage(
            "z",
            this.nrrd_states.currentIndex,
            paintImages
          );
        } else {
          paintedImage = undefined;
        }
        break;
    }
    if (paintedImage?.image) {
      // redraw the stored data to empty point 1
      this.setEmptyCanvasSize();
      this.protectedData.ctxes.emptyCtx.putImageData(paintedImage.image, 0, 0);
      ctx?.drawImage(
        this.protectedData.canvases.emptyCanvas,
        0,
        0,
        this.nrrd_states.changedWidth,
        this.nrrd_states.changedHeight
      );
    }
  }

  /**
   * flip the canvas to a correct position.
   * This is because the slice canvas from threejs is not in a correct 2D postion.
   * Thus, everytime when we redraw the display canvas, we need to flip to draw the origin canvas from threejs.
   * Under different axis(sagittal, Axial, Coronal), the flip orientation is different.
   */
  flipDisplayImageByAxis() {
    if (this.protectedData.axis === "x") {
      this.protectedData.ctxes.displayCtx?.scale(-1, -1);

      this.protectedData.ctxes.displayCtx?.translate(
        -this.nrrd_states.changedWidth,
        -this.nrrd_states.changedHeight
      );
    } else if (this.protectedData.axis === "z") {
      this.protectedData.ctxes.displayCtx?.scale(1, -1);
      this.protectedData.ctxes.displayCtx?.translate(
        0,
        -this.nrrd_states.changedHeight
      );
    } else if (this.protectedData.axis === "y") {
      this.protectedData.ctxes.displayCtx?.scale(1, -1);
      this.protectedData.ctxes.displayCtx?.translate(
        0,
        -this.nrrd_states.changedHeight
      );
    }
  }

  private clearDictionary(dic: ISkipSlicesDictType) {
    for (var key in dic) {
      delete dic[key];
    }
  }

  /**
   * Set the empty canvas width and height based on the axis (pixel distance not the mm), to reduce duplicate codes.
   *
   * @param axis
   */
  setEmptyCanvasSize(axis?: "x" | "y" | "z") {
    switch (!!axis ? axis : this.protectedData.axis) {
      case "x":
        this.protectedData.canvases.emptyCanvas.width =
          this.nrrd_states.nrrd_z_pixel;
        this.protectedData.canvases.emptyCanvas.height =
          this.nrrd_states.nrrd_y_pixel;
        break;
      case "y":
        this.protectedData.canvases.emptyCanvas.width =
          this.nrrd_states.nrrd_x_pixel;
        this.protectedData.canvases.emptyCanvas.height =
          this.nrrd_states.nrrd_z_pixel;
        break;
      case "z":
        this.protectedData.canvases.emptyCanvas.width =
          this.nrrd_states.nrrd_x_pixel;
        this.protectedData.canvases.emptyCanvas.height =
          this.nrrd_states.nrrd_y_pixel;
        break;
    }
  }

  /******************************** redraw display canvas  ***************************************/

  /**
   * Redraw current contrast image to display canvas.
   * It is more related to change the contrast slice image's window width or center.
   */
  redrawDisplayCanvas() {
    this.dragOperator.updateCurrentContrastSlice();
    this.protectedData.canvases.displayCanvas.width =
      this.protectedData.canvases.displayCanvas.width;
    this.protectedData.canvases.displayCanvas.height =
      this.protectedData.canvases.displayCanvas.height;
    this.protectedData.canvases.originCanvas.width =
      this.protectedData.canvases.originCanvas.width;
    if (this.protectedData.currentShowingSlice) {
      this.protectedData.currentShowingSlice.repaint.call(
        this.protectedData.currentShowingSlice
      );
      this.protectedData.ctxes.displayCtx?.save();

      this.flipDisplayImageByAxis();

      this.protectedData.ctxes.displayCtx?.drawImage(
        this.protectedData.currentShowingSlice.canvas,
        0,
        0,
        this.nrrd_states.changedWidth,
        this.nrrd_states.changedHeight
      );
      this.protectedData.ctxes.displayCtx?.restore();
    }
  }


  /**
   * Config mouse slice wheel event.
   */
  configMouseSliceWheel() {
    const handleMouseZoomSliceWheelMove = (e: WheelEvent) => {
      if (this.protectedData.Is_Shift_Pressed) {
        return;
      }
      e.preventDefault();
      if (e.deltaY < 0) {
        this.setSliceMoving(-1);
      } else if (e.deltaY > 0) {
        this.setSliceMoving(1);
      }
    }
    return handleMouseZoomSliceWheelMove;
  }

  /**
   * Update mouse wheel event.
   */
  updateMouseWheelEvent() {

    this.protectedData.canvases.drawingCanvas.removeEventListener(
      "wheel",
      this.drawingPrameters.handleMouseZoomSliceWheel
    );
    switch (this.nrrd_states.keyboardSettings.mouseWheel) {
      case "Scroll:Zoom":
        this.drawingPrameters.handleMouseZoomSliceWheel = this.configMouseZoomWheel();
        break;
      case "Scroll:Slice":
        this.drawingPrameters.handleMouseZoomSliceWheel = this.configMouseSliceWheel();
        break;
      default:
        this.drawingPrameters.handleMouseZoomSliceWheel = this.configMouseZoomWheel();
        break;
    }
    this.protectedData.canvases.drawingCanvas.addEventListener(
      "wheel",
      this.drawingPrameters.handleMouseZoomSliceWheel
    );
  }
}
