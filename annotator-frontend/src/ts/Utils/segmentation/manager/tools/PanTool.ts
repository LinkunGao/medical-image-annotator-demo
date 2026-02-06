/**
 * PanTool - Canvas Pan (Right-Click Drag)
 *
 * Phase 3 - Tool Abstraction
 *
 * Behavior (from existing DrawToolCore.handleOnPanMouseMove):
 * 1. On right-click pointer down: record initial mouse and canvas positions
 * 2. On pointer move: translate canvas position based on mouse delta
 * 3. On pointer up: stop panning
 *
 * The pan tool moves the display canvas and drawing canvas together by
 * adjusting their CSS left/top positions.
 *
 * This tool does NOT modify mask data - it only affects canvas positioning.
 * A PanAdapter interface is used to decouple from specific canvas elements.
 */

import { BaseTool } from './BaseTool';
import type { ToolName } from './BaseTool';
import type { Delta } from '../core/types';

/**
 * Adapter interface for pan operations.
 * Decouples PanTool from specific canvas/container implementations.
 * The project layer provides a concrete implementation.
 */
export interface PanAdapter {
    /** Get current canvas left position in pixels */
    getCanvasLeft(): number;
    /** Get current canvas top position in pixels */
    getCanvasTop(): number;
    /** Set canvas position (moves display + drawing canvas together) */
    setCanvasPosition(left: number, top: number): void;
}

export class PanTool extends BaseTool {
    readonly name: ToolName = 'pan';

    /** Whether panning is active */
    private isPanning: boolean = false;

    /** Mouse position at drag start */
    private startMouseX: number = 0;
    private startMouseY: number = 0;

    /** Canvas position at drag start */
    private startCanvasLeft: number = 0;
    private startCanvasTop: number = 0;

    /** Adapter for canvas positioning (injected) */
    private adapter: PanAdapter | null = null;

    /**
     * Set the pan adapter for canvas positioning.
     * Must be called before the tool can function.
     */
    setAdapter(adapter: PanAdapter): void {
        this.adapter = adapter;
    }

    // ===== Lifecycle =====

    activate(): void {
        if (this.ctx.drawingCanvas) {
            this.ctx.drawingCanvas.style.cursor = 'grab';
        }
    }

    deactivate(): void {
        this.isPanning = false;
        if (this.ctx.drawingCanvas) {
            this.ctx.drawingCanvas.style.cursor = '';
        }
    }

    // ===== Pointer Events =====

    /**
     * Start panning: record initial positions
     */
    onPointerDown(e: PointerEvent): Delta[] {
        if (!this.adapter) return [];

        this.isPanning = true;
        this.startMouseX = e.clientX;
        this.startMouseY = e.clientY;
        this.startCanvasLeft = this.adapter.getCanvasLeft();
        this.startCanvasTop = this.adapter.getCanvasTop();

        if (this.ctx.drawingCanvas) {
            this.ctx.drawingCanvas.style.cursor = 'grabbing';
        }

        return [];
    }

    /**
     * Continue panning: update canvas position based on mouse delta
     */
    onPointerMove(e: PointerEvent): Delta[] {
        if (!this.isPanning || !this.adapter) return [];

        const deltaX = e.clientX - this.startMouseX;
        const deltaY = e.clientY - this.startMouseY;

        this.adapter.setCanvasPosition(
            this.startCanvasLeft + deltaX,
            this.startCanvasTop + deltaY
        );

        return [];
    }

    /**
     * Stop panning
     */
    onPointerUp(_e: PointerEvent): Delta[] {
        if (!this.isPanning) return [];
        this.isPanning = false;

        if (this.ctx.drawingCanvas) {
            this.ctx.drawingCanvas.style.cursor = 'grab';
        }

        return [];
    }

    /**
     * Cancel panning if pointer leaves
     */
    onPointerLeave(_e: PointerEvent): void {
        if (this.isPanning) {
            this.isPanning = false;
            if (this.ctx.drawingCanvas) {
                this.ctx.drawingCanvas.style.cursor = 'grab';
            }
        }
    }
}
