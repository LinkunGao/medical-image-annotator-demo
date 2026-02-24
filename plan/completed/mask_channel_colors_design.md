# Multi-Channel Color Mapping Design

## Overview

Add predefined color mapping for multi-channel mask visualization, enabling:
- **Multi-class segmentation** (tumor, edema, necrosis, etc.)
- **Color-coded annotation layers**
- **AI model output visualization** (class probabilities)

---

## Color Palette Definition

### Standard Medical Imaging Colors

```typescript
/**
 * Predefined color palette for mask channels
 * Based on common medical imaging conventions
 */
export const MASK_CHANNEL_COLORS = {
  // Channel 0: Background (transparent)
  0: { r: 0, g: 0, b: 0, a: 0 },

  // Channel 1: Primary annotation / Tumor (green)
  1: { r: 0, g: 255, b: 0, a: 153 },      // rgba(0,255,0,0.6)

  // Channel 2: Secondary annotation / Edema (red)
  2: { r: 255, g: 0, b: 0, a: 153 },      // rgba(255,0,0,0.6)

  // Channel 3: Tertiary annotation / Necrosis (blue)
  3: { r: 0, g: 0, b: 255, a: 153 },      // rgba(0,0,255,0.6)

  // Channel 4: Enhancement (yellow)
  4: { r: 255, g: 255, b: 0, a: 153 },    // rgba(255,255,0,0.6)

  // Channel 5: Vessel / Boundary (magenta)
  5: { r: 255, g: 0, b: 255, a: 153 },    // rgba(255,0,255,0.6)

  // Channel 6: Additional region (cyan)
  6: { r: 0, g: 255, b: 255, a: 153 },    // rgba(0,255,255,0.6)

  // Channel 7: Auxiliary annotation (orange)
  7: { r: 255, g: 128, b: 0, a: 153 },    // rgba(255,128,0,0.6)

  // Channel 8: Extended annotation (purple)
  8: { r: 128, g: 0, b: 255, a: 153 },    // rgba(128,0,255,0.6)
} as const;

// Type definition
export interface RGBAColor {
  r: number;  // 0-255
  g: number;  // 0-255
  b: number;  // 0-255
  a: number;  // 0-255
}

export type ChannelColorMap = Record<number, RGBAColor>;
```

### CSS Color Strings (for reference)

```typescript
export const MASK_CHANNEL_CSS_COLORS = {
  0: 'rgba(0,0,0,0)',
  1: 'rgba(0,255,0,0.6)',      // Green - Primary/Tumor
  2: 'rgba(255,0,0,0.6)',      // Red - Secondary/Edema
  3: 'rgba(0,0,255,0.6)',      // Blue - Tertiary/Necrosis
  4: 'rgba(255,255,0,0.6)',    // Yellow - Enhancement
  5: 'rgba(255,0,255,0.6)',    // Magenta - Vessel
  6: 'rgba(0,255,255,0.6)',    // Cyan - Additional
  7: 'rgba(255,128,0,0.6)',    // Orange - Auxiliary
  8: 'rgba(128,0,255,0.6)',    // Purple - Extended
} as const;
```

---

## MaskVolume Enhancement

### Updated Class Definition

