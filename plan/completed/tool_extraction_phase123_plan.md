# Tool Extraction Phase 1-2-3: Detailed Plan

> **Status:** Planning
> **Prerequisites:** Mask Storage Migration (COMPLETED), Initial Tool Extraction (COMPLETED)
> **Scope:** Extract PanTool, PencilTool, BrushTool from `paintOnCanvas()` closure

---

## Context

The initial tool extraction (completed) extracted 8 tools from DrawToolCore.ts:
- EraserTool, ZoomTool, SphereTool, CrosshairTool, ContrastTool, DragSliceTool, ImageStoreHelper, BaseTool

**What remains:** The `paintOnCanvas()` method (~580 lines) still contains closure-based shared state that blocks extraction of Pan, Pencil, and Brush tools.

### Current Closure Variables (DrawToolCore.ts:279-295)

```typescript
let leftclicked = false;          // Left mouse button state
let rightclicked = false;         // Right mouse button state (pan)
let panelMoveInnerX = 0;          // Pan drag offset X
let panelMoveInnerY = 0;          // Pan drag offset Y
let currentSliceIndex = ...;      // Current slice tracking
let Is_Painting = false;          // Active drawing flag
let lines: Array<ICommXY> = [];   // Pencil stroke path accumulator
const clearArc = this.useEraser(); // Eraser function reference
```

### Event Handlers Using Closures

| Handler | Closure Variables Used | Lines |
|---------|----------------------|-------|
| `handleOnPanMouseMove` | `panelMoveInnerX`, `panelMoveInnerY` | 339-349 |
| `handleOnDrawingBrushCricleMove` | (none - uses nrrd_states) | 352-373 |
| `handleOnDrawingMouseMove` | `Is_Painting`, `lines`, `clearArc` | 376-388 |
| `handleOnDrawingMouseDown` | `leftclicked`, `rightclicked`, `currentSliceIndex`, `lines`, `Is_Painting`, `panelMoveInnerX/Y` | 389-490 |
| `sphere()` | (none - standalone) | 506-554 |
| `redrawPreviousImageToLayerCtx()` | (none - uses `this`) | 556-584 |
| `handleOnDrawingMouseUp` | `leftclicked`, `rightclicked`, `Is_Painting`, `lines` | 586-729 |
| `pointerleave` listener | `Is_Painting`, `leftclicked`, `rightclicked` | 731-762 |
| `start()` | (none - uses `this`) | 764-862 |

---

## Phase 1: Convert Closure Variables to Class Properties

### Objective
Lift all 7 closure variables + 2 inner functions from `paintOnCanvas()` to class properties/methods on DrawToolCore. This is the **prerequisite** for all subsequent extraction.

### Changes Required

#### 1.1 Add Class Properties to DrawToolCore

```typescript
export class DrawToolCore extends CommToolsData {
  // === Phase 1: Lifted from paintOnCanvas() closure ===
  /** Left mouse button currently held */
  private leftClicked = false;
  /** Right mouse button currently held (pan mode) */
  private rightClicked = false;
  /** Pan drag offset X (clientX - canvas.offsetLeft at drag start) */
  private panMoveInnerX = 0;
  /** Pan drag offset Y (clientY - canvas.offsetTop at drag start) */
  private panMoveInnerY = 0;
  /** Slice index when paintOnCanvas() was called (guards re-entry) */
  private paintSliceIndex = 0;
  /** Currently painting (between pointerdown and pointerup in draw mode) */
  private isPainting = false;
  /** Accumulated pencil stroke points for fill-on-release */
  private drawingLines: Array<ICommXY> = [];
  /** Eraser arc function, initialized once per paintOnCanvas() call */
  private clearArcFn: ((x: number, y: number, size: number) => void) | null = null;
}
```

#### 1.2 Update paintOnCanvas() Body

Replace closure variable declarations with class property usage:
- `leftclicked` → `this.leftClicked`
- `rightclicked` → `this.rightClicked`
- `panelMoveInnerX` → `this.panMoveInnerX`
- `panelMoveInnerY` → `this.panMoveInnerY`
- `currentSliceIndex` → `this.paintSliceIndex`
- `Is_Painting` → `this.isPainting`
- `lines` → `this.drawingLines`
- `clearArc` → `this.clearArcFn`

