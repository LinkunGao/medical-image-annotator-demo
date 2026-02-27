# Bug Fix Log

Track all bug fixes and regressions to prevent re-introducing issues.

---

## Fix 1: clearPaint() clearing all layers instead of active layer only

**Date**: 2026-02-21
**Files Changed**: `annotator-frontend/src/ts/Utils/segmentation/DrawToolCore.ts`
**Commit**: (pending)

### Problem
`clearPaint()` was clearing the MaskVolume slice for ALL three layers, but only notifying the backend (`getMask`) for the active layer. This caused front-end/back-end data mismatch.

**Root cause** (two compounding bugs):
1. **Volume**: Lines 1148-1151 called `clearSlice()` on `layer1`, `layer2`, `layer3` — not just the active layer.
2. **Canvas**: `resetLayerCanvas()` at line 1128 cleared ALL layer canvases. Then `storeEachLayerImage` for rest layers read from the now-empty canvases and wrote that emptiness back to the other layers' volumes — destroying them.

### Fix
- Replaced `resetLayerCanvas()` with `activeTarget.ctx.clearRect()` on only the active layer's canvas.
- Replaced three `clearSlice()` calls with a single `vol.clearSlice(idx, axis)` on the active layer only.
- Removed `storeEachLayerImage()` calls for rest layers (they are untouched by the clear operation).
- Added `compositeAllLayers()` at the end to ensure all remaining layers are still visible.

### Regression Risk
- `clearPaint` is used by the clear button in the UI.
- Ensure other layers' masks remain visible after clearing.
- Ensure undo (Ctrl+Z) still works after clearPaint.

---

## Fix 2: clearPaint() getMask not firing (follow-up)

**Date**: 2026-02-21
**Files Changed**: `annotator-frontend/src/ts/Utils/segmentation/DrawToolCore.ts`

### Problem
After Fix 1, the `getMask` callback was inside the `try` block. If any volume operation threw an exception, the `catch` block silently swallowed the error and `getMask` was never called — the backend was never notified of the clear.

### Fix
- Moved `getMask` notification OUT of the try-catch by restoring the `storeAllImages(currentSliceIndex, activeLayer)` call after the try block. `storeAllImages` reliably reads the (now empty) canvas, syncs to volume, and calls `getMask`.
- The try block now only handles volume clearing and undo recording.

### Regression Risk
- `storeAllImages` also writes canvas data to volume via `setSliceLabelsFromImageData`. Since the canvas is already cleared and the volume is already cleared, this is a harmless no-op write (zeros → zeros).

---

## Fix 3: clearStoreImages() missing display refresh

**Date**: 2026-02-21
**Files Changed**: `annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts`

### Problem
`clearStoreImages()` re-initializes the active layer's MaskVolume (all slices) but did not refresh the display. The cleared layer remained visually present until the next slice change.

### Fix
Added `this.reloadMasksFromVolume()` after `this.invalidateSliceBuffer()`.

### Regression Risk
- Minimal. `reloadMasksFromVolume` is safe to call at any time.

---

## Fix 4: Cross-axis mask rendering vertically flipped (sagittal → coronal)

**Date**: 2026-02-22
**Status**: FIXED
**Files Changed**:
- `annotator-frontend/src/ts/Utils/segmentation/CommToolsData.ts` — `renderSliceToCanvas()`, `applyMaskFlipForAxis()` (already defined, now wired up)
- `annotator-frontend/src/ts/Utils/segmentation/DrawToolCore.ts` — `drawImageOnEmptyImage()`, `redrawPreviousImageToLayerCtx()`

### Symptom
Drawing a mask on sagittal (x-axis) → switching to coronal (y-axis): the mask appears on the correct slice but its **position within the slice is vertically flipped** (upside-down). Axial (z-axis) appeared correct.

### Root Cause — Coordinate System Mismatch

The display image for each axis is flipped via **`NrrdTools.flipDisplayImageByAxis()`** (NrrdTools.ts:1308-1329):

| Axis | Flip | Effect |
|------|------|--------|
| x (sagittal) | `scale(-1, -1)` | flip both horizontal + vertical |
| y (coronal) | `scale(1, -1)` | flip vertical only |
| z (axial) | `scale(1, -1)` | flip vertical only |

