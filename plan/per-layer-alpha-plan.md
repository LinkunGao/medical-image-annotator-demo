# Per-Layer Alpha (Opacity) Control

## 背景

当前系统只有一个 `globalAlpha`（在 `gui_states.drawing.globalAlpha`），它统一控制所有 layer mask 的透明度。该值通过 `DrawToolCore.start()` 渲染循环应用到 `drawingCtx.globalAlpha`，所有 layer 共享同一个 alpha。

**目标**: 在保持现有 global alpha 功能不变的基础上，新增**动态绑定当前激活 layer 的独立 alpha 控制**。当用户在 Layer Channel panel 切换激活 layer 后，slider 显示/控制该 layer 的 alpha，其他 layer 的 alpha 不变。

---

## 架构总结 (Current)

```
OperationCtl.vue (Slider: "Opacity" → globalAlpha)
  └─ nrrdTools.setOpacity(val) → gui_states.drawing.globalAlpha
       └─ DrawToolCore.start() 渲染循环:
            drawingCtx.globalAlpha = gui_states.drawing.globalAlpha
            drawingCtx.drawImage(drawingCanvasLayerMaster)  // 所有层合成后的结果

RenderingUtils.compositeAllLayers():
  masterCtx.drawImage(layer1.canvas)  // alpha=1
  masterCtx.drawImage(layer2.canvas)  // alpha=1
  masterCtx.drawImage(layer3.canvas)  // alpha=1
```

---

## Proposed Changes

### 1. Types — `ILayerChannelState`

#### [MODIFY] [types.ts](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator-failed/annotator-frontend/src/ts/Utils/segmentation/core/types.ts)

在 `ILayerChannelState` 接口中新增 `layerOpacity` 字段:

```diff
 export interface ILayerChannelState {
   layer: string;
   activeChannel: number;
   layerVisibility: Record<string, boolean>;
   channelVisibility: Record<string, Record<number, boolean>>;
+  /** Per-layer opacity: { layer1: 1.0, layer2: 0.6, ... }. Range [0.1, 1.0]. */
+  layerOpacity: Record<string, number>;
 }
```

---

### 2. State Init — `GuiState` & `CanvasState`

#### [MODIFY] [GuiState.ts](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator-failed/annotator-frontend/src/ts/Utils/segmentation/coreTools/GuiState.ts)

在 `layerChannel` 初始化中添加 `layerOpacity`（默认 1.0）:

```diff
 this.layerChannel = {
   layer: "layer1",
   activeChannel: 1,
   layerVisibility: ...,
   channelVisibility: ...,
+  layerOpacity: Object.fromEntries(layers.map((l) => [l, 1.0])),
 };
```

#### [MODIFY] [CanvasState.ts](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator-failed/annotator-frontend/src/ts/Utils/segmentation/CanvasState.ts)

在 `CanvasState` constructor 中初始化 `layerOpacity`（与 layerVisibility 同位置）:

```diff
+this.gui_states.layerChannel.layerOpacity = Object.fromEntries(
+    layers.map((id) => [id, 1.0])
+);
```

> **注意**: `GuiState` / `CanvasState` 层不知道 `LAYER_CONFIGS` 的 `defaultOpacity`，它们只提供默认 1.0。真正的 `defaultOpacity` 配置在 Vue 层的 `useLayerChannel.ts` 初始化时应用（见 Section 6）。

---

### 3. Rendering — `RenderingUtils.compositeAllLayers()`

#### [MODIFY] [RenderingUtils.ts](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator-failed/annotator-frontend/src/ts/Utils/segmentation/RenderingUtils.ts)

修改 `compositeAllLayers()` 使其在绘制每个 layer 到 master canvas 时，使用 per-layer opacity:

```diff
 compositeAllLayers(): void {
     const masterCtx = ...;
     masterCtx.clearRect(0, 0, width, height);

     for (const layerId of this.state.nrrd_states.image.layers) {
         if (!this.state.gui_states.layerChannel.layerVisibility[layerId]) continue;
         const target = this.state.protectedData.layerTargets.get(layerId);
-        if (target) masterCtx.drawImage(target.canvas, 0, 0, width, height);
+        if (target) {
+            const layerAlpha = this.state.gui_states.layerChannel.layerOpacity?.[layerId] ?? 1.0;
+            masterCtx.save();
+            masterCtx.globalAlpha = layerAlpha;
+            masterCtx.drawImage(target.canvas, 0, 0, width, height);
+            masterCtx.restore();
+        }
     }
 }
```

> **关键**: `globalAlpha`（drawing.globalAlpha）仍然在 `DrawToolCore.start()` 中应用于最终 `drawingCtx`，作为所有 mask 的全局 alpha。per-layer alpha 则在合成阶段独立应用，两者是**乘法关系**：最终 alpha = `globalAlpha × layerOpacity`。

---

### 4. Manager — `LayerChannelManager`

#### [MODIFY] [LayerChannelManager.ts](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator-failed/annotator-frontend/src/ts/Utils/segmentation/tools/LayerChannelManager.ts)

