/**
 * ContrastTool - Window Center / Width Adjustment
 *
 * Phase 3 - Tool Abstraction
 *
 * Behavior (from existing DrawToolCore.configContrastDragMode):
 * 1. Activated when Ctrl key is pressed
 * 2. On pointer down: record initial mouse position and contrast values
 * 3. On pointer move (horizontal): adjust window center
 * 4. On pointer move (vertical): adjust window width
 * 5. On pointer up / Ctrl release: deactivate contrast mode
 *
 * A ContrastAdapter interface decouples from the actual contrast/windowing
 * implementation, since those depend on the NRRD display slice rendering
 * which lives in the project layer, not the npm package.
 */

import { BaseTool } from './BaseTool';
import type { ToolName } from './BaseTool';
import type { Delta } from '../core/types';

/**
 * Adapter interface for contrast adjustment operations.
 * The project layer provides a concrete implementation that modifies
 * the display slice rendering parameters.
 */
export interface ContrastAdapter {
    /** Get current window center value */
    getWindowCenter(): number;
    /** Get current window width value */
    getWindowWidth(): number;
    /** Set window center value */
    setWindowCenter(value: number): void;
    /** Set window width value */
    setWindowWidth(value: number): void;
    /** Refresh display after contrast change */
    refreshDisplay(): void;
}

export class ContrastTool extends BaseTool {
    readonly name: ToolName = 'contrast';

    /** Whether contrast adjustment is active */
    private isAdjusting: boolean = false;

    /** Mouse position at drag start */
    private startX: number = 0;
    private startY: number = 0;

    /** Contrast values at drag start */
    private startWindowCenter: number = 0;
    private startWindowWidth: number = 0;

    /** Adapter for contrast operations (injected) */
    private adapter: ContrastAdapter | null = null;

    /** Sensitivity factor for contrast adjustment */
    private sensitivity: number = 1;

    /**
     * Set the contrast adapter.
     * Must be called before the tool can function.
     */
    setAdapter(adapter: ContrastAdapter): void {
        this.adapter = adapter;
    }

    /**
     * Set sensitivity factor for mouse-to-contrast mapping.
     * Higher values = faster contrast changes per pixel of mouse movement.
     */
    setSensitivity(value: number): void {
        this.sensitivity = value;
    }

    // ===== Lifecycle =====

    activate(): void {
        if (this.ctx.drawingCanvas) {
            this.ctx.drawingCanvas.style.cursor = 'pointer';
        }
    }

    deactivate(): void {
        this.isAdjusting = false;
        if (this.ctx.drawingCanvas) {
            this.ctx.drawingCanvas.style.cursor = '';
        }
    }

    // ===== Pointer Events =====

    /**
     * Start contrast adjustment: record initial state
     */
    onPointerDown(e: PointerEvent): Delta[] {
        if (!this.adapter) return [];

        this.isAdjusting = true;
        this.startX = e.clientX;
        this.startY = e.clientY;
        this.startWindowCenter = this.adapter.getWindowCenter();
        this.startWindowWidth = this.adapter.getWindowWidth();

        return [];
    }

    /**
     * Adjust contrast based on mouse movement:
     * - Horizontal movement (X delta) → window center
     * - Vertical movement (Y delta) → window width
     */
    onPointerMove(e: PointerEvent): Delta[] {
        if (!this.isAdjusting || !this.adapter) return [];

        const deltaX = (e.clientX - this.startX) * this.sensitivity;
        const deltaY = (e.clientY - this.startY) * this.sensitivity;

        // Horizontal drag → window center
        this.adapter.setWindowCenter(this.startWindowCenter + deltaX);

        // Vertical drag → window width (ensure non-negative)
        const newWidth = Math.max(1, this.startWindowWidth + deltaY);
        this.adapter.setWindowWidth(newWidth);

        // Refresh the display to show contrast changes in real-time
        this.adapter.refreshDisplay();

        return [];
    }

    /**
     * Stop contrast adjustment
     */
    onPointerUp(_e: PointerEvent): Delta[] {
        this.isAdjusting = false;
        return [];
    }

    /**
     * Cancel adjustment on pointer leave
     */
    onPointerLeave(_e: PointerEvent): void {
        this.isAdjusting = false;
    }
}
