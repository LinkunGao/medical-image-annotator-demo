/**
 * CrosshairTool - Cross-View Positioning Tool
 *
 * Phase 5 - Crosshair & Sphere Tools
 *
 * Behavior (migrated from DrawToolCore.enableCrosshair / convertCursorPoint):
 * 1. User presses 'S' key to toggle crosshair mode on/off
 * 2. When enabled, clicking on any view records a 3D coordinate
 * 3. Two perpendicular dashed lines are drawn at the click position
 * 4. navigateTo(targetAxis) computes the corresponding slice & cursor
 *    on another axis view, enabling cross-view synchronisation
 *
 * Cross-axis coordinate conversion is handled via CrosshairAdapter,
 * since it depends on volume metadata (dimensions, mm distances, ratios).
 */

import { BaseTool } from './BaseTool';
import type { ToolName } from './BaseTool';
import type { AxisType, Point3D } from '../core/types';

// ===== Crosshair Adapter =====

/**
 * Adapter for cross-axis coordinate conversion and navigation callbacks.
 * The project layer provides a concrete implementation.
 */
export interface CrosshairAdapter {
    /**
     * Convert a cursor point from one axis view to another.
     *
     * @param fromAxis - Source axis where the click occurred
     * @param toAxis - Target axis to navigate to
     * @param mouseX - X position in original (data) coords on source axis
     * @param mouseY - Y position in original (data) coords on source axis
     * @param sliceIndex - Current slice index on source axis
     * @returns Converted coordinates on target axis, or null if conversion fails
     */
    convertCursorPoint(
        fromAxis: AxisType,
        toAxis: AxisType,
        mouseX: number,
        mouseY: number,
        sliceIndex: number
    ): { x: number; y: number; sliceIndex: number } | null;

    /**
     * Get the max slice index for a given axis.
     */
    getMaxSlice(axis: AxisType): number;

    /**
     * Callback when crosshair navigates to a different axis/slice.
     * The project layer should update the active view accordingly.
     */
    onCrosshairNavigate?: (
        targetAxis: AxisType,
        sliceIndex: number,
        cursorX: number,
        cursorY: number
    ) => void;
}

// ===== Crosshair Style =====

/** Default crosshair line style */
const CROSSHAIR_LINE_COLOR = '#FFFFFF';
const CROSSHAIR_LINE_WIDTH = 1;
const CROSSHAIR_DASH_PATTERN = [6, 4];

// ===== CrosshairTool =====

export class CrosshairTool extends BaseTool {
    readonly name: ToolName = 'crosshair';

    /** Whether crosshair mode is currently enabled */
    private enabled: boolean = false;

    /** Stored 3D voxel coordinate of the last click */
    private cursorPosition: Point3D | null = null;

    /** Current 2D cursor position on the active axis (original coords) */
    private cursorX: number = 0;
    private cursorY: number = 0;

    /** The axis on which the last click occurred */
    private clickAxis: AxisType = 'z';

    /** The slice index on which the last click occurred */
    private clickSlice: number = 0;

    /** Adapter for cross-axis conversion (injected by project layer) */
    private adapter: CrosshairAdapter | null = null;

    /** Custom line color (defaults to white) */
    private lineColor: string = CROSSHAIR_LINE_COLOR;

    // ===== Configuration =====

    /**
     * Set the crosshair adapter for cross-axis conversion.
     */
    setAdapter(adapter: CrosshairAdapter): void {
        this.adapter = adapter;
    }

    /**
     * Set custom crosshair line color.
     */
    setLineColor(color: string): void {
        this.lineColor = color;
    }

    /**
     * Check if crosshair mode is enabled.
     */
    isEnabled(): boolean {
        return this.enabled;
    }

    /**
     * Toggle crosshair mode on/off.
     * Called when user presses the crosshair key (default 'S').
     */
    toggle(): void {
        this.enabled = !this.enabled;
        if (!this.enabled) {
            this.cursorPosition = null;
            this.clearDrawingCanvas();
        }
    }

    /**
     * Explicitly enable crosshair mode.
     */
    enable(): void {
        this.enabled = true;
    }

    /**
     * Explicitly disable crosshair mode and clear state.
     */
    disable(): void {
        this.enabled = false;
        this.cursorPosition = null;
        this.clearDrawingCanvas();
    }

    /**
     * Get the stored 3D cursor position.
     */
    getCursorPosition(): Point3D | null {
        return this.cursorPosition ? { ...this.cursorPosition } : null;
    }

    /**
     * Get the 2D cursor position on the click axis (original coords).
     */
    getCursor2D(): { x: number; y: number } {
        return { x: this.cursorX, y: this.cursorY };
    }

    /**
     * Get the axis on which the last click occurred.
     */
    getClickAxis(): AxisType {
        return this.clickAxis;
    }

    // ===== Lifecycle =====

    activate(): void {
        if (this.ctx.drawingCanvas) {
            this.ctx.drawingCanvas.style.cursor = 'crosshair';
        }
    }

    deactivate(): void {
        this.clearDrawingCanvas();
    }

    // ===== Pointer Events =====

    /**
     * On click: record 3D coordinate and draw crosshair lines.
     * Returns empty deltas (crosshair does not modify mask data).
     */
    onPointerDown(e: PointerEvent): [] {
        if (!this.enabled) return [];

        // Convert screen coords to original (data) coords
        const { x, y } = this.screenToOriginal(e.offsetX, e.offsetY);

        this.cursorX = x;
        this.cursorY = y;
        this.clickAxis = this.ctx.currentAxis;
        this.clickSlice = this.ctx.currentSlice;

        // Build 3D coordinate from 2D click + axis + slice
        this.cursorPosition = this.to3DCoord(
            this.ctx.currentAxis,
            x,
            y,
            this.ctx.currentSlice
        );

        // Draw crosshair lines on the drawing canvas
        this.drawCrosshair(e.offsetX, e.offsetY);

        return [];
    }

