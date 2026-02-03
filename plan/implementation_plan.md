# Segmentation Module Refactoring Plan

## Overview

重构 `segmentation` 模块：**3 图层 × 8 通道**、`Uint8Array` 存储、跨视图 Crosshair、自定义键盘、全局透明度控制。

### 核心需求
| 需求 | 说明 |
|------|------|
| **3 图层独立** | layer1, layer2, layer3 操作互不影响 |
| **8 通道/图层** | 每图层 8 通道 (0-7)，可多选显示/隐藏 |
| **Uint8Array** | 替代 ImageData，getMask/setMask API 更新 |
| **缩放处理** | Uint8Array 始终为原始尺寸，与 sizeFactor 无关 |
| **键盘管理** | 重构为 KeyboardManager，支持自定义按键 |
| **全局透明度** | 保持全局 globalAlpha 不变 |

### 核心交互功能 (必须保留)

> [!CAUTION]
> 以下功能在重构后必须保持一致，除按键可用户自定义外。

#### Normal Mode (默认模式)

| 输入 | 行为 | 可禁用 |
|------|------|--------|
| **鼠标右键拖动** | PAN (平移画布) | ❌ |
| **鼠标左键上下拖动** | 切换 slice (DragOperator) | ❌ |
| **Shift + 左键拖动** | 画笔/橡皮擦操作 | ❌ |
| **滚轮** (默认) | 定点 Zoom (放大/缩小) | 可切换 |
| **滚轮** (Slice模式) | 切换 slice | 可切换 |
| **S 键** | 启用/禁用 Crosshair 模式 | ✅ 可配置禁用 |
| **Ctrl 键** | 启用/禁用 Contrast 调节模式 | ✅ 可配置禁用 |
| **Ctrl + Z** | 撤销 (当前 layer) | ❌ |
| **Ctrl + Y** | 重做 (当前 layer) | ❌ |

#### Drawing Tools: Pencil vs Brush

> [!CAUTION]
> **Pencil 和 Brush 是两个完全不同的工具，不能混淆！**

**Pencil Tool** (`gui_states.segmentation = true`):
1. **拖动时**: 画红色轮廓线 (lines 数组记录坐标)
2. **松开鼠标时**: 
   - 清除红色轮廓线
   - 使用 `ctx.closePath()` 闭合路径
   - 使用 `ctx.fill()` 填充轮廓内区域为当前 channel 颜色
3. **原理**: 多边形自动填充

```typescript
// Pencil 核心代码 (handleOnDrawingMouseUp)
ctx.beginPath();
ctx.moveTo(lines[0].x, lines[0].y);
for (let i = 1; i < lines.length; i++) {
  ctx.lineTo(lines[i].x, lines[i].y);
}
ctx.closePath();
ctx.fillStyle = this.gui_states.fillColor;
ctx.fill();  // ⭐ 自动填充多边形内部
```

**Brush Tool** (`gui_states.segmentation = false`):
1. **拖动时**: 直接在当前位置画圆形笔触
2. **松开鼠标时**: 保留所有笔触
3. **原理**: 连续圆形叠加

```typescript
// Brush 核心代码 (start 函数)
this.protectedData.ctxes.drawingCtx.arc(
  this.nrrd_states.Mouse_Over_x,
  this.nrrd_states.Mouse_Over_y,
  this.gui_states.brushAndEraserSize / 2 + 1,
  0, Math.PI * 2
);
```

**重构时的 Tool 类设计**:
```typescript
// tools/PencilTool.ts
class PencilTool extends BaseTool {
  private lines: { x: number, y: number }[] = []
  
  onPointerDown(e: PointerEvent): void {
    this.lines = [{ x: e.offsetX, y: e.offsetY }]
  }
  
  onPointerMove(e: PointerEvent): void {
    this.lines.push({ x: e.offsetX, y: e.offsetY })
    this.drawOutline()  // 画红色轮廓预览
  }
  
  onPointerUp(): Delta[] {
    const polygon = this.lines.map(p => this.screenToOriginal(p))
    return this.fillPolygon(polygon, this.ctx.currentChannel)
  }
}
```

#### Crosshair Mode (S 键启用后)

| 输入 | 行为 |
|------|------|
| **左键点击** | 显示十字虚线，记录 3D 坐标 |
| **点击其他视图** | 跳转到对应 slice，同步 mask 显示 |
| **S 键** | 退出 Crosshair 模式 |

#### Sphere Mode (gui_states.sphere = true)

| 输入 | 行为 |
|------|------|
| **左键点击** | 放置 sphere 中心点 |
| **左键 + 滚轮** | 调整 sphere 半径 |
| **左键松开** | 确认 sphere，在所有视图绘制 |

#### Calculator Mode (gui_states.calculator = true)

| 输入 | 行为 |
|------|------|
| **左键点击** | 放置 tumour/skin/nipple/ribcage 位置标记 |

#### Contrast Mode (Ctrl 键启用后)

| 输入 | 行为 |
|------|------|
| **左键水平拖动** | 调整 window center |
| **左键垂直拖动** | 调整 window width |
| **Ctrl 键** | 退出 Contrast 模式 |

#### 键盘设置默认值

```typescript
keyboardSettings: {
  draw: "Shift",           // 画笔模式
  undo: "z",               // 撤销 (需配合 Ctrl/Meta)
  redo: "y",               // 重做 (需配合 Ctrl/Meta)
  contrast: ["Control", "Meta"],  // Contrast 模式
  crosshair: "s",          // Crosshair 模式
  mouseWheel: "Scroll:Zoom" | "Scroll:Slice"  // 滚轮行为
}
```

---

## Canvas Layer Architecture

> [!IMPORTANT]
> 重构后采用清晰的 3 层 Canvas 架构，数据与显示分离

### 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│  Layer 3: maskDisplayCanvas (最上层 - Mask 显示层)              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  - 接收鼠标/键盘事件                                         ││
│  │  - 根据 VisibilityManager 设置渲染:                          ││
│  │    • Layer 1 (channel 0-7) ← 可独立显示/隐藏                 ││
│  │    • Layer 2 (channel 0-7) ← 可独立显示/隐藏                 ││
│  │    • Layer 3 (channel 0-7) ← 可独立显示/隐藏                 ││
│  │  - globalAlpha 控制整体透明度                                ││
│  └─────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│  Layer 2: drawingLayer (中层 - 绘图预览层)                      │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  - Pencil 红色轮廓预览 (临时，不保存)                        ││
│  │  - Brush 笔触预览                                            ││
│  │  - Crosshair 十字线                                          ││
│  │  - Sphere 预览圆                                             ││
│  └─────────────────────────────────────────────────────────────┘│
├─────────────────────────────────────────────────────────────────┤
│  Layer 1: displayCanvas (最底层 - NRRD Slice 图像)              │
│  ┌─────────────────────────────────────────────────────────────┐│
│  │  - 显示当前 slice 的医学图像                                 ││
│  │  - Contrast/Window 调节后的渲染                              ││
│  └─────────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

