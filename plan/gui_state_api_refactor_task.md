# GUI State API Refactor — Task List

> **Plan:** [gui_state_api_refactor_plan.md](gui_state_api_refactor_plan.md)
> **Status:** Not Started
> **Estimated Duration:** 2-3 days

---

## Phase A: Add NrrdTools Public API Methods

### A1. Add `ToolMode` type and `IGuiMeta` interface
- **File:** `coreType.ts`
- **Status:** ⬜ Not Started
- **Details:**
  ```typescript
  type ToolMode = "pencil" | "brush" | "eraser" | "sphere" | "calculator";

  interface IGuiMeta {
    globalAlpha: { min: number; max: number; step: number };
    brushAndEraserSize: { min: number; max: number; step: number };
    windowHigh: { min: number; max: number; step: number };
    windowLow: { min: number; max: number; step: number };
  }
  ```
- **Export** both from `coreType.ts` and re-export from `index.ts`

### A2. Add `setMode()` and `getMode()` to NrrdTools
- **File:** `NrrdTools.ts`
- **Status:** ⬜ Not Started
- **Details:**
  - Implement `setMode(mode: ToolMode): void`
  - Move the mode-switching logic from OperationCtl.vue:260-299 into this method
  - Handle state transitions:
    - Deactivate previous mode (reset `gui_states` flags)
    - Activate new mode (set `gui_states` flags)
    - Call appropriate side-effect: `updatePencilState()`, `updateEraserState()`, `enterSphereMode()`, `exitSphereMode()`
  - Need access to gui.ts closure callbacks → store them as class properties during `setupGUI()`
  - `getMode()` returns current active mode by checking `gui_states` flags
- **Depends on:** A1, A3

### A3. Store gui.ts callbacks as class properties
- **File:** `NrrdTools.ts`
- **Status:** ⬜ Not Started
- **Details:**
  - After `setupGui()` returns `IGuiParameterSettings`, store the onChange callbacks:
    ```typescript
    private guiCallbacks: {
      updatePencilState: () => void;
      updateEraserState: () => void;
      updateBrushAndEraserSize: () => void;
      updateSphereState: () => void;
      updateCalDistance: (val: SphereType) => void;
      updateWindowHigh: (value: number) => void;
      updateWindowLow: (value: number) => void;
      finishContrastAdjustment: () => void;
    };
    ```
  - Populate from `this.guiParameterSettings` in `setupGUI()`:
    ```typescript
    this.guiCallbacks = {
      updatePencilState: this.guiParameterSettings.pencil.onChange,
      updateEraserState: this.guiParameterSettings.Eraser.onChange,
      updateBrushAndEraserSize: this.guiParameterSettings.brushAndEraserSize.onChange,
      updateSphereState: this.guiParameterSettings.sphere.onChange,
      updateCalDistance: this.guiParameterSettings.activeSphereType.onChange,
      updateWindowHigh: this.guiParameterSettings.windowHigh.onChange,
      updateWindowLow: this.guiParameterSettings.windowLow.onChange,
      finishContrastAdjustment: this.guiParameterSettings.windowHigh.onFinished,
    };
    ```
- **Depends on:** A1

### A4. Add slider methods to NrrdTools
- **File:** `NrrdTools.ts`
- **Status:** ⬜ Not Started
- **Methods:**
  - `setOpacity(value: number): void` — clamp 0.1–1, set `gui_states.globalAlpha`
  - `getOpacity(): number`
  - `setBrushSize(size: number): void` — clamp 5–50, set `gui_states.brushAndEraserSize`, call `guiCallbacks.updateBrushAndEraserSize()`
  - `getBrushSize(): number`
  - `setWindowHigh(value: number): void` — set readyToUpdate=false, call `guiCallbacks.updateWindowHigh(value)`
  - `setWindowLow(value: number): void` — set readyToUpdate=false, call `guiCallbacks.updateWindowLow(value)`
  - `finishWindowAdjustment(): void` — call `guiCallbacks.finishContrastAdjustment()`
  - `adjustContrast(type: "windowHigh" | "windowLow", delta: number): void` — for drag events, computes new value, clamps, calls setWindowHigh/setWindowLow
  - `getSliderMeta(key): { min, max, step, currentValue }` — returns metadata for UI slider rendering
- **Depends on:** A3

### A5. Extend `setActiveSphereType()` with color side-effect
- **File:** `NrrdTools.ts`
- **Status:** ⬜ Not Started
- **Details:**
  - Current implementation (NrrdTools.ts:196) only sets `gui_states.activeSphereType`
  - Add the color update logic from gui.ts `updateCalDistance()`:
    ```typescript
    setActiveSphereType(type: SphereType): void {
      this.gui_states.activeSphereType = type;
      // Color side-effect (moved from gui.ts updateCalDistance)
      const { layer, channel } = SPHERE_CHANNEL_MAP[type];
      const volume = this.getVolumeForLayer(layer);
      const color = volume
        ? rgbaToHex(volume.getChannelColor(channel))
        : (CHANNEL_HEX_COLORS[channel] || '#00ff00');
      this.gui_states.fillColor = color;
      this.gui_states.brushColor = color;
    }
    ```
