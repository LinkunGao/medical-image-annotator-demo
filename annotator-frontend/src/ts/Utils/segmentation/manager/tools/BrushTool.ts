/**
 * BrushTool - Continuous Circle Brush
 *
 * Phase 3 - Tool Abstraction
 *
 * Behavior (from existing DrawToolCore):
 * 1. On pointer down: start painting, apply brush at initial position
 * 2. On pointer move: continuously apply brush at each position
 * 3. On pointer up: finalize operation, push all deltas to UndoManager
 *
 * Key Difference from PencilTool:
 * - Brush paints continuously during drag (immediate effect)
 * - Pencil only draws an outline, then fills on release
 *
 * The brush circle preview (cursor) follows the mouse during move events.
 */

import { BaseTool } from './BaseTool';
import type { ToolName } from './BaseTool';
import type { Delta } from '../core/types';

export class BrushTool extends BaseTool {
    readonly name: ToolName = 'brush';

    /** Whether the user is currently painting */
    private isPainting: boolean = false;

    /** Accumulated deltas for the current stroke (single undo operation) */
    private strokeDeltas: Delta[] = [];

    // ===== Lifecycle =====

    activate(): void {
        // Cursor is handled by drawBrushPreview on move
    }

    deactivate(): void {
        this.isPainting = false;
        this.strokeDeltas = [];
        this.clearDrawingCanvas();
    }

    // ===== Pointer Events =====

    /**
     * Start painting: apply brush at initial position
     */
    onPointerDown(e: PointerEvent): Delta[] {
        this.isPainting = true;
        this.strokeDeltas = [];

        // Convert to original coords and apply brush
        const { x, y } = this.screenToOriginal(e.offsetX, e.offsetY);
        const radius = this.screenBrushToOriginal(this.ctx.brushSize / 2);

        const deltas = this.ctx.layerManager.applyBrush(
            this.ctx.currentSlice,
            x,
            y,
            radius,
            this.ctx.currentChannel
        );

        this.strokeDeltas.push(...deltas);

        // Show brush cursor preview
        this.drawBrushPreview(e.offsetX, e.offsetY);

        // Request render to show the painted pixels
        if (deltas.length > 0) {
            this.ctx.requestRender();
        }

        return deltas;
    }

    /**
     * Continue painting: apply brush at each position during drag
     */
    onPointerMove(e: PointerEvent): Delta[] {
        // Always show brush cursor preview, even if not painting
        this.drawBrushPreview(e.offsetX, e.offsetY);

        if (!this.isPainting) return [];

        const { x, y } = this.screenToOriginal(e.offsetX, e.offsetY);
        const radius = this.screenBrushToOriginal(this.ctx.brushSize / 2);

        const deltas = this.ctx.layerManager.applyBrush(
            this.ctx.currentSlice,
            x,
            y,
            radius,
            this.ctx.currentChannel
        );

        this.strokeDeltas.push(...deltas);

        if (deltas.length > 0) {
            this.ctx.requestRender();
        }

        return deltas;
    }

    /**
     * Finish painting: push all stroke deltas as a single undo operation
     */
    onPointerUp(_e: PointerEvent): Delta[] {
        if (!this.isPainting) return [];
        this.isPainting = false;

        // Push entire stroke as one undo operation
        if (this.strokeDeltas.length > 0) {
            this.ctx.undoManager.push(this.strokeDeltas);
        }

        const result = this.strokeDeltas;
        this.strokeDeltas = [];
        return result;
    }

    /**
     * Clear preview when pointer leaves canvas
     */
    onPointerLeave(_e: PointerEvent): void {
        this.clearDrawingCanvas();

        if (this.isPainting) {
            this.isPainting = false;
            // Push accumulated deltas as one undo operation
            if (this.strokeDeltas.length > 0) {
                this.ctx.undoManager.push(this.strokeDeltas);
            }
            this.strokeDeltas = [];
        }
    }

    // ===== Preview Rendering =====

    /**
     * Draw the circular brush cursor preview on the drawing layer canvas.
     */
    private drawBrushPreview(screenX: number, screenY: number): void {
        const ctx = this.ctx.drawingCtx;
        if (!ctx) return;

        this.clearDrawingCanvas();

        const halfSize = this.ctx.brushSize / 2;

        ctx.beginPath();
        ctx.arc(screenX, screenY, halfSize, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}
