import {
  IConvertObjType,
  IDrawingEvents,
  IContrastEvents,
  IDrawOpts,
  IPaintImages,
  ICommXY,
  ICommXYZ,
  IUndoType,
} from "./coreTools/coreType";
import { CommToolsData } from "./CommToolsData";
import { switchEraserSize, switchPencilIcon, throttle } from "../utils";
import { EventRouter, InteractionMode } from "./eventRouter";
import { SphereTool } from "./tools/SphereTool";
import { CrosshairTool } from "./tools/CrosshairTool";
import { ContrastTool } from "./tools/ContrastTool";
import { ZoomTool } from "./tools/ZoomTool";
import { EraserTool } from "./tools/EraserTool";
import { ImageStoreHelper } from "./tools/ImageStoreHelper";
import type { ToolContext } from "./tools/BaseTool";
import { MaskVolume } from "./core";

export class DrawToolCore extends CommToolsData {
  container: HTMLElement;
  mainAreaContainer: HTMLDivElement;
  drawingPrameters: IDrawingEvents = {
    handleOnDrawingMouseDown: (ev: MouseEvent) => { },
    handleOnDrawingMouseMove: (ev: MouseEvent) => { },
    handleOnPanMouseMove: (ev: MouseEvent) => { },
    handleOnDrawingMouseUp: (ev: MouseEvent) => { },
    handleOnDrawingMouseLeave: (ev: MouseEvent) => { },
    handleOnDrawingBrushCricleMove: (ev: MouseEvent) => { },
    handleMouseZoomSliceWheel: (e: WheelEvent) => { },
    handleSphereWheel: (e: WheelEvent) => { },
  };

  contrastEventPrameters: IContrastEvents = {
    move_x: 0,
    move_y: 0,
    x: 0,
    y: 0,
    w: 0,
    h: 0,
    handleOnContrastMouseDown: (ev: MouseEvent) => { },
    handleOnContrastMouseMove: (ev: MouseEvent) => { },
    handleOnContrastMouseUp: (ev: MouseEvent) => { },
    handleOnContrastMouseLeave: (ev: MouseEvent) => { },
  }

  eraserUrls: string[] = [];
  pencilUrls: string[] = [];
  undoArray: Array<IUndoType> = [];

  // Centralized event router
  protected eventRouter: EventRouter | null = null;

  // Extracted tools
  protected sphereTool!: SphereTool;
  protected crosshairTool!: CrosshairTool;
  protected contrastTool!: ContrastTool;
  protected zoomTool!: ZoomTool;
  protected eraserTool!: EraserTool;
  protected imageStoreHelper!: ImageStoreHelper;

  // need to return to parent
  start: () => void = () => { };

  constructor(container: HTMLElement) {
    const mainAreaContainer = document.createElement("div");
    super(container, mainAreaContainer);
    this.container = container;
    this.mainAreaContainer = mainAreaContainer;

    this.initTools();
    this.initDrawToolCore();
  }

  private initTools() {
    const toolCtx: ToolContext = {
      nrrd_states: this.nrrd_states,
      gui_states: this.gui_states,
      protectedData: this.protectedData,
      cursorPage: this.cursorPage,
    };

    this.imageStoreHelper = new ImageStoreHelper(toolCtx, {
      setEmptyCanvasSize: (axis?) => this.setEmptyCanvasSize(axis),
      drawImageOnEmptyImage: (canvas) => this.drawImageOnEmptyImage(canvas),
    });

    this.sphereTool = new SphereTool(toolCtx, {
      setEmptyCanvasSize: (axis?) => this.setEmptyCanvasSize(axis),
      drawImageOnEmptyImage: (canvas) => this.drawImageOnEmptyImage(canvas),
      storeImageToAxis: (index, paintedImages, imageData, axis?) =>
        this.imageStoreHelper.storeImageToAxis(index, paintedImages, imageData, axis),
      createEmptyPaintImage: (dimensions, paintImages) =>
        this.createEmptyPaintImage(dimensions, paintImages),
    });

    this.crosshairTool = new CrosshairTool(toolCtx);

    this.contrastTool = new ContrastTool(
      toolCtx,
      this.container,
      this.contrastEventPrameters,
      {
        setIsDrawFalse: (target) => this.setIsDrawFalse(target),
        setSyncsliceNum: () => this.setSyncsliceNum(),
      }
    );

    this.zoomTool = new ZoomTool(
      toolCtx,
      this.container,
      this.mainAreaContainer,
      {
        resetPaintAreaUIPosition: (l?, t?) => this.resetPaintAreaUIPosition(l, t),
        resizePaintArea: (moveDistance) => this.resizePaintArea(moveDistance),
        setIsDrawFalse: (target) => this.setIsDrawFalse(target),
      }
    );

    this.eraserTool = new EraserTool(toolCtx);
  }

