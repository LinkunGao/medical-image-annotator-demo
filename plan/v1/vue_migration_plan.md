# Vue Components Migration Plan - Phase 7 Integration

**目标**: 将现有 Vue 组件从 NrrdTools 迁移到 SegmentationManager + StateManager

**策略**: 渐进式迁移，新旧系统并存，逐步替换，最终移除旧代码

**开始日期**: 2026-02-04
**预计完成**: TBD
**当前状态**: Step 1 已完成，待验证

---

## 迁移原则

### ✅ DO (必须遵循)

1. **渐进式迁移**: 一次迁移一个模块，确保每步都可回退
2. **新旧并存**: 在迁移完成前，NrrdTools 和 SegmentationManager 同时存在
3. **逐步验证**: 每完成一个步骤，立即测试验证
4. **保持向后兼容**: 确保迁移过程中应用始终可用
5. **记录所有更改**: 每个步骤都要有清晰的文档和注释

### ❌ DON'T (禁止操作)

1. **禁止直接删除 NrrdTools**: 在所有功能迁移完成前不要删除
2. **禁止大范围修改**: 避免一次性修改多个文件
3. **禁止跳过测试**: 每个步骤完成后必须验证
4. **禁止修改未迁移的代码**: 只修改当前步骤涉及的代码
5. **禁止移除旧的 API**: 保持旧 API 可用直到完全迁移

---

## 迁移阶段概览

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: 基础设施 (Step 1-3)                                │
│ - 创建 SegmentationManager 实例                              │
│ - 配置 RenderingAdapter 和 DimensionAdapter                  │
│ - 初始化 SegmentationManager                                 │
│                                                               │
│ 完成后: SegmentationManager 可以访问图像数据和渲染上下文     │
├─────────────────────────────────────────────────────────────┤
│ Phase 2: 数据层迁移 (Step 4-5)                              │
│ - 迁移 useMaskOperations (getMaskData/setMaskData)           │
│ - 迁移 useDistanceCalculation (sphere 相关)                  │
│                                                               │
│ 完成后: 数据保存/加载功能使用新 API                          │
├─────────────────────────────────────────────────────────────┤
│ Phase 3: 交互层迁移 (Step 6-7)                              │
│ - 迁移 useSliceNavigation                                    │
│ - 注册工具到 SegmentationManager                             │
│                                                               │
│ 完成后: 用户交互功能使用新系统                                │
├─────────────────────────────────────────────────────────────┤
│ Phase 4: UI 层迁移 (Step 8-10b)                             │
│ - 迁移 OperationCtl.vue (工具选择)                           │
│ - 迁移 Calculator.vue (计算器)                               │
│ - 迁移 OperationAdvance.vue (高级设置)                       │
│ - 🆕 新增 Layer/Channel 选择 UI                              │
│                                                               │
│ 完成后: UI 组件使用 StateManager + Layer/Channel 管理        │
├─────────────────────────────────────────────────────────────┤
│ Phase 5: 清理 (Step 11-12)                                  │
│ - 全面测试所有功能                                            │
│ - 移除 NrrdTools 相关代码                                     │
│                                                               │
│ 完成后: 完全使用新架构                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: 基础设施 (Step 1-3)

### Step 1: 创建 SegmentationManager 实例 ✅ (已完成，待验证)

**目标**: 在 LeftPanelCore.vue 中创建 SegmentationManager 实例，与 NrrdTools 并存

#### 修改的文件

| 文件 | 修改内容 | 状态 |
|------|---------|------|
| `@/ts/index.ts` | 添加 SegmentationManager 和 StateManager 导出 | ✅ 完成 |
| `@/models/ui.ts` | ILeftCoreCopperInit 接口添加 segmentationManager 字段 | ✅ 完成 |
| `LeftPanelCore.vue` | 修改导入为 `@/ts/index`，声明和创建 segmentationManager | ✅ 完成 |
| `LeftPanelController.vue` | 添加 segmentationManager ref，接收实例 | ✅ 完成 |

#### 代码变更

**@/ts/index.ts**
```typescript
// 新增导入
import {
  SegmentationManager,
  StateManager,
  type RenderingAdapter,
  type DimensionAdapter,
  type StateChangeCallback as ManagerStateChangeCallback,
  type SegmentationState,
  type GUIState,
  type StateChangeListener,
  type PartialStateUpdate,
} from "./Utils/segmentation";

// 新增导出
export {
  // ... 现有导出
  SegmentationManager,
  StateManager,
};

export type {
  // ... 现有类型导出
  RenderingAdapter,
  DimensionAdapter,
  ManagerStateChangeCallback,
  SegmentationState,
  GUIState,
  StateChangeListener,
  PartialStateUpdate,
};
```

