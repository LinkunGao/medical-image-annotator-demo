# Issue 2: Event Lifecycle Refactor — Task List

> **Status:** ✅ Done
> **Plan:** [issue2_event_lifecycle_plan.md](issue2_event_lifecycle_plan.md)
> **Files:** `DrawToolCore.ts`, `EventRouter.ts`

---

## Phase 1 — 注册 pointerMove / pointerUp / pointerLeave handler

### 1.1 提取 pointerleave 逻辑为独立方法
- [ ] 在 DrawToolCore 中新增 `private handlePointerLeave(): void`
- [ ] 将 `paintOnCanvas()` L496-518 的 pointerleave 闭包内容移入该方法
- [ ] **不保留**内部的 `removeEventListener` 调用（pointermove 和 wheel 将由 EventRouter 永久路由）
- [ ] 在 `wasDrawing` 分支中添加 `this.activeWheelMode = 'zoom'`（替代原 removeEventListener sphere wheel）

### 1.2 在 initDrawToolCore() 注册三个 handler
- [ ] 在 `this.eventRouter.bindAll()` 调用**之前**添加：
  - `this.eventRouter.setPointerMoveHandler(...)` → 调用 `handleOnDrawingMouseMove`
  - `this.eventRouter.setPointerUpHandler(...)` → 调用 `handleOnDrawingMouseUp`
  - `this.eventRouter.setPointerLeaveHandler(...)` → 调用 `this.handlePointerLeave()`

### 1.3 同时删除旧 pointerleave 监听器
- [ ] 删除 `paintOnCanvas()` L496-518 的 `canvas.addEventListener("pointerleave", () => { ... })` 块（必须与 1.1/1.2 在同一 commit，否则每次 `draw()` 调用会累积的匿名闭包监听器，造成内存泄漏）

### 1.4 编译检查
- [ ] `npx tsc --noEmit` — 无新增错误

---

## Phase 2 — 引入 Wheel 派发器

### 2.1 新增 activeWheelMode 字段
- [ ] 在 DrawToolCore 类顶部添加 `private activeWheelMode: 'zoom' | 'sphere' | 'none' = 'zoom'`

### 2.2 注册 EventRouter wheel handler
- [ ] 在 `initDrawToolCore()` 中（与 Phase 1 同位置）调用 `this.eventRouter.setWheelHandler(...)` 实现派发逻辑：
  - `'zoom'` → `drawingPrameters.handleMouseZoomSliceWheel`
  - `'sphere'` → `drawingPrameters.handleSphereWheel`
  - `'none'` → 不转发

### 2.3 重构 zoomActionAfterDrawSphere()
- [ ] 将方法内的 `canvas.addEventListener("wheel", ...)` 替换为 `this.activeWheelMode = 'zoom'`
- [ ] 删除该方法内的 DOM 操作（保留方法本身供 SphereTool callback 调用）

### 2.4 编译检查
- [ ] `npx tsc --noEmit` — 无新增错误

---

## Phase 3 — 清理 paintOnCanvas() 中的手动 add/remove

### 3.1 清理初始 wheel 注册（L324-343）
- [ ] 删除 `canvas.removeEventListener("wheel", handleMouseZoomSliceWheel)`（L325-328）
- [ ] 删除 `canvas.addEventListener("wheel", ..., { passive: false })`（L337-343）
- [ ] 保留 `drawingPrameters.handleMouseZoomSliceWheel` 的赋值（L330-334）
- [ ] 在赋值后调用 `this.eventRouter.setWheelHandler(...)` 更新 handler 引用（或确认派发器已正确引用）

### 3.2 清理 handleOnDrawingMouseDown 内的手动 add
- [ ] 删除 L380-387（draw 模式：手动 add `pointerup` + `pointermove`）
- [ ] 删除 L395-399（crosshair 模式：手动 add `pointerup`）
- [ ] 删除 L406-409（右键 pan：手动 add `pointerup`）
- [ ] 替换 L372-375（remove zoom wheel）→ `this.activeWheelMode = 'none'`

### 3.3 清理 handleOnDrawingMouseUp 内的手动 add/remove
- [ ] 删除 L435-438（remove `pointermove`）
- [ ] 替换 L441-447（add zoom wheel）→ `this.activeWheelMode = 'zoom'`
- [ ] 删除 L456-460（remove sphere wheel）
- [ ] 替换 L462-465（add zoom wheel，sphere 结束）→ `this.activeWheelMode = 'zoom'`
- [ ] 删除 L466-469（remove `pointerup`）
- [ ] 替换 L475-478（add zoom wheel，crosshair+sphere 结束）→ `this.activeWheelMode = 'zoom'`
- [ ] 删除 L479-483（remove `pointerup`）

### 3.4 清理 handleSphereClick 内的手动 add/remove
- [ ] 替换 L584-587（remove zoom wheel）→ `this.activeWheelMode = 'sphere'`
- [ ] 删除 L593-596（手动 add sphere wheel）
- [ ] 删除 L597-601（手动 add `pointerup`）

### 3.5 编译检查
- [ ] `npx tsc --noEmit` — 无新增错误

---

## Phase 4 — 删除 Legacy Fallback + 类型修正

- [ ] 删除 `paintOnCanvas()` L416-427 中的 `else` 分支（无 EventRouter 时的旧 pointerdown 注册）
- [ ] 将 `if (this.eventRouter)` 守卫改为直接调用（eventRouter 构造时必须存在）
- [ ] 修改字段声明（L54）：`protected eventRouter: EventRouter | null = null` → `protected eventRouter!: EventRouter`
- [ ] 移除代码中所有 `this.eventRouter?.` 可选链调用，改为 `this.eventRouter.`
- [ ] `npx tsc --noEmit` — 无新增错误

---

## Phase 5 — 验证

### 5.1 编译
- [ ] `npx tsc --noEmit` — 零错误，零警告新增

### 5.2 功能测试
- [ ] Pencil 绘制：正常，pointerUp 结束
- [ ] Brush 绘制：正常，pointerUp 结束
- [ ] Eraser 绘制：正常，pointerUp 结束
- [ ] 绘制中 wheel：不触发 zoom / scroll
- [ ] 绘制结束后 wheel：触发 zoom 或 slice scroll
- [ ] 右键 Pan：正常拖拽，pointerUp 结束
- [ ] Crosshair 点击：十字准线更新，不触发绘制
- [ ] Sphere 点击：sphere wheel 激活
- [ ] Sphere mouseUp：zoom wheel 恢复，sphere wheel 停止
- [ ] Pointer 离开 canvas：绘制中断，cursor 恢复
- [ ] 快速连续点击（10 次）：无重复 handler 触发，无泄漏
- [ ] Ctrl+Z / Ctrl+Y：Undo / Redo 正常

### 5.3 内存泄漏检查（Chrome DevTools）
- [ ] 打开 DevTools → Elements → Event Listeners 面板，选中 drawingCanvas
- [ ] 确认 `pointermove` 监听器数量 = 1（来自 EventRouter）
- [ ] 确认 `pointerup` 监听器数量 = 1（来自 EventRouter）
- [ ] 确认 `wheel` 监听器数量 = 1（来自 EventRouter）
- [ ] 执行一次完整绘制 → 确认数量不变
- [ ] 执行一次 sphere 操作 → 确认数量不变
