/**
 * DragSliceTool - Drag-based slice navigation
 *
 * Extracted from DragOperator.ts:
 * - updateIndex
 * - drawDragSlice
 * - drawMaskToLayerCtx
 * - cleanCanvases
 * - updateShowNumDiv / updateCurrentContrastSlice
 */

import { BaseTool } from "./BaseTool";
import type { ToolContext } from "./BaseTool";

export interface DragSliceCallbacks {
  setSyncsliceNum: () => void;
  setIsDrawFalse: (target: number) => void;
  flipDisplayImageByAxis: () => void;
  setEmptyCanvasSize: (axis?: "x" | "y" | "z") => void;
  getCachedSliceImageData: (layer: string, axis: "x" | "y" | "z", sliceIndex: number) => ImageData | null;
}

interface IDragEffectCanvases {
  drawingCanvasLayerMaster: HTMLCanvasElement;
  drawingCanvasLayerOne: HTMLCanvasElement;
  drawingCanvasLayerTwo: HTMLCanvasElement;
  drawingCanvasLayerThree: HTMLCanvasElement;
  displayCanvas: HTMLCanvasElement;
  [key: string]: HTMLCanvasElement;
}

export class DragSliceTool extends BaseTool {
  private callbacks: DragSliceCallbacks;
  private showDragNumberDiv: HTMLDivElement;
  private dragEffectCanvases: IDragEffectCanvases;

  constructor(
    ctx: ToolContext,
    callbacks: DragSliceCallbacks,
    showDragNumberDiv: HTMLDivElement,
    dragEffectCanvases: IDragEffectCanvases
  ) {
    super(ctx);
    this.callbacks = callbacks;
    this.showDragNumberDiv = showDragNumberDiv;
    this.dragEffectCanvases = dragEffectCanvases;
  }

  setShowDragNumberDiv(div: HTMLDivElement): void {
    this.showDragNumberDiv = div;
  }

  // ===== Update Index =====

  updateIndex(move: number): void {
    let sliceModifyNum = 0;
    let contrastModifyNum = 0;
    const nrrd = this.ctx.nrrd_states;

    if (nrrd.showContrast) {
      contrastModifyNum = move % this.ctx.protectedData.displaySlices.length;
      nrrd.contrastNum += contrastModifyNum;
      if (move > 0) {
        if (nrrd.currentIndex <= nrrd.maxIndex) {
          sliceModifyNum = Math.floor(
            move / this.ctx.protectedData.displaySlices.length
          );
          if (nrrd.contrastNum > this.ctx.protectedData.displaySlices.length - 1) {
            sliceModifyNum += 1;
            nrrd.contrastNum -= this.ctx.protectedData.displaySlices.length;
          }
        } else {
          sliceModifyNum = 0;
        }
      } else {
        sliceModifyNum = Math.ceil(
          move / this.ctx.protectedData.displaySlices.length
        );
        if (nrrd.contrastNum < 0) {
          nrrd.contrastNum += this.ctx.protectedData.displaySlices.length;
          sliceModifyNum -= 1;
        }
      }
    } else {
      sliceModifyNum = move;
    }

    let newIndex = nrrd.currentIndex + sliceModifyNum;

    if (newIndex != nrrd.currentIndex || nrrd.showContrast) {
      if (newIndex > nrrd.maxIndex) {
        newIndex = nrrd.maxIndex;
        nrrd.contrastNum = this.ctx.protectedData.displaySlices.length - 1;
      } else if (newIndex < nrrd.minIndex) {
        newIndex = nrrd.minIndex;
        nrrd.contrastNum = 0;
      } else {
        this.ctx.protectedData.mainPreSlices.index = newIndex * nrrd.RSARatio;
        this.callbacks.setSyncsliceNum();

        let isSameIndex = true;
        if (newIndex != nrrd.currentIndex) {
          nrrd.switchSliceFlag = true;
          isSameIndex = false;
        }

        this.cleanCanvases(isSameIndex);

        if (nrrd.changedWidth === 0) {
          nrrd.changedWidth = nrrd.originWidth;
          nrrd.changedHeight = nrrd.originHeight;
        }

        const needToUpdateSlice = this.updateCurrentContrastSlice();
        needToUpdateSlice.repaint.call(needToUpdateSlice);
        nrrd.currentIndex = newIndex;
        this.drawDragSlice(needToUpdateSlice.canvas);
      }

      nrrd.oldIndex = newIndex * nrrd.RSARatio;
      this.updateShowNumDiv(nrrd.contrastNum);
    }
  }

  // ===== Draw Drag Slice =====