  private initDrawToolCore() {
    // Initialize EventRouter for centralized event handling
    this.eventRouter = new EventRouter({
      container: this.container,
      canvas: this.protectedData.canvases.drawingCanvas,
      onModeChange: (prevMode, newMode) => {
        // Use string comparison to avoid TypeScript narrowing issues
        const prev = prevMode as string;
        const next = newMode as string;

        // Sync EventRouter mode changes with existing state flags
        if (next === 'draw') {
          this.protectedData.Is_Shift_Pressed = true;
          this.nrrd_states.enableCursorChoose = false;
        } else if (prev === 'draw') {
          this.protectedData.Is_Shift_Pressed = false;
        }
        if (next === 'contrast') {
          this.protectedData.Is_Ctrl_Pressed = true;
          this.protectedData.Is_Shift_Pressed = false;
          this.configContrastDragMode();
        } else if (prev === 'contrast') {
          this.protectedData.Is_Ctrl_Pressed = false;
          this.removeContrastDragMode();
          this.gui_states.readyToUpdate = true;
        }
        if (next === 'crosshair') {
          this.nrrd_states.enableCursorChoose = true;
          this.protectedData.Is_Draw = false;
        } else if (prev === 'crosshair') {
          this.nrrd_states.enableCursorChoose = false;
        }
      }
    });

    // Configure keyboard settings from nrrd_states
    this.eventRouter.setKeyboardSettings(this.nrrd_states.keyboardSettings);

    // Track undo flag for Ctrl+Z handling
    let undoFlag = false;

    // Register keyboard handlers with EventRouter
    this.eventRouter.setKeydownHandler((ev: KeyboardEvent) => {
      if (this.nrrd_states.configKeyBoard) return;

      // Handle undo (Ctrl+Z)
      if ((ev.ctrlKey || ev.metaKey) && ev.key === this.nrrd_states.keyboardSettings.undo) {
        undoFlag = true;
        this.undoLastPainting();
      }

      // Handle crosshair toggle
      if (ev.key === this.nrrd_states.keyboardSettings.crosshair) {
        if (!this.gui_states.sphere && !this.gui_states.calculator) {
          this.eventRouter?.toggleCrosshair();
        }
      }

      // Handle draw mode (Shift key) - EventRouter already tracks this
      if (ev.key === this.nrrd_states.keyboardSettings.draw && !this.gui_states.sphere && !this.gui_states.calculator) {
        if (this.protectedData.Is_Ctrl_Pressed) {
          return; // Ctrl takes priority
        }
        // EventRouter will set mode to 'draw' via internal handler
      }
    });

    this.eventRouter.setKeyupHandler((ev: KeyboardEvent) => {
      if (this.nrrd_states.configKeyBoard) return;

      // Handle Ctrl key release (contrast mode toggle)
      if (this.nrrd_states.keyboardSettings.contrast.includes(ev.key)) {
        if (undoFlag) {
          this.gui_states.readyToUpdate = true;
          undoFlag = false;
          return;
        }
        // Toggle contrast mode manually since it's on keyup
        if (this.eventRouter?.getMode() !== 'contrast') {
          this.eventRouter?.setMode('contrast');
        } else {
          this.eventRouter?.setMode('idle');
        }
      }
    });

    // Bind all event listeners
    this.eventRouter.bindAll();
  }

  setEraserUrls(urls: string[]) {
    this.eraserUrls = urls;
  }
  setPencilIconUrls(urls: string[]) {
    this.pencilUrls = urls;
    this.gui_states.defaultPaintCursor = switchPencilIcon(
      "dot",
      this.pencilUrls
    );
    this.protectedData.canvases.drawingCanvas.style.cursor =
      this.gui_states.defaultPaintCursor;
  }

  private setCurrentLayer() {
    let ctx: CanvasRenderingContext2D;
    let canvas: HTMLCanvasElement;
    switch (this.gui_states.layer) {
      case "layer1":
        ctx = this.protectedData.ctxes.drawingLayerOneCtx;
        canvas = this.protectedData.canvases.drawingCanvasLayerOne;
        break;
      case "layer2":
        ctx = this.protectedData.ctxes.drawingLayerTwoCtx;
        canvas = this.protectedData.canvases.drawingCanvasLayerTwo;
        break;
      case "layer3":
        ctx = this.protectedData.ctxes.drawingLayerThreeCtx;
        canvas = this.protectedData.canvases.drawingCanvasLayerThree;
        break;
      default:
        ctx = this.protectedData.ctxes.drawingLayerOneCtx;
        canvas = this.protectedData.canvases.drawingCanvasLayerOne;
        break;
    }
    return { ctx, canvas };
  }

  draw(opts?: IDrawOpts) {
    if (!!opts) {
      this.nrrd_states.getMask = opts?.getMaskData as any;
      if (opts?.onClearLayerVolume) {
        this.nrrd_states.onClearLayerVolume = opts.onClearLayerVolume as any;
      }
      this.nrrd_states.getSphere = opts?.getSphereData as any;
      this.nrrd_states.getCalculateSpherePositions = opts?.getCalculateSpherePositionsData as any;
    }
    this.paintOnCanvas();
  }

  drawCalSphereDown(x: number, y: number, sliceIndex: number, cal_position: "tumour" | "skin" | "nipple" | "ribcage") {
    this.nrrd_states.sphereRadius = 5
    this.protectedData.canvases.drawingCanvas.removeEventListener(
      "wheel",
      this.drawingPrameters.handleMouseZoomSliceWheel
    );
    let mouseX = x / this.nrrd_states.sizeFoctor;
    let mouseY = y / this.nrrd_states.sizeFoctor;

    //  record mouseX,Y, and enable crosshair function
    this.nrrd_states.sphereOrigin[this.protectedData.axis] = [
      mouseX,
      mouseY,
      sliceIndex,
    ];
    this.setUpSphereOrigins(mouseX, mouseY, sliceIndex);
    // Note the sphere origin here is x, y, z
    // x: pixel x, y: pixel y, z: slice index (mm)
    switch (cal_position) {
      case "tumour":
        this.nrrd_states.tumourSphereOrigin = JSON.parse(JSON.stringify(this.nrrd_states.sphereOrigin));
        break;
      case "skin":
        this.nrrd_states.skinSphereOrigin = JSON.parse(JSON.stringify(this.nrrd_states.sphereOrigin));
        break;
      case "nipple":
        this.nrrd_states.nippleSphereOrigin = JSON.parse(JSON.stringify(this.nrrd_states.sphereOrigin));
        break;
      case "ribcage":
        this.nrrd_states.ribSphereOrigin = JSON.parse(JSON.stringify(this.nrrd_states.sphereOrigin));
        break;
    }

    this.nrrd_states.cursorPageX = mouseX;
    this.nrrd_states.cursorPageY = mouseY;
    this.enableCrosshair();

    // draw circle setup width/height for sphere canvas
    this.drawCalculatorSphere(this.nrrd_states.sphereRadius);
    this.protectedData.canvases.drawingCanvas.addEventListener(
      "pointerup",
      this.drawingPrameters.handleOnDrawingMouseUp
    );
  }

