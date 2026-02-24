# Tool Extraction Task List

## Overview
Extract event handler implementations from DrawToolCore.ts and DragOperator.ts into separate tool files.

> **Status: COMPLETED** — All phases done. Build verified.

---

## Phase 1: Tool Infrastructure
- [x] Create `tools/` directory
- [x] Create `BaseTool.ts` with ToolContext interface
- [x] Create `index.ts` barrel export
- [x] Build verification

---

## Phase 2: Extract Specialty Tools (Sphere, Crosshair, ImageStore)
- [x] Create `SphereTool.ts`
  - [x] Move drawSphere, drawSphereCore, clearSphereCanvas
  - [x] Move drawSphereOnEachViews, drawCalculatorSphereOnEachViews
  - [x] Move storeSphereImages, setSphereCanvasSize, drawCalculatorSphere
  - [x] Move configMouseSphereWheel, getSpherePosition
  - [x] Move clearSpherePrintStoreImages
- [x] Create `CrosshairTool.ts`
  - [x] Move enableCrosshair, convertCursorPoint, setUpSphereOrigins
- [x] Create `ImageStoreHelper.ts`
  - [x] Move storeAllImages, storeImageToAxis, storeImageToLabel, storeEachLayerImage
  - [x] Move filterDrawedImage
  - [x] Move sliceArrayH, sliceArrayV
  - [x] Move replaceVerticalColPixels, replaceHorizontalRowPixels
  - [x] Move checkSharedPlaceSlice, replaceArray, findSliceInSharedPlace
  - [x] Move syncAxisX, syncAxisY, syncAxisZ
- [x] Update DrawToolCore to use new tools
- [x] Build verification

---

## Phase 3: Extract Contrast & Zoom Tools
- [x] Create `ContrastTool.ts`
  - [x] Move setupConrastEvents, configContrastDragMode, removeContrastDragMode
  - [x] Move updateSlicesContrast, repraintCurrentContrastSlice
- [x] Create `ZoomTool.ts`
  - [x] Move configMouseZoomWheel logic
- [x] Update DrawToolCore to use new tools
- [x] Build verification

---

## Phase 4: Extract Eraser Tool
- [x] Create `EraserTool.ts`
  - [x] Move clearArc() / useEraser logic
- [x] Update DrawToolCore to use EraserTool
- [x] Build verification

---

## Phase 5: Extract DragSliceTool & Update DragOperator
- [x] Create `DragSliceTool.ts`
  - [x] Move updateIndex (slice calculation)
  - [x] Move drawDragSlice
  - [x] Move drawMaskToLabelCtx
  - [x] Move cleanCanvases
  - [x] Move updateShowNumDiv
  - [x] Move updateCurrentContrastSlice
- [x] Update DragOperator to use DragSliceTool
  - [x] Create DragSliceTool instance in init()
  - [x] Replace method bodies with thin delegations
  - [x] Propagate setShowDragNumberDiv to DragSliceTool
- [x] Build verification

---

## Phase 6: Fix Inheritance & Final Verification
- [x] Add 7 delegation wrappers in DrawToolCore for NrrdTools access
  - [x] checkSharedPlaceSlice
  - [x] replaceArray
  - [x] findSliceInSharedPlace
  - [x] sliceArrayH
  - [x] sliceArrayV
  - [x] replaceVerticalColPixels
  - [x] replaceHorizontalRowPixels
- [x] Final build verification — zero new errors
- [x] Line count comparison

---

## Deferred (Future Work)
- [ ] Extract PencilTool from paintOnCanvas() closure
- [ ] Extract BrushTool from paintOnCanvas() closure
- [ ] Extract PanTool from paintOnCanvas() closure
- [ ] Convert paintOnCanvas() closure locals to class properties (prerequisite)

> These are blocked by the closure-based shared state in `paintOnCanvas()` (~600 lines).
> The closures share variables (leftclicked, rightclicked, Is_Painting, lines, etc.)
> that would need to be converted to class properties first.

---

## Success Metrics
- [x] DrawToolCore.ts: ~2219 → ~1319 lines (**-41%**, exceeded ≤1500 target)
- [x] DragOperator.ts: ~458 → ~290 lines (**-37%**, close to ≤250 target)
- [x] All original functionality preserved (public API unchanged)
- [x] Build passes with no new errors
