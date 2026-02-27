# State Management Refactor Plan

> **Status:** Planning
> **Prerequisites:** Tool Extraction Phase 1-2-3 (COMPLETED)
> **Scope:** Full state reorganization — encapsulate Vue access, extract misplaced callbacks/methods, enforce visibility, split flat state objects into semantic groups
> **Estimated Duration:** 3-4 weeks (5 phases)
> **Risk:** Phase 1-3 Low, Phase 4-5 Medium

---

## 1. Problem Statement

### 1.1 The Three State Objects Today

```
nrrd_states (44 properties)     gui_states (30+ properties)     protectedData (20+ properties)
├─ Image metadata               ├─ Tool config                  ├─ DOM references
├─ Mouse tracking state         ├─ Drawing colors               ├─ Canvas elements
├─ Sphere tool state            ├─ Mode flags                   ├─ Canvas contexts
├─ View runtime state           ├─ 6 METHOD functions(!)        ├─ Slice data arrays
├─ Clear/loading flags          ├─ Layer/channel visibility      ├─ Mask volumes
├─ 5 CALLBACK functions(!)      └─ Internal render flags         └─ Axis + Is_Draw
└─ Layer config
```

**Core problems:**

1. **Mixed responsibilities** — `nrrd_states` 里图像元数据（`voxelSpacing`）、鼠标追踪（`Mouse_Over_x`）、Sphere工具状态（`sphereOrigin`）、回调函数（`getMask`）全混在一个扁平对象里

2. **Callbacks in state** — `nrrd_states` 包含 5 个回调（`getMask`, `getSphere`, `getCalculateSpherePositions`, `onClearLayerVolume`, `onChannelColorChanged`），这些应该是事件接口

3. **Methods in state** — `gui_states` 包含 6 个方法（`clear()`, `clearAll()`, `undo()`, `redo()`, `downloadCurrentMask()`, `resetZoom()`），违反 state/behavior 分离

4. **Internal details exposed** — `Mouse_Over_x/y`, `stepClear`, `sphereMaskVolume`, `loadingMaskData`, `previousPanelL/T` 等纯内部状态通过 public `nrrd_states` 暴露给所有代码

5. **GUI access pattern broken** — Vue 组件通过 `guiSettings.value.guiState[key]` 直接改状态 + 手动调 `guiSetting[key].onChange()` 闭包回调

### 1.2 Reference Count Summary

| State Object | Internal Refs | External Refs | Total |
|---|---|---|---|
| `nrrd_states` | ~500+ | 4 (read-only) | ~504 |
| `gui_states` | ~136 | ~39 (via guiSettings) | ~175 |
| `protectedData` | ~398 | 0 | ~398 |
| **Total** | **~1034** | **~43** | **~1077** |

### 1.3 nrrd_states Property Audit

| 类别 | 属性 | 引用数 | 应该属于 |
|------|------|-------|---------|
| **图像元数据** | `originWidth/Height`, `nrrd_x/y/z_mm`, `nrrd_x/y/z_pixel`, `dimensions`, `voxelSpacing`, `spaceOrigin`, `RSARatio`, `ratios` | ~120 | `IImageMetadata` — 加载后不变 |
| **视图运行时** | `changedWidth/Height`, `currentSliceIndex`, `preSliceIndex`, `maxIndex`, `minIndex`, `contrastNum`, `sizeFoctor`, `showContrast`, `previousPanelL/T`, `switchSliceFlag` | ~165 | `IViewState` — 内部，频繁变化 |
| **交互状态** | `Mouse_Over_x/y`, `Mouse_Over`, `cursorPageX/Y`, `isCursorSelect`, `drawStartPos` | ~45 | `IInteractionState` — 内部 |
| **Sphere工具** | `sphereOrigin`, `tumour/skin/rib/nippleSphereOrigin`, `sphereMaskVolume`, `sphereRadius` | ~145 | `ISphereState` — SphereTool 内部 |
| **杂项标志** | `stepClear`, `clearAllFlag`, `loadingMaskData` | ~19 | 各自工具的内部状态 |
| **配置** | `layers` | ~15 | 构造参数/只读配置 |
| **回调(!)** | `getMask`, `getSphere`, `getCalculateSpherePositions`, `onClearLayerVolume`, `onChannelColorChanged` | ~30 | `IAnnotationCallbacks` 接口 |

