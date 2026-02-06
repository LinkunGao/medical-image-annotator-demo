/**
 * PencilTool - Polygon Auto-Fill Tool
 *
 * Phase 3 - Tool Abstraction
 *
 * Behavior (from existing DrawToolCore):
 * 1. On pointer down: start recording outline points
 * 2. On pointer move: add point, draw red outline preview on drawing canvas
 * 3. On pointer up:
 *    - Close the polygon path
 *    - Fill the enclosed area using MaskLayer.fillPolygon()
 *    - Push deltas to UndoManager
 *    - Clear the red outline preview
 *    - Request mask re-render
 *
 * Key Difference from BrushTool:
 * - Pencil draws an outline first, then fills the enclosed polygon on release
 * - Brush paints continuously while dragging
 */

import { BaseTool } from './BaseTool';
import type { ToolName } from './BaseTool';
import type { Delta, Point2D } from '../core/types';

/** Red outline style for pencil preview */
const OUTLINE_COLOR = 'rgba(255, 0, 0, 1)';
const OUTLINE_WIDTH = 1;

export class PencilTool extends BaseTool {
    readonly name: ToolName = 'pencil';

    /** Accumulated screen-coordinate points for the current stroke */
    private lines: Point2D[] = [];

    /** Whether the user is currently drawing */
    private isDrawing: boolean = false;

    // ===== Lifecycle =====

    activate(): void {
        if (this.ctx.drawingCanvas) {
            this.ctx.drawingCanvas.style.cursor = 'crosshair';
        }
    }

    deactivate(): void {
        this.lines = [];
        this.isDrawing = false;
        this.clearDrawingCanvas();
    }

    // ===== Pointer Events =====

    /**
     * Start drawing: record the first point
     */
    onPointerDown(e: PointerEvent): Delta[] {
        this.isDrawing = true;
        this.lines = [{ x: e.offsetX, y: e.offsetY }];
        return [];
    }

    /**
     * Continue drawing: add point and draw red outline preview
     */
    onPointerMove(e: PointerEvent): Delta[] {
        if (!this.isDrawing) return [];

        this.lines.push({ x: e.offsetX, y: e.offsetY });
        this.drawOutlinePreview();
        return [];
    }

    /**
     * Finish drawing: close polygon, fill, push undo, clear preview
     */
    onPointerUp(_e: PointerEvent): Delta[] {
        if (!this.isDrawing) return [];
        this.isDrawing = false;

        // Need at least 3 points to form a polygon
        if (this.lines.length < 3) {
            this.lines = [];
            this.clearDrawingCanvas();
            return [];
        }

        // Convert screen coordinates to original (data) coordinates
        const polygon: Point2D[] = this.lines.map((p) =>
            this.screenToOriginal(p.x, p.y)
        );

        // Fill polygon in the mask data
        const deltas = this.ctx.layerManager.fillPolygon(
            this.ctx.currentSlice,
            polygon,
            this.ctx.currentChannel
        );

        // Push to undo stack if there were changes
        if (deltas.length > 0) {
            this.ctx.undoManager.push(deltas);
        }

        // Clear the red outline preview
        this.lines = [];
        this.clearDrawingCanvas();

        // Request mask re-render to display the filled polygon
        this.ctx.requestRender();

        return deltas;
    }

    /**
     * Cancel drawing if pointer leaves canvas
     */
    onPointerLeave(_e: PointerEvent): void {
        if (this.isDrawing) {
            // Optionally complete the polygon on leave, or cancel
            // Current behavior: cancel and clear preview
            this.isDrawing = false;
            this.lines = [];
            this.clearDrawingCanvas();
        }
    }

    // ===== Preview Rendering =====

    /**
     * Draw the red outline preview on the drawing layer canvas.
     * This shows the user the polygon boundary while they are drawing.
     */
    private drawOutlinePreview(): void {
        const ctx = this.ctx.drawingCtx;
        if (!ctx || this.lines.length < 2) return;

        // Clear previous preview
        this.clearDrawingCanvas();

        // Draw the outline path
        ctx.beginPath();
        ctx.moveTo(this.lines[0].x, this.lines[0].y);

        for (let i = 1; i < this.lines.length; i++) {
            ctx.lineTo(this.lines[i].x, this.lines[i].y);
        }

        ctx.strokeStyle = OUTLINE_COLOR;
        ctx.lineWidth = OUTLINE_WIDTH;
        ctx.stroke();
    }
}
