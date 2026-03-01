# Issue 4: 统一类型系统 — Plan

> **Status:** ✅ DONE
> **Priority:** MEDIUM
> **Source:** segmentation_architecture_review.md — Issue 4
> **Scope:** `coreTools/coreType.ts` → `core/types.ts`

---

## Problem Statement

两个类型定义模块共存，新代码不确定应该从哪里 import：

| 模块 | 大小 | 角色 | 消费者数量 |
|------|------|------|-----------|
| `coreTools/coreType.ts` | 12KB / 465行 | 遗留扁平接口（GUI状态、绘图事件、Protected数据等） | **15 个文件**, 17 处 import |
| `core/types.ts` | 6KB / 172行 | 新体积渲染类型（Dimensions、Color、Channel等） | **1 个文件** (CommToolsData) |

**混乱点：** `coreType.ts` 中的 `MaskVolume` 是 `type MaskVolume = any` 的占位符（L100），而真正的 `MaskVolume` 类在 `core/MaskVolume.ts` 中。

---

## Solution Design

### 核心思路

将 `coreType.ts` 中所有**仍在使用**的类型迁移到 `core/types.ts`，然后删除 `coreType.ts`。迁移时按语义分组，保持 `core/types.ts` 的良好组织性。

### 类型分类

根据对 `coreType.ts` 中所有 33 个导出项的使用分析：

#### A. 直接迁移到 `core/types.ts`（仍被外部消费）

| 类型 | 引用文件数 | 说明 |
|------|-----------|------|
| `ToolMode` | 2 (NrrdTools, index.ts) | 工具模式枚举 |
| `IGuiMeta` | 1 (index.ts) | GUI slider 配置 |
| `IAnnotationCallbacks` | 2 (BaseTool, index.ts) | 外部回调接口 |
| `ICommXYZ` | 3 (SphereTool, CrosshairTool, DragOperator/DrawToolCore) | 3D 坐标 |
| `ICommXY` | 1 (DrawingTool) | 2D 坐标 |
| `IDownloadImageConfig` | 1 (divControlTools, NrrdTools) | 下载配置 |
| `IConvertObjType` | 2 (CrosshairTool, CommToolsData) | 坐标转换结果 |
| `IDragPrameters` | 1 (DragOperator) | 拖拽参数 |
| `IDrawingEvents` | 2 (DragOperator, DrawToolCore) | 绘图事件 handler |
| `IContrastEvents` | 1 (ContrastTool, DrawToolCore) | 对比度事件 |
| `IProtected` | 4 (BaseTool, DragSliceTool, CommToolsData, DragOperator) | Protected 数据结构 |
| `IGUIStates` | 1 (index.ts) | GUI 状态（合并 interface） |
| `IToolModeState` | 0 (via IGUIStates extends) | 工具模式子接口 |
| `IDrawingConfig` | 0 (via IGUIStates extends) | 绘图配置子接口 |
| `IViewConfig` | 0 (via IGUIStates extends) | 视图配置子接口 |
| `ILayerChannelState` | 0 (via IGUIStates extends) | 图层/通道子接口 |
| `IDragOpts` | 2 (DragOperator, NrrdTools) | 拖拽选项 |
| `IDrawOpts` | 1 (DrawToolCore) | 绘图选项 |
| `INrrdStates` | 1 (index.ts) | NRRD 状态（合并 interface） |
| `IImageMetadata` | 0 (via INrrdStates extends) | 图像元数据子接口 |
| `IViewState` | 0 (via INrrdStates extends) | 视图状态子接口 |
| `IInteractionState` | 0 (via INrrdStates extends) | 交互状态子接口 |
| `ISphereState` | 0 (via INrrdStates extends) | Sphere 状态子接口 |
| `IInternalFlags` | 0 (via INrrdStates extends) | 内部标志子接口 |
| `IPaintImage` | 2 (BaseTool, reformatSaveDataWorker, index.ts) | 绘图图像 |
| `IPaintImages` | 0 (via IPaintImage 关联) | 坐标轴分组绘图 |
| `ISkipSlicesDictType` | 1 (via IProtected) | 跳过切片字典 |
| `IMaskData` | 1 (NrrdTools) | Mask 数据存储 |
| `INewMaskData` | 1 (CommToolsData) | 新 Mask 数据 |
| `ILayerRenderTarget` | 2 (DragSliceTool, CommToolsData) | 层渲染目标 |
| `ICursorPage` | 1 (BaseTool via ToolContext) | 光标页面坐标 |
| `IGuiParameterSettings` | 2 (NrrdTools, index.ts) | GUI 参数设置 |
| `IKeyBoardSettings` | 2 (NrrdTools, CommToolsData) | 键盘设置 |

#### B. 删除（占位符，不再有意义）

| 类型 | 说明 |
|------|------|
| `type MaskVolume = any` (L100) | 占位符，真正的 MaskVolume 在 `core/MaskVolume.ts` |

---

## Files to Modify