### 1.4 gui_states Property Audit

| 类别 | 属性 | 引用数 | 问题 |
|------|------|-------|------|
| **工具模式** | `Eraser`, `pencil`, `sphere` | ~34 | OK but should be enum |
| **绘图配置** | `globalAlpha`, `lineWidth`, `color`, `fillColor`, `brushColor`, `brushAndEraserSize` | ~27 | OK, 应通过方法设置 |
| **视图配置** | `mainAreaSize`, `dragSensitivity`, `cursor`, `defaultPaintCursor`, `max_sensitive` | ~15 | `defaultPaintCursor`, `max_sensitive` 应该内部 |
| **Layer/Channel** | `layer`, `activeChannel`, `activeSphereType`, `layerVisibility`, `channelVisibility` | ~56 | OK, 已有部分方法 |
| **内部标志** | `readyToUpdate` | ~11 | 纯内部渲染标志 |
| **方法(!)** | `clear()`, `clearAll()`, `undo()`, `redo()`, `downloadCurrentMask()`, `resetZoom()` | — | **应该是 NrrdTools 方法** |

---

## 2. Phased Refactor Strategy

```
Phase 1 (2-3 days)  → GUI API Encapsulation         [Low Risk]
Phase 2 (1-2 days)  → Callbacks & Methods Extraction [Low Risk]
Phase 3 (1 day)     → Visibility Enforcement         [Low Risk]
Phase 4 (1-2 weeks) → nrrd_states Semantic Split     [Medium Risk]
Phase 5 (3-5 days)  → gui_states Cleanup             [Medium Risk]
```

Each phase is independently deployable and testable.

---

## 3. Phase 1: GUI API Encapsulation (2-3 days)

### Goal
Eliminate all `guiSettings.value.guiState[key]` and `guiSettings.value.guiSetting[key].onChange()` patterns from Vue components. Replace with typed NrrdTools methods.

### New NrrdTools API

```typescript
type ToolMode = "pencil" | "brush" | "eraser" | "sphere" | "calculator";

// Mode switching (replaces 15+ lines in OperationCtl.vue:260-299)
setMode(mode: ToolMode): void;
getMode(): ToolMode;

// Slider properties (replaces guiState[key]=val + guiSetting[key].onChange())
setOpacity(value: number): void;
getOpacity(): number;
setBrushSize(size: number): void;
getBrushSize(): number;
setWindowHigh(value: number): void;
setWindowLow(value: number): void;
finishWindowAdjustment(): void;
adjustContrast(type: "windowHigh" | "windowLow", delta: number): void;

// Metadata for UI rendering (replaces guiSetting[key].min/max/step)
getSliderMeta(key: string): { min: number; max: number; step: number; value: number };

// Color (replaces guiState.color = x)
setPencilColor(hex: string): void;
getPencilColor(): string;

// Button dispatch (replaces guiState[val].call())
executeAction(action: "undo" | "redo" | "clear" | "clearAll" | "resetZoom"): void;
```

### Files Changed

| File | Changes | Impact |
|------|---------|--------|
| `NrrdTools.ts` | Add ~10 public methods | +~100 lines |
| `OperationCtl.vue` | 24 usages → nrrdTools.* calls | −~60 lines |
| `Calculator.vue` | 9 usages → nrrdTools.* calls | −~15 lines |
| `OperationAdvance.vue` | 5 usages → nrrdTools.* calls | −~8 lines |
| `coreType.ts` | Add `ToolMode`, `IGuiMeta` types | +~10 lines |

### Risk: LOW
Additive API — old pattern still works until fully migrated.