  drawCalSphereUp() {
    // TODO send data to outside
    // this.clearStoreImages();
    this.clearSpherePrintStoreImages()
    this.drawCalculatorSphereOnEachViews("x");
    this.drawCalculatorSphereOnEachViews("y");
    this.drawCalculatorSphereOnEachViews("z");

    !!this.nrrd_states.getCalculateSpherePositions &&
      this.nrrd_states.getCalculateSpherePositions(
        this.nrrd_states.tumourSphereOrigin,
        this.nrrd_states.skinSphereOrigin,
        this.nrrd_states.ribSphereOrigin,
        this.nrrd_states.nippleSphereOrigin,
        this.protectedData.axis
      );

    this.zoomActionAfterDrawSphere();
    this.protectedData.canvases.drawingCanvas.removeEventListener("pointerup",
      this.drawingPrameters.handleOnDrawingMouseUp);
  }

  private zoomActionAfterDrawSphere() {
    this.protectedData.canvases.drawingCanvas.addEventListener(
      "wheel",
      this.drawingPrameters.handleMouseZoomSliceWheel
    );
  }

  private clearSpherePrintStoreImages() {
    this.sphereTool.clearSpherePrintStoreImages();
  }

  private paintOnCanvas() {
    /**
     * drag paint panel
     */
    let leftclicked = false;
    let rightclicked = false;
    let panelMoveInnerX = 0;
    let panelMoveInnerY = 0;

    // todo
    // let currentSliceIndex = this.protectedData.mainPreSlices.index;
    let currentSliceIndex = this.protectedData.mainPreSlices.index;

    // draw lines starts position
    let Is_Painting = false;
    let lines: Array<ICommXY> = [];
    const clearArc = this.useEraser();

    this.updateOriginAndChangedWH();

    this.initAllCanvas();

    this.protectedData.ctxes.displayCtx?.save();
    this.flipDisplayImageByAxis();
    this.protectedData.ctxes.displayCtx?.drawImage(
      this.protectedData.canvases.originCanvas,
      0,
      0,
      this.nrrd_states.changedWidth,
      this.nrrd_states.changedHeight
    );

    this.protectedData.ctxes.displayCtx?.restore();

    this.protectedData.previousDrawingImage =
      this.protectedData.ctxes.drawingCtx.getImageData(
        0,
        0,
        this.protectedData.canvases.drawingCanvas.width,
        this.protectedData.canvases.drawingCanvas.height
      );

    // let a global variable to store the wheel move event
    if (this.nrrd_states.keyboardSettings.mouseWheel === "Scroll:Zoom") {
      this.drawingPrameters.handleMouseZoomSliceWheel = this.configMouseZoomWheel();
    } else {
      this.drawingPrameters.handleMouseZoomSliceWheel = this.configMouseSliceWheel() as any;
    }
    // Keep wheel as direct addEventListener due to dynamic add/remove patterns in handleOnDrawingMouseUp
    // EventRouter routing would conflict with the dynamic wheel switching (zoom vs sphere wheel)
    this.protectedData.canvases.drawingCanvas.addEventListener(
      "wheel",
      this.drawingPrameters.handleMouseZoomSliceWheel,
      {
        passive: false,
      }
    );
    // sphere Wheel
    this.drawingPrameters.handleSphereWheel = this.configMouseSphereWheel();

    // pan move
    this.drawingPrameters.handleOnPanMouseMove = (e: MouseEvent) => {
      this.protectedData.canvases.drawingCanvas.style.cursor = "grabbing";
      this.nrrd_states.previousPanelL = e.clientX - panelMoveInnerX;
      this.nrrd_states.previousPanelT = e.clientY - panelMoveInnerY;
      this.protectedData.canvases.displayCanvas.style.left =
        this.protectedData.canvases.drawingCanvas.style.left =
        this.nrrd_states.previousPanelL + "px";
      this.protectedData.canvases.displayCanvas.style.top =
        this.protectedData.canvases.drawingCanvas.style.top =
        this.nrrd_states.previousPanelT + "px";
    };

    // brush circle move
    this.drawingPrameters.handleOnDrawingBrushCricleMove = (e: MouseEvent) => {
      e.preventDefault();
      this.nrrd_states.Mouse_Over_x = e.offsetX;
      this.nrrd_states.Mouse_Over_y = e.offsetY;
      if (this.nrrd_states.Mouse_Over_x === undefined) {
        this.nrrd_states.Mouse_Over_x = e.clientX;
        this.nrrd_states.Mouse_Over_y = e.clientY;
      }
      if (e.type === "mouseout") {
        this.nrrd_states.Mouse_Over = false;
        this.protectedData.canvases.drawingCanvas.removeEventListener(
          "mousemove",
          this.drawingPrameters.handleOnDrawingBrushCricleMove
        );
      } else if (e.type === "mouseover") {
        this.nrrd_states.Mouse_Over = true;
        this.protectedData.canvases.drawingCanvas.addEventListener(
          "mousemove",
          this.drawingPrameters.handleOnDrawingBrushCricleMove
        );
      }
    };

    // drawing move
    this.drawingPrameters.handleOnDrawingMouseMove = (e: MouseEvent) => {
      this.protectedData.Is_Draw = true;
      if (Is_Painting) {
        if (this.gui_states.Eraser) {
          this.nrrd_states.stepClear = 1;
          // drawingCtx.clearRect(e.offsetX - 5, e.offsetY - 5, 25, 25);
          clearArc(e.offsetX, e.offsetY, this.gui_states.brushAndEraserSize);
        } else {
          lines.push({ x: e.offsetX, y: e.offsetY });
          this.paintOnCanvasLayer(e.offsetX, e.offsetY);
        }
      }
    };
    this.drawingPrameters.handleOnDrawingMouseDown = (e: MouseEvent) => {
      if (leftclicked || rightclicked) {
        this.protectedData.canvases.drawingCanvas.removeEventListener(
          "pointerup",
          this.drawingPrameters.handleOnDrawingMouseUp
        );
        this.protectedData.ctxes.drawingLayerMasterCtx.closePath();
        return;
      }

      // when switch slice, clear previousDrawingImage
      // todo
      if (currentSliceIndex !== this.protectedData.mainPreSlices.index) {
        this.protectedData.previousDrawingImage =
          this.protectedData.ctxes.emptyCtx.createImageData(1, 1);
        currentSliceIndex = this.protectedData.mainPreSlices.index;
      }

      // remove it when mouse click down
      this.protectedData.canvases.drawingCanvas.removeEventListener(
        "wheel",
        this.drawingPrameters.handleMouseZoomSliceWheel
      );

      if (e.button === 0) {
        if (this.protectedData.Is_Shift_Pressed) {
          leftclicked = true;
          lines = [];
          Is_Painting = true;
          this.protectedData.Is_Draw = true;

          if (this.gui_states.Eraser) {
            // this.protectedData.canvases.drawingCanvas.style.cursor =
            //   "url(https://raw.githubusercontent.com/LinkunGao/copper3d-datasets/main/icons/eraser/circular-cursor_48.png) 48 48, crosshair";
            this.eraserUrls.length > 0
              ? (this.protectedData.canvases.drawingCanvas.style.cursor =
                switchEraserSize(
                  this.gui_states.brushAndEraserSize,
                  this.eraserUrls
                ))
              : (this.protectedData.canvases.drawingCanvas.style.cursor =
                switchEraserSize(this.gui_states.brushAndEraserSize));
          } else {
            this.protectedData.canvases.drawingCanvas.style.cursor =
              this.gui_states.defaultPaintCursor;
          }

          this.nrrd_states.drawStartPos.x = e.offsetX;
          this.nrrd_states.drawStartPos.y = e.offsetY;

          this.protectedData.canvases.drawingCanvas.addEventListener(
            "pointerup",
            this.drawingPrameters.handleOnDrawingMouseUp
          );
          this.protectedData.canvases.drawingCanvas.addEventListener(
            "pointermove",
            this.drawingPrameters.handleOnDrawingMouseMove
          );
        } else if (this.nrrd_states.enableCursorChoose) {
          this.nrrd_states.cursorPageX =
            e.offsetX / this.nrrd_states.sizeFoctor;
          this.nrrd_states.cursorPageY =
            e.offsetY / this.nrrd_states.sizeFoctor;

          this.enableCrosshair();
          this.protectedData.canvases.drawingCanvas.addEventListener(
            "pointerup",
            this.drawingPrameters.handleOnDrawingMouseUp
          );

        } else if (this.gui_states.sphere && !this.nrrd_states.enableCursorChoose) {

          sphere(e)

        } else if (this.gui_states.calculator && !this.nrrd_states.enableCursorChoose) {

          this.drawCalSphereDown(e.offsetX, e.offsetY, this.nrrd_states.currentIndex, this.gui_states.cal_distance)
        }
      } else if (e.button === 2) {
        rightclicked = true;

        let offsetX = this.protectedData.canvases.drawingCanvas.offsetLeft;
        let offsetY = this.protectedData.canvases.drawingCanvas.offsetTop;

        panelMoveInnerX = e.clientX - offsetX;
        panelMoveInnerY = e.clientY - offsetY;

        this.protectedData.canvases.drawingCanvas.style.cursor = "grab";
        this.protectedData.canvases.drawingCanvas.addEventListener(
          "pointerup",
          this.drawingPrameters.handleOnDrawingMouseUp
        );
        this.protectedData.canvases.drawingCanvas.addEventListener(
          "pointermove",
          this.drawingPrameters.handleOnPanMouseMove
        );
      } else {
        return;
      }
    };
    // Route pointerdown through EventRouter for centralized event management
    // The handler is still the existing logic, just registered through EventRouter
    if (this.eventRouter) {
      this.eventRouter.setPointerDownHandler((e: PointerEvent) => {
        this.drawingPrameters.handleOnDrawingMouseDown(e);
      });
    } else {
      // Fallback for legacy mode without EventRouter
      this.protectedData.canvases.drawingCanvas.addEventListener(
        "pointerdown",
        this.drawingPrameters.handleOnDrawingMouseDown,
        true
      );
    }

    const sphere = (e: MouseEvent) => {
      // set sphere size

      this.protectedData.canvases.drawingCanvas.removeEventListener(
        "wheel",
        this.drawingPrameters.handleMouseZoomSliceWheel
      );
      let mouseX = e.offsetX / this.nrrd_states.sizeFoctor;
      let mouseY = e.offsetY / this.nrrd_states.sizeFoctor;

      //  record mouseX,Y, and enable crosshair function
      this.nrrd_states.sphereOrigin[this.protectedData.axis] = [
        mouseX,
        mouseY,
        this.nrrd_states.currentIndex,
      ];
      this.setUpSphereOrigins(mouseX, mouseY, this.nrrd_states.currentIndex);

      this.nrrd_states.cursorPageX = mouseX;
      this.nrrd_states.cursorPageY = mouseY;
      this.enableCrosshair();

      // draw circle setup width/height for sphere canvas
      this.drawSphere(mouseX, mouseY, this.nrrd_states.sphereRadius);
      this.protectedData.canvases.drawingCanvas.addEventListener(
        "wheel",
        this.drawingPrameters.handleSphereWheel,
        true
      );
      this.protectedData.canvases.drawingCanvas.addEventListener(
        "pointerup",
        this.drawingPrameters.handleOnDrawingMouseUp
      );
    }

    const redrawPreviousImageToLayerCtx = (
      ctx: CanvasRenderingContext2D
    ) => {
      const tempPreImg = this.filterDrawedImage(
        this.protectedData.axis,
        this.nrrd_states.currentIndex,
      )?.image;
      this.protectedData.canvases.emptyCanvas.width =
        this.protectedData.canvases.emptyCanvas.width;

      if (tempPreImg) {
        this.protectedData.previousDrawingImage = tempPreImg;
      }
      this.protectedData.ctxes.emptyCtx.putImageData(tempPreImg!, 0, 0);
      // No flip needed: MaskVolume stores in source coordinates (matching the
      // Three.js / layer canvas convention).  The layer canvas is in screen
      // coordinates, which already match the source coordinate system.
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        this.protectedData.canvases.emptyCanvas,
        0,
        0,
        this.nrrd_states.changedWidth,
        this.nrrd_states.changedHeight
      );
    };

