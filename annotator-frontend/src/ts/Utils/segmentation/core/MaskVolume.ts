/**
 * MaskVolume — True 3D Volumetric Mask Storage
 *
 * Stores annotation masks in a single contiguous Uint8Array with the memory
 * layout  [z][y][x][channel]  (slice-major order).
 *
 * Design goals:
 *  - Contiguous memory for optimal cache locality and minimal GC pressure.
 *  - Multi-channel support (binary mask, confidence, labels, etc.).
 *  - O(1) voxel access with full bounds checking.
 *  - Slice extraction to ImageData for Canvas rendering (all 3 axes).
 *  - Multi-channel color mapping with 4 render modes.
 *
 * Memory comparison (512 × 512 × 100, 1 channel):
 *   Old ImageData approach ≈ 4.4 GB   →   MaskVolume ≈ 25 MB  (~99 % reduction)
 *
 * @example
 * ```ts
 * const vol = new MaskVolume(512, 512, 100);   // 1 channel (default)
 * vol.setVoxel(256, 256, 50, 255);             // paint centre voxel
 *
 * // Grayscale slice (backward compatible)
 * const slice = vol.getSliceImageData(50, 'z');
 *
 * // Colored slice
 * const colored = vol.getSliceImageData(50, 'z', {
 *   mode: RenderMode.COLORED_SINGLE,
 *   channel: 0,
 *   opacity: 0.6,
 * });
 * ```
 */

import type {
  Dimensions,
  RGBAColor,
  ChannelColorMap,
  SliceRenderOptions,
} from './types';
import { RenderMode, MASK_CHANNEL_COLORS } from './types';

export class MaskVolume {
  // ── Private state ──────────────────────────────────────────────────

  /** Contiguous backing buffer — layout [z][y][x][channel]. */
  private data: Uint8Array;

  /** Volume size in voxels. */
  private readonly dims: Dimensions;

  /** Number of value channels per voxel (≥ 1). */
  private readonly numChannels: number;

  /**
   * Number of bytes in one complete z-slice.
   * Equal to  width × height × channels.
   */
  private readonly bytesPerSlice: number;

  /** Per-channel color map used for colored rendering modes. */
  private colorMap: ChannelColorMap;

  // ── Constructor ────────────────────────────────────────────────────

  /**
   * Create a new MaskVolume.
   *
   * All voxels are initialised to **0**.
   *
   * @param width          Number of voxels along the X axis (≥ 1).
   * @param height         Number of voxels along the Y axis (≥ 1).
   * @param depth          Number of voxels along the Z axis (≥ 1).
   * @param channels       Number of channels per voxel (default 1).
   * @param customColorMap Optional color map to override defaults.
   *
   * @throws {RangeError} If any dimension or the channel count is < 1.
   */
  constructor(
    width: number,
    height: number,
    depth: number,
    channels = 1,
    customColorMap?: ChannelColorMap,
  ) {
    if (width < 1 || height < 1 || depth < 1) {
      throw new RangeError(
        `Dimensions must be ≥ 1, got (${width}, ${height}, ${depth})`
      );
    }
    if (channels < 1) {
      throw new RangeError(`Channels must be ≥ 1, got ${channels}`);
    }

    this.dims = { width, height, depth };
    this.numChannels = channels;
    this.bytesPerSlice = width * height * channels;

    const totalBytes = width * height * depth * channels;
    this.data = new Uint8Array(totalBytes); // zero-initialised by spec

    // Copy default colors, then overlay any custom overrides
    this.colorMap = {} as ChannelColorMap;
    for (const key of Object.keys(MASK_CHANNEL_COLORS)) {
      const k = Number(key);
      const c = MASK_CHANNEL_COLORS[k];
      this.colorMap[k] = { r: c.r, g: c.g, b: c.b, a: c.a };
    }
    if (customColorMap) {
      for (const key of Object.keys(customColorMap)) {
        const k = Number(key);
        const c = customColorMap[k];
        this.colorMap[k] = { r: c.r, g: c.g, b: c.b, a: c.a };
      }
    }
  }

  // ── Index calculation ──────────────────────────────────────────────