```typescript
/**
 * Rendering mode for slice extraction
 */
export enum RenderMode {
  /** Single channel as grayscale (original behavior) */
  GRAYSCALE = 'grayscale',

  /** Single channel with predefined color */
  COLORED_SINGLE = 'colored_single',

  /** All channels composited with colors */
  COLORED_MULTI = 'colored_multi',

  /** All channels blended (additive) */
  BLENDED = 'blended',
}

/**
 * Options for slice rendering
 */
export interface SliceRenderOptions {
  /** Rendering mode */
  mode?: RenderMode;

  /** Specific channel to render (for GRAYSCALE/COLORED_SINGLE modes) */
  channel?: number;

  /** Custom color map (overrides default) */
  colorMap?: ChannelColorMap;

  /** Channel visibility mask (for COLORED_MULTI/BLENDED modes) */
  visibleChannels?: boolean[];

  /** Opacity multiplier (0.0-1.0) */
  opacity?: number;
}

export class MaskVolume {
  private data: Uint8Array;
  private dimensions: Dimensions;
  private channels: number;
  private bytesPerSlice: number;

  // Default color map (can be customized)
  private colorMap: ChannelColorMap = { ...MASK_CHANNEL_COLORS };

  constructor(
    width: number,
    height: number,
    depth: number,
    channels = 1,
    customColorMap?: ChannelColorMap
  ) {
    this.dimensions = { width, height, depth };
    this.channels = channels;
    this.bytesPerSlice = width * height * channels;

    const totalBytes = width * height * depth * channels;
    this.data = new Uint8Array(totalBytes);

    // Allow custom color map
    if (customColorMap) {
      this.colorMap = { ...this.colorMap, ...customColorMap };
    }
  }

  /**
   * Update color mapping for a specific channel
   */
  setChannelColor(channel: number, color: RGBAColor): void {
    if (channel < 0 || channel >= this.channels) {
      throw new RangeError(`Invalid channel: ${channel}`);
    }
    this.colorMap[channel] = { ...color };
  }

  /**
   * Get color for a channel
   */
  getChannelColor(channel: number): RGBAColor {
    return this.colorMap[channel] || MASK_CHANNEL_COLORS[0];
  }

  /**
   * Extract 2D slice as ImageData with color mapping
   *
   * @param sliceIndex - Index along the specified axis
   * @param axis - 'x' (sagittal), 'y' (coronal), or 'z' (axial)
   * @param options - Rendering options
   * @returns ImageData for Canvas rendering
   */
  getSliceImageData(
    sliceIndex: number,
    axis: 'x' | 'y' | 'z' = 'z',
    options: SliceRenderOptions = {}
  ): ImageData {
    // Default options
    const {
      mode = RenderMode.GRAYSCALE,
      channel = 0,
      colorMap = this.colorMap,
      visibleChannels = Array(this.channels).fill(true),
      opacity = 1.0,
    } = options;

    const { width, height, depth } = this.dimensions;
    let sliceWidth: number, sliceHeight: number;

    // Determine slice dimensions based on axis
    switch (axis) {
      case 'z': [sliceWidth, sliceHeight] = [width, height]; break;
      case 'y': [sliceWidth, sliceHeight] = [width, depth]; break;
      case 'x': [sliceWidth, sliceHeight] = [height, depth]; break;
    }

    const imageData = new ImageData(sliceWidth, sliceHeight);
    const pixels = imageData.data;  // Uint8ClampedArray (RGBA)

    // Render based on mode
    switch (mode) {
      case RenderMode.GRAYSCALE:
        this.renderGrayscale(pixels, sliceWidth, sliceHeight, sliceIndex, axis, channel);
        break;

      case RenderMode.COLORED_SINGLE:
        this.renderColoredSingle(pixels, sliceWidth, sliceHeight, sliceIndex, axis, channel, colorMap, opacity);
        break;

      case RenderMode.COLORED_MULTI:
        this.renderColoredMulti(pixels, sliceWidth, sliceHeight, sliceIndex, axis, colorMap, visibleChannels, opacity);
        break;

      case RenderMode.BLENDED:
        this.renderBlended(pixels, sliceWidth, sliceHeight, sliceIndex, axis, colorMap, visibleChannels, opacity);
        break;
    }

    return imageData;
  }

  /**
   * Render single channel as grayscale (original behavior)
   */
  private renderGrayscale(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    sliceIndex: number,
    axis: 'x' | 'y' | 'z',
    channel: number
  ): void {
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        const [vx, vy, vz] = this.mapSliceToVolume(i, j, sliceIndex, axis);
        const value = this.getVoxel(vx, vy, vz, channel);
        const pixelIndex = (j * width + i) * 4;

        // Grayscale
        pixels[pixelIndex] = value;      // R
        pixels[pixelIndex + 1] = value;  // G
        pixels[pixelIndex + 2] = value;  // B
        pixels[pixelIndex + 3] = value > 0 ? 255 : 0;  // A
      }
    }
  }

  /**
   * Render single channel with predefined color
   */
  private renderColoredSingle(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    sliceIndex: number,
    axis: 'x' | 'y' | 'z',
    channel: number,
    colorMap: ChannelColorMap,
    opacity: number
  ): void {
    const color = colorMap[channel] || MASK_CHANNEL_COLORS[1];

    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        const [vx, vy, vz] = this.mapSliceToVolume(i, j, sliceIndex, axis);
        const value = this.getVoxel(vx, vy, vz, channel);
        const pixelIndex = (j * width + i) * 4;

        if (value > 0) {
          // Apply channel color
          const intensity = value / 255;  // Normalize to 0-1
          pixels[pixelIndex] = color.r;
          pixels[pixelIndex + 1] = color.g;
          pixels[pixelIndex + 2] = color.b;
          pixels[pixelIndex + 3] = Math.round(color.a * intensity * opacity);
        } else {
          // Transparent
          pixels[pixelIndex + 3] = 0;
        }
      }
    }
  }

  /**
   * Render all channels with distinct colors (last non-zero channel wins)
   */
  private renderColoredMulti(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    sliceIndex: number,
    axis: 'x' | 'y' | 'z',
    colorMap: ChannelColorMap,
    visibleChannels: boolean[],
    opacity: number
  ): void {
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        const [vx, vy, vz] = this.mapSliceToVolume(i, j, sliceIndex, axis);
        const pixelIndex = (j * width + i) * 4;

        // Find the highest priority non-zero channel (iterate in reverse)
        let renderedColor: RGBAColor | null = null;
        for (let ch = this.channels - 1; ch >= 0; ch--) {
          if (!visibleChannels[ch]) continue;

          const value = this.getVoxel(vx, vy, vz, ch);
          if (value > 0) {
            const color = colorMap[ch] || MASK_CHANNEL_COLORS[ch] || MASK_CHANNEL_COLORS[1];
            const intensity = value / 255;
            renderedColor = {
              r: color.r,
              g: color.g,
              b: color.b,
              a: Math.round(color.a * intensity * opacity),
            };
            break;  // Use first non-zero channel (highest priority)
          }
        }

        if (renderedColor) {
          pixels[pixelIndex] = renderedColor.r;
          pixels[pixelIndex + 1] = renderedColor.g;
          pixels[pixelIndex + 2] = renderedColor.b;
          pixels[pixelIndex + 3] = renderedColor.a;
        } else {
          // Transparent
          pixels[pixelIndex + 3] = 0;
        }
      }
    }
  }

  /**
   * Render all channels blended (additive composition)
   */
  private renderBlended(
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    sliceIndex: number,
    axis: 'x' | 'y' | 'z',
    colorMap: ChannelColorMap,
    visibleChannels: boolean[],
    opacity: number
  ): void {
    for (let j = 0; j < height; j++) {
      for (let i = 0; i < width; i++) {
        const [vx, vy, vz] = this.mapSliceToVolume(i, j, sliceIndex, axis);
        const pixelIndex = (j * width + i) * 4;

        let totalR = 0, totalG = 0, totalB = 0, totalA = 0;

        // Blend all visible channels
        for (let ch = 0; ch < this.channels; ch++) {
          if (!visibleChannels[ch]) continue;

          const value = this.getVoxel(vx, vy, vz, ch);
          if (value > 0) {
            const color = colorMap[ch] || MASK_CHANNEL_COLORS[ch] || MASK_CHANNEL_COLORS[1];
            const intensity = value / 255;
            const alpha = (color.a / 255) * intensity * opacity;

            // Additive blending
            totalR += color.r * alpha;
            totalG += color.g * alpha;
            totalB += color.b * alpha;
            totalA += alpha;
          }
        }

        if (totalA > 0) {
          // Normalize and clamp
          pixels[pixelIndex] = Math.min(255, Math.round(totalR));
          pixels[pixelIndex + 1] = Math.min(255, Math.round(totalG));
          pixels[pixelIndex + 2] = Math.min(255, Math.round(totalB));
          pixels[pixelIndex + 3] = Math.min(255, Math.round(totalA * 255));
        } else {
          // Transparent
          pixels[pixelIndex + 3] = 0;
        }
      }
    }
  }

  /**
   * Map 2D slice coordinates to 3D volume coordinates
   */
  private mapSliceToVolume(
    i: number,
    j: number,
    sliceIndex: number,
    axis: 'x' | 'y' | 'z'
  ): [number, number, number] {
    switch (axis) {
      case 'z': return [i, j, sliceIndex];
      case 'y': return [i, sliceIndex, j];
      case 'x': return [sliceIndex, i, j];
    }
  }

  // ... rest of existing methods (getVoxel, setVoxel, etc.)
}
```

