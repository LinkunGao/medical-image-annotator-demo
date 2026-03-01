# Issue 3: 统一 Callback 接口 — Task List

> **Status:** ✅ DONE
> **Plan:** [issue3_unify_callbacks_plan.md](issue3_unify_callbacks_plan.md)
> **Target:** 10 个 `*Callbacks` 接口 → 1 个 `ToolHost` 接口 + `Pick<>` 缩窄

---

## Phase 1 — 创建 ToolHost 接口

### 1.1 新建 `tools/ToolHost.ts`
- [x] 定义 `ToolHost` 接口，包含所有 47 个去重后的宿主方法（约 35 个唯一方法）
- [x] 按语义分组：Canvas/Rendering、Volume、State/Lifecycle、Drawing、Sphere/Crosshair、Data Loading、GUI/Observer
- [x] 为每个 Tool 定义 `Pick<>` 类型别名：
  - [x] `ImageStoreHostDeps = Pick<ToolHost, 'setEmptyCanvasSize' | 'drawImageOnEmptyImage'>`
  - [x] `PanHostDeps = Pick<ToolHost, 'zoomActionAfterDrawSphere'>`
  - [x] `ContrastHostDeps = Pick<ToolHost, 'setIsDrawFalse' | 'setSyncsliceNum'>`
  - [x] `ZoomHostDeps = Pick<ToolHost, 'resetPaintAreaUIPosition' | 'resizePaintArea' | 'setIsDrawFalse'>`
  - [x] `SphereHostDeps = Pick<ToolHost, 'setEmptyCanvasSize' | 'drawImageOnEmptyImage' | 'enableCrosshair' | 'setUpSphereOrigins'>`
  - [x] `DrawingHostDeps = Pick<ToolHost, 'setCurrentLayer' | 'compositeAllLayers' | 'syncLayerSliceData' | 'filterDrawedImage' | 'getVolumeForLayer' | 'pushUndoDelta' | 'getEraserUrls'>`
  - [x] `DragSliceHostDeps = Pick<ToolHost, 'setSyncsliceNum' | 'setIsDrawFalse' | 'flipDisplayImageByAxis' | 'setEmptyCanvasSize' | 'getOrCreateSliceBuffer' | 'renderSliceToCanvas' | 'refreshSphereOverlay'>`
  - [x] `LayerChannelHostDeps = Pick<ToolHost, 'reloadMasksFromVolume' | 'getVolumeForLayer' | 'onChannelColorChanged'>`
  - [x] `SliceRenderHostDeps = Pick<ToolHost, 'compositeAllLayers' | 'getOrCreateSliceBuffer' | 'renderSliceToCanvas' | 'getVolumeForLayer' | 'refreshSphereOverlay' | 'syncGuiParameterSettings' | 'repraintCurrentContrastSlice' | 'clearUndoHistory' | 'updateShowNumDiv' | 'updateCurrentContrastSlice'>`
  - [x] `DataLoaderHostDeps = Pick<ToolHost, 'invalidateSliceBuffer' | 'setDisplaySlicesBaseOnAxis' | 'afterLoadSlice' | 'setEmptyCanvasSize' | 'syncLayerSliceData' | 'reloadMasksFromVolume' | 'resetZoom'>`

### 1.2 更新 `tools/index.ts`
- [x] 导出 `ToolHost` 及所有 `*HostDeps` 类型别名

### 1.3 编译检查
- [x] `npx tsc --noEmit` — 无新增错误

---

## Phase 2 — 迁移 DrawToolCore 层工具（6 个）

### 2.1 ImageStoreHelper
- [x] 删除 `ImageStoreCallbacks` 接口
- [x] 构造函数 `callbacks` 参数类型改为 `ImageStoreHostDeps`
- [x] DrawToolCore `initTools()` 中传 callback 对象（类型自动兼容）
- [x] 编译检查

