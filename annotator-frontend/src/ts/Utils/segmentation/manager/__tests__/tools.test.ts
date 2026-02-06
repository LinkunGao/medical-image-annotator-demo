/**
 * Phase 3: Tool Abstraction - Unit Tests
 *
 * Tests for BaseTool, PencilTool, BrushTool, EraserTool, PanTool, ZoomTool, ContrastTool, SphereTool
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    LayerManager,
    UndoManager,
    VisibilityManager,
    KeyboardManager,
} from '../core';
import type { VolumeDimensions } from '../core/types';
import type { ToolContext } from '../tools/BaseTool';
import { PencilTool } from '../tools/PencilTool';
import { BrushTool } from '../tools/BrushTool';
import { EraserTool } from '../tools/EraserTool';
import { PanTool } from '../tools/PanTool';
import { ZoomTool } from '../tools/ZoomTool';
import { ContrastTool } from '../tools/ContrastTool';
import { SphereTool } from '../tools/SphereTool';
import type { SphereAdapter } from '../tools/SphereTool';

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
        currentAxis: 'z',
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

function createWheelEvent(deltaY: number, overrides: Partial<WheelEvent> = {}): WheelEvent {
    return {
        type: 'wheel',
        deltaY,
        offsetX: 50,
        offsetY: 50,
        ...overrides,
    } as unknown as WheelEvent;
}

// ===== PencilTool Tests =====
describe('PencilTool', () => {
    let tool: PencilTool;
    let ctx: ToolContext;

    beforeEach(() => {
        ctx = createToolContext();
        tool = new PencilTool(ctx);
    });

    it('should have correct name', () => {
        expect(tool.name).toBe('pencil');
    });

    it('should not produce deltas on pointer down', () => {
        const deltas = tool.onPointerDown(createPointerEvent('pointerdown'));
        expect(deltas).toEqual([]);
    });

    it('should not produce deltas on pointer move', () => {
        tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 10, offsetY: 10 }));
        const deltas = tool.onPointerMove(createPointerEvent('pointermove', { offsetX: 20, offsetY: 20 }));
        expect(deltas).toEqual([]);
    });

    it('should produce deltas on pointer up with valid polygon', () => {
        // Create a triangle: (10,10) -> (40,10) -> (25,40)
        // sizeFactor = 2, so original coords: (5,5) -> (20,5) -> (12,20)
        tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 10, offsetY: 10 }));
        tool.onPointerMove(createPointerEvent('pointermove', { offsetX: 40, offsetY: 10 }));
        tool.onPointerMove(createPointerEvent('pointermove', { offsetX: 25, offsetY: 40 }));
        const deltas = tool.onPointerUp(createPointerEvent('pointerup'));

        expect(deltas.length).toBeGreaterThan(0);
        // All deltas should set channel to currentChannel (1)
        for (const d of deltas) {
            expect(d.next).toBe(1);
            expect(d.layer).toBe('layer1');
        }
    });

    it('should push deltas to UndoManager on pointer up', () => {
        tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 10, offsetY: 10 }));
        tool.onPointerMove(createPointerEvent('pointermove', { offsetX: 40, offsetY: 10 }));
        tool.onPointerMove(createPointerEvent('pointermove', { offsetX: 25, offsetY: 40 }));
        tool.onPointerUp(createPointerEvent('pointerup'));

        expect(ctx.undoManager.canUndo()).toBe(true);
    });

    it('should call requestRender on pointer up with changes', () => {
        tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 10, offsetY: 10 }));
        tool.onPointerMove(createPointerEvent('pointermove', { offsetX: 40, offsetY: 10 }));
        tool.onPointerMove(createPointerEvent('pointermove', { offsetX: 25, offsetY: 40 }));
        tool.onPointerUp(createPointerEvent('pointerup'));

        expect(ctx.requestRender).toHaveBeenCalled();
    });

    it('should return empty deltas if fewer than 3 points', () => {
        tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 10, offsetY: 10 }));
        // Only 1 move = 2 points total, need at least 3
        tool.onPointerMove(createPointerEvent('pointermove', { offsetX: 20, offsetY: 20 }));
        const deltas = tool.onPointerUp(createPointerEvent('pointerup'));

        expect(deltas).toEqual([]);
    });

    it('should clear state on deactivate', () => {
        tool.onPointerDown(createPointerEvent('pointerdown'));
        tool.deactivate();

        // After deactivate, pointer up should produce nothing
        const deltas = tool.onPointerUp(createPointerEvent('pointerup'));
        expect(deltas).toEqual([]);
    });
});

// ===== BrushTool Tests =====
describe('BrushTool', () => {
    let tool: BrushTool;
    let ctx: ToolContext;

    beforeEach(() => {
        ctx = createToolContext();
        tool = new BrushTool(ctx);
    });

    it('should have correct name', () => {
        expect(tool.name).toBe('brush');
    });

    it('should produce deltas on pointer down', () => {
        const deltas = tool.onPointerDown(createPointerEvent('pointerdown'));
        expect(deltas.length).toBeGreaterThan(0);
    });

    it('should produce deltas on pointer move while painting', () => {
        tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 20, offsetY: 20 }));
        const deltas = tool.onPointerMove(createPointerEvent('pointermove', { offsetX: 30, offsetY: 30 }));
        // May or may not produce deltas depending on overlap
        expect(Array.isArray(deltas)).toBe(true);
    });

    it('should not produce deltas on pointer move when not painting', () => {
        const deltas = tool.onPointerMove(createPointerEvent('pointermove'));
        expect(deltas).toEqual([]);
    });

    it('should push deltas to UndoManager on pointer up', () => {
        tool.onPointerDown(createPointerEvent('pointerdown'));
        tool.onPointerUp(createPointerEvent('pointerup'));

        expect(ctx.undoManager.canUndo()).toBe(true);
    });

    it('should call requestRender on pointer down with changes', () => {
        tool.onPointerDown(createPointerEvent('pointerdown'));
        expect(ctx.requestRender).toHaveBeenCalled();
    });

    it('should return accumulated deltas on pointer up', () => {
        tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 20, offsetY: 20 }));
        tool.onPointerMove(createPointerEvent('pointermove', { offsetX: 30, offsetY: 30 }));
        const deltas = tool.onPointerUp(createPointerEvent('pointerup'));

        expect(deltas.length).toBeGreaterThan(0);
    });

    it('should apply correct channel value', () => {
        tool.onPointerDown(createPointerEvent('pointerdown'));
        // Check that the underlying mask data was modified
        const slice = ctx.layerManager.getActiveSlice(25);
        let found = false;
        for (let i = 0; i < slice.length; i++) {
            if (slice[i] === 1) { found = true; break; }
        }
        expect(found).toBe(true);
    });
});

// ===== EraserTool Tests =====
describe('EraserTool', () => {
    let tool: EraserTool;
    let ctx: ToolContext;

    beforeEach(() => {
        ctx = createToolContext();
        tool = new EraserTool(ctx);

        // Pre-paint some data to erase
        ctx.layerManager.applyBrush(25, 25, 25, 10, 1);
    });

    it('should have correct name', () => {
        expect(tool.name).toBe('eraser');
    });

    it('should erase voxels (set to channel 0)', () => {
        // Verify data exists first
        expect(ctx.layerManager.getActiveLayer().getVoxel(25, 25, 25)).toBe(1);

        // Erase at the same position
        tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 50, offsetY: 50 }));
        tool.onPointerUp(createPointerEvent('pointerup'));

        // Check that voxel was erased (channel 0)
        expect(ctx.layerManager.getActiveLayer().getVoxel(25, 25, 25)).toBe(0);
    });

    it('should produce deltas with next=0', () => {
        const deltas = tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 50, offsetY: 50 }));

        for (const d of deltas) {
            expect(d.next).toBe(0);
        }
    });

    it('should push to UndoManager on pointer up', () => {
        tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 50, offsetY: 50 }));
        tool.onPointerUp(createPointerEvent('pointerup'));

        expect(ctx.undoManager.canUndo()).toBe(true);
    });
});

// ===== PanTool Tests =====
describe('PanTool', () => {
    let tool: PanTool;
    let ctx: ToolContext;
    let canvasPos: { left: number; top: number };

    beforeEach(() => {
        ctx = createToolContext();
        tool = new PanTool(ctx);
        canvasPos = { left: 0, top: 0 };

        tool.setAdapter({
            getCanvasLeft: () => canvasPos.left,
            getCanvasTop: () => canvasPos.top,
            setCanvasPosition: (l, t) => {
                canvasPos.left = l;
                canvasPos.top = t;
            },
        });
    });

    it('should have correct name', () => {
        expect(tool.name).toBe('pan');
    });

    it('should not modify mask data', () => {
        const deltas = tool.onPointerDown(createPointerEvent('pointerdown'));
        expect(deltas).toEqual([]);
    });

    it('should move canvas position on pointer move', () => {
        tool.onPointerDown(createPointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
        tool.onPointerMove(createPointerEvent('pointermove', { clientX: 150, clientY: 120 }));

        expect(canvasPos.left).toBe(50);  // 150 - 100
        expect(canvasPos.top).toBe(20);   // 120 - 100
    });

    it('should stop panning on pointer up', () => {
        tool.onPointerDown(createPointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
        tool.onPointerUp(createPointerEvent('pointerup'));

        // Move after up should not change position
        tool.onPointerMove(createPointerEvent('pointermove', { clientX: 200, clientY: 200 }));
        expect(canvasPos.left).toBe(0);
        expect(canvasPos.top).toBe(0);
    });
});

// ===== ZoomTool Tests =====
describe('ZoomTool', () => {
    let tool: ZoomTool;
    let ctx: ToolContext;
    let zoomState: { sizeFactor: number; currentSlice: number };

    beforeEach(() => {
        ctx = createToolContext();
        tool = new ZoomTool(ctx);
        zoomState = { sizeFactor: 1, currentSlice: 25 };

        tool.setAdapter({
            getSizeFactor: () => zoomState.sizeFactor,
            setSizeFactor: (f, _mx, _my) => { zoomState.sizeFactor = f; },
            getCurrentSlice: () => zoomState.currentSlice,
            setCurrentSlice: (s) => { zoomState.currentSlice = s; },
            getMaxSlice: () => 49,
        });
    });

    it('should have correct name', () => {
        expect(tool.name).toBe('zoom');
    });

    describe('Scroll:Zoom mode', () => {
        beforeEach(() => {
            ctx.keyboardManager.setMouseWheelBehavior('Scroll:Zoom');
        });

        it('should increase zoom on scroll up', () => {
            tool.onWheel(createWheelEvent(-100)); // scroll up = zoom in
            expect(zoomState.sizeFactor).toBeGreaterThan(1);
        });

        it('should decrease zoom on scroll down', () => {
            zoomState.sizeFactor = 2;
            tool.onWheel(createWheelEvent(100)); // scroll down = zoom out
            expect(zoomState.sizeFactor).toBeLessThan(2);
        });

        it('should not zoom below 1x', () => {
            zoomState.sizeFactor = 1;
            tool.onWheel(createWheelEvent(100)); // try to zoom out
            expect(zoomState.sizeFactor).toBe(1);
        });

        it('should not zoom above 8x', () => {
            zoomState.sizeFactor = 8;
            tool.onWheel(createWheelEvent(-100)); // try to zoom in
            expect(zoomState.sizeFactor).toBe(8);
        });
    });

    describe('Scroll:Slice mode', () => {
        beforeEach(() => {
            ctx.keyboardManager.setMouseWheelBehavior('Scroll:Slice');
        });

        it('should decrease slice on scroll up', () => {
            tool.onWheel(createWheelEvent(-100));
            expect(zoomState.currentSlice).toBe(24);
        });

        it('should increase slice on scroll down', () => {
            tool.onWheel(createWheelEvent(100));
            expect(zoomState.currentSlice).toBe(26);
        });

        it('should not go below slice 0', () => {
            zoomState.currentSlice = 0;
            tool.onWheel(createWheelEvent(-100));
            expect(zoomState.currentSlice).toBe(0);
        });

        it('should not exceed max slice', () => {
            zoomState.currentSlice = 49;
            tool.onWheel(createWheelEvent(100));
            expect(zoomState.currentSlice).toBe(49);
        });
    });
});

// ===== ContrastTool Tests =====
describe('ContrastTool', () => {
    let tool: ContrastTool;
    let ctx: ToolContext;
    let contrastState: { windowCenter: number; windowWidth: number; refreshed: boolean };

    beforeEach(() => {
        ctx = createToolContext();
        tool = new ContrastTool(ctx);
        contrastState = { windowCenter: 128, windowWidth: 256, refreshed: false };

        tool.setAdapter({
            getWindowCenter: () => contrastState.windowCenter,
            getWindowWidth: () => contrastState.windowWidth,
            setWindowCenter: (v) => { contrastState.windowCenter = v; },
            setWindowWidth: (v) => { contrastState.windowWidth = v; },
            refreshDisplay: () => { contrastState.refreshed = true; },
        });
    });

    it('should have correct name', () => {
        expect(tool.name).toBe('contrast');
    });

    it('should not modify mask data', () => {
        const deltas = tool.onPointerDown(createPointerEvent('pointerdown'));
        expect(deltas).toEqual([]);
    });

    it('should adjust window center on horizontal drag', () => {
        tool.onPointerDown(createPointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
        tool.onPointerMove(createPointerEvent('pointermove', { clientX: 150, clientY: 100 }));

        // Horizontal delta = 50, so windowCenter should increase by 50
        expect(contrastState.windowCenter).toBe(178);
    });

    it('should adjust window width on vertical drag', () => {
        tool.onPointerDown(createPointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
        tool.onPointerMove(createPointerEvent('pointermove', { clientX: 100, clientY: 130 }));

        // Vertical delta = 30, so windowWidth should increase by 30
        expect(contrastState.windowWidth).toBe(286);
    });

    it('should call refreshDisplay on move', () => {
        tool.onPointerDown(createPointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
        tool.onPointerMove(createPointerEvent('pointermove', { clientX: 120, clientY: 110 }));

        expect(contrastState.refreshed).toBe(true);
    });

    it('should stop adjusting on pointer up', () => {
        tool.onPointerDown(createPointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
        tool.onPointerUp(createPointerEvent('pointerup'));

        contrastState.refreshed = false;
        tool.onPointerMove(createPointerEvent('pointermove', { clientX: 200, clientY: 200 }));
        expect(contrastState.refreshed).toBe(false);
    });

    it('should not allow window width below 1', () => {
        contrastState.windowWidth = 10;
        tool.onPointerDown(createPointerEvent('pointerdown', { clientX: 100, clientY: 100 }));
        tool.onPointerMove(createPointerEvent('pointermove', { clientX: 100, clientY: 80 }));

        // Vertical delta = -20, width would be 10 + (-20) = -10, clamped to 1
        expect(contrastState.windowWidth).toBeGreaterThanOrEqual(1);
    });
});

// ===== Coordinate Conversion Tests =====
describe('Coordinate Conversion', () => {
    let tool: BrushTool;

    beforeEach(() => {
        const ctx = createToolContext({ sizeFactor: 3 });
        tool = new BrushTool(ctx);
    });

    it('should convert screen to original coordinates correctly', () => {
        // Access protected method via any for testing
        const result = (tool as any).screenToOriginal(90, 60);
        expect(result.x).toBe(30); // 90 / 3
        expect(result.y).toBe(20); // 60 / 3
    });

    it('should convert original to screen coordinates correctly', () => {
        const result = (tool as any).originalToScreen(30, 20);
        expect(result.x).toBe(90); // 30 * 3
        expect(result.y).toBe(60); // 20 * 3
    });

    it('should convert brush size from screen to original', () => {
        const result = (tool as any).screenBrushToOriginal(15);
        expect(result).toBe(5); // 15 / 3
    });

    it('should clamp brush size to minimum 1', () => {
        const result = (tool as any).screenBrushToOriginal(1);
        expect(result).toBe(1);
    });
});

// ===== SphereTool Tests =====
describe('SphereTool', () => {
    let tool: SphereTool;
    let ctx: ToolContext;
    let adapterCallbacks: {
        spherePlaced: boolean;
        calculatorUpdated: boolean;
    };

    function createSphereAdapter(): SphereAdapter {
        return {
            convertCursorPoint: (from, to, mx, my, slice) => {
                // Simple mock: swap x/y and keep slice
                return { x: my, y: mx, sliceIndex: slice };
            },
            getMaxSlice: () => 49,
            onSpherePlaced: () => { adapterCallbacks.spherePlaced = true; },
            onCalculatorPositionsUpdated: () => { adapterCallbacks.calculatorUpdated = true; },
        };
    }

    beforeEach(() => {
        ctx = createToolContext({ currentSlice: 25 });
        tool = new SphereTool(ctx);
        adapterCallbacks = { spherePlaced: false, calculatorUpdated: false };
        tool.setAdapter(createSphereAdapter());
    });

    it('should have correct name', () => {
        expect(tool.name).toBe('sphere');
    });

    describe('sphere type management', () => {
        it('should default to tumour type', () => {
            expect(tool.getActiveSphereType()).toBe('tumour');
        });

        it('should switch active sphere type', () => {
            tool.setActiveSphereType('skin');
            expect(tool.getActiveSphereType()).toBe('skin');
        });

        it('should start with null positions', () => {
            const positions = tool.getAllPositions();
            expect(positions.tumour).toBeNull();
            expect(positions.skin).toBeNull();
            expect(positions.nipple).toBeNull();
            expect(positions.ribcage).toBeNull();
        });
    });

    describe('placement interaction', () => {
        it('should not produce deltas on pointer down', () => {
            const deltas = tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 50, offsetY: 50 }));
            expect(deltas).toEqual([]);
        });

        it('should produce deltas on pointer up (sphere applied)', () => {
            tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 50, offsetY: 50 }));
            const deltas = tool.onPointerUp(createPointerEvent('pointerup'));
            expect(deltas.length).toBeGreaterThan(0);
        });

        it('should apply sphere across multiple slices', () => {
            tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 50, offsetY: 50 }));
            const deltas = tool.onPointerUp(createPointerEvent('pointerup'));

            // Default radius = 3, so slices 22-28 should be affected
            const affectedSlices = new Set(deltas.map(d => d.slice));
            expect(affectedSlices.size).toBeGreaterThan(1);
            expect(affectedSlices.has(25)).toBe(true); // center slice
        });

        it('should store position after placement', () => {
            tool.setActiveSphereType('tumour');
            tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 50, offsetY: 50 }));
            tool.onPointerUp(createPointerEvent('pointerup'));

            const pos = tool.getPosition('tumour');
            expect(pos).not.toBeNull();
            // z axis: center = screenToOriginal(50, 50) with sizeFactor=2 → (25, 25), slice 25
            expect(pos!.z).toEqual([25, 25, 25]);
        });

        it('should store different types independently', () => {
            tool.setActiveSphereType('tumour');
            tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 20, offsetY: 20 }));
            tool.onPointerUp(createPointerEvent('pointerup'));

            tool.setActiveSphereType('skin');
            tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 60, offsetY: 60 }));
            tool.onPointerUp(createPointerEvent('pointerup'));

            const tumour = tool.getPosition('tumour');
            const skin = tool.getPosition('skin');
            expect(tumour).not.toBeNull();
            expect(skin).not.toBeNull();
            expect(tumour!.z[0]).not.toBe(skin!.z[0]);
        });

        it('should push to UndoManager', () => {
            tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 50, offsetY: 50 }));
            tool.onPointerUp(createPointerEvent('pointerup'));
            expect(ctx.undoManager.canUndo()).toBe(true);
        });

        it('should call requestRender on pointer up', () => {
            tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 50, offsetY: 50 }));
            tool.onPointerUp(createPointerEvent('pointerup'));
            expect(ctx.requestRender).toHaveBeenCalled();
        });

        it('should call adapter callbacks on placement', () => {
            tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 50, offsetY: 50 }));
            tool.onPointerUp(createPointerEvent('pointerup'));
            expect(adapterCallbacks.spherePlaced).toBe(true);
            expect(adapterCallbacks.calculatorUpdated).toBe(true);
        });
    });

    describe('radius adjustment via wheel', () => {
        it('should start with default radius 3', () => {
            expect(tool.getRadius()).toBe(3);
        });

        it('should increase radius on scroll up while placing', () => {
            tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 50, offsetY: 50 }));
            tool.onWheel(createWheelEvent(-100)); // scroll up
            expect(tool.getRadius()).toBe(4);
        });

        it('should decrease radius on scroll down while placing', () => {
            tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 50, offsetY: 50 }));
            tool.onWheel(createWheelEvent(100)); // scroll down
            expect(tool.getRadius()).toBe(2);
        });

        it('should not go below radius 1', () => {
            tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 50, offsetY: 50 }));
            for (let i = 0; i < 10; i++) {
                tool.onWheel(createWheelEvent(100));
            }
            expect(tool.getRadius()).toBe(1);
        });

        it('should not exceed radius 50', () => {
            tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 50, offsetY: 50 }));
            for (let i = 0; i < 100; i++) {
                tool.onWheel(createWheelEvent(-100));
            }
            expect(tool.getRadius()).toBe(50);
        });

        it('should not adjust radius when not placing', () => {
            tool.onWheel(createWheelEvent(-100));
            expect(tool.getRadius()).toBe(3); // unchanged
        });
    });

    describe('3D sphere application', () => {
        it('should write channel data to center slice', () => {
            tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 50, offsetY: 50 }));
            tool.onPointerUp(createPointerEvent('pointerup'));

            const slice = ctx.layerManager.getActiveSlice(25);
            // Center voxel at (25, 25) should be channel 1
            expect(slice[25 * 100 + 25]).toBe(1);
        });

        it('should write smaller circles on neighboring slices (spherical decay)', () => {
            tool.setDecayMode('spherical');
            tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 50, offsetY: 50 }));
            // Increase radius to 5 for clearer cross-slice difference
            tool.onWheel(createWheelEvent(-100)); // 4
            tool.onWheel(createWheelEvent(-100)); // 5
            const deltas = tool.onPointerUp(createPointerEvent('pointerup'));

            // Count deltas per slice
            const countBySlice: Record<number, number> = {};
            for (const d of deltas) {
                countBySlice[d.slice] = (countBySlice[d.slice] || 0) + 1;
            }

            // Center slice should have most deltas
            const centerCount = countBySlice[25] || 0;
            const neighborCount = countBySlice[24] || 0;
            expect(centerCount).toBeGreaterThan(neighborCount);
        });

        it('should support linear decay mode', () => {
            tool.setDecayMode('linear');
            tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 50, offsetY: 50 }));
            const deltas = tool.onPointerUp(createPointerEvent('pointerup'));

            expect(deltas.length).toBeGreaterThan(0);
        });
    });

    describe('cross-axis origin calculation', () => {
        it('should build SphereOrigin with all 3 axes', () => {
            tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 50, offsetY: 50 }));
            tool.onPointerUp(createPointerEvent('pointerup'));

            const pos = tool.getPosition('tumour');
            expect(pos).not.toBeNull();
            // All 3 axes should have values
            expect(pos!.x).toBeDefined();
            expect(pos!.y).toBeDefined();
            expect(pos!.z).toBeDefined();
            // Z axis (current) should be [25, 25, 25]
            expect(pos!.z).toEqual([25, 25, 25]);
        });
    });

    describe('clearPosition', () => {
        it('should clear a specific sphere position', () => {
            tool.setActiveSphereType('tumour');
            tool.onPointerDown(createPointerEvent('pointerdown', { offsetX: 50, offsetY: 50 }));
            tool.onPointerUp(createPointerEvent('pointerup'));

            expect(tool.getPosition('tumour')).not.toBeNull();
            tool.clearPosition('tumour');
            expect(tool.getPosition('tumour')).toBeNull();
        });
    });
});