新增 `setLayerOpacity` / `getLayerOpacity` / `getLayerOpacityMap` 方法:

```ts
setLayerOpacity(layerId: string, opacity: number): void {
    this.ctx.gui_states.layerChannel.layerOpacity[layerId] =
        Math.max(0.1, Math.min(1, opacity));
    this.callbacks.reloadMasksFromVolume();
}

getLayerOpacity(layerId: string): number {
    return this.ctx.gui_states.layerChannel.layerOpacity[layerId] ?? 1.0;
}

getLayerOpacityMap(): Record<string, number> {
    return { ...this.ctx.gui_states.layerChannel.layerOpacity };
}
```

---

### 5. Facade — `NrrdTools`

#### [MODIFY] [NrrdTools.ts](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator-failed/annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts)

在 Section 7（Delegated — LayerChannelManager）中添加代理方法:

```ts
// Per-layer opacity
setLayerOpacity(layerId: string, opacity: number): void {
    this.layerChannelManager.setLayerOpacity(layerId, opacity);
}
getLayerOpacity(layerId: string): number {
    return this.layerChannelManager.getLayerOpacity(layerId);
}
getLayerOpacityMap(): Record<string, number> {
    return this.layerChannelManager.getLayerOpacityMap();
}
```

同时在 `getSliderMeta()` 方法中新增 `layerAlpha` case，以便 OperationCtl slider 能获取当前激活 layer 的 alpha 元数据:

```diff
 getSliderMeta(key: string): IGuiMeta | null {
     ...
+    if (key === "layerAlpha") {
+        const activeLayer = this.state.gui_states.layerChannel.layer;
+        return {
+            min: 0.1,
+            max: 1,
+            step: 0.01,
+            value: this.state.gui_states.layerChannel.layerOpacity?.[activeLayer] ?? 1.0,
+        };
+    }
     const setting = (this.guiParameterSettings as any)[key];
     ...
 }
```

---

### 6. Vue Composable — `useLayerChannel.ts`

#### [MODIFY] [useLayerChannel.ts](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator-failed/annotator-frontend/src/composables/left-panel/useLayerChannel.ts)

**6a. `LayerConfig` 接口新增 `defaultOpacity`**

```diff
 export interface LayerConfig {
     id: Copper.LayerId;
     name: string;
     disable?: boolean;
     disabledChannels?: number[];
+    /** Default opacity for this layer (0.1 - 1.0). Defaults to 1.0 if not set. */
+    defaultOpacity?: number;
 }
```

**6b. `LAYER_CONFIGS` 中可选配置初始 alpha**

```ts
export const LAYER_CONFIGS: LayerConfig[] = [
    { id: 'layer1', name: 'Layer 1' },                    // 默认 1.0
    { id: 'layer2', name: 'Layer 2', defaultOpacity: 0.8 }, // 自定义 0.8
    { id: 'layer3', name: 'Layer 3' },                    // 默认 1.0
    { id: 'layer4', name: 'Layer 4' },                    // 默认 1.0
];
```

**6c. Reactive state 使用 `defaultOpacity` 初始化**

```ts
// State — 从 LAYER_CONFIGS 读取 defaultOpacity，未设则默认 1.0
const layerOpacity = ref<Record<Copper.LayerId, number>>(
    Object.fromEntries(LAYER_CONFIGS.map(l => [l.id, l.defaultOpacity ?? 1.0]))
);

// Computed: 当前激活 layer 的 opacity
const activeLayerOpacity = computed(() => layerOpacity.value[activeLayer.value] ?? 1.0);
```

**6d. Action + syncFromManager()**

```ts
// Action
function setLayerOpacity(layerId: Copper.LayerId, opacity: number): void {
    layerOpacity.value[layerId] = Math.max(0.1, Math.min(1, opacity));
    deps.nrrdTools.value?.setLayerOpacity(layerId, opacity);
}

// syncFromManager() 中同步 opacity
function syncFromManager(): void {
    ...
    const opacityMap = tools.getLayerOpacityMap();
    layers.forEach(layerId => {
        layerOpacity.value[layerId] = opacityMap[layerId] ?? 1.0;
    });
}
```

**6e. enableControls() 中将 defaultOpacity 推送到 NrrdTools**

在 `enableControls()` 或 `syncFromManager()` 调用后，需要将 `LAYER_CONFIGS` 中的 `defaultOpacity` 推送到底层引擎:

```ts
function applyDefaultOpacities(): void {
    LAYER_CONFIGS.forEach(cfg => {
        if (cfg.defaultOpacity !== undefined) {
            deps.nrrdTools.value?.setLayerOpacity(cfg.id, cfg.defaultOpacity);
        }
    });
}
// 在 enableControls() 中调用 applyDefaultOpacities()
```

在 return 中导出 `layerOpacity`, `activeLayerOpacity`, `setLayerOpacity`。

---

### 7. UI — `OperationCtl.vue`