- **Depends on:** None (can be done independently)

### A6. Add color methods to NrrdTools
- **File:** `NrrdTools.ts`
- **Status:** ⬜ Not Started
- **Methods:**
  - `setPencilColor(hex: string): void` — set `gui_states.color`
  - `getPencilColor(): string` — return `gui_states.color`
- **Depends on:** None

### A7. Add button action methods to NrrdTools
- **File:** `NrrdTools.ts`
- **Status:** ⬜ Not Started
- **Details:**
  - `clearActiveSlice()` — already exists at NrrdTools.ts:1291 (calls `gui_states.clear` logic)
  - `resetZoom()` — add: calls `gui_states.resetZoom()`
  - `undo()` — already exists at NrrdTools.ts:453
  - `redo()` — already exists at NrrdTools.ts:469
  - `executeAction(action: "undo" | "redo" | "clear" | "clearAll" | "resetZoom"): void` — dispatch method for button clicks
- **Depends on:** None

### A8. Add `getGuiMeta()` method
- **File:** `NrrdTools.ts`
- **Status:** ⬜ Not Started
- **Details:**
  - Returns metadata only (no callbacks, no live state refs):
    ```typescript
    getGuiMeta(): IGuiMeta {
      return {
        globalAlpha: { min: 0.1, max: 1, step: 0.01 },
        brushAndEraserSize: { min: 5, max: 50, step: 1 },
        windowHigh: {
          min: this.protectedData.mainPreSlices.volume.min,
          max: this.protectedData.mainPreSlices.volume.max,
          step: 1,
        },
        windowLow: { ... },
      };
    }
    ```
- **Depends on:** A1

### A9. Re-export new types from `index.ts`
- **File:** `src/ts/index.ts` (or wherever Copper exports are)
- **Status:** ⬜ Not Started
- **Details:**
  - Export `ToolMode`, `IGuiMeta` so Vue components can import them as `Copper.ToolMode`

---

## Phase B: Migrate Vue Components

### B1. Migrate `OperationCtl.vue` — mode switching
- **File:** `OperationCtl.vue`
- **Status:** ⬜ Not Started
- **Changes:**
  - Replace `toggleFuncRadios()` (lines 260-301):
    ```typescript
    // BEFORE: 40 lines of manual state management
    // AFTER:
    function toggleFuncRadios(val: string) {
      if (val === "calculator") {
        emitter.emit("Common:OpenCalculatorBox", "Calculator");
        emitter.emit("SegmentationTrial:CalulatorTimerFunction", "start");
        setupTumourSpherePosition();
      } else {
        emitter.emit("Common:CloseCalculatorBox", "Calculator");
      }
      nrrdTools.setMode(val as Copper.ToolMode);
    }
    ```
  - Component needs `nrrdTools` reference (already has it via `emitterOnNrrdTools`)
- **Depends on:** A2

### B2. Migrate `OperationCtl.vue` — slider controls
- **File:** `OperationCtl.vue`
- **Status:** ⬜ Not Started
- **Changes:**
  - Replace `toggleSlider()` (lines 307-323):
    ```typescript
    function toggleSlider(val: number) {
      if (commSliderRadios.value === "sensitivity") {
        contrastDragSensitivity.value = val;
        return;
      }
      const key = commSliderRadios.value;
      if (key === "globalAlpha") nrrdTools.setOpacity(val);
      else if (key === "brushAndEraserSize") nrrdTools.setBrushSize(val);
      else if (key === "windowHigh") nrrdTools.setWindowHigh(val);
      else if (key === "windowLow") nrrdTools.setWindowLow(val);
    }
    ```
  - Replace `toggleSliderFinished()` (lines 325-329):
    ```typescript
    function toggleSliderFinished(val: number) {
      if (commSliderRadios.value === "windowHigh" || commSliderRadios.value === "windowLow") {
        nrrdTools.finishWindowAdjustment();
      }
    }
    ```
  - Replace `updateSliderSettings()` (lines 331-361) to use `nrrdTools.getSliderMeta()`
  - Replace `dragToChangeImageWindow()` (lines 234-248) to use `nrrdTools.adjustContrast()`
- **Depends on:** A4

### B3. Migrate `OperationCtl.vue` — button actions
- **File:** `OperationCtl.vue`
- **Status:** ⬜ Not Started
- **Changes:**
  - Replace `onBtnClick()` (line 363-365):
    ```typescript
    // BEFORE:
    guiSettings.value.guiState[val].call();
    // AFTER:
    nrrdTools.executeAction(val as "undo" | "redo" | "clear" | "clearAll" | "resetZoom");
    ```
- **Depends on:** A7

