# Mask Backend Sync & Undo/Redo Overhaul Plan

## Overview

本计划覆盖 mask 数据在前后端之间的实时同步机制，以及 undo/redo 系统从 ImageData/HTMLImageElement 迁移到基于 Delta 的 MaskVolume 方案。

> **Status:** Not Started
> **Priority:** High
> **Depends on:** Phase 3 MaskVolume migration (completed)

---

## 背景与现状分析

### 当前问题

1. **`setMasksData`**: 目前从 JSON 加载 mask，需要改造为接收 1-3 个 layer 的 NIfTI mask 数据（可能含多 channel）
2. **`getMask` 回调**: 当前返回 ImageData（可能是 zoom 后的），需要返回原始 MaskVolume 中对应 slice 的数据
3. **`clearPaint`**: 清空当前 slice 后没有通知外部更新后端
4. **`clearStoreImages`**: 清空所有 slice 但对所有 layer 生效，需改为只对当前激活 layer 生效
5. **Undo/Redo**: 使用 HTMLImageElement 存储（`toDataURL()` 截图），无 redo 支持，无内存上限
6. **`sendInitMaskToBackend`**: 需要在无后端数据时初始化并发送 MaskVolume 到后端 NIfTI 文件

### 当前数据流

```
用户绘制 → DrawToolCore.handleOnDrawingMouseUp()
  → storeAllImages() → ImageStoreHelper
  → MaskVolume.setSliceLabelsFromImageData()
  → nrrd_states.getMask() 回调
  → useMaskOperations.getMaskData()
  → 后端 API (useReplaceMask)
```

### 当前 Undo 存储格式

```typescript
// IUndoType - 每个 slice 一个条目
{
  sliceIndex: number;
  layers: {
    layer1: Array<HTMLImageElement>;  // canvas 截图 (base64 PNG)
    layer2: Array<HTMLImageElement>;
    layer3: Array<HTMLImageElement>;
  }
}
```

---

## 设计方案

### 1. `setMasksData` 重写

**目标**: 接收 1-3 个 layer 的 NIfTI mask 数据，按顺序映射到 layer1/layer2/layer3

```typescript
// 新签名
setMasksData(layerMasks: ArrayBuffer[], loadingBar?: any): void
// layerMasks[0] → layer1, layerMasks[1] → layer2, layerMasks[2] → layer3
```

**逻辑**:
- `layerMasks.length === 1` → 仅更新 layer1
- `layerMasks.length === 2` → 更新 layer1 + layer2
- `layerMasks.length === 3` → 更新 layer1 + layer2 + layer3
- 每个 ArrayBuffer 可能包含多 channel 数据，直接写入对应 MaskVolume

### 2. `getMask` 回调重写

**目标**: 在绘制完成（鼠标释放）后，返回当前操作的 layer/channel/slice/axis 及原始 MaskVolume slice 数据

**方案选择**: 直接返回当前 MaskVolume 中对应 slice+axis 的整个 2D mask 数据（Uint8Array），而非 zoom 后的 ImageData。这样后端只需直接替换 NIfTI 文件中对应 slice 即可。

```typescript
// 新的回调签名
getMask: (
  sliceData: Uint8Array,   // 原始尺寸的 slice mask 数据
  layerId: string,          // "layer1" | "layer2" | "layer3"
  channelId: number,        // 当前 channel (信息性，sliceData 含所有 channel)
  sliceIndex: number,       // slice 编号
  axis: "x" | "y" | "z",   // 视图轴
  width: number,            // slice 原始宽度
  height: number,           // slice 原始高度
  clearFlag: boolean        // 是否为清空操作
) => void;
```

### 3. `clearPaint` 通知外部

**变更**: 在 `clearPaint()` 执行清空后，调用 `getMask` 回调通知外部，传入清空后的 slice 数据和 `clearFlag=true`。

### 4. `clearStoreImages` 改造

**变更**:
- 只清空当前激活 layer 的 MaskVolume，而非所有 layer
- 额外暴露一个回调/事件通知外部清空对应 layer 的整个 NIfTI 数据

```typescript
// 新增回调
onClearLayerVolume: (layerId: string) => void;
```

### 5. Undo/Redo 系统改造

**参考**: `plan/reference/manager/core/UndoManager.ts` 的 Delta-based per-layer 方案

**核心变更**:
- 废弃 `HTMLImageElement` 存储，改用 Delta（记录变更的 voxel 坐标和 old/new value）
- 每个 layer 独立的 undo/redo 栈
- 有上限 (maxStackSize: 50)
- 支持 redo

**Delta 结构**:
```typescript
interface MaskDelta {
  layerId: string;
  axis: "x" | "y" | "z";
  sliceIndex: number;
  // 变更前后的 slice 数据快照（或差异）
  oldSlice: Uint8Array;
  newSlice: Uint8Array;
}
```

**Undo/Redo 与后端同步**:
- Undo 时：还原 MaskVolume 中的 slice → 调用 `getMask` 回调 → 后端更新
- Redo 时：重新应用 MaskVolume 中的 slice → 调用 `getMask` 回调 → 后端更新
- `clearPaint` 操作也记入 undo 栈（记录整个 slice 的 old 数据）
- `clearStoreImages` 操作记入 undo 栈（记录整个 volume 的数据，但这可能太大 — 需讨论是否支持或直接清空 undo 栈）

### 6. `sendInitMaskToBackend` 改造

**变更**: 当没有收到后端 NIfTI 数据时：
- 初始化三个 layer 的 MaskVolume
- 将空的 MaskVolume 数据发送到后端创建三个 NIfTI 文件
- 同时发送 metadata: dimensions, spacing, origin

```typescript
// 需要发送的 metadata
{
  dimensions: [w, h, d],
  spacing: nrrd_states.voxelSpacing,
  origin: nrrd_states.spaceOrigin
}
```

**当收到后端 NIfTI 数据时**:
- 收到多少个就处理多少个
- 整理后传入 `setMasksData()` 更新对应 layer 的 MaskVolume

---

## `useMaskOperations.ts` 改造

### getMaskData 调整

当前接收 `ImageData`，需改为接收新的回调参数（Uint8Array slice 数据 + 元信息），然后发送到后端更新对应 NIfTI 文件的对应 slice。

### 新增 onClearLayerVolume 处理

监听 layer volume 整体清空事件，通知后端清空对应 layer 的 NIfTI 数据。

---

## 关键设计决策

| 决策 | 选择 | 理由 |
|------|------|------|
| getMask 返回数据格式 | 整个 slice 的 Uint8Array | 后端直接替换 NIfTI slice，简化逻辑 |
| Undo 存储格式 | 整个 slice 的 old/new 快照 | 比逐像素 delta 简单，slice 数据量可接受 |
| clearStoreImages undo | 清空 undo 栈，不支持 redo | 整个 volume 快照太大，且语义上是"重置" |
| clearPaint undo | 支持，记录清空前的 slice 数据 | 单 slice 数据量小，用户会期望能撤销 |
| clearStoreImages 作用域 | 仅当前激活 layer | 用户预期清空的是正在操作的 layer |
