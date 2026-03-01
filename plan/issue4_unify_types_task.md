# Issue 4: 统一类型系统 — Task List

> **Status:** ✅ DONE
> **Plan:** [issue4_unify_types_plan.md](issue4_unify_types_plan.md)
> **Target:** 合并 `coreTools/coreType.ts` → `core/types.ts`，删除旧文件

---

## Phase 1 — 迁移类型到 `core/types.ts`

### 1.1 追加所有遗留类型定义
- [x] 将 `coreType.ts` 中以下分组类型追加到 `core/types.ts` 末尾：

**坐标 & 工具类型：**
- [x] `ICommXYZ`, `ICommXY`, `ISkipSlicesDictType`

**Tool Mode & Events：**
- [x] `ToolMode`
- [x] `IDragPrameters`, `IDrawingEvents`, `IContrastEvents`

**Canvas & 渲染：**
- [x] `IPaintImage`, `IPaintImages`
- [x] `ILayerRenderTarget`, `IDownloadImageConfig`

**Mask 数据存储：**
- [x] `INewMaskData`（删除 `type MaskVolume = any` 占位符，改用真正的 `MaskVolume` import）
- [x] `IMaskData`

**Protected 状态：**
- [x] `IProtected`

**GUI 状态接口：**
- [x] `IToolModeState`, `IDrawingConfig`, `IViewConfig`, `ILayerChannelState`
- [x] `IGUIStates`（extends 上述四个）
- [x] `IGuiMeta`, `IGuiParameterSettings`

**NRRD 状态接口：**
- [x] `IImageMetadata`, `IViewState`, `IInteractionState`, `ISphereState`, `IInternalFlags`
- [x] `INrrdStates`（extends 上述五个）

**公共 API 类型：**
- [x] `IAnnotationCallbacks`, `IConvertObjType`, `ICursorPage`
- [x] `IDragOpts`, `IDrawOpts`
- [x] `IKeyBoardSettings`

### 1.2 更新 export 列表
- [x] 确保 `core/types.ts` 底部导出所有新增类型

### 1.3 编译检查
- [x] `npx tsc --noEmit` — 确认新增类型无语法错误

---

## Phase 2 — 更新 import 路径（15 个文件）

### 2.1 `coreTools/` 内部文件（4 个）
- [x] `coreTools/gui.ts` — `./coreType` → `../core/types`
- [x] `coreTools/GuiState.ts` — `./coreType` → `../core/types`
- [x] `coreTools/NrrdState.ts` — `./coreType` → `../core/types`
- [x] `coreTools/divControlTools.ts` — `./coreType` → `../core/types`

### 2.2 `tools/` 内部文件（6 个）
- [x] `tools/BaseTool.ts` — `../coreTools/coreType` → `../core/types`
- [x] `tools/SphereTool.ts` — `../coreTools/coreType` → `../core/types`
- [x] `tools/CrosshairTool.ts` — `../coreTools/coreType` → `../core/types`
- [x] `tools/DrawingTool.ts` — `../coreTools/coreType` → `../core/types`
- [x] `tools/ContrastTool.ts` — `../coreTools/coreType` → `../core/types`
- [x] `tools/DragSliceTool.ts` — `../coreTools/coreType` → `../core/types`

### 2.3 `segmentation/` 根目录文件（4 个）
- [x] `CommToolsData.ts` — 合并两行 import（`coreType` + `core/types`）为一行 `from "./core/types"`
- [x] `DrawToolCore.ts` — `./coreTools/coreType` → `./core/types`
- [x] `DragOperator.ts` — `./coreTools/coreType` → `./core/types`
- [x] `NrrdTools.ts` — `./coreTools/coreType` → `./core/types`

### 2.4 外部文件（2 个）
- [x] `src/ts/index.ts` — 合并两行 coreType import（L44+L47）到 `./Utils/segmentation/core/types`
- [x] `workers/reformatSaveDataWorker.ts` — `../segmentation/coreTools/coreType` → `../segmentation/core/types`

### 2.5 编译检查
- [x] `npx tsc --noEmit` — 无新增错误

---

## Phase 3 — 删除 `coreType.ts` + 更新 barrel export

### 3.1 更新 `core/index.ts`
- [x] 确认 `core/index.ts` 已 re-export 所有从 `types.ts` 新增的类型

### 3.2 删除旧文件
- [x] 删除 `coreTools/coreType.ts`

### 3.3 引用完整性检查
- [x] `grep -r "coreType" src/ts/` — 仅返回 `core/types.ts` 和 `core/index.ts` 中的注释引用

---

## Phase 4 — 验证

### 4.1 编译
- [x] `npx tsc --noEmit` — 零新增错误（所有错误均为预存的 vuetify/plugins/loader 相关错误）

### 4.2 引用完整性
- [x] `grep -rn "coreType" annotator-frontend/src/` — 仅注释，零 import 匹配
- [x] `grep -rn "from.*coreTools/coreType" annotator-frontend/src/` — 零匹配

### 4.3 运行时验证（由用户手动确认）
- [ ] 项目正常启动 `npm run dev`
- [ ] 打开 segmentation 页面，功能无退化
