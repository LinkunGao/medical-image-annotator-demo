/**
 * EraserTool - Eraser Tool
 *
 * Phase 3 - Tool Abstraction
 *
 * Behavior (from existing DrawToolCore.useEraser()):
 * 1. On pointer down: start erasing at position
 * 2. On pointer move: continuously erase (set voxels to channel 0)
 * 3. On pointer up: push all deltas to UndoManager
 *
 * The eraser only affects the current active layer.
 * Channel 0 means "transparent/erased" in the mask data.
 *
 * Existing DrawToolCore uses a recursive clearRect approach to simulate
 * circular erasing. The new implementation uses MaskLayer.erase() which
 * applies a circular brush with channel=0, which is more efficient.
 */

import { BaseTool } from './BaseTool';
import type { ToolName } from './BaseTool';
import type { Delta } from '../core/types';

export class EraserTool extends BaseTool {
    readonly name: ToolName = 'eraser';

    /** Whether the user is currently erasing */
    private isErasing: boolean = false;

    /** Accumulated deltas for the current stroke */
    private strokeDeltas: Delta[] = [];

    // ===== Lifecycle =====

    activate(): void {
        if (this.ctx.drawingCanvas) {
            this.ctx.drawingCanvas.style.cursor = 'crosshair';
        }
    }

    deactivate(): void {
        this.isErasing = false;
        this.strokeDeltas = [];
        this.clearDrawingCanvas();
    }

    // ===== Pointer Events =====

    /**
     * Start erasing at initial position
     */
    onPointerDown(e: PointerEvent): Delta[] {
        this.isErasing = true;
        this.strokeDeltas = [];

        const { x, y } = this.screenToOriginal(e.offsetX, e.offsetY);
        const radius = this.screenBrushToOriginal(this.ctx.brushSize / 2);

        const deltas = this.ctx.layerManager.erase(
            this.ctx.currentSlice,
            x,
            y,
            radius
        );

        this.strokeDeltas.push(...deltas);
        this.drawEraserPreview(e.offsetX, e.offsetY);

        if (deltas.length > 0) {
            this.ctx.requestRender();
        }

        return deltas;
    }

    /**
     * Continue erasing during drag
     */
    onPointerMove(e: PointerEvent): Delta[] {
        this.drawEraserPreview(e.offsetX, e.offsetY);

        if (!this.isErasing) return [];

        const { x, y } = this.screenToOriginal(e.offsetX, e.offsetY);
        const radius = this.screenBrushToOriginal(this.ctx.brushSize / 2);

        const deltas = this.ctx.layerManager.erase(
            this.ctx.currentSlice,
            x,
            y,
            radius
        );

        this.strokeDeltas.push(...deltas);

        if (deltas.length > 0) {
            this.ctx.requestRender();
        }

        return deltas;
    }

    /**
     * Finish erasing: push all deltas as one undo operation
     */
    onPointerUp(_e: PointerEvent): Delta[] {
        if (!this.isErasing) return [];
        this.isErasing = false;

        if (this.strokeDeltas.length > 0) {
            this.ctx.undoManager.push(this.strokeDeltas);
        }

        const result = this.strokeDeltas;
        this.strokeDeltas = [];
        return result;
    }

    /**
     * Handle pointer leave
     */
    onPointerLeave(_e: PointerEvent): void {
        this.clearDrawingCanvas();

        if (this.isErasing) {
            this.isErasing = false;
            if (this.strokeDeltas.length > 0) {
                this.ctx.undoManager.push(this.strokeDeltas);
            }
            this.strokeDeltas = [];
        }
    }

    // ===== Preview Rendering =====

    /**
     * Draw the eraser cursor preview (dashed circle).
     */
    private drawEraserPreview(screenX: number, screenY: number): void {
        const ctx = this.ctx.drawingCtx;
        if (!ctx) return;

        this.clearDrawingCanvas();

        const halfSize = this.ctx.brushSize / 2;

        ctx.beginPath();
        ctx.arc(screenX, screenY, halfSize, 0, Math.PI * 2);
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.setLineDash([]);
    }
}