#### 1.3 Extract Inner Functions to Private Methods

- `sphere()` → `private handleSphereClick(e: MouseEvent)`
- `redrawPreviousImageToLayerCtx()` → `private redrawPreviousImageToLayerCtx(ctx: CanvasRenderingContext2D)`

#### 1.4 Simplify Handler Assignments

After lifting, the handlers in paintOnCanvas() will reference `this.xxx` instead of closure locals. This means the handlers can later be moved to separate tool classes.

### Risk Assessment
- **Risk Level:** Low
- **Approach:** Pure mechanical refactoring — rename + add `this.` prefix
- **Verification:** Build passes + manual test of draw/pan/sphere workflows
- **Rollback:** Simple git revert

### Success Criteria
- [ ] All 8 closure variables converted to class properties
- [ ] `sphere()` and `redrawPreviousImageToLayerCtx()` converted to private methods
- [ ] `paintOnCanvas()` no longer declares any `let`/`const` variables that are shared across handlers
- [ ] Zero behavior changes (pixel-perfect output)
- [ ] `npx tsc --noEmit` passes with no new errors
- [ ] Manual test: draw (pencil + brush), erase, pan, sphere placement all work

---

## Phase 2: Extract PanTool

### Objective
Extract all right-click pan/drag logic into a standalone `PanTool` class.

### Why PanTool First
- Right-click only — no overlap with left-click drawing logic
- Only uses 2 state variables (`panMoveInnerX/Y`) + 1 flag (`rightClicked`)
- Minimal coupling with other tools
- Good validation of the extraction pattern

### Architecture

```typescript
// tools/PanTool.ts
export interface PanCallbacks {
  setIsDrawFalse: (delay: number) => void;
}

export class PanTool extends BaseTool {
  /** Right mouse button currently held */
  private rightClicked = false;
  /** Pan drag offset X */
  private panStartX = 0;
  /** Pan drag offset Y */
  private panStartY = 0;

  constructor(ctx: ToolContext, private callbacks: PanCallbacks) {
    super(ctx);
  }

  /**
   * Called on pointerdown with button === 2 (right-click)
   */
  onPointerDown(e: PointerEvent): void {
    this.rightClicked = true;
    const canvas = this.ctx.protectedData.canvases.drawingCanvas;
    this.panStartX = e.clientX - canvas.offsetLeft;
    this.panStartY = e.clientY - canvas.offsetTop;
    canvas.style.cursor = "grab";
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
  }

  /**
   * Called on pointermove during right-click drag
   */
  onPointerMove = (e: PointerEvent): void => {
    const canvas = this.ctx.protectedData.canvases.drawingCanvas;
    canvas.style.cursor = "grabbing";
    this.ctx.nrrd_states.previousPanelL = e.clientX - this.panStartX;
    this.ctx.nrrd_states.previousPanelT = e.clientY - this.panStartY;
    this.ctx.protectedData.canvases.displayCanvas.style.left =
      canvas.style.left = this.ctx.nrrd_states.previousPanelL + "px";
    this.ctx.protectedData.canvases.displayCanvas.style.top =
      canvas.style.top = this.ctx.nrrd_states.previousPanelT + "px";
  };

  /**
   * Called on pointerup with button === 2
   */
  onPointerUp = (e: PointerEvent): void => {
    if (e.button !== 2) return;
    this.rightClicked = false;
    const canvas = this.ctx.protectedData.canvases.drawingCanvas;
    canvas.style.cursor = "grab";
    setTimeout(() => {
      canvas.style.cursor = this.ctx.gui_states.defaultPaintCursor;
    }, 2000);
    canvas.removeEventListener("pointermove", this.onPointerMove);
    canvas.removeEventListener("pointerup", this.onPointerUp);

    if (this.ctx.gui_states.sphere) {
      // Delegate sphere zoom action back to DrawToolCore via callback
    }
  };

  /**
   * Called on pointerleave to clean up right-click pan state
   */
  onPointerLeave(): void {
    if (this.rightClicked) {
      this.rightClicked = false;
      const canvas = this.ctx.protectedData.canvases.drawingCanvas;
      canvas.style.cursor = "grab";
      canvas.removeEventListener("pointermove", this.onPointerMove);
    }
  }

  get isActive(): boolean {
    return this.rightClicked;
  }
}
```