  /**
   * Map 3D coordinates + channel to a flat 1D index.
   *
   * **Memory layout (slice-major):**
   * ```
   * index = (z × height × width × channels)
   *       + (y × width × channels)
   *       + (x × channels)
   *       + channel
   * ```
   *
   * @param x       Voxel column  (0 … width − 1).
   * @param y       Voxel row     (0 … height − 1).
   * @param z       Slice index   (0 … depth − 1).
   * @param channel Channel index (0 … channels − 1).
   * @returns Flat 1D index into `this.data`.
   *
   * @throws {RangeError} If any coordinate or channel is out of bounds.
   */
  private getIndex(x: number, y: number, z: number, channel = 0): number {
    if (
      x < 0 || x >= this.dims.width ||
      y < 0 || y >= this.dims.height ||
      z < 0 || z >= this.dims.depth ||
      channel < 0 || channel >= this.numChannels
    ) {
      throw new RangeError(
        `Out of bounds: (x=${x}, y=${y}, z=${z}, ch=${channel}) ` +
        `for volume (${this.dims.width}×${this.dims.height}×${this.dims.depth}×${this.numChannels})`
      );
    }

    return (
      z * this.bytesPerSlice +
      y * this.dims.width * this.numChannels +
      x * this.numChannels +
      channel
    );
  }

  // ── Voxel access ───────────────────────────────────────────────────

  /**
   * Read a single voxel value.
   *
   * @param x       Voxel column  (0 … width − 1).
   * @param y       Voxel row     (0 … height − 1).
   * @param z       Slice index   (0 … depth − 1).
   * @param channel Channel index (default 0).
   * @returns The stored value (0 – 255).
   *
   * @throws {RangeError} If any coordinate is out of bounds.
   */
  getVoxel(x: number, y: number, z: number, channel = 0): number {
    return this.data[this.getIndex(x, y, z, channel)];
  }

  /**
   * Write a single voxel value.
   *
   * Values are clamped to the Uint8 range [0, 255] by the typed array.
   *
   * @param x       Voxel column  (0 … width − 1).
   * @param y       Voxel row     (0 … height − 1).
   * @param z       Slice index   (0 … depth − 1).
   * @param value   New voxel value (0 – 255).
   * @param channel Channel index (default 0).
   *
   * @throws {RangeError} If any coordinate is out of bounds.
   */
  setVoxel(x: number, y: number, z: number, value: number, channel = 0): void {
    this.data[this.getIndex(x, y, z, channel)] = value;
  }

  // ── Color map management ──────────────────────────────────────────

  /**
   * Update the color for a specific channel.
   *
   * @param channel Channel index to update.
   * @param color   New RGBA color.
   *
   * @throws {RangeError} If channel is out of range.
   */
  setChannelColor(channel: number, color: RGBAColor): void {
    if (channel < 0 || channel >= this.numChannels) {
      throw new RangeError(
        `Invalid channel: ${channel} (volume has ${this.numChannels} channels)`
      );
    }
    this.colorMap[channel] = { r: color.r, g: color.g, b: color.b, a: color.a };
  }

  /**
   * Get the current color for a channel.
   *
   * Falls back to the background color (transparent) if no color is defined.
   *
   * @param channel Channel index.
   * @returns A copy of the RGBA color.
   */
  getChannelColor(channel: number): RGBAColor {
    const c = this.colorMap[channel] ?? MASK_CHANNEL_COLORS[0];
    return { r: c.r, g: c.g, b: c.b, a: c.a };
  }

  // ── Slice extraction ──────────────────────────────────────────────

  /**
   * Extract a 2D slice as an ImageData with color mapping.
   *
   * Slice dimensions depend on the axis:
   *
   * | Axis | Plane    | Width  | Height |
   * |------|----------|--------|--------|
   * | `z`  | Axial    | width  | height |
   * | `y`  | Coronal  | width  | depth  |
   * | `x`  | Sagittal | height | depth  |
   *
   * @param sliceIndex Index along the specified axis.
   * @param axis       `'x'` (sagittal), `'y'` (coronal), or `'z'` (axial).
   * @param options    Rendering options (mode, channel, colors, etc.).
   * @returns ImageData ready for `ctx.putImageData()`.
   *
   * @throws {RangeError} If sliceIndex is out of bounds for the given axis.
   *
   * @example
   * ```ts
   * // Grayscale (default, backward compatible)
   * const gs = vol.getSliceImageData(50, 'z');
   *
   * // Colored single-channel
   * const cs = vol.getSliceImageData(50, 'z', {
   *   mode: RenderMode.COLORED_SINGLE,
   *   channel: 0,
   * });
   *
   * // Multi-channel priority
   * const mc = vol.getSliceImageData(50, 'z', {
   *   mode: RenderMode.COLORED_MULTI,
   *   visibleChannels: [false, true, true, true],
   * });
   * ```
   */
  getSliceImageData(
    sliceIndex: number,
    axis: 'x' | 'y' | 'z' = 'z',
    options: SliceRenderOptions = {},
  ): ImageData {
    // Validate sliceIndex against the correct axis dimension
    this.validateSliceIndex(sliceIndex, axis);

    const {
      mode = RenderMode.GRAYSCALE,
      channel = 0,
      colorMap = this.colorMap,
      visibleChannels,
      opacity = 1.0,
    } = options;

    // Build default visibleChannels if not provided
    const visCh = visibleChannels ?? new Array(this.numChannels).fill(true) as boolean[];

    const [sliceWidth, sliceHeight] = this.getSliceDimensions(axis);
    const imageData = new ImageData(sliceWidth, sliceHeight);
    const pixels = imageData.data; // Uint8ClampedArray (RGBA)

    switch (mode) {
      case RenderMode.GRAYSCALE:
        this.renderGrayscale(pixels, sliceWidth, sliceHeight, sliceIndex, axis, channel);
        break;
      case RenderMode.COLORED_SINGLE:
        this.renderColoredSingle(pixels, sliceWidth, sliceHeight, sliceIndex, axis, channel, colorMap, opacity);
        break;
      case RenderMode.COLORED_MULTI:
        this.renderColoredMulti(pixels, sliceWidth, sliceHeight, sliceIndex, axis, colorMap, visCh, opacity);
        break;
      case RenderMode.BLENDED:
        this.renderBlended(pixels, sliceWidth, sliceHeight, sliceIndex, axis, colorMap, visCh, opacity);
        break;
    }

    return imageData;
  }

