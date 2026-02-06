/**
 * ZoomTool - Scroll Zoom / Slice Switch
 *
 * Phase 3 - Tool Abstraction
 *
 * Behavior (from existing DrawToolCore.configMouseZoomWheel):
 *
 * Mode A: Scroll:Zoom (default)
 *   - Scroll wheel zooms in/out at mouse position
 *   - Clamped to min 1x and max 8x zoom
 *   - Canvas is repositioned so zoom centers on mouse cursor
 *
 * Mode B: Scroll:Slice
 *   - Scroll wheel changes the current slice index
 *   - Scroll up: previous slice, scroll down: next slice
 *
 * The mode is controlled by KeyboardManager.mouseWheelBehavior.
 *
 * A ZoomAdapter interface decouples the tool from specific canvas/rendering logic.
 */

import { BaseTool } from './BaseTool';
import type { ToolName } from './BaseTool';
import type { MouseWheelBehavior } from '../core/KeyboardManager';

/** Zoom constraints */
const MIN_ZOOM = 1;
const MAX_ZOOM = 8;
const ZOOM_STEP = 0.1;

/**
 * Adapter interface for zoom and slice operations.
 * Decouples ZoomTool from specific canvas/rendering implementations.
 */
export interface ZoomAdapter {
    /** Get current zoom factor */
    getSizeFactor(): number;
    /** Set zoom factor and reposition canvas around (mouseX, mouseY) */
    setSizeFactor(factor: number, mouseX: number, mouseY: number): void;
    /** Get current slice index */
    getCurrentSlice(): number;
    /** Set slice index (clamped by adapter) */
    setCurrentSlice(index: number): void;
    /** Get max slice index for current axis */
    getMaxSlice(): number;
}

export class ZoomTool extends BaseTool {
    readonly name: ToolName = 'zoom';

    /** Adapter for zoom/slice operations (injected) */
    private adapter: ZoomAdapter | null = null;

    /**
     * Set the zoom adapter.
     * Must be called before the tool can function.
     */
    setAdapter(adapter: ZoomAdapter): void {
        this.adapter = adapter;
    }

    // ===== Wheel Event =====

    /**
     * Handle mouse wheel event.
     * Behavior depends on KeyboardManager.mouseWheelBehavior setting.
     */
    onWheel(e: WheelEvent): void {
        if (!this.adapter) return;

        const behavior: MouseWheelBehavior =
            this.ctx.keyboardManager.getMouseWheelBehavior();

        if (behavior === 'Scroll:Zoom') {
            this.handleZoom(e);
        } else {
            this.handleSliceScroll(e);
        }
    }

    // ===== Zoom Logic =====

    /**
     * Zoom in/out at the mouse position.
     *
     * From existing DrawToolCore:
     * - deltaY < 0 → zoom in (increase sizeFactor)
     * - deltaY > 0 → zoom out (decrease sizeFactor)
     * - Clamp to [MIN_ZOOM, MAX_ZOOM]
     * - Reposition canvas so zoom centers on mouse cursor
     */
    private handleZoom(e: WheelEvent): void {
        if (!this.adapter) return;

        const currentZoom = this.adapter.getSizeFactor();
        const delta = e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP;
        const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, currentZoom + delta));

        if (newZoom !== currentZoom) {
            this.adapter.setSizeFactor(newZoom, e.offsetX, e.offsetY);
        }
    }

    // ===== Slice Scroll Logic =====

    /**
     * Switch slice based on scroll direction.
     * Scroll up → previous slice, scroll down → next slice.
     */
    private handleSliceScroll(e: WheelEvent): void {
        if (!this.adapter) return;

        const currentSlice = this.adapter.getCurrentSlice();
        const maxSlice = this.adapter.getMaxSlice();
        const direction = e.deltaY < 0 ? -1 : 1;
        const newSlice = Math.max(0, Math.min(maxSlice, currentSlice + direction));

        if (newSlice !== currentSlice) {
            this.adapter.setCurrentSlice(newSlice);
        }
    }
}