#### [MODIFY] [OperationCtl.vue](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator-failed/annotator-frontend/src/components/segmentation/OperationCtl.vue)

**7a. 新增 slider radio 选项**

```diff
 const commSliderRadioValues = ref([
   { label: "Opacity", value: "globalAlpha", color: "success" },
+  { label: "Layer Alpha", value: "layerAlpha", color: "secondary" },
   { label: "B&E Size", value: "brushAndEraserSize", color: "info" },
   ...
 ]);
```

**7b. toggleSlider() 添加 layerAlpha case**

```diff
 function toggleSlider(val: number) {
     ...
     switch (commSliderRadios.value) {
       case "globalAlpha":
         nrrdTools.setOpacity(val);
         break;
+      case "layerAlpha":
+        nrrdTools.setLayerOpacity(nrrdTools.getActiveLayer(), val);
+        break;
       case "brushAndEraserSize":
         ...
     }
 }
```

**7c. ⚡ Layer 切换时 Slider 值同步（关键联动）**

当 `LayerChannelSelector` 中切换 active layer 时，如果当前 slider radio 选中的是 `"layerAlpha"`，slider 的值需要自动更新为新 layer 的 opacity。

方案: 监听 emitter 事件 `"LayerChannel:ActiveLayerChanged"`，在回调中刷新 slider:

```ts
// OperationCtl.vue — manageEmitters() 中添加:
emitter.on("LayerChannel:ActiveLayerChanged", emitterOnActiveLayerChanged);

const emitterOnActiveLayerChanged = (_layerId: string) => {
    // 仅当当前 slider radio 是 layerAlpha 时才刷新
    if (commSliderRadios.value === "layerAlpha") {
        updateSliderSettings();
    }
};

// onUnmounted 中 off 掉
```

**7d. 触发事件 — useLayerChannel.ts 的 setActiveLayer() 中 emit**

在 `useLayerChannel.ts` 的 `setActiveLayer()` action 中 emit 事件:

```diff
 function setActiveLayer(layerId: Copper.LayerId): void {
     activeLayer.value = layerId;
     deps.nrrdTools.value?.setActiveLayer(layerId);
+    emitter.emit("LayerChannel:ActiveLayerChanged", layerId);
 }
```

> 需要在 `useLayerChannel.ts` 中 import emitter。

> [!IMPORTANT]
> 这个联动是整个功能**用户体验的关键**：用户切换 layer 时，slider 值必须跟着变，否则会造成困惑（slider 显示旧 layer 的值但实际操作新 layer）。

---

### 8. Exports — `index.ts`

#### [MODIFY] [index.ts](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator-failed/annotator-frontend/src/ts/index.ts)

确保没有遗漏需要的 export（`NrrdTools` 的新方法不需要额外 export，它们是实例方法）。如果 `LayerId` 类型没被导出，确保导出。

---

## 数据流总结

### Flow A: 用户拖动 Layer Alpha slider
```
用户选择 "Layer Alpha" slider radio
用户拖动 slider → OperationCtl.toggleSlider(val)
  → nrrdTools.setLayerOpacity(nrrdTools.getActiveLayer(), val)
    → LayerChannelManager.setLayerOpacity()
      → gui_states.layerChannel.layerOpacity[layerId] = val
      → reloadMasksFromVolume()
        → compositeAllLayers()
          → masterCtx.globalAlpha = layerOpacity  // per-layer alpha
          → masterCtx.drawImage(layer.canvas)

最终渲染: drawingCtx.globalAlpha (全局) × layerOpacity (per-layer)
```

### Flow B: 用户切换激活 Layer (slider 跟随刷新)
```
用户在 LayerChannelSelector 中点击 Layer 2
  → useLayerChannel.setActiveLayer("layer2")
    → activeLayer.value = "layer2"
    → nrrdTools.setActiveLayer("layer2")
    → emitter.emit("LayerChannel:ActiveLayerChanged", "layer2")
      → OperationCtl.emitterOnActiveLayerChanged()
        → if (commSliderRadios.value === "layerAlpha")
          → updateSliderSettings()  // 从 nrrdTools.getSliderMeta("layerAlpha") 获取 layer2 的 opacity
            → slider.value = layer2 的 opacity 值
```

---

## Verification Plan

### Manual Verification

1. 启动 dev server (`yarn dev`)
2. 加载一个 case 的图像
3. 在不同 layer 上画一些 mask
4. 在 slider radio 中选择 **"Layer Alpha"**
5. 拖动 slider，验证**只有当前激活 layer** 的透明度改变
6. 切换到另一个 layer，验证 slider 显示该 layer 的当前 opacity 值
7. 切换回 **"Opacity"** (globalAlpha)，验证它仍然控制所有 layer 的整体透明度
8. 验证两者的乘法关系：设 layer1 alpha=0.5, globalAlpha=0.5 → layer1 最终约 0.25 透明度

> [!IMPORTANT]  
> 由于这是 canvas 渲染的视觉效果，最可靠的验证方式是**手动在浏览器中测试**。请在实现后手动检验上述步骤。