  // ── Slice insertion ───────────────────────────────────────────────

  /**
   * Write a 2D ImageData back into the volume for the given axis/slice.
   *
   * When the volume has **4 channels**, all RGBA components are stored
   * (ch0=R, ch1=G, ch2=B, ch3=A) for lossless round-trip.
   * Otherwise, the **R channel** of each pixel is used as grayscale.
   *
   * @param sliceIndex Index along the specified axis.
   * @param imageData  Source ImageData (expected dimensions must match the axis).
   * @param axis       `'x'`, `'y'`, or `'z'` (default `'z'`).
   * @param channel    Target channel (default 0, ignored when numChannels >= 4).
   *
   * @throws {RangeError} If sliceIndex is out of bounds.
   * @throws {Error}      If imageData dimensions don't match.
   *
   * @example
   * ```ts
   * const imgData = ctx.getImageData(0, 0, 512, 512);
   * vol.setSliceFromImageData(50, imgData, 'z');
   * ```
   */
  setSliceFromImageData(
    sliceIndex: number,
    imageData: ImageData,
    axis: 'x' | 'y' | 'z' = 'z',
    channel = 0,
  ): void {
    this.validateSliceIndex(sliceIndex, axis);

    const [expectedW, expectedH] = this.getSliceDimensions(axis);
    if (imageData.width !== expectedW || imageData.height !== expectedH) {
      throw new Error(
        `ImageData size mismatch: expected ${expectedW}×${expectedH}, ` +
        `got ${imageData.width}×${imageData.height}`
      );
    }

    const pixels = imageData.data;
    const { width, height } = this.dims;
    const ch = this.numChannels;
    const volData = this.data;

    if (ch >= 4) {
      // Store all 4 RGBA channels — direct memory access (no function calls)
      if (axis === 'z') {
        // Z-axis: slice data is contiguous — direct bulk copy
        const offset = sliceIndex * this.bytesPerSlice;
        volData.set(pixels.subarray(0, this.bytesPerSlice), offset);
      } else if (axis === 'y') {
        // Y-axis: each row (fixed z, fixed y, varying x) is contiguous
        const rowBytes = width * ch;
        let px = 0;
        for (let j = 0; j < expectedH; j++) {
          const rowStart = j * height * width * ch + sliceIndex * width * ch;
          volData.set(pixels.subarray(px, px + rowBytes), rowStart);
          px += rowBytes;
        }
      } else {
        // X-axis: per-pixel inline math
        let px = 0;
        for (let j = 0; j < expectedH; j++) {
          const zOffset = j * height * width * ch;
          for (let i = 0; i < expectedW; i++) {
            const baseIdx = zOffset + i * width * ch + sliceIndex * ch;
            volData[baseIdx] = pixels[px];
            volData[baseIdx + 1] = pixels[px + 1];
            volData[baseIdx + 2] = pixels[px + 2];
            volData[baseIdx + 3] = pixels[px + 3];
            px += 4;
          }
        }
      }
    } else {
      // Legacy: single-channel grayscale (R channel only)
      for (let j = 0; j < expectedH; j++) {
        for (let i = 0; i < expectedW; i++) {
          const [vx, vy, vz] = this.mapSliceToVolume(i, j, sliceIndex, axis);
          const px = (j * expectedW + i) * 4;
          this.data[this.getIndex(vx, vy, vz, channel)] = pixels[px];
        }
      }
    }
  }

