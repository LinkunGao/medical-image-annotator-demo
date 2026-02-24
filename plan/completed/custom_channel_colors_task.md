# Custom Channel Colors & Dynamic N-Layer Support Task

## Overview

两个互相关联的目标：
1. **动态 N-Layer 支持**：把系统从硬编码 3 层升级为支持用户传入任意数量的 layer（≥ 3）
2. **自定义 Channel 颜色接口**：通过 NrrdTools 公开 API 让用户自定义每层中 channel 的颜色（依赖动态层）

> **Status:** Complete (Phase A ✅, Phase B ✅)
> **Priority:** High
> **Depends on:** Phase 3 MaskVolume migration (completed)

---

## 背景与现状

### 已有基础

- `MaskVolume` 已实现 `setChannelColor(channel, RGBAColor)` 和 `getChannelColor(channel)` 方法
- `MASK_CHANNEL_COLORS` 定义了默认颜色映射（channel 0-8）
- `CHANNEL_HEX_COLORS` 定义了对应的 HEX 颜色字符串
- `NrrdTools` 已导出 visibility 控制接口：`setLayerVisible()`, `setChannelVisible()`, `getLayerVisibility()`, `getChannelVisibility()`

### 当前痛点（全部硬编码 3 层）

代码中存在以下几类硬编码依赖，需要全部替换为动态版本：

| 类别 | 文件 | 具体问题 |
|------|------|---------|
| 类型系统 | `coreType.ts` | `INewMaskData` 固定 layer1/2/3 字段；`IProtected.canvases` 固定 LayerOne/Two/Three；`INrrdStates.layers` 是字面量 tuple |
| 数据初始化 | `CommToolsData.ts` | `maskData.volumes` 固定 3 个 MaskVolume；`canvases`/`ctxes` 固定 LayerOne/Two/Three 字段 |
| 迭代逻辑 | `CommToolsData.ts` | `compositeAllLayers()` 三个独立 if 分支 |
| 初始化 | `NrrdTools.ts` | `setAllSlices`, `clear()` 直接写死 3 个 MaskVolume；`getChannelVisibility()` 遍历固定 3 个 layer |
| 工具类 | `DragSliceTool.ts` | `IDragEffectCanvases` 固定 3 个具名 canvas；`drawDragSlice` 写死 3 次 renderSliceToCanvas 调用 |
| 工具类 | `EraserTool.ts` | `createClearArc` switch 语句取 ctx；compositing 写死 3 个 if |
| GUI | `coreType.ts` `IGuiParameterSettings` | layer 列表固定 `["layer1","layer2","layer3"]` |

---

## 设计思路

### 核心思路：Layer 列表作为数据驱动的单一事实来源

不为每新增一层修改接口，而是将 layer 列表存为运行时状态 `nrrd_states.layers: string[]`，所有 canvas/volume/visibility 通过 **动态数组索引** 组织，而非固定属性名。

### Canvas 管理策略

**方案：固定系统 Canvas + 动态 Layer RenderTarget（配对 Map）**

> **为什么不用两个独立 Map？**  
> `canvas.getContext('2d')` 本身不创建新对象（浏览器缓存，重复调用返回同一引用），所以性能不是重点。  
> 真正的问题是：两个独立 Map 意味着 canvas 和 ctx **可能不同步**（一个存了另一个没存），每次使用需要两次 `Map.get()` + 两次 null 检查，且 TypeScript 无法保证两者对应。

**正确方案：单 Map，canvas + ctx 原子配对**：

```typescript
// 新增类型（coreType.ts）
interface ILayerRenderTarget {
  canvas: HTMLCanvasElement;
  ctx:    CanvasRenderingContext2D;
}

// IProtected 中
layerTargets: Map<string, ILayerRenderTarget>;
```

系统 canvas（drawingCanvas、displayCanvas、drawingCanvasLayerMaster、drawingSphereCanvas、emptyCanvas）保留具名属性，不受影响。

使用时一次查找，同时取得 canvas 和 ctx：

```ts
const target = this.protectedData.layerTargets.get(layerId);
if (!target) return; // 唯一的 null 检查
target.ctx.clearRect(0, 0, w, h);          // 写操作
masterCtx.drawImage(target.canvas, 0, 0); // 合成操作
```

| 对比项 | 两个独立 Map | 单 Map 配对（选用）|
|--------|------------|-------------------|
| 原子性 | ❌ 可能不同步 | ✅ 不可能不一致 |
| 查找次数 | 2× Map.get() | 1× Map.get() |
| null 检查 | 两次 | 一次 |
| TypeScript 安全 | 弱 | 强 |
| bug 风险 | 高 | 低 |