### 数据层 (内存中的 Uint8Array，不是 Canvas)

```
┌─────────────────────────────────────────────────────────────────┐
│  MaskLayer1: Uint8Array (448 × 448 × 120) ← 3D 体数据           │
│  MaskLayer2: Uint8Array (448 × 448 × 120) ← 3D 体数据           │
│  MaskLayer3: Uint8Array (448 × 448 × 120) ← 3D 体数据           │
└─────────────────────────────────────────────────────────────────┘
```

### 数据流

```
用户操作 (Pencil/Brush/Eraser)
         ↓
    drawingLayer (预览)
         ↓
    鼠标松开
         ↓
写入 MaskLayer (Uint8Array) + 生成 Delta
         ↓
    UndoManager.push(deltas)
         ↓
    渲染循环 (requestAnimationFrame)
         ↓
MaskRenderer: Uint8Array → maskDisplayCanvas
```

### 与现有架构对比

| 现有 (8 个 Canvas) | 重构后 (3 个 Canvas) |
|-------------------|---------------------|
| displayCanvas | displayCanvas (保留) |
| drawingCanvas | drawingLayer (重命名) |
| drawingCanvasLayerMaster | ❌ 删除 (合并到渲染逻辑) |
| drawingCanvasLayerOne/Two/Three | ❌ 删除 (数据在 Uint8Array) |
| drawingSphereCanvas | drawingLayer (合并) |
| emptyCanvas | ❌ 删除 (不再需要中转) |
| - | maskDisplayCanvas (新增) |

### 优势

1. **数据与显示分离**: Uint8Array 是真正的数据源，Canvas 只负责显示
2. **减少内存**: 从 8 个 Canvas 减少到 3 个
3. **渲染清晰**: 每帧从 Uint8Array 读取并渲染
4. **Layer/Channel 控制**: VisibilityManager 控制显示，不影响数据

---

## Phase 0: Data Persistence Strategy (New)

> [!IMPORTANT]
> **核心问题**: 当前每次保存都发送整个 slice 的像素数组到后端，JSON 文件需要完整读取、修改、再写入，效率低且存在数据丢失风险。

### 当前问题分析

| 问题 | 影响 |
|------|------|
| **JSON 存储效率低** | 448×448 slice RGBA 数组 JSON 序列化后约 800KB-3MB |
| **完整读写** | 每次修改都需要读取整个 JSON (可能 100MB+) 并重写 |
| **无增量同步** | 画一笔就发送整个 slice，网络开销大 |
| **刷新丢失** | 前端状态与后端不一致时会丢失未保存数据 |

### 推荐方案：**混合存储 + Delta 同步**

#### 1. 数据库 Schema 修改

**[MODIFY] `CaseOutput` 表新增字段**:

```python
# annotator-backend/models/db_model.py
class CaseOutput(Base):
    __tablename__ = 'case_outputs'
    # ... 现有字段 ...
    
    # 新增: 3 个 layer 的 NIfTI 路径和大小
    layer1_nii_path = Column(String, nullable=True)
    layer1_nii_size = Column(Integer, nullable=True)  # > 0 表示有数据
    layer2_nii_path = Column(String, nullable=True)
    layer2_nii_size = Column(Integer, nullable=True)
    layer3_nii_path = Column(String, nullable=True)
    layer3_nii_size = Column(Integer, nullable=True)
```

**[MODIFY] `get_cases_infos` API 响应**:

```python
# annotator-backend/router/tumour_segmentation.py
"output": {
    # 现有字段...
    "mask_json_path": case.output.mask_json_path,
    "mask_json_size": case.output.mask_json_size,
    # 新增: 各 layer 路径和大小
    "layer1_nii_path": case.output.layer1_nii_path if case.output else None,
    "layer1_nii_size": case.output.layer1_nii_size if case.output else None,
    "layer2_nii_path": case.output.layer2_nii_path if case.output else None,
    "layer2_nii_size": case.output.layer2_nii_size if case.output else None,
    "layer3_nii_path": case.output.layer3_nii_path if case.output else None,
    "layer3_nii_size": case.output.layer3_nii_size if case.output else None,
}
```

#### 2. 后端文件存储结构

```
outputs/user-xxx/assay-xxx/.../case-xxx/
├── mask-json.json           # 旧格式 (保持兼容)
├── layer1.nii.gz            # NIfTI 格式 3D 体数据 (压缩后 ~1-5MB)
├── layer2.nii.gz
└── layer3.nii.gz
```

#### 3. 前端按需加载逻辑

**[MODIFY] `LeftPanelController.vue` / `useMaskOperations.ts`**:

// 根据 case.output 的 size 判断哪些 layer 有数据
async function loadMaskLayers(caseDetail: ICaseDetail): Promise<void> {
  const layers = [
    { name: 'layer1', path: caseDetail.output.layer1_nii_path, size: caseDetail.output.layer1_nii_size },
    { name: 'layer2', path: caseDetail.output.layer2_nii_path, size: caseDetail.output.layer2_nii_size },
    { name: 'layer3', path: caseDetail.output.layer3_nii_path, size: caseDetail.output.layer3_nii_size },
  ]
  
  // 检查是否所有 layer 都没有数据 (新 case)
  const allEmpty = layers.every(l => !l.size || l.size === 0)
  
  if (allEmpty) {
    // 🆕 初始化: 创建空的 Uint8Array 并发送给后端
    await initializeEmptyMasks(caseDetail)
    return
  }
  
  // 只加载 size > 0 的 layer
  const layersToLoad = layers.filter(l => l.size && l.size > 0)
  
  // 并行加载有数据的 layer
  await Promise.all(layersToLoad.map(async (layer) => {
    const response = await fetch(`/api/single-file?path=${encodeURIComponent(layer.path)}`)
    const arrayBuffer = await response.arrayBuffer()
    // 解析 NIfTI → Uint8Array
    const niftiData = nifti.readNIFTI(arrayBuffer)
    segmentationManager.setLayerData(layer.name, new Uint8Array(niftiData.data))
  }))
}
```

#### 3.1 初始化空 Mask 逻辑 (新 Case)

> [!IMPORTANT]
> 当 `layer1_nii_size`, `layer2_nii_size`, `layer3_nii_size` 都为 0 时，需要前端初始化

```typescript
/**
 * 初始化空 mask (新 case 首次加载)
 * 现有逻辑在 useMaskOperations.ts 的 sendInitMaskToBackend()
 * 重构后移至 SegmentationManager
 */
