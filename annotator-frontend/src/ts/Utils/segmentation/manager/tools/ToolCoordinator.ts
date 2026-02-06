/**
 * ToolCoordinator - Centralized Tool Mutual-Exclusion & Event Routing
 *
 * Phase 6 - Tool Coordination
 *
 * Replaces the scattered boolean flags (Is_Shift_Pressed, Is_Ctrl_Pressed,
 * enableCursorChoose, gui_states.sphere, etc.) across 3 different objects
 * in the old DrawToolCore with a single centralized state machine.
 *
 * Two-level mode system:
 *   Level 1: GUI Tool Selection (persistent, set from UI buttons)
 *            pencil | brush | eraser | sphere | calculator
 *   Level 2: Interaction State (temporary modifiers + toggles)
 *            crosshairEnabled, shiftHeld, ctrlHeld, leftButtonDown, rightButtonDown
 *
 * canUse(interaction) returns whether a given interaction is allowed
 * in the current state combination. See implementation_plan.md for
 * the full mutual-exclusion matrix.
 */

import type { BaseTool, ToolContext } from './BaseTool';
import type { Delta } from '../core/types';

// ===== GUI Tool Selection (Level 1) =====

/** GUI tool selection set from UI buttons */
export type GuiTool = 'pencil' | 'brush' | 'eraser' | 'sphere' | 'calculator';

/** Drawing tool subset */
const DRAWING_TOOLS: ReadonlySet<GuiTool> = new Set(['pencil', 'brush', 'eraser']);

// ===== Interaction Types =====

/** All possible interaction types that can be checked for permission */
export type InteractionType =
    | 'draw'            // Pencil/Brush/Eraser (Shift + left-drag)
    | 'pan'             // Right-click drag
    | 'zoom'            // Mouse wheel zoom
    | 'sliceChange'     // Left-click drag or wheel slice change
    | 'arrowSlice'      // Arrow ↑/↓ keyboard slice change (most permissive)
    | 'crosshairClick'  // Crosshair left-click
    | 'crosshairToggle' // S key to toggle crosshair
    | 'contrast'        // Ctrl + left-drag
    | 'spherePlace'     // Sphere left-click
    | 'sphereWheel'     // Sphere wheel (radius adjust)
    | 'calcPlace'       // Calculator left-click
    | 'undoRedo';       // Ctrl+Z / Ctrl+Y

// ===== Callbacks =====

/** State change callback - notifies UI of allowed interaction changes */
export type StateChangeCallback = (
    allowed: Set<InteractionType>,
    guiTool: GuiTool,
    crosshairEnabled: boolean
) => void;

/** Arrow slice callback - external handler for slice navigation */
export type ArrowSliceCallback = (direction: 'up' | 'down') => void;

/** Slice change via left-drag callback */
export type DragSliceCallback = (e: PointerEvent) => void;

// ===== ToolCoordinator =====

export class ToolCoordinator {
    // === Level 1: GUI Tool ===
    private guiTool: GuiTool = 'pencil';

    // === Level 2: Interaction State ===
    private crosshairEnabled: boolean = false;
    private shiftHeld: boolean = false;
    private ctrlHeld: boolean = false;
    private leftButtonDown: boolean = false;
    private rightButtonDown: boolean = false;

    // === Tool Instances ===
    private tools: Map<string, BaseTool> = new Map();

    // === Callbacks ===
    onStateChange?: StateChangeCallback;
    onArrowSlice?: ArrowSliceCallback;
    onDragSlice?: DragSliceCallback;

    // ===== Configuration =====

    /**
     * Set the GUI tool selection (Level 1).
     * Resets Level 2 state and calls deactivate/activate on tools.
     */
    setGuiTool(tool: GuiTool): void {
        if (tool === this.guiTool) return;

        const prevTool = this.guiTool;
        const prevIsDrawing = DRAWING_TOOLS.has(prevTool);
        const nextIsDrawing = DRAWING_TOOLS.has(tool);

        // Switching between drawing tools preserves crosshair state
        // Switching to sphere/calculator resets everything
        if (prevIsDrawing && nextIsDrawing) {
            // Drawing tool ↔ Drawing tool: just swap, keep Level 2 state
            this.guiTool = tool;
            this.notifyStateChange();
            return;
        }

        // Reset Level 2 state on major tool change
        this.crosshairEnabled = false;
        this.shiftHeld = false;
        this.ctrlHeld = false;

        // Deactivate tools related to previous guiTool
        this.deactivateCurrentTool(prevTool);

        this.guiTool = tool;

        // Activate tools related to new guiTool
        this.activateCurrentTool(tool);

        this.notifyStateChange();
    }