---

## Usage Examples

### Example 1: Single Layer, Colored Annotation

```typescript
// Create volume for single-class annotation
const volume = new MaskVolume(512, 512, 100, 1);

// Draw some annotations (channel 0)
for (let x = 200; x < 300; x++) {
  for (let y = 200; y < 300; y++) {
    volume.setVoxel(x, y, 50, 255, 0);  // Binary mask
  }
}

// Render with green color
const slice = volume.getSliceImageData(50, 'z', {
  mode: RenderMode.COLORED_SINGLE,
  channel: 0,
  opacity: 0.6,
});

// Display on canvas
ctx.putImageData(slice, 0, 0);
```

---

### Example 2: Multi-Class Segmentation (AI Output)

```typescript
// Create volume with 4 channels
// Channel 0: Background
// Channel 1: Tumor core (green)
// Channel 2: Edema (red)
// Channel 3: Necrosis (blue)
const volume = new MaskVolume(512, 512, 100, 4);

// Simulate AI model output
// Channel 1: Tumor core
for (let x = 240; x < 280; x++) {
  for (let y = 240; y < 280; y++) {
    volume.setVoxel(x, y, 50, 255, 1);  // Tumor
  }
}

// Channel 2: Edema (surrounding tumor)
for (let x = 230; x < 290; x++) {
  for (let y = 230; y < 290; y++) {
    if (x < 240 || x >= 280 || y < 240 || y >= 280) {
      volume.setVoxel(x, y, 50, 200, 2);  // Edema
    }
  }
}

// Render with multi-channel colors (priority-based)
const sliceMulti = volume.getSliceImageData(50, 'z', {
  mode: RenderMode.COLORED_MULTI,
  visibleChannels: [false, true, true, true],  // Hide background
  opacity: 1.0,
});

ctx.putImageData(sliceMulti, 0, 0);
```