  /**
   * Extract a 2D slice as raw RGBA ImageData (lossless round-trip).
   *
   * Requires the volume to have **≥ 4 channels** (ch0=R, ch1=G, ch2=B, ch3=A).
   * Returns the exact pixel data that was stored via `setSliceFromImageData`,
   * bypassing all render modes.
   *
   * @param sliceIndex Index along the specified axis.
   * @param axis       `'x'`, `'y'`, or `'z'` (default `'z'`).
   * @returns ImageData with the stored RGBA values.
   *
   * @throws {RangeError} If sliceIndex is out of bounds.
   * @throws {Error}      If the volume has fewer than 4 channels.
   */
  getSliceRawImageData(
    sliceIndex: number,
    axis: 'x' | 'y' | 'z' = 'z',
  ): ImageData {
    if (this.numChannels < 4) {
      throw new Error(
        `getSliceRawImageData requires ≥ 4 channels, volume has ${this.numChannels}`
      );
    }
    this.validateSliceIndex(sliceIndex, axis);

    const { width, height } = this.dims;
    const ch = this.numChannels;
    const [sliceWidth, sliceHeight] = this.getSliceDimensions(axis);
    const imageData = new ImageData(sliceWidth, sliceHeight);
    const pixels = imageData.data;
    const volData = this.data;

    if (axis === 'z') {
      // Z-axis (axial): slice data is contiguous in memory — direct bulk copy
      const offset = sliceIndex * this.bytesPerSlice;
      pixels.set(volData.subarray(offset, offset + this.bytesPerSlice));
    } else if (axis === 'y') {
      // Y-axis (coronal): each row (fixed z, fixed y, varying x) is contiguous
      // mapping: (i → x, sliceIndex → y, j → z)
      const rowBytes = width * ch;
      let px = 0;
      for (let j = 0; j < sliceHeight; j++) {
        const rowStart = j * height * width * ch + sliceIndex * width * ch;
        pixels.set(volData.subarray(rowStart, rowStart + rowBytes), px);
        px += rowBytes;
      }
    } else {
      // X-axis (sagittal): pixels not contiguous, but avoid function call overhead
      // mapping: (sliceIndex → x, i → y, j → z)
      let px = 0;
      for (let j = 0; j < sliceHeight; j++) {
        const zOffset = j * height * width * ch;
        for (let i = 0; i < sliceWidth; i++) {
          const baseIdx = zOffset + i * width * ch + sliceIndex * ch;
          pixels[px] = volData[baseIdx];
          pixels[px + 1] = volData[baseIdx + 1];
          pixels[px + 2] = volData[baseIdx + 2];
          pixels[px + 3] = volData[baseIdx + 3];
          px += 4;
        }
      }
    }

    return imageData;
  }

  /**
   * Write slice data into an existing ImageData buffer (zero-allocation).
   *
   * Same semantics as {@link getSliceRawImageData} but avoids creating a new
   * ImageData object on every call.  The caller is responsible for providing
   * a buffer whose dimensions match the expected slice size.
   *
   * All pixels are fully overwritten — no clearing is needed beforehand.
   *
   * @param sliceIndex Index along the specified axis.
   * @param axis       `'x'`, `'y'`, or `'z'` (default `'z'`).
   * @param target     Pre-allocated ImageData to write into.
   *
   * @throws {Error}      If the volume has fewer than 4 channels.
   * @throws {RangeError} If sliceIndex is out of bounds.
   * @throws {Error}      If target dimensions don't match the slice.
   */
  getSliceRawImageDataInto(
    sliceIndex: number,
    axis: 'x' | 'y' | 'z' = 'z',
    target: ImageData,
  ): void {
    if (this.numChannels < 4) {
      throw new Error(
        `getSliceRawImageDataInto requires ≥ 4 channels, volume has ${this.numChannels}`
      );
    }
    this.validateSliceIndex(sliceIndex, axis);

    const [sliceWidth, sliceHeight] = this.getSliceDimensions(axis);
    if (target.width !== sliceWidth || target.height !== sliceHeight) {
      throw new Error(
        `Buffer size mismatch: expected ${sliceWidth}×${sliceHeight}, ` +
        `got ${target.width}×${target.height}`
      );
    }

    const { width, height } = this.dims;
    const ch = this.numChannels;
    const pixels = target.data;
    const volData = this.data;

    if (axis === 'z') {
      const offset = sliceIndex * this.bytesPerSlice;
      pixels.set(volData.subarray(offset, offset + this.bytesPerSlice));
    } else if (axis === 'y') {
      const rowBytes = width * ch;
      let px = 0;
      for (let j = 0; j < sliceHeight; j++) {
        const rowStart = j * height * width * ch + sliceIndex * width * ch;
        pixels.set(volData.subarray(rowStart, rowStart + rowBytes), px);
        px += rowBytes;
      }
    } else {
      let px = 0;
      for (let j = 0; j < sliceHeight; j++) {
        const zOffset = j * height * width * ch;
        for (let i = 0; i < sliceWidth; i++) {
          const baseIdx = zOffset + i * width * ch + sliceIndex * ch;
          pixels[px] = volData[baseIdx];
          pixels[px + 1] = volData[baseIdx + 1];
          pixels[px + 2] = volData[baseIdx + 2];
          pixels[px + 3] = volData[baseIdx + 3];
          px += 4;
        }
      }
    }
  }