    /**
     * Get the current GUI tool selection.
     */
    getGuiTool(): GuiTool {
        return this.guiTool;
    }

    // ===== State Queries =====

    /**
     * Check whether a specific interaction is currently allowed.
     * This is the core mutual-exclusion logic.
     */
    canUse(interaction: InteractionType): boolean {
        const isDrawingTool = DRAWING_TOOLS.has(this.guiTool);

        // ===== arrowSlice: most permissive — only 2 blockers =====
        if (interaction === 'arrowSlice') {
            if (this.shiftHeld) return false;
            if (this.guiTool === 'sphere' && this.leftButtonDown) return false;
            return true;
        }

        // ===== Crosshair ON: most restrictive mode =====
        if (this.crosshairEnabled) {
            if (interaction === 'crosshairToggle') return true;  // S key to disable
            if (interaction === 'undoRedo') return !this.leftButtonDown;
            if (interaction === 'crosshairClick') return true;
            if (interaction === 'pan') return this.rightButtonDown;
            return false;  // Everything else blocked
        }

        // ===== Sphere / Calculator modes =====
        if (this.guiTool === 'sphere' || this.guiTool === 'calculator') {
            // Permanently blocked: draw, crosshair, contrast
            if (
                interaction === 'draw' ||
                interaction === 'crosshairClick' ||
                interaction === 'crosshairToggle' ||
                interaction === 'contrast'
            ) {
                return false;
            }

            if (this.leftButtonDown) {
                // Left button down: only allow tool-specific operations
                if (this.guiTool === 'sphere') {
                    return interaction === 'spherePlace' || interaction === 'sphereWheel';
                }
                return interaction === 'calcPlace';
            }

            // Left button up: allow navigation interactions
            if (this.rightButtonDown) {
                return interaction === 'pan';
            }

            return (
                interaction === 'zoom' ||
                interaction === 'sliceChange' ||
                interaction === 'pan' ||
                interaction === 'undoRedo' ||
                interaction === 'spherePlace' ||
                interaction === 'sphereWheel' ||
                interaction === 'calcPlace'
            );
        }

        // ===== Drawing Tools mode =====
        if (isDrawingTool) {
            // Shift held: only drawing allowed
            if (this.shiftHeld) {
                return interaction === 'draw';
            }

            // Ctrl held: contrast + undoRedo
            if (this.ctrlHeld) {
                if (interaction === 'contrast') return true;
                if (interaction === 'undoRedo') return true;
                return false;
            }

            // Right button down: only pan
            if (this.rightButtonDown) {
                return interaction === 'pan';
            }

            // Left button down (no shift/ctrl): slice change drag
            if (this.leftButtonDown) {
                return interaction === 'sliceChange';
            }

            // Idle state: most interactions open
            return (
                interaction === 'zoom' ||
                interaction === 'sliceChange' ||
                interaction === 'crosshairToggle' ||
                interaction === 'undoRedo' ||
                interaction === 'pan'
            );
        }

        return false;
    }

    /**
     * Get the full set of currently allowed interactions.
     */
    getAllowed(): Set<InteractionType> {
        const allTypes: InteractionType[] = [
            'draw', 'pan', 'zoom', 'sliceChange', 'arrowSlice',
            'crosshairClick', 'crosshairToggle', 'contrast',
            'spherePlace', 'sphereWheel', 'calcPlace', 'undoRedo',
        ];

        const allowed = new Set<InteractionType>();
        for (const t of allTypes) {
            if (this.canUse(t)) {
                allowed.add(t);
            }
        }
        return allowed;
    }

