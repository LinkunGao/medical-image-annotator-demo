# Dead Code Cleanup — segmentation/

## Last updated: 2026-02-24

---

## Completed Cleanup

### 1. gui.ts IConfigGUI — 7 dead function properties removed

These functions were passed into `setupGui()` via `IConfigGUI` but **never called** inside `setupGui()`:

| Function | Was defined in | Was wrapped in |
|---|---|---|
| `checkSharedPlaceSlice` | ImageStoreHelper.ts | DrawToolCore.ts |
| `replaceArray` | ImageStoreHelper.ts | DrawToolCore.ts |
| `findSliceInSharedPlace` | ImageStoreHelper.ts | DrawToolCore.ts |
| `sliceArrayH` | ImageStoreHelper.ts | DrawToolCore.ts |
| `sliceArrayV` | ImageStoreHelper.ts | DrawToolCore.ts |
| `replaceVerticalColPixels` | ImageStoreHelper.ts | DrawToolCore.ts |
| `replaceHorizontalRowPixels` | ImageStoreHelper.ts | DrawToolCore.ts |
| `storeImageToAxis` | ImageStoreHelper.ts | DrawToolCore.ts |

**Files modified:**
- `coreTools/gui.ts` — Removed 8 properties from `IConfigGUI` interface
- `DrawToolCore.ts` — Removed 7 wrapper methods + unused `IPaintImage` import
- `NrrdTools.ts` — Removed 8 config entries from `setupGui()` call
- `tools/ImageStoreHelper.ts` — Removed 7 method implementations (~190 lines), updated header comment

### 2. sharedPlace state + getSharedPlace() removed

`nrrd_states.sharedPlace` was only consumed by the dead `checkSharedPlaceSlice` / `findSliceInSharedPlace`. The entire chain was removed:

**Files modified:**
- `coreTools/coreType.ts` — Removed `sharedPlace: ICommXYZ` from `INrrdStates`
- `CommToolsData.ts` — Removed `sharedPlace` initialization
- `NrrdTools.ts` — Removed `sharedPlace` assignment (3 lines) + `getSharedPlace()` private method (~18 lines)

### 3. getSliceRawImageData() + getSliceRawImageDataInto() removed

Both methods were part of the legacy 4-channel RGBA storage design. The current 1-channel label model never calls them; all rendering now goes through `renderLabelSliceInto()`.

**Files modified:**
- `core/MaskVolume.ts` — Removed `getSliceRawImageData()` (~66 lines) and `getSliceRawImageDataInto()` (~57 lines)
- `CommToolsData.ts` — Updated stale JSDoc comment in `renderSliceToCanvas()` that referenced the deleted method

---

## Remaining Dead Code (not yet cleaned)

### Dead Methods / Functions — never called in production

| Item | File | Line | Notes |
|---|---|---|---|
| `storeImageToAxis()` | `tools/ImageStoreHelper.ts` | 71 | **No-op body.** SphereTool calls it via the `SphereCallbacks` interface, but the implementation does nothing. Both the callback and the no-op can be removed together. |
| `hasNonZeroPixels()` | `tools/ImageStoreHelper.ts` | 238 | Private method, zero call sites anywhere. |
| `clearSpherePrintStoreImages()` | `tools/SphereTool.ts` | 284 | **No-op body** (`// No-op: sphere images are no longer stored in Phase 3`). Called from `DrawToolCore.ts` (lines 313, 340, 743) but does nothing. Clean up by removing the method + all 3 call sites. |
| `getState()` | `eventRouter/EventRouter.ts` | 258 | Returns a copy of `InteractionState`. Zero callers outside the class. |
| `isShiftHeld()` | `eventRouter/EventRouter.ts` | 262 | Zero callers outside the class. Mode-based routing makes polling obsolete. |
| `isCtrlHeld()` | `eventRouter/EventRouter.ts` | 266 | Zero callers outside the class. |
| `isLeftButtonDown()` | `eventRouter/EventRouter.ts` | 270 | Zero callers outside the class. |
| `isRightButtonDown()` | `eventRouter/EventRouter.ts` | 274 | Zero callers outside the class. |
| `getKeyboardSettings()` | `eventRouter/EventRouter.ts` | 289 | Zero callers outside the class. |
| `BaseTool.setContext()` | `tools/BaseTool.ts` | 38 | Zero callers anywhere. Context is set once via constructor. |
| `SphereTool.setCallbacks()` | `tools/SphereTool.ts` | 42 | Zero callers anywhere. Callbacks are set via constructor. |
| `getSliceRawImageData()` | `core/MaskVolume.ts` | 467 | Zero callers in production code (only referenced in a doc comment in `CommToolsData.ts`). The zero-alloc sibling `getSliceRawImageDataInto()` is used instead. |

### Dead State / Field

| Item | File | Line | Notes |
|---|---|---|---|
| `NrrdTools.paintedImage` | `NrrdTools.ts` | 42 | Private field declared as `IPaintImage \| undefined`. Never written to or read anywhere in the file. |

### IConfigGUI — properties passed to setupGui() but never accessed inside it

These are declared in the `IConfigGUI` interface and passed by `NrrdTools.ts`, but `setupGui()` never reads them from `configs.*`. They are **dead at the interface boundary** — removing them from `IConfigGUI` and from the `setupGui()` call in NrrdTools.ts would be safe:

`filterDrawedImage`, `storeAllImages`, `drawImageOnEmptyImage`, `storeEachLayerImage`, `storeImageToLayer`, `getRestLayer`, `setIsDrawFalse`, `setEmptyCanvasSize`, `resetLayerCanvas`, `redrawDisplayCanvas`, `flipDisplayImageByAxis`, `repraintCurrentContrastSlice`, `setSyncsliceNum`, `resetPaintAreaUIPosition`, `resizePaintArea`

### Test-only APIs (no production callers)

These exist only to support unit test assertions. They are correct and valuable for testing, but should not be confused with production code:

| Item | File | Line | Notes |
|---|---|---|---|
| `MaskVolume.getMemoryUsage()` | `core/MaskVolume.ts` | 803 | Test-only. |
| `MaskVolume.clone()` | `core/MaskVolume.ts` | 869 | Test-only. |
| `convertIPaintImagesToVolume()` | `core/MigrationUtils.ts` | 77 | Test-only. No production caller. |
| `convertVolumeToIPaintImages()` | `core/MigrationUtils.ts` | 164 | Test-only. No production caller. |

> **Note (corrected from previous scan):** `MaskVolume.setChannelColor()`, `MaskVolume.getChannelColor()`, `MaskVolume.getRawData()`, and `MaskVolume.setRawData()` were previously listed as test-only. They are **now used in production** — `NrrdTools.ts` calls all four directly for the layer colour API and NIfTI mask loading. They should be retained.
