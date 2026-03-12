# Per-Layer Alpha Control — Task Checklist

## Phase 1: Backend (TypeScript)

- [x] **1.1** `types.ts` — 在 `ILayerChannelState` 接口添加 `layerOpacity: Record<string, number>`
- [x] **1.2** `GuiState.ts` — 在 constructor 初始化 `layerOpacity`（所有 layer 默认 1.0）
- [x] **1.3** `CanvasState.ts` — 同步初始化 `layerOpacity`
- [x] **1.4** `LayerChannelManager.ts` — 新增 `setLayerOpacity()`, `getLayerOpacity()`, `getLayerOpacityMap()`
- [x] **1.5** `NrrdTools.ts` — 添加代理方法 + `getSliderMeta("layerAlpha")` case

## Phase 2: Rendering

- [x] **2.1** `RenderingUtils.ts` — 修改 `compositeAllLayers()` 使用 per-layer alpha

## Phase 3: Frontend (Vue)

- [x] **3.1** `useLayerChannel.ts` — `LayerConfig` 接口新增 `defaultOpacity?` 字段
- [x] **3.2** `useLayerChannel.ts` — 新增 `layerOpacity` state（从 `LAYER_CONFIGS.defaultOpacity` 初始化）/ `activeLayerOpacity` computed / `setLayerOpacity()` action / `syncFromManager()` 内同步
- [x] **3.3** `useLayerChannel.ts` — `enableControls()` 时调用 `applyDefaultOpacities()` 推送配置到 NrrdTools
- [x] **3.4** `OperationCtl.vue` — slider radio 新增 "Layer Alpha" 选项 + `toggleSlider()` 添加 case
- [x] **3.5** `useLayerChannel.ts` — `setActiveLayer()` 中 emit `"LayerChannel:ActiveLayerChanged"` 事件
- [x] **3.6** `OperationCtl.vue` — 监听 `"LayerChannel:ActiveLayerChanged"`，当 slider radio 为 `"layerAlpha"` 时刷新 slider 值

## Phase 4: Verification

- [x] **4.1** `vue-tsc --noEmit` 类型检查通过 (exit code 0, 无新增错误)
- [ ] **4.2** 手动验证: 多 layer mask 绘制 → Layer Alpha slider 控制单层 alpha
- [ ] **4.3** 手动验证: 切换 layer 后 slider 值跟随
- [ ] **4.4** 手动验证: globalAlpha 仍然独立控制所有层
- [ ] **4.5** 手动验证: globalAlpha × layerAlpha 乘法关系正确