    /**
     * Check if crosshair mode is enabled.
     */
    isCrosshairEnabled(): boolean {
        return this.crosshairEnabled;
    }

    /**
     * Check if currently in active drawing state (shift + left button).
     */
    isDrawing(): boolean {
        return this.shiftHeld && this.leftButtonDown && DRAWING_TOOLS.has(this.guiTool);
    }

    /**
     * Check if shift is held.
     */
    isShiftHeld(): boolean {
        return this.shiftHeld;
    }

    /**
     * Check if ctrl is held.
     */
    isCtrlHeld(): boolean {
        return this.ctrlHeld;
    }

    /**
     * Check if left mouse button is down.
     */
    isLeftButtonDown(): boolean {
        return this.leftButtonDown;
    }

    /**
     * Check if right mouse button is down.
     */
    isRightButtonDown(): boolean {
        return this.rightButtonDown;
    }

    // ===== Input State Updates =====

    /**
     * Update shift key state.
     * Ignored when crosshair is ON or in sphere/calculator mode.
     */
    onShiftChange(pressed: boolean): void {
        if (this.crosshairEnabled) return;
        if (!DRAWING_TOOLS.has(this.guiTool)) return;
        if (this.ctrlHeld) return;

        const prev = this.shiftHeld;
        this.shiftHeld = pressed;

        if (prev !== pressed) {
            // Shift release: if we were drawing, trigger pointer-up settlement
            if (!pressed && this.leftButtonDown) {
                this.settleDrawing();
            }
            this.notifyStateChange();
        }
    }

    /**
     * Update ctrl key state.
     * Ignored when crosshair is ON, shift is held, or in sphere/calculator mode.
     */
    onCtrlChange(pressed: boolean): void {
        if (this.crosshairEnabled) return;
        if (!DRAWING_TOOLS.has(this.guiTool)) return;
        if (this.shiftHeld) return;

        const prev = this.ctrlHeld;
        this.ctrlHeld = pressed;

        if (prev !== pressed) {
            this.notifyStateChange();
        }
    }

    /**
     * Update left mouse button state.
     */
    onLeftButtonChange(pressed: boolean): void {
        this.leftButtonDown = pressed;
        this.notifyStateChange();
    }

    /**
     * Update right mouse button state.
     */
    onRightButtonChange(pressed: boolean): void {
        this.rightButtonDown = pressed;
        this.notifyStateChange();
    }

    /**
     * Toggle crosshair mode (S key).
     * Only allowed when: guiTool is drawing tool, shift/ctrl not held.
     */
    onCrosshairToggle(): void {
        if (!DRAWING_TOOLS.has(this.guiTool)) return;
        if (this.shiftHeld || this.ctrlHeld) return;

        this.crosshairEnabled = !this.crosshairEnabled;

        // Disable crosshair: notify crosshair tool
        const crosshairTool = this.tools.get('crosshair');
        if (crosshairTool && 'toggle' in crosshairTool) {
            (crosshairTool as any).toggle();
        }

        this.notifyStateChange();
    }

    // ===== Event Dispatch =====

    /**
     * Dispatch a pointer-down event to the appropriate tool.
     * Routes based on current state (crosshair, shift, ctrl, guiTool).
     */
    dispatchPointerDown(e: PointerEvent): Delta[] {
        // Right-click: always pan
        if (e.button === 2) {
            this.rightButtonDown = true;
            if (this.canUse('pan')) {
                const panTool = this.tools.get('pan');
                if (panTool) return panTool.onPointerDown(e);
            }
            return [];
        }

        // Left-click
        if (e.button === 0) {
            this.leftButtonDown = true;
            this.notifyStateChange();

            // Crosshair click
            if (this.crosshairEnabled && this.canUse('crosshairClick')) {
                const crosshairTool = this.tools.get('crosshair');
                if (crosshairTool) return crosshairTool.onPointerDown(e);
                return [];
            }

            // Drawing (Shift + left)
            if (this.shiftHeld && DRAWING_TOOLS.has(this.guiTool) && this.canUse('draw')) {
                const drawTool = this.tools.get(this.guiTool);
                if (drawTool) return drawTool.onPointerDown(e);
                return [];
            }

            // Contrast (Ctrl + left)
            if (this.ctrlHeld && this.canUse('contrast')) {
                const contrastTool = this.tools.get('contrast');
                if (contrastTool) return contrastTool.onPointerDown(e);
                return [];
            }

            // Sphere
            if (this.guiTool === 'sphere' && this.canUse('spherePlace')) {
                const sphereTool = this.tools.get('sphere');
                if (sphereTool) return sphereTool.onPointerDown(e);
                return [];
            }

            // Calculator
            if (this.guiTool === 'calculator' && this.canUse('calcPlace')) {
                const calcTool = this.tools.get('sphere');  // Calculator uses SphereTool
                if (calcTool) return calcTool.onPointerDown(e);
                return [];
            }

            // Default: slice change via left-drag
            // (handled externally via onDragSlice callback)
            return [];
        }

        return [];
    }

