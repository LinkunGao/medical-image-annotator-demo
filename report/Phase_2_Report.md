# Phase 2: Core Data Layer - Report

**Completed**: ✅ True  
**Date**: 2026-02-01

---

## Summary

Phase 2 implements the Core Data Layer for the segmentation module refactoring. This phase establishes the foundational data structures and managers that will be used by the tool implementations in subsequent phases.

---

## Tasks Completed

### 2.1 Types & Constants ✅

#### [NEW] `core/types.ts`

Defined all type interfaces for mask data storage and manipulation:

| Type | Description |
|------|-------------|
| `LayerId` | Union type: 'layer1' \| 'layer2' \| 'layer3' |
| `AxisType` | Union type: 'x' \| 'y' \| 'z' |
| `ChannelValue` | Literal type: 0-8 |
| `MaskSliceData` | Single slice data structure |
| `ExportMaskData` | Format for sending to backend |
| `ImportMaskData` | Format from backend |
| `Delta` | Single voxel change record |
| `DeltaBatch` | Batch of changes for operations |
| `CHANNEL_COLORS` | Color palette with 60% alpha transparency |
| `CHANNEL_RGB` | RGB values for ImageData manipulation |
| `VisibilityState` | Layer/channel visibility state |

---

### 2.2 MaskLayer ✅

#### [NEW] `core/MaskLayer.ts`

Single layer Uint8Array storage with key operations:

| Method | Description |
|--------|-------------|
| `applyBrush()` | Apply circular brush at position, returns deltas |
| `fillPolygon()` | Fill polygon using ray casting algorithm ⭐ |
| `erase()` | Set voxels to channel 0 (transparent) |
| `applyDeltas()` | Apply/revert deltas for undo/redo |
| `exportSlice()` | Export slice for backend |
| `importSlice()` | Import slice from backend |
| `getSlice()` | Get Uint8Array for a slice (lazy creation) |
| `setVolumeData()` | Set entire 3D volume from flat array |

**Key Design Decisions**:
- All coordinates are in ORIGINAL dimensions (caller converts from screen coords using sizeFactor)
- Slices are stored in a Map<number, Uint8Array> for memory efficiency
- Ray casting algorithm for polygon fill (same logic as existing Pencil tool)

---

### 2.3 LayerManager ✅

#### [NEW] `core/LayerManager.ts`

Manages 3 independent mask layers:

| Method | Description |
|--------|-------------|
| `getActiveLayer()` | Get current active layer instance |
| `setActiveLayer()` | Switch active layer (fails if locked) |
| `lockLayer()` | Prevent edits to a layer |
| `unlockLayer()` | Allow edits to a layer |
| `applyBrush()` | Apply brush to active layer (respects lock) |
| `fillPolygon()` | Fill polygon on active layer |
| `erase()` | Erase on active layer |
| `applyDeltas()` | Route deltas to appropriate layers |

---

### 2.4 VisibilityManager ✅

#### [NEW] `core/VisibilityManager.ts`

Controls layer and channel visibility:

| Method | Description |
|--------|-------------|
| `setLayerVisible()` | Show/hide entire layer |
| `toggleLayer()` | Toggle layer visibility |
| `setChannelVisible()` | Show/hide specific channel in layer |
| `getVisibleLayers()` | Get array of visible layer IDs |
| `getVisibleChannels()` | Get visible channels for a layer |
| `soloLayer()` | Show only one layer |
| `shouldRenderVoxel()` | Check if voxel should be rendered |
| `addListener()` | Subscribe to visibility changes |

---

### 2.5 UndoManager ✅

#### [NEW] `core/UndoManager.ts`

Per-layer independent undo/redo stacks:

| Method | Description |
|--------|-------------|
| `setActiveLayer()` | Switch which layer's stack to operate on |
| `push()` | Push deltas onto undo stack |
| `undo()` | Pop and return last operation |
| `redo()` | Redo last undone operation |
| `canUndo()` / `canRedo()` | Check availability |
| `clearLayer()` | Clear stacks for specific layer |
| `addListener()` | Subscribe to state changes |

**Configuration**:
- `maxStackSize`: Maximum undo steps per layer (default: 50)

