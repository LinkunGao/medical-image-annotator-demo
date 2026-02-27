# GUI State API Refactor Plan

> **Status:** Planning
> **Prerequisites:** Tool Extraction Phase 1-2-3 (COMPLETED)
> **Scope:** Encapsulate gui state mutations behind NrrdTools typed methods; eliminate direct `guiSettings.guiState[key]` / `guiSetting[key].onChange()` access from Vue components
> **Estimated Duration:** 2-3 days
> **Risk:** Low — public API additions, no internal restructuring

---

## 1. Problem Statement

### 1.1 Current Architecture (Broken Abstraction)

```
Vue Component
  │
  ├─→ guiSettings.value.guiState["sphere"] = true        // 1. Raw state mutation
  ├─→ guiSettings.value.guiSetting["sphere"].onChange()   // 2. Manually trigger side-effect
  │
  └─  (two separate steps that MUST be kept in sync by the caller)
```

`getGuiSettings()` in NrrdTools.ts:155 returns **raw internal references**:
```typescript
return {
  guiState: this.gui_states,            // direct reference to IGUIStates
  guiSetting: this.guiParameterSettings // closure-bound callbacks from gui.ts
};
```

Vue components then:
1. **Mutate** `guiState[key]` via untyped string indexing — no type safety, no validation
2. **Manually call** `guiSetting[key].onChange()` — closure callbacks that were designed for `dat.gui`, not as a public API
3. **Manage state transitions themselves** — OperationCtl.vue:260-299 contains 15+ lines of mode-switching logic that should live in NrrdTools

### 1.2 Why This Is Problematic

| Issue | Example | Impact |
|-------|---------|--------|
| **Separated mutation & side-effect** | Set `guiState["sphere"]=true`, then must call `guiSetting["sphere"].onChange()` | If caller forgets step 2, app enters inconsistent state silently |
| **No type safety** | `guiSettings.value.guiState[commSliderRadios.value]` — dynamic string key | TypeScript can't catch invalid keys at build time |
| **Leaked internals** | `guiSetting["pencil"].onChange` is a closure over `configs.drawingCanvas` | UI knows about gui.ts's closure structure |
| **Duplicated logic** | Mode-switching logic repeated in OperationCtl.vue (15+ lines) | Same transitions reimplemented in every consumer |
| **Poor readability** | `guiSettings.value.guiSetting[type].value.windowHigh` | New developers can't understand the data flow |
| **Existing API unused** | `nrrdTools.setActiveSphereType()` exists but Calculator.vue doesn't use it | API was created but adoption never happened |

### 1.3 Affected Files

| File | `guiSettings` Usages | Role |
|------|---------------------|------|
| `OperationCtl.vue` | **24** usages | Mode switching, sliders, buttons |
| `Calculator.vue` | **9** usages | Sphere type selection |
| `OperationAdvance.vue` | **5** usages | Color picker |
| `useCaseManagement.ts` | **1** usage | Calls `getGuiSettings()` and emits to components |

**Total: ~39 usages** of `guiSettings.value.*` across 4 files.

---

## 2. Target Architecture

### 2.1 New Pattern

```
Vue Component
  │
  └─→ nrrdTools.setMode("eraser")    // Single typed call → NrrdTools handles state + side-effects
```

Vue components call **typed NrrdTools methods**. Each method:
1. Updates `gui_states` properties atomically
2. Triggers the appropriate side-effect (currently in `guiSetting[key].onChange()`)
3. Is strongly typed with full IDE autocomplete

### 2.2 Separation of Concerns

```
guiSettings return object:
  BEFORE: { guiState: live state, guiSetting: metadata + callbacks }
  AFTER:  { guiState: read-only snapshot, guiMeta: metadata only (min/max/step/name) }
                                            ↑ NO callbacks exposed
```

- **NrrdTools**: owns all state mutations + side-effects (the "write" path)
- **guiSettings**: provides metadata (min/max/step) + read-only state (the "read" path for UI rendering)
- **gui.ts**: remains internal — its closures are called only by NrrdTools, never by Vue

---

## 3. New NrrdTools Public API Design

### 3.1 Mode Switching

```typescript
type ToolMode = "pencil" | "brush" | "eraser" | "sphere" | "calculator";

/**
 * Switch the active drawing mode.
 * Handles all state transitions: deactivates previous mode, activates new mode,
 * updates cursor, manages event listeners.
 */
setMode(mode: ToolMode): void;

/**
 * Get the currently active mode.
 */
getMode(): ToolMode;
```

**Replaces in OperationCtl.vue (lines 260-299):**
```typescript
// BEFORE: 15+ lines of manual state management
guiSettings.value.guiState["calculator"] = true;
guiSettings.value.guiState["sphere"] = false;
// ... 10+ more lines ...
guiSettings.value.guiSetting[commFuncRadios.value].onChange();

// AFTER: one call
nrrdTools.setMode("calculator");
```