async function initializeEmptyMasks(caseDetail: ICaseDetail): Promise<void> {
  const dimensions = segmentationManager.getDimensions() // [width, height, depth]
  const totalVoxels = dimensions[0] * dimensions[1] * dimensions[2]
  
  // 为每个 layer 创建空的 Uint8Array
  const emptyLayer = new Uint8Array(totalVoxels) // 默认全 0
  
  // 初始化 3 个 layer
  segmentationManager.initLayer('layer1', emptyLayer.slice())
  segmentationManager.initLayer('layer2', emptyLayer.slice())
  segmentationManager.initLayer('layer3', emptyLayer.slice())
  
  // 通知后端创建空的 NIfTI 文件
  await useInitMasks({
    caseId: caseDetail.id,
    dimensions,
    voxelSpacing: segmentationManager.getVoxelSpacing(),
    spaceOrigin: segmentationManager.getSpaceOrigin(),
  })
  
  console.log('Initialized empty masks for new case')
}

#### 4. Mask 数据加载策略

> [!IMPORTANT]
> 前端支持两种数据格式：NIfTI 文件 和 Raw Uint8Array

**加载策略**:
| 场景 | 方式 | API |
|-----|------|-----|
| **初始加载** | 1 个请求加载全部 3 个 layer | `GET /api/mask/all/{case_id}` |
| **后续更新** (AI 推理等) | WebSocket 推送指定 layer | `ws://host/ws/mask/{case_id}` |

---

#### 4.1 格式 A: NIfTI 文件加载 (持久化存储)

```typescript
// 后端返回: .nii.gz 文件 (gzip 压缩的 NIfTI)
// 前端解析: 使用 nifti-reader-js 库

import * as nifti from 'nifti-reader-js'

async function loadFromNIfTI(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  const arrayBuffer = await response.arrayBuffer()
  const header = nifti.readHeader(arrayBuffer)
  const image = nifti.readImage(header, arrayBuffer)
  return new Uint8Array(image)
}
```

**依赖安装**:
```bash
yarn add nifti-reader-js
```

---

#### 4.2 格式 B: Raw Uint8Array 加载 (实时生成)

> [!TIP]
> 适用于 AI 模型实时推理结果，跳过 NIfTI 封装/解析

**后端 numpy 扁平化**:
```python
# AI 模型返回 (1, depth, height, width) 的 mask
mask = model.predict(...)  # shape: (1, 120, 448, 448), dtype: uint8

# 扁平化为 bytes
flat_data = mask.squeeze(0).tobytes()  # (depth, height, width) → bytes
```

**HTTP API 返回**:
```python
from fastapi.responses import Response

@router.get("/api/mask/raw/{case_id}/{layer_id}")
async def get_mask_raw(case_id: str, layer_id: str):
    mask = load_or_generate_mask(case_id, layer_id)
    return Response(
        content=mask.squeeze(0).tobytes(),
        media_type="application/octet-stream",
        headers={"X-Mask-Shape": "120,448,448"}  # 告诉前端 shape
    )
```

**WebSocket 推送** (AI 推理完成后):
```python
@router.websocket('/ws/mask/{case_id}')
async def websocket_mask(websocket: WebSocket, case_id: str):
    await websocket.accept()
    # AI 模型生成新 mask 时
    mask = await ai_model.generate_mask()
    await websocket.send_bytes(mask.squeeze(0).tobytes())
```

**前端接收**:
```typescript
// HTTP
async function loadFromRaw(url: string): Promise<Uint8Array> {
  const response = await fetch(url)
  return new Uint8Array(await response.arrayBuffer())
}

// WebSocket
ws.onmessage = (event) => {
  const data = new Uint8Array(event.data)
  segmentationManager.setLayerData('layer1', data)
}
```

---

#### 4.3 初始化加载 API (1 个请求加载全部)

**后端**:
```python
import msgpack

@router.get("/api/mask/all/{case_id}")
async def get_all_masks(case_id: str):
    masks = {
        "layer1": layer1_data.squeeze(0).tobytes() if layer1_data is not None else None,
        "layer2": layer2_data.squeeze(0).tobytes() if layer2_data is not None else None,
        "layer3": layer3_data.squeeze(0).tobytes() if layer3_data is not None else None,
        "shape": [120, 448, 448],  # 告诉前端 shape
    }
    return Response(content=msgpack.packb(masks), media_type="application/msgpack")
```

**前端**:
```typescript
import msgpack from '@msgpack/msgpack'

async function loadAllMasks(caseId: string): Promise<void> {
  const response = await fetch(`/api/mask/all/${caseId}`)
  const data = msgpack.decode(new Uint8Array(await response.arrayBuffer()))
  
  if (data.layer1) segmentationManager.setLayerData('layer1', new Uint8Array(data.layer1))
  if (data.layer2) segmentationManager.setLayerData('layer2', new Uint8Array(data.layer2))
  if (data.layer3) segmentationManager.setLayerData('layer3', new Uint8Array(data.layer3))
}
```

**依赖安装**:
```bash
# 前端
yarn add @msgpack/msgpack

# 后端
pip install msgpack
```

#### 5. 前端 `getMaskData` API 设计

```typescript
// 导出类型 (发送给后端)
export interface ExportMaskData {
  layer: 'layer1' | 'layer2' | 'layer3'
  axis: 'x' | 'y' | 'z'
  sliceIndex: number
  width: number
  height: number
  data: number[]  // Uint8Array → number[] (每个值 0-8 表示通道)
}

// Delta 模式 (增量更新，更高效)
export interface MaskDelta {
  layer: 'layer1' | 'layer2' | 'layer3'
  changes: Array<{
    x: number  // voxel X 坐标
    y: number  // voxel Y 坐标
    z: number  // voxel Z 坐标
    value: number  // 通道值 (0-8)
  }>
}
```

#### 6. 新增后端 API (Delta 更新)

```python
# 替换现有的 /api/mask/replace
@router.post("/api/mask/delta")
async def apply_mask_delta(delta: MaskDeltaRequest, db: Session = Depends(get_db)):
    """增量更新 - 只修改变化的 voxel"""
    nii_path = get_layer_nii_path(delta.caseId, delta.layer)
    img = nibabel.load(nii_path)
    data = img.get_fdata()
    
    for change in delta.changes:
        data[change.x, change.y, change.z] = change.value
    
    # 只写入修改过的 layer
    nibabel.save(nibabel.Nifti1Image(data, img.affine), nii_path)
    return {"success": True, "changesApplied": len(delta.changes)}


@router.get("/api/mask/slice")
async def get_mask_slice(case_id: str, layer: str, axis: str, slice_index: int):
    """加载单个 slice 的数据 (前端初始化用)"""
    nii_path = get_layer_nii_path(case_id, layer)
    img = nibabel.load(nii_path)
    data = img.get_fdata()
    
    # 根据 axis 提取 2D slice
    if axis == 'z':
        slice_data = data[:, :, slice_index]
    elif axis == 'y':
        slice_data = data[:, slice_index, :]
    else:
        slice_data = data[slice_index, :, :]
    
    return {
        "layer": layer,
        "axis": axis,
        "sliceIndex": slice_index,
        "data": slice_data.flatten().astype(int).tolist()
    }
```

#### 7. 加载策略：初始批量加载 + 增量同步

