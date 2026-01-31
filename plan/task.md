# Segmentation Module Refactoring

## Objective
重构 segmentation 模块：3 图层 × 8 通道、Uint8Array 存储、Crosshair/Sphere 跨视图定位、Vitest 测试

---

## Phase 1: Planning & Architecture Design

- [x] Create detailed implementation plan
- [x] Add data persistence strategy (Phase 0)
- [x] Document core interaction features
- [x] Document Pencil vs Brush tool differences
- [x] Document Canvas layer architecture
- [x] Add affected files analysis
- [x] Add GUI refactoring recommendations (StateManager)
- [ ] **🔒 User approval to proceed**

---

## Phase 0: Data Persistence Strategy (准备阶段)

### 0.1 Database Schema 修改
- [x] [MODIFY] `models/db_model.py` CaseOutput:
  - 删除: `mask_nii_path`, `mask_nii_size`
  - 新增: `mask_layer1_nii_path`, `mask_layer1_nii_size`
  - 新增: `mask_layer2_nii_path`, `mask_layer2_nii_size`
  - 新增: `mask_layer3_nii_path`, `mask_layer3_nii_size`
- [x] [MODIFY] `main.py` get_tool_config: 更新 file_info 映射逻辑
- [x] [MODIFY] `router/tumour_segmentation.py` get_cases_infos: 返回新字段
- [ ] 运行数据库迁移 (或重建数据库)

### 0.2 后端 API 重构
- [x] [NEW] `/api/mask/init-layers` - 创建 3 个 NIfTI 文件
- [x] [NEW] `/api/mask/delta` - 增量更新指定 layer 的 NIfTI
- [x] [NEW] `/api/mask/all/{case_id}` - 1 个请求返回全部 3 个 layer (msgpack) ⭐
- [x] [NEW] `/api/mask/raw/{case_id}/{layer_id}` - 返回 Raw Uint8Array
- [x] [NEW] `ws://host/ws/mask/{case_id}` - WebSocket 实时推送 (AI 推理)

### 0.3 前端适配
- [x] 安装依赖: `nifti-reader-js`, `@msgpack/msgpack`
- [x] `MaskLayerLoader.parseNIfTI()` - 从 NIfTI 文件加载
- [x] `MaskLayerLoader.loadFromRaw()` - 从 Raw Uint8Array 加载 ⭐
- [x] `MaskLayerLoader.loadAllMasks()` - 1 个请求加载全部
- [x] WebSocket 接收 mask 更新 (`createMaskWebSocket`)
- [x] Debounced Auto-Save 实现 (`DebouncedAutoSave` class)
- [x] 空 Mask 初始化逻辑 (`MaskLayerLoader.initializeEmptyMasks()`)
- [ ] **🧪 User Testing: 验证后端 API 响应**
- [ ] **🧪 User Testing: 验证新 case 初始化流程**
- [ ] **🧪 User Testing: 验证 NIfTI 和 Raw 两种加载方式**

---

## Phase 2: Core Data Layer

### 2.1 Types & Constants
- [ ] `core/types.ts` - 定义 ExportMaskData, Delta, CHANNEL_COLORS

### 2.2 MaskLayer
- [ ] `core/MaskLayer.ts` - 单图层 Uint8Array 存储
- [ ] 实现 `applyBrush()` - 画笔操作
- [ ] 实现 `fillPolygon()` - Pencil 多边形填充 ⭐
- [ ] 实现 `erase()` - 橡皮擦
- [ ] 实现 `exportSlice()` / `importSlice()` - 数据导入导出

### 2.3 LayerManager
- [ ] `core/LayerManager.ts` - 3 图层管理
- [ ] 实现 `getActiveLayer()` / `setActiveLayer()`
- [ ] 实现 `lockLayer()` / `unlockLayer()`

### 2.4 VisibilityManager
- [ ] `core/VisibilityManager.ts` - 通道显示/隐藏
- [ ] 实现 `setLayerVisible()` / `setChannelVisible()`
- [ ] 实现 `getVisibleLayers()` / `getVisibleChannels()`

### 2.5 UndoManager
- [ ] `core/UndoManager.ts` - 每 layer 独立 undo/redo 栈
- [ ] 实现 `push(deltas)` / `undo()` / `redo()`
- [ ] 实现 `setActiveLayer()` 切换当前操作栈

### 2.6 KeyboardManager
- [ ] `core/KeyboardManager.ts` - 可自定义快捷键
- [ ] 实现 `registerAction()` / `onKeyDown()` / `onKeyUp()`
- [ ] 支持 Crosshair/Contrast 可禁用配置

- [ ] **🧪 User Testing: 创建 MaskLayer 并验证 Uint8Array 读写**

---

## Phase 3: Tool Abstraction

### 3.1 BaseTool
- [ ] `tools/BaseTool.ts` - 抽象接口定义
- [ ] `ToolContext` 接口 (layerManager, undoManager, sizeFactor...)
- [ ] 坐标转换: `screenToOriginal()` / `originalToScreen()`