  // ── Label-based storage (1-channel volumes) ────────────────────────

  /**
  /**
   * Store label data from canvas RGBA ImageData into a 1-channel volume.
   *
   * For each pixel: matches the RGB color against MASK_CHANNEL_COLORS to
   * determine which channel label to store. If no match is found, falls
   * back to `activeChannel`. Transparent pixels (alpha === 0) are stored as 0.
   *
   * This is the write counterpart to `renderLabelSliceInto`.
   *
   * @param sliceIndex     Index along the specified axis.
   * @param imageData      Canvas ImageData (RGBA) to convert.
   * @param axis           `'x'`, `'y'`, or `'z'`.
   * @param activeChannel  Fallback label for pixels whose RGB doesn't match any channel (1-8).
   * @param channelVisible Optional map of visible channels (true=visible, false=hidden).
   *                       If provided, data for hidden channels will be preserved
   *                       when the canvas pixel is transparent.
   */
  setSliceLabelsFromImageData(
    sliceIndex: number,
    imageData: ImageData,
    axis: 'x' | 'y' | 'z' = 'z',
    activeChannel: number = 1,
    channelVisible?: Record<number, boolean>,
  ): void {
    this.validateSliceIndex(sliceIndex, axis);

    const [expectedW, expectedH] = this.getSliceDimensions(axis);
    if (imageData.width !== expectedW || imageData.height !== expectedH) {
      throw new Error(
        `ImageData size mismatch: expected ${expectedW}×${expectedH}, ` +
        `got ${imageData.width}×${imageData.height}`
      );
    }

    // Build RGB→channel lookup map for O(1) reverse lookup
    const rgbToChannel = MaskVolume.buildRgbToChannelMap();

    const pixels = imageData.data;

    // Alpha threshold to ignore anti-aliased edge fringe from canvas fill().
    // Pixels with alpha < 128 are treated as transparent to prevent mask growth
    // on each save→reload round-trip (semi-transparent edges would otherwise
    // become fully opaque labels, expanding the mask by ~1px).
    const ALPHA_THRESHOLD = 128;

    for (let j = 0; j < expectedH; j++) {
      for (let i = 0; i < expectedW; i++) {
        const [vx, vy, vz] = this.mapSliceToVolume(i, j, sliceIndex, axis);
        const px = (j * expectedW + i) * 4;
        const alpha = pixels[px + 3];

        if (alpha < ALPHA_THRESHOLD) {
          // Transparent or semi-transparent fringe

          if (channelVisible) {
            // Check existing value in the volume
            const existingLabel = this.data[this.getIndex(vx, vy, vz, 0)];
            // If existing label belongs to a hidden channel, PRESERVE IT
            if (existingLabel !== 0 && channelVisible[existingLabel] === false) {
              continue; // Skip overwrite, keeping the hidden channel's data
            }
          }

          // Otherwise, clear it (background label)
          this.data[this.getIndex(vx, vy, vz, 0)] = 0;
          continue;
        }

        // Match RGB against known channel colors
        const r = pixels[px];
        const g = pixels[px + 1];
        const b = pixels[px + 2];
        const key = (r << 16) | (g << 8) | b;
        const matchedChannel = rgbToChannel.get(key);

        this.data[this.getIndex(vx, vy, vz, 0)] = matchedChannel !== undefined
          ? matchedChannel
          : activeChannel;
      }
    }
  }

  /**
   * Build a Map from RGB packed integer to channel label for reverse lookup.
   * Uses MASK_CHANNEL_COLORS channels 1-8 (skips 0 = transparent).
   */
  private static buildRgbToChannelMap(): Map<number, number> {
    const map = new Map<number, number>();
    for (let ch = 1; ch <= 8; ch++) {
      const color = MASK_CHANNEL_COLORS[ch];
      if (color) {
        const key = (color.r << 16) | (color.g << 8) | color.b;
        map.set(key, ch);
      }
    }
    return map;
  }