> [!IMPORTANT]
> **答疑**: `/api/mask/slice` **不是**用于每次切换 slice 时调用的！初始化时仍然一次性加载整个 NIfTI 文件。

**两阶段加载模式**:

```
┌─────────────────────────────────────────────────────────────┐
│ 阶段 1: 初始化 (一次性)                                       │
│   GET /api/mask/volume?caseId=xxx&layer=layer1              │
│   返回: 整个 3D 体数据 (gzip 压缩后 ~1-5MB)                   │
│   前端: 解压后存入 MaskLayer.slices Map                      │
└─────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────┐
│ 阶段 2: 用户操作 (增量)                                       │
│   - 用户画笔/橡皮擦 → 修改内存中的 Uint8Array                 │
│   - 500ms 后 POST /api/mask/delta 发送变化                   │
│   - 切换 slice 时直接读取内存，无需网络请求                    │
└─────────────────────────────────────────────────────────────┘
```

**后端新增 API**:

```python
@router.get("/api/mask/volume")
async def get_mask_volume(case_id: str, layer: str):
    """批量加载整个 layer 的 3D 数据 (初始化时调用一次)"""
    nii_path = get_layer_nii_path(case_id, layer)
    
    # 直接返回压缩后的 NIfTI 文件 (前端用 nifti-reader-js 解析)
    return FileResponse(nii_path, media_type="application/gzip")
```

**前端加载流程** (3 个 layer 并行加载):

```typescript
class SegmentationManager {
  private volumeCache: Map<string, Uint8Array> = new Map()  // layer → 3D data
  private layerVisibility: Map<string, boolean> = new Map([
    ['layer1', true],   // 默认显示
    ['layer2', true],
    ['layer3', true]
  ])
  
  // 初始化时并行加载所有存在的 layer
  async loadAllVolumes(caseId: string): Promise<void> {
    const layers = ['layer1', 'layer2', 'layer3'] as const
    
    // 并行请求 3 个 layer (如果某个不存在则返回 null)
    const requests = layers.map(async (layer) => {
      try {
        const response = await fetch(`/api/mask/volume?caseId=${caseId}&layer=${layer}`)
        if (!response.ok) return null  // layer 不存在
        
        const arrayBuffer = await response.arrayBuffer()
        const niftiData = nifti.readNIFTI(arrayBuffer)
        return { layer, data: new Uint8Array(niftiData.data) }
      } catch {
        return null  // 加载失败跳过
      }
    })
    
    const results = await Promise.all(requests)
    results.forEach(result => {
      if (result) this.volumeCache.set(result.layer, result.data)
    })
  }
  
  // 切换 slice 时直接从内存读取，无需网络请求！
  getSlice(layer: string, sliceIndex: number): Uint8Array | null {
    const volume = this.volumeCache.get(layer)
    if (!volume) return null  // layer 未加载
    
    const sliceSize = this.width * this.height
    return volume.subarray(sliceIndex * sliceSize, (sliceIndex + 1) * sliceSize)
  }
  
  // 用户切换显示/隐藏某个 layer
  setLayerVisibility(layer: string, visible: boolean): void {
    this.layerVisibility.set(layer, visible)
    this.render()  // 触发重绘
  }
  
  // 获取所有可见 layer 用于渲染
  getVisibleLayers(): string[] {
    return [...this.layerVisibility.entries()]
      .filter(([_, visible]) => visible)
      .map(([layer]) => layer)
  }
}
```

> [!TIP]
> **快速切换 slice 时**: 完全在内存中操作，零网络延迟。
> **Layer 显示控制**: 用户可随时切换显示/隐藏任意 layer，无需重新加载数据。

#### 8. 防丢失策略：Debounced Auto-Save

```typescript
// 前端 SegmentationManager
class SegmentationManager {
  private pendingDeltas: MaskDelta[] = []
  private saveTimer: number | null = null
  
  // 用户操作后收集 delta
  onMaskChange(delta: Delta): void {
    this.pendingDeltas.push(delta)
    this.scheduleSave()
  }
  
  // 防抖保存 (500ms 无操作后发送)
  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = setTimeout(() => this.flushDeltas(), 500)
  }
  
  // 批量发送 delta
  private async flushDeltas(): Promise<void> {
    if (this.pendingDeltas.length === 0) return
    
    const batch = this.pendingDeltas.splice(0)
    await fetch('/api/mask/delta', {
      method: 'POST',
      body: JSON.stringify({ changes: batch })
    })
  }
  
  // 页面关闭前强制保存
  beforeUnload(): void {
    if (this.pendingDeltas.length > 0) {
      navigator.sendBeacon('/api/mask/delta', JSON.stringify({ changes: this.pendingDeltas }))
    }
  }
}
```

#### 9. 兼容性过渡

| 阶段 | 存储 | API |
|------|------|-----|
| **Phase 0** (当前) | JSON | `/api/mask/replace` (整个 slice) |
| **Phase 1** (迁移) | JSON + NIfTI | 两套 API 并存 |
| **Phase 2** (完成) | NIfTI only | `/api/mask/delta` + `/api/mask/slice` |

> [!TIP]
> **为什么用 NIfTI 而不是继续用 JSON?**
> - NIfTI (.nii.gz) 是医学影像标准格式，nibabel 支持原地读写
> - gzip 压缩后 448×448×120 的 uint8 数据约 1-5MB (vs JSON 约 50-100MB)
> - 支持随机访问单个 slice，不需要加载整个文件
> - 可直接用 ITK-SNAP、3D Slicer 等工具查看

---

## Phase 1: Core Data Layer

### [NEW] [core/types.ts](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator/annotator-frontend/src/ts/Utils/segmentation/core/types.ts)

```typescript
// ===== Mask 数据类型 (替代 ImageData) =====
export interface MaskSliceData {
  sliceIndex: number
  width: number
  height: number
  data: Uint8Array  // 长度 = width * height
}

// 导出格式 (发送给后端)
export interface ExportMaskData {
  layer: 'layer1' | 'layer2' | 'layer3'
  axis: 'x' | 'y' | 'z'
  sliceIndex: number
  width: number
  height: number
  voxelSpacing: number[]
  spaceOrigin: number[]
  data: number[]  // Uint8Array 转为普通数组用于 JSON
}

// 导入格式 (从后端加载)
export interface ImportMaskData {
  layer1: ExportMaskData[]
  layer2: ExportMaskData[]
  layer3: ExportMaskData[]
}

// Delta 类型
export interface Delta {
  layer: 'layer1' | 'layer2' | 'layer3'
  axis: 'x' | 'y' | 'z'
  slice: number
  idx: number      // 原始尺寸的一维索引
  prev: number
  next: number
}

// 颜色方案
export const CHANNEL_COLORS: Record<number, string> = {
  0: 'rgba(0,0,0,0)',
  1: 'rgba(0,255,0,0.6)',
  2: 'rgba(255,0,0,0.6)',
  3: 'rgba(0,0,255,0.6)',
  4: 'rgba(255,255,0,0.6)',
  5: 'rgba(255,0,255,0.6)',
  6: 'rgba(0,255,255,0.6)',
  7: 'rgba(255,128,0,0.6)',
  8: 'rgba(128,0,255,0.6)'
}
```