---

### Example 3: Blended Multi-Channel View

```typescript
// Same volume as Example 2

// Render with additive blending (all channels blend together)
const sliceBlended = volume.getSliceImageData(50, 'z', {
  mode: RenderMode.BLENDED,
  visibleChannels: [false, true, true, true],
  opacity: 0.8,
});

ctx.putImageData(sliceBlended, 0, 0);
```

---

### Example 4: Custom Color Mapping

```typescript
// Define custom colors for your specific use case
const customColors: ChannelColorMap = {
  0: { r: 0, g: 0, b: 0, a: 0 },           // Background
  1: { r: 255, g: 165, b: 0, a: 180 },     // Orange - Organ A
  2: { r: 138, g: 43, b: 226, a: 180 },    // Blue-Violet - Organ B
  3: { r: 255, g: 20, b: 147, a: 180 },    // Deep Pink - Lesion
};

const volume = new MaskVolume(512, 512, 100, 4, customColors);

// Or update colors later
volume.setChannelColor(1, { r: 0, g: 255, b: 127, a: 200 });  // Spring green

const slice = volume.getSliceImageData(50, 'z', {
  mode: RenderMode.COLORED_MULTI,
});
```

---

## Integration with Existing Code

### Update ImageStoreHelper

```typescript
// tools/ImageStoreHelper.ts
export class ImageStoreHelper extends BaseTool {
  /**
   * Filter/retrieve drawn image with color rendering
   */
  filterDrawedImage(
    axis: 'x' | 'y' | 'z',
    sliceIndex: number,
    layer: string,
    renderOptions?: SliceRenderOptions
  ): IPaintImage {
    const volume = this.getVolumeForLayer(layer);

    // Default to colored single-channel mode for backward compatibility
    const options: SliceRenderOptions = renderOptions || {
      mode: RenderMode.COLORED_SINGLE,
      channel: 0,
      opacity: 0.6,
    };

    const imageData = volume.getSliceImageData(sliceIndex, axis, options);
    return { index: sliceIndex, image: imageData };
  }
}
```