### Integration with DrawToolCore

```typescript
// In paintOnCanvas() — handleOnDrawingMouseDown
} else if (e.button === 2) {
  this.panTool.onPointerDown(e as PointerEvent);
}

// In handleOnDrawingMouseUp
} else if (e.button === 2) {
  this.panTool.onPointerUp(e as PointerEvent);
}

// In pointerleave
this.panTool.onPointerLeave();
```

### What Gets Removed from DrawToolCore
- `this.rightClicked` property (moved to PanTool)
- `this.panMoveInnerX/Y` properties (moved to PanTool)
- `handleOnPanMouseMove` handler body (moved to PanTool)
- Right-click branches in mouseDown/mouseUp/pointerleave (replaced with delegation)

### Risk Assessment
- **Risk Level:** Low-Medium
- **Key Risk:** Event listener lifecycle — dynamic add/remove of pointermove must be correctly handled
- **Verification:** Manual test of pan in all 3 axes, pan + sphere mode, pan cursor transitions
- **Rollback:** Revert PanTool and restore class properties

### Success Criteria
- [ ] PanTool handles all right-click panning
- [ ] Pan behavior identical (cursor changes, movement speed, position persistence)
- [ ] pointerleave correctly cleans up pan state
- [ ] Sphere mode + pan interaction works
- [ ] `npx tsc --noEmit` passes with no new errors
- [ ] DrawToolCore loses ~40-50 lines related to pan logic

---

## Phase 3: Extract PencilTool and BrushTool (Optional)

### Objective
Extract left-click drawing logic into PencilTool (fill mode) and BrushTool (stroke mode).

### Decision Gate
**Only proceed if Phase 1-2 are successful and the team decides the benefit justifies the complexity.**

### Why This Is the Hardest Phase

1. **Complex State Machine:** Drawing involves mouseDown→mouseMove→mouseUp lifecycle with branching logic (pencil fill vs brush stroke vs eraser)
2. **Layer Management:** Drawing interacts with layer system (`setCurrentLayer()`, `compositeAllLayers()`, `syncLayerSliceData()`)
3. **Undo System:** mouseDown captures pre-draw snapshot, mouseUp pushes delta
4. **Event Lifecycle:** Dynamic add/remove of pointermove/pointerup listeners
5. **Shared Concerns:** Eraser mode shares the same handlers but does different operations

### Architecture Option A: Single DrawingTool (Recommended)

Instead of separate PencilTool and BrushTool, extract a unified `DrawingTool` that handles all left-click drawing:

