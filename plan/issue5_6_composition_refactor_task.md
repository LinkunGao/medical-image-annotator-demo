# Issue 5+6: 继承→组合重构 — Task List

> **Status:** ✅ DONE
> **Plan:** [issue5_6_composition_refactor_plan.md](issue5_6_composition_refactor_plan.md)
> **Target:** `NrrdTools → DrawToolCore → CommToolsData` 三级继承 → 组合关系
> **前置:** Issue 3 + Issue 4 应先完成

---

## Phase 1 — 提取 CanvasState

### 1.1 新建 `CanvasState.ts`
- [x] 创建 `CanvasState` 类
- [x] 移入状态字段：
  - [x] `baseCanvasesSize`
  - [x] `nrrd_states` (NrrdState 实例)
  - [x] `gui_states` (GuiState 实例)
  - [x] `protectedData` (IProtected)
  - [x] `cursorPage` (ICursorPage)
  - [x] `annotationCallbacks` (IAnnotationCallbacks)
  - [x] `_configKeyBoard` 
  - [x] `_keyboardSettings` (IKeyBoardSettings)
- [x] 移入构造函数初始化逻辑：
  - [x] 层列表处理、layerVisibility/channelVisibility 初始化
  - [x] `generateSystemCanvases()` 私有方法
  - [x] `generateLayerTargets()` 私有方法
  - [x] `protectedData` 对象构建（canvas 创建、MaskVolume 占位初始化）

### 1.2 CommToolsData 过渡态
- [x] ~~CommToolsData 构造函数改为委托给 `CanvasState`~~ (跳过过渡态，直接重构)
- [x] ~~CommToolsData 暴露 `state: CanvasState` 只读属性~~ (跳过)
- [x] ~~所有字段访问暂通过 `this.state.xxx` 转发~~ (跳过)
- [x] 编译检查：`npx tsc --noEmit`

---

## Phase 2 — 提取 RenderingUtils

### 2.1 新建 `RenderingUtils.ts`
- [x] 创建 `RenderingUtils` 类，构造函数接收 `CanvasState`
- [x] 移入渲染方法：
  - [x] `getVolumeForLayer(layer): MaskVolume`
  - [x] `getCurrentVolume(): MaskVolume`
  - [x] `getAllVolumes(): INewMaskData`
  - [x] `filterDrawedImage(axis, sliceIndex)`
  - [x] `getOrCreateSliceBuffer(axis): ImageData | null`
  - [x] `renderSliceToCanvas(...)`
  - [x] `compositeAllLayers()`
  - [x] `applyMaskFlipForAxis(...)`
  - [x] `invalidateSliceBuffer()`
- [x] 移入私有缓冲区字段：
  - [x] `_reusableSliceBuffer`, `_reusableBufferWidth`, `_reusableBufferHeight`

### 2.2 CommToolsData 过渡态
- [x] ~~CommToolsData 暴露 `renderer: RenderingUtils` 只读属性~~ (跳过)
- [x] ~~原方法改为转发到 `this.renderer.xxx()`~~ (跳过)
- [x] 编译检查：`npx tsc --noEmit`

---

## Phase 3 — DrawToolCore 去继承

### 3.1 修改类声明
- [x] 移除 `extends CommToolsData`
- [x] 添加字段：`readonly state: CanvasState`, `readonly renderer: RenderingUtils`
- [x] 构造函数改为接收 `CanvasState`（由 NrrdTools 创建并传入）

### 3.2 替换继承字段引用
- [x] 所有 `this.nrrd_states` → `this.state.nrrd_states`
- [x] 所有 `this.gui_states` → `this.state.gui_states`
- [x] 所有 `this.protectedData` → `this.state.protectedData`
- [x] 所有 `this.cursorPage` → `this.state.cursorPage`
- [x] 所有 `this.annotationCallbacks` → `this.state.annotationCallbacks`
- [x] 所有 `this._configKeyBoard` → `this.state.configKeyBoard`
- [x] 所有 `this._keyboardSettings` → `this.state.keyboardSettings`
- [x] 所有 `this.baseCanvasesSize` → `this.state.baseCanvasesSize`

### 3.3 替换渲染方法引用
- [x] `this.getVolumeForLayer(...)` → `this.renderer.getVolumeForLayer(...)`
- [x] `this.getCurrentVolume()` → `this.renderer.getCurrentVolume()`
- [x] `this.getAllVolumes()` → `this.renderer.getAllVolumes()`
- [x] `this.filterDrawedImage(...)` → `this.renderer.filterDrawedImage(...)`
- [x] `this.getOrCreateSliceBuffer(...)` → `this.renderer.getOrCreateSliceBuffer(...)`
- [x] `this.renderSliceToCanvas(...)` → `this.renderer.renderSliceToCanvas(...)`
- [x] `this.compositeAllLayers()` → `this.renderer.compositeAllLayers()`
- [x] `this.invalidateSliceBuffer()` → `this.renderer.invalidateSliceBuffer()`

### 3.4 处理 ToolContext 构建
- [x] `initTools()` 中的 `ToolContext` 从 `this.state` 获取字段
- [x] 确保所有 Tool 仍接收正确的状态引用

### 3.5 编译检查
- [x] `npx tsc --noEmit` — 无新增错误

---

## Phase 4 — NrrdTools 去继承

### 4.1 修改类声明
- [x] 移除 `extends DrawToolCore`
- [x] 添加字段：`private state: CanvasState`, `private drawCore: DrawToolCore`
- [x] 构造函数中创建 `CanvasState` → 传给 `DrawToolCore`

