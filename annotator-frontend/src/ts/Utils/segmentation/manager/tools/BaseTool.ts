/**
 * BaseTool - Abstract Tool Interface & Base Class
 *
 * Phase 3 - Tool Abstraction
 *
 * Defines the ToolContext shared by all tools, and provides coordinate
 * conversion utilities (screenToOriginal / originalToScreen).
 *
 * All drawing tools extend this class and implement onPointerDown/Move/Up.
 */

import type { LayerManager } from '../core/LayerManager';
import type { UndoManager } from '../core/UndoManager';
import type { VisibilityManager } from '../core/VisibilityManager';
import type { KeyboardManager } from '../core/KeyboardManager';
import type { AxisType, Delta, Point2D } from '../core/types';

// ===== Tool Context =====

/**
 * Shared context injected into every tool.
 * Provides access to managers, current state, and canvas contexts.
 */
export interface ToolContext {
    /** Layer manager for mask data operations */
    layerManager: LayerManager;
    /** Undo/redo manager */
    undoManager: UndoManager;
    /** Visibility manager */
    visibilityManager: VisibilityManager;
    /** Keyboard manager */
    keyboardManager: KeyboardManager;

    /** Current active channel (0-8) */
    currentChannel: number;
    /** Current slice index */
    currentSlice: number;
    /** Current viewing axis */
    currentAxis: AxisType;
    /** Brush/eraser size in screen pixels */
    brushSize: number;
    /** Current zoom factor (screen pixels / original pixels) */
    sizeFactor: number;
    /** Global mask opacity. Adjusted by GUI, tools should not modify this. */
    globalAlpha: number;

    /**
     * Drawing layer canvas context (for temporary previews: outlines, cursors)
     * This is the middle canvas layer used for real-time preview rendering.
     */
    drawingCtx: CanvasRenderingContext2D | null;

    /**
     * Drawing layer canvas element (for cursor style, dimensions)
     */
    drawingCanvas: HTMLCanvasElement | null;

    /**
     * Request a mask re-render after data changes
     */
    requestRender: () => void;
}

// ===== Tool State =====

export type ToolName =
    | 'pencil'
    | 'brush'
    | 'eraser'
    | 'pan'
    | 'zoom'
    | 'contrast'
    | 'crosshair'
    | 'sphere'
    | 'calculator'
    | 'none';

// ===== Abstract Base Tool =====

/**
 * Abstract base class for all segmentation tools.
 *
 * Provides:
 * - Coordinate conversion between screen and original dimensions
 * - Common lifecycle methods (activate/deactivate)
 * - Pointer event interface for subclasses to implement
 */
export abstract class BaseTool {
    /** Tool identifier */
    abstract readonly name: ToolName;

    /** Shared context reference */
    protected ctx: ToolContext;

    constructor(ctx: ToolContext) {
        this.ctx = ctx;
    }

    /**
     * Update the shared context reference.
     * Called when context values change (e.g., slice switch, zoom change).
     */
    setContext(ctx: ToolContext): void {
        this.ctx = ctx;
    }

    // ===== Coordinate Conversion =====

    /**
     * Convert screen coordinates to original (data) coordinates.
     * Screen coords come from mouse events on the zoomed canvas.
     * Original coords index into the Uint8Array mask data.
     */
    protected screenToOriginal(screenX: number, screenY: number): Point2D {
        return {
            x: Math.floor(screenX / this.ctx.sizeFactor),
            y: Math.floor(screenY / this.ctx.sizeFactor),
        };
    }

    /**
     * Convert original (data) coordinates to screen coordinates.
     * Used for rendering previews on the drawing canvas.
     */
    protected originalToScreen(origX: number, origY: number): Point2D {
        return {
            x: origX * this.ctx.sizeFactor,
            y: origY * this.ctx.sizeFactor,
        };
    }

    /**
     * Convert brush size from screen pixels to original dimension pixels.
     */
    protected screenBrushToOriginal(screenBrushSize: number): number {
        return Math.max(1, Math.floor(screenBrushSize / this.ctx.sizeFactor));
    }

    // ===== Lifecycle =====

    /**
     * Called when this tool becomes the active tool.
     * Override to set up cursor styles, event listeners, etc.
     */
    activate(): void {
        // Base implementation: no-op
    }

    /**
     * Called when this tool is deactivated (another tool takes over).
     * Override to clean up cursor styles, temporary drawings, etc.
     */
    deactivate(): void {
        // Base implementation: no-op
    }

    // ===== Pointer Events (subclasses implement as needed) =====

    /**
     * Handle pointer down event.
     * @returns Delta array if the operation modified mask data, empty otherwise.
     */
    onPointerDown(e: PointerEvent): Delta[] {
        return [];
    }

    /**
     * Handle pointer move event.
     * @returns Delta array if the operation modified mask data, empty otherwise.
     */
    onPointerMove(e: PointerEvent): Delta[] {
        return [];
    }

    /**
     * Handle pointer up event.
     * @returns Delta array if the operation modified mask data, empty otherwise.
     */
    onPointerUp(e: PointerEvent): Delta[] {
        return [];
    }

    /**
     * Handle pointer leave event (mouse exits canvas).
     */
    onPointerLeave(e: PointerEvent): void {
        // Base implementation: no-op
    }

    /**
     * Handle wheel event (zoom or slice scroll).
     */
    onWheel(e: WheelEvent): void {
        // Base implementation: no-op
    }

    // ===== Utility =====

    /**
     * Clear the drawing preview canvas.
     */
    protected clearDrawingCanvas(): void {
        const ctx = this.ctx.drawingCtx;
        const canvas = this.ctx.drawingCanvas;
        if (ctx && canvas) {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
    }
}
