# Segmentation Module Documentation

> Source: `annotator-frontend/src/ts/Utils/segmentation/`

## 1. Architecture Overview

### 1.1 Class Inheritance

```
CommToolsData          ← 基类：Canvas 管理、状态初始化、渲染管线
  └── DrawToolCore     ← 绘画事件处理、Undo/Redo、Tool 管理
       └── NrrdTools   ← 对外暴露的 API 入口，拖拽、数据加载
```

- [CommToolsData.ts](annotator-frontend/src/ts/Utils/segmentation/CommToolsData.ts) — 基类
- [DrawToolCore.ts](annotator-frontend/src/ts/Utils/segmentation/DrawToolCore.ts) — 绘画核心
- [NrrdTools.ts](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts) — 对外 API

### 1.2 Canvas 层级结构

共有 **5 个系统 Canvas** + **N 个 Layer Canvas**（默认 3 个 Layer）。

```
┌──────────────────────────────────┐
│ drawingCanvas (顶层交互层)         │  ← 捕获鼠标/笔事件，实时绘制笔画
├──────────────────────────────────┤
│ drawingSphereCanvas              │  ← 3D Sphere 工具的覆盖层
├──────────────────────────────────┤
│ drawingCanvasLayerMaster (合成层)  │  ← 所有可见 Layer 合成后的结果
│   ├─ layerTargets[layer1].canvas │  ← 隐藏的 per-layer canvas
│   ├─ layerTargets[layer2].canvas │
│   └─ layerTargets[layer3].canvas │
├──────────────────────────────────┤
│ displayCanvas (背景医学图像)       │  ← CT/MRI 切片图像
├──────────────────────────────────┤
│ originCanvas (从 Three.js 获取)   │  ← 缓存 Three.js 渲染的原始切片
├──────────────────────────────────┤
│ emptyCanvas (临时处理用)           │  ← 离屏画布，用于图像处理和格式转换
└──────────────────────────────────┘
```