  // ── Label-based rendering (1-channel volumes) ─────────────────────

  /**
   * Render a 1-channel label slice into a pre-allocated RGBA ImageData buffer.
   *
   * Each voxel stores a label value (0-8). Label 0 = transparent.
   * Labels 1-8 are mapped to colors via MASK_CHANNEL_COLORS, filtered
   * by the channelVisible array.
   *
   * @param sliceIndex   Index along the specified axis.
   * @param axis         `'x'`, `'y'`, or `'z'`.
   * @param target       Pre-allocated ImageData buffer (must match slice dimensions).
   * @param channelVisible  Array where index N indicates if channel N is visible.
   *                        If undefined, all channels are visible.
   * @param opacity      Opacity multiplier 0.0–1.0 (default 1.0).
   */
  renderLabelSliceInto(
    sliceIndex: number,
    axis: 'x' | 'y' | 'z' = 'z',
    target: ImageData,
    channelVisible?: Record<number, boolean>,
    opacity: number = 1.0,
  ): void {
    this.validateSliceIndex(sliceIndex, axis);

    const [sliceWidth, sliceHeight] = this.getSliceDimensions(axis);
    if (target.width !== sliceWidth || target.height !== sliceHeight) {
      throw new Error(
        `Buffer size mismatch: expected ${sliceWidth}×${sliceHeight}, ` +
        `got ${target.width}×${target.height}`
      );
    }

    const pixels = target.data;

    for (let j = 0; j < sliceHeight; j++) {
      for (let i = 0; i < sliceWidth; i++) {
        const [vx, vy, vz] = this.mapSliceToVolume(i, j, sliceIndex, axis);
        const label = this.data[this.getIndex(vx, vy, vz, 0)];
        const px = (j * sliceWidth + i) * 4;

        if (label === 0) {
          pixels[px] = 0;
          pixels[px + 1] = 0;
          pixels[px + 2] = 0;
          pixels[px + 3] = 0;
          continue;
        }

        // Check channel visibility
        if (channelVisible && !channelVisible[label]) {
          pixels[px] = 0;
          pixels[px + 1] = 0;
          pixels[px + 2] = 0;
          pixels[px + 3] = 0;
          continue;
        }

        const color = this.colorMap[label] ?? MASK_CHANNEL_COLORS[label] ?? MASK_CHANNEL_COLORS[1];
        pixels[px] = color.r;
        pixels[px + 1] = color.g;
        pixels[px + 2] = color.b;
        pixels[px + 3] = Math.round(color.a * opacity);
      }
    }
  }

  // ── Accessors ──────────────────────────────────────────────────────

  /**
   * Return a copy of the volume dimensions.
   *
   * @returns `{ width, height, depth }` — a fresh object (safe to mutate).
   */
  getDimensions(): Dimensions {
    return { ...this.dims };
  }

  /**
   * Return the number of channels per voxel.
   *
   * @returns Channel count (≥ 1).
   */
  getChannels(): number {
    return this.numChannels;
  }

  /**
   * Return total memory used by the backing buffer, in bytes.
   *
   * @returns `width × height × depth × channels` bytes.
   *
   * @example
   * ```ts
   * const vol = new MaskVolume(512, 512, 100);
   * vol.getMemoryUsage(); // 26_214_400 (~25 MB)
   * ```
   */
  getMemoryUsage(): number {
    return this.data.byteLength;
  }

  // ── Utility methods ─────────────────────────────────────────────────

  /**
   * Return a **reference** to the raw backing buffer.
   *
   * Use this for direct read access (e.g. serialisation, GPU upload).
   * Mutating the returned array mutates the volume.
   *
   * @returns The underlying Uint8Array.
   *
   * @example
   * ```ts
   * // Serialise for network transfer
   * const bytes = vol.getRawData();
   * socket.send(bytes.buffer);
   * ```
   */
  getRawData(): Uint8Array {
    return this.data;
  }

  /**
   * Replace the entire backing buffer.
   *
   * The provided array **must** have exactly the same length as the
   * current buffer (`width × height × depth × channels`).
   *
   * @param newData Replacement data.
   * @throws {Error} If the length does not match.
   *
   * @example
   * ```ts
   * // Restore from a saved snapshot
   * const saved = new Uint8Array(savedBuffer);
   * vol.setRawData(saved);
   * ```
   */
  setRawData(newData: Uint8Array): void {
    if (newData.length !== this.data.length) {
      throw new Error(
        `Data length mismatch: expected ${this.data.length}, got ${newData.length}`
      );
    }
    this.data = newData;
  }