    /**
     * Dispatch a pointer-move event to the appropriate tool.
     */
    dispatchPointerMove(e: PointerEvent): Delta[] {
        // Right-click drag: pan
        if (this.rightButtonDown && this.canUse('pan')) {
            const panTool = this.tools.get('pan');
            if (panTool) return panTool.onPointerMove(e);
            return [];
        }

        // Left button down
        if (this.leftButtonDown) {
            // Crosshair tracking
            if (this.crosshairEnabled && this.canUse('crosshairClick')) {
                const crosshairTool = this.tools.get('crosshair');
                if (crosshairTool) return crosshairTool.onPointerMove(e);
                return [];
            }

            // Drawing
            if (this.shiftHeld && DRAWING_TOOLS.has(this.guiTool) && this.canUse('draw')) {
                const drawTool = this.tools.get(this.guiTool);
                if (drawTool) return drawTool.onPointerMove(e);
                return [];
            }

            // Contrast
            if (this.ctrlHeld && this.canUse('contrast')) {
                const contrastTool = this.tools.get('contrast');
                if (contrastTool) return contrastTool.onPointerMove(e);
                return [];
            }

            // Sphere
            if (this.guiTool === 'sphere') {
                const sphereTool = this.tools.get('sphere');
                if (sphereTool) return sphereTool.onPointerMove(e);
                return [];
            }

            // Calculator
            if (this.guiTool === 'calculator') {
                const calcTool = this.tools.get('sphere');
                if (calcTool) return calcTool.onPointerMove(e);
                return [];
            }

            // Default: drag slice change (external)
            if (this.onDragSlice && this.canUse('sliceChange')) {
                this.onDragSlice(e);
            }
            return [];
        }

        return [];
    }

    /**
     * Dispatch a pointer-up event to the appropriate tool.
     */
    dispatchPointerUp(e: PointerEvent): Delta[] {
        let deltas: Delta[] = [];

        // Right-click release
        if (e.button === 2) {
            if (this.rightButtonDown) {
                const panTool = this.tools.get('pan');
                if (panTool) deltas = panTool.onPointerUp(e);
                this.rightButtonDown = false;
            }
            this.notifyStateChange();
            return deltas;
        }

        // Left-click release
        if (e.button === 0) {
            if (this.leftButtonDown) {
                // Crosshair: no-op on release (data recorded on down)
                if (this.crosshairEnabled) {
                    // nothing to settle
                }
                // Drawing
                else if (this.shiftHeld && DRAWING_TOOLS.has(this.guiTool)) {
                    const drawTool = this.tools.get(this.guiTool);
                    if (drawTool) deltas = drawTool.onPointerUp(e);
                }
                // Contrast
                else if (this.ctrlHeld) {
                    const contrastTool = this.tools.get('contrast');
                    if (contrastTool) deltas = contrastTool.onPointerUp(e);
                }
                // Sphere
                else if (this.guiTool === 'sphere') {
                    const sphereTool = this.tools.get('sphere');
                    if (sphereTool) deltas = sphereTool.onPointerUp(e);
                }
                // Calculator
                else if (this.guiTool === 'calculator') {
                    const calcTool = this.tools.get('sphere');
                    if (calcTool) deltas = calcTool.onPointerUp(e);
                }
            }

            this.leftButtonDown = false;
            this.notifyStateChange();
            return deltas;
        }

        return deltas;
    }

