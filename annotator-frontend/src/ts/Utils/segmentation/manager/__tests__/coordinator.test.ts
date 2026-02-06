/**
 * Phase 6: ToolCoordinator - Unit Tests
 *
 * Tests for two-level mode system, mutual-exclusion rules,
 * state transitions, event routing, and edge cases.
 *
 * ~71 tests organized by category:
 *   - Drawing + Shift mutual exclusion (~8)
 *   - Drawing + Ctrl mutual exclusion (~6)
 *   - Crosshair mutual exclusion (~10)
 *   - Sphere mutual exclusion (~8)
 *   - Calculator mutual exclusion (~6)
 *   - GUI tool switching (~6)
 *   - State transitions (~8)
 *   - Event routing (~8)
 *   - arrowSlice availability (~6)
 *   - Edge cases (~5)
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
import { BaseTool } from '../tools/BaseTool';
import {
    ToolCoordinator,
} from '../tools/ToolCoordinator';
import type {
    GuiTool,
    InteractionType,
} from '../tools/ToolCoordinator';

// ===== Mock Tool Class =====

class MockTool extends BaseTool {
    readonly name = 'none' as any;
    onPointerDown = vi.fn(() => []);
    onPointerMove = vi.fn(() => []);
    onPointerUp = vi.fn(() => []);
    onWheel = vi.fn();
    activate = vi.fn();
    deactivate = vi.fn();
}

// ===== Mock Crosshair Tool =====

class MockCrosshairTool extends BaseTool {
    readonly name = 'crosshair' as any;
    private enabled = false;
    toggle = vi.fn(() => { this.enabled = !this.enabled; });
    isEnabled = vi.fn(() => this.enabled);
    onPointerDown = vi.fn(() => []);
    onPointerMove = vi.fn(() => []);
    onPointerUp = vi.fn(() => []);
}

// ===== Test Helpers =====

const dimensions: VolumeDimensions = { width: 100, height: 100, depth: 50 };

function createToolContext(): ToolContext {
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
    };
}

function createPointerEvent(
    button: number = 0,
    overrides: Partial<PointerEvent> = {}
): PointerEvent {
    return {
        type: 'pointerdown',
        button,
        offsetX: 50,
        offsetY: 50,
        clientX: 50,
        clientY: 50,
        ...overrides,
    } as unknown as PointerEvent;
}

function createWheelEvent(deltaY: number = -100): WheelEvent {
    return {
        type: 'wheel',
        deltaY,
        offsetX: 50,
        offsetY: 50,
        preventDefault: vi.fn(),
    } as unknown as WheelEvent;
}

function setupCoordinatorWithTools(): {
    coordinator: ToolCoordinator;
    pencilTool: MockTool;
    brushTool: MockTool;
    eraserTool: MockTool;
    panTool: MockTool;
    zoomTool: MockTool;
    contrastTool: MockTool;
    sphereTool: MockTool;
    crosshairTool: MockCrosshairTool;
} {
    const ctx = createToolContext();
    const coordinator = new ToolCoordinator();

    const pencilTool = new MockTool(ctx);
    const brushTool = new MockTool(ctx);
    const eraserTool = new MockTool(ctx);
    const panTool = new MockTool(ctx);
    const zoomTool = new MockTool(ctx);
    const contrastTool = new MockTool(ctx);
    const sphereTool = new MockTool(ctx);
    const crosshairTool = new MockCrosshairTool(ctx);

    coordinator.registerTool('pencil', pencilTool);
    coordinator.registerTool('brush', brushTool);
    coordinator.registerTool('eraser', eraserTool);
    coordinator.registerTool('pan', panTool);
    coordinator.registerTool('zoom', zoomTool);
    coordinator.registerTool('contrast', contrastTool);
    coordinator.registerTool('sphere', sphereTool);
    coordinator.registerTool('crosshair', crosshairTool);

    return {
        coordinator,
        pencilTool,
        brushTool,
        eraserTool,
        panTool,
        zoomTool,
        contrastTool,
        sphereTool,
        crosshairTool,
    };
}

// =====================================================================
// Tests
// =====================================================================

describe('ToolCoordinator', () => {
    // ===== Drawing + Shift Mutual Exclusion =====
    describe('Drawing + Shift mutual exclusion', () => {
        it('should default to pencil guiTool', () => {
            const coordinator = new ToolCoordinator();
            expect(coordinator.getGuiTool()).toBe('pencil');
        });

        it('should allow zoom, sliceChange, crosshairToggle in idle state', () => {
            const coordinator = new ToolCoordinator();
            expect(coordinator.canUse('zoom')).toBe(true);
            expect(coordinator.canUse('sliceChange')).toBe(true);
            expect(coordinator.canUse('crosshairToggle')).toBe(true);
            expect(coordinator.canUse('undoRedo')).toBe(true);
        });

        it('should allow only draw when shift is held', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onShiftChange(true);
            expect(coordinator.canUse('draw')).toBe(true);
            expect(coordinator.canUse('zoom')).toBe(false);
            expect(coordinator.canUse('sliceChange')).toBe(false);
            expect(coordinator.canUse('crosshairToggle')).toBe(false);
            expect(coordinator.canUse('contrast')).toBe(false);
            expect(coordinator.canUse('pan')).toBe(false);
        });

        it('should block arrowSlice when shift is held', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onShiftChange(true);
            expect(coordinator.canUse('arrowSlice')).toBe(false);
        });

        it('should restore idle permissions when shift is released', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onShiftChange(true);
            expect(coordinator.canUse('draw')).toBe(true);
            coordinator.onShiftChange(false);
            expect(coordinator.canUse('draw')).toBe(false);
            expect(coordinator.canUse('zoom')).toBe(true);
        });

        it('should block undoRedo when shift is held', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onShiftChange(true);
            expect(coordinator.canUse('undoRedo')).toBe(false);
        });

        it('should block spherePlace and calcPlace in drawing tool mode', () => {
            const coordinator = new ToolCoordinator();
            expect(coordinator.canUse('spherePlace')).toBe(false);
            expect(coordinator.canUse('calcPlace')).toBe(false);
        });

        it('should only allow pan when right button is down in drawing mode', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onRightButtonChange(true);
            expect(coordinator.canUse('pan')).toBe(true);
            expect(coordinator.canUse('zoom')).toBe(false);
            expect(coordinator.canUse('sliceChange')).toBe(false);
        });
    });

    // ===== Drawing + Ctrl Mutual Exclusion =====
    describe('Drawing + Ctrl mutual exclusion', () => {
        it('should allow contrast when ctrl is held', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onCtrlChange(true);
            expect(coordinator.canUse('contrast')).toBe(true);
        });

        it('should allow undoRedo when ctrl is held', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onCtrlChange(true);
            expect(coordinator.canUse('undoRedo')).toBe(true);
        });

        it('should block draw, zoom, sliceChange when ctrl is held', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onCtrlChange(true);
            expect(coordinator.canUse('draw')).toBe(false);
            expect(coordinator.canUse('zoom')).toBe(false);
            expect(coordinator.canUse('sliceChange')).toBe(false);
        });

        it('should allow arrowSlice when ctrl is held', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onCtrlChange(true);
            expect(coordinator.canUse('arrowSlice')).toBe(true);
        });

        it('should ignore ctrl if shift is already held', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onShiftChange(true);
            coordinator.onCtrlChange(true);
            // Shift takes priority, ctrl should be ignored
            expect(coordinator.isCtrlHeld()).toBe(false);
            expect(coordinator.canUse('draw')).toBe(true);
        });

        it('should ignore shift if ctrl is already held', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onCtrlChange(true);
            coordinator.onShiftChange(true);
            // Ctrl takes priority, shift should be ignored
            expect(coordinator.isShiftHeld()).toBe(false);
            expect(coordinator.canUse('contrast')).toBe(true);
        });
    });

    // ===== Crosshair Mutual Exclusion =====
    describe('Crosshair mutual exclusion', () => {
        it('should toggle crosshair on via onCrosshairToggle', () => {
            const { coordinator } = setupCoordinatorWithTools();
            coordinator.onCrosshairToggle();
            expect(coordinator.isCrosshairEnabled()).toBe(true);
        });

        it('should toggle crosshair off on second toggle', () => {
            const { coordinator } = setupCoordinatorWithTools();
            coordinator.onCrosshairToggle();
            coordinator.onCrosshairToggle();
            expect(coordinator.isCrosshairEnabled()).toBe(false);
        });

        it('should allow crosshairToggle when crosshair is ON', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onCrosshairToggle();
            expect(coordinator.canUse('crosshairToggle')).toBe(true);
        });

        it('should allow crosshairClick when crosshair is ON', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onCrosshairToggle();
            expect(coordinator.canUse('crosshairClick')).toBe(true);
        });

        it('should allow undoRedo when crosshair ON and left button up', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onCrosshairToggle();
            expect(coordinator.canUse('undoRedo')).toBe(true);
        });

        it('should block undoRedo when crosshair ON and left button down', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onCrosshairToggle();
            coordinator.onLeftButtonChange(true);
            expect(coordinator.canUse('undoRedo')).toBe(false);
        });

        it('should block draw, zoom, sliceChange, contrast when crosshair is ON', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onCrosshairToggle();
            expect(coordinator.canUse('draw')).toBe(false);
            expect(coordinator.canUse('zoom')).toBe(false);
            expect(coordinator.canUse('sliceChange')).toBe(false);
            expect(coordinator.canUse('contrast')).toBe(false);
            expect(coordinator.canUse('spherePlace')).toBe(false);
        });

        it('should allow arrowSlice when crosshair is ON', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onCrosshairToggle();
            expect(coordinator.canUse('arrowSlice')).toBe(true);
        });

        it('should allow pan when crosshair ON and right button down', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onCrosshairToggle();
            coordinator.onRightButtonChange(true);
            expect(coordinator.canUse('pan')).toBe(true);
        });

        it('should block pan when crosshair ON and right button up', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onCrosshairToggle();
            expect(coordinator.canUse('pan')).toBe(false);
        });
    });

    // ===== Sphere Mutual Exclusion =====
    describe('Sphere mutual exclusion', () => {
        it('should permanently block draw, crosshair, contrast in sphere mode', () => {
            const coordinator = new ToolCoordinator();
            coordinator.setGuiTool('sphere');
            expect(coordinator.canUse('draw')).toBe(false);
            expect(coordinator.canUse('crosshairClick')).toBe(false);
            expect(coordinator.canUse('crosshairToggle')).toBe(false);
            expect(coordinator.canUse('contrast')).toBe(false);
        });

        it('should allow zoom, sliceChange, arrowSlice, undoRedo when idle in sphere mode', () => {
            const coordinator = new ToolCoordinator();
            coordinator.setGuiTool('sphere');
            expect(coordinator.canUse('zoom')).toBe(true);
            expect(coordinator.canUse('sliceChange')).toBe(true);
            expect(coordinator.canUse('arrowSlice')).toBe(true);
            expect(coordinator.canUse('undoRedo')).toBe(true);
        });

        it('should allow spherePlace and sphereWheel when left button down in sphere mode', () => {
            const coordinator = new ToolCoordinator();
            coordinator.setGuiTool('sphere');
            coordinator.onLeftButtonChange(true);
            expect(coordinator.canUse('spherePlace')).toBe(true);
            expect(coordinator.canUse('sphereWheel')).toBe(true);
        });

        it('should block zoom, pan, sliceChange when left button down in sphere mode', () => {
            const coordinator = new ToolCoordinator();
            coordinator.setGuiTool('sphere');
            coordinator.onLeftButtonChange(true);
            expect(coordinator.canUse('zoom')).toBe(false);
            expect(coordinator.canUse('pan')).toBe(false);
            expect(coordinator.canUse('sliceChange')).toBe(false);
        });

        it('should block arrowSlice when left button down in sphere mode', () => {
            const coordinator = new ToolCoordinator();
            coordinator.setGuiTool('sphere');
            coordinator.onLeftButtonChange(true);
            expect(coordinator.canUse('arrowSlice')).toBe(false);
        });

        it('should allow pan when right button down in sphere mode', () => {
            const coordinator = new ToolCoordinator();
            coordinator.setGuiTool('sphere');
            coordinator.onRightButtonChange(true);
            expect(coordinator.canUse('pan')).toBe(true);
        });

        it('should ignore shift and ctrl in sphere mode', () => {
            const coordinator = new ToolCoordinator();
            coordinator.setGuiTool('sphere');
            coordinator.onShiftChange(true);
            expect(coordinator.isShiftHeld()).toBe(false);
            coordinator.onCtrlChange(true);
            expect(coordinator.isCtrlHeld()).toBe(false);
        });

        it('should ignore crosshair toggle in sphere mode', () => {
            const coordinator = new ToolCoordinator();
            coordinator.setGuiTool('sphere');
            coordinator.onCrosshairToggle();
            expect(coordinator.isCrosshairEnabled()).toBe(false);
        });
    });

    // ===== Calculator Mutual Exclusion =====
    describe('Calculator mutual exclusion', () => {
        it('should permanently block draw, crosshair, contrast in calculator mode', () => {
            const coordinator = new ToolCoordinator();
            coordinator.setGuiTool('calculator');
            expect(coordinator.canUse('draw')).toBe(false);
            expect(coordinator.canUse('crosshairClick')).toBe(false);
            expect(coordinator.canUse('crosshairToggle')).toBe(false);
            expect(coordinator.canUse('contrast')).toBe(false);
        });

        it('should allow zoom, sliceChange, arrowSlice, undoRedo when idle in calculator mode', () => {
            const coordinator = new ToolCoordinator();
            coordinator.setGuiTool('calculator');
            expect(coordinator.canUse('zoom')).toBe(true);
            expect(coordinator.canUse('sliceChange')).toBe(true);
            expect(coordinator.canUse('arrowSlice')).toBe(true);
            expect(coordinator.canUse('undoRedo')).toBe(true);
        });

        it('should allow calcPlace when left button down in calculator mode', () => {
            const coordinator = new ToolCoordinator();
            coordinator.setGuiTool('calculator');
            coordinator.onLeftButtonChange(true);
            expect(coordinator.canUse('calcPlace')).toBe(true);
        });

        it('should block spherePlace/sphereWheel in calculator mode', () => {
            const coordinator = new ToolCoordinator();
            coordinator.setGuiTool('calculator');
            coordinator.onLeftButtonChange(true);
            expect(coordinator.canUse('spherePlace')).toBe(false);
            expect(coordinator.canUse('sphereWheel')).toBe(false);
        });

        it('should allow arrowSlice when left button down in calculator mode (unlike sphere)', () => {
            const coordinator = new ToolCoordinator();
            coordinator.setGuiTool('calculator');
            coordinator.onLeftButtonChange(true);
            expect(coordinator.canUse('arrowSlice')).toBe(true);
        });

        it('should ignore shift, ctrl, crosshair toggle in calculator mode', () => {
            const coordinator = new ToolCoordinator();
            coordinator.setGuiTool('calculator');
            coordinator.onShiftChange(true);
            expect(coordinator.isShiftHeld()).toBe(false);
            coordinator.onCtrlChange(true);
            expect(coordinator.isCtrlHeld()).toBe(false);
            coordinator.onCrosshairToggle();
            expect(coordinator.isCrosshairEnabled()).toBe(false);
        });
    });

    // ===== GUI Tool Switching =====
    describe('GUI tool switching', () => {
        it('should switch between drawing tools without resetting crosshair', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onCrosshairToggle(); // enable crosshair
            expect(coordinator.isCrosshairEnabled()).toBe(true);

            coordinator.setGuiTool('brush');
            expect(coordinator.getGuiTool()).toBe('brush');
            expect(coordinator.isCrosshairEnabled()).toBe(true); // preserved
        });

        it('should reset crosshair when switching from drawing to sphere', () => {
            const { coordinator } = setupCoordinatorWithTools();
            coordinator.onCrosshairToggle();
            expect(coordinator.isCrosshairEnabled()).toBe(true);

            coordinator.setGuiTool('sphere');
            expect(coordinator.isCrosshairEnabled()).toBe(false);
        });

        it('should reset shift/ctrl when switching to sphere', () => {
            const { coordinator } = setupCoordinatorWithTools();
            coordinator.onShiftChange(true);
            coordinator.setGuiTool('sphere');
            expect(coordinator.isShiftHeld()).toBe(false);
        });

        it('should call deactivate on old tool and activate on new tool', () => {
            const { coordinator, pencilTool, sphereTool } = setupCoordinatorWithTools();
            coordinator.setGuiTool('sphere');
            expect(pencilTool.deactivate).toHaveBeenCalled();
            expect(sphereTool.activate).toHaveBeenCalled();
        });

        it('should not call deactivate/activate when switching between drawing tools', () => {
            const { coordinator, pencilTool, brushTool } = setupCoordinatorWithTools();
            coordinator.setGuiTool('brush');
            // Drawing-to-drawing: no lifecycle calls on the tools
            expect(pencilTool.deactivate).not.toHaveBeenCalled();
            expect(brushTool.activate).not.toHaveBeenCalled();
        });

        it('should be a no-op when setting the same guiTool', () => {
            const stateChangeFn = vi.fn();
            const coordinator = new ToolCoordinator();
            coordinator.onStateChange = stateChangeFn;
            coordinator.setGuiTool('pencil');
            expect(stateChangeFn).not.toHaveBeenCalled();
        });
    });

    // ===== State Transitions =====
    describe('State transitions', () => {
        it('should update leftButtonDown on onLeftButtonChange', () => {
            const coordinator = new ToolCoordinator();
            expect(coordinator.isLeftButtonDown()).toBe(false);
            coordinator.onLeftButtonChange(true);
            expect(coordinator.isLeftButtonDown()).toBe(true);
            coordinator.onLeftButtonChange(false);
            expect(coordinator.isLeftButtonDown()).toBe(false);
        });

        it('should update rightButtonDown on onRightButtonChange', () => {
            const coordinator = new ToolCoordinator();
            expect(coordinator.isRightButtonDown()).toBe(false);
            coordinator.onRightButtonChange(true);
            expect(coordinator.isRightButtonDown()).toBe(true);
        });

        it('should report isDrawing when shift + left button down', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onShiftChange(true);
            coordinator.onLeftButtonChange(true);
            expect(coordinator.isDrawing()).toBe(true);
        });

        it('should not report isDrawing when only shift or only left button', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onShiftChange(true);
            expect(coordinator.isDrawing()).toBe(false);
            coordinator.onShiftChange(false);
            coordinator.onLeftButtonChange(true);
            expect(coordinator.isDrawing()).toBe(false);
        });

        it('should not report isDrawing in sphere mode even with shift+left', () => {
            const coordinator = new ToolCoordinator();
            coordinator.setGuiTool('sphere');
            coordinator.onLeftButtonChange(true);
            expect(coordinator.isDrawing()).toBe(false);
        });

        it('should fire onStateChange on shift change', () => {
            const stateChangeFn = vi.fn();
            const coordinator = new ToolCoordinator();
            coordinator.onStateChange = stateChangeFn;
            coordinator.onShiftChange(true);
            expect(stateChangeFn).toHaveBeenCalledTimes(1);
            expect(stateChangeFn).toHaveBeenCalledWith(
                expect.any(Set),
                'pencil',
                false
            );
        });

        it('should fire onStateChange on ctrl change', () => {
            const stateChangeFn = vi.fn();
            const coordinator = new ToolCoordinator();
            coordinator.onStateChange = stateChangeFn;
            coordinator.onCtrlChange(true);
            expect(stateChangeFn).toHaveBeenCalledTimes(1);
        });

        it('should settle drawing on shift release if left button is down', () => {
            const { coordinator, pencilTool } = setupCoordinatorWithTools();
            coordinator.onShiftChange(true);
            coordinator.onLeftButtonChange(true);
            // Release shift while left button still down → settlement
            coordinator.onShiftChange(false);
            expect(pencilTool.onPointerUp).toHaveBeenCalled();
        });
    });

    // ===== Event Routing =====
    describe('Event routing', () => {
        it('should route right-click to pan tool', () => {
            const { coordinator, panTool } = setupCoordinatorWithTools();
            const event = createPointerEvent(2);
            coordinator.dispatchPointerDown(event);
            expect(panTool.onPointerDown).toHaveBeenCalledWith(event);
        });

        it('should route left-click to drawing tool when shift held', () => {
            const { coordinator, pencilTool } = setupCoordinatorWithTools();
            coordinator.onShiftChange(true);
            const event = createPointerEvent(0);
            coordinator.dispatchPointerDown(event);
            expect(pencilTool.onPointerDown).toHaveBeenCalledWith(event);
        });

        it('should route left-click to crosshair when crosshair enabled', () => {
            const { coordinator, crosshairTool } = setupCoordinatorWithTools();
            coordinator.onCrosshairToggle(); // enable crosshair
            const event = createPointerEvent(0);
            coordinator.dispatchPointerDown(event);
            expect(crosshairTool.onPointerDown).toHaveBeenCalledWith(event);
        });

        it('should route left-click to contrast when ctrl held', () => {
            const { coordinator, contrastTool } = setupCoordinatorWithTools();
            coordinator.onCtrlChange(true);
            const event = createPointerEvent(0);
            coordinator.dispatchPointerDown(event);
            expect(contrastTool.onPointerDown).toHaveBeenCalledWith(event);
        });

        it('should route left-click to sphere tool in sphere mode', () => {
            const { coordinator, sphereTool } = setupCoordinatorWithTools();
            coordinator.setGuiTool('sphere');
            const event = createPointerEvent(0);
            coordinator.dispatchPointerDown(event);
            expect(sphereTool.onPointerDown).toHaveBeenCalledWith(event);
        });

        it('should route wheel to zoom tool in idle drawing mode', () => {
            const { coordinator, zoomTool } = setupCoordinatorWithTools();
            const event = createWheelEvent(-100);
            coordinator.dispatchWheel(event);
            expect(zoomTool.onWheel).toHaveBeenCalledWith(event);
        });

        it('should route wheel to sphere tool when sphere + left button down', () => {
            const { coordinator, sphereTool, zoomTool } = setupCoordinatorWithTools();
            coordinator.setGuiTool('sphere');
            coordinator.onLeftButtonChange(true);
            const event = createWheelEvent(-100);
            coordinator.dispatchWheel(event);
            expect(sphereTool.onWheel).toHaveBeenCalledWith(event);
            expect(zoomTool.onWheel).not.toHaveBeenCalled();
        });

        it('should dispatch arrow key to onArrowSlice callback', () => {
            const coordinator = new ToolCoordinator();
            const arrowSliceFn = vi.fn();
            coordinator.onArrowSlice = arrowSliceFn;
            coordinator.dispatchArrowKey('up');
            expect(arrowSliceFn).toHaveBeenCalledWith('up');
            coordinator.dispatchArrowKey('down');
            expect(arrowSliceFn).toHaveBeenCalledWith('down');
        });
    });

    // ===== arrowSlice Availability =====
    describe('arrowSlice availability', () => {
        it('should allow arrowSlice in idle drawing mode', () => {
            const coordinator = new ToolCoordinator();
            expect(coordinator.canUse('arrowSlice')).toBe(true);
        });

        it('should block arrowSlice when shift held', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onShiftChange(true);
            expect(coordinator.canUse('arrowSlice')).toBe(false);
        });

        it('should block arrowSlice when sphere + left button down', () => {
            const coordinator = new ToolCoordinator();
            coordinator.setGuiTool('sphere');
            coordinator.onLeftButtonChange(true);
            expect(coordinator.canUse('arrowSlice')).toBe(false);
        });

        it('should allow arrowSlice when sphere + left button up', () => {
            const coordinator = new ToolCoordinator();
            coordinator.setGuiTool('sphere');
            expect(coordinator.canUse('arrowSlice')).toBe(true);
        });

        it('should allow arrowSlice when calculator + left button down', () => {
            const coordinator = new ToolCoordinator();
            coordinator.setGuiTool('calculator');
            coordinator.onLeftButtonChange(true);
            expect(coordinator.canUse('arrowSlice')).toBe(true);
        });

        it('should allow arrowSlice when crosshair ON', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onCrosshairToggle();
            expect(coordinator.canUse('arrowSlice')).toBe(true);
        });
    });

    // ===== Edge Cases =====
    describe('Edge cases', () => {
        it('should handle rapid shift toggle', () => {
            const coordinator = new ToolCoordinator();
            for (let i = 0; i < 10; i++) {
                coordinator.onShiftChange(true);
                coordinator.onShiftChange(false);
            }
            expect(coordinator.isShiftHeld()).toBe(false);
            expect(coordinator.canUse('zoom')).toBe(true);
        });

        it('should handle rapid crosshair toggle', () => {
            const coordinator = new ToolCoordinator();
            for (let i = 0; i < 6; i++) {
                coordinator.onCrosshairToggle();
            }
            // 6 toggles: ON/OFF/ON/OFF/ON/OFF → should be OFF
            expect(coordinator.isCrosshairEnabled()).toBe(false);
        });

        it('should handle dispatchPointerUp for right button correctly', () => {
            const { coordinator, panTool } = setupCoordinatorWithTools();
            // First press right button
            coordinator.dispatchPointerDown(createPointerEvent(2));
            expect(coordinator.isRightButtonDown()).toBe(true);
            // Release right button
            coordinator.dispatchPointerUp(createPointerEvent(2));
            expect(coordinator.isRightButtonDown()).toBe(false);
            expect(panTool.onPointerUp).toHaveBeenCalled();
        });

        it('should handle resetInteractionState', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onShiftChange(true);
            coordinator.onCtrlChange(false); // blocked by shift
            coordinator.onLeftButtonChange(true);
            coordinator.onCrosshairToggle(); // blocked by shift

            coordinator.resetInteractionState();
            expect(coordinator.isShiftHeld()).toBe(false);
            expect(coordinator.isCtrlHeld()).toBe(false);
            expect(coordinator.isLeftButtonDown()).toBe(false);
            expect(coordinator.isRightButtonDown()).toBe(false);
            expect(coordinator.isCrosshairEnabled()).toBe(false);
        });

        it('should return correct allowed set via getAllowed', () => {
            const coordinator = new ToolCoordinator();
            const allowed = coordinator.getAllowed();
            // Idle drawing mode: should include zoom, sliceChange, crosshairToggle, undoRedo, pan, arrowSlice
            expect(allowed.has('zoom')).toBe(true);
            expect(allowed.has('sliceChange')).toBe(true);
            expect(allowed.has('crosshairToggle')).toBe(true);
            expect(allowed.has('undoRedo')).toBe(true);
            expect(allowed.has('arrowSlice')).toBe(true);
            expect(allowed.has('pan')).toBe(true);
            // Should NOT include draw (no shift), sphere, calc, crosshairClick
            expect(allowed.has('draw')).toBe(false);
            expect(allowed.has('spherePlace')).toBe(false);
            expect(allowed.has('crosshairClick')).toBe(false);
        });
    });

    // ===== Tool Registration =====
    describe('Tool registration', () => {
        it('should register and retrieve tools', () => {
            const ctx = createToolContext();
            const coordinator = new ToolCoordinator();
            const tool = new MockTool(ctx);
            coordinator.registerTool('test', tool);
            expect(coordinator.getTool('test')).toBe(tool);
        });

        it('should unregister tools', () => {
            const ctx = createToolContext();
            const coordinator = new ToolCoordinator();
            const tool = new MockTool(ctx);
            coordinator.registerTool('test', tool);
            coordinator.unregisterTool('test');
            expect(coordinator.getTool('test')).toBeUndefined();
        });

        it('should list all registered tool names', () => {
            const { coordinator } = setupCoordinatorWithTools();
            const names = coordinator.getRegisteredTools();
            expect(names).toContain('pencil');
            expect(names).toContain('brush');
            expect(names).toContain('eraser');
            expect(names).toContain('pan');
            expect(names).toContain('zoom');
            expect(names).toContain('contrast');
            expect(names).toContain('sphere');
            expect(names).toContain('crosshair');
        });
    });

    // ===== Pointer Move Routing =====
    describe('Pointer move routing', () => {
        it('should route move to pan tool when right button held', () => {
            const { coordinator, panTool } = setupCoordinatorWithTools();
            coordinator.onRightButtonChange(true);
            const event = createPointerEvent(0, { type: 'pointermove' } as any);
            coordinator.dispatchPointerMove(event);
            expect(panTool.onPointerMove).toHaveBeenCalled();
        });

        it('should route move to drawing tool when shift + left button', () => {
            const { coordinator, pencilTool } = setupCoordinatorWithTools();
            coordinator.onShiftChange(true);
            coordinator.onLeftButtonChange(true);
            const event = createPointerEvent(0, { type: 'pointermove' } as any);
            coordinator.dispatchPointerMove(event);
            expect(pencilTool.onPointerMove).toHaveBeenCalled();
        });

        it('should route move to crosshair when crosshair + left button', () => {
            const { coordinator, crosshairTool } = setupCoordinatorWithTools();
            coordinator.onCrosshairToggle();
            coordinator.onLeftButtonChange(true);
            const event = createPointerEvent(0, { type: 'pointermove' } as any);
            coordinator.dispatchPointerMove(event);
            expect(crosshairTool.onPointerMove).toHaveBeenCalled();
        });

        it('should route move to contrast when ctrl + left button', () => {
            const { coordinator, contrastTool } = setupCoordinatorWithTools();
            coordinator.onCtrlChange(true);
            coordinator.onLeftButtonChange(true);
            const event = createPointerEvent(0, { type: 'pointermove' } as any);
            coordinator.dispatchPointerMove(event);
            expect(contrastTool.onPointerMove).toHaveBeenCalled();
        });

        it('should call onDragSlice when left button with no modifier in drawing mode', () => {
            const dragSliceFn = vi.fn();
            const { coordinator } = setupCoordinatorWithTools();
            coordinator.onDragSlice = dragSliceFn;
            coordinator.onLeftButtonChange(true);
            const event = createPointerEvent(0, { type: 'pointermove' } as any);
            coordinator.dispatchPointerMove(event);
            expect(dragSliceFn).toHaveBeenCalledWith(event);
        });
    });

    // ===== Wheel Blocking =====
    describe('Wheel event blocking', () => {
        it('should block wheel when shift is held', () => {
            const { coordinator, zoomTool } = setupCoordinatorWithTools();
            coordinator.onShiftChange(true);
            coordinator.dispatchWheel(createWheelEvent());
            expect(zoomTool.onWheel).not.toHaveBeenCalled();
        });

        it('should block wheel when ctrl is held', () => {
            const { coordinator, zoomTool } = setupCoordinatorWithTools();
            coordinator.onCtrlChange(true);
            coordinator.dispatchWheel(createWheelEvent());
            expect(zoomTool.onWheel).not.toHaveBeenCalled();
        });

        it('should block wheel when crosshair is ON', () => {
            const { coordinator, zoomTool } = setupCoordinatorWithTools();
            coordinator.onCrosshairToggle();
            coordinator.dispatchWheel(createWheelEvent());
            expect(zoomTool.onWheel).not.toHaveBeenCalled();
        });
    });

    // ===== Drawing Left-Drag (Slice Change) =====
    describe('Drawing idle left-drag', () => {
        it('should allow sliceChange on left button down with no modifiers', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onLeftButtonChange(true);
            expect(coordinator.canUse('sliceChange')).toBe(true);
        });

        it('should block sliceChange when crosshair is ON', () => {
            const coordinator = new ToolCoordinator();
            coordinator.onCrosshairToggle();
            coordinator.onLeftButtonChange(true);
            expect(coordinator.canUse('sliceChange')).toBe(false);
        });
    });
});