---

### [NEW] [core/MaskLayer.ts](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator/annotator-frontend/src/ts/Utils/segmentation/core/MaskLayer.ts)

```typescript
/**
 * MaskLayer - 单图层 Uint8Array 存储
 * 关键：所有坐标均为原始尺寸，与 sizeFactor 无关
 */
export class MaskLayer {
  readonly id: 'layer1' | 'layer2' | 'layer3'
  private width: number
  private height: number
  private depth: number
  private slices: Map<number, Uint8Array>
  
  // 坐标已经是原始尺寸 (调用方需转换)
  applyBrush(slice: number, cx: number, cy: number, 
             radius: number, channel: number): Delta[]
  
  // 导出为后端格式
  exportSlice(slice: number, voxelSpacing: number[], 
              spaceOrigin: number[]): ExportMaskData
  
  // 从后端格式导入
  importSlice(data: ExportMaskData): void
}
```

---

### [NEW] [core/LayerManager.ts](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator/annotator-frontend/src/ts/Utils/segmentation/core/LayerManager.ts)

```typescript
/**
 * LayerManager - 管理 3 个独立图层
 */
export class LayerManager {
  readonly layers: {
    layer1: MaskLayer
    layer2: MaskLayer
    layer3: MaskLayer
  }
  currentLayer: 'layer1' | 'layer2' | 'layer3' = 'layer1'
}
```

---

### [NEW] [core/KeyboardManager.ts](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator/annotator-frontend/src/ts/Utils/segmentation/core/KeyboardManager.ts)

```typescript
/**
 * KeyboardManager - 键盘快捷键管理
 * 支持自定义按键绑定
 */
export interface KeyBindings {
  draw: string           // 默认 'Shift'
  undo: string           // 默认 'z' (with Ctrl)
  redo: string           // 默认 'y' (with Ctrl)
  crosshair: string      // 默认 'c'
  contrast: string[]     // 默认 ['Control']
  mouseWheel: 'Scroll:Zoom' | 'Scroll:Slice'
}

export class KeyboardManager {
  private bindings: KeyBindings
  private listeners: Map<string, (e: KeyboardEvent) => void>
  
  // 更新绑定
  setBinding(action: keyof KeyBindings, key: string): void
  getBindings(): KeyBindings
  
  // 注册/注销
  register(container: HTMLElement): void
  unregister(): void
  
  // 事件回调
  onAction: (action: string, event: KeyboardEvent) => void
}
```

---

## Phase 2: Zoom Handling Strategy

> [!IMPORTANT]
> **核心原则**: Uint8Array 始终存储原始尺寸数据，坐标转换发生在工具层

```typescript
// 用户点击时的坐标转换
function screenToOriginal(screenX: number, screenY: number, sizeFactor: number) {
  return {
    x: Math.floor(screenX / sizeFactor),
    y: Math.floor(screenY / sizeFactor)
  }
}

// BrushTool 使用示例
onPointerDown(e: PointerEvent) {
  const { x, y } = screenToOriginal(e.offsetX, e.offsetY, this.ctx.sizeFactor)
  const radius = Math.floor(this.ctx.brushSize / this.ctx.sizeFactor)
  return this.ctx.maskLayer.applyBrush(slice, x, y, radius, channel)
}
```

**渲染时**: Renderer 从 Uint8Array 读取原始数据，绘制到放大/缩小后的 Canvas。

---

## Phase 3: Tool Abstraction ✅

> [!NOTE]
> Phase 3 已完成。67 个单元测试全部通过。

### [NEW] `tools/BaseTool.ts` - ToolContext 接口 + 抽象基类

```typescript
export interface ToolContext {
  layerManager: LayerManager
  undoManager: UndoManager
  visibilityManager: VisibilityManager
  keyboardManager: KeyboardManager
  currentChannel: number
  currentSlice: number
  currentAxis: 'x' | 'y' | 'z'
  brushSize: number
  sizeFactor: number
  globalAlpha: number
  drawingCtx: CanvasRenderingContext2D | null
  drawingCanvas: HTMLCanvasElement | null
  requestRender: () => void
}

export type ToolName = 'pencil' | 'brush' | 'eraser' | 'pan' | 'zoom' | 'contrast' | 'sphere'

export abstract class BaseTool {
  abstract readonly name: ToolName
  // 坐标转换 (screen ↔ original)
  screenToOriginal(screenX, screenY): { x, y }
  originalToScreen(origX, origY): { x, y }
  screenBrushToOriginal(screenSize): number
  // 生命周期
  activate(): void
  deactivate(): void
  // 事件
  abstract onPointerDown(e: PointerEvent): Delta[]
  abstract onPointerMove(e: PointerEvent): Delta[]
  abstract onPointerUp(e: PointerEvent): Delta[]
  onWheel(e: WheelEvent): void
}
```

### [NEW] `tools/PencilTool.ts` - 多边形自动填充 ⭐

| 事件 | 行为 |
|------|------|
| `onPointerDown` | 开始记录轮廓点 |
| `onPointerMove` | 添加点，在 drawingCanvas 上画红色轮廓预览 |
| `onPointerUp` | 闭合多边形，调用 `MaskLayer.fillPolygon()` 填充，推送 UndoManager |

### [NEW] `tools/BrushTool.ts` - 连续圆形笔刷

| 事件 | 行为 |
|------|------|
| `onPointerDown` | 开始绘画，在初始位置应用笔刷 |
| `onPointerMove` | 连续应用笔刷 + 显示圆形光标预览 |
| `onPointerUp` | 将所有笔触 delta 作为单次 undo 操作推送 |

### [NEW] `tools/EraserTool.ts` - 橡皮擦

| 事件 | 行为 |
|------|------|
| `onPointerDown` | 开始擦除 (channel=0) |
| `onPointerMove` | 持续擦除 + 显示虚线圆形预览 |
| `onPointerUp` | 将所有 delta 作为单次 undo 操作推送 |

### [NEW] `tools/PanTool.ts` - 右键平移画布

```typescript
// Adapter 模式: 解耦 Canvas 定位
interface PanAdapter {
  getCanvasLeft(): number
  getCanvasTop(): number
  setCanvasPosition(left: number, top: number): void
}
```

| 事件 | 行为 |
|------|------|
| `onPointerDown` | 记录初始鼠标 + Canvas 位置 |
| `onPointerMove` | 按鼠标增量平移 Canvas |
| `onPointerUp` | 停止平移 |

### [NEW] `tools/ZoomTool.ts` - 滚轮缩放 / Slice 切换