    /**
     * On move: update crosshair position if enabled (live tracking).
     */
    onPointerMove(e: PointerEvent): [] {
        if (!this.enabled) return [];

        const { x, y } = this.screenToOriginal(e.offsetX, e.offsetY);

        this.cursorX = x;
        this.cursorY = y;
        this.clickAxis = this.ctx.currentAxis;
        this.clickSlice = this.ctx.currentSlice;

        this.cursorPosition = this.to3DCoord(
            this.ctx.currentAxis,
            x,
            y,
            this.ctx.currentSlice
        );

        this.drawCrosshair(e.offsetX, e.offsetY);

        return [];
    }

    // ===== Cross-View Navigation =====

    /**
     * Navigate to a target axis view based on the stored cursor position.
     *
     * Computes the target slice index and cursor position on the target axis
     * using the adapter's convertCursorPoint.
     *
     * @param targetAxis - The axis to navigate to
     * @returns The target slice and cursor position, or null if not possible
     */
    navigateTo(
        targetAxis: AxisType
    ): { sliceIndex: number; cursorX: number; cursorY: number } | null {
        if (!this.cursorPosition) return null;
        if (!this.adapter) return null;

        // If navigating to the same axis, just return current position
        if (targetAxis === this.clickAxis) {
            return {
                sliceIndex: this.clickSlice,
                cursorX: this.cursorX,
                cursorY: this.cursorY,
            };
        }

        // Convert via adapter
        const result = this.adapter.convertCursorPoint(
            this.clickAxis,
            targetAxis,
            this.cursorX,
            this.cursorY,
            this.clickSlice
        );

        if (!result) return null;

        // Clamp slice to valid range
        const maxSlice = this.adapter.getMaxSlice(targetAxis);
        const clampedSlice = Math.max(
            0,
            Math.min(result.sliceIndex, maxSlice)
        );

        const nav = {
            sliceIndex: clampedSlice,
            cursorX: result.x,
            cursorY: result.y,
        };

        // Notify project layer of navigation
        if (this.adapter.onCrosshairNavigate) {
            this.adapter.onCrosshairNavigate(
                targetAxis,
                nav.sliceIndex,
                nav.cursorX,
                nav.cursorY
            );
        }

        return nav;
    }

    /**
     * Get the target slice index for a given axis without triggering navigation.
     * Useful for UI to show which slice the crosshair points to.
     */
    getTargetSlice(
        targetAxis: AxisType
    ): number | null {
        const result = this.navigateToInternal(targetAxis);
        return result ? result.sliceIndex : null;
    }

    // ===== 3D Coordinate Conversion =====

    /**
     * Convert a 2D click on a specific axis/slice to a 3D voxel coordinate.
     *
     * Mapping depends on the viewing axis:
     * - Z axis: click (x, y) at slice z -> Point3D(x, y, z)
     * - Y axis: click (x, y) at slice y -> Point3D(x, slice, y_click)
     * - X axis: click (x, y) at slice x -> Point3D(slice, x_click, y_click)
     *
     * Note: The exact mapping depends on the volume orientation conventions
     * used by the project. This provides a standard mapping that can be
     * overridden via adapter if needed.
     */
    private to3DCoord(
        axis: AxisType,
        cx: number,
        cy: number,
        sliceIndex: number
    ): Point3D {
        switch (axis) {
            case 'z':
                return { x: cx, y: cy, z: sliceIndex };
            case 'y':
                return { x: cx, y: sliceIndex, z: cy };
            case 'x':
                return { x: sliceIndex, y: cx, z: cy };
        }
    }

    // ===== Internal Navigation (no callback) =====

    private navigateToInternal(
        targetAxis: AxisType
    ): { sliceIndex: number; cursorX: number; cursorY: number } | null {
        if (!this.cursorPosition) return null;
        if (!this.adapter) return null;

        if (targetAxis === this.clickAxis) {
            return {
                sliceIndex: this.clickSlice,
                cursorX: this.cursorX,
                cursorY: this.cursorY,
            };
        }

        const result = this.adapter.convertCursorPoint(
            this.clickAxis,
            targetAxis,
            this.cursorX,
            this.cursorY,
            this.clickSlice
        );

        if (!result) return null;

        const maxSlice = this.adapter.getMaxSlice(targetAxis);
        return {
            sliceIndex: Math.max(0, Math.min(result.sliceIndex, maxSlice)),
            cursorX: result.x,
            cursorY: result.y,
        };
    }

    // ===== Crosshair Rendering =====

    /**
     * Draw crosshair lines on the drawing canvas.
     * Two perpendicular dashed lines at the given screen position.
     *
     * @param screenX - X position in screen coordinates
     * @param screenY - Y position in screen coordinates
     */
    private drawCrosshair(screenX: number, screenY: number): void {
        const ctx = this.ctx.drawingCtx;
        const canvas = this.ctx.drawingCanvas;
        if (!ctx || !canvas) return;

        // Clear previous preview
        this.clearDrawingCanvas();

        ctx.save();

        ctx.strokeStyle = this.lineColor;
        ctx.lineWidth = CROSSHAIR_LINE_WIDTH;
        ctx.setLineDash(CROSSHAIR_DASH_PATTERN);

        // Vertical line (full canvas height)
        ctx.beginPath();
        ctx.moveTo(screenX, 0);
        ctx.lineTo(screenX, canvas.height);
        ctx.stroke();

        // Horizontal line (full canvas width)
        ctx.beginPath();
        ctx.moveTo(0, screenY);
        ctx.lineTo(canvas.width, screenY);
        ctx.stroke();

        ctx.restore();
    }
}
