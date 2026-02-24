# Mask Backend Sync & Undo/Redo Task List

## Overview

前后端 mask 数据实时同步 + Undo/Redo 系统改造的详细任务分解。

> **Status:** Phases 1-7 Completed (All Tasks Done)
> **Plan:** [mask_backend_sync_plan.md](mask_backend_sync_plan.md)
> **Estimated Duration:** 2 weeks
> **Completed:** All Phases (1-7)

---

## Phase 1: getMask 回调重写 & 后端同步

### Task 1.1: 重新定义 getMask 回调签名 ✅

- [x] 在 `coreType.ts` 中更新 `INrrdStates.getMask` 签名
  - 新参数: `sliceData: Uint8Array, layerId, channelId, sliceIndex, axis, width, height, clearFlag`
- [x] 同步更新 `IDrawOpts.getMaskData` 签名
- [x] 更新所有引用 `getMask` 的初始化代码 (`CommToolsData.ts` 默认回调)

### Task 1.2: 修改 DrawToolCore 中 mouse up 后的 getMask 调用 ✅

- [x] 在 `ImageStoreHelper.storeAllImages()` 中，绘制完成后：
  - 从 MaskVolume 中提取当前 axis + sliceIndex 对应的 2D slice Uint8Array
  - 调用新签名的 `getMask` 回调，传入原始尺寸数据（非 zoom 后的）
- [x] 新增 `MaskVolume.getSliceUint8(sliceIndex, axis)` 方法提取 slice 数据

### Task 1.3: 修改 useMaskOperations.ts 中的 getMaskData ✅

- [x] 更新 `IToolMaskData` 接口 (`models/ui.ts`) 匹配新参数格式
- [x] 更新 `LeftPanelCore.vue` 中的 `getMaskData` 回调函数签名
- [x] 更新 `IReplaceMask` 接口 (`models/segmentation.ts`) 包含新字段
- [x] 更新 `getMaskData()` 接收新参数格式并发送到后端
- [x] 后端 API 调用传入: layerId, channelId, sliceIndex, axis, sliceData, width, height

**完成标准**: 用户绘制后松开鼠标，前端自动将原始尺寸的 slice mask 数据发送到后端

**验证**: TypeScript 编译通过，101 个单元测试全部通过

---

## Phase 2: clearPaint 通知外部 ✅

### Task 2.1: clearPaint 调用 getMask 通知 ✅

- [x] 在 `DrawToolCore.clearPaint()` 执行清空后：
  - 提取清空后的 slice 数据（全零 Uint8Array）
  - 调用 `getMask` 回调，`clearFlag=true`
- [x] 确保只清空当前 axis + sliceIndex 的数据

### Task 2.2: useMaskOperations 处理 clear 通知 ✅

- [x] `getMaskData()` 中根据 `clearFlag` 判断是否为清空操作
- [x] 向后端发送对应 slice 的清空指令（调用 `useClearMaskMesh`）

**完成标准**: 用户点击 clear mask → 前端通知后端 → 后端 NIfTI 对应 slice 被清零

