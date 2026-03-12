# Issue 5+6: CommToolsData 重构 + 继承→组合 — Plan

> **Status:** 🔲 TODO
> **Priority:** LOW（工作量最大，风险最高）
> **Source:** segmentation_architecture_review.md — Issue 5 + Issue 6
> **Scope:** `CommToolsData.ts`, `DrawToolCore.ts`, `NrrdTools.ts`
> **前置依赖:** Issue 3（统一 Callback 接口）和 Issue 4（统一类型系统）应先完成

---

## Problem Statement

### Issue 5: CommToolsData 职责不清

`CommToolsData` 混合了两种职责：
- **状态容器**：`nrrd_states`, `gui_states`, `protectedData`, `cursorPage`, `annotationCallbacks`, `_keyboardSettings`
- **渲染工具方法**：`filterDrawedImage()`, `getOrCreateSliceBuffer()`, `renderSliceToCanvas()`, `compositeAllLayers()`, `applyMaskFlipForAxis()`

类名 "CommToolsData" 也无法反映其实际作用域。

### Issue 6: 三级继承链

```
NrrdTools → DrawToolCore → CommToolsData
```

- **16 个"伪抽象"方法**：CommToolsData 定义了 16 个 `throw new Error(...)` 方法作为抽象占位，要求子类重写
- **`protected` 隐式共享**：DrawToolCore 访问 CommToolsData 的 `nrrd_states`, `gui_states`, `protectedData` 等；NrrdTools 又进一步继承
- **方法溯源困难**：查找 `this.setSyncsliceNum()` 需要跨 3 个文件跳转

---

## Solution Design

### 核心思路

将三级继承链拆分为**组合模式**：

```
现在:
  NrrdTools extends DrawToolCore extends CommToolsData

目标:
  NrrdTools (Facade, 公共 API)
    ├─ has─a → DrawToolCore (工具编排, 事件路由)
    │          ├─ has─a → CanvasState (纯状态容器)
    │          └─ has─a → RenderingUtils (渲染工具方法)
    └─ has─a → CanvasState (共享引用)
```

### 拆分 CommToolsData

| 新类 | 来源 | 职责 |
|------|------|------|
| **CanvasState** | CommToolsData 的状态字段 | 纯数据容器：`nrrd_states`, `gui_states`, `protectedData`, `cursorPage`, `annotationCallbacks`, `_keyboardSettings`, `baseCanvasesSize` |
| **RenderingUtils** | CommToolsData 的方法 | 渲染工具：`filterDrawedImage()`, `getOrCreateSliceBuffer()`, `renderSliceToCanvas()`, `compositeAllLayers()`, `applyMaskFlipForAxis()`, `getVolumeForLayer()`, `getCurrentVolume()`, `getAllVolumes()` |

### 消除继承

| 改动 | 说明 |
|------|------|
| `DrawToolCore` 不再 `extends CommToolsData` | 改为 `has-a CanvasState` + `has-a RenderingUtils` |
| `NrrdTools` 不再 `extends DrawToolCore` | 改为 `has-a DrawToolCore` + 公共 API 代理 |
| 删除 16 个 "伪抽象" 方法 | 不再需要 `throw new Error("Child class must implement...")` |
| `protected` → 显式 accessor | 所有跨层引用改为 `this.state.xxx` 或 `this.renderer.xxx` |

### 公共 API 兼容性

`NrrdTools` 作为 Facade 保持现有公共 API 不变：

```typescript
// 用户代码无需任何修改
const tools = new NrrdTools(container);
tools.setMode("brush");
tools.drag();
tools.draw({ getMaskData: ... });
```

Facade 内部代理到组合对象：

```typescript
class NrrdTools {
  private drawCore: DrawToolCore;
  private state: CanvasState;
  
  setMode(mode: ToolMode): void {
    // 代理到内部实现
  }
  
  drag(opts?: IDragOpts): void {
    this.drawCore.dragOperator.drag(opts);
  }
}
```

---

## Detailed Class Design

### CanvasState（纯状态容器）

```typescript
// 文件: segmentation/CanvasState.ts
export class CanvasState {
  baseCanvasesSize: number = 1;
  
  readonly nrrd_states: NrrdState;
  readonly gui_states: GuiState;
  readonly protectedData: IProtected;
  readonly cursorPage: ICursorPage;
  
  annotationCallbacks: IAnnotationCallbacks;
  configKeyBoard: boolean = false;
  keyboardSettings: IKeyBoardSettings;
  
  constructor(container: HTMLElement, mainAreaContainer: HTMLElement, options?: { layers?: string[] }) {
    // 当前 CommToolsData 构造函数的状态初始化逻辑
  }
}
```

### RenderingUtils（渲染工具方法）