### 2.2 PanTool
- [x] 删除 `PanCallbacks` 接口
- [x] 构造函数 `callbacks` 参数类型改为 `PanHostDeps`
- [x] DrawToolCore `initTools()` 中传 callback 对象（类型自动兼容）
- [x] 编译检查

### 2.3 ContrastTool
- [x] 删除 `ContrastCallbacks` 接口
- [x] 构造函数 `callbacks` 参数类型改为 `ContrastHostDeps`
- [x] DrawToolCore `initTools()` 中传 callback 对象（类型自动兼容）
- [x] 编译检查

### 2.4 ZoomTool
- [x] 删除 `ZoomCallbacks` 接口
- [x] 构造函数 `callbacks` 参数类型改为 `ZoomHostDeps`
- [x] DrawToolCore `initTools()` 中传 callback 对象（类型自动兼容）
- [x] 编译检查

### 2.5 SphereTool
- [x] 删除 `SphereCallbacks` 接口
- [x] 构造函数 `callbacks` 参数类型改为 `SphereHostDeps`
- [x] DrawToolCore `initTools()` 中传 callback 对象（类型自动兼容）
- [x] 编译检查

### 2.6 DrawingTool
- [x] 删除 `DrawingCallbacks` 接口
- [x] 构造函数 `callbacks` 参数类型改为 `DrawingHostDeps`
- [x] DrawToolCore `initTools()` 中传 callback 对象（类型自动兼容）
- [x] 编译检查

---

## Phase 3 — 迁移 NrrdTools 层模块（3 个）

### 3.1 LayerChannelManager
- [x] 删除 `LayerChannelCallbacks` 接口
- [x] 构造函数 `callbacks` 参数类型改为 `LayerChannelHostDeps`
- [x] NrrdTools `initNrrdToolsModules()` 中传 callback 对象（类型自动兼容）
- [x] 编译检查

### 3.2 SliceRenderPipeline
- [x] 删除 `SliceRenderCallbacks` 接口
- [x] 构造函数 `callbacks` 参数类型改为 `SliceRenderHostDeps`
- [x] NrrdTools `initNrrdToolsModules()` 中传 callback 对象（类型自动兼容）
- [x] 编译检查

### 3.3 DataLoader
- [x] 删除 `DataLoaderCallbacks` 接口
- [x] 构造函数 `callbacks` 参数类型改为 `DataLoaderHostDeps`
- [x] NrrdTools `initNrrdToolsModules()` 中传 callback 对象（类型自动兼容）
- [x] 编译检查

---

## Phase 4 — 迁移 DragSliceTool

### 4.1 DragSliceTool
- [x] 删除 `DragSliceCallbacks` 接口
- [x] 构造函数 `callbacks` 参数类型改为 `DragSliceHostDeps`

### 4.2 DragOperator 调整
- [x] DragOperator 无需修改 — callback 对象在 `init()` 中构建，类型通过结构化子类型自动兼容
- [x] 编译检查

---

## Phase 5 — 清理 + 验证

### 5.1 引用清理
- [x] 确认 `grep -rn "interface.*Callbacks" src/ts/Utils/segmentation/tools/` — tools/ 下无残留 `*Callbacks` 接口
- [x] 确认所有旧 Callbacks 接口已删除（整个 src/ 树中零残留引用）

### 5.2 全量编译
- [x] `npx tsc --noEmit` — segmentation 代码零新增错误

### 5.3 运行时验证（用户手动）
- [ ] `npm run dev` — 项目正常启动
- [ ] Pencil 绘制：正常
- [ ] Brush 绘制：正常
- [ ] Eraser 擦除：正常
- [ ] Sphere 放置：正常
- [ ] 右键 Pan：正常
- [ ] Wheel Zoom：正常
- [ ] Contrast 调节：正常
- [ ] Crosshair 点击：正常
- [ ] 切片拖拽：正常
- [ ] Layer/Channel 切换：正常