---

## 4. Phase 2: Callbacks & Methods Extraction (1-2 days)

### Goal
Remove callbacks from `nrrd_states` and methods from `gui_states`. These don't belong in state objects.

### 2A: Extract Callbacks from nrrd_states

**Before:**
```typescript
// nrrd_states 里混着 5 个回调
interface INrrdStates {
  sphereRadius: number;           // ← state
  getMask: (...) => void;         // ← callback (不是 state!)
  getSphere: (...) => void;       // ← callback
  // ...
}
```

**After:**
```typescript
// 分离为独立接口
interface IAnnotationCallbacks {
  onMaskChanged: (sliceData: Uint8Array, layerId: string, ...) => void;
  onSphereChanged: (origin: number[], radius: number) => void;
  onCalculatorPositionsChanged: (...) => void;
  onLayerVolumeCleared: (layerId: string) => void;
  onChannelColorChanged: (layerId: string, channel: number, color: RGBAColor) => void;
}

// DrawToolCore/NrrdTools 持有 callbacks 实例
class DrawToolCore {
  protected annotationCallbacks: IAnnotationCallbacks = { /* no-op defaults */ };
}
```

**Migration:** 从 `this.nrrd_states.getMask(...)` → `this.annotationCallbacks.onMaskChanged(...)`
- ~30 references to update
- All internal (tools + DrawToolCore + NrrdTools)

### 2B: Extract Methods from gui_states

**Before:**
```typescript
interface IGUIStates {
  globalAlpha: number;     // ← state
  clear: () => void;       // ← method (不是 state!)
  undo: () => void;        // ← method
  // ...
}
```

**After:**
```typescript
interface IGUIStates {
  globalAlpha: number;
  // clear(), undo() etc REMOVED from interface
}

// Methods live in NrrdTools (most already exist)
class NrrdTools {
  undo(): void { ... }          // Already exists at NrrdTools.ts:453
  redo(): void { ... }          // Already exists at NrrdTools.ts:469
  clearActiveSlice(): void { ... }  // Already exists at NrrdTools.ts:1291
  resetZoom(): void { ... }     // NEW: move logic from gui_states.resetZoom
  // ...
}
```

**Migration:**
- Remove 6 method definitions from `gui_states` initialization in CommToolsData.ts
- Update `dat.gui` bindings in gui.ts to call NrrdTools methods
- ~12 references to update

### Risk: LOW
Callbacks are set once and invoked from internal code only. Methods already mostly exist in NrrdTools.

---

## 5. Phase 3: Visibility Enforcement (1 day)

### Goal
Make `nrrd_states`, `gui_states`, `protectedData` inaccessible from outside the core TS modules.

### Changes

```typescript
// CommToolsData.ts
export class CommToolsData {
  // BEFORE: public (anyone can reach in)
  nrrd_states: INrrdStates = { ... };
  gui_states: IGUIStates = { ... };
  protectedData: IProtected;

  // AFTER: protected (only subclasses + internal tools)
  protected nrrd_states: INrrdStates = { ... };
  protected gui_states: IGUIStates = { ... };
  protected protectedData: IProtected;
}
```

### External Violations to Fix (4 total)

| File | Current Access | Fix |
|------|---------------|-----|
| `useDistanceCalculation.ts:51` | `nrrdTools.nrrd_states.voxelSpacing` | → `nrrdTools.getVoxelSpacing()` (already exists) |
| `useDistanceCalculation.ts:58` | `nrrdTools.nrrd_states.spaceOrigin` | → `nrrdTools.getSpaceOrigin()` (already exists) |
| `useDistanceCalculation.ts:148` | `nrrdTools.gui_states.activeSphereType` | → `nrrdTools.getActiveSphereType()` (add getter) |
| `utils.ts:64` | `nrrdTools.nrrd_states.voxelSpacing` | → `nrrdTools.getVoxelSpacing()` (already exists) |

### Tools Still Access via ToolContext (Internal — OK)