```typescript
// 文件: segmentation/RenderingUtils.ts
export class RenderingUtils {
  private state: CanvasState;
  
  constructor(state: CanvasState) {
    this.state = state;
  }
  
  getVolumeForLayer(layer: string): MaskVolume { ... }
  getCurrentVolume(): MaskVolume { ... }
  getAllVolumes(): INewMaskData { ... }
  filterDrawedImage(axis, sliceIndex): ... { ... }
  getOrCreateSliceBuffer(axis): ImageData | null { ... }
  renderSliceToCanvas(...): void { ... }
  compositeAllLayers(): void { ... }
  applyMaskFlipForAxis(...): void { ... }
  invalidateSliceBuffer(): void { ... }
}
```

### DrawToolCore（工具编排，不再继承）

```typescript
// 文件: segmentation/DrawToolCore.ts
export class DrawToolCore {
  readonly state: CanvasState;
  readonly renderer: RenderingUtils;
  
  // 工具实例
  private sphereTool: SphereTool;
  private drawingTool: DrawingTool;
  // ... 其他工具
  
  // 事件路由
  private eventRouter: EventRouter;
  undoManager: UndoManager;
  
  // 公共接口
  drawingPrameters: IDrawingEvents;
  contrastEventPrameters: IContrastEvents;
  
  constructor(container: HTMLElement, state: CanvasState) {
    this.state = state;
    this.renderer = new RenderingUtils(state);
    // initTools(), initDrawToolCore()...
  }
}
```

### NrrdTools（Facade，不再继承）

```typescript
// 文件: segmentation/NrrdTools.ts
export class NrrdTools {
  private state: CanvasState;
  private drawCore: DrawToolCore;
  private dragOperator: DragOperator;
  
  // 提取的模块
  private layerChannelManager: LayerChannelManager;
  private sliceRenderPipeline: SliceRenderPipeline;
  private dataLoader: DataLoader;
  
  constructor(container: HTMLDivElement, options?: { layers?: string[] }) {
    const mainAreaContainer = document.createElement("div");
    this.state = new CanvasState(container, mainAreaContainer, options);
    this.drawCore = new DrawToolCore(container, this.state);
    // ...
  }
  
  // 公共 API 代理
  setMode(mode: ToolMode): void { ... }
  getMode(): ToolMode { ... }
  drag(opts?: IDragOpts): void { this.dragOperator.drag(opts); }
  draw(opts?: IDrawOpts): void { this.drawCore.draw(opts); }
  // ... 所有现有公共方法
}
```

---

## Files to Modify

### 新建文件

| 文件 | 说明 |
|------|------|
| `CanvasState.ts` | 纯状态容器（从 CommToolsData 提取） |
| `RenderingUtils.ts` | 渲染工具方法（从 CommToolsData 提取） |

### 重构文件

| 文件 | 改动 |
|------|------|
| `CommToolsData.ts` | **删除**（内容拆分到 CanvasState + RenderingUtils） |
| `DrawToolCore.ts` | 去掉 `extends CommToolsData`，改为持有 `CanvasState` + `RenderingUtils` 实例 |
| `NrrdTools.ts` | 去掉 `extends DrawToolCore`，改为持有 `DrawToolCore` 实例，16 个伪抽象方法变为直接实现 |

### 受影响文件（import/引用更新）

| 文件 | 改动 |
|------|------|
| `DragOperator.ts` | 从 `CanvasState` 获取状态引用 |
| `tools/BaseTool.ts` | `ToolContext` 可能引用 `CanvasState` 而非散落字段 |
| `coreTools/gui.ts` | 接收参数调整 |
| `src/ts/index.ts` | 更新 import（如需要） |

---

## Phase Breakdown

### Phase 1 — 提取 CanvasState

1. 新建 `CanvasState.ts`
2. 将 CommToolsData 中的以下内容移入：
   - 所有状态字段（`nrrd_states`, `gui_states`, `protectedData`, `cursorPage`, `annotationCallbacks`, `_keyboardSettings`, `baseCanvasesSize`）
   - 构造函数的初始化逻辑（canvas 创建、layerTargets 生成、MaskVolume 占位初始化）
   - `generateSystemCanvases()`, `generateLayerTargets()` 私有方法
3. CommToolsData 改为持有 `CanvasState` 实例（过渡态）
4. 编译检查

### Phase 2 — 提取 RenderingUtils

1. 新建 `RenderingUtils.ts`
2. 将 CommToolsData 中的以下方法移入：
   - `getVolumeForLayer()`, `getCurrentVolume()`, `getAllVolumes()`
   - `filterDrawedImage()`, `getOrCreateSliceBuffer()`, `renderSliceToCanvas()`
   - `compositeAllLayers()`, `applyMaskFlipForAxis()`, `invalidateSliceBuffer()`
3. RenderingUtils 接收 `CanvasState` 引用
4. CommToolsData 改为持有 `RenderingUtils` 实例（过渡态）
5. 编译检查