**LeftPanelCore.vue**
```typescript
// 修改导入
import * as Copper from "@/ts/index";  // 原来是 "copper3d"

// 声明变量
let segmentationManager: Copper.SegmentationManager;

// initCopper() 中创建实例
function initCopper() {
    // ... 现有 NrrdTools 创建代码保持不变 ...

    // 新增: 创建 SegmentationManager
    segmentationManager = new Copper.SegmentationManager();
    console.log('[Phase 7 - Step 1] SegmentationManager created:', segmentationManager);

    // ... 其他代码 ...

    // 修改 emit，添加 segmentationManager
    emit("update:finishedCopperInit", {
        appRenderer,
        nrrdTools,
        segmentationManager,  // 新增
        scene,
    });
}
```

**LeftPanelController.vue**
```typescript
// 声明 ref
const segmentationManager = ref<Copper.SegmentationManager | undefined>();

// 接收实例
const onFinishedCopperInit = (copperInitData: ILeftCoreCopperInit) => {
  nrrdTools.value = copperInitData.nrrdTools;
  segmentationManager.value = copperInitData.segmentationManager;  // 新增
  console.log('[Phase 7 - Step 1] SegmentationManager received in Controller:', segmentationManager.value);
};
```

#### 验证步骤

1. ✅ 运行应用
2. ✅ 打开浏览器控制台
3. ✅ 应该看到两条日志：
   ```
   [Phase 7 - Step 1] SegmentationManager created: SegmentationManager {...}
   [Phase 7 - Step 1] SegmentationManager received in Controller: SegmentationManager {...}
   ```
4. ✅ 应用功能正常，没有错误

#### 回滚方案

如果出现问题，恢复以下文件：
- `@/ts/index.ts`
- `@/models/ui.ts`
- `LeftPanelCore.vue`
- `LeftPanelController.vue`

---

### Step 2: 配置 RenderingAdapter ⏳ (待开始)

**目标**: 配置 RenderingAdapter，让 SegmentationManager 能访问 canvas 渲染上下文

#### 背景知识

SegmentationManager 使用依赖注入模式，需要通过 RenderingAdapter 接口访问：
- `maskDisplayCanvas` - 显示掩码的 canvas
- `drawingCanvas` - 绘制工具的 canvas
- `requestRender` - 请求重新渲染的回调

#### 需要修改的文件

| 文件 | 修改内容 | 状态 |
|------|---------|------|
| `LeftPanelCore.vue` | 在 initCopper() 中配置 RenderingAdapter | ⏳ 待开始 |

#### 实现计划

**LeftPanelCore.vue - initCopper()**

1. 找到 NrrdTools 的 canvas 引用
2. 创建 RenderingAdapter 实现
3. 调用 `segmentationManager.setRenderingAdapter(adapter)`

```typescript
function initCopper() {
    // ... 现有代码 ...

    // 创建 SegmentationManager
    segmentationManager = new Copper.SegmentationManager();

    // 配置 RenderingAdapter
    segmentationManager.setRenderingAdapter({
        getMaskDisplayContext: () => {
            // 从 NrrdTools 获取 maskDisplayCanvas
            const canvas = nrrdTools.getMaskDisplayCanvas();
            return canvas?.getContext('2d') || null;
        },
        getDrawingContext: () => {
            // 从 NrrdTools 获取 drawingCanvas
            const canvas = nrrdTools.getDrawingCanvas();
            return canvas?.getContext('2d') || null;
        },
        getDrawingCanvas: () => {
            return nrrdTools.getDrawingCanvas() || null;
        },
        requestRender: () => {
            // 触发 NrrdTools 的渲染
            nrrdTools.render();
        },
    });

    console.log('[Phase 7 - Step 2] RenderingAdapter configured');

    // ... 其他代码 ...
}
```

#### 验证步骤

1. 运行应用
2. 控制台应该看到: `[Phase 7 - Step 2] RenderingAdapter configured`
3. 验证 adapter 方法能正确返回值：
   ```typescript
   // 在控制台测试
   const ctx = segmentationManager.value.getRenderingAdapter().getMaskDisplayContext();
   console.log('Context:', ctx);  // 应该返回 CanvasRenderingContext2D
   ```

#### 可能的问题

- ❌ NrrdTools 可能没有公开这些 canvas 的 getter 方法
- 解决方案: 查看 NrrdTools 源码，找到正确的访问方式

---

### Step 3: 配置 DimensionAdapter 和初始化 ⏳ (待开始)

**目标**: 配置 DimensionAdapter，并在加载图像后初始化 SegmentationManager