**Canvas 创建位置:**
- 系统 Canvas: [CommToolsData.ts:351-358](annotator-frontend/src/ts/Utils/segmentation/CommToolsData.ts#L351-L358) `generateSystemCanvases()`
- Layer Canvas: [CommToolsData.ts:361-369](annotator-frontend/src/ts/Utils/segmentation/CommToolsData.ts#L361-L369) `generateLayerTargets(layerIds)`
- Canvas 注释说明: [CommToolsData.ts:244-283](annotator-frontend/src/ts/Utils/segmentation/CommToolsData.ts#L244-L283)

### 1.3 Layer 与 MaskVolume 对应关系

每个 Layer 对应一个独立的 `MaskVolume` 实例：

```
protectedData.maskData.volumes = {
  "layer1": MaskVolume(width, height, depth, 1),
  "layer2": MaskVolume(width, height, depth, 1),
  "layer3": MaskVolume(width, height, depth, 1),
}
```

- 初始化（1x1x1 占位）: [CommToolsData.ts:236-241](annotator-frontend/src/ts/Utils/segmentation/CommToolsData.ts#L236-L241)
- 用实际 NRRD 尺寸重新初始化: [NrrdTools.ts:474-481](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L474-L481)

---

## 2. NrrdTools 暴露的 API

### 2.1 Layer & Channel 管理

| 方法 | 签名 | 行号 | 说明 |
|------|------|------|------|
| `setActiveLayer` | `(layerId: string): void` | [L173-178](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L173-L178) | 设置当前活跃 Layer，同时更新 fillColor/brushColor |
| `setActiveChannel` | `(channel: ChannelValue): void` | [L183-188](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L183-L188) | 设置当前活跃 Channel (1-8)，更新画笔颜色 |
| `getActiveLayer` | `(): string` | [L193-195](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L193-L195) | 获取当前 Layer ID |
| `getActiveChannel` | `(): number` | [L200-202](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L200-L202) | 获取当前 Channel 值 |
| `setLayerVisible` | `(layerId, visible): void` | [L207-210](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L207-L210) | 设置 Layer 可见性，触发 `reloadMasksFromVolume()` |
| `isLayerVisible` | `(layerId): boolean` | [L215-217](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L215-L217) | 检查 Layer 是否可见 |
| `setChannelVisible` | `(layerId, channel, visible): void` | [L222-227](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L222-L227) | 设置某 Layer 下某 Channel 可见性，触发重渲染 |
| `isChannelVisible` | `(layerId, channel): boolean` | [L232-234](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L232-L234) | 检查 Channel 是否可见 |
| `getLayerVisibility` | `(): Record<string, boolean>` | [L239-241](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L239-L241) | 获取所有 Layer 可见性副本 |
| `getChannelVisibility` | `(): Record<string, Record<number, boolean>>` | [L246-252](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L246-L252) | 获取所有 Channel 可见性副本 |
| `hasLayerData` | `(layerId): boolean` | [L270-276](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L270-L276) | 检查 Layer 是否有非零数据 |

### 2.2 Custom Channel Color API（Phase B）

Per-layer 自定义 channel 颜色。每个 layer 的 MaskVolume 有独立的 `colorMap`，互不影响。

| 方法 | 签名 | 说明 |
|------|------|------|
| `setChannelColor` | `(layerId: string, channel: number, color: RGBAColor): void` | 设置指定 layer 指定 channel 的颜色，触发重渲染和 `onChannelColorChanged` 回调 |
| `getChannelColor` | `(layerId: string, channel: number): RGBAColor` | 获取 RGBA 颜色对象 |
| `getChannelHexColor` | `(layerId: string, channel: number): string` | 获取 Hex 字符串（如 `#ff8000`） |
| `getChannelCssColor` | `(layerId: string, channel: number): string` | 获取 CSS rgba() 字符串（如 `rgba(255,128,0,1.00)`） |
| `setChannelColors` | `(layerId: string, colorMap: Partial<ChannelColorMap>): void` | 批量设置一个 layer 的多个 channel 颜色（一次 reload） |
| `setAllLayersChannelColor` | `(channel: number, color: RGBAColor): void` | 所有 layer 的同一 channel 设为相同颜色 |
| `resetChannelColors` | `(layerId?: string, channel?: number): void` | 重置为 `MASK_CHANNEL_COLORS` 默认颜色 |

**内部机制**:
- `syncBrushColor()` — 私有方法，从当前 layer 的 volume 动态获取颜色更新 `fillColor`/`brushColor`
- 在 `setActiveLayer()`、`setActiveChannel()`、`setChannelColor()` 等方法中自动调用

#### 外部使用方式

**前提**: `nrrdTools` 实例已创建，且 `setAllSlices()` 已调用完毕（即图像已加载，MaskVolume 已初始化）。
 
> ⚠️ **重要**: 必须在图像加载完成（`setAllSlices()` 调用后）才能设置颜色，否则 MaskVolume 尚未创建，调用会静默失败（`console.warn`）。
 
---

**场景 1：给某个 Layer 的某个 Channel 设置自定义颜色**

```typescript
// 将 layer2 的 channel 3 设为橙色
nrrdTools.setChannelColor('layer2', 3, { r: 255, g: 128, b: 0, a: 255 });
// 效果：layer2 上所有用 channel 3 画的 mask 变为橙色
// layer1、layer3 的 channel 3 颜色不受影响
```

---

**场景 2：批量设置一个 Layer 的多个 Channel 颜色（推荐，只触发一次重渲染）**

```typescript
nrrdTools.setChannelColors('layer1', {
  1: { r: 255, g: 0,   b: 0,   a: 255 },   // channel 1 → 红色
  2: { r: 0,   g: 0,   b: 255, a: 255 },   // channel 2 → 蓝色
  3: { r: 255, g: 255, b: 0,   a: 255 },   // channel 3 → 黄色
});
// 只触发一次 reloadMasksFromVolume()，性能优于多次调用 setChannelColor()
```

---

**场景 3：所有 Layer 的同一 Channel 使用相同颜色**

```typescript
// 把所有 layer 的 channel 1 统一改为红色
nrrdTools.setAllLayersChannelColor(1, { r: 255, g: 0, b: 0, a: 255 });
```

---

**场景 4：读取当前颜色**

```typescript
// 读取 layer2 的 channel 3 当前颜色
const rgba = nrrdTools.getChannelColor('layer2', 3);
// → { r: 255, g: 128, b: 0, a: 255 }

const hex = nrrdTools.getChannelHexColor('layer2', 3);
// → "#ff8000"  (用于 canvas fillStyle 或 CSS color)

const css = nrrdTools.getChannelCssColor('layer2', 3);
// → "rgba(255,128,0,1.00)"  (用于 Vue style binding)
```

---

**场景 5：重置颜色**

```typescript
// 重置 layer2 的 channel 3 为默认颜色
nrrdTools.resetChannelColors('layer2', 3);

// 重置 layer2 的所有 channel 为默认颜色
nrrdTools.resetChannelColors('layer2');

// 重置所有 layer 的所有 channel 为默认颜色
nrrdTools.resetChannelColors();
```

---

**场景 6：设置颜色后通知 Vue UI 刷新**

颜色修改后，canvas 会立即重渲染（`reloadMasksFromVolume()` 自动调用）。
但 Vue UI 中的 channel 颜色卡片（`LayerChannelSelector.vue`）需要手动触发刷新：

```typescript
// 在 Vue 组件中，拿到 composable 的 refreshChannelColors
const { refreshChannelColors } = useLayerChannel({ nrrdTools });

// 设置颜色后调用 refresh，让 Vue UI 同步更新颜色显示
nrrdTools.setChannelColor('layer2', 3, { r: 255, g: 128, b: 0, a: 255 });
refreshChannelColors();   // 递增 colorVersion → 触发 dynamicChannelConfigs 重计算
```

或者监听 `onChannelColorChanged` 回调来自动刷新：

```typescript
// 在初始化时注册回调（nrrd_states 是 NrrdTools 内部状态，需通过 draw() 选项设置）
// ⚠️ 目前 onChannelColorChanged 挂载在 nrrd_states 上，暂不支持直接从外部设置
// 推荐方式：手动在 setChannelColor() 后调用 refreshChannelColors()
```

---

**场景 7：完整的初始化+颜色设置示例（Vue 组件中）**

```typescript
// LeftPanelCore.vue 或其他父组件
import emitter from '@/plugins/custom-emitter';

// 图像加载完成后（onFinishLoadAllCaseImages 事件）
const nrrdTools = ref<Copper.NrrdTools>();

emitter.on('Core:NrrdTools', (tools) => {
  nrrdTools.value = tools;
});

emitter.on('Segmentation:FinishLoadAllCaseImages', () => {
  // 此时 setAllSlices() 已调用完毕，MaskVolume 已初始化，可以安全设置颜色
  if (!nrrdTools.value) return;

  // 为 layer1 设置自定义颜色方案
  nrrdTools.value.setChannelColors('layer1', {
    1: { r: 255, g: 80,  b: 80,  a: 255 },   // 浅红
    2: { r: 80,  g: 180, b: 255, a: 255 },   // 浅蓝
  });

  // layer2 保持默认颜色，无需操作
});
```

---

**颜色值范围**

`RGBAColor` 各字段取值 `0-255`（整数）：

```typescript
interface RGBAColor {
  r: number;  // 0-255
  g: number;  // 0-255
  b: number;  // 0-255
  a: number;  // 0-255，255 = 完全不透明，0 = 完全透明
}
```

Channel `a`（alpha）决定 mask 的不透明度基准值。通常设为 `255`，实际渲染时还会乘以 `gui_states.globalAlpha`（默认 0.6）。

### 2.3 Keyboard & History

| 方法 | 签名 | 行号 | 说明 |
|------|------|------|------|
| `undo` | `(): void` | [L292-294](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L292-L294) | 撤销上一次绘画操作 |
| `redo` | `(): void` | [L308-310](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L308-L310) | 重做上一次撤销的操作 |
| `enterKeyboardConfig` | `(): void` | [L326-328](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L326-L328) | 进入键盘配置模式（抑制所有快捷键） |
| `exitKeyboardConfig` | `(): void` | [L338-340](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L338-L340) | 退出键盘配置模式 |
| `setContrastShortcutEnabled` | `(enabled: boolean): void` | [L363-365](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L363-L365) | 启用/禁用 Contrast 快捷键 |
| `isContrastShortcutEnabled` | `(): boolean` | [L370-372](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L370-L372) | Contrast 快捷键是否启用 |
| `setKeyboardSettings` | `(settings: Partial<IKeyBoardSettings>): void` | [L397-407](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L397-L407) | 更新键盘快捷键绑定 |
| `getKeyboardSettings` | `(): IKeyBoardSettings` | [L423-425](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L423-L425) | 获取当前键盘设置快照 |

### 2.4 Data Loading

| 方法 | 签名 | 行号 | 说明 |
|------|------|------|------|
| `setAllSlices` | `(allSlices: Array<nrrdSliceType>): void` | [L452-501](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L452-L501) | **入口函数**：加载 NRRD 切片，初始化 MaskVolume |
| `setMasksData` | `(masksData, loadingBar?): void` | [L521-583](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L521-L583) | 旧版加载方法（Legacy） |
| `setMasksFromNIfTI` | `(layerVoxels: Map<string, Uint8Array>, loadingBar?): void` | [L594-635](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L594-L635) | 从 NIfTI 文件加载 mask 到 MaskVolume |

### 2.5 Display & Rendering

| 方法 | 签名 | 行号 | 说明 |
|------|------|------|------|
| `resizePaintArea` | `(factor: number): void` | [L1215-1260](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L1215-L1260) | 调整画布缩放 |
| `reloadMasksFromVolume` | `(): void` (private) | [L1266-1297](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L1266-L1297) | **核心重渲染**：从 MaskVolume 重新渲染所有 Layer 到 Canvas |
| `flipDisplayImageByAxis` | `(): void` | [L1308-1329](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L1308-L1329) | 翻转 CT 图像以正确显示 |
| `redrawDisplayCanvas` | `(): void` | [L1371-1396](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L1371-L1396) | 重绘 contrast 图像到 displayCanvas |
| `setEmptyCanvasSize` | `(axis?): void` | [L1342-1363](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L1342-L1363) | 根据 axis 设置 emptyCanvas 尺寸 |

### 2.6 其他 API

| 方法 | 行号 | 说明 |
|------|------|------|
| `drag(opts?)` | [L81-83](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L81-L83) | 启用拖拽切片功能 |
| `setBaseDrawDisplayCanvasesSize(size)` | [L89-97](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L89-L97) | 设置 Canvas 基础尺寸 (1-8) |
| `setupGUI(gui)` | [L115-152](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L115-L152) | 设置 dat.gui 面板 |
| `enableContrastDragEvents(callback)` | [L107-109](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L107-L109) | 启用 contrast 拖拽事件 |
| `getCurrentImageDimension()` | [L641-643](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L641-L643) | 获取图像尺寸 |
| `getVoxelSpacing()` | [L645-647](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L645-L647) | 获取体素间距 |

---

## 3. States（状态）

### 3.1 nrrd_states (INrrdStates)

定义位置: [CommToolsData.ts:40-105](annotator-frontend/src/ts/Utils/segmentation/CommToolsData.ts#L40-L105)

| 字段 | 类型 | 说明 |
|------|------|------|
| `dimensions` | `[width, height, depth]` | 体素维度 |
| `currentSliceIndex` | `number` | 当前切片索引 |
| `maxIndex` / `minIndex` | `number` | 切片索引范围 |
| `axis` | — | ⚠️ 注意：axis 存在 `protectedData.axis` 中 |
| `nrrd_x_pixel` / `y` / `z` | `number` | 各轴像素数 |
| `changedWidth` / `changedHeight` | `number` | 当前 Canvas 显示尺寸 |
| `layers` | `string[]` | Layer ID 列表，默认 `["layer1","layer2","layer3"]` |
| `sizeFoctor` | `number` | 缩放因子 |
| `voxelSpacing` | `number[]` | 体素间距 |
| `spaceOrigin` | `number[]` | 空间原点 |

### 3.2 gui_states (IGUIStates)

定义位置: [CommToolsData.ts:128-189](annotator-frontend/src/ts/Utils/segmentation/CommToolsData.ts#L128-L189)

| 字段 | 类型 | 说明 |
|------|------|------|
| `layer` | `string` | 当前活跃 Layer (默认 `"layer1"`) |
| `activeChannel` | `number` | 当前活跃 Channel (1-8) |
| `layerVisibility` | `Record<string, boolean>` | Layer 可见性，[L183](annotator-frontend/src/ts/Utils/segmentation/CommToolsData.ts#L183) |
| `channelVisibility` | `Record<string, Record<number, boolean>>` | Channel 可见性，[L184-188](annotator-frontend/src/ts/Utils/segmentation/CommToolsData.ts#L184-L188) |
| `fillColor` / `brushColor` | `string` | 当前画笔颜色 (Hex) |
| `brushAndEraserSize` | `number` | 画笔/橡皮擦大小 |
| `globalAlpha` | `number` | 全局透明度 (0.6) |
| `pencil` / `Eraser` / `sphere` | `boolean` | 工具激活状态 |
| `activeSphereType` | `"tumour" \| "skin" \| "nipple" \| "ribcage"` | 当前 sphere 类型 |

### 3.3 protectedData (IProtected)

定义位置: [CommToolsData.ts:223-293](annotator-frontend/src/ts/Utils/segmentation/CommToolsData.ts#L223-L293)

| 字段 | 说明 |
|------|------|
| `axis` | 当前视图轴 `"x"` / `"y"` / `"z"` |
| `maskData.volumes` | `Record<string, MaskVolume>` — 每个 Layer 对应的 3D 体积 |
| `layerTargets` | `Map<string, ILayerRenderTarget>` — 每个 Layer 的 canvas+ctx |
| `canvases` | 5 个系统 Canvas |
| `ctxes` | 对应的 2D Context |
| `Is_Shift_Pressed` / `Is_Ctrl_Pressed` / `Is_Draw` | 交互状态标志 |

---

## 4. Callbacks

### 4.1 getMask (后端同步)

定义: [CommToolsData.ts:91-100](annotator-frontend/src/ts/Utils/segmentation/CommToolsData.ts#L91-L100)

```ts
getMask: (
  sliceData: Uint8Array,    // 当前切片的原始体素数据
  layerId: string,          // layer 名
  channelId: number,        // active channel
  sliceIndex: number,       // 切片索引
  axis: "x" | "y" | "z",   // 当前轴
  width: number,            // 切片宽度
  height: number,           // 切片高度
  clearFlag: boolean        // 是否为清除操作
) => void
```

**调用时机**: 每次绘画结束（mouseup）、undo/redo 之后。

### 4.2 onClearLayerVolume

定义: [CommToolsData.ts:101](annotator-frontend/src/ts/Utils/segmentation/CommToolsData.ts#L101)

```ts
onClearLayerVolume: (layerId: string) => void
```

### 4.3 onChannelColorChanged（Phase B 新增）

定义: [coreType.ts](annotator-frontend/src/ts/Utils/segmentation/coreTools/coreType.ts) `INrrdStates`

```ts
onChannelColorChanged: (layerId: string, channel: number, color: RGBAColor) => void
```

**调用时机**: `NrrdTools.setChannelColor()` 修改颜色后触发。默认空实现，外部可通过 `nrrd_states` 赋值覆盖。

### 4.4 getSphere / getCalculateSpherePositions

定义: [CommToolsData.ts:102-103](annotator-frontend/src/ts/Utils/segmentation/CommToolsData.ts#L102-L103)

**`getSphere`**: Sphere 模式下左键松开时调用。

```ts
getSphere: (sphereOrigin: number[], sphereRadius: number) => void
// sphereOrigin = [mouseX, mouseY, sliceIndex] — z-axis 坐标
// sphereRadius = 半径 (1-50 像素)
```

**`getCalculateSpherePositions`**: Sphere 模式下放置 sphere 后调用（所有类型通用）。

```ts
getCalculateSpherePositions: (
  tumourSphereOrigin: ICommXYZ | null,  // channel 1
  skinSphereOrigin: ICommXYZ | null,    // channel 4
  ribSphereOrigin: ICommXYZ | null,     // channel 3
  nippleSphereOrigin: ICommXYZ | null,  // channel 5
  axis: "x" | "y" | "z"
) => void
// 每个 origin 为 { x: [mx, my, slice], y: [...], z: [...] }
// null 表示该类型尚未放置
```

**Channel 映射** (exported as `SPHERE_CHANNEL_MAP`):

| Sphere Type | Layer  | Channel | 颜色 |
|-------------|--------|---------|------|
| tumour      | layer1 | 1       | `#00ff00` (green) |
| ribcage     | layer1 | 3       | `#0000ff` (blue) |
| skin        | layer1 | 4       | `#ffff00` (yellow) |
| nipple      | layer1 | 5       | `#ff00ff` (magenta) |

> ⚠️ 当前 sphere 数据不写入 layer MaskVolume，仅作为 overlay 显示。Channel 映射预留供未来使用。

---

## 5. MaskVolume 存储与渲染

### 5.1 内存布局

**文件**: [core/MaskVolume.ts](annotator-frontend/src/ts/Utils/segmentation/core/MaskVolume.ts)

```
内存布局: [z][y][x][channel]
index = z * bytesPerSlice + y * width * channels + x * channels + channel
bytesPerSlice = width * height * channels
```

底层数据结构: 单一连续 `Uint8Array`

### 5.2 各轴切片维度

定义: [MaskVolume.ts:1117-1126](annotator-frontend/src/ts/Utils/segmentation/core/MaskVolume.ts#L1117-L1126)

| 轴 | 切片宽度 | 切片高度 | 说明 |
|----|---------|---------|------|
| z (Axial) | width | height | 最常用，连续内存 |
| y (Coronal) | width | depth | 按行提取 |
| x (Sagittal) | depth | height | 逐像素提取，最慢 |

对应 emptyCanvas 尺寸设置: [NrrdTools.ts:1342-1363](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L1342-L1363)

### 5.3 切片提取 (读取 Mask)

**`getSliceUint8(sliceIndex, axis)`** — [MaskVolume.ts:1019-1058](annotator-frontend/src/ts/Utils/segmentation/core/MaskVolume.ts#L1019-L1058)

返回原始 `Uint8Array`，用于：
- 后端同步 (`getMask` callback)
- Undo/Redo 快照

各轴实现：
- **Z 轴** [L1032-1035](annotator-frontend/src/ts/Utils/segmentation/core/MaskVolume.ts#L1032-L1035): 连续内存 `subarray` 批量复制（最快）
- **Y 轴** [L1036-1042](annotator-frontend/src/ts/Utils/segmentation/core/MaskVolume.ts#L1036-L1042): 按行迭代复制
- **X 轴** [L1043-1055](annotator-frontend/src/ts/Utils/segmentation/core/MaskVolume.ts#L1043-L1055): 逐像素提取（最慢）

### 5.4 切片写入

**`setSliceUint8(sliceIndex, data, axis)`** — [MaskVolume.ts:1072-1108](annotator-frontend/src/ts/Utils/segmentation/core/MaskVolume.ts#L1072-L1108)

`getSliceUint8` 的逆操作，用于 Undo/Redo 恢复。

**`setSliceLabelsFromImageData(sliceIndex, imageData, axis, activeChannel, channelVisible?)`** — [MaskVolume.ts:575-661](annotator-frontend/src/ts/Utils/segmentation/core/MaskVolume.ts#L575-L661)

Canvas→Volume 写入，将 RGBA 像素转换为 channel label (1-8)。
- 构建 RGB→Channel 映射 [L593](annotator-frontend/src/ts/Utils/segmentation/core/MaskVolume.ts#L593)
- ALPHA_THRESHOLD = 128 [L601](annotator-frontend/src/ts/Utils/segmentation/core/MaskVolume.ts#L601) 避免抗锯齿边缘

### 5.5 渲染到 Canvas

**核心渲染方法: `renderLabelSliceInto()`** — [MaskVolume.ts:695-770](annotator-frontend/src/ts/Utils/segmentation/core/MaskVolume.ts#L695-L770)

```ts
renderLabelSliceInto(
  sliceIndex: number,
  axis: 'x' | 'y' | 'z',
  target: ImageData,              // 预分配的 ImageData buffer
  channelVisible?: Record<number, boolean>,  // Channel 可见性
  opacity: number = 1.0
): void
```

渲染逻辑:
1. 读取 label 值 (0-8)
2. `label === 0` → 透明 (RGBA 全 0)
3. `channelVisible && !channelVisible[label]` → 隐藏该 Channel → 透明
4. 否则 → 从 volume 的 `colorMap` 取颜色（支持 per-layer 自定义颜色），应用 opacity

> **Phase B 变更**: 颜色来源从全局 `MASK_CHANNEL_COLORS` 改为每个 volume 实例的 `this.colorMap`。`buildRgbToChannelMap()` 也改为 instance 方法，确保 canvas→volume 写回时使用正确的自定义颜色映射。

### 5.6 渲染管线完整流程

**入口: `reloadMasksFromVolume()`** — [NrrdTools.ts:1266-1297](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L1266-L1297)

```
reloadMasksFromVolume()
  │
  ├─ getOrCreateSliceBuffer(axis)          → 获取/创建可复用的 ImageData buffer
  │   [CommToolsData.ts:543-568]
  │
  ├─ FOR EACH layer:
  │   ├─ target.ctx.clearRect(...)         → 清空 layer canvas
  │   └─ renderSliceToCanvas(layerId, axis, sliceIndex, buffer, target.ctx, w, h)
  │       [CommToolsData.ts:585-616]
  │       │
  │       ├─ volume.renderLabelSliceInto(sliceIndex, axis, buffer, channelVis)
  │       │   [MaskVolume.ts:695-770]      → 渲染体素到 buffer
  │       │
  │       ├─ emptyCtx.putImageData(buffer) → 放到 emptyCanvas
  │       │   [CommToolsData.ts:604]
  │       │
  │       └─ targetCtx.drawImage(emptyCanvas, ...) → 绘制到 layer canvas
  │           [CommToolsData.ts:609-612]
  │           ⚠️ 注意：Mask 不做翻转！[L605-607]
  │
  └─ compositeAllLayers()                  → 合成到 master canvas
      [CommToolsData.ts:666-680]
      │
      ├─ masterCtx.clearRect(...)
      └─ FOR EACH layer:
          ├─ if !layerVisibility[layerId] → skip  [L676]
          └─ masterCtx.drawImage(layerCanvas)      [L678]
```

---

## 6. 翻转 (Flip) 机制

### 6.1 Display 翻转（仅 CT/MRI 图像）

**`flipDisplayImageByAxis()`** — [NrrdTools.ts:1308-1329](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L1308-L1329)

因为 Three.js 渲染的切片不在正确的 2D 位置，需要翻转 displayCanvas：

| 轴 | 翻转方式 | 代码行 |
|----|---------|--------|
| x (Sagittal) | `scale(-1, -1)` + `translate(-w, -h)` | [L1309-1315](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L1309-L1315) |
| y (Coronal) | `scale(1, -1)` + `translate(0, -h)` | [L1322-1327](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L1322-L1327) |
| z (Axial) | `scale(1, -1)` + `translate(0, -h)` | [L1316-1321](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L1316-L1321) |

调用位置: `redrawDisplayCanvas()` → [NrrdTools.ts:1385](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L1385)

### 6.2 Mask 不翻转

**重要**: `renderSliceToCanvas()` 中 Mask 渲染**不做翻转** — [CommToolsData.ts:605-607](annotator-frontend/src/ts/Utils/segmentation/CommToolsData.ts#L605-L607)

```ts
// No flip: MaskVolume stores in source coordinates matching the Three.js
// slice convention. Applying a display flip here would invert cross-axis
// slice indices (e.g. coronal 220 → 228 for a 448-slice volume).
```

### 6.3 applyMaskFlipForAxis（辅助方法）

[CommToolsData.ts:640-660](annotator-frontend/src/ts/Utils/segmentation/CommToolsData.ts#L640-L660) — 提供相同的翻转变换，但目前在 mask 渲染路径中**未使用**（翻转是自逆的）。

---

## 7. Tools（工具）

位置: `annotator-frontend/src/ts/Utils/segmentation/tools/`

所有 Tool 继承自 `BaseTool`:

**BaseTool** — [tools/BaseTool.ts](annotator-frontend/src/ts/Utils/segmentation/tools/BaseTool.ts)

```ts
interface ToolContext {
  nrrd_states: INrrdStates;
  gui_states: IGUIStates;
  protectedData: IProtected;
  cursorPage: ICursorPage;
}
abstract class BaseTool {
  constructor(ctx: ToolContext)
  setContext(ctx: ToolContext): void
}
```

### 7.1 Tool 列表

| Tool | 文件 | 说明 |
|------|------|------|
| **SphereTool** | [tools/SphereTool.ts](annotator-frontend/src/ts/Utils/segmentation/tools/SphereTool.ts) | 3D 球形标注工具，支持 4 种类型 (tumour/skin/ribcage/nipple)，各映射到 layer1 的指定 channel |
| **CrosshairTool** | [tools/CrosshairTool.ts](annotator-frontend/src/ts/Utils/segmentation/tools/CrosshairTool.ts) | 十字准星位置标记 |
| **ContrastTool** | [tools/ContrastTool.ts](annotator-frontend/src/ts/Utils/segmentation/tools/ContrastTool.ts) | 窗位/窗宽调节 |
| **ZoomTool** | [tools/ZoomTool.ts](annotator-frontend/src/ts/Utils/segmentation/tools/ZoomTool.ts) | 缩放/平移 |
| **EraserTool** | [tools/EraserTool.ts](annotator-frontend/src/ts/Utils/segmentation/tools/EraserTool.ts) | 橡皮擦 |
| **PanTool** | [tools/PanTool.ts](annotator-frontend/src/ts/Utils/segmentation/tools/PanTool.ts) | 右键拖拽平移画布（从 DrawToolCore 提取，Phase 2）|
| **DrawingTool** | [tools/DrawingTool.ts](annotator-frontend/src/ts/Utils/segmentation/tools/DrawingTool.ts) | 铅笔/画笔/橡皮擦绘画逻辑（从 DrawToolCore 提取，Phase 3）|
| **ImageStoreHelper** | [tools/ImageStoreHelper.ts](annotator-frontend/src/ts/Utils/segmentation/tools/ImageStoreHelper.ts) | Canvas↔Volume 同步 |
| **DragSliceTool** | [tools/DragSliceTool.ts](annotator-frontend/src/ts/Utils/segmentation/tools/DragSliceTool.ts) | 拖拽切换切片 |

Tool 初始化: [DrawToolCore.ts](annotator-frontend/src/ts/Utils/segmentation/DrawToolCore.ts) `initTools()` 方法

### 7.2 ImageStoreHelper（关键工具）

**`storeAllImages(index, layer)`** — [ImageStoreHelper.ts:116-178](annotator-frontend/src/ts/Utils/segmentation/tools/ImageStoreHelper.ts#L116-L178)

Canvas → Volume 同步流程:
1. 将 layer canvas 绘制到 emptyCanvas [L124]
2. 从 emptyCanvas 获取 ImageData [L127-132]
3. 调用 `volume.setSliceLabelsFromImageData()` [L142-148] 写入 MaskVolume
4. 提取切片通知后端 [L161]

**`filterDrawedImage(axis, sliceIndex)`** — [ImageStoreHelper.ts:85-107](annotator-frontend/src/ts/Utils/segmentation/tools/ImageStoreHelper.ts#L85-L107)

Volume → Canvas 读取，调用 `volume.renderLabelSliceInto()`.

### 7.3 SphereTool（球形标注工具）

**文件**: [tools/SphereTool.ts](annotator-frontend/src/ts/Utils/segmentation/tools/SphereTool.ts)

#### 类型与常量

```ts
type SphereType = 'tumour' | 'skin' | 'nipple' | 'ribcage';

const SPHERE_CHANNEL_MAP: Record<SphereType, { layer: string; channel: number }>;
const SPHERE_COLORS: Record<SphereType, string>;
```

#### 辅助方法

| 方法 | 签名 | 说明 |
|------|------|------|
| `getChannelForSphereType` | `(type: SphereType): number` | 获取 sphere 类型对应的 channel 号 |
| `getLayerForSphereType` | `(type: SphereType): string` | 获取 sphere 类型对应的 layer ID |
| `getColorForSphereType` | `(type: SphereType): string` | 获取 sphere 类型对应的预览颜色 |

#### 使用边界

Sphere 模式激活时：
- ❌ **Shift 键被禁用** — 不能进入 draw 模式
- ✅ **Crosshair 切换可用** (S 键)
- ❌ **clearPaint 不通知后端**
- ❌ **Contrast 模式被阻止**

#### 交互流程

```
左键按下 → 根据 activeSphereType 记录 origin → 绑定 sphere wheel → 绘制预览圆
           (tumour/skin/nipple/ribcage 各自存储 origin)
滚轮 (左键按住) → sphereRadius ±1 [1, 50] → 重绘
左键松开 → 写入所有已放置 sphere 到 volume → 触发 getSphere + getCalculateSpherePositions → 恢复 wheel 模式
```

#### SphereMaskVolume

独立 `MaskVolume`，存储 sphere 3D 数据，不污染 layer draw mask。

| 生命周期 | 位置 | 操作 |
|---------|------|------|
| 创建 | `NrrdTools.setAllSlices()` | `new MaskVolume(vw, vh, vd, 1)` |
| 清空 | `NrrdTools.clear()` | `sphereMaskVolume = null` |
| 存储 | `nrrd_states.sphereMaskVolume` | — |

### 7.4 PanTool（右键平移工具）

**文件**: [tools/PanTool.ts](annotator-frontend/src/ts/Utils/segmentation/tools/PanTool.ts) — 124 lines

从 `DrawToolCore.paintOnCanvas()` 提取（Phase 2, 2026-02-26）。处理所有右键拖拽平移逻辑。

#### PanCallbacks 接口

```ts
interface PanCallbacks {
  getPanelOffset: () => { left: number; top: number };      // 获取当前 panel 偏移量
  setPanelOffset: (left: number, top: number) => void;      // 设置 panel 偏移量
  zoomActionAfterDrawSphere: () => void;                    // Sphere 模式下 pan 结束后重绘
}
```

#### 关键属性与方法

| 成员 | 说明 |
|------|------|
| `rightClicked: boolean` | 右键是否按下 |
| `panMoveInnerX/Y: number` | 平移拖拽起始位置偏移 |
| `isActive: boolean` (getter) | 是否正在平移（用于 DrawToolCore re-entry guard）|
| `onPointerDown(e)` | 右键按下：记录起始偏移，更改光标为 grab |
| `onPointerMove(e)` | 拖拽中：计算并更新 panel 位置 |
| `onPointerUp(e)` | 右键松开：清理状态，恢复光标 |
| `onPointerLeave()` | canvas 离开：清理状态 |
| `reset()` | `paintOnCanvas()` 每次调用时重置状态 |

#### 与 DrawToolCore 集成

```ts
// DrawToolCore.initTools()
this.panTool = new PanTool(toolCtx, {
  getPanelOffset: () => ({ left: this.nrrd_states.previousPanelL, top: this.nrrd_states.previousPanelT }),
  setPanelOffset: (left, top) => { /* update nrrd_states + DOM */ },
  zoomActionAfterDrawSphere: () => this.zoomActionAfterDrawSphere(),
});

// handleOnDrawingMouseDown — right-click branch
this.panTool.onPointerDown(e);

// handleOnDrawingMouseUp — right-click branch
this.panTool.onPointerUp(e);

// pointerleave
this.panTool.onPointerLeave();
```

---

### 7.5 DrawingTool（绘画工具）

**文件**: [tools/DrawingTool.ts](annotator-frontend/src/ts/Utils/segmentation/tools/DrawingTool.ts) — 284 lines

从 `DrawToolCore.paintOnCanvas()` 提取（Phase 3, 2026-02-26）。处理铅笔、画笔、橡皮擦的所有绘画逻辑，包含 Undo 快照。

#### DrawingCallbacks 接口

```ts
interface DrawingCallbacks {
  setCurrentLayer: () => { ctx: CanvasRenderingContext2D; canvas: HTMLCanvasElement };
  compositeAllLayers: () => void;
  syncLayerSliceData: (index: number, layer: string) => void;
  filterDrawedImage: (axis: "x" | "y" | "z", index: number) => { image: ImageData } | undefined;
  getVolumeForLayer: (layer: string) => MaskVolume | undefined;
  pushUndoDelta: (delta: MaskDelta) => void;
  getEraserUrls: () => string[];
}
```

#### 关键属性与方法

| 成员 | 说明 |
|------|------|
| `leftClicked: boolean` | 左键是否按下 |
| `isPainting: boolean` | 是否正在绘画（mousedown 到 mouseup 期间）|
| `drawingLines: ICommXY[]` | 铅笔模式路径点集合 |
| `clearArcFn` | 当前帧的橡皮擦函数（由 `reset()` 注入）|
| `preDrawSlice/Axis/SliceIndex` | mousedown 时的 undo 快照数据 |
| `isActive: boolean` (getter) | 暴露 `leftClicked`，用于 DrawToolCore re-entry guard |
| `painting: boolean` (getter) | 暴露 `isPainting`，用于 mouseUp 条件判断 |
| `reset(clearArcFn)` | 每次 `paintOnCanvas()` 调用时重置状态并注入新橡皮擦函数 |
| `onPointerDown(e)` | 左键按下：设置光标、初始化路径、capturePreDrawSnapshot |
| `onPointerMove(e)` | 移动：橡皮擦分支用 clearArcFn，绘画分支积累路径并调用 paintOnCanvasLayer |
| `onPointerUp(e)` | 左键松开：铅笔 fill/画笔 closePath、syncLayerSliceData、pushUndoDelta |
| `onPointerLeave()` | canvas 离开：重置状态，**返回 `boolean`** 表示是否有未完成绘画 |

#### onPointerLeave 返回值约定

`onPointerLeave()` 返回 `true` 表示用户正在绘画时离开（即 DrawToolCore 需要执行 pointermove listener 清理）：

```ts
// DrawToolCore.pointerleave handler
const wasDrawing = this.drawingTool.onPointerLeave();
if (wasDrawing) {
  this.drawingCanvas.removeEventListener("pointermove", this.drawingPrameters.handleOnDrawingMouseMove);
  this.drawingCanvas.removeEventListener("wheel", this.drawingPrameters.handleOnDrawingSphereWheel);
}
```

#### 与 DrawToolCore 集成

```ts
// DrawToolCore.initTools()
this.drawingTool = new DrawingTool(toolCtx, {
  setCurrentLayer: () => this.setCurrentLayer(),
  compositeAllLayers: () => this.compositeAllLayers(),
  syncLayerSliceData: (index, layer) => this.syncLayerSliceData(index, layer),
  filterDrawedImage: (axis, index) => this.filterDrawedImage(axis, index),
  getVolumeForLayer: (layer) => this.getVolumeForLayer(layer),
  pushUndoDelta: (delta) => this.undoManager.push(delta),
  getEraserUrls: () => this.eraserUrls,
});

// paintOnCanvas() — reset each call
this.drawingTool.reset(this.useEraser());

// Re-entry guard
if (this.drawingTool.isActive || this.panTool.isActive) return;
```

#### Undo 快照机制

```
mousedown → capturePreDrawSnapshot()
  → callbacks.getVolumeForLayer(layer).getSliceUint8(sliceIndex, axis)
  → 保存到 preDrawSlice / preDrawAxis / preDrawSliceIndex

mouseup → pushUndoDelta()
  → callbacks.getVolumeForLayer(layer).getSliceUint8(sliceIndex, axis)  ← 操作后
  → callbacks.pushUndoDelta({ layerId, axis, sliceIndex, oldSlice: preDrawSlice, newSlice })
```

---

## 8. EventRouter（事件路由）

**文件**: [eventRouter/EventRouter.ts](annotator-frontend/src/ts/Utils/segmentation/eventRouter/EventRouter.ts)

### 8.1 交互模式

| Mode | 触发条件 | 说明 |
|------|---------|------|
| `idle` | 默认 | 无交互 |
| `draw` | Shift 按住 | 绘画模式 |
| `drag` | 垂直拖拽 | 切片导航 |
| `contrast` | Ctrl/Meta 按住 | 窗位/窗宽调节 |
| `crosshair` | S 键 | 十字准星 |

### 8.2 默认键盘设置

定义: [CommToolsData.ts:31-38](annotator-frontend/src/ts/Utils/segmentation/CommToolsData.ts#L31-L38)

```ts
IKeyBoardSettings = {
  draw: "Shift",
  undo: "z",
  redo: "y",
  contrast: ["Control", "Meta"],
  crosshair: "s",
  sphere: "q",
  mouseWheel: "Scroll:Zoom",   // 或 "Scroll:Slice"
}
```

---

## 9. Undo/Redo 系统

**文件**: [core/UndoManager.ts](annotator-frontend/src/ts/Utils/segmentation/core/UndoManager.ts)

### Delta 结构

```ts
interface MaskDelta {
  layerId: string;
  axis: "x" | "y" | "z";
  sliceIndex: number;
  oldSlice: Uint8Array;   // 操作前的切片数据
  newSlice: Uint8Array;   // 操作后的切片数据
}
```

- 每个 Layer 独立的 undo/redo 栈
- MAX_STACK_SIZE = 50

### Undo 流程

```
DrawToolCore.undoLastPainting()
  → UndoManager.undo() → MaskDelta
  → vol.setSliceUint8(delta.sliceIndex, delta.oldSlice, delta.axis)
  → applyUndoRedoToCanvas(layerId)
    → getOrCreateSliceBuffer(axis)
    → renderSliceToCanvas(...)
    → compositeAllLayers()
  → getMask(sliceData, ...) → 通知后端
```

---

## 10. DragOperator

**文件**: [DragOperator.ts](annotator-frontend/src/ts/Utils/segmentation/DragOperator.ts)

负责拖拽交互（切片导航）。

| 方法 | 说明 |
|------|------|
| `drag(opts?)` | 启用拖拽模式 |
| `configDragMode()` | 绑定拖拽监听器 |
| `removeDragMode()` | 移除拖拽监听器 |
| `updateIndex(move)` | 委托给 DragSliceTool |
| `setEventRouter(eventRouter)` | 订阅模式变化 |

---

## 11. Channel 颜色定义

**文件**: [core/types.ts](annotator-frontend/src/ts/Utils/segmentation/core/types.ts)

### 11.1 默认颜色（全局常量）

| Channel | 颜色 | Hex | RGBA |
|---------|------|-----|------|
| 0 | 透明 | `#000000` | `(0,0,0,0)` |
| 1 | 绿色 (Primary/Tumor) | `#00ff00` | `(0,255,0,255)` |
| 2 | 红色 (Secondary/Edema) | `#ff0000` | `(255,0,0,255)` |
| 3 | 蓝色 (Tertiary/Necrosis) | `#0000ff` | `(0,0,255,255)` |
| 4 | 黄色 (Enhancement) | `#ffff00` | `(255,255,0,255)` |
| 5 | 品红 (Vessel/Boundary) | `#ff00ff` | `(255,0,255,255)` |
| 6 | 青色 (Additional) | `#00ffff` | `(0,255,255,255)` |
| 7 | 橙色 (Auxiliary) | `#ff8000` | `(255,128,0,255)` |
| 8 | 紫色 (Extended) | `#8000ff` | `(128,0,255,255)` |

定义位置:
- RGBA: `MASK_CHANNEL_COLORS`
- CSS: `MASK_CHANNEL_CSS_COLORS`
- Hex: `CHANNEL_HEX_COLORS`

### 11.2 颜色转换工具函数（Phase B 新增）

| 函数 | 签名 | 说明 |
|------|------|------|
| `rgbaToHex` | `(color: RGBAColor) → string` | 转 Hex 字符串，如 `#ff8000` |
| `rgbaToCss` | `(color: RGBAColor) → string` | 转 CSS rgba() 字符串，如 `rgba(255,128,0,1.00)` |

### 11.3 Per-Layer 自定义颜色（Phase B）

每个 `MaskVolume` 实例拥有独立的 `colorMap: ChannelColorMap`，在构造时从 `MASK_CHANNEL_COLORS` 深拷贝。通过 `NrrdTools.setChannelColor(layerId, channel, color)` 修改某个 layer 的颜色不会影响其他 layer。

**颜色流转路径**:
```
volume.colorMap[channel]
  ↓ renderLabelSliceInto()     → Canvas 渲染使用 colorMap
  ↓ buildRgbToChannelMap()     → Canvas→Volume 写回使用 colorMap
  ↓ EraserTool.getChannelColor → 橡皮擦颜色匹配使用 colorMap
  ↓ syncBrushColor()           → 画笔颜色从 colorMap 获取
  ↓ getChannelCssColor()       → Vue UI 从 colorMap 获取显示颜色
```