```typescript
// tools/DrawingTool.ts
export interface DrawingCallbacks {
  setCurrentLayer: () => { ctx: CanvasRenderingContext2D; canvas: HTMLCanvasElement };
  compositeAllLayers: () => void;
  syncLayerSliceData: (index: number, layer: string) => void;
  filterDrawedImage: (axis: string, index: number) => any;
  setIsDrawFalse: (delay: number) => void;
  getVolumeForLayer: (layer: string) => MaskVolume;
  undoManager: UndoManager;
}

export class DrawingTool extends BaseTool {
  private isPainting = false;
  private leftClicked = false;
  private strokeLines: Array<ICommXY> = [];
  private clearArcFn: ((x: number, y: number, size: number) => void) | null = null;

  // Undo state
  private preDrawAxis: string | null = null;
  private preDrawSliceIndex: number = 0;
  private preDrawSlice: Uint8Array | null = null;

  constructor(ctx: ToolContext, private callbacks: DrawingCallbacks) {
    super(ctx);
  }

  /** Initialize eraser function (called once per paintOnCanvas cycle) */
  initEraser(clearArc: (x: number, y: number, size: number) => void): void {
    this.clearArcFn = clearArc;
  }

  onPointerDown(e: PointerEvent): void {
    if (this.leftClicked) {
      // Guard against re-entry
      this.cleanup();
      return;
    }

    this.leftClicked = true;
    this.strokeLines = [];
    this.isPainting = true;
    this.ctx.protectedData.Is_Draw = true;

    // Set cursor based on mode
    this.updateCursor();

    // Record start position
    this.ctx.nrrd_states.drawStartPos.x = e.offsetX;
    this.ctx.nrrd_states.drawStartPos.y = e.offsetY;

    // Capture pre-draw snapshot for undo
    this.capturePreDrawSnapshot();

    // Register dynamic listeners
    const canvas = this.ctx.protectedData.canvases.drawingCanvas;
    canvas.addEventListener("pointermove", this.onPointerMove);
    canvas.addEventListener("pointerup", this.onPointerUp);
  }

  onPointerMove = (e: PointerEvent): void => {
    this.ctx.protectedData.Is_Draw = true;
    if (!this.isPainting) return;

    if (this.ctx.gui_states.Eraser) {
      this.ctx.nrrd_states.stepClear = 1;
      this.clearArcFn?.(e.offsetX, e.offsetY, this.ctx.gui_states.brushAndEraserSize);
    } else {
      this.strokeLines.push({ x: e.offsetX, y: e.offsetY });
      // Delegate to DrawToolCore's paintOnCanvasLayer
      this.callbacks.paintOnCanvasLayer(e.offsetX, e.offsetY);
    }
  };

  onPointerUp = (e: PointerEvent): void => {
    if (e.button !== 0) return;
    this.leftClicked = false;

    const { ctx, canvas } = this.callbacks.setCurrentLayer();
    ctx.closePath();

    // Remove dynamic listeners
    const drawCanvas = this.ctx.protectedData.canvases.drawingCanvas;
    drawCanvas.removeEventListener("pointermove", this.onPointerMove);

    // Pencil fill mode
    if (!this.ctx.gui_states.Eraser && this.ctx.gui_states.pencil) {
      canvas.width = canvas.width;
      this.redrawPreviousImageToLayerCtx(ctx);
      this.fillPencilPath(ctx);
      this.callbacks.compositeAllLayers();
    }

    // Sync to volume
    this.callbacks.syncLayerSliceData(
      this.ctx.nrrd_states.currentSliceIndex,
      this.ctx.gui_states.layer
    );

    this.isPainting = false;

    // Push undo delta
    this.pushUndoDelta();

    // Re-enable wheel
    // ...
  };

  onPointerLeave(): void {
    this.isPainting = false;
    if (this.leftClicked) {
      this.leftClicked = false;
      this.ctx.protectedData.ctxes.drawingLayerMasterCtx.closePath();
      const canvas = this.ctx.protectedData.canvases.drawingCanvas;
      canvas.removeEventListener("pointermove", this.onPointerMove);
    }
  }

  private fillPencilPath(ctx: CanvasRenderingContext2D): void {
    if (this.strokeLines.length === 0) return;
    ctx.beginPath();
    ctx.moveTo(this.strokeLines[0].x, this.strokeLines[0].y);
    for (let i = 1; i < this.strokeLines.length; i++) {
      ctx.lineTo(this.strokeLines[i].x, this.strokeLines[i].y);
    }
    ctx.closePath();
    ctx.lineWidth = 1;
    ctx.fillStyle = this.ctx.gui_states.fillColor;
    ctx.fill();
  }

  get isActive(): boolean {
    return this.leftClicked;
  }
}
```

### Architecture Option B: Separate PencilTool + BrushTool

```
DrawingToolBase (abstract)
  ├── PencilTool  (fill mode — accumulate strokes, fill on release)
  └── BrushTool   (stroke mode — draw continuously)
```

**Pros:** Cleaner separation of drawing modes
**Cons:** Shared state (isPainting, leftClicked, eraser mode) creates duplication or requires shared base with complex dispatch

**Recommendation:** Option A (unified DrawingTool) for this codebase — pencil/brush modes share 80%+ of their logic, and the mode switch is a simple `if (this.gui_states.pencil)` check.

