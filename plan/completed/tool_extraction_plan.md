# Tool Extraction Refactoring Plan

> **Status: COMPLETED**
> Refactoring finished. All tool extractions done, build verified with zero new errors.

## Goal

Extract event handler implementations from `DrawToolCore.ts` (~2219 lines) and `DragOperator.ts` (~458 lines) into separate, focused tool files to:
1. Reduce code size in core files
2. Improve maintainability and testability
3. Enable easier feature additions

## Final Architecture

```
segmentation/
├── eventRouter/
│   └── EventRouter.ts              (previously completed)
├── tools/
│   ├── index.ts                    [DONE] Barrel exports
│   ├── BaseTool.ts                 [DONE] Abstract base class + ToolContext interface
│   ├── EraserTool.ts               [DONE] clearArc() erasing logic (~45 lines)
│   ├── ZoomTool.ts                 [DONE] configMouseZoomWheel() (~95 lines)
│   ├── DragSliceTool.ts            [DONE] Drag-based slice navigation (~236 lines)
│   ├── ContrastTool.ts             [DONE] Contrast adjustment handlers (~175 lines)
│   ├── SphereTool.ts               [DONE] Sphere drawing + radius wheel (~260 lines)
│   ├── CrosshairTool.ts            [DONE] Crosshair positioning + cursor conversion (~170 lines)
│   └── ImageStoreHelper.ts         [DONE] Cross-axis image storage + pixel replacement (~387 lines)
├── DrawToolCore.ts                 [MODIFIED] Reduced coordinator (~1319 lines)
├── DragOperator.ts                 [MODIFIED] Reduced, delegates to DragSliceTool (~290 lines)
└── NrrdTools.ts                    [UNCHANGED] Inherits delegation wrappers from DrawToolCore
```

### Deferred / Not Extracted

The following were **not extracted** because `paintOnCanvas()` uses closure-based shared state (leftclicked, rightclicked, Is_Painting, lines, etc.) that would require converting to class properties first:

- PencilTool (drawing mouse down/move/up handlers remain in paintOnCanvas closure)
- BrushTool (brush circle move remains in paintOnCanvas closure)
- PanTool (pan mouse move remains in paintOnCanvas closure)
- SliceTool (slice wheel merged into ZoomTool's configMouseZoomWheel)

These can be tackled in a future refactoring pass by converting closure locals to class properties.

---

## Implementation Details

### ToolContext (Dependency Injection)

All tools share state via a `ToolContext` interface (references, not copies):

```typescript
export interface ToolContext {
  nrrd_states: INrrdStates;
  gui_states: IGUIStates;
  protectedData: IProtected;
  cursorPage: ICursorPage;
}

export abstract class BaseTool {
  protected ctx: ToolContext;
  constructor(ctx: ToolContext) { this.ctx = ctx; }
  setContext(ctx: ToolContext): void { this.ctx = ctx; }
}
```

### Callback Pattern

Tools that need to call back into DrawToolCore/DragOperator use typed callback interfaces:

- `SphereCallbacks` — setEmptyCanvasSize, drawImageOnEmptyImage, storeImageToAxis, createEmptyPaintImage
- `ImageStoreCallbacks` — setEmptyCanvasSize, drawImageOnEmptyImage
- `DragSliceCallbacks` — setSyncsliceNum, setIsDrawFalse, flipDisplayImageByAxis, setEmptyCanvasSize, filterDrawedImage
- `ContrastCallbacks` — setIsDrawFalse, setSyncsliceNum
- `ZoomCallbacks` — resetPaintAreaUIPosition, resizePaintArea, setIsDrawFalse

### Delegation Pattern

DrawToolCore and DragOperator keep thin wrapper methods that delegate to tool instances, preserving the public API for subclasses (NrrdTools):

```typescript
// DrawToolCore example
drawSphere() { this.sphereTool.drawSphere(); }
enableCrosshair() { this.crosshairTool.enableCrosshair(); }
storeAllImages(i, l) { this.imageStoreHelper.storeAllImages(i, l); }
```

7 additional delegation wrappers were added for ImageStoreHelper utility methods needed by NrrdTools:
- `checkSharedPlaceSlice`, `replaceArray`, `findSliceInSharedPlace`
- `sliceArrayH`, `sliceArrayV`
- `replaceVerticalColPixels`, `replaceHorizontalRowPixels`

---

## Verification Results

- **Build**: `npx tsc --noEmit` — zero new TypeScript errors in segmentation files
  - 743 pre-existing errors remain (three.js, copper3d, vitest type stubs — unrelated)
- **API preserved**: All public methods on DrawToolCore and DragOperator still accessible by NrrdTools

---

## Actual Impact

| File | Before | After | Reduction |
|------|--------|-------|-----------|
| DrawToolCore.ts | ~2219 lines | ~1319 lines | **-900 lines (41%)** |
| DragOperator.ts | ~458 lines | ~290 lines | **-168 lines (37%)** |
| **New tools/** | 0 | ~1368 lines | (distributed across 8 files) |

> DrawToolCore exceeded the original estimate of ~1500 lines, achieving ~1319 lines.
> DragOperator slightly above the ~250 estimate at 290 lines.