    this.drawingPrameters.handleOnDrawingMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {

        if (this.protectedData.Is_Shift_Pressed || Is_Painting) {
          leftclicked = false;
          let { ctx, canvas } = this.setCurrentLayer();

          ctx.closePath();

          this.protectedData.canvases.drawingCanvas.removeEventListener(
            "pointermove",
            this.drawingPrameters.handleOnDrawingMouseMove
          );
          if (!this.gui_states.Eraser) {
            if (this.gui_states.pencil) {
              // Clear only the current layer canvas (NOT master)
              canvas.width = canvas.width;
              // Redraw previous layer data from volume
              redrawPreviousImageToLayerCtx(ctx);
              // Draw new pencil strokes on current layer canvas
              ctx.beginPath();
              ctx.moveTo(lines[0].x, lines[0].y);
              for (let i = 1; i < lines.length; i++) {
                ctx.lineTo(lines[i].x, lines[i].y);
              }
              ctx.closePath();
              ctx.lineWidth = 1;
              ctx.fillStyle = this.gui_states.fillColor;
              ctx.fill();
              // Composite ALL layers to master (not just current layer)
              this.compositeAllLayers();
            }
          }

          this.protectedData.previousDrawingImage =
            this.protectedData.ctxes.drawingLayerMasterCtx.getImageData(
              0,
              0,
              this.protectedData.canvases.drawingCanvasLayerMaster.width,
              this.protectedData.canvases.drawingCanvasLayerMaster.height
            );
          this.storeAllImages(
            this.nrrd_states.currentIndex,
            this.gui_states.layer
          );
          if (this.gui_states.Eraser) {
            const restLayers = this.getRestLayer();
            this.storeEachLayerImage(
              this.nrrd_states.currentIndex,
              restLayers[0]
            );
            this.storeEachLayerImage(
              this.nrrd_states.currentIndex,
              restLayers[1]
            );
          }

          Is_Painting = false;

          /**
           * store undo array
           */
          const currentUndoObj = this.getCurrentUndo();
          const src =
            this.protectedData.canvases.drawingCanvasLayerMaster.toDataURL();
          const image = new Image();
          image.src = src;
          if (currentUndoObj.length > 0) {
            currentUndoObj[0].layers[
              this.gui_states.layer as "layer1" | "layer2" | "layer3"
            ].push(image);
          } else {
            const undoObj: IUndoType = {
              sliceIndex: this.nrrd_states.currentIndex,
              layers: { layer1: [], layer2: [], layer3: [] },
            };
            undoObj.layers[
              this.gui_states.layer as "layer1" | "layer2" | "layer3"
            ].push(image);
            this.undoArray.push(undoObj);
          }
          // add wheel after pointer up
          this.protectedData.canvases.drawingCanvas.addEventListener(
            "wheel",
            this.drawingPrameters.handleMouseZoomSliceWheel,
            {
              passive: false,
            }
          );
        } else if (
          this.gui_states.sphere &&
          !this.nrrd_states.enableCursorChoose
        ) {
          // plan B
          // findout all index in the sphere radius range in Axial view
          if (this.nrrd_states.spherePlanB) {
            // clear stroe images
            // this.clearStoreImages();
            this.clearSpherePrintStoreImages()
            for (let i = 0; i < this.nrrd_states.sphereRadius; i++) {
              this.drawSphereOnEachViews(i, "x");
              this.drawSphereOnEachViews(i, "y");
              this.drawSphereOnEachViews(i, "z");
            }
          }

          !!this.nrrd_states.getSphere &&
            this.nrrd_states.getSphere(
              this.nrrd_states.sphereOrigin.z,
              this.nrrd_states.sphereRadius / this.nrrd_states.sizeFoctor
            );

          this.protectedData.canvases.drawingCanvas.removeEventListener(
            "wheel",
            this.drawingPrameters.handleSphereWheel,
            true
          );

          this.protectedData.canvases.drawingCanvas.addEventListener(
            "wheel",
            this.drawingPrameters.handleMouseZoomSliceWheel
          );
          this.protectedData.canvases.drawingCanvas.removeEventListener(
            "pointerup",
            this.drawingPrameters.handleOnDrawingMouseUp
          );

        } else if ((this.gui_states.sphere || this.gui_states.calculator) &&
          this.nrrd_states.enableCursorChoose) {
          this.protectedData.canvases.drawingCanvas.addEventListener(
            "wheel",
            this.drawingPrameters.handleMouseZoomSliceWheel
          );
          this.protectedData.canvases.drawingCanvas.removeEventListener(
            "pointerup",
            this.drawingPrameters.handleOnDrawingMouseUp
          );
        } else if (this.gui_states.calculator &&
          !this.nrrd_states.enableCursorChoose) {
          // When mouse up
          this.drawCalSphereUp()
        }

      } else if (e.button === 2) {
        rightclicked = false;
        this.protectedData.canvases.drawingCanvas.style.cursor = "grab";

        setTimeout(() => {
          this.protectedData.canvases.drawingCanvas.style.cursor = this.gui_states.defaultPaintCursor;
        }, 2000)
        this.protectedData.canvases.drawingCanvas.removeEventListener(
          "pointermove",
          this.drawingPrameters.handleOnPanMouseMove
        );

        if (this.gui_states.sphere || this.gui_states.calculator) {
          this.zoomActionAfterDrawSphere();
        }
      } else {
        return;
      }