  private drawDragSlice(canvas: any): void {
    const nrrd = this.ctx.nrrd_states;

    // Draw base image (CT/MRI scan)
    this.ctx.protectedData.ctxes.displayCtx.save();
    this.callbacks.flipDisplayImageByAxis();
    this.ctx.protectedData.ctxes.displayCtx.drawImage(
      canvas,
      0,
      0,
      nrrd.changedWidth,
      nrrd.changedHeight
    );
    this.ctx.protectedData.ctxes.displayCtx.restore();

    // Phase 3: Draw ALL 3 layers from MaskVolume (multi-layer compositing)
    if (nrrd.switchSliceFlag) {
      const { volumes } = this.ctx.protectedData.maskData;
      const axis = this.ctx.protectedData.axis;
      const sliceIndex = nrrd.currentIndex;

      // Draw layer1 (to drawingLayerOneCtx)
      this.drawMaskLayerFromVolume(
        volumes.layer1,
        axis,
        sliceIndex,
        this.ctx.protectedData.ctxes.drawingLayerOneCtx
      );

      // Draw layer2 (to drawingLayerTwoCtx)
      this.drawMaskLayerFromVolume(
        volumes.layer2,
        axis,
        sliceIndex,
        this.ctx.protectedData.ctxes.drawingLayerTwoCtx
      );

      // Draw layer3 (to drawingLayerThreeCtx)
      this.drawMaskLayerFromVolume(
        volumes.layer3,
        axis,
        sliceIndex,
        this.ctx.protectedData.ctxes.drawingLayerThreeCtx
      );

      // Composite all layers to master canvas
      this.compositeAllLayers();

      nrrd.switchSliceFlag = false;
    }
  }

  /**
   * Draw a single layer's mask from MaskVolume to its canvas context
   *
   * Phase 3: Uses cached ImageData for better performance
   */
  private drawMaskLayerFromVolume(
    volume: any,
    axis: "x" | "y" | "z",
    sliceIndex: number,
    ctx: CanvasRenderingContext2D
  ): void {
    try {
      // Determine which layer this volume belongs to
      const { volumes } = this.ctx.protectedData.maskData;
      let layerName = "layer1";
      if (volume === volumes.layer2) layerName = "layer2";
      else if (volume === volumes.layer3) layerName = "layer3";

      // Get cached slice data
      const imageData = this.callbacks.getCachedSliceImageData(layerName, axis, sliceIndex);

      if (!imageData) return;

      this.callbacks.setEmptyCanvasSize();
      this.ctx.protectedData.ctxes.emptyCtx.putImageData(imageData, 0, 0);
      ctx.drawImage(
        this.ctx.protectedData.canvases.emptyCanvas,
        0,
        0,
        this.ctx.nrrd_states.changedWidth,
        this.ctx.nrrd_states.changedHeight
      );
    } catch (err) {
      // Slice out of bounds or volume not ready - skip silently
      console.warn(`Failed to draw mask layer for slice ${sliceIndex}:`, err);
    }
  }

  /**
   * Composite all 3 layer canvases to the master display canvas
   *
   * This ensures all layers are visible simultaneously (fixes multi-layer display bug)
   */
  private compositeAllLayers(): void {
    const masterCtx = this.ctx.protectedData.ctxes.drawingLayerMasterCtx;
    const width = this.ctx.nrrd_states.changedWidth;
    const height = this.ctx.nrrd_states.changedHeight;

    // Clear master canvas
    masterCtx.clearRect(0, 0, width, height);

    // Composite layer1
    masterCtx.drawImage(
      this.ctx.protectedData.canvases.drawingCanvasLayerOne,
      0,
      0,
      width,
      height
    );

    // Composite layer2
    masterCtx.drawImage(
      this.ctx.protectedData.canvases.drawingCanvasLayerTwo,
      0,
      0,
      width,
      height
    );

    // Composite layer3
    masterCtx.drawImage(
      this.ctx.protectedData.canvases.drawingCanvasLayerThree,
      0,
      0,
      width,
      height
    );
  }

  // ===== Canvas Cleanup =====

  private cleanCanvases(flag: boolean): void {
    for (const name in this.dragEffectCanvases) {
      if (flag) {
        if (name === "displayCanvas") {
          this.dragEffectCanvases.displayCanvas.width =
            this.dragEffectCanvases.displayCanvas.width;
        }
      } else {
        this.dragEffectCanvases[name].width =
          this.dragEffectCanvases[name].width;
      }
    }
  }

  // ===== UI Updates =====

  updateShowNumDiv(contrastNum: number): void {
    if (this.ctx.protectedData.mainPreSlices) {
      const nrrd = this.ctx.nrrd_states;
      if (nrrd.currentIndex > nrrd.maxIndex) {
        nrrd.currentIndex = nrrd.maxIndex;
      }
      if (nrrd.showContrast) {
        this.showDragNumberDiv.innerHTML = `ContrastNum: ${contrastNum}/${
          this.ctx.protectedData.displaySlices.length - 1
        } SliceNum: ${nrrd.currentIndex}/${nrrd.maxIndex}`;
      } else {
        this.showDragNumberDiv.innerHTML = `SliceNum: ${nrrd.currentIndex}/${nrrd.maxIndex}`;
      }
    }
  }

  updateCurrentContrastSlice(): any {
    this.ctx.protectedData.currentShowingSlice =
      this.ctx.protectedData.displaySlices[this.ctx.nrrd_states.contrastNum];
    return this.ctx.protectedData.currentShowingSlice;
  }
}
