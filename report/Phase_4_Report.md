# Phase 4: Rendering Pipeline - Report

**Completed**: True
**Date**: 2026-02-03

---

## AI_error.md Check

AI_error.md 已检查，本 Phase 未违反已记录错误约束：
1. **不硬编码路径**: MaskRenderer 不包含任何硬编码路径，Canvas 通过 `setTarget()` 注入
2. **不 import 项目级模块**: 仅使用 `../core/` 相对导入，不依赖 `@/` 项目路径
3. **不擅自删除代码**: 仅新增文件，未修改或删除现有功能代码
4. **遵循依赖注入模式**: Canvas 和 managers 通过 `setTarget()` 和 `setManagers()` 注入，无直接依赖

---

## Summary

Phase 4 implements the Rendering Pipeline for the segmentation module refactoring. This phase creates the `MaskRenderer` class that reads mask data from `LayerManager` (Uint8Array slices), applies `VisibilityManager` filtering, and composites multiple layers onto a target Canvas with zoom scaling and global alpha transparency.

---

## Tasks Completed

### 4.1 Canvas Architecture (Design)

Documented the new 3-canvas architecture:

| Canvas | Role | Layer Position |
|--------|------|---------------|
| `displayCanvas` | NRRD slice image + contrast | Bottom |
| `drawingLayer` | Tool previews (outlines, cursors, crosshair) | Middle |
| `maskDisplayCanvas` | Composited mask data from all layers | Top |

> Note: The actual canvas reduction (removing old 8-canvas setup in CommToolsData.ts) is deferred to Phase 6 Integration, as it modifies project-level code.

---

### 4.2 MaskRenderer

#### [NEW] `rendering/MaskRenderer.ts`

Core renderer that composites Uint8Array data onto Canvas:

| Method | Description |
|--------|-------------|
| `setTarget(canvas)` | Inject the target canvas for rendering |
| `setManagers(layers, visibility)` | Inject LayerManager and VisibilityManager for rAF loop |
| `updateConfig(config)` | Update render state (sliceIndex, axis, sizeFactor, globalAlpha); auto-triggers dirty |
| `render(layers, visibility, sliceIndex, axis, sizeFactor, globalAlpha)` | Direct render: composites all visible layers |
| `requestRender()` | Request rAF-batched re-render |
| `markDirty(rect?)` | Mark region or whole canvas as dirty |
| `startLoop()` / `stopLoop()` | Start/stop continuous animation loop |
| `setRenderCallback(cb)` | Optional callback with per-frame statistics |
| `dispose()` | Release all resources |

#### Exported Helper: `buildLayerImageData()`

Pure function for converting Uint8Array channel data to ImageData RGBA pixels:

```typescript
export function buildLayerImageData(
    sliceData: Uint8Array,
    width: number,
    height: number,
    isVisible: (channel: ChannelValue) => boolean,
): ImageData | null
```

Exported separately for unit testing without Canvas mocks.

---

### 4.3 Rendering Pipeline

#### Data Flow

```
Tool.onPointerUp()
    ↓
MaskLayer.applyBrush() / fillPolygon()
    ↓
Returns Delta[] (voxel changes)
    ↓
UndoManager.push(deltas)
    ↓
requestRender() → sets dirty flag
    ↓
requestAnimationFrame callback
    ↓
MaskRenderer.render():
    1. Clear target canvas
    2. Set imageSmoothingEnabled = false (nearest-neighbor)
    3. Set globalAlpha
    4. For each visible layer (layer1 → layer2 → layer3):
       a. Get slice Uint8Array from LayerManager
       b. buildLayerImageData() → ImageData (filtered by visibility)
       c. putImageData on offscreen buffer (original dimensions)
       d. drawImage: buffer → target (scaled by sizeFactor)
    5. Reset globalAlpha to 1.0
    6. Clear dirty state
    7. Invoke render callback with stats
```

#### Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| **Offscreen buffer canvas** | `putImageData` works at original dimensions; `drawImage` scales to screen size. Avoids per-pixel scale calculation. |
| **`imageSmoothingEnabled = false`** | Medical mask data uses discrete channels. Nearest-neighbor scaling preserves crisp pixel boundaries. |
| **Layer compositing via `source-over`** | Later layers (layer3) draw on top of earlier ones (layer1). Non-transparent pixels override correctly. |
| **`buildLayerImageData` exported** | Allows testing core pixel logic without Canvas mocks. |
| **`requestRender()` with dirty flag** | Multiple rapid changes (e.g., brush drag) are batched into one render per frame. |
| **Buffer reuse** | Offscreen canvas is only recreated when original dimensions change. |

---

### 4.4 Dirty Region Tracking

| Method | Behavior |
|--------|----------|
| `markDirty()` | Full canvas dirty |
| `markDirty(rect)` | Specific region dirty |
| `isDirty()` | Check if render pending |
| `isFullDirty()` | Check if whole canvas needs redraw |
| `getDirtyRects()` | Get tracked dirty regions |

Currently, any dirty state triggers a full redraw. The `dirtyRects` infrastructure is in place for future partial-update optimization (only re-render changed regions).