**层数限制**：建议 N ≤ 10（超出时 console.warn）。

---

## Phase A：动态 N-Layer 支持

### Task A1：类型系统重构（`coreType.ts`）

- [x] `INewMaskData` 改为 `Record<string, MaskVolume>`（移除固定 layer1/layer2/layer3 字段）
- [x] 新增 `ILayerRenderTarget { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D }` 类型
- [x] `IProtected` 新增 `layerTargets: Map<string, ILayerRenderTarget>`，移除 `canvases.drawingCanvasLayerOne/Two/Three` 和 `ctxes.drawingLayerOneCtx/TwoCtx/ThreeCtx`
- [x] `INrrdStates.layers` 类型从字面量 tuple 改为 `string[]`
- [x] `IGuiParameterSettings.advance.layer.value` 类型放宽为 `string[]`

**完成标准**: 类型编译通过，不破坏现有具名 canvas 访问

---

### Task A2：CommToolsData 重构

- [x] constructor 接受可选 `options: { layers?: string[] }` 参数（默认 `['layer1','layer2','layer3']`，向后兼容）
  ```ts
  constructor(container, mainAreaContainer, options?: { layers?: string[] })
  ```
- [x] `nrrd_states.layers` 使用传入的 layers（默认 3 层）
- [x] `generateCanvases()` 改为 `generateLayerTargets(layerIds: string[])` 返回 `Map<string, ILayerRenderTarget>`
  - 每个 layer 同时创建 canvas + ctx 并配对存入 Map，保证原子性
  - 系统 canvas (drawing/display/master/sphere/empty) 保持独立具名属性不变（新增 `generateSystemCanvases()`）
- [x] `protectedData.maskData.volumes` 使用 `layerIds.reduce(...)` 动态生成
- [x] `protectedData.layerTargets` 使用配对 Map 替代 `canvases.layerCanvasXxx` / `ctxes.layerXxxCtx`
- [x] `getVolumeForLayer(layer: string)` 改为直接 `volumes[layer]` 查找（移除 switch-case），未找到时 fallback 首层并 console.warn
- [x] `compositeAllLayers()` 改为 for 循环，一次 Map.get() 取 canvas：
  ```ts
  for (const layerId of this.nrrd_states.layers) {
    if (!this.gui_states.layerVisibility[layerId]) continue;
    const target = this.protectedData.layerTargets.get(layerId);
    if (target) masterCtx.drawImage(target.canvas, 0, 0, width, height);
  }
  ```
- [x] `gui_states.layerVisibility` / `channelVisibility` 动态初始化 for 所有 layers

**完成标准**: 默认 3 层行为不变；传入 4/5/N 层时 canvas 和 volume 自动增加

---

### Task A3：NrrdTools 重构

- [x] `setAllSlices()` 中 volumes 初始化改为动态 `layers.reduce(...)` 模式
- [x] `clear()` 中 volumes 重置使用相同模式（1×1×1 placeholders）
- [x] `getChannelVisibility()` 改为遍历 `this.nrrd_states.layers`（移除固定 3 层遍历）
- [x] `setLayerVisible()`, `isLayerVisible()` 等接口的 `LayerId` 类型放宽为 `string`（含 `setActiveLayer`, `getActiveLayer`, `setChannelVisible`, `isChannelVisible`, `hasLayerData`）
- [x] `hasLayerData()` 使用 `volumes[layerId]` 动态查找
- [x] `resetLayerCanvas()` 改为 for-of `layerTargets` 循环
- [x] `resizePaintArea()` layer canvas 尺寸设置改为 for-of `layerTargets` 循环
- [x] `reloadMasksFromVolume()` 改为 for-of `layerTargets` 循环（移除 3 个硬编码 clearRect + renderSliceToCanvas）
- [x] `setMasksFromNIfTI()` 移除 `keyof` cast（volumes 已是 `Record<string, MaskVolume>`）
- [x] 移除未使用的 `LayerId` 类型导入

**完成标准**: N 层初始化后 mask 加载、clear 均正确工作

---

### Task A4：DragSliceTool 重构

- [x] `IDragEffectCanvases` interface 保留具名 system canvas（master/display），layer canvas 引用改为 `layerTargets: Map<string, ILayerRenderTarget>`
- [x] `drawDragSlice()` 中对 layers 的 renderSliceToCanvas 改为 for 循环，单次 Map.get() 同时取 ctx
- [x] `compositeAllLayers()` 改为 for 循环，单次 Map.get() 取 canvas
- [x] `cleanCanvases()` 改为遍历 `layerTargets` 清除
- [x] `DragOperator.ts` 中 `dragEffectCanvases` 创建改为引用 `layerTargets`

