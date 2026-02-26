# SphereTool 重写实现计划

## 背景

当前 `SphereTool.ts` 是从 `DrawToolCore.ts` 提取出的遗留 sphere 绘图/计算器工具。它使用 `nrrd_states` 中硬编码的颜色字段（`tumourColor`, `skinColor`, `ribcageColor`, `nippleColor`）来绘制不同类型的 sphere 标记。

## 需求

1. **Channel 映射**: 每种 sphere type 默认写入 **Layer 1** 的指定 Channel

| Sphere Type | Channel | 颜色 |
|-------------|---------|------|
| tumour      | 1       | `#00ff00` (绿) |
| ribcage     | 3       | `#0000ff` (蓝) |
| skin        | 4       | `#ffff00` (黄) |
| nipple      | 5       | `#ff00ff` (品红) |

2. **专用 SphereMaskVolume**: 创建独立的 `MaskVolume` 供 SphereTool 使用，不污染 layer1 的 draw mask 数据。切换 case（重新装载 NRRD）时清空
3. **Draw 模式互斥**: Sphere 模式激活时禁止 draw（Shift 键）— ✅ 已实现 ([DrawToolCore.ts:183](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator-failed/annotator-frontend/src/ts/Utils/segmentation/DrawToolCore.ts#L183))
4. **保留 Callbacks**: `SphereCallbacks` / `getSphere` / `getCalculateSpherePositions` 保留，用于向外部输出 sphere origin 和 radius
5. **预留 MaskVolume 接口**: 虽然目前不写入 layer1 的 MaskVolume，但预留接口，方便未来扩展
6. **更新文档**: 更新 `nrrdtools-usage-guide.md` 和 `segmentation-module.md`

---

## 交互流程确认

```
[Sphere Mode 激活 (gui_states.sphere = true)]
  ├─ Shift 键被禁用（不能进入 draw 模式）
  ├─ Crosshair 键被禁用
  │
  ├─ 左键按下 (pointerdown)
  │   ├─ 记录 origin 坐标 (mouseX, mouseY, sliceIndex)
  │   ├─ 在 sphereCanvas 上绘制预览圆
  │   ├─ 移除 zoom/slice wheel 事件
  │   └─ 绑定 sphere wheel 事件
  │
  ├─ 滚动鼠标滚轮 (wheel) — 左键持续按住
  │   ├─ sphereRadius ±1, clamp [1, 50]
  │   └─ 重绘预览圆
  │
  └─ 左键松开 (pointerup)
      ├─ 触发 getSphere callback
      ├─ (Plan B) 在 x/y/z 三个轴上绘制 3D sphere
      ├─ 移除 sphere wheel 事件
      └─ 恢复 zoom/slice wheel 事件
```

---

## 专用 SphereMaskVolume 方案

> [!IMPORTANT]
> 为避免 sphere 3D 渲染数据污染 layer1 的绘画 mask，为 SphereTool 创建一个独立的 `MaskVolume`。

### 生命周期

```
在 setAllSlices() 中
  └─ 创建 sphereMaskVolume (与 CT 图像同尺寸)

切换 case / clear() 时
  └─ 清空 sphereMaskVolume (或重新创建)
```

### 存储位置

在 `nrrd_states` 或 `protectedData` 中添加 `sphereMaskVolume: MaskVolume | null` 字段

### SphereTool `drawSphereOnEachViews` 流程（改造后）

```
对每个轴 (x, y, z):
  对 decay = 0..sphereRadius:
    计算 sliceRadius = sphereRadius - decay
    将圆 (cx, cy, sliceRadius) 渲染到 sphereCanvas
    将 sphereCanvas 数据写入 sphereMaskVolume 的对应 slice
    → 未来可选：同时写入 layer1 对应 channel 的 MaskVolume
```

### 渲染

SphereMaskVolume 的数据通过 `drawingSphereCanvas` overlay 渲染，不参与 layer canvas 合成管线

---

## 修改方案

### SphereTool 组件

#### [MODIFY] [SphereTool.ts](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator-failed/annotator-frontend/src/ts/Utils/segmentation/tools/SphereTool.ts)

**1. 新增类型与常量**

```typescript
export type SphereType = 'tumour' | 'skin' | 'nipple' | 'ribcage';

/** 每种 sphere 类型默认使用的 layer 和 channel */
export const SPHERE_CHANNEL_MAP: Record<SphereType, { layer: string; channel: number }> = {
  tumour:  { layer: 'layer1', channel: 1 },
  ribcage: { layer: 'layer1', channel: 3 },
  skin:    { layer: 'layer1', channel: 4 },
  nipple:  { layer: 'layer1', channel: 5 },
};

/** 颜色映射 — 沿用当前 nrrd_states 中的常量值 */
export const SPHERE_COLORS: Record<SphereType, string> = {
  tumour:  '#00ff00',
  skin:    '#FFEB3B',
  ribcage: '#2196F3',
  nipple:  '#E91E63',
};
```

**2. 新增辅助方法**

```typescript
getChannelForSphereType(type: SphereType): number
getLayerForSphereType(type: SphereType): string
getColorForSphereType(type: SphereType): string
```

**3. 重构绘制方法** — 使用 `SPHERE_COLORS` 替代 `nrrd_states.*Color`

**4. 添加 SphereMaskVolume 接口预留** — 注释标注 `// TODO: Future - write to layer1 MaskVolume channel X`

**5. 保留 SphereCallbacks** — 用于 `drawImageOnEmptyImage` 和 `setEmptyCanvasSize`

---

#### [MODIFY] [CommToolsData.ts](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator-failed/annotator-frontend/src/ts/Utils/segmentation/CommToolsData.ts)

- 在 `nrrd_states` 中添加 `sphereMaskVolume: MaskVolume | null = null`
- 在 `setAllSlices()` 完成后初始化 `sphereMaskVolume`

---

#### [MODIFY] [NrrdTools.ts](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator-failed/annotator-frontend/src/ts/Utils/segmentation/NrrdTools.ts)

- `setAllSlices()` 中创建 `sphereMaskVolume`
- `clear()` 中清空 `sphereMaskVolume`

---

#### [MODIFY] [coreType.ts](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator-failed/annotator-frontend/src/ts/Utils/segmentation/coreTools/coreType.ts)

- `INrrdStates` 中添加 `sphereMaskVolume` 字段

---

#### [MODIFY] [index.ts](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator-failed/annotator-frontend/src/ts/Utils/segmentation/tools/index.ts)

- 新增导出 `SphereType`, `SPHERE_CHANNEL_MAP`, `SPHERE_COLORS`

---

### 文档更新

#### [MODIFY] [nrrdtools-usage-guide.md](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator-failed/plan/docs/nrrdtools-usage-guide.md)

- 在 §5.2 `draw()` 章节中扩充 `getSphereData` 和 `getCalculateSpherePositionsData` callback 的使用说明
- 新增 SphereTool 使用场景说明：channel 映射、使用边界、交互流程

#### [MODIFY] [segmentation-module.md](file:///c:/Users/lgao142/Desktop/clinial%20dashboard%20plugin%20work%202025/medical-image-annotator-failed/plan/docs/segmentation-module.md)

- §4.4 更新 `getSphere` / `getCalculateSpherePositions` callback 文档
- §7.1 更新 SphereTool 工具描述，添加 `SphereType`, `SPHERE_CHANNEL_MAP` 说明
- 新增 SphereMaskVolume 说明

---

## 验证计划

### 编译验证
```bash
cd annotator-frontend
npx tsc --noEmit
```

### 手动验证

由于 sphere/calculator 是交互式功能，需用户手动验证：

1. **基础功能**: 启动 `npm run dev`，加载 CT 数据
2. **Sphere 模式**:
   - 激活 sphere 工具
   - 确认 Shift 键**无法**进入 draw 模式
   - 左键按下 → 出现预览圆 → 滚轮调整大小 → 松开左键
   - 确认 sphere 颜色正确（绿色 = tumour）
3. **Calculator 模式**:
   - 切换 `activeSphereType` 为 tumour / skin / ribcage / nipple
   - 确认每种颜色正确
   - 确认 channel 号正确 (`getChannelForSphereType()`)
4. **Callbacks**: 确认 `getSphereData` 和 `getCalculateSpherePositionsData` 正确触发
5. **Case 切换**: 切换 case 后确认 sphere 预览和 sphereMaskVolume 被清空
6. **Draw 不受影响**: sphere 工具关闭后，draw 功能正常