      if (!this.gui_states.pencil) {
        this.setIsDrawFalse(100);
      }
    };

    this.protectedData.canvases.drawingCanvas.addEventListener(
      "pointerleave",
      (e: MouseEvent) => {
        Is_Painting = false;
        if (leftclicked) {
          leftclicked = false;
          this.protectedData.ctxes.drawingLayerMasterCtx.closePath();
          this.protectedData.canvases.drawingCanvas.removeEventListener(
            "pointermove",
            this.drawingPrameters.handleOnDrawingMouseMove
          );
          this.protectedData.canvases.drawingCanvas.removeEventListener(
            "wheel",
            this.drawingPrameters.handleSphereWheel,
            true
          );
        }
        if (rightclicked) {
          rightclicked = false;
          this.protectedData.canvases.drawingCanvas.style.cursor = "grab";
          this.protectedData.canvases.drawingCanvas.removeEventListener(
            "pointermove",
            this.drawingPrameters.handleOnPanMouseMove
          );
        }

        this.setIsDrawFalse(100);
        if (this.gui_states.pencil) {
          this.setIsDrawFalse(1000);
        }
      }
    );

    this.start = () => {
      if (this.gui_states.readyToUpdate) {
        this.protectedData.ctxes.drawingCtx.clearRect(
          0,
          0,
          this.nrrd_states.changedWidth,
          this.nrrd_states.changedHeight
        );
        this.protectedData.ctxes.drawingCtx.globalAlpha =
          this.gui_states.globalAlpha;
        if (this.protectedData.Is_Draw) {
          this.protectedData.ctxes.drawingLayerMasterCtx.lineCap = "round";
          this.protectedData.ctxes.drawingLayerMasterCtx.globalAlpha = 1;
          this.protectedData.ctxes.drawingLayerOneCtx.lineCap = "round";
          this.protectedData.ctxes.drawingLayerOneCtx.globalAlpha = 1;
          this.protectedData.ctxes.drawingLayerTwoCtx.lineCap = "round";
          this.protectedData.ctxes.drawingLayerTwoCtx.globalAlpha = 1;
          this.protectedData.ctxes.drawingLayerThreeCtx.lineCap = "round";
          this.protectedData.ctxes.drawingLayerThreeCtx.globalAlpha = 1;
        } else {
          if (this.protectedData.Is_Shift_Pressed) {
            if (
              !this.gui_states.pencil &&
              !this.gui_states.Eraser &&
              this.nrrd_states.Mouse_Over
            ) {
              this.protectedData.ctxes.drawingCtx.clearRect(
                0,
                0,
                this.nrrd_states.changedWidth,
                this.nrrd_states.changedHeight
              );
              this.protectedData.ctxes.drawingCtx.fillStyle =
                this.gui_states.brushColor;
              this.protectedData.ctxes.drawingCtx.beginPath();
              this.protectedData.ctxes.drawingCtx.arc(
                this.nrrd_states.Mouse_Over_x,
                this.nrrd_states.Mouse_Over_y,
                this.gui_states.brushAndEraserSize / 2 + 1,
                0,
                Math.PI * 2
              );
              this.protectedData.ctxes.drawingCtx.strokeStyle =
                this.gui_states.brushColor;
              this.protectedData.ctxes.drawingCtx.stroke();
            }
          }
          if (this.nrrd_states.enableCursorChoose) {
            this.protectedData.ctxes.drawingCtx.clearRect(
              0,
              0,
              this.nrrd_states.changedWidth,
              this.nrrd_states.changedHeight
            );

            const ex =
              this.nrrd_states.cursorPageX * this.nrrd_states.sizeFoctor;
            const ey =
              this.nrrd_states.cursorPageY * this.nrrd_states.sizeFoctor;

            this.drawLine(
              ex,
              0,
              ex,
              this.nrrd_states.changedWidth
            );
            this.drawLine(
              0,
              ey,
              this.nrrd_states.changedHeight,
              ey
            );
          }
        }
        // globalAlpha was set to gui_states.globalAlpha at the top of start().
        // Master stores full-alpha pixels; transparency applied here only.
        this.protectedData.ctxes.drawingCtx.drawImage(
          this.protectedData.canvases.drawingCanvasLayerMaster,
          0,
          0
        );
      } else {
        this.redrawDisplayCanvas();
      }
    };
  }

  /*************************************May consider to move outside *******************************************/
  private drawLine = (x1: number, y1: number, x2: number, y2: number) => {
    this.protectedData.ctxes.drawingCtx.beginPath();
    this.protectedData.ctxes.drawingCtx.moveTo(x1, y1);
    this.protectedData.ctxes.drawingCtx.lineTo(x2, y2);
    this.protectedData.ctxes.drawingCtx.strokeStyle = this.gui_states.color;
    this.protectedData.ctxes.drawingCtx.stroke();
  };

  private drawLinesOnLayer(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number
  ) {
    ctx.beginPath();
    ctx.moveTo(
      this.nrrd_states.drawStartPos.x,
      this.nrrd_states.drawStartPos.y
    );
    if (this.gui_states.pencil) {
      ctx.strokeStyle = this.gui_states.color;
      ctx.lineWidth = this.gui_states.lineWidth;
    } else {
      ctx.strokeStyle = this.gui_states.brushColor;
      ctx.lineWidth = this.gui_states.brushAndEraserSize;
    }

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.closePath();
  }

  private paintOnCanvasLayer(x: number, y: number) {
    let { ctx, canvas } = this.setCurrentLayer();

    // Draw only on the current layer canvas (not master directly)
    this.drawLinesOnLayer(ctx, x, y);
    // Composite all layers to master to preserve other layers' data
    this.compositeAllLayers();
    // reset drawing start position to current position.
    this.nrrd_states.drawStartPos.x = x;
    this.nrrd_states.drawStartPos.y = y;
    // need to flag the map as needing updating.
    this.protectedData.mainPreSlices.mesh.material.map.needsUpdate = true;
  }

  private initAllCanvas() {
    /**
     * display canvas
     */
    this.protectedData.canvases.displayCanvas.style.position = "absolute";
    this.protectedData.canvases.displayCanvas.style.zIndex = "9";
    this.protectedData.canvases.displayCanvas.width =
      this.nrrd_states.changedWidth;
    this.protectedData.canvases.displayCanvas.height =
      this.nrrd_states.changedHeight;

    /**
     * drawing canvas
     */
    this.protectedData.canvases.drawingCanvas.style.zIndex = "10";
    this.protectedData.canvases.drawingCanvas.style.position = "absolute";

    this.protectedData.canvases.drawingCanvas.width =
      this.nrrd_states.changedWidth;
    this.protectedData.canvases.drawingCanvas.height =
      this.nrrd_states.changedHeight;
    this.protectedData.canvases.drawingCanvas.style.cursor =
      this.gui_states.defaultPaintCursor;
    this.protectedData.canvases.drawingCanvas.oncontextmenu = () => false;

    /**
     * layer1
     * it should be hide, so we don't need to add it to mainAreaContainer
     */

    this.protectedData.canvases.drawingCanvasLayerMaster.width =
      this.protectedData.canvases.drawingCanvasLayerOne.width =
      this.protectedData.canvases.drawingCanvasLayerTwo.width =
      this.protectedData.canvases.drawingCanvasLayerThree.width =
      this.nrrd_states.changedWidth;
    this.protectedData.canvases.drawingCanvasLayerMaster.height =
      this.protectedData.canvases.drawingCanvasLayerOne.height =
      this.protectedData.canvases.drawingCanvasLayerTwo.height =
      this.protectedData.canvases.drawingCanvasLayerThree.height =
      this.nrrd_states.changedHeight;

    /**
     * display and drawing canvas container
     */
    // this.mainAreaContainer.style.width = this.nrrd_states.changedWidth + "px";
    // this.mainAreaContainer.style.height = this.nrrd_states.changedHeight + "px";
    this.mainAreaContainer.style.width =
      this.nrrd_states.originWidth * 8 + "px";
    this.mainAreaContainer.style.height =
      this.nrrd_states.originHeight * 8 + "px";
    this.mainAreaContainer.appendChild(
      this.protectedData.canvases.displayCanvas
    );
    this.mainAreaContainer.appendChild(
      this.protectedData.canvases.drawingCanvas
    );
  }

  private useEraser() {
    return this.eraserTool.createClearArc();
  }
  // drawing canvas mouse zoom wheel
  configMouseZoomWheel() {
    return this.zoomTool.configMouseZoomWheel();
  }

  configMouseSliceWheel() {
    /**
     * Interface for slice wheel
     * Implement in the NrrdTools class
     *  */
    throw new Error(
      "Child class must implement abstract redrawDisplayCanvas, currently you can find it in NrrdTools."
    );
  }

  private enableCrosshair() {
    this.crosshairTool.enableCrosshair();
  }

  drawImageOnEmptyImage(canvas: HTMLCanvasElement) {
    const ctx = this.protectedData.ctxes.emptyCtx;
    const w = this.protectedData.canvases.emptyCanvas.width;
    const h = this.protectedData.canvases.emptyCanvas.height;

    // No flip needed: the layer canvas screen coordinates already match the
    // Three.js source coordinate system used by MaskVolume.  Applying a flip
    // here would invert cross-axis slice indices (e.g. coronal slice 220
    // becoming 228 when total=448).
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(canvas, 0, 0, w, h);
  }

  /****************************Sphere functions (delegated to SphereTool)****************************************************/

  drawCalculatorSphereOnEachViews(axis: "x" | "y" | "z") {
    this.sphereTool.drawCalculatorSphereOnEachViews(axis);
  }

  private drawSphereOnEachViews(decay: number, axis: "x" | "y" | "z") {
    this.sphereTool.drawSphereOnEachViews(decay, axis);
  }

  private configMouseSphereWheel() {
    return this.sphereTool.configMouseSphereWheel();
  }

  drawCalculatorSphere(radius: number) {
    this.sphereTool.drawCalculatorSphere(radius);
  }

  drawSphere(mouseX: number, mouseY: number, radius: number) {
    this.sphereTool.drawSphere(mouseX, mouseY, radius);
  }

  /**
   * Convert cursor point between axis views.
   * Delegated to CrosshairTool.
   */
  convertCursorPoint(
    from: "x" | "y" | "z",
    to: "x" | "y" | "z",
    cursorNumX: number,
    cursorNumY: number,
    currentSliceIndex: number
  ) {
    return this.crosshairTool.convertCursorPoint(from, to, cursorNumX, cursorNumY, currentSliceIndex);
  }

  private setUpSphereOrigins(mouseX: number, mouseY: number, sliceIndex: number) {
    this.crosshairTool.setUpSphereOrigins(mouseX, mouseY, sliceIndex);
  }

  /****************************layer div controls****************************************************/

  getRestLayer() {
    const layers = this.nrrd_states.layers;
    const restLayer = layers.filter((item) => {
      return item !== this.gui_states.layer;
    });
    return restLayer;
  }

  /**************************** Undo clear functions****************************************************/

  private getCurrentUndo() {
    return this.undoArray.filter((item) => {
      return item.sliceIndex === this.nrrd_states.currentIndex;
    });
  }

  /**
   * Clear mask on current slice canvas.
   *
   * Phase 2: Clears the MaskVolume slice for all three layers,
   * re-stores, and notifies external via getMask callback with clearFlag=true.
   */
  clearPaint() {
    this.protectedData.Is_Draw = true;
    this.resetLayerCanvas();
    this.protectedData.canvases.originCanvas.width =
      this.protectedData.canvases.originCanvas.width;
    this.protectedData.mainPreSlices.repaint.call(
      this.protectedData.mainPreSlices
    );
    this.protectedData.previousDrawingImage =
      this.protectedData.ctxes.emptyCtx.createImageData(1, 1);

    // Phase 2: Clear volume slices for all layers on the current axis/index
    try {
      const axis = this.protectedData.axis;
      const idx = this.nrrd_states.currentIndex;
      const { layer1, layer2, layer3 } = this.protectedData.maskData.volumes;
      layer1.clearSlice(idx, axis);
      layer2.clearSlice(idx, axis);
      layer3.clearSlice(idx, axis);

      // Phase 2 Task 2.1: Notify external that slice was cleared
      // Extract the cleared (all-zero) slice data and call getMask with clearFlag=true
      if (!this.nrrd_states.loadMaskJson && !this.gui_states.sphere && !this.gui_states.calculator) {
        const { data: sliceData, width, height } = layer1.getSliceUint8(idx, axis);
        const activeChannel = this.gui_states.activeChannel || 1;
        const layer = this.gui_states.layer;

        // Call getMask to notify backend of the clear operation
        this.nrrd_states.getMask(
          sliceData,
          layer,
          activeChannel,
          idx,
          axis,
          width,
          height,
          true  // clearFlag = true
        );
      }
    } catch {
      // Volume not ready (1×1×1 placeholder) — continue with legacy path
    }

    this.storeAllImages(this.nrrd_states.currentIndex, this.gui_states.layer);
    const restLayers = this.getRestLayer();
    this.storeEachLayerImage(this.nrrd_states.currentIndex, restLayers[0]);
    this.storeEachLayerImage(this.nrrd_states.currentIndex, restLayers[1]);
    this.setIsDrawFalse(1000);
  }

  // need to update
  undoLastPainting() {
    let { ctx, canvas } = this.setCurrentLayer();
    this.protectedData.Is_Draw = true;
    this.protectedData.canvases.drawingCanvasLayerMaster.width =
      this.protectedData.canvases.drawingCanvasLayerMaster.width;
    canvas.width = canvas.width;
    this.protectedData.mainPreSlices.repaint.call(
      this.protectedData.mainPreSlices
    );
    const currentUndoObj = this.getCurrentUndo();
    if (currentUndoObj.length > 0) {
      const undo = currentUndoObj[0];
      const layerUndos =
        undo.layers[this.gui_states.layer as "layer1" | "layer2" | "layer3"];
      const layerLen = layerUndos.length;
      // if (layerLen === 0) return;
      layerUndos.pop();

      if (layerLen > 0) {
        // const imageSrc = undo.undos[undo.undos.length - 1];
        const image = layerUndos[layerLen - 1];

        if (!!image) {
          ctx.drawImage(
            image,
            0,
            0,
            this.nrrd_states.changedWidth,
            this.nrrd_states.changedHeight
          );
        }
      }
      if (undo.layers.layer1.length > 0) {
        const image = undo.layers.layer1[undo.layers.layer1.length - 1];

        this.protectedData.ctxes.drawingLayerMasterCtx.drawImage(
          image,
          0,
          0,
          this.nrrd_states.changedWidth,
          this.nrrd_states.changedHeight
        );
      }
      if (undo.layers.layer2.length > 0) {
        const image = undo.layers.layer2[undo.layers.layer2.length - 1];
        this.protectedData.ctxes.drawingLayerMasterCtx.drawImage(
          image,
          0,
          0,
          this.nrrd_states.changedWidth,
          this.nrrd_states.changedHeight
        );
      }
      if (undo.layers.layer3.length > 0) {
        const image = undo.layers.layer3[undo.layers.layer3.length - 1];
        this.protectedData.ctxes.drawingLayerMasterCtx.drawImage(
          image,
          0,
          0,
          this.nrrd_states.changedWidth,
          this.nrrd_states.changedHeight
        );
      }
      this.protectedData.previousDrawingImage =
        this.protectedData.ctxes.drawingLayerMasterCtx.getImageData(
          0,
          0,
          this.protectedData.canvases.drawingCanvasLayerMaster.width,
          this.protectedData.canvases.drawingCanvasLayerMaster.height
        );
      this.storeAllImages(this.nrrd_states.currentIndex, this.gui_states.layer);
      this.setIsDrawFalse(1000);
    }
  }

  /****************************Store images (delegated to ImageStoreHelper)****************************************************/

  storeImageToAxis(
    index: number,
    paintedImages: IPaintImages,
    imageData: ImageData,
    axis?: "x" | "y" | "z"
  ) {
    this.imageStoreHelper.storeImageToAxis(index, paintedImages, imageData, axis);
  }

  storeAllImages(index: number, layer: string) {
    this.imageStoreHelper.storeAllImages(index, layer);
  }

  storeImageToLayer(
    index: number,
    canvas: HTMLCanvasElement,
    paintedImages: IPaintImages
  ) {
    return this.imageStoreHelper.storeImageToLayer(index, canvas, paintedImages);
  }

  storeEachLayerImage(index: number, layer: string) {
    this.imageStoreHelper.storeEachLayerImage(index, layer);
  }

  /******************************** Utils gui related functions (delegated to ContrastTool) ***************************************/

  setupConrastEvents(callback: (step: number, towards: "horizental" | "vertical") => void) {
    this.contrastTool.setupConrastEvents(callback);
  }

  configContrastDragMode = () => {
    this.contrastTool.configContrastDragMode();
  };

  removeContrastDragMode = () => {
    this.contrastTool.removeContrastDragMode();
  };

  updateSlicesContrast(value: number, flag: string) {
    this.contrastTool.updateSlicesContrast(value, flag);
  }

  repraintCurrentContrastSlice() {
    this.contrastTool.repraintCurrentContrastSlice();
  }
}