**完成标准**: 拖动切片时 N 层全部正确渲染

---

### Task A5：EraserTool 重构

- [x] `createClearArc()` 中 switch-case 取 layerCtx 改为单次 `layerTargets.get()`
- [x] 最后 compositing 部分改为 for 循环，单次 Map.get() 取 canvas

**额外修复**（计划中未列出但必须同步修改的文件）：
- [x] `DrawToolCore.ts`: `setCurrentLayer()` switch → `layerTargets.get()`
- [x] `DrawToolCore.ts`: `start()` render loop 中 3 个 layer ctx 初始化 → for-of `layerTargets`
- [x] `DrawToolCore.ts`: canvas sizing block → for-of `layerTargets`
- [x] `DrawToolCore.ts`: `applyUndoRedoToCanvas()` switch → `layerTargets.get()`
- [x] `ImageStoreHelper.ts`: `getCanvasForLayer()` switch → `layerTargets.get()`

**完成标准**: 橡皮擦在 N 层模式下正确工作

---

## Phase B：自定义 Channel 颜色（依赖 Phase A）✅

> **Status:** Complete — 所有 Task 均已实现并通过构建和测试验证

### Task B1：基础工具函数 + MaskVolume 修复 ✅

- [x] `types.ts` 添加 `rgbaToHex()` 和 `rgbaToCss()` 颜色转换工具函数
- [x] `core/index.ts` 和 `ts/index.ts` 导出新函数
- [x] 修复 `MaskVolume.setChannelColor()` 校验：`channel >= this.numChannels` → `channel > 8`（label 范围 0-8）
- [x] `buildRgbToChannelMap()` 从 static 改为 instance 方法，使用 `this.colorMap` 而非全局 `MASK_CHANNEL_COLORS`
- [x] 新增 `resetChannelColors(channel?)` 和 `getColorMap()` 方法

### Task B2：EraserTool 颜色同步 ✅

- [x] 从常量 `MASK_CHANNEL_COLORS[activeChannel]` 改为从当前 layer 的 MaskVolume 动态获取：
  `const channelColor = volume.getChannelColor(activeChannel);`

### Task B3：NrrdTools Brush 颜色同步 ✅

- [x] 新增 `syncBrushColor()` 私有方法，从 volume 动态获取 hex 颜色
- [x] `setActiveLayer()` 和 `setActiveChannel()` 使用 `syncBrushColor()` 替代静态 `CHANNEL_HEX_COLORS`

### Task B4：GUI 颜色同步 ✅

- [x] `gui.ts` 中 layer onChange 从 MaskVolume 动态获取颜色
- [x] `IConfigGUI` 添加 `getVolumeForLayer` 接口
- [x] NrrdTools setupGUI 传入 `getVolumeForLayer: this.getVolumeForLayer.bind(this)`

### Task B5：NrrdTools 公开颜色 API ✅

- [x] `setChannelColor(layerId, channel, color)` — 单个 layer 单个 channel
- [x] `getChannelColor(layerId, channel)` — 获取 RGBA 颜色
- [x] `getChannelHexColor(layerId, channel)` — 获取 Hex 字符串
- [x] `getChannelCssColor(layerId, channel)` — 获取 CSS rgba() 字符串
- [x] `setChannelColors(layerId, colorMap)` — 批量设置
- [x] `setAllLayersChannelColor(channel, color)` — 所有 layer 同一 channel
- [x] `resetChannelColors(layerId?, channel?)` — 重置为默认颜色

### Task B6：Vue 组件动态颜色 ✅

- [x] `useLayerChannel.ts` 添加 `colorVersion` ref + `dynamicChannelConfigs` computed + `refreshChannelColors()` action
- [x] `activeChannelColor` 从 volume 动态获取
- [x] `LayerChannelSelector.vue` 使用 `dynamicChannelConfigs` 替代静态 `CHANNEL_CONFIGS`

### Task B7：颜色变更事件通知 ✅

- [x] `INrrdStates` 添加 `onChannelColorChanged` 回调
- [x] `CommToolsData.ts` 提供默认空实现
- [x] `NrrdTools.setChannelColor()` 调用后触发回调

### 修复的 Bug 汇总