```typescript
// Adapter 模式: 解耦缩放渲染
interface ZoomAdapter {
  getSizeFactor(): number
  setSizeFactor(factor: number, mouseX: number, mouseY: number): void
  getCurrentSlice(): number
  setCurrentSlice(index: number): void
  getMaxSlice(): number
}
```

| 模式 | 行为 |
|------|------|
| `Scroll:Zoom` | 鼠标滚轮在光标位置缩放 (1x-8x) |
| `Scroll:Slice` | 鼠标滚轮切换 slice |

### [NEW] `tools/ContrastTool.ts` - Window Center/Width 调节

```typescript
// Adapter 模式: 解耦 NRRD 对比度渲染
interface ContrastAdapter {
  getWindowCenter(): number
  getWindowWidth(): number
  setWindowCenter(value: number): void
  setWindowWidth(value: number): void
  refreshDisplay(): void
}
```

| 拖拽方向 | 调节 |
|---------|------|
| 水平 (X) | Window Center |
| 垂直 (Y) | Window Width (≥1) |

### [NEW] `tools/SphereTool.ts` - 3D 球体放置 ⭐

```typescript
// 4 种球体类型
type SphereType = 'tumour' | 'skin' | 'nipple' | 'ribcage'

// 跨轴坐标存储
interface SphereOrigin {
  x: [number, number, number]  // [mx, my, slice] on X axis
  y: [number, number, number]
  z: [number, number, number]
}

// 两种衰减模式
type SphereDecayMode = 'linear' | 'spherical'

// Adapter 模式: 解耦跨轴坐标转换
interface SphereAdapter {
  convertCursorPoint(from, to, mouseX, mouseY, sliceIndex): { x, y, sliceIndex } | null
  getMaxSlice(axis): number
  onSpherePlaced?(origin, radius): void
  onCalculatorPositionsUpdated?(positions, currentAxis): void
}
```

| 事件 | 行为 |
|------|------|
| `onPointerDown` | 记录球心 3D 坐标，显示预览圆 |
| `onWheel` (按住时) | 调节半径 [1, 50]，重绘预览 |
| `onPointerUp` | 3D 球体写入多 slice，存储位置，通知回调 |

### [NEW] `tools/index.ts` - 统一导出

### Phase 3 文件清单

| 文件 | 行数 | 说明 |
|------|------|------|
| `tools/BaseTool.ts` | 174 | ToolContext + 抽象基类 |
| `tools/PencilTool.ts` | 128 | 多边形自动填充 |
| `tools/BrushTool.ts` | 140 | 连续圆形笔刷 |
| `tools/EraserTool.ts` | 133 | 橡皮擦 (channel 0) |
| `tools/PanTool.ts` | 118 | 右键平移 + PanAdapter |
| `tools/ZoomTool.ts` | 109 | 滚轮缩放/Slice + ZoomAdapter |
| `tools/ContrastTool.ts` | 129 | 对比度调节 + ContrastAdapter |
| `tools/SphereTool.ts` | 340 | 3D 球体 + SphereAdapter |
| `tools/index.ts` | 29 | 统一导出 |
| `__tests__/tools.test.ts` | 580 | 67 个单元测试 |

### Adapter 模式架构

```
Project Layer (Vue/Canvas)          npm Package (tools/)
┌─────────────────────┐           ┌─────────────────────┐
│ Canvas positioning  │◄──────────│ PanAdapter           │
│ Zoom rendering      │◄──────────│ ZoomAdapter          │
│ NRRD contrast       │◄──────────│ ContrastAdapter      │
│ Axis conversion     │◄──────────│ SphereAdapter        │
└─────────────────────┘           └─────────────────────┘
     Provides implementation          Defines interface
```

---

## Phase 4: Rendering Pipeline ✅

> [!NOTE]
> Phase 4 已完成。45 个单元测试全部通过。

### [NEW] [rendering/MaskRenderer.ts](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator/annotator-frontend/src/ts/Utils/segmentation/rendering/MaskRenderer.ts)

```typescript
/**
 * MaskRenderer - 多图层复合渲染
 * 从 Uint8Array 读取数据，渲染到 Canvas (支持缩放)
 */
export class MaskRenderer {
  render(
    layers: LayerManager,
    visibility: VisibilityManager,
    sliceIndex: number,
    axis: 'x' | 'y' | 'z',
    sizeFactor: number,
    globalAlpha: number
  ): void
}
```

---

## Phase 5: Crosshair & Sphere Tools

### [NEW] [tools/CrosshairTool.ts](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator/annotator-frontend/src/ts/Utils/segmentation/tools/CrosshairTool.ts)

> [!IMPORTANT]
> **核心功能**: 用户按 `S` 键启用后，点击任意视图上的点，显示十字虚线，点击其他视图时跳转到对应位置并同步 mask 显示。

```typescript
/**
 * CrosshairTool - 跨视图定位工具
 * 复用现有 convertCursorPoint() 的坐标转换逻辑
 */
export class CrosshairTool extends BaseTool {
  private enabled: boolean = false
  private cursorPosition: { x: number, y: number, z: number } | null = null
  
  // 按 S 键切换启用状态
  toggle(): void {
    this.enabled = !this.enabled
  }
  
  // 点击时记录 3D 坐标并显示十字线
  onClick(axis: 'x' | 'y' | 'z', cursorX: number, cursorY: number, sliceIndex: number): void {
    if (!this.enabled) return
    
    // 保存当前点击位置的 3D 坐标
    this.cursorPosition = this.to3DCoord(axis, cursorX, cursorY, sliceIndex)
    this.drawCrosshair(axis, cursorX, cursorY)
  }
  
  // 跳转到其他视图时，计算目标 slice 和光标位置
  navigateTo(targetAxis: 'x' | 'y' | 'z'): { sliceIndex: number, cursorX: number, cursorY: number } {
    if (!this.cursorPosition) throw new Error('No cursor position set')
    
    // 使用现有的 convertCursorPoint 逻辑
    return this.convertCursorPoint(this.currentAxis, targetAxis, ...)
  }
  
  // 切换视图时同步更新 mask 显示
  onAxisChange(newAxis: 'x' | 'y' | 'z', newSlice: number): void {
    // 1. 更新当前 axis
    // 2. 触发 MaskRenderer 重新渲染该 axis/slice 的所有 layer
    this.ctx.renderer.render(newAxis, newSlice)
  }
}
```

### [NEW] [tools/SphereTool.ts](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator/annotator-frontend/src/ts/Utils/segmentation/tools/SphereTool.ts)

```typescript
/**
 * SphereTool - 4 个全局位置标记
 * 注意: 这些位置是 **全局** 的，不属于任何 layer
 */
type SpherePosition = 'tumour' | 'skin' | 'nipple' | 'ribcage'

export class SphereTool extends BaseTool {
  // 全局存储，与 layer 无关
  private positions: Map<SpherePosition, { x: number, y: number, z: number }> = new Map()
  
  setPosition(type: SpherePosition, x: number, y: number, z: number): void
  getPosition(type: SpherePosition): { x: number, y: number, z: number } | undefined
  clearPosition(type: SpherePosition): void
}
```

