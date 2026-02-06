/**
 * Phase 2: Core Data Layer - Unit Tests
 * 
 * Tests for MaskLayer, LayerManager, VisibilityManager, UndoManager, KeyboardManager
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
    MaskLayer,
    LayerManager,
    VisibilityManager,
    UndoManager,
    KeyboardManager,
    CHANNEL_COLORS,
    CHANNEL_RGB,
} from '../core';
import type { Delta, LayerId, VolumeDimensions } from '../core/types';

// ===== MaskLayer Tests =====
describe('MaskLayer', () => {
    let layer: MaskLayer;
    const dimensions: VolumeDimensions = { width: 100, height: 100, depth: 50 };

    beforeEach(() => {
        layer = new MaskLayer('layer1', dimensions);
    });

    describe('initialization', () => {
        it('should create with correct id', () => {
            expect(layer.id).toBe('layer1');
        });

        it('should return correct dimensions', () => {
            const dims = layer.getDimensions();
            expect(dims.width).toBe(100);
            expect(dims.height).toBe(100);
            expect(dims.depth).toBe(50);
        });

        it('should start with no data', () => {
            expect(layer.hasData()).toBe(false);
        });
    });

    describe('applyBrush', () => {
        it('should apply brush and return deltas', () => {
            const deltas = layer.applyBrush(25, 50, 50, 5, 1);

            expect(deltas.length).toBeGreaterThan(0);
            expect(layer.hasData()).toBe(true);
        });

        it('should set correct channel value', () => {
            layer.applyBrush(25, 50, 50, 5, 3);

            const value = layer.getVoxel(25, 50, 50);
            expect(value).toBe(3);
        });

        it('should record correct delta values', () => {
            const deltas = layer.applyBrush(25, 50, 50, 5, 2);

            // All deltas should be for layer1
            expect(deltas.every(d => d.layer === 'layer1')).toBe(true);
            // All deltas should have prev=0 (empty) and next=2
            expect(deltas.every(d => d.prev === 0 && d.next === 2)).toBe(true);
        });

        it('should not create deltas when painting same channel', () => {
            layer.applyBrush(25, 50, 50, 5, 1);
            const deltas2 = layer.applyBrush(25, 50, 50, 5, 1);

            // Second brush should have fewer or no deltas (already painted)
            expect(deltas2.length).toBe(0);
        });
    });

    describe('fillPolygon', () => {
        it('should fill polygon area', () => {
            const polygon = [
                { x: 20, y: 20 },
                { x: 80, y: 20 },
                { x: 80, y: 80 },
                { x: 20, y: 80 },
            ];

            const deltas = layer.fillPolygon(25, polygon, 2);

            expect(deltas.length).toBeGreaterThan(0);
            // Point in center should be filled
            expect(layer.getVoxel(25, 50, 50)).toBe(2);
        });

        it('should not fill points outside polygon', () => {
            const polygon = [
                { x: 20, y: 20 },
                { x: 30, y: 20 },
                { x: 30, y: 30 },
                { x: 20, y: 30 },
            ];

            layer.fillPolygon(25, polygon, 2);

            // Point outside polygon should be empty
            expect(layer.getVoxel(25, 80, 80)).toBe(0);
        });

        it('should reject invalid polygon (< 3 points)', () => {
            const polygon = [{ x: 20, y: 20 }, { x: 30, y: 30 }];

            const deltas = layer.fillPolygon(25, polygon, 2);
            expect(deltas.length).toBe(0);
        });
    });

    describe('erase', () => {
        it('should erase (set to channel 0)', () => {
            // First paint
            layer.applyBrush(25, 50, 50, 5, 1);
            expect(layer.getVoxel(25, 50, 50)).toBe(1);

            // Then erase
            layer.erase(25, 50, 50, 5);
            expect(layer.getVoxel(25, 50, 50)).toBe(0);
        });
    });

    describe('applyDeltas', () => {
        it('should apply deltas forward', () => {
            const deltas = layer.applyBrush(25, 50, 50, 3, 1);

            // Clear and reapply
            const layer2 = new MaskLayer('layer1', dimensions);
            layer2.applyDeltas(deltas, false);

            expect(layer2.getVoxel(25, 50, 50)).toBe(1);
        });

        it('should apply deltas in reverse (undo)', () => {
            const deltas = layer.applyBrush(25, 50, 50, 3, 1);
            expect(layer.getVoxel(25, 50, 50)).toBe(1);

            // Undo
            layer.applyDeltas(deltas, true);
            expect(layer.getVoxel(25, 50, 50)).toBe(0);
        });
    });

    describe('exportSlice/importSlice', () => {
        it('should export and import slice data', () => {
            layer.applyBrush(25, 50, 50, 5, 4);

            const exported = layer.exportSlice(25, [1, 1, 1], [0, 0, 0]);

            expect(exported.layer).toBe('layer1');
            expect(exported.sliceIndex).toBe(25);
            expect(exported.width).toBe(100);
            expect(exported.height).toBe(100);
            expect(exported.data.length).toBe(10000); // 100 * 100

            // Import to new layer
            const layer2 = new MaskLayer('layer1');
            layer2.importSlice(exported);

            expect(layer2.getVoxel(25, 50, 50)).toBe(4);
        });
    });
});

// ===== LayerManager Tests =====
describe('LayerManager', () => {
    let manager: LayerManager;
    const dimensions: VolumeDimensions = { width: 100, height: 100, depth: 50 };

    beforeEach(() => {
        manager = new LayerManager(dimensions);
    });

    describe('layer access', () => {
        it('should have 3 layers', () => {
            expect(manager.layers.layer1).toBeDefined();
            expect(manager.layers.layer2).toBeDefined();
            expect(manager.layers.layer3).toBeDefined();
        });

        it('should default to layer1', () => {
            expect(manager.currentLayer).toBe('layer1');
        });

        it('should switch active layer', () => {
            manager.setActiveLayer('layer2');
            expect(manager.currentLayer).toBe('layer2');
        });
    });

    describe('layer locking', () => {
        it('should lock layer', () => {
            manager.lockLayer('layer1');
            expect(manager.isLocked('layer1')).toBe(true);
        });

        it('should prevent switching to locked layer', () => {
            manager.lockLayer('layer2');
            const result = manager.setActiveLayer('layer2');
            expect(result).toBe(false);
            expect(manager.currentLayer).toBe('layer1');
        });

        it('should prevent drawing on locked layer', () => {
            manager.setActiveLayer('layer1');
            manager.lockLayer('layer1');

            const deltas = manager.applyBrush(25, 50, 50, 5, 1);
            expect(deltas.length).toBe(0);
        });

        it('should unlock layer', () => {
            manager.lockLayer('layer1');
            manager.unlockLayer('layer1');
            expect(manager.isLocked('layer1')).toBe(false);
        });
    });

    describe('operations on active layer', () => {
        it('should apply brush to active layer', () => {
            manager.setActiveLayer('layer2');
            manager.applyBrush(25, 50, 50, 5, 1);

            expect(manager.layers.layer2.getVoxel(25, 50, 50)).toBe(1);
            expect(manager.layers.layer1.getVoxel(25, 50, 50)).toBe(0);
        });
    });
});

// ===== VisibilityManager Tests =====
describe('VisibilityManager', () => {
    let visibility: VisibilityManager;

    beforeEach(() => {
        visibility = new VisibilityManager();
    });

    describe('layer visibility', () => {
        it('should default all layers visible', () => {
            expect(visibility.isLayerVisible('layer1')).toBe(true);
            expect(visibility.isLayerVisible('layer2')).toBe(true);
            expect(visibility.isLayerVisible('layer3')).toBe(true);
        });

        it('should toggle layer visibility', () => {
            const result = visibility.toggleLayer('layer1');
            expect(result).toBe(false);
            expect(visibility.isLayerVisible('layer1')).toBe(false);
        });

        it('should solo layer', () => {
            visibility.soloLayer('layer2');

            expect(visibility.isLayerVisible('layer1')).toBe(false);
            expect(visibility.isLayerVisible('layer2')).toBe(true);
            expect(visibility.isLayerVisible('layer3')).toBe(false);
        });
    });

    describe('channel visibility', () => {
        it('should default all channels visible', () => {
            for (let i = 0; i <= 8; i++) {
                expect(visibility.isChannelVisible('layer1', i as any)).toBe(true);
            }
        });

        it('should toggle channel visibility', () => {
            visibility.toggleChannel('layer1', 3);
            expect(visibility.isChannelVisible('layer1', 3)).toBe(false);
        });
    });

    describe('shouldRenderVoxel', () => {
        it('should return false for channel 0', () => {
            expect(visibility.shouldRenderVoxel('layer1', 0)).toBe(false);
        });

        it('should return true for visible channel', () => {
            expect(visibility.shouldRenderVoxel('layer1', 1)).toBe(true);
        });

        it('should return false for hidden channel', () => {
            visibility.setChannelVisible('layer1', 2, false);
            expect(visibility.shouldRenderVoxel('layer1', 2)).toBe(false);
        });

        it('should return false for hidden layer', () => {
            visibility.setLayerVisible('layer1', false);
            expect(visibility.shouldRenderVoxel('layer1', 1)).toBe(false);
        });
    });
});

// ===== UndoManager Tests =====
describe('UndoManager', () => {
    let undo: UndoManager;

    beforeEach(() => {
        undo = new UndoManager({ maxStackSize: 10 });
    });

    describe('basic undo/redo', () => {
        it('should start with empty stacks', () => {
            expect(undo.canUndo()).toBe(false);
            expect(undo.canRedo()).toBe(false);
        });

        it('should enable undo after push', () => {
            const deltas: Delta[] = [{ layer: 'layer1', axis: 'z', slice: 0, idx: 0, prev: 0, next: 1 }];
            undo.push(deltas);

            expect(undo.canUndo()).toBe(true);
            expect(undo.canRedo()).toBe(false);
        });

        it('should return deltas on undo', () => {
            const deltas: Delta[] = [{ layer: 'layer1', axis: 'z', slice: 0, idx: 0, prev: 0, next: 1 }];
            undo.push(deltas);

            const undone = undo.undo();
            expect(undone).toEqual(deltas);
            expect(undo.canUndo()).toBe(false);
            expect(undo.canRedo()).toBe(true);
        });

        it('should redo after undo', () => {
            const deltas: Delta[] = [{ layer: 'layer1', axis: 'z', slice: 0, idx: 0, prev: 0, next: 1 }];
            undo.push(deltas);
            undo.undo();

            const redone = undo.redo();
            expect(redone).toEqual(deltas);
            expect(undo.canUndo()).toBe(true);
            expect(undo.canRedo()).toBe(false);
        });
    });

    describe('per-layer stacks', () => {
        it('should have independent stacks per layer', () => {
            const deltas1: Delta[] = [{ layer: 'layer1', axis: 'z', slice: 0, idx: 0, prev: 0, next: 1 }];
            const deltas2: Delta[] = [{ layer: 'layer2', axis: 'z', slice: 0, idx: 0, prev: 0, next: 2 }];

            undo.setActiveLayer('layer1');
            undo.push(deltas1);

            undo.setActiveLayer('layer2');
            undo.push(deltas2);

            // Layer2 has its own stack
            expect(undo.canUndo()).toBe(true);
            const undone = undo.undo();
            expect(undone).toEqual(deltas2);

            // Switch back to layer1
            undo.setActiveLayer('layer1');
            expect(undo.canUndo()).toBe(true);
            const undone1 = undo.undo();
            expect(undone1).toEqual(deltas1);
        });
    });

    describe('max stack size', () => {
        it('should limit stack size', () => {
            for (let i = 0; i < 15; i++) {
                undo.push([{ layer: 'layer1', axis: 'z', slice: 0, idx: i, prev: 0, next: 1 }]);
            }

            expect(undo.getUndoCount()).toBe(10); // maxStackSize
        });
    });
});

// ===== KeyboardManager Tests =====
describe('KeyboardManager', () => {
    let keyboard: KeyboardManager;

    beforeEach(() => {
        keyboard = new KeyboardManager();
    });

    describe('bindings', () => {
        it('should have default bindings', () => {
            const bindings = keyboard.getBindings();
            expect(bindings.draw).toBe('Shift');
            expect(bindings.undo).toBe('z');
            expect(bindings.redo).toBe('y');
            expect(bindings.crosshair).toBe('s');
        });

        it('should update binding', () => {
            keyboard.setBinding('crosshair', 'c');
            expect(keyboard.getBindings().crosshair).toBe('c');
        });
    });

    describe('action enabling', () => {
        it('should default all actions enabled', () => {
            expect(keyboard.isActionEnabled('draw')).toBe(true);
            expect(keyboard.isActionEnabled('crosshair')).toBe(true);
        });

        it('should disable action', () => {
            keyboard.setActionEnabled('crosshair', false);
            expect(keyboard.isActionEnabled('crosshair')).toBe(false);
        });
    });

    describe('mouse wheel', () => {
        it('should default to Scroll:Zoom', () => {
            expect(keyboard.getMouseWheelBehavior()).toBe('Scroll:Zoom');
        });

        it('should toggle behavior', () => {
            keyboard.toggleMouseWheelBehavior();
            expect(keyboard.getMouseWheelBehavior()).toBe('Scroll:Slice');

            keyboard.toggleMouseWheelBehavior();
            expect(keyboard.getMouseWheelBehavior()).toBe('Scroll:Zoom');
        });
    });
});

// ===== Constants Tests =====
describe('Constants', () => {
    it('should have 9 channel colors (0-8)', () => {
        expect(Object.keys(CHANNEL_COLORS).length).toBe(9);
    });

    it('should have transparent channel 0', () => {
        expect(CHANNEL_COLORS[0]).toBe('rgba(0,0,0,0)');
        expect(CHANNEL_RGB[0]).toEqual([0, 0, 0, 0]);
    });

    it('should have correct RGB for channel 1 (green)', () => {
        expect(CHANNEL_RGB[1]).toEqual([0, 255, 0, 153]); // 60% alpha
    });
});