| Bug | 问题 | 修复 |
|-----|------|------|
| Bug 0 | `setChannelColor()` 校验 `channel >= numChannels` 但 numChannels=1，导致无法设置任何 channel | 改为 `channel > 8`（label 范围 0-8） |
| Bug 1 | `buildRgbToChannelMap()` 使用全局颜色，自定义颜色像素无法反向映射 | 改为 instance 方法，使用 `this.colorMap` |
| Bug 2 | EraserTool 使用全局颜色匹配，无法擦除自定义颜色像素 | 从 volume 获取当前 layer 的颜色 |
| Bug 3 | Brush/Fill 使用全局 HEX 颜色，画出的颜色与自定义颜色不一致 | 从 volume 动态获取并转 hex |

---

## 文件影响范围

### Phase A（动态 N-Layer）

| 文件 | 变更内容 |
|------|----------|
| `coreType.ts` | INewMaskData 泛化；IProtected canvases/ctxes 改 Map；INrrdStates.layers string[] |
| `CommToolsData.ts` | constructor 加 options；layerCanvases Map；getVolumeForLayer 动态化；compositeAllLayers loop |
| `NrrdTools.ts` | setAllSlices/clear 动态化；getChannelVisibility loop |
| `DragSliceTool.ts` | IDragEffectCanvases 改 Map；drawDragSlice/composite loop |
| `EraserTool.ts` | layerCtx 动态查 Map；composite loop |
| `DrawToolCore.ts` | setCurrentLayer/start/applyUndoRedo 改用 layerTargets |
| `ImageStoreHelper.ts` | getCanvasForLayer 改用 layerTargets |

### Phase B（自定义颜色）

| 文件 | 变更内容 |
|------|----------|
| `core/types.ts` | +`rgbaToHex()`, +`rgbaToCss()` |
| `core/MaskVolume.ts` | 修 `setChannelColor` 校验; `buildRgbToChannelMap` static→instance; +`resetChannelColors()`, +`getColorMap()` |
| `core/index.ts` | 导出 `rgbaToHex`, `rgbaToCss` |
| `ts/index.ts` | 导出 `rgbaToHex`, `rgbaToCss` |
| `NrrdTools.ts` | +`syncBrushColor()`; 修 `setActiveLayer/Channel`; +7 个颜色 API 方法; setupGUI 传 `getVolumeForLayer` |
| `EraserTool.ts` | channelColor 从 volume 获取 |
| `coreTools/gui.ts` | IConfigGUI +`getVolumeForLayer`; layer onChange 从 volume 获取颜色 |
| `coreTools/coreType.ts` | +`onChannelColorChanged` callback |
| `CommToolsData.ts` | +`onChannelColorChanged` 默认空实现 |
| `useLayerChannel.ts` | +`dynamicChannelConfigs`, +`refreshChannelColors`; 修 `activeChannelColor` |
| `LayerChannelSelector.vue` | 使用 `dynamicChannelConfigs` 替代静态 `CHANNEL_CONFIGS` |

---

## 依赖关系

```
Phase A (动态层)
  A1 (类型) ← 其余 A task 依赖
  A2 (CommToolsData) ← A1
  A3 (NrrdTools) ← A1, A2
  A4 (DragSliceTool) ← A1, A2
  A5 (EraserTool) ← A1, A2

Phase B (颜色) ← 依赖 Phase A 完成
  B1 ← A3
  B2 ← B1
  B3 ← B1
  B4 ← A5 + B1
  B5 ← B1
  B6 ← B1 (独立)
```

**建议执行顺序**: A1 → A2 → A3+A4+A5 (可并行) → B1 → B2+B3+B4+B5 → B6

---

## 向后兼容性

- 默认不传 `options.layers` 时行为与现在完全一致（3 层）
- `setLayerVisible('layer1', ...)` 等 API 签名不变（LayerId → string，超集兼容）
- 旧代码通过 `protectedData.canvases.layerCanvases.get('layer1')` 取 canvas，替代旧的 `drawingCanvasLayerOne`

---

## API 汇总（最终状态）

```typescript
// NrrdTools 新增/修改公开方法

// 动态层初始化（通过 CommToolsData constructor options）
new NrrdTools(container, { layers: ['layer1','layer2','layer3','layer4'] });

// Phase B: 颜色控制
setChannelColor(layerId: string, channel: ChannelValue, color: RGBAColor): void;
getChannelColor(layerId: string, channel: ChannelValue): RGBAColor;
setChannelColors(layerId: string, colorMap: Partial<ChannelColorMap>): void;
setAllLayersChannelColor(channel: ChannelValue, color: RGBAColor): void;
resetChannelColors(layerId?: string): void;
```