### Phase 3 — DrawToolCore 去继承

1. `DrawToolCore` 移除 `extends CommToolsData`
2. 构造函数接收 `CanvasState` + `RenderingUtils`（或由自身创建 `RenderingUtils`）
3. 所有 `this.nrrd_states` → `this.state.nrrd_states`
4. 所有 `this.protectedData` → `this.state.protectedData`
5. 所有 `this.compositeAllLayers()` → `this.renderer.compositeAllLayers()`
6. 等等...
7. 编译检查

### Phase 4 — NrrdTools 去继承

1. `NrrdTools` 移除 `extends DrawToolCore`
2. 构造函数创建 `CanvasState` + `DrawToolCore` 实例
3. 删除 16 个 "伪抽象" 方法占位（现在直接实现或代理到 SliceRenderPipeline）
4. 保持所有公共 API 方法签名不变
5. 所有内部 `this.xxx` 调用改为代理到 `this.drawCore.xxx` 或 `this.state.xxx`
6. 编译检查

### Phase 5 — 删除 CommToolsData + 清理

1. 删除 `CommToolsData.ts`
2. 更新 `DragOperator.ts`、`tools/BaseTool.ts` 等受影响的 import
3. 更新 `ToolContext` 接口（如需要）
4. 全量编译

### Phase 6 — 验证

#### 编译验证
```bash
cd annotator-frontend && npx tsc --noEmit
```

#### 现有单元测试
```bash
cd annotator-frontend && npx vitest run src/ts/Utils/segmentation/core/__tests__/
```
- MaskVolume 测试应全部通过（MaskVolume 不受此重构影响）

#### 运行时验证（用户手动）
- `npm run dev` — 项目正常启动
- 打开 segmentation 页面：
  - 切片拖拽浏览正常
  - Pencil / Brush / Eraser 绘制正常
  - Undo / Redo 正常
  - Sphere 工具正常
  - Layer / Channel 切换正常
  - Contrast 调节正常
  - 轴向切换（Axial / Sagittal / Coronal）正常
  - Zoom / Pan 正常
  - Crosshair 正常

---

## Non-Goals（本次不做）

- 不重命名公共 API 方法（保持 `NrrdTools` 的外部接口完全不变）
- 不重构 `DragOperator` 的内部结构（只更新其状态引用来源）
- 不重构工具层（`tools/` 下的 `BaseTool` 及各个 Tool 类的 ToolContext 注入方式不变）
- 不合并 `GuiState` / `NrrdState` 到 `CanvasState`（它们保持独立语义子组）
- 不修改 `EventRouter` 内部逻辑

---

## Risk Assessment

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| NrrdTools 公共 API 签名意外变更导致外部消费者编译失败 | 中 | 高 | Phase 4 后 `npx tsc --noEmit` 全量编译；对比现有 index.ts 导出列表 |
| `this` 绑定丢失（从继承改为组合后，方法传递时丢失上下文）| 高 | 高 | 所有代理方法使用箭头函数或 `.bind(this)`；特别注意 `gui.ts` 中通过引用传递的方法 |
| `protected` 访问变 `public/private`，语义泄漏 | 中 | 中 | CanvasState 的字段使用 `readonly` 阻止外部意外修改；仅 NrrdTools/DrawToolCore 可修改 |
| 16 个伪抽象方法删除后，某个间接调用路径遗漏 | 中 | 高 | 编译器会捕获类型错误；运行时验证覆盖所有工具 |
| Phase 3-4 改动量巨大，中间态不可编译 | 高 | 中 | 每个 Phase 内部按文件逐步替换，保持可编译；必要时引入过渡态（CommToolsData 转发到 CanvasState） |
| setupGui() 依赖大量 `this.xxx` 方法引用传递 | 中 | 高 | gui.ts 的 `guiOptions` 对象需逐一检查，改为显式代理 |

---

## Estimated Effort

| Phase | 预估改动量 | 难度 |
|-------|-----------|------|
| Phase 1 (CanvasState) | ~300 行移动 + ~50 行新代码 | ⭐⭐ |
| Phase 2 (RenderingUtils) | ~200 行移动 + ~30 行新代码 | ⭐⭐ |
| Phase 3 (DrawToolCore 去继承) | ~500 行修改（`this.xxx` → `this.state.xxx`） | ⭐⭐⭐⭐ |
| Phase 4 (NrrdTools 去继承) | ~800 行修改（最大、最复杂） | ⭐⭐⭐⭐⭐ |
| Phase 5 (删除 + 清理) | ~100 行删除 + import 更新 | ⭐⭐ |
| Phase 6 (验证) | 编译 + 手动测试 | ⭐⭐ |

**总计：** ~2000 行改动，预计 3-5 个工作周期