The mask layer canvases had **NO flip** applied — neither when storing (screen→volume) nor when rendering (volume→screen). This caused:

1. **Storing** (`drawImageOnEmptyImage` in DrawToolCore.ts): the layer canvas is in screen coordinates (which include the display flip). Writing to the volume without compensating the flip stores the mask in screen coords instead of volume/source coords.
2. **Rendering** (`renderSliceToCanvas` in CommToolsData.ts): volume data is drawn to the layer canvas without flip, so it's in source coords, while the display image is in screen coords. They don't align.

For **same-axis** viewing (e.g., draw on Z, view on Z), the two missing flips cancel out — the data roundtrips through the same coordinate system. For **cross-axis** viewing, different axes have different flips, causing misalignment (most visibly: sagittal's `scale(-1,-1)` vs coronal's `scale(1,-1)` produces a vertical flip on coronal).

### Fix — Apply `applyMaskFlipForAxis` at 3 Locations

A helper method `applyMaskFlipForAxis()` was already defined in CommToolsData.ts (line ~640) but **never called**. The fix wires it into:

#### 1. `drawImageOnEmptyImage()` — **storing** (DrawToolCore.ts)
Converts screen coords → volume coords before writing to the volume.
```ts
ctx.save();
this.applyMaskFlipForAxis(ctx, w, h, this.protectedData.axis);
ctx.drawImage(canvas, 0, 0, w, h);
ctx.restore();
```

#### 2. `renderSliceToCanvas()` — **rendering** (CommToolsData.ts)
Converts volume coords → screen coords when reading from the volume.
```ts
targetCtx.save();
this.applyMaskFlipForAxis(targetCtx, scaledWidth, scaledHeight, axis);
targetCtx.drawImage(emptyCanvas, 0, 0, scaledWidth, scaledHeight);
targetCtx.restore();
```

#### 3. `redrawPreviousImageToLayerCtx()` — **redrawing previous strokes** (DrawToolCore.ts, inner closure in `paintOnCanvas`)
Converts volume coords → screen coords when overlaying previous mask data during pencil mode.
```ts
ctx.save();
this.applyMaskFlipForAxis(ctx, changedWidth, changedHeight, this.protectedData.axis);
ctx.drawImage(emptyCanvas, 0, 0, changedWidth, changedHeight);
ctx.restore();
```

### Why Double-Flip = Identity (Same-Axis Still Works)

Each flip is its own inverse:
- `scale(-1, -1)` applied twice → identity
- `scale(1, -1)` applied twice → identity

So for same-axis: store with flip A → volume → render with flip A → net = A×A = identity ✓

For cross-axis: store with flip A → volume (source coords) → render with flip B → correct screen coords for axis B ✓

### Regression Risk
- **Existing saved masks** that were drawn on the z-axis: the backend stores data from `getMask` which reads from the volume. Before this fix, the volume stored z-axis screen coords (Y-flipped from source). After this fix, the volume stores true source coords. So **previously saved masks may appear Y-flipped** when loaded. They would need to be re-drawn or a one-time migration applied.
- **Eraser tool**: directly reads/writes layer canvas pixels. Since the layer canvas is now in screen coords (with flip applied during rendering), the eraser should still work correctly on the same axis.
- **Undo/redo**: stores raw volume slices. Volume data is now in source coords. Undo restores source coords → rendering applies flip → correct on screen.

---

## Rules to Prevent Regressions

1. **Never clear more data than intended.** When an operation targets a specific layer/slice, only touch that layer/slice.
2. **Backend notifications must match frontend changes.** If N layers are modified, the backend must be notified for all N layers.
3. **Critical callbacks (getMask, onClearLayerVolume) should NOT be inside try-catch blocks** that can silently swallow errors. Use a separate try-catch or move the callback outside.
4. **After any volume/canvas modification, ensure display is refreshed** (via `reloadMasksFromVolume`, `compositeAllLayers`, or `redrawDisplayCanvas`).
5. **Test all three axes** (axial z, coronal y, sagittal x) when modifying mask storage or rendering code.
