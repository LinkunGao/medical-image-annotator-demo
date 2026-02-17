/**
 * ImageStoreHelper - Cross-axis image storage and pixel replacement
 *
 * Extracted from DrawToolCore.ts:
 * - storeAllImages / storeImageToAxis / storeImageToLayer / storeEachLayerImage
 * - sliceArrayH / sliceArrayV
 * - replaceVerticalColPixels / replaceHorizontalRowPixels
 * - checkSharedPlaceSlice / replaceArray / findSliceInSharedPlace
 *
 * Phase 2 Day 7: Updated to write/read MaskVolume alongside legacy IPaintImages.
 * Volume is the primary storage; IPaintImages kept for backward compatibility.
 */

import { BaseTool } from "./BaseTool";
import type { ToolContext } from "./BaseTool";
import type { IPaintImage, IPaintImages } from "../coreTools/coreType";
import { MaskVolume } from "../core";

export interface ImageStoreCallbacks {
  setEmptyCanvasSize: (axis?: "x" | "y" | "z") => void;
  drawImageOnEmptyImage: (canvas: HTMLCanvasElement) => void;
}

export class ImageStoreHelper extends BaseTool {
  private callbacks: ImageStoreCallbacks;

  constructor(ctx: ToolContext, callbacks: ImageStoreCallbacks) {
    super(ctx);
    this.callbacks = callbacks;
  }

  // ===== Volume Accessor Helpers (Phase 2) =====

  /**
   * Get MaskVolume for a specific layer.
   * Delegates to the volumes stored in protectedData.maskData.
   *
   * @param layer - "layer1", "layer2", or "layer3"
   * @returns MaskVolume for the given layer, or layer1 as fallback
   */
  private getVolumeForLayer(layer: string): MaskVolume {
    const { volumes } = this.ctx.protectedData.maskData;
    switch (layer) {
      case "layer1": return volumes.layer1;
      case "layer2": return volumes.layer2;
      case "layer3": return volumes.layer3;
      default: return volumes.layer1;
    }
  }

  /**
   * Get MaskVolume for the currently active layer.
   */
  private getCurrentVolume(): MaskVolume {
    return this.getVolumeForLayer(this.ctx.gui_states.layer);
  }

  /**
   * Get the canvas element for a specific layer.
   */
  private getCanvasForLayer(layer: string): HTMLCanvasElement {
    switch (layer) {
      case "layer1": return this.ctx.protectedData.canvases.drawingCanvasLayerOne;
      case "layer2": return this.ctx.protectedData.canvases.drawingCanvasLayerTwo;
      case "layer3": return this.ctx.protectedData.canvases.drawingCanvasLayerThree;
      default: return this.ctx.protectedData.canvases.drawingCanvasLayerMaster;
    }
  }

  // ===== Store Image To Axis =====

  /**
   * Phase 3: Simplified to be a no-op.
   * MaskVolume storage happens in storeAllImages via setSliceFromImageData.
   * This method kept for backward compatibility with existing call sites.
   */
  storeImageToAxis(
    _index: number,
    _paintedImages: IPaintImages,
    _imageData: ImageData,
    _axis?: "x" | "y" | "z"
  ): void {
    // No-op: MaskVolume is the primary storage, updated in storeAllImages
  }

  /**
   * Retrieve the drawn image for a given axis and slice.
   *
   * Phase 3: Reads exclusively from MaskVolume (no legacy fallback).
   */
  filterDrawedImage(
    axis: "x" | "y" | "z",
    sliceIndex: number,
    _paintedImages: IPaintImages
  ): IPaintImage | undefined {
    try {
      const volume = this.getCurrentVolume();
      if (volume) {
        const dims = volume.getDimensions();
        const [w, h] = axis === 'z' ? [dims.width, dims.height]
          : axis === 'y' ? [dims.width, dims.depth]
            : [dims.height, dims.depth];
        const imageData = new ImageData(w, h);
        const channelVis = this.ctx.gui_states.channelVisibility[this.ctx.gui_states.layer];
        volume.renderLabelSliceInto(sliceIndex, axis, imageData, channelVis);
        return { index: sliceIndex, image: imageData };
      }
    } catch (err) {
      console.warn(`filterDrawedImage: Failed to read slice ${sliceIndex} on ${axis}:`, err);
    }
    return undefined;
  }

  // ===== Store All Images (cross-axis sync) =====