#### 需要修改的文件

| 文件 | 修改内容 | 状态 |
|------|---------|------|
| `LeftPanelCore.vue` | 在图像加载后配置 DimensionAdapter 和初始化 | ⏳ 待开始 |
| `LeftPanelController.vue` | 在 handleAllImagesLoaded 中初始化 SegmentationManager | ⏳ 待开始 |

#### 实现计划

DimensionAdapter 需要从 NrrdTools 获取以下信息：
- 图像尺寸 (width, height, depth)
- 体素间距 (voxelSpacing)
- 空间原点 (spaceOrigin)
- 当前切片索引
- 当前轴向 (x/y/z)
- 缩放因子
- 全局透明度

**LeftPanelController.vue - handleAllImagesLoaded()**

```typescript
const handleAllImagesLoaded = async (res: IToolAfterLoadImagesResponse) => {
  // ... 现有代码 ...

  // 配置 DimensionAdapter
  if (segmentationManager.value) {
    const nrrd = nrrdTools.value!;
    const states = nrrd.getNrrdToolsSettings();

    segmentationManager.value.setDimensionAdapter({
      getDimensions: () => [
        states.nrrd_x_pixel,
        states.nrrd_y_pixel,
        states.nrrd_z_num,
      ],
      getVoxelSpacing: () => states.voxelSpacing,
      getSpaceOrigin: () => states.spaceOrigin,
      getCurrentSliceIndex: () => states.currentSliceIndex,
      getCurrentAxis: () => states.axis,
      getSizeFactor: () => states.sizeFactor,
      getGlobalAlpha: () => states.globalAlpha,
    });

    // 初始化 SegmentationManager
    segmentationManager.value.initialize({
      width: states.nrrd_x_pixel,
      height: states.nrrd_y_pixel,
      depth: states.nrrd_z_num,
    });

    console.log('[Phase 7 - Step 3] SegmentationManager initialized with dimensions:', {
      width: states.nrrd_x_pixel,
      height: states.nrrd_y_pixel,
      depth: states.nrrd_z_num,
    });
  }

  // ... 其他代码 ...
};
```

#### 验证步骤

1. 运行应用，加载一个病例
2. 控制台应该看到初始化日志
3. 验证 SegmentationManager 已初始化：
   ```typescript
   console.log('Initialized:', segmentationManager.value.isInitialized());  // 应该是 true
   console.log('Dimensions:', segmentationManager.value.getDimensions());  // 应该返回 [width, height, depth]
   ```

---

## Phase 2: 数据层迁移 (Step 4-5)

### Step 4: 迁移 useMaskOperations ⏳ (待开始)

**目标**: 更新 useMaskOperations.ts，使用 SegmentationManager 的 API

#### 当前 API vs 新 API

| 功能 | 旧 API (NrrdTools) | 新 API (SegmentationManager) |
|------|-------------------|------------------------------|
| 获取掩码数据 | `nrrdTools.getMaskData()` | `segmentationManager.getMaskData()` |
| 设置掩码数据 | `nrrdTools.setMasksData(data)` | `segmentationManager.setMasksData(data)` |
| 数据格式 | `{ paintImagesLabel1/2/3 }` | `{ layer1/2/3 }` |

#### 需要修改的文件

| 文件 | 修改内容 | 状态 |
|------|---------|------|
| `composables/left-panel/useMaskOperations.ts` | 添加 segmentationManager 参数，更新 API 调用 | ⏳ 待开始 |
| `LeftPanelController.vue` | 传递 segmentationManager 到 useMaskOperations | ⏳ 待开始 |

#### 实现计划

详细步骤见 Step 4 单独文档。

---

### Step 5: 迁移 useDistanceCalculation ⏳ (待开始)

**目标**: 更新 useDistanceCalculation.ts，使用 SegmentationManager

详细步骤待补充。

---

## Phase 3: 交互层迁移 (Step 6-7)

### Step 6: 迁移 useSliceNavigation ⏳ (待开始)

**目标**: 更新 useSliceNavigation.ts

详细步骤待补充。

---

### Step 7: 注册工具 ⏳ (待开始)

**目标**: 将所有工具注册到 SegmentationManager

详细步骤待补充。

---

## Phase 4: UI 层迁移 (Step 8-10)

### Step 8: 迁移 OperationCtl.vue ⏳ (待开始)

**目标**: 使用 StateManager 替代 guiSettings

详细步骤待补充。

---

### Step 9: 迁移 Calculator.vue ⏳ (待开始)

详细步骤待补充。

---

### Step 10: 迁移 OperationAdvance.vue ⏳ (待开始)

详细步骤待补充。

---

