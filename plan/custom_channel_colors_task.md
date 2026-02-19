# Custom Channel Colors Task

## Overview

支持用户通过 NrrdTools 导出接口自定义每个 layer 中 channel 的颜色。

> **Status:** Not Started
> **Priority:** Medium
> **Depends on:** Phase 3 MaskVolume migration (completed)

---

## 背景与现状

### 已有基础

- `MaskVolume` 已实现 `setChannelColor(channel, RGBAColor)` 和 `getChannelColor(channel)` 方法
- `MASK_CHANNEL_COLORS` 定义了默认颜色映射（channel 0-8）
- `CHANNEL_HEX_COLORS` 定义了对应的 HEX 颜色字符串
- `NrrdTools` 已导出 visibility 控制接口：`setLayerVisible()`, `setChannelVisible()`, `getLayerVisibility()`, `getChannelVisibility()`
- 每个 layer 的 MaskVolume 独立存储在 `protectedData.maskData.volumes.layer1/layer2/layer3`

### 当前缺失

- NrrdTools 没有导出 channel 颜色设置接口
- 用户无法通过外部 API 自定义 channel 颜色
- 修改颜色后需要触发重新渲染，但没有对应的流程
- `EraserTool` 使用 `MASK_CHANNEL_COLORS` 常量匹配颜色，自定义颜色后需要同步
- GUI 中的颜色显示（`CHANNEL_HEX_COLORS`）也需要同步更新

---

## Task 1: NrrdTools 导出 setChannelColor 接口

- [ ] 在 `NrrdTools` 中新增 `setChannelColor(layerId: LayerId, channel: ChannelValue, color: RGBAColor): void`
  - 调用对应 layer 的 `MaskVolume.setChannelColor(channel, color)`
  - 修改后调用 `reloadMasksFromVolume()` 触发重新渲染
- [ ] 在 `NrrdTools` 中新增 `getChannelColor(layerId: LayerId, channel: ChannelValue): RGBAColor`
  - 调用对应 layer 的 `MaskVolume.getChannelColor(channel)` 并返回

**完成标准**: 外部可通过 `nrrdTools.setChannelColor('layer1', 1, { r: 255, g: 0, b: 0, a: 153 })` 设置颜色并立即看到渲染更新

---

## Task 2: 批量设置颜色接口

- [ ] 新增 `setChannelColors(layerId: LayerId, colorMap: Partial<ChannelColorMap>): void`
  - 一次性设置多个 channel 的颜色
  - 只调用一次 `reloadMasksFromVolume()`（避免多次重渲染）
- [ ] 新增 `setAllLayersChannelColor(channel: ChannelValue, color: RGBAColor): void`
  - 同时设置所有 layer 的同一个 channel 颜色（常见场景：所有 layer 共享配色方案）
  - 一次 `reloadMasksFromVolume()`

**完成标准**: 批量更新颜色时只触发一次渲染

---

## Task 3: 重置颜色接口

- [ ] 新增 `resetChannelColors(layerId?: LayerId): void`
  - 无参数：重置所有 layer 的颜色为 `MASK_CHANNEL_COLORS` 默认值
  - 指定 layerId：只重置该 layer 的颜色
  - 调用 `reloadMasksFromVolume()` 重新渲染

**完成标准**: 调用后颜色恢复为默认配色方案

---

## Task 4: EraserTool 颜色同步

- [ ] 修改 `EraserTool` 中的颜色匹配逻辑
  - 当前使用 `MASK_CHANNEL_COLORS[activeChannel]` 常量
  - 改为从当前 layer 的 MaskVolume 获取颜色：`volume.getChannelColor(activeChannel)`
  - 确保自定义颜色后，橡皮擦仍能正确匹配并擦除对应 channel 的像素

**完成标准**: 自定义颜色后橡皮擦仍能正确工作

---

## Task 5: GUI 颜色同步

- [ ] 修改 `gui.ts` 中的画笔颜色显示
  - 当前使用 `CHANNEL_HEX_COLORS[activeChannel]` 常量
  - 改为从 MaskVolume 动态获取当前颜色
- [ ] 修改 `NrrdTools` 中 `getActiveChannelHexColor()` 和 `getChannelHexColor()` 方法
  - 从 MaskVolume 获取 RGBAColor 并转换为 HEX 字符串
  - 而非从 `CHANNEL_HEX_COLORS` 常量获取

**完成标准**: GUI 显示的画笔颜色与自定义颜色一致

---

## Task 6: 颜色变更事件通知

- [ ] 新增回调 `onChannelColorChanged?: (layerId: LayerId, channel: ChannelValue, color: RGBAColor) => void`
  - 在 `INrrdStates` 或 `IDrawOpts` 中定义
  - `setChannelColor` 调用后触发
  - 通知外部（如 Vue 组件）颜色已变更，以更新 UI

**完成标准**: 外部可监听颜色变更事件并做出响应

---

## 文件影响范围

| 文件 | 变更内容 |
|------|----------|
| `NrrdTools.ts` | 新增 setChannelColor / getChannelColor / setChannelColors / resetChannelColors 接口 |
| `DrawToolCore.ts` | 可能需要传递 volume 引用给 EraserTool |
| `EraserTool.ts` | 颜色匹配从常量改为动态获取 |
| `gui.ts` | 画笔颜色显示从常量改为动态获取 |
| `coreType.ts` | 新增 onChannelColorChanged 回调类型 |

---

## 依赖关系

```
Task 1 (基础接口) ← 其他 task 依赖
Task 2 (批量接口) ← 依赖 Task 1
Task 3 (重置接口) ← 依赖 Task 1
Task 4 (EraserTool) ← 独立，但需要 Task 1 的颜色变更生效
Task 5 (GUI 同步) ← 依赖 Task 1
Task 6 (事件通知) ← 独立
```

**建议执行顺序**: Task 1 → Task 2 + Task 3 → Task 4 + Task 5 → Task 6

---

## API 汇总

```typescript
// NrrdTools 新增公开方法
class NrrdTools {
  // 单个 channel 颜色
  setChannelColor(layerId: LayerId, channel: ChannelValue, color: RGBAColor): void;
  getChannelColor(layerId: LayerId, channel: ChannelValue): RGBAColor;

  // 批量设置
  setChannelColors(layerId: LayerId, colorMap: Partial<ChannelColorMap>): void;
  setAllLayersChannelColor(channel: ChannelValue, color: RGBAColor): void;

  // 重置
  resetChannelColors(layerId?: LayerId): void;
}
```