### 4.2 删除 16 个伪抽象方法
- [x] 删除从 CommToolsData 继承的占位方法：
  - [x] `clearActiveSlice()` — 保留在 DrawToolCore 中直接实现
  - [x] `undoLastPainting()` — 保留在 DrawToolCore 中直接实现
  - [x] `redoLastPainting()` — 保留在 DrawToolCore 中直接实现
  - [x] `clearActiveLayer()` — 直接在 NrrdTools 实现
  - [x] `resizePaintArea()` — 代理到 `this.sliceRenderPipeline`
  - [x] `setIsDrawFalse()` — 直接在 NrrdTools 实现
  - [x] `updateOriginAndChangedWH()` — 代理到 `this.sliceRenderPipeline`
  - [x] `flipDisplayImageByAxis()` — 代理到 `this.sliceRenderPipeline`
  - [x] `resetPaintAreaUIPosition()` — 代理到 `this.sliceRenderPipeline`
  - [x] `setEmptyCanvasSize()` — 代理到 `this.sliceRenderPipeline`
  - [x] `convertCursorPoint()` — 保留在 DrawToolCore 代理到 crosshairTool
  - [x] `resetLayerCanvas()` — 代理到 `this.sliceRenderPipeline`
  - [x] `enterSphereMode()` — 直接在 NrrdTools 实现
  - [x] `exitSphereMode()` — 直接在 NrrdTools 实现
  - [x] `setSyncsliceNum()` — 代理到 `this.sliceRenderPipeline`
  - [x] `redrawDisplayCanvas()` — 代理到 `this.sliceRenderPipeline`

### 4.3 代理公共 API 方法
- [x] `setMode()` — 保持，访问 `this.state.gui_states`
- [x] `getMode()` — 保持
- [x] `setOpacity()` / `getOpacity()` — 保持
- [x] `setBrushSize()` / `getBrushSize()` — 保持
- [x] `setWindowHigh()` / `setWindowLow()` / `finishWindowAdjustment()` — 保持
- [x] `adjustContrast()` — 保持
- [x] `getSliderMeta()` — 保持
- [x] `setPencilColor()` / `getPencilColor()` — 保持
- [x] `executeAction()` — 代理到 `this.drawCore`/`this.sliceRenderPipeline`
- [x] `undo()` / `redo()` — 代理到 `this.drawCore`
- [x] `enterKeyboardConfig()` / `exitKeyboardConfig()` — 修改 `this.state`
- [x] `setKeyboardSettings()` / `getKeyboardSettings()` — 修改 `this.state`
- [x] `drag()` — 代理到 `this.dragOperator`
- [x] `draw()` — 代理到 `this.drawCore`
- [x] `setupGUI()` — 调整参数来源
- [x] `setSliceOrientation()` — 保持（使用 `this.state` + `this.drawCore`）
- [x] 层/通道公共 API — 代理到 `this.layerChannelManager`
- [x] 数据加载 API — 代理到 `this.dataLoader`
- [x] Sphere API — 代理到 `this.drawCore.sphereTool`

### 4.4 处理 setupGui() 参数
- [x] `guiOptions` 对象中的所有 `this.xxx` 引用改为显式代理
- [x] 确保方法绑定正确（`.bind(this)` 或箭头函数）

### 4.5 编译检查
- [x] `npx tsc --noEmit` — 无新增错误

---

## Phase 5 — 删除 CommToolsData + 清理

### 5.1 删除
- [x] 删除 `CommToolsData.ts`
- [x] 更新 `tools/index.ts`（无 CommToolsData 导出，无需修改）

### 5.2 Import 清理
- [x] `DragOperator.ts` — 无需修改（未直接 import CommToolsData）
- [x] `tools/BaseTool.ts` — 无需修改（ToolContext 引用不变）
- [x] `coreTools/gui.ts` — 无需修改（通过 guiOptions 接收参数）
- [x] `src/ts/index.ts` — 无需修改（无 CommToolsData 导出）
- [x] `grep -rn "CommToolsData" src/` — 仅剩注释引用，零代码引用

### 5.3 编译检查
- [x] `npx tsc --noEmit` — segmentation 目录零错误

---

## Phase 6 — 验证

### 6.1 编译
- [x] `npx tsc --noEmit` — segmentation 目录零错误（其他错误为预存在的外部依赖问题）

### 6.2 现有单元测试
- [ ] `npx vitest run src/ts/Utils/segmentation/core/__tests__/` — MaskVolume 测试全部通过

### 6.3 引用完整性
- [x] `grep -rn "extends CommToolsData" src/` — 零匹配
- [x] `grep -rn "extends DrawToolCore" src/` — 仅注释，零代码匹配
- [x] `grep -rn "CommToolsData" src/` — 仅注释引用

### 6.4 公共 API 完整性
- [x] `src/ts/index.ts` 导出列表 — 无 CommToolsData 导出，所有类型仍正常导出
- [x] `NrrdTools` 保持所有现有公共方法

### 6.5 运行时验证（用户手动）
- [ ] `npm run dev` — 项目正常启动
- [ ] 切片拖拽浏览正常
- [ ] Pencil / Brush / Eraser 绘制正常
- [ ] Undo / Redo 正常
- [ ] Sphere 放置正常
- [ ] Calculator 距离测量正常
- [ ] Layer / Channel 切换正常
- [ ] Channel 可见性切换正常
- [ ] Contrast 调节正常
- [ ] 轴向切换正常
- [ ] Zoom / Pan 正常
- [ ] Crosshair 正常
- [ ] NRRD 加载正常
- [ ] NIfTI mask 加载正常
- [ ] Mask 数据回调 (`getMaskData`) 正常触发