### Step 10b: 新增 Layer/Channel 选择 UI 🆕 (待开始)

**目标**: 在 Function Controller 下方新增 UI，支持 Layer/Channel 选择、可见性控制、绘制联动

**类型**: ✨ 新功能（利用新架构的 VisibilityManager + LayerManager）

#### 架构关系

```
Layer (容器，不带颜色)
├── Channel 0 (独立颜色)
├── Channel 1 (独立颜色)
├── Channel 2 (独立颜色)
├── ...
└── Channel 8 (独立颜色)
```

- Layer 是 Channel 的容器，本身不带颜色
- 每个 Channel 有独立的颜色标识
- 旧系统 label1(绿)/label2(红)/label3(蓝) 对应新架构中同一 Layer 下的不同 Channel

#### 功能需求

1. **Layer 选择**
   - 选择当前激活的 layer (layer1/layer2/layer3)
   - 每个 layer 支持显示/隐藏切换（控制该 layer 下所有 channel）

2. **Channel 选择**
   - 选择当前激活的 channel (0-8)
   - 每个 channel 有独立颜色标识
   - 每个 channel 支持显示/隐藏切换
   - 选择 channel 后，pencil/brush/eraser 绘制到该 layer 的该 channel

3. **可见性控制**
   - Layer 级别: `visibilityManager.setLayerVisible(layerId, visible)`
   - Channel 级别: `visibilityManager.setChannelVisible(layerId, channel, visible)`
   - 订阅变化回调: `visibilityManager.onChange(callback)`

4. **编辑联动**
   - 选择 layer + channel → 更新绘制工具的目标
   - 与 StateManager 同步当前激活的 layer/channel

#### 实现方案 (待细化)

- **新增组件**: `LayerChannelSelector.vue`
- **新增 Composable**: `useLayerChannel.ts`
- **集成位置**: `OperationCtl.vue` → `#FunctionalControl` 下方或新增 slot
- **UI 形式**: Layer 用 tab/radio, Channel 用网格按钮, 可见性用眼睛图标

---

## Phase 5: 清理 (Step 11-12)

### Step 11: 全面测试 ⏳ (待开始)

**测试清单**:
- [ ] 图像加载
- [ ] 切片导航
- [ ] 工具切换 (pencil, brush, eraser, sphere, etc.)
- [ ] 绘制功能
- [ ] Undo/Redo
- [ ] 掩码保存/加载
- [ ] 距离计算
- [ ] 对比度调整
- [ ] 缩放和平移

---

### Step 12: 移除 NrrdTools ⏳ (待开始)

**前提条件**: 所有功能测试通过

**移除的文件/代码**:
- LeftPanelCore.vue 中的 NrrdTools 创建代码
- LeftPanelController.vue 中的 nrrdTools ref
- 所有 composables 中的 nrrdTools 参数

---

## 风险评估

### 高风险区域

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| NrrdTools 和 SegmentationManager 数据不同步 | 高 | 每步验证数据一致性 |
| Canvas 引用错误 | 中 | 仔细测试渲染功能 |
| 性能问题 | 中 | 监控性能指标 |
| 类型不匹配 | 低 | TypeScript 检查 |

### 回滚策略

每个 Step 完成后：
1. Git commit 保存当前状态
2. 如果出现严重问题，立即 `git revert`
3. 分析问题，修复后重新开始

---

## 进度跟踪

| Phase | Steps | 完成数 | 进度 |
|-------|-------|--------|------|
| Phase 1: 基础设施 | 3 | 1 (待验证) | 33% |
| Phase 2: 数据层 | 2 | 0 | 0% |
| Phase 3: 交互层 | 2 | 0 | 0% |
| Phase 4: UI 层 | 4 | 0 | 0% |
| Phase 5: 清理 | 2 | 0 | 0% |
| **总计** | **13** | **1** | **8%** |

---

## 下一步行动

**当前**: Step 1 完成，等待用户验证

**验证 Step 1 后**:
1. 阅读 Step 2 详细计划
2. 查看 NrrdTools 源码，确认 canvas 访问方式
3. 实施 Step 2
4. 验证 Step 2

---

## 附录

### NrrdTools API 参考

需要查看 NrrdTools 源码，列出所有需要的 API：
- [ ] getMaskDisplayCanvas()
- [ ] getDrawingCanvas()
- [ ] getNrrdToolsSettings()
- [ ] render()
- [ ] getMaskData()
- [ ] setMasksData()

### SegmentationManager API 参考

参考 Phase_7_Report.md 中的完整 API 列表。

---

**文档版本**: v1.0
**最后更新**: 2026-02-04
**维护者**: AI Assistant + User
