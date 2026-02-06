# Canvas Mask 渲染与数据管理 Q&A

> 日期: 2026-02-07
> 主题: Uint8Array、3D Mask 数据存储、多轴渲染、Undo/Redo

---

## 目录

1. [Uint8Array 存储方案选择](#1-uint8array-存储方案选择)
2. [不同轴向的切片提取与更新](#2-不同轴向的切片提取与更新)
3. [将 Mask 渲染到 Canvas（多 Channel 支持）](#3-将-mask-渲染到-canvas多-channel-支持)
4. [Undo/Redo 实现](#4-undoredo-实现)

---

## 1. Uint8Array 存储方案选择

### 问题

后端会向前端传递一个 .nii 文件作为 mask 文件，它是一个 3D 文件并包含了 8 个 channel。应该使用一个 `Uint8Array` 去存储数据，还是要根据 3D Z 轴的长度来创建多个 `Uint8Array` 去存储 Z 轴上每个 slice 的数据？

### 方案对比

#### 方案 1：单个 `Uint8Array` 存储整个 3D 数据

```typescript
// 假设 dimensions: [width, height, depth], 8 channels
const totalSize = width * height * depth * 8;
const maskData = new Uint8Array(totalSize);

// 访问特定位置: [x, y, z, channel]
const index = ((z * height + y) * width + x) * 8 + channel;
const value = maskData[index];
```

**优点：**
- ✅ 内存连续，缓存友好
- ✅ 便于整体序列化/传输（如保存回 .nii 文件）
- ✅ 与 NIfTI 文件的原始布局一致
- ✅ 管理简单，只需一个引用

**缺点：**
- ❌ 如果只需要渲染当前 slice，仍需计算偏移量
- ❌ 大文件可能导致一次性内存分配压力

---

#### 方案 2：按 Z 轴切片存储（多个 `Uint8Array`）

```typescript
// 每个 slice 一个数组
const slices: Uint8Array[] = [];
for (let z = 0; z < depth; z++) {
    slices[z] = new Uint8Array(width * height * 8);
}

// 访问特定位置
const value = slices[z][(y * width + x) * 8 + channel];
```

**优点：**
- ✅ 按需加载/卸载特定 slice
- ✅ 渲染当前 slice 时直接访问对应数组

**缺点：**
- ❌ 保存时需要重新组装成连续数据
- ❌ 多个数组引用，管理复杂度增加
- ❌ 可能导致内存碎片化

---

### 推荐方案：使用单个 `Uint8Array`

对于医学图像标注场景，推荐 **方案 1**，原因如下：

1. **数据一致性**：NIfTI 文件本身就是连续存储的，保持一致便于读写
2. **保存简单**：直接传输整个 buffer，无需组装
3. **切片访问成本低**：提取当前 slice 的开销很小：

```typescript
// 高效提取单个 slice 的视图（不拷贝数据！）
function getSliceView(data: Uint8Array, z: number, width: number, height: number, channels: number): Uint8Array {
    const sliceSize = width * height * channels;
    const offset = z * sliceSize;
    // 返回视图，不分配新内存
    return new Uint8Array(data.buffer, data.byteOffset + offset, sliceSize);
}
```

4. **Worker 传输**：可以使用 `Transferable` 高效传输：

```typescript
// 零拷贝传输到 Worker
worker.postMessage({ maskData: maskData.buffer }, [maskData.buffer]);
```

---

### 推荐的数据结构

```typescript
interface MaskVolume {
    data: Uint8Array;           // 连续存储的 3D 数据
    dimensions: [number, number, number];  // [width, height, depth]
    channels: number;           // 8
}

// 辅助函数
function getVoxelIndex(x: number, y: number, z: number, channel: number, vol: MaskVolume): number {
    const [w, h, d] = vol.dimensions;
    return ((z * h + y) * w + x) * vol.channels + channel;
}

function getSlice(vol: MaskVolume, z: number): Uint8Array {
    const [w, h] = vol.dimensions;
    const sliceSize = w * h * vol.channels;
    return new Uint8Array(vol.data.buffer, vol.data.byteOffset + z * sliceSize, sliceSize);
}
```

---

## 2. 不同轴向的切片提取与更新

### 问题

1. 如果用户切换到 X 轴或 Y 轴的 slice，如何取对应的数据？
2. 用户绘制时如何更新 mask 数据？
3. 更新是否影响整个 3D 数据？在其他轴向能看到变化吗？

### 核心概念：3D 数据的存储与索引

```
数据布局: [X, Y, Z, Channel] 
         最快变化 → 最慢变化

dimensions: [width(X), height(Y), depth(Z)]
channels: 8
```

```typescript
interface MaskVolume {
    data: Uint8Array;
    width: number;   // X 轴长度
    height: number;  // Y 轴长度
    depth: number;   // Z 轴长度
    channels: number; // 8
}

// 计算任意体素的索引
function getVoxelIndex(x: number, y: number, z: number, channel: number, vol: MaskVolume): number {
    return ((z * vol.height + y) * vol.width + x) * vol.channels + channel;
}
```

---

### 不同轴向的切片提取

#### Z 轴切片（Axial View）- 最常见
固定 `z`，遍历所有 `x, y`：

```typescript
function getZSlice(vol: MaskVolume, z: number, channel: number): Uint8Array {
    const slice = new Uint8Array(vol.width * vol.height);
    for (let y = 0; y < vol.height; y++) {
        for (let x = 0; x < vol.width; x++) {
            const srcIndex = getVoxelIndex(x, y, z, channel, vol);
            const dstIndex = y * vol.width + x;
            slice[dstIndex] = vol.data[srcIndex];
        }
    }
    return slice;
}
```

#### X 轴切片（Sagittal View）
固定 `x`，遍历所有 `y, z`：

```typescript
function getXSlice(vol: MaskVolume, x: number, channel: number): Uint8Array {
    // 切片尺寸: height(Y) × depth(Z)
    const slice = new Uint8Array(vol.height * vol.depth);
    for (let z = 0; z < vol.depth; z++) {
        for (let y = 0; y < vol.height; y++) {
            const srcIndex = getVoxelIndex(x, y, z, channel, vol);
            const dstIndex = z * vol.height + y;
            slice[dstIndex] = vol.data[srcIndex];
        }
    }
    return slice;
}
```

#### Y 轴切片（Coronal View）
固定 `y`，遍历所有 `x, z`：

```typescript
function getYSlice(vol: MaskVolume, y: number, channel: number): Uint8Array {
    // 切片尺寸: width(X) × depth(Z)
    const slice = new Uint8Array(vol.width * vol.depth);
    for (let z = 0; z < vol.depth; z++) {
        for (let x = 0; x < vol.width; x++) {
            const srcIndex = getVoxelIndex(x, y, z, channel, vol);
            const dstIndex = z * vol.width + x;
            slice[dstIndex] = vol.data[srcIndex];
        }
    }
    return slice;
}
```

#### 统一接口

```typescript
type Orientation = 'axial' | 'sagittal' | 'coronal'; // Z, X, Y

function getSlice(vol: MaskVolume, orientation: Orientation, sliceIndex: number, channel: number): {
    data: Uint8Array;
    width: number;
    height: number;
} {
    switch (orientation) {
        case 'axial':    // Z 轴
            return { data: getZSlice(vol, sliceIndex, channel), width: vol.width, height: vol.height };
        case 'sagittal': // X 轴
            return { data: getXSlice(vol, sliceIndex, channel), width: vol.height, height: vol.depth };
        case 'coronal':  // Y 轴
            return { data: getYSlice(vol, sliceIndex, channel), width: vol.width, height: vol.depth };
    }
}
```

---

### 更新 Mask 数据

当用户在 Canvas (2D) 上绘制时：

#### 步骤 1：将 Canvas 坐标转换为 3D 体素坐标

```typescript
function canvasToVoxel(
    canvasX: number, 
    canvasY: number, 
    orientation: Orientation, 
    sliceIndex: number,
    vol: MaskVolume
): { x: number; y: number; z: number } {
    switch (orientation) {
        case 'axial':    // Z 轴固定
            return { x: canvasX, y: canvasY, z: sliceIndex };
        case 'sagittal': // X 轴固定
            return { x: sliceIndex, y: canvasX, z: canvasY };
        case 'coronal':  // Y 轴固定
            return { x: canvasX, y: sliceIndex, z: canvasY };
    }
}
```

#### 步骤 2：直接更新 3D 数组中的值

```typescript
function updateVoxel(
    vol: MaskVolume,
    canvasX: number,
    canvasY: number,
    orientation: Orientation,
    sliceIndex: number,
    channel: number,
    value: number  // 0 或 255
): void {
    const { x, y, z } = canvasToVoxel(canvasX, canvasY, orientation, sliceIndex, vol);
    const index = getVoxelIndex(x, y, z, channel, vol);
    vol.data[index] = value;
}

// 批量更新（如画笔）
function updateVoxels(
    vol: MaskVolume,
    points: Array<{ canvasX: number; canvasY: number }>,
    orientation: Orientation,
    sliceIndex: number,
    channel: number,
    value: number
): void {
    for (const { canvasX, canvasY } of points) {
        updateVoxel(vol, canvasX, canvasY, orientation, sliceIndex, channel, value);
    }
}
```

---

### 更新是否影响整个 3D 数据？跨轴可见吗？

**✅ 是的！这正是单一 `Uint8Array` 的优势！**

```
                    ┌─────────────────────────────────────┐
                    │     单一 Uint8Array (3D 数据)        │
                    │     所有轴向共享同一份数据            │
                    └─────────────────────────────────────┘
                           ▲           ▲           ▲
                           │           │           │
              ┌────────────┴──┐   ┌────┴────┐   ┌──┴────────────┐
              │ Z轴视图(Axial)│   │ X轴视图  │   │ Y轴视图       │
              │ getZSlice()   │   │ getXSlice│   │ getYSlice()   │
              └───────────────┘   └─────────┘   └───────────────┘
```

**工作流程示例：**

1. 用户在 **Z 轴 slice 25** 上用画笔绘制
2. 调用 `updateVoxel()` 更新 `vol.data` 中对应位置
3. 用户切换到 **X 轴 slice 26**
4. 调用 `getXSlice(vol, 26, channel)` 提取新切片
5. **因为数据来自同一个 `vol.data`，之前的修改自动可见！**

---

### 完整示例：MaskManager 类

```typescript
class MaskManager {
    private volume: MaskVolume;
    private currentOrientation: Orientation = 'axial';
    private currentSliceIndex: number = 0;
    private currentChannel: number = 0;

    constructor(data: Uint8Array, width: number, height: number, depth: number, channels: number) {
        this.volume = { data, width, height, depth, channels };
    }

    // 获取当前切片用于渲染
    getCurrentSlice(): { data: Uint8Array; width: number; height: number } {
        return getSlice(this.volume, this.currentOrientation, this.currentSliceIndex, this.currentChannel);
    }

    // 切换视图
    setView(orientation: Orientation, sliceIndex: number): void {
        this.currentOrientation = orientation;
        this.currentSliceIndex = sliceIndex;
        // 触发重新渲染...
    }

    // 绘制时调用
    draw(canvasX: number, canvasY: number, value: number): void {
        updateVoxel(
            this.volume,
            canvasX,
            canvasY,
            this.currentOrientation,
            this.currentSliceIndex,
            this.currentChannel,
            value
        );
    }

    // 获取完整数据用于保存
    getFullData(): Uint8Array {
        return this.volume.data;
    }
}
```

---

## 3. 将 Mask 渲染到 Canvas（多 Channel 支持）

### 问题

如何将 mask 数据渲染到 Canvas 上（ImageData 操作），并支持多个 channel 的显示和隐藏（用户可自定义）？

### 核心概念

每个 channel 代表一个标注类别（如肿瘤、器官等），需要：
1. 为每个 channel 分配颜色
2. 支持用户显示/隐藏特定 channel
3. 将所有可见 channel 合成到一个 `ImageData` 上

### 完整实现

```typescript
// Channel 配置
interface ChannelConfig {
    id: number;
    name: string;
    color: [number, number, number]; // RGB
    visible: boolean;
    opacity: number; // 0-1
}

// 默认 8 个 channel 的颜色配置
const defaultChannels: ChannelConfig[] = [
    { id: 0, name: 'Background',  color: [0, 0, 0],       visible: false, opacity: 0 },
    { id: 1, name: 'Tumor',       color: [255, 0, 0],     visible: true,  opacity: 0.6 },
    { id: 2, name: 'Liver',       color: [0, 255, 0],     visible: true,  opacity: 0.6 },
    { id: 3, name: 'Kidney',      color: [0, 0, 255],     visible: true,  opacity: 0.6 },
    { id: 4, name: 'Spleen',      color: [255, 255, 0],   visible: true,  opacity: 0.6 },
    { id: 5, name: 'Pancreas',    color: [255, 0, 255],   visible: true,  opacity: 0.6 },
    { id: 6, name: 'Vessel',      color: [0, 255, 255],   visible: true,  opacity: 0.6 },
    { id: 7, name: 'Other',       color: [255, 128, 0],   visible: true,  opacity: 0.6 },
];

class MaskRenderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private channels: ChannelConfig[];
    private imageData: ImageData | null = null;

    constructor(canvas: HTMLCanvasElement, channels: ChannelConfig[] = defaultChannels) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this.channels = channels;
    }

    // 切换 channel 可见性
    setChannelVisibility(channelId: number, visible: boolean): void {
        this.channels[channelId].visible = visible;
    }

    // 设置 channel 透明度
    setChannelOpacity(channelId: number, opacity: number): void {
        this.channels[channelId].opacity = Math.max(0, Math.min(1, opacity));
    }

    // 渲染所有可见 channel 到 canvas
    render(sliceData: Uint8Array, width: number, height: number, numChannels: number): void {
        // 确保 canvas 尺寸正确
        if (this.canvas.width !== width || this.canvas.height !== height) {
            this.canvas.width = width;
            this.canvas.height = height;
        }

        // 创建 ImageData
        this.imageData = this.ctx.createImageData(width, height);
        const pixels = this.imageData.data; // RGBA 格式

        // 遍历每个像素
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const pixelIndex = (y * width + x) * 4; // ImageData 中的位置
                const sliceBaseIndex = (y * width + x) * numChannels; // sliceData 中的位置

                // 初始化为透明
                let finalR = 0, finalG = 0, finalB = 0, finalA = 0;

                // 从低优先级到高优先级合成（后面的 channel 覆盖前面的）
                for (let c = 0; c < numChannels; c++) {
                    const config = this.channels[c];
                    if (!config.visible) continue;

                    const maskValue = sliceData[sliceBaseIndex + c];
                    if (maskValue === 0) continue; // 该 channel 在此像素无标注

                    // Alpha 混合
                    const alpha = config.opacity * (maskValue / 255);
                    const invAlpha = 1 - alpha;

                    finalR = finalR * invAlpha + config.color[0] * alpha;
                    finalG = finalG * invAlpha + config.color[1] * alpha;
                    finalB = finalB * invAlpha + config.color[2] * alpha;
                    finalA = Math.min(1, finalA + alpha);
                }

                pixels[pixelIndex]     = Math.round(finalR);
                pixels[pixelIndex + 1] = Math.round(finalG);
                pixels[pixelIndex + 2] = Math.round(finalB);
                pixels[pixelIndex + 3] = Math.round(finalA * 255);
            }
        }

        this.ctx.putImageData(this.imageData, 0, 0);
    }

    // 获取可见 channel 列表
    getVisibleChannels(): number[] {
        return this.channels.filter(c => c.visible).map(c => c.id);
    }
}
```

### 优化版本：只提取单个 Channel 的 Slice

如果 slice 提取函数一次只返回一个 channel，可以这样合成：

```typescript
class OptimizedMaskRenderer {
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private channels: ChannelConfig[];

    // 预先缓存每个 channel 的 slice 数据
    private channelSlices: Map<number, Uint8Array> = new Map();

    constructor(canvas: HTMLCanvasElement, channels: ChannelConfig[] = defaultChannels) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d')!;
        this.channels = channels;
    }

    // 设置某个 channel 的当前 slice 数据
    setChannelSlice(channelId: number, sliceData: Uint8Array): void {
        this.channelSlices.set(channelId, sliceData);
    }

    // 渲染所有可见 channel
    render(width: number, height: number): void {
        this.canvas.width = width;
        this.canvas.height = height;

        const imageData = this.ctx.createImageData(width, height);
        const pixels = imageData.data;

        for (let i = 0; i < width * height; i++) {
            let finalR = 0, finalG = 0, finalB = 0, finalA = 0;

            for (const config of this.channels) {
                if (!config.visible) continue;

                const slice = this.channelSlices.get(config.id);
                if (!slice) continue;

                const maskValue = slice[i];
                if (maskValue === 0) continue;

                const alpha = config.opacity * (maskValue / 255);
                const invAlpha = 1 - alpha;

                finalR = finalR * invAlpha + config.color[0] * alpha;
                finalG = finalG * invAlpha + config.color[1] * alpha;
                finalB = finalB * invAlpha + config.color[2] * alpha;
                finalA = Math.min(1, finalA + alpha);
            }

            const idx = i * 4;
            pixels[idx]     = Math.round(finalR);
            pixels[idx + 1] = Math.round(finalG);
            pixels[idx + 2] = Math.round(finalB);
            pixels[idx + 3] = Math.round(finalA * 255);
        }

        this.ctx.putImageData(imageData, 0, 0);
    }

    // 快速更新：只重新渲染可见性变化时
    toggleChannelVisibility(channelId: number): void {
        this.channels[channelId].visible = !this.channels[channelId].visible;
        // 不需要重新提取数据，直接重新渲染即可
    }
}
```

---

## 4. Undo/Redo 实现

### 问题

1. 如何处理 undo/redo？
2. 如果某个 channel 被隐藏了，会发生什么？

### 核心设计：基于操作记录（Command Pattern）

**不要**存储整个 3D 数据的快照（太大了！），而是记录每次**修改了哪些体素**。

```typescript
interface VoxelChange {
    x: number;
    y: number;
    z: number;
    channel: number;
    oldValue: number;  // 用于 undo
    newValue: number;  // 用于 redo
}

interface DrawAction {
    id: string;
    timestamp: number;
    orientation: Orientation;
    sliceIndex: number;
    channel: number;
    changes: VoxelChange[];
}

class UndoRedoManager {
    private undoStack: DrawAction[] = [];
    private redoStack: DrawAction[] = [];
    private maxStackSize: number = 50;
    private volume: MaskVolume;

    constructor(volume: MaskVolume) {
        this.volume = volume;
    }

    // 开始一次绘制操作
    beginAction(orientation: Orientation, sliceIndex: number, channel: number): DrawAction {
        return {
            id: crypto.randomUUID(),
            timestamp: Date.now(),
            orientation,
            sliceIndex,
            channel,
            changes: []
        };
    }

    // 记录单个体素变化
    recordChange(action: DrawAction, x: number, y: number, z: number, newValue: number): void {
        const index = getVoxelIndex(x, y, z, action.channel, this.volume);
        const oldValue = this.volume.data[index];

        // 只记录实际发生变化的
        if (oldValue !== newValue) {
            action.changes.push({ x, y, z, channel: action.channel, oldValue, newValue });
            this.volume.data[index] = newValue;
        }
    }

    // 结束并保存操作
    commitAction(action: DrawAction): void {
        if (action.changes.length === 0) return; // 没有实际变化

        this.undoStack.push(action);
        this.redoStack = []; // 新操作清空 redo 栈

        // 限制栈大小
        if (this.undoStack.length > this.maxStackSize) {
            this.undoStack.shift();
        }
    }

    // Undo
    undo(): DrawAction | null {
        const action = this.undoStack.pop();
        if (!action) return null;

        // 逆序恢复旧值
        for (let i = action.changes.length - 1; i >= 0; i--) {
            const change = action.changes[i];
            const index = getVoxelIndex(change.x, change.y, change.z, change.channel, this.volume);
            this.volume.data[index] = change.oldValue;
        }

        this.redoStack.push(action);
        return action;
    }

    // Redo
    redo(): DrawAction | null {
        const action = this.redoStack.pop();
        if (!action) return null;

        // 正序应用新值
        for (const change of action.changes) {
            const index = getVoxelIndex(change.x, change.y, change.z, change.channel, this.volume);
            this.volume.data[index] = change.newValue;
        }

        this.undoStack.push(action);
        return action;
    }

    canUndo(): boolean {
        return this.undoStack.length > 0;
    }

    canRedo(): boolean {
        return this.redoStack.length > 0;
    }
}
```

### 使用示例

```typescript
class DrawTool {
    private undoManager: UndoRedoManager;
    private currentAction: DrawAction | null = null;

    onPointerDown(canvasX: number, canvasY: number): void {
        // 开始新的绘制操作
        this.currentAction = this.undoManager.beginAction(
            this.currentOrientation,
            this.currentSliceIndex,
            this.currentChannel
        );
        this.drawAt(canvasX, canvasY);
    }

    onPointerMove(canvasX: number, canvasY: number): void {
        if (!this.currentAction) return;
        this.drawAt(canvasX, canvasY);
    }

    onPointerUp(): void {
        if (this.currentAction) {
            this.undoManager.commitAction(this.currentAction);
            this.currentAction = null;
        }
    }

    private drawAt(canvasX: number, canvasY: number): void {
        const { x, y, z } = canvasToVoxel(
            canvasX, canvasY,
            this.currentOrientation,
            this.currentSliceIndex,
            this.volume
        );
        
        const newValue = this.isEraser ? 0 : 255;
        this.undoManager.recordChange(this.currentAction!, x, y, z, newValue);
    }
}
```

---

### 关于隐藏 Channel 的 Undo/Redo 行为

**关键问题**：如果 channel 被隐藏了，undo/redo 会发生什么？

#### 推荐策略：数据始终更新，视觉可能不可见

```typescript
class UndoRedoManager {
    // Undo 后返回操作信息，让调用者决定如何处理
    undo(): { action: DrawAction | null; affectedChannel: number | null } {
        const action = this.undoStack.pop();
        if (!action) return { action: null, affectedChannel: null };

        // 即使 channel 被隐藏，也要更新数据！
        for (let i = action.changes.length - 1; i >= 0; i--) {
            const change = action.changes[i];
            const index = getVoxelIndex(change.x, change.y, change.z, change.channel, this.volume);
            this.volume.data[index] = change.oldValue;
        }

        this.redoStack.push(action);
        return { action, affectedChannel: action.channel };
    }
}

// 在 UI 层处理
function handleUndo() {
    const { action, affectedChannel } = undoManager.undo();
    if (!action) return;

    // 获取当前 channel 可见性
    const channelConfig = renderer.getChannelConfig(affectedChannel);
    
    if (channelConfig.visible) {
        // 正常重新渲染
        renderer.render(getCurrentSlice());
    } else {
        // 显示提示：操作已撤销但 channel 当前隐藏
        showToast(`Undo applied to "${channelConfig.name}" (currently hidden)`);
    }
}
```

#### 可选：只在可见 Channel 上操作

```typescript
// 可选：阻止在隐藏的 channel 上绘制
onPointerDown(canvasX: number, canvasY: number): void {
    const channelConfig = renderer.getChannelConfig(this.currentChannel);
    if (!channelConfig.visible) {
        showToast('Cannot draw on hidden channel. Make it visible first.');
        return;
    }
    // ... 正常绘制逻辑
}
```

---

## 完整流程图

```
用户操作流程:
┌─────────────────────────────────────────────────────────────────┐
│ 1. 用户在 Z轴 slice 25, channel 2 上绘制                          │
│    └─> recordChange() 记录每个体素变化                             │
│    └─> commitAction() 保存到 undoStack                           │
│                                                                  │
│ 2. 用户隐藏 channel 2                                             │
│    └─> setChannelVisibility(2, false)                            │
│    └─> render() 重新渲染（不显示 channel 2）                        │
│                                                                  │
│ 3. 用户按 Ctrl+Z 撤销                                             │
│    └─> undo() 恢复旧值到 volume.data                              │
│    └─> 检测到 channel 2 被隐藏                                     │
│    └─> 显示提示 "Changes undone for hidden channel"               │
│    └─> 视觉上无变化（因为 channel 隐藏了）                           │
│                                                                  │
│ 4. 用户重新显示 channel 2                                         │
│    └─> setChannelVisibility(2, true)                             │
│    └─> render() 重新渲染                                          │
│    └─> 用户看到撤销后的结果！                                       │
└─────────────────────────────────────────────────────────────────┘
```

---

## 关键总结

| 功能 | 实现要点 |
|------|----------|
| **Uint8Array 存储** | 使用单个连续数组，便于跨轴共享数据 |
| **多轴切片提取** | 根据 orientation 使用不同的索引计算 |
| **Canvas 2D → 3D 坐标** | `canvasToVoxel()` 转换函数 |
| **多 Channel 渲染** | Alpha 混合所有可见 channel 到一个 ImageData |
| **显示/隐藏** | 只需修改 `visible` 标志并重新调用 `render()` |
| **Undo/Redo** | 记录 `VoxelChange` 列表，不存储完整快照 |
| **隐藏 Channel 的 Undo** | 数据始终更新，但可以提示用户当前 channel 不可见 |