```typescript
// tools/BaseTool.ts — ToolContext 是内部接口，传递 protected 引用
interface ToolContext {
  nrrd_states: INrrdStates;    // 同一模块内部，protected 可以传递
  gui_states: IGUIStates;
  protectedData: IProtected;
}
```

DrawToolCore（CommToolsData 的子类）创建 ToolContext 时可以访问 `this.nrrd_states`，然后传递给内部工具。外部代码无法访问。

### Risk: LOW
只有 4 个外部引用需要修复，且替代的 getter 已经存在。

---

## 6. Phase 4: nrrd_states → NrrdState 管理类 (1-2 weeks)

### Goal
创建 `NrrdState` 类集中管理状态，将 44 个属性拆分为 5 个语义组。**不是简单拆接口** — 而是提供带验证、语义化方法的管理类。

### Why a Class, Not Just Interfaces

```typescript
// ❌ 仅拆接口 — 散落各处，任何代码都能直接改
this.imageMetadata.originWidth = -1;  // 没有验证
this.viewState.sizeFoctor = 999;      // 没有约束

// ✅ NrrdState 管理类 — 集中管理，带验证，语义化访问
class NrrdState {
  setZoomFactor(factor: number): void {
    this._view.sizeFoctor = Math.max(1, Math.min(8, factor));
  }
  resetSphereState(): void {
    // 集中管理所有 sphere 重置逻辑，不会遗漏字段
  }
  initializeFromNrrd(data: ...): void {
    // 加载时一次性设置所有 image metadata
  }
}
```

### NrrdState Class Design

```typescript
class NrrdState {
  private _image: IImageMetadata;
  private _view: IViewState;
  private _interaction: IInteractionState;
  private _sphere: ISphereState;
  private _flags: IInternalFlags;

  // Grouped accessors
  get image(): IImageMetadata { return this._image; }
  get view(): IViewState { return this._view; }
  get interaction(): IInteractionState { return this._interaction; }
  get sphere(): ISphereState { return this._sphere; }
  get flags(): IInternalFlags { return this._flags; }

  // Validated setters
  setZoomFactor(factor: number): void;
  setSliceIndex(index: number): void;
  initializeImageMetadata(data: Partial<IImageMetadata>): void;
  resetSphereState(): void;
  resetViewState(): void;
}
```

### New State Interfaces

```typescript
/** 图像元数据 — 加载后不变 */
interface IImageMetadata {
  originWidth: number;
  originHeight: number;
  nrrd_x_mm: number;
  nrrd_y_mm: number;
  nrrd_z_mm: number;
  nrrd_x_pixel: number;
  nrrd_y_pixel: number;
  nrrd_z_pixel: number;
  dimensions: number[];
  voxelSpacing: number[];
  spaceOrigin: number[];
  RSARatio: number;
  ratios: ICommXYZ;
  layers: string[];          // 只读配置
}

/** 视图运行时状态 — 频繁变化 */
interface IViewState {
  changedWidth: number;
  changedHeight: number;
  currentSliceIndex: number;
  preSliceIndex: number;
  maxIndex: number;
  minIndex: number;
  contrastNum: number;
  sizeFoctor: number;        // TODO: rename to sizeFactor
  showContrast: boolean;
  previousPanelL: number;
  previousPanelT: number;
  switchSliceFlag: boolean;
}

/** 鼠标/光标交互 — 纯内部 */
interface IInteractionState {
  Mouse_Over_x: number;     // TODO: rename to mouseOverX
  Mouse_Over_y: number;
  Mouse_Over: boolean;
  cursorPageX: number;
  cursorPageY: number;
  isCursorSelect: boolean;
  drawStartPos: ICommXY;
}

/** Sphere 工具状态 */
interface ISphereState {
  sphereOrigin: ICommXYZ;
  tumourSphereOrigin: ICommXYZ | null;
  skinSphereOrigin: ICommXYZ | null;
  ribSphereOrigin: ICommXYZ | null;
  nippleSphereOrigin: ICommXYZ | null;
  sphereMaskVolume: any;
  sphereRadius: number;
}

/** 内部控制标志 */
interface IInternalFlags {
  stepClear: number;
  clearAllFlag: boolean;
  loadingMaskData: boolean;
}
```