### 3.2 PencilTool ⭐
- [ ] `tools/PencilTool.ts` - 多边形自动填充
- [ ] 拖动时画红色轮廓预览
- [ ] 松开时闭合路径并填充

### 3.3 BrushTool
- [ ] `tools/BrushTool.ts` - 连续圆形笔刷
- [ ] 预览圆形光标
- [ ] 拖动时连续填充

### 3.4 EraserTool
- [ ] `tools/EraserTool.ts` - 橡皮擦
- [ ] 仅擦除当前 layer

### 3.5 PanTool
- [ ] `tools/PanTool.ts` - 右键平移画布

### 3.6 ZoomTool
- [ ] `tools/ZoomTool.ts` - 滚轮缩放 / Slice 切换

### 3.7 ContrastTool
- [ ] `tools/ContrastTool.ts` - Ctrl 调节 window center/width

- [ ] **🧪 User Testing: Pencil 画闭合区域并验证自动填充**
- [ ] **🧪 User Testing: Brush 涂抹并验证连续圆形叠加**

---

## Phase 4: Rendering Pipeline

### 4.1 Canvas Setup
- [ ] 精简为 3 个 Canvas: displayCanvas, drawingLayer, maskDisplayCanvas
- [ ] 移除旧的 8 个 Canvas

### 4.2 MaskRenderer
- [ ] `rendering/MaskRenderer.ts` - 从 Uint8Array 渲染到 Canvas
- [ ] 实现 `render()` - 按 visibility 设置渲染
- [ ] 实现脏区域追踪优化 (dirtyRects)

### 4.3 Animation Loop
- [ ] `requestAnimationFrame` 渲染循环
- [ ] 仅在数据变化时重绘

- [ ] **🧪 User Testing: 验证 3 层 Canvas 正确显示**
- [ ] **🧪 User Testing: 验证缩放后画笔坐标正确**

---

## Phase 5: Crosshair & Sphere Tools

### 5.1 CrosshairTool
- [ ] `tools/CrosshairTool.ts` - 跨视图定位
- [ ] 按 S 键启用/禁用
- [ ] 点击记录 3D 坐标
- [ ] 跳转其他视图时同步 mask 显示
- [ ] 复用 `convertCursorPoint()` 逻辑

### 5.2 SphereTool
- [ ] `tools/SphereTool.ts` - 4 个全局位置标记
- [ ] tumour / skin / nipple / ribcage
- [ ] 滚轮调整半径

- [ ] **🧪 User Testing: 在 Z 视图点击后切换到 Y 视图验证 Crosshair 同步**

---

## Phase 6: Integration

### 6.1 SegmentationManager
- [ ] `SegmentationManager.ts` - 统一管理入口
- [ ] 实现 `getMaskData()` / `setMasksData()` 兼容现有 API
- [ ] 整合所有 managers 和 tools

### 6.2 StateManager (GUI 解耦)
- [ ] `core/StateManager.ts` - Vue 组件状态管理
- [ ] 替代现有 `guiSettings.guiState` / `guiSetting.onChange()` 模式
- [ ] 提供类型安全的状态更新 API

### 6.3 Vue Component Updates
- [ ] 更新 `OperationCtl.vue` - 使用 StateManager
- [ ] 更新 `Calculator.vue` - 使用 StateManager
- [ ] 更新 `OperationAdvance.vue` - 使用 StateManager
- [ ] 更新 `useMaskOperations.ts` - 使用新 API

### 6.4 Event Bus Migration
- [ ] 保留 `Core:NrrdTools` 事件或迁移到 StateManager
- [ ] 保留 `Segmentation:FinishLoadAllCaseImages` 事件
- [ ] 验证所有 emitter 事件正常工作

- [ ] **🧪 User Testing: 验证 Vue 组件与新 API 正常交互**
- [ ] **🧪 User Testing: 验证 getMask/setMask 与后端兼容**

---

## Phase 7: Testing (Vitest)

### 7.1 Setup
- [ ] 安装 `vitest @vitest/ui jsdom`
- [ ] 配置 `vitest.config.ts`

### 7.2 Unit Tests
- [ ] `MaskLayer.test.ts` - Uint8Array 操作测试
- [ ] `LayerManager.test.ts` - 图层管理测试
- [ ] `UndoManager.test.ts` - undo/redo 测试
- [ ] `VisibilityManager.test.ts` - 显示/隐藏测试

### 7.3 Integration Tests
- [ ] `PencilTool.test.ts` - 多边形填充测试
- [ ] `BrushTool.test.ts` - 笔刷测试
- [ ] `CrosshairTool.test.ts` - 跨视图定位测试

- [ ] **🧪 User Testing: 运行 `yarn test` 验证所有测试通过**

---

## Phase 8: Cleanup & Documentation

- [ ] 删除旧代码: `CommToolsData.ts`, `DrawToolCore.ts` (拆分后)
- [ ] 更新 README 或添加开发文档
- [ ] 代码审查

- [ ] **🎉 Final User Acceptance Testing**

---

## Legend

- `[ ]` 未开始
- `[/]` 进行中
- `[x]` 已完成
- `🔒` 需要用户批准
- `🧪` 用户测试检查点
- `⭐` 核心功能