  /**
   * Store all layer images for the current slice (cross-axis sync).
   *
   * Phase 2: Also writes into the current layer's MaskVolume.
   */
  storeAllImages(index: number, layer: string): void {
    const nrrd = this.ctx.nrrd_states;

    // Read from the individual layer canvas (NOT master) to preserve layer isolation
    const layerCanvas = this.getCanvasForLayer(layer);

    if (!nrrd.loadMaskJson && !this.ctx.gui_states.sphere && !this.ctx.gui_states.calculator) {
      this.callbacks.setEmptyCanvasSize();
      this.callbacks.drawImageOnEmptyImage(layerCanvas);
    }

    const imageData = this.ctx.protectedData.ctxes.emptyCtx.getImageData(
      0,
      0,
      this.ctx.protectedData.canvases.emptyCanvas.width,
      this.ctx.protectedData.canvases.emptyCanvas.height
    );

    // Write label data into 1-channel MaskVolume with RGB→channel reverse lookup
    try {
      const volume = this.getVolumeForLayer(layer);
      if (volume) {
        const activeChannel = this.ctx.gui_states.activeChannel || 1;
        // Phase 4 Fix: Pass channel visibility map to preserve hidden channels
        const channelVis = this.ctx.gui_states.channelVisibility[layer];

        volume.setSliceLabelsFromImageData(
          index,
          imageData,
          this.ctx.protectedData.axis,
          activeChannel,
          channelVis
        );
      }
    } catch (err) {
      // Volume not ready — skip
    }

    if (!nrrd.loadMaskJson && !this.ctx.gui_states.sphere && !this.ctx.gui_states.calculator) {
      // Notify parent component (legacy callback)
      this.ctx.nrrd_states.getMask(
        imageData,
        this.ctx.nrrd_states.currentIndex,
        layer,
        this.ctx.nrrd_states.nrrd_x_pixel,
        this.ctx.nrrd_states.nrrd_y_pixel,
        this.ctx.nrrd_states.clearAllFlag
      );
    }
  }


  // ===== Store Per-Layer Images =====

  /**
   * Store a single layer's canvas data to its MaskVolume.
   * Reads from the individual layer canvas (not master) and uses RGB→channel reverse lookup.
   */
  storeEachLayerImage(index: number, layer: string): void {
    const layerCanvas = this.getCanvasForLayer(layer);
    this.callbacks.setEmptyCanvasSize();
    this.callbacks.drawImageOnEmptyImage(layerCanvas);
    const imageData = this.ctx.protectedData.ctxes.emptyCtx.getImageData(
      0, 0,
      this.ctx.protectedData.canvases.emptyCanvas.width,
      this.ctx.protectedData.canvases.emptyCanvas.height
    );
    try {
      const volume = this.getVolumeForLayer(layer);
      if (volume) {
        const activeChannel = this.ctx.gui_states.activeChannel || 1;
        // Phase 4 Fix: Pass channel visibility map to preserve hidden channels
        const channelVis = this.ctx.gui_states.channelVisibility[layer];

        volume.setSliceLabelsFromImageData(
          index, imageData, this.ctx.protectedData.axis, activeChannel, channelVis
        );
      }
    } catch {
      // Volume not ready — skip
    }
  }

  /**
   * Phase 3: Simplified - extracts ImageData from canvas but no longer stores to paintImages.
   * Kept for backward compatibility with existing call sites.
   */
  storeImageToLayer(
    _index: number,
    canvas: HTMLCanvasElement,
    _paintedImages: IPaintImages
  ): ImageData {
    if (!this.ctx.nrrd_states.loadMaskJson) {
      this.callbacks.setEmptyCanvasSize();
      this.callbacks.drawImageOnEmptyImage(canvas);
    }
    const imageData = this.ctx.protectedData.ctxes.emptyCtx.getImageData(
      0,
      0,
      this.ctx.protectedData.canvases.emptyCanvas.width,
      this.ctx.protectedData.canvases.emptyCanvas.height
    );
    // No longer stores to paintedImages - MaskVolume is primary storage
    return imageData;
  }


  // ===== Array Slicing =====

  sliceArrayH(
    arr: Uint8ClampedArray,
    row: number,
    col: number
  ): Uint8ClampedArray[] {
    const arr2D: Uint8ClampedArray[] = [];
    for (let i = 0; i < row; i++) {
      const start = i * col * 4;
      const end = (i + 1) * col * 4;
      arr2D.push(arr.slice(start, end));
    }
    return arr2D;
  }

  sliceArrayV(
    arr: Uint8ClampedArray,
    row: number,
    col: number
  ): number[][] {
    const arr2D: number[][] = [];
    const base = col * 4;
    for (let i = 0; i < col; i++) {
      const temp: number[] = [];
      for (let j = 0; j < row; j++) {
        const index = base * j + i * 4;
        temp.push(arr[index]);
        temp.push(arr[index + 1]);
        temp.push(arr[index + 2]);
        temp.push(arr[index + 3]);
      }
      arr2D.push(temp);
    }
    return arr2D;
  }

  // ===== Cross-Axis Pixel Replacement =====