---

### 4.5 Animation Loop

| Mode | Behavior |
|------|----------|
| **One-shot** | `requestRender()` schedules a single rAF callback |
| **Continuous** | `startLoop()` runs rAF loop, only rendering when dirty |

The continuous loop is useful for real-time scenarios (e.g., active brush painting). The one-shot mode is more efficient for discrete operations.

---

### 4.6 Render Statistics

Each render frame produces `RenderStats`:

```typescript
interface RenderStats {
    layersRendered: number;    // Number of layers with visible data
    pixelsProcessed: number;   // Total pixels checked across all layers
    visiblePixels: number;     // Pixels actually rendered (non-transparent)
    frameTimeMs: number;       // Frame render time in milliseconds
}
```

---

## Files Created

| File | Lines | Description |
|------|-------|-------------|
| `rendering/MaskRenderer.ts` | 339 | Multi-layer composite renderer + rAF loop |
| `__tests__/rendering.test.ts` | 520 | 45 unit tests |

---

## Files Modified

| File | Change |
|------|--------|
| `core/index.ts` | Added Phase 4 rendering exports |
| `plan/task.md` | Marked Phase 4 tasks as completed |
| `plan/implementation_plan.md` | Marked Phase 4 as completed, updated file structure |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                   Rendering Pipeline (Phase 4)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  MaskRenderer                                                     │
│  ├── setTarget(canvas)      ← maskDisplayCanvas injected          │
│  ├── setManagers(lm, vm)    ← LayerManager + VisibilityManager    │
│  ├── updateConfig(...)      ← sliceIndex, axis, sizeFactor, alpha │
│  │                                                                │
│  ├── render()               ← Core composite render               │
│  │   ├── Clear target                                             │
│  │   ├── Set imageSmoothingEnabled = false                        │
│  │   ├── Set globalAlpha                                          │
│  │   ├── For each visible layer:                                  │
│  │   │   ├── getSlice(layerId, sliceIndex) → Uint8Array           │
│  │   │   ├── buildLayerImageData() → ImageData                    │
│  │   │   ├── putImageData on buffer (original size)               │
│  │   │   └── drawImage: buffer → target (scaled)                  │
│  │   └── Reset globalAlpha                                        │
│  │                                                                │
│  ├── requestRender()        ← Dirty-flag rAF batching             │
│  ├── markDirty(rect?)       ← Region tracking                     │
│  ├── startLoop()/stopLoop() ← Continuous animation                │
│  └── dispose()              ← Cleanup                             │
│                                                                   │
│  buildLayerImageData()      ← Pure function (exported for tests)  │
│  ├── Uint8Array → ImageData                                       │
│  ├── CHANNEL_RGB color mapping                                    │
│  └── Visibility filtering                                         │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

### Canvas Architecture (3-Layer)

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3: maskDisplayCanvas (Top) ← MaskRenderer renders here    │
│  ├── Receives pointer events                                     │
│  ├── Composites layer1 + layer2 + layer3                         │
│  └── globalAlpha controls transparency                           │
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: drawingLayer (Middle)                                   │
│  ├── Pencil outline preview (red)                                │
│  ├── Brush cursor preview                                        │
│  ├── Crosshair lines                                             │
│  └── Sphere preview circle                                       │
├─────────────────────────────────────────────────────────────────┤
│  Layer 1: displayCanvas (Bottom)                                  │
│  ├── NRRD slice image                                            │
│  └── Contrast/Window adjusted                                    │
└─────────────────────────────────────────────────────────────────┘