| 文件 | 改动 |
|------|------|
| `core/types.ts` | **追加**所有从 `coreType.ts` 迁移的类型定义，按语义分组 |
| `coreTools/coreType.ts` | **删除**整个文件 |
| `coreTools/gui.ts` | 更新 import 路径 |
| `coreTools/GuiState.ts` | 更新 import 路径 |
| `coreTools/NrrdState.ts` | 更新 import 路径 |
| `coreTools/divControlTools.ts` | 更新 import 路径 |
| `tools/BaseTool.ts` | 更新 import 路径 |
| `tools/SphereTool.ts` | 更新 import 路径 |
| `tools/CrosshairTool.ts` | 更新 import 路径 |
| `tools/DrawingTool.ts` | 更新 import 路径 |
| `tools/ContrastTool.ts` | 更新 import 路径 |
| `tools/DragSliceTool.ts` | 更新 import 路径 |
| `CommToolsData.ts` | 更新 import 路径（合并两行 import 为一行） |
| `DrawToolCore.ts` | 更新 import 路径 |
| `DragOperator.ts` | 更新 import 路径 |
| `NrrdTools.ts` | 更新 import 路径 |
| `src/ts/index.ts` | 更新 import 路径（两行合并为一行） |
| `workers/reformatSaveDataWorker.ts` | 更新 import 路径 |

---

## Phase Breakdown

### Phase 1 — 迁移类型到 `core/types.ts`

将 `coreType.ts` 中所有类型（除 `MaskVolume = any` 占位符以外）追加到 `core/types.ts` 末尾。

**组织结构：**
```typescript
// ── Existing content (Dimensions, Colors, Channels) ──────────────────

// ── Coordinate & Utility Types (migrated from coreType.ts) ──────────
//    ICommXYZ, ICommXY, ISkipSlicesDictType

// ── Tool Mode & Events ──────────────────────────────────────────────
//    ToolMode, IDragPrameters, IDrawingEvents, IContrastEvents

// ── Canvas & Rendering ──────────────────────────────────────────────
//    IPaintImage, IPaintImages, ILayerRenderTarget, IDownloadImageConfig

// ── Mask Data Storage ───────────────────────────────────────────────
//    INewMaskData, IMaskData

// ── Protected State ─────────────────────────────────────────────────
//    IProtected

// ── GUI State Interfaces ────────────────────────────────────────────
//    IToolModeState, IDrawingConfig, IViewConfig, ILayerChannelState, IGUIStates
//    IGuiMeta, IGuiParameterSettings

// ── NRRD State Interfaces ───────────────────────────────────────────
//    IImageMetadata, IViewState, IInteractionState, ISphereState, IInternalFlags, INrrdStates

// ── Public API Types ────────────────────────────────────────────────
//    IAnnotationCallbacks, IConvertObjType, ICursorPage
//    IDragOpts, IDrawOpts, IKeyBoardSettings, ToolMode
```

### Phase 2 — 更新所有 import 路径

逐文件将 `from "...coreType"` 改为 `from "...core/types"`。

**路径映射规则：**

| 消费者位置 | 旧路径 | 新路径 |
|-----------|--------|--------|
| `coreTools/` 内 | `./coreType` | `../core/types` |
| `tools/` 内 | `../coreTools/coreType` | `../core/types` |
| `segmentation/` 根 | `./coreTools/coreType` | `./core/types` |
| `src/ts/index.ts` | `./Utils/segmentation/coreTools/coreType` | `./Utils/segmentation/core/types` |
| `workers/` 内 | `../segmentation/coreTools/coreType` | `../segmentation/core/types` |

**特殊处理：**
- `CommToolsData.ts` 当前有两行 import（`coreType` + `core/types`），合并为一行
- `src/ts/index.ts` 当前有两行 import（`coreType` L44+L47 + `core/index` L48+L49），合并 coreType 相关 import 到 core 路径

### Phase 3 — 删除 `coreType.ts`

- 删除 `coreTools/coreType.ts` 文件
- 确认 `core/types.ts` 的 barrel export（`core/index.ts`）已包含新迁移的类型

### Phase 4 — 验证

#### 编译验证
```bash
cd annotator-frontend && npx tsc --noEmit
```
- 零新增错误
- 零对 `coreType` 的残留引用

#### 引用完整性检查
```bash
grep -r "coreType" src/
```
- 应返回空（零匹配）

---

## Non-Goals（本次不做）

- 不重命名任何类型（如 `ICommXYZ` → `Vec3`），这是后续优化
- 不修改 `GuiState.ts` / `NrrdState.ts` 的类内容（只改 import 路径）
- 不重构 `IProtected` 的结构（Issue 5 范围）
- 不拆分 callback interfaces（Issue 3 范围）

---

## Risk Assessment

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|---------|
| `core/index.ts` barrel export 未更新，导致 `src/ts/index.ts` 无法找到类型 | 中 | 高（编译失败） | Phase 3 中明确检查 `core/index.ts` |
| Worker 文件使用不同的 TS 配置，路径解析可能不同 | 低 | 中（编译失败） | Phase 4 的 `tsc --noEmit` 会捕获 |
| 移动类型后运行时行为变化 | 无 | 无 | 纯类型迁移 + re-export，不影响运行时 |