### What Gets Removed from DrawToolCore
- `this.isPainting`, `this.leftClicked`, `this.drawingLines` properties
- `handleOnDrawingMouseMove` handler body
- Left-click drawing branch in `handleOnDrawingMouseDown`
- Drawing branch in `handleOnDrawingMouseUp`
- Pre-draw undo snapshot logic (`preDrawAxis`, `preDrawSliceIndex`, `preDrawSlice`)
- Drawing-related pointerleave cleanup
- `redrawPreviousImageToLayerCtx()` method (moved to DrawingTool)

### Expected Impact
- DrawToolCore: ~1319 → ~900-1000 lines (-25-30%)
- `paintOnCanvas()` becomes a thin event coordinator (~100-150 lines)

### Risk Assessment
- **Risk Level:** Medium-High
- **Key Risks:**
  1. Pencil fill-on-release logic depends on `lines[]` accumulated during mouse move
  2. Eraser mode shares the same handlers — mode switching must be seamless
  3. Dynamic event listener add/remove timing must be preserved exactly
  4. Undo system integration (pre-draw snapshot → post-draw delta)
  5. Layer compositing order must not change
- **Verification:**
  - Manual test: pencil draw + fill, brush draw, eraser, all on each layer
  - Test undo/redo after each operation
  - Test pointerleave mid-draw recovery
  - Test cross-axis rendering after drawing

### Success Criteria
- [ ] DrawingTool handles all left-click drawing (pencil/brush/eraser)
- [ ] Pencil fill-on-release produces identical results
- [ ] Brush continuous draw produces identical results
- [ ] Eraser works correctly
- [ ] Undo/redo works after drawing
- [ ] pointerleave mid-draw correctly cleans up
- [ ] Cross-axis sync works after drawing
- [ ] `npx tsc --noEmit` passes with no new errors
- [ ] DrawToolCore reduced by 25-30%

---

## Implementation Timeline

```
Phase 1 (1-2 days) → Closure to class properties
Phase 2 (2-3 days) → PanTool extraction
Phase 3 (3-5 days) → DrawingTool extraction (Optional)
```

### Decision Gates

**After Phase 1:**
- Did the conversion introduce any regressions?
- Is the code more debuggable?
- Proceed to Phase 2? (Expected: Yes)

**After Phase 2:**
- Did PanTool extraction improve code clarity?
- Is the extraction pattern validated?
- Proceed to Phase 3? (Decision based on team assessment)

**After Phase 3 (if done):**
- Is `paintOnCanvas()` now a clean event coordinator?
- Are new tools easier to add?
- Document lessons learned

---

## File Impact Summary

### Files Modified
| File | Phase | Change |
|------|-------|--------|
| `DrawToolCore.ts` | 1, 2, 3 | Add properties (P1), delegate to PanTool (P2), delegate to DrawingTool (P3) |
| `tools/index.ts` | 2, 3 | Add PanTool, DrawingTool exports |

### Files Created
| File | Phase | Lines (est.) |
|------|-------|-------------|
| `tools/PanTool.ts` | 2 | ~80-100 |
| `tools/DrawingTool.ts` | 3 | ~200-250 |

### Net Line Count Change
| Phase | DrawToolCore | New Files | Net |
|-------|-------------|-----------|-----|
| Phase 1 | +15 (properties) | 0 | +15 |
| Phase 2 | -50 (pan logic) | +90 (PanTool) | +40 |
| Phase 3 | -200 (drawing logic) | +230 (DrawingTool) | +30 |
| **Total** | -235 | +320 | +85 |

> Note: Total line count increases slightly, but DrawToolCore decreases from ~1319 to ~1084 lines, and `paintOnCanvas()` decreases from ~580 to ~150 lines.

---

## Risk Mitigation Strategy

1. **Git tags at each phase** — easy rollback
2. **Phase 1 first** — if this fails, stop immediately (cost: 1-2 days)
3. **Phase 3 is optional** — can stop after Phase 2 with good results
4. **Manual testing checklist** per phase
5. **No API changes** — NrrdTools and external consumers unaffected

---

**Last Updated:** 2026-02-26
**Owner:** Development Team
**Status:** Ready for Phase 1