Data Layer (in memory, not Canvas):
┌─────────────────────────────────────────────────────────────────┐
│  MaskLayer1: Uint8Array (W × H per slice)                        │
│  MaskLayer2: Uint8Array (W × H per slice)                        │
│  MaskLayer3: Uint8Array (W × H per slice)                        │
└─────────────────────────────────────────────────────────────────┘
```

---

## Layer & Channel 多选显示/隐藏说明

> MaskRenderer 的渲染管线天然支持 layer 和 channel 的**任意组合多选**。

### Layer 级别（3 个独立 boolean）

`VisibilityManager.layers` 中每个 layer 独立控制，可任意组合：

```typescript
layers: { layer1: true, layer2: true, layer3: false }
// → 同时显示 layer1 + layer2，隐藏 layer3
```

| API | 作用 |
|-----|------|
| `setLayerVisible(layerId, bool)` | 独立控制某 layer |
| `toggleLayer(layerId)` | 切换某 layer |
| `showAllLayers()` / `hideAllLayers()` | 全部显示/隐藏 |
| `soloLayer(layerId)` | 只显示指定 layer |

### Channel 级别（每个 layer 9 个独立 boolean）

每个 layer 拥有 channel 0-8 各自独立的可见性：

```typescript
channels: {
    layer1: [true, true, false, true, true, true, true, true, true],
    //             ch1✅  ch2❌  ch3✅  → layer1 显示 ch1+ch3，隐藏 ch2
    layer2: [true, true, true, true, true, true, true, true, true],
    layer3: [true, true, true, true, true, true, true, true, true],
}
```

| API | 作用 |
|-----|------|
| `setChannelVisible(layerId, channel, bool)` | 控制某 layer 的某 channel |
| `toggleChannel(layerId, channel)` | 切换某 channel |
| `showAllChannels(layerId)` / `hideAllChannels(layerId)` | 某 layer 全部 channel 显示/隐藏 |

### MaskRenderer 两层过滤机制

在 `render()` 循环中，两层过滤同时生效：

```typescript
// 第一层：layer 级别
for (const layerId of LAYER_ORDER) {
    if (!visibility.isLayerVisible(layerId)) continue;

    // 第二层：channel 级别（在 buildLayerImageData 内部逐像素检查）
    const imageData = buildLayerImageData(
        sliceData, dims.width, dims.height,
        (ch) => visibility.isChannelVisible(layerId, ch),
    );
}
```

**示例组合**：
- 同时显示 layer1 + layer3，隐藏 layer2 ✅
- layer1 只显示 channel 1 和 channel 3，layer3 显示全部 channel ✅
- 所有 layer 全部显示，但各自隐藏不同 channel ✅

---

## Test Verification

```
 ✓ src/ts/Utils/segmentation/__tests__/rendering.test.ts (45 tests) 20ms

   ✓ buildLayerImageData (8)
     ✓ should return null for empty slice (all channel 0)
     ✓ should return null if slice data is too short
     ✓ should produce correct RGBA for channel 1 (green)
     ✓ should produce correct RGBA for channel 2 (red)
     ✓ should handle all 8 channels correctly
     ✓ should leave channel 0 pixels as transparent
     ✓ should respect visibility filter - hide specific channel
     ✓ should return null if all visible channels are hidden
     ✓ should handle mixed channels in a single slice

   ✓ MaskRenderer > setup (4)
     ✓ should set target canvas
     ✓ should initialize with default config
     ✓ should mark dirty on config change
     ✓ should not mark dirty for same config values

   ✓ MaskRenderer > render (12)
     ✓ should not render without target canvas
     ✓ should not render with zero dimensions
     ✓ should clear target canvas before rendering
     ✓ should set correct target canvas size based on sizeFactor
     ✓ should disable image smoothing for crisp edges
     ✓ should set and reset globalAlpha
     ✓ should skip rendering if all layers are hidden
     ✓ should render visible layers with data
     ✓ should not render empty layers (no visible pixels)
     ✓ should render multiple visible layers
     ✓ should skip hidden layers even if they have data
     ✓ should skip channels that are hidden
     ✓ should use correct scaling in drawImage call
     ✓ should clear dirty state after render

   ✓ MaskRenderer > render callback (2)
     ✓ should invoke callback with stats after render
     ✓ should report 0 layers rendered for empty data

   ✓ MaskRenderer > dirty state (6)
     ✓ should start as not dirty
     ✓ should become dirty after requestRender
     ✓ should become dirty after markDirty without rect
     ✓ should track dirty rects
     ✓ should accumulate multiple dirty rects
     ✓ should clear dirty state after render

   ✓ MaskRenderer > animation loop (3)
     ✓ should not be running initially
     ✓ should start and stop the loop
     ✓ should not start twice

   ✓ MaskRenderer > dispose (2)
     ✓ should stop loop and clear references
     ✓ should be safe to call multiple times

   ✓ MaskRenderer > updateConfig (5)
     ✓ should trigger dirty on sliceIndex change
     ✓ should trigger dirty on axis change
     ✓ should trigger dirty on sizeFactor change
     ✓ should trigger dirty on globalAlpha change
     ✓ should not trigger dirty for identical values

 Test Files  1 passed (1)
      Tests  45 passed (45)
   Duration  2.43s
```

---

## Build Verification

```bash
$ yarn build
✓ built in 13.71s
# dist/my-app.umd.js  2,215.02 kB │ gzip: 682.83 kB
```

Bundle size unchanged from Phase 3 (2,215.02 kB) - new rendering code is tree-shaken since it's not yet integrated into the main rendering pipeline.

---

## Pre-existing TypeScript Errors (Unrelated to Phase 4)

Same as Phase 2/3:
- `node_modules/@msgpack/msgpack`: Uint8Array generic type issue
- `node_modules/@vitejs/plugin-vue`: SFCScriptCompileOptions type mismatch
- `node_modules/vuetify`: GlobalComponents type constraint issues
- `node_modules/copper3d`: Missing three.js type declarations

---

## Known Issues

- **jsdom ImageData polyfill**: `ImageData` is not available in jsdom environment by default. A polyfill is added at the top of `rendering.test.ts`. This is an environment limitation, not a code issue.
- **Dirty region partial update**: Currently, any dirty state triggers a full redraw. The `dirtyRects` infrastructure is in place for future optimization but not yet used for partial updates.

---

## Next Steps

After user confirms:
→ Proceed to **Phase 5: Crosshair & Sphere Tools** (CrosshairTool, UndoManager per-layer enhancement)
