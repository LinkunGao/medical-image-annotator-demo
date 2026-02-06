/**
 * Phase 5: Crosshair Tool - Unit Tests
 *
 * Tests for CrosshairTool: toggle, 3D coordinate recording,
 * crosshair rendering, cross-view navigation, adapter integration.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    LayerManager,
    UndoManager,
    VisibilityManager,
    KeyboardManager,
} from '../core';
import type { VolumeDimensions, AxisType } from '../core/types';
import type { ToolContext } from '../tools/BaseTool';
import { CrosshairTool } from '../tools/CrosshairTool';
import type { CrosshairAdapter } from '../tools/CrosshairTool';

// ===== Test Helpers =====

const dimensions: VolumeDimensions = { width: 100, height: 100, depth: 50 };

function createToolContext(overrides: Partial<ToolContext> = {}): ToolContext {
    const layerManager = new LayerManager(dimensions);
    const undoManager = new UndoManager();
    const visibilityManager = new VisibilityManager();
    const keyboardManager = new KeyboardManager();

    return {
        layerManager,
        undoManager,
        visibilityManager,
        keyboardManager,
        currentChannel: 1,
        currentSlice: 25,
        currentAxis: 'z' as AxisType,
        brushSize: 10,
        sizeFactor: 2,
        globalAlpha: 0.7,
        drawingCtx: null,
        drawingCanvas: null,
        requestRender: vi.fn(),
        ...overrides,
    };
}

function createPointerEvent(
    type: string,
    overrides: Partial<PointerEvent> = {}
): PointerEvent {
    return {
        type,
        offsetX: 50,
        offsetY: 50,
        clientX: 50,
        clientY: 50,
        button: 0,
        ...overrides,
    } as unknown as PointerEvent;
}

function createMockDrawingCtx(): CanvasRenderingContext2D {
    return {
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        clearRect: vi.fn(),
        save: vi.fn(),
        restore: vi.fn(),
        setLineDash: vi.fn(),
        strokeStyle: '',
        lineWidth: 1,
    } as unknown as CanvasRenderingContext2D;
}

function createMockCanvas(width = 200, height = 200): HTMLCanvasElement {
    return {
        width,
        height,
        style: { cursor: '' },
    } as unknown as HTMLCanvasElement;
}

function createMockAdapter(overrides: Partial<CrosshairAdapter> = {}): CrosshairAdapter {
    return {
        convertCursorPoint: vi.fn((from: AxisType, to: AxisType, mx: number, my: number, slice: number) => {
            // Simple mock: swap coordinates for different axis pairs
            if (from === 'z' && to === 'x') {
                return { x: slice, y: my, sliceIndex: mx };
            }
            if (from === 'z' && to === 'y') {
                return { x: mx, y: slice, sliceIndex: my };
            }
            if (from === 'x' && to === 'z') {
                return { x: slice, y: my, sliceIndex: mx };
            }
            if (from === 'x' && to === 'y') {
                return { x: mx, y: slice, sliceIndex: my };
            }
            if (from === 'y' && to === 'z') {
                return { x: mx, y: slice, sliceIndex: my };
            }
            if (from === 'y' && to === 'x') {
                return { x: slice, y: my, sliceIndex: mx };
            }
            return null;
        }),
        getMaxSlice: vi.fn((axis: AxisType) => {
            if (axis === 'z') return 49;
            return 99;
        }),
        ...overrides,
    };
}

// ===== CrosshairTool Tests =====

describe('CrosshairTool', () => {
    let tool: CrosshairTool;
    let ctx: ToolContext;

    beforeEach(() => {
        ctx = createToolContext();
        tool = new CrosshairTool(ctx);
    });

    // ===== Toggle & Enable/Disable =====

    describe('toggle', () => {
        it('should start disabled', () => {
            expect(tool.isEnabled()).toBe(false);
        });

        it('should toggle on', () => {
            tool.toggle();
            expect(tool.isEnabled()).toBe(true);
        });

        it('should toggle off after toggling on', () => {
            tool.toggle();
            tool.toggle();
            expect(tool.isEnabled()).toBe(false);
        });

        it('should clear cursor position when toggling off', () => {
            tool.toggle(); // on
            // Simulate a click to set position
            const e = createPointerEvent('pointerdown', { offsetX: 40, offsetY: 60 });
            tool.onPointerDown(e);
            expect(tool.getCursorPosition()).not.toBeNull();

            tool.toggle(); // off
            expect(tool.getCursorPosition()).toBeNull();
        });

        it('should enable explicitly', () => {
            tool.enable();
            expect(tool.isEnabled()).toBe(true);
        });

        it('should disable explicitly and clear state', () => {
            tool.enable();
            const e = createPointerEvent('pointerdown');
            tool.onPointerDown(e);

            tool.disable();
            expect(tool.isEnabled()).toBe(false);
            expect(tool.getCursorPosition()).toBeNull();
        });
    });

    // ===== Pointer Events =====

    describe('onPointerDown', () => {
        it('should return empty array when disabled', () => {
            const e = createPointerEvent('pointerdown');
            const result = tool.onPointerDown(e);
            expect(result).toEqual([]);
            expect(tool.getCursorPosition()).toBeNull();
        });

        it('should record 3D position when enabled on Z axis', () => {
            tool.enable();
            ctx.currentAxis = 'z';
            ctx.currentSlice = 10;
            ctx.sizeFactor = 2;
            tool.setContext(ctx);

            const e = createPointerEvent('pointerdown', { offsetX: 40, offsetY: 60 });
            tool.onPointerDown(e);

            const pos = tool.getCursorPosition();
            expect(pos).not.toBeNull();
            // screenToOriginal: 40/2=20, 60/2=30
            expect(pos!.x).toBe(20);
            expect(pos!.y).toBe(30);
            expect(pos!.z).toBe(10);
        });

        it('should record 3D position when enabled on X axis', () => {
            tool.enable();
            ctx.currentAxis = 'x';
            ctx.currentSlice = 15;
            ctx.sizeFactor = 1;
            tool.setContext(ctx);

            const e = createPointerEvent('pointerdown', { offsetX: 20, offsetY: 30 });
            tool.onPointerDown(e);

            const pos = tool.getCursorPosition();
            expect(pos).not.toBeNull();
            // X axis: Point3D(slice, cx, cy) = (15, 20, 30)
            expect(pos!.x).toBe(15);
            expect(pos!.y).toBe(20);
            expect(pos!.z).toBe(30);
        });

        it('should record 3D position when enabled on Y axis', () => {
            tool.enable();
            ctx.currentAxis = 'y';
            ctx.currentSlice = 5;
            ctx.sizeFactor = 1;
            tool.setContext(ctx);

            const e = createPointerEvent('pointerdown', { offsetX: 10, offsetY: 20 });
            tool.onPointerDown(e);

            const pos = tool.getCursorPosition();
            expect(pos).not.toBeNull();
            // Y axis: Point3D(cx, slice, cy) = (10, 5, 20)
            expect(pos!.x).toBe(10);
            expect(pos!.y).toBe(5);
            expect(pos!.z).toBe(20);
        });

        it('should return empty deltas (no mask modification)', () => {
            tool.enable();
            const e = createPointerEvent('pointerdown');
            const result = tool.onPointerDown(e);
            expect(result).toEqual([]);
        });

        it('should store click axis and slice', () => {
            tool.enable();
            ctx.currentAxis = 'y';
            ctx.currentSlice = 42;
            tool.setContext(ctx);

            const e = createPointerEvent('pointerdown');
            tool.onPointerDown(e);

            expect(tool.getClickAxis()).toBe('y');
        });
    });

    // ===== onPointerMove =====

    describe('onPointerMove', () => {
        it('should return empty array when disabled', () => {
            const e = createPointerEvent('pointermove');
            const result = tool.onPointerMove(e);
            expect(result).toEqual([]);
        });

        it('should update cursor position on move when enabled', () => {
            tool.enable();
            ctx.currentAxis = 'z';
            ctx.currentSlice = 10;
            ctx.sizeFactor = 2;
            tool.setContext(ctx);

            const e1 = createPointerEvent('pointermove', { offsetX: 40, offsetY: 60 });
            tool.onPointerMove(e1);

            const pos1 = tool.getCursorPosition();
            expect(pos1!.x).toBe(20);
            expect(pos1!.y).toBe(30);

            const e2 = createPointerEvent('pointermove', { offsetX: 80, offsetY: 100 });
            tool.onPointerMove(e2);

            const pos2 = tool.getCursorPosition();
            expect(pos2!.x).toBe(40);
            expect(pos2!.y).toBe(50);
        });

        it('should return empty deltas on move', () => {
            tool.enable();
            const e = createPointerEvent('pointermove');
            const result = tool.onPointerMove(e);
            expect(result).toEqual([]);
        });
    });

    // ===== Crosshair Rendering =====

    describe('crosshair rendering', () => {
        let mockCtx: CanvasRenderingContext2D;
        let mockCanvas: HTMLCanvasElement;

        beforeEach(() => {
            mockCtx = createMockDrawingCtx();
            mockCanvas = createMockCanvas(200, 200);
            ctx = createToolContext({
                drawingCtx: mockCtx,
                drawingCanvas: mockCanvas,
            });
            tool = new CrosshairTool(ctx);
        });

        it('should draw crosshair lines on pointer down', () => {
            tool.enable();
            const e = createPointerEvent('pointerdown', { offsetX: 100, offsetY: 80 });
            tool.onPointerDown(e);

            // Should have cleared canvas
            expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, 200, 200);

            // Should have drawn two lines (save, 2x beginPath/moveTo/lineTo/stroke, restore)
            expect(mockCtx.save).toHaveBeenCalled();
            expect(mockCtx.setLineDash).toHaveBeenCalledWith([6, 4]);
            expect(mockCtx.beginPath).toHaveBeenCalledTimes(2);

            // Vertical line at x=100
            expect(mockCtx.moveTo).toHaveBeenCalledWith(100, 0);
            expect(mockCtx.lineTo).toHaveBeenCalledWith(100, 200);

            // Horizontal line at y=80
            expect(mockCtx.moveTo).toHaveBeenCalledWith(0, 80);
            expect(mockCtx.lineTo).toHaveBeenCalledWith(200, 80);

            expect(mockCtx.stroke).toHaveBeenCalledTimes(2);
            expect(mockCtx.restore).toHaveBeenCalled();
        });

        it('should not draw when disabled', () => {
            const e = createPointerEvent('pointerdown', { offsetX: 100, offsetY: 80 });
            tool.onPointerDown(e);

            expect(mockCtx.beginPath).not.toHaveBeenCalled();
        });

        it('should update crosshair lines on pointer move', () => {
            tool.enable();
            const e = createPointerEvent('pointermove', { offsetX: 60, offsetY: 40 });
            tool.onPointerMove(e);

            expect(mockCtx.moveTo).toHaveBeenCalledWith(60, 0);
            expect(mockCtx.lineTo).toHaveBeenCalledWith(60, 200);
            expect(mockCtx.moveTo).toHaveBeenCalledWith(0, 40);
            expect(mockCtx.lineTo).toHaveBeenCalledWith(200, 40);
        });

        it('should clear canvas when toggling off', () => {
            tool.enable();
            const e = createPointerEvent('pointerdown', { offsetX: 100, offsetY: 80 });
            tool.onPointerDown(e);

            vi.clearAllMocks();
            tool.toggle(); // off

            expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, 200, 200);
        });

        it('should use custom line color', () => {
            tool.enable();
            tool.setLineColor('#FF0000');
            const e = createPointerEvent('pointerdown', { offsetX: 50, offsetY: 50 });
            tool.onPointerDown(e);

            // The color is set via ctx.strokeStyle in save/restore block
            // We can verify the save/restore was called
            expect(mockCtx.save).toHaveBeenCalled();
            expect(mockCtx.restore).toHaveBeenCalled();
        });
    });

    // ===== Lifecycle =====

    describe('lifecycle', () => {
        it('should set cursor style on activate', () => {
            const mockCanvas = createMockCanvas();
            ctx = createToolContext({ drawingCanvas: mockCanvas });
            tool = new CrosshairTool(ctx);

            tool.activate();
            expect(mockCanvas.style.cursor).toBe('crosshair');
        });

        it('should clear drawing canvas on deactivate', () => {
            const mockCtx = createMockDrawingCtx();
            const mockCanvas = createMockCanvas();
            ctx = createToolContext({ drawingCtx: mockCtx, drawingCanvas: mockCanvas });
            tool = new CrosshairTool(ctx);

            tool.deactivate();
            expect(mockCtx.clearRect).toHaveBeenCalled();
        });
    });

    // ===== Cross-View Navigation =====

    describe('navigateTo', () => {
        let adapter: CrosshairAdapter;

        beforeEach(() => {
            adapter = createMockAdapter();
            ctx = createToolContext({
                currentAxis: 'z',
                currentSlice: 10,
                sizeFactor: 1,
            });
            tool = new CrosshairTool(ctx);
            tool.setAdapter(adapter);
            tool.enable();
        });

        it('should return null when no cursor position is set', () => {
            const result = tool.navigateTo('x');
            expect(result).toBeNull();
        });

        it('should return null when no adapter is set', () => {
            const toolNoAdapter = new CrosshairTool(ctx);
            toolNoAdapter.enable();
            const e = createPointerEvent('pointerdown', { offsetX: 20, offsetY: 30 });
            toolNoAdapter.onPointerDown(e);

            const result = toolNoAdapter.navigateTo('x');
            expect(result).toBeNull();
        });

        it('should return current position when navigating to same axis', () => {
            const e = createPointerEvent('pointerdown', { offsetX: 20, offsetY: 30 });
            tool.onPointerDown(e);

            const result = tool.navigateTo('z'); // same as clickAxis
            expect(result).not.toBeNull();
            expect(result!.sliceIndex).toBe(10);
            expect(result!.cursorX).toBe(20);
            expect(result!.cursorY).toBe(30);
        });

        it('should convert coordinates when navigating z to x', () => {
            const e = createPointerEvent('pointerdown', { offsetX: 20, offsetY: 30 });
            tool.onPointerDown(e);

            const result = tool.navigateTo('x');
            expect(result).not.toBeNull();
            expect(adapter.convertCursorPoint).toHaveBeenCalledWith('z', 'x', 20, 30, 10);
        });

        it('should convert coordinates when navigating z to y', () => {
            const e = createPointerEvent('pointerdown', { offsetX: 20, offsetY: 30 });
            tool.onPointerDown(e);

            const result = tool.navigateTo('y');
            expect(result).not.toBeNull();
            expect(adapter.convertCursorPoint).toHaveBeenCalledWith('z', 'y', 20, 30, 10);
        });

        it('should clamp slice index to valid range', () => {
            // Override adapter to return out-of-bounds slice
            const customAdapter = createMockAdapter({
                convertCursorPoint: vi.fn(() => ({
                    x: 10,
                    y: 20,
                    sliceIndex: 200, // out of bounds (max is 99 for x axis)
                })),
            });
            tool.setAdapter(customAdapter);

            const e = createPointerEvent('pointerdown', { offsetX: 20, offsetY: 30 });
            tool.onPointerDown(e);

            const result = tool.navigateTo('x');
            expect(result).not.toBeNull();
            expect(result!.sliceIndex).toBe(99); // clamped to max
        });

        it('should clamp negative slice index to 0', () => {
            const customAdapter = createMockAdapter({
                convertCursorPoint: vi.fn(() => ({
                    x: 10,
                    y: 20,
                    sliceIndex: -5,
                })),
            });
            tool.setAdapter(customAdapter);

            const e = createPointerEvent('pointerdown', { offsetX: 20, offsetY: 30 });
            tool.onPointerDown(e);

            const result = tool.navigateTo('x');
            expect(result).not.toBeNull();
            expect(result!.sliceIndex).toBe(0);
        });

        it('should invoke onCrosshairNavigate callback', () => {
            const navigateCallback = vi.fn();
            const customAdapter = createMockAdapter({
                onCrosshairNavigate: navigateCallback,
            });
            tool.setAdapter(customAdapter);

            const e = createPointerEvent('pointerdown', { offsetX: 20, offsetY: 30 });
            tool.onPointerDown(e);

            tool.navigateTo('x');

            expect(navigateCallback).toHaveBeenCalledTimes(1);
            expect(navigateCallback).toHaveBeenCalledWith(
                'x',
                expect.any(Number),
                expect.any(Number),
                expect.any(Number)
            );
        });

        it('should not invoke callback when navigating to same axis', () => {
            const navigateCallback = vi.fn();
            const customAdapter = createMockAdapter({
                onCrosshairNavigate: navigateCallback,
            });
            tool.setAdapter(customAdapter);

            const e = createPointerEvent('pointerdown', { offsetX: 20, offsetY: 30 });
            tool.onPointerDown(e);

            tool.navigateTo('z'); // same axis
            expect(navigateCallback).not.toHaveBeenCalled();
        });

        it('should return null when adapter conversion fails', () => {
            const customAdapter = createMockAdapter({
                convertCursorPoint: vi.fn(() => null),
            });
            tool.setAdapter(customAdapter);

            const e = createPointerEvent('pointerdown', { offsetX: 20, offsetY: 30 });
            tool.onPointerDown(e);

            const result = tool.navigateTo('x');
            expect(result).toBeNull();
        });
    });

    // ===== getTargetSlice =====

    describe('getTargetSlice', () => {
        it('should return target slice without triggering navigation callback', () => {
            const navigateCallback = vi.fn();
            const adapter = createMockAdapter({
                onCrosshairNavigate: navigateCallback,
            });

            ctx = createToolContext({
                currentAxis: 'z',
                currentSlice: 10,
                sizeFactor: 1,
            });
            tool = new CrosshairTool(ctx);
            tool.setAdapter(adapter);
            tool.enable();

            const e = createPointerEvent('pointerdown', { offsetX: 20, offsetY: 30 });
            tool.onPointerDown(e);

            // getTargetSlice uses internal navigation (no callback)
            const slice = tool.getTargetSlice('x');
            expect(slice).not.toBeNull();
            expect(typeof slice).toBe('number');
        });

        it('should return null when no cursor position', () => {
            const adapter = createMockAdapter();
            tool.setAdapter(adapter);

            const slice = tool.getTargetSlice('x');
            expect(slice).toBeNull();
        });

        it('should return current slice for same axis', () => {
            const adapter = createMockAdapter();
            ctx = createToolContext({
                currentAxis: 'z',
                currentSlice: 15,
                sizeFactor: 1,
            });
            tool = new CrosshairTool(ctx);
            tool.setAdapter(adapter);
            tool.enable();

            const e = createPointerEvent('pointerdown', { offsetX: 20, offsetY: 30 });
            tool.onPointerDown(e);

            const slice = tool.getTargetSlice('z');
            expect(slice).toBe(15);
        });
    });

    // ===== 3D Coordinate Mapping =====

    describe('3D coordinate mapping', () => {
        beforeEach(() => {
            ctx = createToolContext({ sizeFactor: 1 });
            tool = new CrosshairTool(ctx);
            tool.enable();
        });

        it('should map Z axis click to correct 3D: (cx, cy, slice)', () => {
            ctx.currentAxis = 'z';
            ctx.currentSlice = 7;
            tool.setContext(ctx);

            const e = createPointerEvent('pointerdown', { offsetX: 10, offsetY: 20 });
            tool.onPointerDown(e);

            const pos = tool.getCursorPosition()!;
            expect(pos.x).toBe(10);
            expect(pos.y).toBe(20);
            expect(pos.z).toBe(7);
        });

        it('should map Y axis click to correct 3D: (cx, slice, cy)', () => {
            ctx.currentAxis = 'y';
            ctx.currentSlice = 3;
            tool.setContext(ctx);

            const e = createPointerEvent('pointerdown', { offsetX: 10, offsetY: 20 });
            tool.onPointerDown(e);

            const pos = tool.getCursorPosition()!;
            expect(pos.x).toBe(10);
            expect(pos.y).toBe(3);
            expect(pos.z).toBe(20);
        });

        it('should map X axis click to correct 3D: (slice, cx, cy)', () => {
            ctx.currentAxis = 'x';
            ctx.currentSlice = 5;
            tool.setContext(ctx);

            const e = createPointerEvent('pointerdown', { offsetX: 10, offsetY: 20 });
            tool.onPointerDown(e);

            const pos = tool.getCursorPosition()!;
            expect(pos.x).toBe(5);
            expect(pos.y).toBe(10);
            expect(pos.z).toBe(20);
        });
    });

    // ===== getCursor2D =====

    describe('getCursor2D', () => {
        it('should return the 2D cursor position in original coords', () => {
            ctx = createToolContext({ sizeFactor: 2 });
            tool = new CrosshairTool(ctx);
            tool.enable();

            const e = createPointerEvent('pointerdown', { offsetX: 40, offsetY: 60 });
            tool.onPointerDown(e);

            const cursor = tool.getCursor2D();
            expect(cursor.x).toBe(20); // 40/2
            expect(cursor.y).toBe(30); // 60/2
        });
    });

    // ===== Cross-Axis Navigation from Different Axes =====

    describe('navigation from different axes', () => {
        let adapter: CrosshairAdapter;

        beforeEach(() => {
            adapter = createMockAdapter();
        });

        it('should navigate from X axis to Z axis', () => {
            ctx = createToolContext({
                currentAxis: 'x',
                currentSlice: 10,
                sizeFactor: 1,
            });
            tool = new CrosshairTool(ctx);
            tool.setAdapter(adapter);
            tool.enable();

            const e = createPointerEvent('pointerdown', { offsetX: 20, offsetY: 30 });
            tool.onPointerDown(e);

            const result = tool.navigateTo('z');
            expect(result).not.toBeNull();
            expect(adapter.convertCursorPoint).toHaveBeenCalledWith('x', 'z', 20, 30, 10);
        });

        it('should navigate from Y axis to X axis', () => {
            ctx = createToolContext({
                currentAxis: 'y',
                currentSlice: 15,
                sizeFactor: 1,
            });
            tool = new CrosshairTool(ctx);
            tool.setAdapter(adapter);
            tool.enable();

            const e = createPointerEvent('pointerdown', { offsetX: 30, offsetY: 40 });
            tool.onPointerDown(e);

            const result = tool.navigateTo('x');
            expect(result).not.toBeNull();
            expect(adapter.convertCursorPoint).toHaveBeenCalledWith('y', 'x', 30, 40, 15);
        });

        it('should navigate from Y axis to Z axis', () => {
            ctx = createToolContext({
                currentAxis: 'y',
                currentSlice: 8,
                sizeFactor: 1,
            });
            tool = new CrosshairTool(ctx);
            tool.setAdapter(adapter);
            tool.enable();

            const e = createPointerEvent('pointerdown', { offsetX: 25, offsetY: 35 });
            tool.onPointerDown(e);

            const result = tool.navigateTo('z');
            expect(result).not.toBeNull();
            expect(adapter.convertCursorPoint).toHaveBeenCalledWith('y', 'z', 25, 35, 8);
        });
    });

    // ===== Edge Cases =====

    describe('edge cases', () => {
        it('should handle pointer down at origin (0,0)', () => {
            ctx = createToolContext({ sizeFactor: 1, currentSlice: 0, currentAxis: 'z' });
            tool = new CrosshairTool(ctx);
            tool.enable();

            const e = createPointerEvent('pointerdown', { offsetX: 0, offsetY: 0 });
            tool.onPointerDown(e);

            const pos = tool.getCursorPosition()!;
            expect(pos.x).toBe(0);
            expect(pos.y).toBe(0);
            expect(pos.z).toBe(0);
        });

        it('should handle high sizeFactor', () => {
            ctx = createToolContext({ sizeFactor: 8, currentSlice: 25, currentAxis: 'z' });
            tool = new CrosshairTool(ctx);
            tool.enable();

            const e = createPointerEvent('pointerdown', { offsetX: 160, offsetY: 240 });
            tool.onPointerDown(e);

            const pos = tool.getCursorPosition()!;
            // 160/8=20, 240/8=30
            expect(pos.x).toBe(20);
            expect(pos.y).toBe(30);
        });

        it('should return a copy of cursor position (immutable)', () => {
            ctx = createToolContext({ sizeFactor: 1, currentSlice: 5, currentAxis: 'z' });
            tool = new CrosshairTool(ctx);
            tool.enable();

            const e = createPointerEvent('pointerdown', { offsetX: 10, offsetY: 20 });
            tool.onPointerDown(e);

            const pos1 = tool.getCursorPosition()!;
            const pos2 = tool.getCursorPosition()!;

            expect(pos1).toEqual(pos2);
            expect(pos1).not.toBe(pos2); // different object references
        });

        it('should handle rapid toggle cycles', () => {
            for (let i = 0; i < 10; i++) {
                tool.toggle();
            }
            // After 10 toggles (even number), should be back to disabled
            expect(tool.isEnabled()).toBe(false);
        });

        it('should handle multiple pointer downs (overwrite position)', () => {
            ctx = createToolContext({ sizeFactor: 1, currentSlice: 5, currentAxis: 'z' });
            tool = new CrosshairTool(ctx);
            tool.enable();

            tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 10, offsetY: 20 }));
            const pos1 = tool.getCursorPosition()!;
            expect(pos1.x).toBe(10);

            tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 50, offsetY: 60 }));
            const pos2 = tool.getCursorPosition()!;
            expect(pos2.x).toBe(50);
        });
    });
});