### Migration Strategy: Dual-Track with NrrdState Class

```typescript
// CommToolsData.ts — 迁移期间双轨并行
class CommToolsData {
  protected nrrdState: NrrdState;       // 新: 管理类
  protected nrrd_states: INrrdStates;   // 旧: 保留到所有引用迁移完

  constructor() {
    this.nrrdState = new NrrdState(/* defaults */);
    this.nrrd_states = /* legacy init */;
  }
}

// ToolContext — 迁移期间同时提供新旧访问
interface ToolContext {
  state: NrrdState;              // 新: 工具逐步迁移到这个
  nrrd_states: INrrdStates;     // 旧: 未迁移的工具继续用
  gui: GuiState;                 // Phase 5
  gui_states: IGUIStates;        // Phase 5 之前
  protectedData: IProtected;
  callbacks: IAnnotationCallbacks;
}
```

**Migration approach — tool by tool (从小到大):**

1. Create `NrrdState` class, add to CommToolsData + ToolContext
2. Migrate one tool at a time (旧引用和新引用可以共存):
   - `PanTool` (8 refs — smallest) → use `ctx.state.view.previousPanelL`
   - `ZoomTool` (3 refs) → use `ctx.state.view.sizeFoctor`
   - `ContrastTool` (min refs)
   - `EraserTool` (6 refs)
   - `DrawingTool` (14 refs)
   - `DragSliceTool` (40 refs)
   - `ImageStoreHelper` (12 refs)
   - `CrosshairTool` (55 refs — largest)
   - `SphereTool` (70 refs — largest, mostly sphere state)
4. Migrate `DrawToolCore` (~60 refs)
5. Migrate `NrrdTools` (~100 refs)
6. Remove legacy `nrrd_states` flat object

### Reference Counts Per Tool

| Tool | nrrd_states refs | Primary groups used |
|------|-----------------|---------------------|
| PanTool | 8 | view (previousPanelL/T) |
| ZoomTool | 3 | view (sizeFoctor) |
| ContrastTool | ~3 | view (showContrast) |
| EraserTool | 6 | image (layers), view (changedW/H) |
| DrawingTool | 14 | interaction (drawStartPos), flags (stepClear), view (changedW/H) |
| DragSliceTool | 40 | view (sliceIndex, contrast, changedW/H, showContrast) |
| ImageStoreHelper | 12 | flags (loadingMaskData, clearAllFlag), image (layers) |
| CrosshairTool | 55 | image (nrrd_x/y/z, ratios), interaction (cursorPage), sphere |
| SphereTool | 70 | sphere (all), image (nrrd_x/y/z), view (changedW/H) |
| DrawToolCore | ~60 | 混合 |
| NrrdTools | ~100 | 混合 |

### Risk: MEDIUM
- 500+ 内部引用需要逐步迁移
- 但每个工具可独立迁移、独立测试
- 旧的 `nrrd_states` 在迁移期间保持可用
- 随时可暂停，不影响已迁移的部分

---

## 7. Phase 5: gui_states Cleanup (3-5 days)

### Goal
创建 `GuiState` 管理类，将 24 个属性拆为 4 个语义组，提供带验证的 setter 方法。

### GuiState Class Design

```typescript
class GuiState {
  private _mode: IToolModeState;
  private _drawing: IDrawingConfig;
  private _viewConfig: IViewConfig;
  private _layerChannel: ILayerChannelState;

  get mode(): IToolModeState { return this._mode; }
  get drawing(): IDrawingConfig { return this._drawing; }
  get viewConfig(): IViewConfig { return this._viewConfig; }
  get layerChannel(): ILayerChannelState { return this._layerChannel; }

  // 带验证的 setter
  setToolMode(mode: ToolMode): void {
    // 确保互斥: pencil/eraser/sphere 不能同时 true
  }
  setBrushSize(size: number): void {
    this._drawing.brushAndEraserSize = Math.max(5, Math.min(50, size));
  }
  setOpacity(value: number): void {
    this._drawing.globalAlpha = Math.max(0.1, Math.min(1, value));
  }
}
```