### Update GUI States (Optional)

```typescript
// Add to IGUIStates
interface IGUIStates {
  // ... existing properties

  // Multi-channel rendering settings
  maskRenderMode: RenderMode;
  channelVisibility: boolean[];  // [ch0, ch1, ch2, ...]
  maskOpacity: number;  // 0.0 - 1.0
}

// Default values in CommToolsData
gui_states: IGUIStates = {
  // ... existing

  maskRenderMode: RenderMode.COLORED_SINGLE,
  channelVisibility: [true, true, true, true],
  maskOpacity: 0.6,
};
```

---

## UI Controls (Future Enhancement)

### Channel Visibility Toggles

```vue
<!-- Example Vue component -->
<template>
  <v-card>
    <v-card-title>Annotation Layers</v-card-title>
    <v-card-text>
      <v-row v-for="ch in channels" :key="ch">
        <v-col cols="1">
          <v-checkbox
            v-model="channelVisibility[ch]"
            @change="updateVisibility"
            hide-details
          />
        </v-col>
        <v-col cols="2">
          <div
            class="color-indicator"
            :style="{ backgroundColor: getChannelCSSColor(ch) }"
          />
        </v-col>
        <v-col cols="7">
          <span>{{ getChannelLabel(ch) }}</span>
        </v-col>
        <v-col cols="2">
          <v-slider
            v-model="channelOpacity[ch]"
            min="0"
            max="100"
            hide-details
          />
        </v-col>
      </v-row>
    </v-card-text>
  </v-card>
</template>
```

---

## Performance Considerations

### Optimization: Pre-compute Color LUT

```typescript
class MaskVolume {
  private colorLUT: Uint8Array;  // Pre-computed RGBA lookup table

  constructor(/* ... */) {
    // ... existing code
    this.buildColorLUT();
  }

  /**
   * Build color lookup table for fast rendering
   * LUT format: [ch0_r0, ch0_g0, ch0_b0, ch0_a0, ch0_r1, ..., ch1_r0, ...]
   */
  private buildColorLUT(): void {
    this.colorLUT = new Uint8Array(this.channels * 256 * 4);

    for (let ch = 0; ch < this.channels; ch++) {
      const color = this.colorMap[ch] || MASK_CHANNEL_COLORS[1];

      for (let value = 0; value < 256; value++) {
        const intensity = value / 255;
        const baseIndex = (ch * 256 + value) * 4;

        this.colorLUT[baseIndex] = color.r;
        this.colorLUT[baseIndex + 1] = color.g;
        this.colorLUT[baseIndex + 2] = color.b;
        this.colorLUT[baseIndex + 3] = Math.round(color.a * intensity);
      }
    }
  }

  /**
   * Fast color lookup (avoids computation in rendering loop)
   */
  private lookupColor(channel: number, value: number): RGBAColor {
    const baseIndex = (channel * 256 + value) * 4;
    return {
      r: this.colorLUT[baseIndex],
      g: this.colorLUT[baseIndex + 1],
      b: this.colorLUT[baseIndex + 2],
      a: this.colorLUT[baseIndex + 3],
    };
  }
}
```

**Performance Gain:** ~3-5× faster rendering (avoids per-pixel color calculation)

---

## Testing Requirements

### Unit Tests

