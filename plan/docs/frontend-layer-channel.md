# Frontend Layer & Channel Documentation

> Frontend 层面 Layer/Channel 的调用机制和数据流

## 1. 整体架构

```
┌─────────────────────────────────────────────────────────┐
│ LayerChannelSelector.vue                                │ ← UI 组件
│   用户点击 Layer/Channel 可见性按钮                        │
│   调用 useLayerChannel composable 的 action 方法          │
├─────────────────────────────────────────────────────────┤
│ useLayerChannel.ts                                      │ ← Composable
│   管理 Vue 响应式状态 (activeLayer, channelVisibility 等)  │
│   调用 NrrdTools 的 API 方法                              │
├─────────────────────────────────────────────────────────┤
│ NrrdTools.ts                                            │ ← 核心引擎
│   更新 gui_states                                        │
│   调用 reloadMasksFromVolume() 触发重渲染                  │
├─────────────────────────────────────────────────────────┤
│ MaskVolume.renderLabelSliceInto()                       │ ← 体素渲染
│   根据 channelVisibility 决定每个像素是否渲染              │
└─────────────────────────────────────────────────────────┘
```

---

## 2. NrrdTools 实例的创建与传递

### 2.1 创建 NrrdTools

**文件**: [LeftPanelCore.vue:202](annotator-frontend/src/components/viewer/LeftPanelCore.vue#L202)

```ts
nrrdTools = new Copper.NrrdTools(canvasContainer.value as HTMLDivElement);
```

### 2.2 通过 Emitter 分发

**文件**: [LeftPanelCore.vue:368](annotator-frontend/src/components/viewer/LeftPanelCore.vue#L368)

```ts
emitter!.emit("Core:NrrdTools", nrrdTools);
```

在所有图片加载完毕后（`filesCount === currentCaseContrastUrls.length`），执行初始化流程：
- [L357-358](annotator-frontend/src/components/viewer/LeftPanelCore.vue#L357-L358): 清空并加载切片 `nrrdTools.clear()` + `nrrdTools.setAllSlices(allSlices)`
- [L362](annotator-frontend/src/components/viewer/LeftPanelCore.vue#L362): 启用拖拽 `nrrdTools.drag({ getSliceNum })`
- [L363](annotator-frontend/src/components/viewer/LeftPanelCore.vue#L363): 启用绘画 `nrrdTools.draw({ getMaskData, onClearLayerVolume, ... })`
- [L364](annotator-frontend/src/components/viewer/LeftPanelCore.vue#L364): 设置 GUI `nrrdTools.setupGUI(gui)`
- [L367](annotator-frontend/src/components/viewer/LeftPanelCore.vue#L367): 注册渲染循环 `scene.addPreRenderCallbackFunction(nrrdTools.start)`
- [L368](annotator-frontend/src/components/viewer/LeftPanelCore.vue#L368): 分发实例 `emitter.emit("Core:NrrdTools", nrrdTools)`

### 2.3 Callback 绑定

`getMaskData` callback 在 [LeftPanelCore.vue:307-326](annotator-frontend/src/components/viewer/LeftPanelCore.vue#L307-L326) 定义，通过 `nrrdTools.draw()` 绑定到 `nrrd_states.getMask`：

```ts
const getMaskData = (
  sliceData: Uint8Array,
  layerId: string,
  channelId: number,
  sliceIndex: number,
  axis: "x" | "y" | "z",
  width: number,
  height: number,
  clearFlag?: boolean
) => {
  emit("update:getMaskData", { sliceData, layerId, channelId, sliceIndex, axis, width, height, clearFlag });
};
```

---

## 3. LayerChannelSelector 组件

**文件**: [LayerChannelSelector.vue](annotator-frontend/src/components/segmentation/LayerChannelSelector.vue)

### 3.1 接收 NrrdTools 实例

通过 emitter 接收，[L206-208](annotator-frontend/src/components/segmentation/LayerChannelSelector.vue#L206-L208):

```ts
const emitterOnNrrdTools = (tools: Copper.NrrdTools) => {
  nrrdTools.value = tools;
};
```

### 3.2 监听图片加载完成

[L210-213](annotator-frontend/src/components/segmentation/LayerChannelSelector.vue#L210-L213):

```ts
const emitterOnFinishLoadAllCaseImages = () => {
  enableControls();    // 启用 UI 控件
  syncFromManager();   // 从 NrrdTools 同步状态
};
```

### 3.3 Emitter 事件注册

[L221-231](annotator-frontend/src/components/segmentation/LayerChannelSelector.vue#L221-L231):

| Event | 处理方法 | 说明 |
|-------|---------|------|
| `Core:NrrdTools` | `emitterOnNrrdTools` | 接收 NrrdTools 实例 |
| `Segmentation:FinishLoadAllCaseImages` | `emitterOnFinishLoadAllCaseImages` | 图片加载完毕，启用控件 |
| `Segementation:CaseSwitched` | `emitterOnCaseSwitched` | Case 切换，禁用控件 |

### 3.4 UI 交互事件处理

#### 选择 Layer
[L184-189](annotator-frontend/src/components/segmentation/LayerChannelSelector.vue#L184-L189):
```ts
function onSelectLayer(layerId: Copper.LayerId): void {
  if (!layerVisibility.value[layerId]) return;  // 隐藏的 layer 不能选中
  setActiveLayer(layerId);
}
```

#### 选择 Channel
[L191-194](annotator-frontend/src/components/segmentation/LayerChannelSelector.vue#L191-L194):
```ts
function onSelectChannel(channel: Copper.ChannelValue): void {
  if (isChannelDisabled(channel)) return;
  setActiveChannel(channel);
}
```

#### 切换 Layer 可见性
[L196-198](annotator-frontend/src/components/segmentation/LayerChannelSelector.vue#L196-L198):
```ts
function onToggleLayerVisibility(layerId: Copper.LayerId): void {
  toggleLayerVisibility(layerId);
}
```

Template 绑定: [L32](annotator-frontend/src/components/segmentation/LayerChannelSelector.vue#L32) `@click.stop="onToggleLayerVisibility(layer.id)"`

#### 切换 Channel 可见性
[L200-202](annotator-frontend/src/components/segmentation/LayerChannelSelector.vue#L200-L202):
```ts
function onToggleChannelVisibility(channel: Copper.ChannelValue): void {
  toggleChannelVisibility(activeLayer.value, channel);
}
```

Template 绑定: [L78](annotator-frontend/src/components/segmentation/LayerChannelSelector.vue#L78) `@click.stop="onToggleChannelVisibility(channel.value)"`

---

## 4. useLayerChannel Composable

**文件**: [useLayerChannel.ts](annotator-frontend/src/composables/left-panel/useLayerChannel.ts)

### 4.1 响应式状态

| 变量 | 类型 | 默认值 | 行号 |
|------|------|--------|------|
| `activeLayer` | `Ref<LayerId>` | `'layer1'` | [L62](annotator-frontend/src/composables/left-panel/useLayerChannel.ts#L62) |
| `activeChannel` | `Ref<ChannelValue>` | `1` | [L65](annotator-frontend/src/composables/left-panel/useLayerChannel.ts#L65) |
| `layerVisibility` | `Ref<Record<LayerId, boolean>>` | 全部 `true` | [L68-72](annotator-frontend/src/composables/left-panel/useLayerChannel.ts#L68-L72) |
| `channelVisibility` | `Ref<Record<LayerId, Record<number, boolean>>>` | 全部 `true` | [L75-79](annotator-frontend/src/composables/left-panel/useLayerChannel.ts#L75-L79) |
| `layerDisabled` | `Ref<Record<LayerId, boolean>>` | 基于配置或 `false` | |
| `channelDisabled` | `Ref<Record<LayerId, Record<number, boolean>>>` | 基于配置或 `false` | |
| `controlsEnabled` | `Ref<boolean>` | `false` | |

### 4.2 Computed 属性

| 属性 | 说明 |
|------|------|
| `dynamicChannelConfigs` | 动态 channel 配置列表，反映当前 layer 的 per-layer 自定义颜色（从 NrrdTools 获取） |
| `activeChannelColor` | 当前 Channel 的 CSS 颜色（从 volume 动态获取，支持自定义颜色） |
| `activeLayerName` | 当前 Layer 的显示名称 |

> **Phase B 变更**: `activeChannelColor` 和 `dynamicChannelConfigs` 通过 `colorVersion` ref 触发 Vue 响应式更新。当外部调用 `NrrdTools.setChannelColor()` 后，需调用 `refreshChannelColors()` 来递增 `colorVersion`，从而触发 computed 重新计算。

### 4.3 Action 方法

#### `setActiveLayer(layerId)` — [L102-105](annotator-frontend/src/composables/left-panel/useLayerChannel.ts#L102-L105)

```ts
function setActiveLayer(layerId: Copper.LayerId): void {
  activeLayer.value = layerId;                      // 更新 Vue 状态
  deps.nrrdTools.value?.setActiveLayer(layerId);    // 同步到 NrrdTools
}
```

NrrdTools 内部:
- 设置 `gui_states.layer = layerId`
- 通过 `syncBrushColor()` 从新 layer 的 MaskVolume 动态获取当前 channel 的颜色，更新 `fillColor` / `brushColor`（支持 per-layer 自定义颜色）

#### `setActiveChannel(channel)` — [L110-113](annotator-frontend/src/composables/left-panel/useLayerChannel.ts#L110-L113)

```ts
function setActiveChannel(channel: Copper.ChannelValue): void {
  activeChannel.value = channel;                      // 更新 Vue 状态
  deps.nrrdTools.value?.setActiveChannel(channel);    // 同步到 NrrdTools
}
```

NrrdTools 内部:
- 设置 `gui_states.activeChannel = channel`
- 通过 `syncBrushColor()` 从当前 layer 的 MaskVolume 动态获取颜色，更新 `fillColor` / `brushColor`（支持自定义颜色）

#### `toggleLayerVisibility(layerId)` — [L118-122](annotator-frontend/src/composables/left-panel/useLayerChannel.ts#L118-L122)

```ts
function toggleLayerVisibility(layerId: Copper.LayerId): void {
  const newValue = !layerVisibility.value[layerId];
  layerVisibility.value[layerId] = newValue;                  // 更新 Vue 状态
  deps.nrrdTools.value?.setLayerVisible(layerId, newValue);   // 同步到 NrrdTools
}
```

NrrdTools 内部 ([NrrdTools.ts:207-210](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L207-L210)):
- 设置 `gui_states.layerVisibility[layerId] = visible`
- 调用 `reloadMasksFromVolume()` → 重新渲染所有 Layer

#### `toggleChannelVisibility(layerId, channel)`

```ts
function toggleChannelVisibility(layerId: Copper.LayerId, channel: Copper.ChannelValue): void {
  const newValue = !channelVisibility.value[layerId][channel];
  channelVisibility.value[layerId][channel] = newValue;                     // 更新 Vue 状态
  deps.nrrdTools.value?.setChannelVisible(layerId, channel, newValue);      // 同步到 NrrdTools
}
```

NrrdTools 内部 ([NrrdTools.ts:222-227](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts#L222-L227)):
- 设置 `gui_states.channelVisibility[layerId][channel] = visible`
- 调用 `reloadMasksFromVolume()` → 重新渲染所有 Layer

#### `setLayerDisabled(layerId, disabled)` / `setChannelDisabled(layerId, channel, disabled)`

更新对应的 `layerDisabled` 和 `channelDisabled` Vue 响应式变量，支持在运行时配置禁用状态。UI 组件（`LayerChannelSelector.vue`）会获取这两个新状态同步挂载 `is-disabled` 类以拦截交互逻辑及显示禁用样式（灰显、指针不可更改）。

#### `syncFromManager()` — [L150-169](annotator-frontend/src/composables/left-panel/useLayerChannel.ts#L150-L169)

从 NrrdTools 读取当前状态同步到 Vue 响应式变量:
- `activeLayer` ← `nrrdTools.getActiveLayer()`
- `activeChannel` ← `nrrdTools.getActiveChannel()`
- `layerVisibility` ← `nrrdTools.getLayerVisibility()`
- `channelVisibility` ← `nrrdTools.getChannelVisibility()`

### 4.4 常量配置

#### LAYER_CONFIGS — [L35-39](annotator-frontend/src/composables/left-panel/useLayerChannel.ts#L35-L39)

| Layer ID | 名称 | UI 颜色 | 等级禁用 | 配置扩展 |
|----------|------|---------|----------|----------|
| `layer1` | Layer 1 | `#4CAF50` (Green) | - | - |
| `layer2` | Layer 2 | `#2196F3` (Blue) | - | `disabledChannels: [2, 3, 4, 5, 6, 7, 8]` |
| `layer3` | Layer 3 | `#FF9800` (Orange) | `disable: true` | - |

在 `LayerConfig` 接口中，支持 `disable?: boolean` 直接在初始化时禁用整个图层。也支持 `disabledChannels?: number[]` 根据通道 ID 进行声明，初始化指定图层的部分子通道处于禁用状态。

#### CHANNEL_CONFIGS（静态默认，作为 fallback）

Channel 1-8，默认颜色来自 `Copper.CHANNEL_COLORS`（定义在 [core/types.ts](annotator-frontend/src/ts/Utils/segmentation/core/types.ts)）

#### dynamicChannelConfigs（运行时动态，优先使用）

Phase B 新增。Computed 属性，从当前 layer 的 MaskVolume 动态获取 channel 颜色。UI 组件（`LayerChannelSelector.vue`）已切换为使用 `dynamicChannelConfigs` 而非静态 `CHANNEL_CONFIGS`。

---

## 5. 完整数据流图

### 5.1 切换 Layer 可见性

```
用户点击 Layer 眼睛图标
    ↓
LayerChannelSelector.vue::onToggleLayerVisibility(layerId)     [L196-198]
    ↓
useLayerChannel::toggleLayerVisibility(layerId)                [L118-122]
    ├─ layerVisibility.value[layerId] = !current               ← Vue 响应式更新 → UI 重渲染
    └─ nrrdTools.setLayerVisible(layerId, newValue)            [NrrdTools.ts:207-210]
        ├─ gui_states.layerVisibility[layerId] = visible       ← 引擎内部状态
        └─ reloadMasksFromVolume()                             [NrrdTools.ts:1266-1297]
            ├─ FOR EACH layer:
            │   renderSliceToCanvas(layerId, axis, sliceIndex, buffer, ctx, w, h)
            │       [CommToolsData.ts:585-616]
            │   └─ volume.renderLabelSliceInto(...)             [MaskVolume.ts:695-770]
            │
            └─ compositeAllLayers()                            [CommToolsData.ts:666-680]
                └─ FOR EACH layer:
                    if (!layerVisibility[layerId]) → skip      [L676] ← 此处跳过隐藏 Layer
                    else → drawImage(layerCanvas) to master    [L678]
```

### 5.2 切换 Channel 可见性

```
用户点击 Channel 眼睛图标
    ↓
LayerChannelSelector.vue::onToggleChannelVisibility(channel)   [L200-202]
    ↓
useLayerChannel::toggleChannelVisibility(activeLayer, channel) [L127-131]
    ├─ channelVisibility.value[layerId][channel] = !current    ← Vue 响应式更新 → UI 重渲染
    └─ nrrdTools.setChannelVisible(layerId, channel, newValue) [NrrdTools.ts:222-227]
        ├─ gui_states.channelVisibility[layerId][channel] = visible
        └─ reloadMasksFromVolume()                             [NrrdTools.ts:1266-1297]
            └─ renderSliceToCanvas(layerId, ...)
                └─ channelVis = gui_states.channelVisibility[layer]   [CommToolsData.ts:599]
                └─ volume.renderLabelSliceInto(..., channelVis, ...)   [CommToolsData.ts:602]
                    └─ 逐像素渲染 [MaskVolume.ts:742-769]:
                        ├─ label === 0           → 透明
                        ├─ !channelVis[label]    → 透明 (该 channel 被隐藏) [L753-757]
                        └─ 否则                  → 从 MASK_CHANNEL_COLORS 取颜色渲染 [L758-764]
```

### 5.3 选择活跃 Layer

```
用户点击 Layer 名称区域
    ↓
LayerChannelSelector.vue::onSelectLayer(layerId)               [L184-189]
    ↓ (隐藏的 Layer 不可选: if (!layerVisibility[layerId]) return)
    ↓
useLayerChannel::setActiveLayer(layerId)                       [L102-105]
    ├─ activeLayer.value = layerId                             ← Vue 响应式更新
    └─ nrrdTools.setActiveLayer(layerId)
        ├─ gui_states.layer = layerId
        └─ syncBrushColor()                                    ← 从 volume 动态获取颜色
            ├─ volume.getChannelColor(activeChannel) → rgbaToHex()
            ├─ gui_states.fillColor = hex
            └─ gui_states.brushColor = hex
```

### 5.4 选择活跃 Channel

```
用户点击 Channel 卡片
    ↓
LayerChannelSelector.vue::onSelectChannel(channel)             [L191-194]
    ↓ (禁用的 Channel 不可选: if (isChannelDisabled(channel)) return)
    ↓
useLayerChannel::setActiveChannel(channel)                     [L110-113]
    ├─ activeChannel.value = channel                           ← Vue 响应式更新
    └─ nrrdTools.setActiveChannel(channel)
        ├─ gui_states.activeChannel = channel
        └─ syncBrushColor()                                    ← 从 volume 动态获取颜色
            ├─ volume.getChannelColor(channel) → rgbaToHex()
            ├─ gui_states.fillColor = hex
            └─ gui_states.brushColor = hex
```

---

## 6. 初始化时序图

```
1. LeftPanelCore.vue mounted
   └─ initCopper()
      └─ new Copper.NrrdTools(container)                       [L202]

2. NRRD 文件加载完毕 (filesCount === urls.length)              [L350-387]
   ├─ nrrdTools.clear()                                        [L357]
   ├─ nrrdTools.setAllSlices(allSlices)                        [L358]
   │   └─ 初始化 MaskVolume(vw, vh, vd, 1)                    [NrrdTools.ts:474-481]
   ├─ nrrdTools.drag({ getSliceNum })                          [L362]
   ├─ nrrdTools.draw({ getMaskData, onClearLayerVolume, ... }) [L363]
   │   └─ 绑定 nrrd_states.getMask = getMaskData
   ├─ nrrdTools.setupGUI(gui)                                  [L364]
   ├─ scene.addPreRenderCallbackFunction(nrrdTools.start)      [L367]
   └─ emitter.emit("Core:NrrdTools", nrrdTools)                [L368]

3. LayerChannelSelector 接收 NrrdTools
   └─ emitterOnNrrdTools: nrrdTools.value = tools              [L206-208]

4. 图片全部加载完成事件
   └─ emitterOnFinishLoadAllCaseImages                         [L210-213]
       ├─ enableControls()    → UI 可交互
       └─ syncFromManager()   → 从 NrrdTools 同步状态到 Vue
```

---

## 7. 关键文件索引

| 文件 | 路径 | 职责 |
|------|------|------|
| LeftPanelCore.vue | [annotator-frontend/src/components/viewer/LeftPanelCore.vue](annotator-frontend/src/components/viewer/LeftPanelCore.vue) | 创建 NrrdTools，加载图像，绑定 Callback |
| LayerChannelSelector.vue | [annotator-frontend/src/components/segmentation/LayerChannelSelector.vue](annotator-frontend/src/components/segmentation/LayerChannelSelector.vue) | Layer/Channel 选择 UI |
| useLayerChannel.ts | [annotator-frontend/src/composables/left-panel/useLayerChannel.ts](annotator-frontend/src/composables/left-panel/useLayerChannel.ts) | 响应式状态管理 + NrrdTools 同步 |
| NrrdTools.ts | [annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts](annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts) | Layer/Channel API (L168-252) |
| CommToolsData.ts | [annotator-frontend/src/ts/Utils/segmentation/CommToolsData.ts](annotator-frontend/src/ts/Utils/segmentation/CommToolsData.ts) | 渲染管线 + Canvas 管理 |
| MaskVolume.ts | [annotator-frontend/src/ts/Utils/segmentation/core/MaskVolume.ts](annotator-frontend/src/ts/Utils/segmentation/core/MaskVolume.ts) | 体素存储 + renderLabelSliceInto |
| core/types.ts | [annotator-frontend/src/ts/Utils/segmentation/core/types.ts](annotator-frontend/src/ts/Utils/segmentation/core/types.ts) | Channel 颜色定义 |