  replaceVerticalColPixels(
    paintImageArray: IPaintImage[],
    length: number,
    ratio: number,
    markedArr: number[][] | Uint8ClampedArray[],
    targetWidth: number,
    convertIndex: number
  ): void {
    for (let i = 0, len = length; i < len; i++) {
      const index = Math.floor(i * ratio);
      const convertImageArray = paintImageArray[i].image.data;
      const mark_data = markedArr[index];
      const base_a = targetWidth * 4;

      for (let j = 0, len2 = mark_data.length; j < len2; j += 4) {
        const start = (j / 4) * base_a + convertIndex * 4;
        convertImageArray[start] = mark_data[j];
        convertImageArray[start + 1] = mark_data[j + 1];
        convertImageArray[start + 2] = mark_data[j + 2];
        convertImageArray[start + 3] = mark_data[j + 3];
      }
    }
  }

  replaceHorizontalRowPixels(
    paintImageArray: IPaintImage[],
    length: number,
    ratio: number,
    markedArr: number[][] | Uint8ClampedArray[],
    targetWidth: number,
    convertIndex: number
  ): void {
    for (let i = 0, len = length; i < len; i++) {
      const index = Math.floor(i * ratio);
      const convertImageArray = paintImageArray[i].image.data;
      const mark_data = markedArr[index] as number[];
      const start = targetWidth * convertIndex * 4;
      for (let j = 0, len2 = mark_data.length; j < len2; j++) {
        convertImageArray[start + j] = mark_data[j];
      }
    }
  }

  // ===== Shared Place Utils =====

  checkSharedPlaceSlice(
    width: number,
    height: number,
    imageData: ImageData
  ): Uint8ClampedArray {
    let maskData = this.ctx.protectedData.ctxes.emptyCtx.createImageData(
      width,
      height
    ).data;

    if (
      this.ctx.nrrd_states.sharedPlace.z.includes(this.ctx.nrrd_states.currentIndex)
    ) {
      const sharedPlaceArr = this.findSliceInSharedPlace();
      sharedPlaceArr.push(imageData);
      if (sharedPlaceArr.length > 0) {
        for (let i = 0; i < sharedPlaceArr.length; i++) {
          this.replaceArray(maskData, sharedPlaceArr[i].data);
        }
      }
    } else {
      maskData = imageData.data;
    }
    return maskData;
  }

  replaceArray(
    mainArr: number[] | Uint8ClampedArray,
    replaceArr: number[] | Uint8ClampedArray
  ): void {
    for (let i = 0, len = replaceArr.length; i < len; i++) {
      if (replaceArr[i] === 0 || mainArr[i] !== 0) {
        continue;
      } else {
        mainArr[i] = replaceArr[i];
      }
    }
  }

  /**
   * Phase 3: Updated to read from MaskVolume instead of paintImages.
   */
  findSliceInSharedPlace(): ImageData[] {
    const sharedPlaceImages: ImageData[] = [];
    const base = Math.floor(
      this.ctx.nrrd_states.currentIndex *
      this.ctx.nrrd_states.ratios[this.ctx.protectedData.axis]
    );
    const volume = this.getCurrentVolume();
    const axis = this.ctx.protectedData.axis;

    if (!volume) {
      return sharedPlaceImages;
    }

    const dims = volume.getDimensions();
    const [w, h] = axis === 'z' ? [dims.width, dims.height]
      : axis === 'y' ? [dims.width, dims.depth]
        : [dims.height, dims.depth];
    const channelVis = this.ctx.gui_states.channelVisibility[this.ctx.gui_states.layer];

    // Check previous slices
    for (let i = 1; i <= 3; i++) {
      const index = this.ctx.nrrd_states.currentIndex - i;
      if (index < this.ctx.nrrd_states.minIndex) {
        break;
      }
      const newIndex = Math.floor(
        index * this.ctx.nrrd_states.ratios[axis]
      );
      if (newIndex === base) {
        try {
          const imageData = new ImageData(w, h);
          volume.renderLabelSliceInto(index, axis, imageData, channelVis);
          sharedPlaceImages.push(imageData);
        } catch {
          // Slice out of bounds - skip
        }
      }
    }

    // Check next slices
    for (let i = 1; i <= 3; i++) {
      const index = this.ctx.nrrd_states.currentIndex + i;
      if (index > this.ctx.nrrd_states.maxIndex) {
        break;
      }
      const newIndex = Math.floor(
        index * this.ctx.nrrd_states.ratios[axis]
      );
      if (newIndex === base) {
        try {
          const imageData = new ImageData(w, h);
          volume.renderLabelSliceInto(index, axis, imageData, channelVis);
          sharedPlaceImages.push(imageData);
        } catch {
          // Slice out of bounds - skip
        }
      }
    }

    return sharedPlaceImages;
  }

  // ===== Helper Methods =====

  private hasNonZeroPixels(imageData: ImageData): boolean {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] !== 0 || data[i + 1] !== 0 || data[i + 2] !== 0 || data[i + 3] !== 0) {
        return true;
      }
    }
    return false;
  }
}