### [MODIFY] [core/UndoManager.ts](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator/annotator-frontend/src/ts/Utils/segmentation/core/UndoManager.ts)

> [!IMPORTANT]
> **每个 layer 有独立的 undo 栈**

```typescript
/**
 * UndoManager - 每 layer 独立撤销栈
 */
export class UndoManager {
  // 每个 layer 独立的栈
  private stacks: Map<'layer1' | 'layer2' | 'layer3', Delta[][]> = new Map([
    ['layer1', []],
    ['layer2', []],
    ['layer3', []]
  ])
  
  private redoStacks: Map<'layer1' | 'layer2' | 'layer3', Delta[][]> = new Map([
    ['layer1', []],
    ['layer2', []],
    ['layer3', []]
  ])
  
  // 当前锁定的 layer
  private activeLayer: 'layer1' | 'layer2' | 'layer3' = 'layer1'
  
  setActiveLayer(layer: 'layer1' | 'layer2' | 'layer3'): void {
    this.activeLayer = layer
  }
  
  // 只操作当前 layer 的栈
  push(deltas: Delta[]): void {
    this.stacks.get(this.activeLayer)!.push(deltas)
    this.redoStacks.get(this.activeLayer)!.length = 0  // 清空 redo
  }
  
  undo(): Delta[] | undefined {
    const stack = this.stacks.get(this.activeLayer)!
    const deltas = stack.pop()
    if (deltas) {
      this.redoStacks.get(this.activeLayer)!.push(deltas)
    }
    return deltas
  }
  
  redo(): Delta[] | undefined {
    const redoStack = this.redoStacks.get(this.activeLayer)!
    const deltas = redoStack.pop()
    if (deltas) {
      this.stacks.get(this.activeLayer)!.push(deltas)
    }
    return deltas
  }
}
```

---

## Phase 6: Integration

### [NEW] [SegmentationManager.ts](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator/annotator-frontend/src/ts/Utils/segmentation/SegmentationManager.ts)

```typescript
export class SegmentationManager {
  // 兼容现有 API
  getMaskData(sliceIndex: number, axis: 'x' | 'y' | 'z'): ExportMaskData[]
  setMasksData(data: ImportMaskData): void
}
```

### [MODIFY] [types.ts](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator/annotator-frontend/src/ts/types/types.ts)

- 更新 `exportPaintImageType` 为 `ExportMaskData`
- 更新 `storeExportPaintImageType` 为 `ImportMaskData`

---

## Phase 7: Testing (Vitest)

```bash
yarn add -D vitest @vitest/ui jsdom
```

---

## File Structure

```
segmentation/
├── core/
│   ├── types.ts              [NEW] ✅ Phase 2
│   ├── MaskLayer.ts          [NEW] ✅ Phase 2
│   ├── LayerManager.ts       [NEW] ✅ Phase 2
│   ├── VisibilityManager.ts  [NEW] ✅ Phase 2
│   ├── UndoManager.ts        [NEW] ✅ Phase 2
│   ├── KeyboardManager.ts    [NEW] ✅ Phase 2
│   ├── MaskLayerLoader.ts    [NEW] ✅ Phase 0
│   ├── DebouncedAutoSave.ts  [NEW] ✅ Phase 0
│   └── index.ts              [NEW] ✅ Phase 2 (updated Phase 3, Phase 4)
├── tools/
│   ├── BaseTool.ts           [NEW] ✅ Phase 3
│   ├── PencilTool.ts         [NEW] ✅ Phase 3
│   ├── BrushTool.ts          [NEW] ✅ Phase 3
│   ├── EraserTool.ts         [NEW] ✅ Phase 3
│   ├── PanTool.ts            [NEW] ✅ Phase 3
│   ├── ZoomTool.ts           [NEW] ✅ Phase 3
│   ├── ContrastTool.ts       [NEW] ✅ Phase 3
│   ├── SphereTool.ts         [NEW] ✅ Phase 3
│   ├── CrosshairTool.ts      [NEW] Phase 5
│   └── index.ts              [NEW] ✅ Phase 3
├── rendering/
│   └── MaskRenderer.ts       [NEW] ✅ Phase 4
├── SegmentationManager.ts    [NEW] Phase 6
├── __tests__/
│   ├── core.test.ts          [NEW] ✅ Phase 2 (42 tests)
│   ├── tools.test.ts         [NEW] ✅ Phase 3 (67 tests)
│   └── rendering.test.ts     [NEW] ✅ Phase 4 (45 tests)
└── shaders/                  [NEW] ✅ Phase 2
    ├── mask2d.vert
    ├── mask2d.frag
    └── vignette.frag
```

---

## Code Migration Mapping

> [!IMPORTANT]
> 以下是现有代码与新架构的对应关系

### 现有文件结构

```
segmentation/
├── CommToolsData.ts      # 状态管理 (10KB)
├── DragOperator.ts       # 拖动/slice切换 (14KB)
├── DrawToolCore.ts       # 绑/画笔/键盘/对比度等 (78KB) ⚠️ 巨型文件
├── NrrdTools.ts          # 对外API入口 (43KB)
└── coreTools/
    ├── coreType.ts       # 类型定义 (10KB)
    ├── gui.ts            # GUI配置 (16KB)
    ├── divControlTools.ts
    └── archive.ts
```

### 代码迁移映射

| 现有功能 | 现有位置 | 新位置 | 操作 |
|---------|---------|--------|------|
| **状态管理** | `CommToolsData.nrrd_states` | `SegmentationManager` + 各模块内部状态 | 拆分 |
| **类型定义** | `coreTools/coreType.ts` | `core/types.ts` | 重构 |
| **Mask 存储** | `protectedData.maskData.paintImagesLabel1/2/3` | `core/MaskLayer.ts` (Uint8Array) | 重构 |
| **Undo 栈** | `DrawToolCore.undoArray` | `core/UndoManager.ts` (每 layer 独立) | 重构 |
| **Pencil (多边形填充)** | `DrawToolCore` pencil logic (lines + fill) | `tools/PencilTool.ts` | ✅ 已迁移 |
| **画笔** | `DrawToolCore` brush/start function | `tools/BrushTool.ts` | ✅ 已迁移 |
| **橡皮擦** | `DrawToolCore.useEraser()` | `tools/EraserTool.ts` | ✅ 已迁移 (改进) |
| **Crosshair** | `DrawToolCore.enableCrosshair()`, `convertCursorPoint()` | `tools/CrosshairTool.ts` | Phase 5 待做 |
| **Sphere** | `DrawToolCore.drawSphere/drawCalSphereDown/Up` | `tools/SphereTool.ts` | ✅ 已迁移 |
| **Sphere 滚轮** | `DrawToolCore.configMouseSphereWheel` | `SphereTool.onWheel` | ✅ 已迁移 |
| **Sphere 跨轴** | `DrawToolCore.setUpSphereOrigins` | `SphereTool.buildSphereOrigin` | ✅ 已迁移 (via adapter) |
| **Sphere 3D 应用** | `DrawToolCore.drawSphereOnEachViews` | `SphereTool.applySphere3D` | ✅ 已迁移 (改进) |
| **键盘管理** | `DrawToolCore.initDrawToolCore()` | `core/KeyboardManager.ts` | ✅ 已重构 |
| **Zoom/Slice滚轮** | `DrawToolCore.configMouseZoomWheel` | `tools/ZoomTool.ts` | ✅ 已迁移 |
| **PAN** | `DrawToolCore.handleOnPanMouseMove` | `tools/PanTool.ts` | ✅ 已迁移 |
| **Contrast 调节** | `DrawToolCore.configContrastDragMode()` | `tools/ContrastTool.ts` | ✅ 已迁移 |
| **拖动切换 slice** | `DragOperator.ts` | 保留或整合到 `SegmentationManager` | 保留 |
| **渲染** | `DrawToolCore.drawMaskToLabelCtx()` | `rendering/MaskRenderer.ts` | 重构 |
| **对外 API** | `NrrdTools.getMaskData()`, `setMasksData()` | `SegmentationManager.ts` | 重构 |
| **GUI** | `coreTools/gui.ts` | `core/StateManager.ts` + `gui.ts` 简化 | 重构 |