    /**
     * Dispatch a wheel event.
     * Routes to sphere radius adjustment, zoom, or slice change.
     */
    dispatchWheel(e: WheelEvent): void {
        // Sphere + left button down: radius adjustment
        if (this.guiTool === 'sphere' && this.leftButtonDown && this.canUse('sphereWheel')) {
            const sphereTool = this.tools.get('sphere');
            if (sphereTool) sphereTool.onWheel(e);
            return;
        }

        // Blocked during shift, ctrl, crosshair
        if (this.shiftHeld) return;
        if (this.ctrlHeld) return;
        if (this.crosshairEnabled) return;

        // Zoom or slice change (handled by ZoomTool which has both modes)
        if (this.canUse('zoom') || this.canUse('sliceChange')) {
            const zoomTool = this.tools.get('zoom');
            if (zoomTool) zoomTool.onWheel(e);
        }
    }

    /**
     * Dispatch an arrow key event for slice navigation.
     */
    dispatchArrowKey(direction: 'up' | 'down'): void {
        if (!this.canUse('arrowSlice')) return;

        if (this.onArrowSlice) {
            this.onArrowSlice(direction);
        }
    }

    // ===== Tool Registration =====

    /**
     * Register a tool instance by name for event dispatch.
     */
    registerTool(name: string, tool: BaseTool): void {
        this.tools.set(name, tool);
    }

    /**
     * Unregister a tool by name.
     */
    unregisterTool(name: string): void {
        this.tools.delete(name);
    }

    /**
     * Get a registered tool by name.
     */
    getTool(name: string): BaseTool | undefined {
        return this.tools.get(name);
    }

    /**
     * Get all registered tool names.
     */
    getRegisteredTools(): string[] {
        return [...this.tools.keys()];
    }

    // ===== State Reset =====

    /**
     * Reset all Level 2 interaction state to defaults.
     * Useful when switching contexts (e.g., changing case).
     */
    resetInteractionState(): void {
        this.crosshairEnabled = false;
        this.shiftHeld = false;
        this.ctrlHeld = false;
        this.leftButtonDown = false;
        this.rightButtonDown = false;
        this.notifyStateChange();
    }

    // ===== Internal Helpers =====

    /**
     * Notify the state change callback with current allowed interactions.
     */
    private notifyStateChange(): void {
        if (this.onStateChange) {
            this.onStateChange(
                this.getAllowed(),
                this.guiTool,
                this.crosshairEnabled
            );
        }
    }

    /**
     * Settle a drawing operation (when shift is released mid-draw).
     * Triggers pointerUp on the current drawing tool.
     */
    private settleDrawing(): void {
        const drawTool = this.tools.get(this.guiTool);
        if (drawTool) {
            const fakeEvent = {
                button: 0,
                offsetX: 0,
                offsetY: 0,
                clientX: 0,
                clientY: 0,
            } as PointerEvent;
            drawTool.onPointerUp(fakeEvent);
        }
    }

    /**
     * Deactivate tool(s) related to the previous GUI tool selection.
     */
    private deactivateCurrentTool(prevTool: GuiTool): void {
        if (DRAWING_TOOLS.has(prevTool)) {
            const tool = this.tools.get(prevTool);
            if (tool) tool.deactivate();
        } else if (prevTool === 'sphere' || prevTool === 'calculator') {
            const sphereTool = this.tools.get('sphere');
            if (sphereTool) sphereTool.deactivate();
        }
    }

    /**
     * Activate tool(s) related to the new GUI tool selection.
     */
    private activateCurrentTool(newTool: GuiTool): void {
        if (DRAWING_TOOLS.has(newTool)) {
            const tool = this.tools.get(newTool);
            if (tool) tool.activate();
        } else if (newTool === 'sphere' || newTool === 'calculator') {
            const sphereTool = this.tools.get('sphere');
            if (sphereTool) sphereTool.activate();
        }
    }
}