  /**
   * Create an independent deep copy of this volume.
   *
   * The clone has the same dimensions, channels, data, and color map
   * but shares no references with the original.
   *
   * @returns A new MaskVolume with identical content.
   *
   * @example
   * ```ts
   * // Undo support: snapshot before an operation
   * const snapshot = vol.clone();
   * performEdit(vol);
   * // Rollback: vol.setRawData(snapshot.getRawData());
   * ```
   */
  clone(): MaskVolume {
    const copy = new MaskVolume(
      this.dims.width,
      this.dims.height,
      this.dims.depth,
      this.numChannels,
    );
    copy.data.set(this.data);
    // Deep-copy the color map
    for (const key of Object.keys(this.colorMap)) {
      const k = Number(key);
      const c = this.colorMap[k];
      copy.colorMap[k] = { r: c.r, g: c.g, b: c.b, a: c.a };
    }
    return copy;
  }

  /**
   * Zero every voxel in the entire volume (all channels).
   *
   * @example
   * ```ts
   * vol.clear();
   * vol.getVoxel(256, 256, 50); // 0
   * ```
   */
  clear(): void {
    this.data.fill(0);
  }

  /**
   * Zero every voxel in a single slice along the given axis.
   *
   * If `channel` is provided, only that channel is cleared;
   * otherwise **all** channels in the slice are cleared.
   *
   * @param sliceIndex Index along the specified axis.
   * @param axis       `'x'`, `'y'`, or `'z'` (default `'z'`).
   * @param channel    Optional channel to clear (default: all).
   *
   * @throws {RangeError} If sliceIndex is out of bounds.
   *
   * @example
   * ```ts
   * // Erase a single axial slice
   * vol.clearSlice(50, 'z');
   *
   * // Erase only channel 1 of slice 50
   * vol.clearSlice(50, 'z', 1);
   * ```
   */
  clearSlice(
    sliceIndex: number,
    axis: 'x' | 'y' | 'z' = 'z',
    channel?: number,
  ): void {
    this.validateSliceIndex(sliceIndex, axis);

    const [sliceW, sliceH] = this.getSliceDimensions(axis);

    for (let j = 0; j < sliceH; j++) {
      for (let i = 0; i < sliceW; i++) {
        const [vx, vy, vz] = this.mapSliceToVolume(i, j, sliceIndex, axis);
        if (channel !== undefined) {
          this.data[this.getIndex(vx, vy, vz, channel)] = 0;
        } else {
          for (let ch = 0; ch < this.numChannels; ch++) {
            this.data[this.getIndex(vx, vy, vz, ch)] = 0;
          }
        }
      }
    }
  }

  // ── Private helpers ───────────────────────────────────────────────

  /**
   * Get the 2D slice dimensions for a given axis.
   *
   * @returns `[width, height]` of the slice.
   */
  private getSliceDimensions(axis: 'x' | 'y' | 'z'): [number, number] {
    const { width, height, depth } = this.dims;
    switch (axis) {
      case 'z': return [width, height];
      case 'y': return [width, depth];
      case 'x': return [height, depth];
    }
  }

  /**
   * Validate that a slice index is within bounds for the given axis.
   *
   * @throws {RangeError} If out of bounds.
   */
  private validateSliceIndex(sliceIndex: number, axis: 'x' | 'y' | 'z'): void {
    const max =
      axis === 'x' ? this.dims.width :
        axis === 'y' ? this.dims.height :
          this.dims.depth;

    if (sliceIndex < 0 || sliceIndex >= max) {
      throw new RangeError(
        `Slice index ${sliceIndex} out of bounds for axis '${axis}' (max ${max - 1})`
      );
    }
  }

  /**
   * Map 2D slice coordinates (i, j) to 3D volume coordinates (x, y, z).
   *
   * | Axis | Mapping                         |
   * |------|---------------------------------|
   * | `z`  | (i → x, j → y, sliceIndex → z) |
   * | `y`  | (i → x, sliceIndex → y, j → z) |
   * | `x`  | (sliceIndex → x, i → y, j → z) |
   */
  private mapSliceToVolume(
    i: number,
    j: number,
    sliceIndex: number,
    axis: 'x' | 'y' | 'z',
  ): [number, number, number] {
    switch (axis) {
      case 'z': return [i, j, sliceIndex];
      case 'y': return [i, sliceIndex, j];
      case 'x': return [sliceIndex, i, j];
    }
  }

  // ── Render modes ──────────────────────────────────────────────────