### GUI 重构建议

> [!WARNING]
> **当前问题**: Vue 组件直接访问 `guiSettings.guiState` 和 `guiSettings.guiSetting.xxx.onChange()`，导致紧耦合。

**现有模式** (Calculator.vue):
```typescript
// 问题: Vue 组件直接调用 closure 函数
guiSettings.value.guiState["cal_distance"] = "skin";
guiSettings.value.guiSetting["cal_distance"].onChange(value);
```

**问题分析**:
1. `onChange` 回调是 `gui.ts` 内部的闭包，捕获了 `configs` 对象
2. Vue 组件需要知道内部实现细节
3. 测试困难 - 无法模拟 `onChange` 行为
4. 状态分散在 `nrrd_states` 和 `gui_states` 两个对象中

**建议方案: StateManager 模式**

```typescript
// core/StateManager.ts (新增)
export class StateManager {
  private state = reactive({
    // 合并 nrrd_states + gui_states 的核心状态
    currentLayer: 'layer1' as 'layer1' | 'layer2' | 'layer3',
    currentTool: 'brush' as 'brush' | 'eraser' | 'sphere' | 'calculator',
    brushSize: 15,
    globalAlpha: 0.7,
    calculatorTarget: 'tumour' as 'tumour' | 'skin' | 'nipple' | 'ribcage',
    // ...
  })
  
  // 对外暴露的只读状态
  get state() { return readonly(this.state) }
  
  // 类型安全的状态更新方法
  setCalculatorTarget(target: 'tumour' | 'skin' | 'nipple' | 'ribcage'): void {
    this.state.calculatorTarget = target
    // 内部处理颜色切换等逻辑
    this.updateBrushColor(this.getColorForTarget(target))
  }
  
  setCurrentTool(tool: string): void { ... }
}

// Vue 组件使用 (Calculator.vue)
const stateManager = inject<StateManager>('stateManager')
stateManager.setCalculatorTarget('skin')  // 类型安全，无需知道内部实现
```

**迁移策略**:
1. 保留 `gui.ts` 的 dat.gui 初始化逻辑
2. 新建 `StateManager.ts` 管理核心状态
3. Vue 组件通过 `StateManager` API 操作状态
4. `gui.ts` 的 `onChange` 回调调用 `StateManager` 方法

### 遗留文件处理

| 文件 | 处理方式 |
|-----|---------|
| `CommToolsData.ts` | 逐步迁移后删除 |
| `DrawToolCore.ts` | 拆分到多个 Tool 类后删除 |
| `DragOperator.ts` | 保留或整合 |
| `NrrdTools.ts` | 替换为 `SegmentationManager.ts` |
| `coreTools/coreType.ts` | 迁移到 `core/types.ts` |
| `coreTools/gui.ts` | 保留 |

---

## Affected Files Analysis

> [!IMPORTANT]
> 以下是重构会影响的所有文件，按影响程度排序

### 高影响 (需要重写)

| 文件 | 影响原因 |
|-----|---------|
| `composables/left-panel/useMaskOperations.ts` | 调用 `nrrdTools.getMaskData()`, `setMasksData()` |
| `components/segmentation/OperationCtl.vue` | 50+ 处 `guiSettings.guiState/guiSetting` 访问 |
| `components/viewer/LeftPanelCore.vue` | 初始化 `new Copper.NrrdTools()`, 发射 `Core:NrrdTools` |
| `views/LeftPanelController.vue` | 使用 `nrrdTools` ref, 多个 composable 依赖 |

### 中影响 (需要适配)

| 文件 | 影响原因 |
|-----|---------|
| `components/segmentation/Calculator.vue` | `guiSettings.guiState["cal_distance"]`, `guiSetting.onChange()` |
| `components/segmentation/OperationAdvance.vue` | `guiSettings.guiState.color/fillColor/brushColor` |
| `components/segmentation/SysOptsCtl.vue` | `nrrdTools` keyboard settings |
| `components/navigation/NavPanel.vue` | 接收 `Core:NrrdTools` 事件 |

### 低影响 (仅导入变化)

| 文件 | 影响原因 |
|-----|---------|
| `composables/left-panel/useCaseManagement.ts` | `nrrdTools.getGuiSettings()` |
| `composables/left-panel/useSliceNavigation.ts` | `nrrdTools` 操作 |
| `composables/left-panel/useDistanceCalculation.ts` | `nrrdTools` 操作 |
| `models/segmentation.ts` | 类型定义可能需更新 |

### Event Bus 事件 (需保留/迁移)

| 事件名 | 发送方 | 接收方 |
|-------|-------|-------|
| `Core:NrrdTools` | `LeftPanelCore.vue` | `NavPanel.vue`, `OperationCtl.vue` |
| `Segmentation:FinishLoadAllCaseImages` | `useCaseManagement.ts` | `Calculator.vue`, `OperationCtl.vue`, `OperationAdvance.vue` |
| `Segementation:CaseSwitched` | 多处 | `Calculator.vue`, `OperationCtl.vue` |
| `Common:OpenCalculatorBox` | 外部 | `Calculator.vue` |
| `Segmentation:SyncTumourModelButtonClicked` | `useMaskOperations.ts` | 外部 |

---

## Verification Plan

1. **Phase 1-2**: 单元测试 MaskLayer 的 Uint8Array 操作
2. **Phase 3-4**: 测试缩放后画笔坐标转换正确性
3. **Phase 5**: 验证 Crosshair 跨视图同步
4. **Phase 6**: 验证 getMask/setMask 与后端兼容
5. **集成测试**: 验证所有 Vue 组件与新 API 正常工作