**实现细节**:
- [DrawToolCore.ts:1118-1154](../annotator-frontend/src/ts/Utils/segmentation/DrawToolCore.ts#L1118-L1154) - 修改 `clearPaint()` 添加 getMask 回调调用
- [useMaskOperations.ts:159-179](../annotator-frontend/src/composables/left-panel/useMaskOperations.ts#L159-L179) - `getMaskData()` 处理 clearFlag

---

## Phase 3: clearStoreImages 改造 ✅

### Task 3.1: clearStoreImages 仅作用于当前激活 layer ✅

- [x] 修改 `NrrdTools.clearStoreImages()`（或 DrawToolCore 中的实现）
  - 只重新初始化当前激活 layer 的 MaskVolume
  - 不影响其他 layer 的数据
- [x] 清空对应 layer 的所有 canvas

### Task 3.2: 新增 onClearLayerVolume 回调 ✅

- [x] 在 `INrrdStates` 或 `IDrawOpts` 中新增 `onClearLayerVolume: (layerId: string) => void` 回调
- [x] `clearStoreImages` 执行后调用此回调
- [x] 在 `useMaskOperations.ts` 中监听此回调，通知后端清空对应 layer 的 NIfTI 数据

**完成标准**: 用户点击 clearAll → 仅清空当前 layer → 后端对应 layer 的 NIfTI 被重置

**实现细节**:
- [coreType.ts:238-250](../annotator-frontend/src/ts/Utils/segmentation/coreTools/coreType.ts#L238-L250) - 添加 `onClearLayerVolume` 到 `INrrdStates`
- [coreType.ts:258-271](../annotator-frontend/src/ts/Utils/segmentation/coreTools/coreType.ts#L258-L271) - 添加到 `IDrawOpts`
- [CommToolsData.ts:85-98](../annotator-frontend/src/ts/Utils/segmentation/CommToolsData.ts#L85-L98) - 默认 no-op 回调
- [NrrdTools.ts:896-909](../annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L896-L909) - `clearStoreImages()` 只清空激活 layer
- [DrawToolCore.ts:253-260](../annotator-frontend/src/ts/Utils/segmentation/DrawToolCore.ts#L253-L260) - `draw()` 绑定回调
- [LeftPanelCore.vue:326-328,359](../annotator-frontend/src/components/viewer/LeftPanelCore.vue#L326-L328) - 添加回调和 emit
- [LeftPanelController.vue:15](../annotator-frontend/src/views/LeftPanelController.vue#L15) - 事件绑定
- [useMaskOperations.ts:181-196](../annotator-frontend/src/composables/left-panel/useMaskOperations.ts#L181-L196) - `onClearLayerVolume()` 处理器

---

## Phase 4: setMasksData 重写 ✅

### Task 4.1: 重写 setMasksData 接收 NIfTI 数据 ✅

- [x] 新签名: `setMasksFromNIfTI(layerMasks: ArrayBuffer[], loadingBar?)`
- [x] 实现按顺序映射逻辑:
  - 1个 → layer1
  - 2个 → layer1 + layer2
  - 3个 → layer1 + layer2 + layer3
- [x] 将 ArrayBuffer（NIfTI 格式）解析并写入对应 layer 的 MaskVolume
- [x] 解析后刷新当前显示的 canvas（从 MaskVolume 重新渲染）

### Task 4.2: 更新 useMaskOperations.ts 中的 setMaskData ✅

- [x] 修改 `setMaskData()` 从后端获取 NIfTI 文件数据（而非 JSON）
- [x] 收到多少个 NIfTI 文件就整理多少个 ArrayBuffer
- [x] 传入 `nrrdTools.setMasksFromNIfTI(layerMasks)`
- [x] 保留 legacy JSON 路径作为 fallback

**完成标准**: 后端返回 1-3 个 NIfTI mask 文件 → 正确加载到对应 layer 的 MaskVolume

**实现细节**:
- [NrrdTools.ts:396-464](../annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L396-L464) - 新增 `setMasksFromNIfTI()` 方法
- [useMaskOperations.ts:121-173](../annotator-frontend/src/composables/left-panel/useMaskOperations.ts#L121-L173) - 重写 `setMaskData()` 优先加载 NIfTI
- [case.ts:14-26](../annotator-frontend/src/models/case.ts#L14-L26) - 添加 NIfTI 路径字段到 `IOutput`
- [masks.ts:90-112](../annotator-frontend/src/plugins/api/masks.ts#L90-L112) - 使用 `useGetMaskRaw` API

---

## Phase 5: sendInitMaskToBackend 改造 ✅

### Task 5.1: 无后端数据时初始化 ✅

- [x] 当 `setMaskData()` 未收到后端数据时:
  - 确保三个 layer 的 MaskVolume 已初始化（应该已经在创建时初始化了）
  - 将空 MaskVolume 数据发送到后端创建三个 NIfTI 文件
- [x] 发送 metadata: `dimensions`, `spacing` (`voxelSpacing`), `origin` (`spaceOrigin`)

### Task 5.2: 收到后端数据时的处理 ✅

- [x] 收到 NIfTI 文件后，整理为 ArrayBuffer 数组
- [x] 调用 `setMasksFromNIfTI()` 更新对应 layer
- [x] 确保已有数据的 layer 不会被覆盖为空

**完成标准**: 首次加载 → 创建空 NIfTI 文件（含正确 metadata）；后续加载 → 正确还原 mask

**实现细节**:
- [useMaskOperations.ts:64-93](../annotator-frontend/src/composables/left-panel/useMaskOperations.ts#L64-L93) - 重写 `sendInitMaskToBackend()` 使用 `useInitMaskLayers`
- [useMaskOperations.ts:134-173](../annotator-frontend/src/composables/left-panel/useMaskOperations.ts#L134-L173) - `setMaskData()` 优先级: NIfTI → JSON → init
- [masks.ts:139-153](../annotator-frontend/src/plugins/api/masks.ts#L139-L153) - 使用 `useInitMaskLayers` API

---

## Phase 6: Undo/Redo 系统改造 ✅

### Task 6.1: 实现 Delta-based UndoManager ✅

- [x] 参照 `plan/reference/manager/core/UndoManager.ts`，在项目中实现新的 UndoManager
- [x] Delta 结构 (`MaskDelta`):
  ```typescript
  interface MaskDelta {
    layerId: string;
    axis: "x" | "y" | "z";
    sliceIndex: number;
    oldSlice: Uint8Array;  // 操作前的 slice 快照
    newSlice: Uint8Array;  // 操作后的 slice 快照
  }
  ```
- [x] Per-layer 独立的 undo/redo 栈
- [x] maxStackSize: 50

### Task 6.2: 绘制操作的 Undo 记录 ✅

- [x] 在 `handleOnDrawingMouseDown` 中：记录当前 slice 的快照（oldSlice）
- [x] 在 `handleOnDrawingMouseUp` 中：记录操作后的 slice（newSlice）
- [x] 将 `{ oldSlice, newSlice, layerId, axis, sliceIndex }` push 到 UndoManager

### Task 6.3: Undo 执行逻辑 ✅

- [x] `undoLastPainting()` 改为:
  - 从 UndoManager 获取 delta
  - 将 `oldSlice` 写回 MaskVolume（via 新增 `MaskVolume.setSliceUint8()`）
  - 重新渲染 canvas（via `applyUndoRedoToCanvas()`）
  - 调用 `getMask` 回调通知后端

### Task 6.4: Redo 执行逻辑 ✅

- [x] 新增 `redoLastPainting()` 方法:
  - 从 UndoManager 获取 redo delta
  - 将 `newSlice` 写回 MaskVolume
  - 重新渲染 canvas
  - 调用 `getMask` 回调通知后端
- [x] 绑定快捷键 Ctrl+Y 和 Ctrl+Shift+Z
- [x] 在 dat.GUI 面板中暴露 Redo 按钮

### Task 6.5: clearPaint 的 Undo 支持 ✅

- [x] `clearPaint()` 执行前记录当前 slice 的 oldSlice
- [x] 清空后 newSlice 为全零
- [x] Push delta 到 UndoManager
- [x] Undo clearPaint → 还原 slice → 通知后端

### Task 6.6: clearStoreImages 的 Undo 处理 ✅

- [x] `clearStoreImages()` 执行时清空当前 layer 的 undo/redo 栈
- [x] 不支持 redo（volume 快照太大）
- [x] 通知外部 layer volume 被清空

### Task 6.7: 移除旧 Undo 系统 ✅

- [x] 删除 `IUndoType` 类型定义
- [x] 删除 `UndoLayerType` 类型定义
- [x] 删除 `undoArray` 属性及相关初始化代码（改为 `undoManager: UndoManager`）
- [x] 删除 `getCurrentUndo()` 方法
- [x] 清理所有 `toDataURL()` 相关的 undo 逻辑

**完成标准**:
- Undo (Ctrl+Z) 正确还原绘制操作并同步后端 ✅
- Redo (Ctrl+Y / Ctrl+Shift+Z) 正确重做操作并同步后端 ✅
- clearPaint 可 undo ✅
- clearStoreImages 清空 undo 栈 ✅
- 内存使用有上限（max 50 steps per layer）✅
- 101 个单元测试全部通过 ✅

**实现细节**:
- [core/UndoManager.ts](../annotator-frontend/src/ts/Utils/segmentation/core/UndoManager.ts) - 新建 UndoManager 类
- [core/MaskVolume.ts](../annotator-frontend/src/ts/Utils/segmentation/core/MaskVolume.ts) - 新增 `setSliceUint8()` 方法（`getSliceUint8` 的逆操作）
- [DrawToolCore.ts](../annotator-frontend/src/ts/Utils/segmentation/DrawToolCore.ts) - 替换整个旧 undo 系统，新增 `undoLastPainting()` / `redoLastPainting()` / `applyUndoRedoToCanvas()`
- [NrrdTools.ts](../annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts) - `clearStoreImages()` 清空 layer undo 栈，`afterLoadSlice()` / `clear()` 重置所有栈
- [coreType.ts](../annotator-frontend/src/ts/Utils/segmentation/coreTools/coreType.ts) - 添加 `redo` 到 `IGUIStates` 和 `IGuiParameterSettings`，移除 `IUndoType` / `UndoLayerType`
- [gui.ts](../annotator-frontend/src/ts/Utils/segmentation/coreTools/gui.ts) - 添加 Redo 按钮到 dat.GUI 面板

---

## Phase 7: 集成测试 & 清理 ✅

### Task 7.1: 端到端测试 ✅

- [x] 测试绘制 → 后端 NIfTI 更新
- [x] 测试 clearPaint → 后端 slice 清零
- [x] 测试 clearStoreImages → 后端 layer NIfTI 重置
- [x] 测试 undo/redo → 后端正确同步
- [x] 测试 setMasksData 加载 1/2/3 个 layer
- [x] 测试 sendInitMaskToBackend 创建空 NIfTI

### Task 7.2: 多视图测试 ✅

- [x] 测试 axial (z), coronal (y), sagittal (x) 三个视图的 mask 操作
- [x] 确保 slice 数据在不同 axis 下正确提取和写回

### Task 7.3: 代码清理 ✅

- [x] 移除所有 ImageData 相关的 mask 存储代码（如果还有残留）
- [x] 移除 JSON mask 加载逻辑
- [x] 更新类型定义
- [x] 确保 build 通过

---

## 依赖关系

```
Phase 1 (getMask 重写) ← 基础，其他 phase 依赖
Phase 2 (clearPaint) ← 依赖 Phase 1
Phase 3 (clearStoreImages) ← 独立
Phase 4 (setMasksData) ← 独立
Phase 5 (sendInitMask) ← 依赖 Phase 4
Phase 6 (Undo/Redo) ← 依赖 Phase 1
Phase 7 (测试) ← 依赖所有
```

**建议执行顺序**: Phase 1 → Phase 4 → Phase 5 → Phase 2 → Phase 3 → Phase 6 → Phase 7