### New Interfaces

```typescript
/** 工具模式配置 */
interface IToolModeState {
  pencil: boolean;
  Eraser: boolean;
  sphere: boolean;
  activeSphereType: SphereType;
}

/** 绘图参数 */
interface IDrawingConfig {
  globalAlpha: number;
  lineWidth: number;
  color: string;
  fillColor: string;
  brushColor: string;
  brushAndEraserSize: number;
}

/** 视图配置 */
interface IViewConfig {
  mainAreaSize: number;
  dragSensitivity: number;
  cursor: string;
  max_sensitive: number;      // → 内部
  defaultPaintCursor: string; // → 内部
  readyToUpdate: boolean;     // → 内部
}

/** Layer/Channel 管理 */
interface ILayerChannelState {
  layer: string;
  activeChannel: number;
  layerVisibility: Record<string, boolean>;
  channelVisibility: Record<string, Record<number, boolean>>;
}
```

### Migration
- ~136 内部引用需迁移
- 工具通过 `this.ctx.gui.drawing.brushColor` 访问
- 比 Phase 4 规模小

### Risk: MEDIUM
同 Phase 4 — 逐步迁移，随时可暂停。

---

## 8. Success Criteria

### Phase 1
- [ ] Zero `guiSettings.value.guiSetting[...].onChange()` in Vue components
- [ ] Zero `guiSettings.value.guiState[...] = value` mutations in Vue components
- [ ] All mode/slider/button operations through typed NrrdTools methods

### Phase 2
- [ ] Zero callbacks in `INrrdStates`
- [ ] Zero methods in `IGUIStates`
- [ ] `IAnnotationCallbacks` interface defined and used

### Phase 3
- [ ] `nrrd_states`, `gui_states`, `protectedData` are `protected`
- [ ] Zero direct external access (0 violations)

### Phase 4
- [ ] `INrrdStates` split into 5 semantic interfaces
- [ ] All tools use grouped access pattern
- [ ] Legacy flat `nrrd_states` removed

### Phase 5
- [ ] `IGUIStates` split into 4 semantic interfaces
- [ ] Internal-only properties hidden

### All Phases
- [ ] `yarn build` — zero new TypeScript errors
- [ ] All manual tests pass (drawing, panning, sphere, contrast, undo/redo)
- [ ] No behavior regressions

---

## 9. Timeline

```
Week 1:  Phase 1 (GUI API) + Phase 2 (Callbacks/Methods)
Week 2:  Phase 3 (Visibility) + Phase 4 begins (nrrd_states split — small tools)
Week 3:  Phase 4 continues (large tools: CrosshairTool, SphereTool, DrawToolCore, NrrdTools)
Week 4:  Phase 4 completes + Phase 5 (gui_states cleanup)
```

Decision gates after each phase — can pause and ship at any point.

---

## 10. Comparison with Overall Plan Assessment

| | Overall Plan Assessment | This Refactor |
|---|---|---|
| **Scope** | 738 refs, 6-8 weeks, "Not Recommended" | 1077 refs but phased, 3-4 weeks |
| **Approach** | Big-bang rewrite | Incremental, per-tool migration |
| **Risk** | HIGH (all or nothing) | LOW→MEDIUM (each phase independent) |
| **Rollback** | Hard | Easy (each phase independently reversible) |
| **User benefit** | None | Phase 1 immediately improves Vue code readability |

The difference: we're not doing a big-bang rewrite. Each phase is a contained change that can be tested, shipped, and rolled back independently.

---

**Last Updated:** 2026-02-27
**Owner:** Development Team