  /**
   * Render a single channel as grayscale (original behaviour).
   *
   * Non-zero voxels are fully opaque (A = 255), zero voxels are
   * transparent (A = 0).
   */
  private renderGrayscale(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    sliceIndex: number,
    axis: 'x' | 'y' | 'z',
    channel: number,
  ): void {
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        const [vx, vy, vz] = this.mapSliceToVolume(i, j, sliceIndex, axis);
        const value = this.data[this.getIndex(vx, vy, vz, channel)];
        const px = (j * width + i) * 4;

        pixels[px] = value; // R
        pixels[px + 1] = value; // G
        pixels[px + 2] = value; // B
        pixels[px + 3] = value > 0 ? 255 : 0; // A: binary mask
      }
    }
  }

  /**
   * Render a single channel with its predefined color.
   *
   * Alpha is modulated by the voxel intensity and the opacity multiplier.
   */
  private renderColoredSingle(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    sliceIndex: number,
    axis: 'x' | 'y' | 'z',
    channel: number,
    colorMap: ChannelColorMap,
    opacity: number,
  ): void {
    const color = colorMap[channel] ?? MASK_CHANNEL_COLORS[1];

    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        const [vx, vy, vz] = this.mapSliceToVolume(i, j, sliceIndex, axis);
        const value = this.data[this.getIndex(vx, vy, vz, channel)];
        const px = (j * width + i) * 4;

        if (value > 0) {
          const intensity = value / 255;
          pixels[px] = color.r;
          pixels[px + 1] = color.g;
          pixels[px + 2] = color.b;
          pixels[px + 3] = Math.round(color.a * intensity * opacity);
        } else {
          pixels[px + 3] = 0;
        }
      }
    }
  }

  /**
   * Render all visible channels with distinct colors.
   *
   * The **highest-index** non-zero visible channel wins (priority-based).
   */
  private renderColoredMulti(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    sliceIndex: number,
    axis: 'x' | 'y' | 'z',
    colorMap: ChannelColorMap,
    visibleChannels: boolean[],
    opacity: number,
  ): void {
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        const [vx, vy, vz] = this.mapSliceToVolume(i, j, sliceIndex, axis);
        const px = (j * width + i) * 4;

        let found = false;

        // Iterate highest-to-lowest channel; first non-zero wins
        for (let ch = this.numChannels - 1; ch >= 0; ch--) {
          if (!visibleChannels[ch]) continue;

          const value = this.data[this.getIndex(vx, vy, vz, ch)];
          if (value > 0) {
            const color = colorMap[ch] ?? MASK_CHANNEL_COLORS[ch] ?? MASK_CHANNEL_COLORS[1];
            const intensity = value / 255;
            pixels[px] = color.r;
            pixels[px + 1] = color.g;
            pixels[px + 2] = color.b;
            pixels[px + 3] = Math.round(color.a * intensity * opacity);
            found = true;
            break;
          }
        }

        if (!found) {
          pixels[px + 3] = 0;
        }
      }
    }
  }

  /**
   * Render all visible channels with additive blending.
   *
   * Each channel contributes its color weighted by intensity × opacity.
   * RGB values are clamped to 255.
   */
  private renderBlended(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    sliceIndex: number,
    axis: 'x' | 'y' | 'z',
    colorMap: ChannelColorMap,
    visibleChannels: boolean[],
    opacity: number,
  ): void {
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        const [vx, vy, vz] = this.mapSliceToVolume(i, j, sliceIndex, axis);
        const px = (j * width + i) * 4;

        let totalR = 0;
        let totalG = 0;
        let totalB = 0;
        let totalA = 0;

        for (let ch = 0; ch < this.numChannels; ch++) {
          if (!visibleChannels[ch]) continue;

          const value = this.data[this.getIndex(vx, vy, vz, ch)];
          if (value > 0) {
            const color = colorMap[ch] ?? MASK_CHANNEL_COLORS[ch] ?? MASK_CHANNEL_COLORS[1];
            const intensity = value / 255;
            const alpha = (color.a / 255) * intensity * opacity;

            totalR += color.r * alpha;
            totalG += color.g * alpha;
            totalB += color.b * alpha;
            totalA += alpha;
          }
        }

        if (totalA > 0) {
          pixels[px] = Math.min(255, Math.round(totalR));
          pixels[px + 1] = Math.min(255, Math.round(totalG));
          pixels[px + 2] = Math.min(255, Math.round(totalB));
          pixels[px + 3] = Math.min(255, Math.round(totalA * 255));
        } else {
          pixels[px + 3] = 0;
        }
      }
    }
  }
}