---

### 2.6 KeyboardManager ✅

#### [NEW] `core/KeyboardManager.ts`

Customizable keyboard shortcuts:

| Method | Description |
|--------|-------------|
| `setBinding()` | Change key binding for action |
| `setActionEnabled()` | Enable/disable specific actions |
| `register()` | Attach listeners to container |
| `unregister()` | Remove listeners |
| `onAction()` | Set callback for keyboard actions |
| `getMouseWheelBehavior()` | Get scroll behavior mode |
| `toggleMouseWheelBehavior()` | Toggle Zoom/Slice mode |

**Supported Actions**:
- `draw` (Shift) - Enable drawing mode
- `undo` (Ctrl+Z) - Undo last action
- `redo` (Ctrl+Y) - Redo action
- `crosshair` (S) - Toggle crosshair mode
- `contrast` (Ctrl) - Toggle contrast mode
- `escape` - Cancel operation

---

## Files Created

| File | Lines | Description |
|------|-------|-------------|
| `core/types.ts` | 161 | Types, interfaces, and constants |
| `core/MaskLayer.ts` | 310 | Single layer Uint8Array storage |
| `core/LayerManager.ts` | 280 | 3-layer management |
| `core/VisibilityManager.ts` | 222 | Visibility control |
| `core/UndoManager.ts` | 222 | Per-layer undo/redo |
| `core/KeyboardManager.ts` | 292 | Keyboard shortcuts |

---

## Files Modified

| File | Change |
|------|--------|
| `core/index.ts` | Added exports for all Phase 2 modules |
| `plan/task.md` | Marked Phase 2 tasks as completed |

---

## Build Verification ✅

```bash
$ yarn build
✓ built in 16.25s
# dist/my-app.umd.js  2,215.02 kB │ gzip: 682.83 kB
```

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                     Core Data Layer (Phase 2)                    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  types.ts                                                        │
│  ├── LayerId, AxisType, ChannelValue                             │
│  ├── Delta, DeltaBatch                                           │
│  ├── CHANNEL_COLORS, CHANNEL_RGB                                 │
│  └── VisibilityState                                             │
│                                                                  │
│  MaskLayer                                                       │
│  ├── slices: Map<number, Uint8Array>                             │
│  ├── applyBrush() → Delta[]                                      │
│  ├── fillPolygon() → Delta[] ⭐                                   │
│  └── erase() → Delta[]                                           │
│                                                                  │
│  LayerManager                                                    │
│  ├── layers: { layer1, layer2, layer3 }                          │
│  ├── currentLayer: LayerId                                       │
│  └── lockState: Map<LayerId, boolean>                            │
│                                                                  │
│  VisibilityManager                  UndoManager                  │
│  ├── layers visibility              ├── undoStacks per layer     │
│  ├── channels visibility            ├── redoStacks per layer     │
│  └── change listeners               └── maxStackSize             │
│                                                                  │
│  KeyboardManager                                                 │
│  ├── bindings: KeyBindings                                       │
│  ├── enabledState: ActionEnabledState                            │
│  └── onAction callback                                           │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Test Verification ✅

```
 ✓ src/ts/Utils/segmentation/__tests__/core.test.ts (46 tests) 20ms

   ✓ MaskLayer (14)
   ✓ LayerManager (8)
   ✓ VisibilityManager (9)
   ✓ UndoManager (6)
   ✓ KeyboardManager (6)
   ✓ Constants (3)

 Test Files  1 passed (1)
      Tests  46 passed (46)
   Duration  39.39s
```

- [x] **🧪 创建 MaskLayer 并验证 Uint8Array 读写** ✅ PASSED

---

## Known Issues

None discovered during implementation.

---

## Pre-existing TypeScript Errors (Unrelated to Phase 2)

The following errors exist in the codebase and are not related to Phase 2:
- `src/plugins/hooks/user.ts`: Cannot find module '@/store/states'
- `vite.config.ts`: tsconfig reference issue

These should be addressed in a separate maintenance task.

---

## Next Steps

After user confirms testing passes:
→ Proceed to **Phase 3: Tool Abstraction** (BaseTool, PencilTool, BrushTool, etc.)