### 3.2 Slider Properties

```typescript
/** Set mask opacity (0.1 – 1.0) */
setOpacity(value: number): void;
getOpacity(): number;

/** Set brush/eraser size (5 – 50) */
setBrushSize(size: number): void;
getBrushSize(): number;

/** Set image contrast window high, with optional finish flag */
setWindowHigh(value: number): void;
finishWindowAdjustment(): void;

/** Set image contrast window low */
setWindowLow(value: number): void;

/** Get slider metadata for UI rendering */
getSliderMeta(key: "globalAlpha" | "brushAndEraserSize" | "windowHigh" | "windowLow"): {
  min: number; max: number; step: number; currentValue: number;
};
```

**Replaces in OperationCtl.vue (lines 307-328):**
```typescript
// BEFORE:
guiSettings.value.guiState[commSliderRadios.value] = val;
guiSettings.value.guiSetting[commSliderRadios.value].onChange();
// ... special cases for windowHigh/windowLow ...
guiSettings.value.guiSetting[commSliderRadios.value].onFinished();

// AFTER:
nrrdTools.setBrushSize(val);     // or setOpacity(val), setWindowHigh(val)
nrrdTools.finishWindowAdjustment();  // called on slider release
```

### 3.3 Sphere Type (Already Exists — Just Need Adoption)

```typescript
// Already exists at NrrdTools.ts:196
setActiveSphereType(type: SphereType): void;
```

**Need to add:** side-effect (color update) that currently lives in `guiSetting["activeSphereType"].onChange()`.

**Replaces in Calculator.vue (lines 176-188):**
```typescript
// BEFORE:
guiSettings.value.guiState["activeSphereType"] = "skin";
guiSettings.value.guiSetting["activeSphereType"].onChange(calculatorPickerRadios.value);

// AFTER:
nrrdTools.setActiveSphereType("skin");  // includes color update side-effect
```

### 3.4 Button Actions

```typescript
/** These already exist as gui_states methods, just need exposure */
clearActiveSlice(): void;   // gui_states.clear()
clearAllSlices(): void;     // gui_states.clearAll()
undo(): void;               // Already exists at NrrdTools.ts:453
redo(): void;               // Already exists at NrrdTools.ts:469
resetZoom(): void;          // gui_states.resetZoom()
```

**Replaces in OperationCtl.vue (line 364):**
```typescript
// BEFORE:
guiSettings.value.guiState[val].call();

// AFTER:
nrrdTools[val as "undo" | "redo" | "resetZoom"]();  // or a dispatch method
```

### 3.5 Color Properties

```typescript
/** Set pencil stroke color */
setPencilColor(hex: string): void;
getPencilColor(): string;
```

**Replaces in OperationAdvance.vue (line 201):**
```typescript
// BEFORE:
pencilColor.value = guiSettings.value.guiState.color = color;

// AFTER:
nrrdTools.setPencilColor(color);
```

### 3.6 Contrast Drag (Specialized)

```typescript
/**
 * Apply an incremental contrast adjustment (called from drag events).
 * Handles clamping and readyToUpdate flag internally.
 */
adjustContrast(type: "windowHigh" | "windowLow", delta: number): void;
```

**Replaces in OperationCtl.vue (lines 234-248):**
```typescript
// BEFORE: 15 lines of manual value calculation + clamping + onChange call

// AFTER:
nrrdTools.adjustContrast("windowHigh", step * contrastDragSensitivity.value);
```

### 3.7 Read-Only State Access (Replaces `guiState` Direct Access)

```typescript
/**
 * Get read-only snapshot of GUI state for UI rendering.
 * Returns metadata (min/max/step) for slider controls.
 */
getGuiMeta(): IGuiMeta;

/**
 * Check if a mode is active (for UI highlight).
 */
isModeActive(mode: ToolMode): boolean;

/**
 * Check if calculator mode is active.
 */
isCalculatorActive(): boolean;
```

---

## 4. Implementation Strategy

### 4.1 Approach: Additive Then Migratory

1. **Add** new methods to NrrdTools (no breaking changes)
2. **Migrate** Vue components one at a time to use new API
3. **Remove** `getGuiSettings()` callback exposure after all consumers migrated
4. **Keep** `guiState` read access for cases where components need current values

### 4.2 Internally: Move gui.ts Closure Logic Into NrrdTools

The closure functions in gui.ts (lines 229-317) need to become NrrdTools methods:

| gui.ts closure | Becomes NrrdTools method | Called by |
|----------------|------------------------|-----------|
| `updatePencilState()` | `private updatePencilState()` | `setMode()` |
| `updateGuiEraserState()` | `private updateEraserState()` | `setMode()` |
| `updateGuiBrushAndEraserSize()` | `private updateBrushCursor()` | `setBrushSize()` |
| `updateGuiSphereState()` | `enterSphereMode()` / `exitSphereMode()` | Already exist! `setMode()` |
| `updateCalDistance()` | Extend `setActiveSphereType()` | Already partially done |
| `updateGuiImageWindowHighOnChange()` | `setWindowHigh()` | New method |
| `updateGuiImageWindowLowOnChange()` | `setWindowLow()` | New method |
| `updateGuiImageContrastOnFinished()` | `finishWindowAdjustment()` | New method |

**Key insight:** `enterSphereMode()` and `exitSphereMode()` already exist in NrrdTools.ts:1357-1408. The gui.ts closure `updateGuiSphereState()` just delegates to them. So the wiring is already half done.

### 4.3 dat.gui Still Works

The `dat.gui` controllers in gui.ts (lines 52-227) bind directly to `gui_states` properties and have their own `onChange` handlers. These continue to work as-is — they call the same closure functions. The difference is that Vue components will **stop** calling those closures directly and will go through NrrdTools instead.

In the future, if `dat.gui` is removed from the UI (replaced by custom Vue controls), the closures can be removed entirely since NrrdTools methods handle everything.

---

## 5. Phase Breakdown

### Phase A: Add NrrdTools Methods (NrrdTools.ts + DrawToolCore.ts)

Add the new public API methods. Each method:
1. Updates `gui_states` properties
2. Calls the appropriate internal side-effect function
3. Is strongly typed

**Files modified:**
- `NrrdTools.ts` — add public methods
- `DrawToolCore.ts` — may need to expose some internal helpers as `protected`
- `coreType.ts` — add `ToolMode` type, `IGuiMeta` interface

### Phase B: Migrate Vue Components

Update each component to use `nrrdTools.*` methods instead of `guiSettings.value.*`:

1. **OperationCtl.vue** (24 usages → ~8 `nrrdTools.*` calls) — biggest change
2. **Calculator.vue** (9 usages → ~3 `nrrdTools.*` calls) — `setActiveSphereType()`
3. **OperationAdvance.vue** (5 usages → ~2 `nrrdTools.*` calls) — `setPencilColor()`
4. **useCaseManagement.ts** (1 usage) — may still emit `guiMeta` for slider rendering

### Phase C: Clean Up

- Simplify `getGuiSettings()` to return metadata only (remove callback exposure)
- Update `IGuiParameterSettings` type to remove `onChange` fields
- Add deprecation comment if backward compatibility needed
- Update `Segmentation:FinishLoadAllCaseImages` emitter payload

---

## 6. Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| `dat.gui` onChange and NrrdTools method both fire | Low | Medium | NrrdTools methods set state first, dat.gui reacts to same state |
| Some edge case in mode switching missed | Medium | Low | Preserve exact same if/else logic, just move it into `setMode()` |
| Components still need `guiState` for reads | Expected | None | Keep read access, only remove callback access |
| Calculator opens/closes via emitter events | None | None | Calculator still uses emitter; only sphere type setting changes |

**Overall Risk: LOW** — This is additive. New methods are added alongside existing ones. Old pattern continues to work until migration is complete. No internal restructuring needed.

---

## 7. Success Criteria

- [ ] Zero `guiSettings.value.guiSetting[...].onChange(...)` calls remain in Vue components
- [ ] Zero `guiSettings.value.guiState[...] = value` mutations remain in Vue components (read access OK)
- [ ] All mode switching goes through `nrrdTools.setMode()`
- [ ] All slider changes go through typed NrrdTools methods
- [ ] TypeScript build passes with zero new errors
- [ ] Manual testing: pencil/brush/eraser/sphere/calculator mode switching works
- [ ] Manual testing: opacity/brush size/window high/window low sliders work
- [ ] Manual testing: undo/redo/clear/resetZoom buttons work
- [ ] Manual testing: color picker works
- [ ] Manual testing: contrast drag works
- [ ] dat.gui panel still functions correctly (if visible)

---

## 8. Relationship to Overall Plan

This refactor is **not** the "Full State Management Refactor" (738 references, 6-8 weeks) that was marked as "Not Recommended" in `overall_plan.md`.

It is closer to **Option A: Facade Pattern** (1-2 days estimated in the plan), but more targeted:
- Scope: ~39 `guiSettings` usages across 4 files (not 738 state references)
- Duration: 2-3 days
- Risk: Low (additive API, no internal restructuring)
- Benefit: Eliminates the worst abstraction leak; typed API; better readability

After this refactor, `nrrd_states`, `gui_states`, and `protectedData` internal structure remains unchanged. Only the **access pattern from Vue components** changes.

---

**Last Updated:** 2026-02-27
**Owner:** Development Team