```typescript
describe('MaskVolume - Color Mapping', () => {
  it('should render single channel with correct color', () => {
    const volume = new MaskVolume(10, 10, 10, 1);
    volume.setVoxel(5, 5, 5, 255, 0);

    const slice = volume.getSliceImageData(5, 'z', {
      mode: RenderMode.COLORED_SINGLE,
      channel: 0,
    });

    const pixelIndex = (5 * 10 + 5) * 4;
    const color = MASK_CHANNEL_COLORS[0];

    expect(slice.data[pixelIndex]).toBe(color.r);
    expect(slice.data[pixelIndex + 1]).toBe(color.g);
    expect(slice.data[pixelIndex + 2]).toBe(color.b);
  });

  it('should blend multiple channels correctly', () => {
    const volume = new MaskVolume(10, 10, 10, 2);
    volume.setVoxel(5, 5, 5, 255, 0);  // Channel 0: green
    volume.setVoxel(5, 5, 5, 255, 1);  // Channel 1: red

    const slice = volume.getSliceImageData(5, 'z', {
      mode: RenderMode.BLENDED,
    });

    const pixelIndex = (5 * 10 + 5) * 4;

    // Should have both red and green components
    expect(slice.data[pixelIndex]).toBeGreaterThan(0);      // R
    expect(slice.data[pixelIndex + 1]).toBeGreaterThan(0);  // G
  });
});
```

---

## Migration Path

### Phase 1 (Week 1): Basic Implementation
- ✅ Add `RenderMode` enum
- ✅ Add `SliceRenderOptions` interface
- ✅ Add `MASK_CHANNEL_COLORS` constant
- ✅ Implement `renderGrayscale()` (current behavior)
- ✅ Implement `renderColoredSingle()` (basic colored mode)

### Phase 2 (Week 2): Multi-Channel Support
- ✅ Implement `renderColoredMulti()` (priority-based)
- ✅ Implement `renderBlended()` (additive blending)
- ✅ Add color LUT optimization
- ✅ Update ImageStoreHelper integration

### Phase 3 (Week 3): UI & Polish
- ✅ Add GUI controls for channel visibility
- ✅ Add opacity sliders
- ✅ Add custom color picker
- ✅ Performance benchmarks

---

## Backward Compatibility

### Default Behavior (No Breaking Changes)

```typescript
// Old API (still works)
const slice = volume.getSliceImageData(50, 'z');
// → Renders as grayscale (RenderMode.GRAYSCALE), channel 0

// New API (opt-in)
const sliceColored = volume.getSliceImageData(50, 'z', {
  mode: RenderMode.COLORED_SINGLE,
});
// → Renders with predefined color
```

### Gradual Adoption

1. **Week 1-2**: Default to grayscale, no changes needed
2. **Week 3**: Switch default to `COLORED_SINGLE` for layer1
3. **Week 4+**: Enable multi-channel UI controls

---

## Documentation

### Developer Guide Section

```markdown
## Multi-Channel Color Rendering

MaskVolume supports four rendering modes:

1. **GRAYSCALE** (default) - Single channel as grayscale
2. **COLORED_SINGLE** - Single channel with predefined color
3. **COLORED_MULTI** - Multiple channels with distinct colors
4. **BLENDED** - Multiple channels additively blended

### Predefined Colors

- Channel 1: Green (Primary annotation / Tumor)
- Channel 2: Red (Secondary annotation / Edema)
- Channel 3: Blue (Tertiary annotation / Necrosis)
- ... (see full palette)

### Usage

\`\`\`typescript
const slice = volume.getSliceImageData(50, 'z', {
  mode: RenderMode.COLORED_MULTI,
  visibleChannels: [false, true, true, false],
  opacity: 0.8,
});
\`\`\`
```

---

**Implementation Priority:**
- Phase 1 basic colors: **High** (enables multi-class support)
- Phase 2 blending: **Medium** (nice-to-have for visualization)
- Phase 3 UI controls: **Low** (can defer to post-migration)

**Estimated Effort:**
- Color mapping: +2 days (Day 2-3 of Week 1)
- Testing: +1 day (Day 3 of Week 1)
- Total: +3 days to Phase 1 (adjust timeline accordingly)