### B4. Migrate `Calculator.vue` — sphere type
- **File:** `Calculator.vue`
- **Status:** ⬜ Not Started
- **Changes:**
  - Replace `toggleCalculatorPickerRadios()` (lines 176-190):
    ```typescript
    function toggleCalculatorPickerRadios(val: string | null) {
      if (val) {
        nrrdTools.setActiveSphereType(val as Copper.SphereType);
      }
    }
    ```
  - Replace `onBtnClick()` (lines 192-201):
    ```typescript
    function onBtnClick(val: string) {
      calculatorPickerRadios.value = "tumour";
      nrrdTools.setActiveSphereType("tumour");
      calculatorPickerRadiosDisabled.value = true;
      calculatorTimerReport("finish");
    }
    ```
  - Replace `guiSettings.value.guiState["calculator"]` reads (lines 121, 132) with `nrrdTools.isCalculatorActive()`
  - Component needs `nrrdTools` reference — add emitter handler for `Core:NrrdTools`
- **Depends on:** A5

### B5. Migrate `OperationAdvance.vue` — color picker
- **File:** `OperationAdvance.vue`
- **Status:** ⬜ Not Started
- **Changes:**
  - Replace color read (line 181):
    ```typescript
    // BEFORE:
    commColorPicker.value = guiSettings.value.guiState.color;
    // AFTER:
    commColorPicker.value = nrrdTools.value!.getPencilColor();
    ```
  - Replace color write (line 201):
    ```typescript
    // BEFORE:
    pencilColor.value = guiSettings.value.guiState.color = color;
    // AFTER:
    nrrdTools.value!.setPencilColor(color);
    pencilColor.value = color;
    ```
  - Component already has `nrrdTools` ref (line 106)
- **Depends on:** A6

### B6. Update `useCaseManagement.ts` emitter payload
- **File:** `useCaseManagement.ts`
- **Status:** ⬜ Not Started
- **Changes:**
  - `tellAllRelevantComponentsImagesLoaded()` (line 230-233):
    - Still emit `guiSettings` for backward compatibility during migration
    - After all components migrated, can simplify to emit `guiMeta` only
    - OR: Components get NrrdTools ref directly from `Core:NrrdTools` emitter (already happening)
- **Depends on:** B1-B5 all complete

---

## Phase C: Clean Up

### C1. Simplify `getGuiSettings()` return type
- **File:** `NrrdTools.ts`, `coreType.ts`
- **Status:** ⬜ Not Started
- **Details:**
  - Remove `onChange` / `onFinished` callbacks from `IGuiParameterSettings`
  - `getGuiSettings()` returns metadata only (or deprecate entirely in favor of `getGuiMeta()`)
  - Keep `guiState` read access if any component still needs it

### C2. Remove `guiSettings` refs from Vue components
- **Files:** `OperationCtl.vue`, `Calculator.vue`, `OperationAdvance.vue`
- **Status:** ⬜ Not Started
- **Details:**
  - Remove `const guiSettings = ref<any>()` declarations
  - Remove `guiSettings.value = val` in emitter handlers
  - Components should only use `nrrdTools.*` methods
  - If components need metadata (min/max/step), get it from `nrrdTools.getGuiMeta()` or `nrrdTools.getSliderMeta()`

### C3. Update `Segmentation:FinishLoadAllCaseImages` event
- **File:** `useCaseManagement.ts` + all listeners
- **Status:** ⬜ Not Started
- **Details:**
  - Change emitter payload from `{ guiState, guiSetting }` to `{ guiMeta }` or remove payload entirely
  - Components that need NrrdTools reference already get it from `Core:NrrdTools` emitter

### C4. Verify & Manual Test
- **Status:** ⬜ Not Started
- **Checklist:**
  - [ ] `yarn build` — zero new TypeScript errors
  - [ ] Mode switching: pencil → brush → eraser → sphere → calculator → pencil
  - [ ] Opacity slider: drag and verify mask transparency changes
  - [ ] Brush size slider: drag and verify brush cursor size changes
  - [ ] Window high slider: drag and verify contrast changes, release and verify repaint
  - [ ] Window low slider: same as above
  - [ ] Contrast drag: drag on image to adjust contrast
  - [ ] Sphere type: switch between tumour/skin/nipple/ribcage, verify color changes
  - [ ] Undo/redo: draw → undo → redo
  - [ ] Clear/clearAll: draw → clear slice → draw → clear all
  - [ ] Reset zoom: zoom in → reset
  - [ ] Color picker: change pencil color, verify drawing uses new color
  - [ ] dat.gui panel: if visible, controls still sync with NrrdTools methods

---

## Summary

| Phase | Tasks | Files Modified | New Lines (est.) | Removed Lines (est.) |
|-------|-------|---------------|------------------|---------------------|
| **A** | A1-A9 | NrrdTools.ts, coreType.ts, index.ts | ~150 | 0 |
| **B** | B1-B6 | OperationCtl.vue, Calculator.vue, OperationAdvance.vue, useCaseManagement.ts | ~40 | ~80 |
| **C** | C1-C4 | NrrdTools.ts, coreType.ts, all Vue components | ~5 | ~30 |
| **Total** | 19 tasks | 7 files | ~195 | ~110 |

**Net effect:** ~85 lines added, but code becomes typed, readable, and properly encapsulated.

---

**Last Updated:** 2026-02-27
