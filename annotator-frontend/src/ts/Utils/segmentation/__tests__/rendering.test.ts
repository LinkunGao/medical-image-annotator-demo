/**
 * Phase 4: Rendering Pipeline - Unit Tests
 *
 * Tests for MaskRenderer and buildLayerImageData
 */

// Polyfill ImageData for jsdom (not available by default)
if (typeof globalThis.ImageData === 'undefined') {
    (globalThis as any).ImageData = class ImageData {
        readonly width: number;
        readonly height: number;
        readonly data: Uint8ClampedArray;

        constructor(width: number, height: number);
        constructor(data: Uint8ClampedArray, width: number, height?: number);
        constructor(
            widthOrData: number | Uint8ClampedArray,
            heightOrWidth: number,
            maybeHeight?: number,
        ) {
            if (widthOrData instanceof Uint8ClampedArray) {
                this.data = widthOrData;
                this.width = heightOrWidth;
                this.height = maybeHeight ?? (widthOrData.length / 4 / heightOrWidth);
            } else {
                this.width = widthOrData;
                this.height = heightOrWidth;
                this.data = new Uint8ClampedArray(this.width * this.height * 4);
            }
        }
    };
}

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
    LayerManager,
    VisibilityManager,
} from '../core';
import type { VolumeDimensions, ChannelValue } from '../core/types';
import { CHANNEL_RGB } from '../core/types';
import { MaskRenderer, buildLayerImageData } from '../rendering/MaskRenderer';
import type { RenderConfig, RenderStats } from '../rendering/MaskRenderer';

// ===== Test Constants =====

const dimensions: VolumeDimensions = { width: 10, height: 10, depth: 5 };

// ===== buildLayerImageData Tests =====

describe('buildLayerImageData', () => {
    it('should return null for empty slice (all channel 0)', () => {
        const sliceData = new Uint8Array(100); // all zeros
        const result = buildLayerImageData(
            sliceData, 10, 10,
            () => true,
        );
        expect(result).toBeNull();
    });

    it('should return null if slice data is too short', () => {
        const sliceData = new Uint8Array(50); // too short for 10x10
        sliceData[0] = 1;
        const result = buildLayerImageData(
            sliceData, 10, 10,
            () => true,
        );
        expect(result).toBeNull();
    });

    it('should produce correct RGBA for channel 1 (green)', () => {
        const sliceData = new Uint8Array(100);
        sliceData[0] = 1; // channel 1 at pixel (0,0)

        const result = buildLayerImageData(
            sliceData, 10, 10,
            () => true,
        );

        expect(result).not.toBeNull();
        expect(result!.width).toBe(10);
        expect(result!.height).toBe(10);

        // Pixel (0,0) should be green with 60% alpha
        const expected = CHANNEL_RGB[1]; // [0, 255, 0, 153]
        expect(result!.data[0]).toBe(expected[0]); // R
        expect(result!.data[1]).toBe(expected[1]); // G
        expect(result!.data[2]).toBe(expected[2]); // B
        expect(result!.data[3]).toBe(expected[3]); // A
    });

    it('should produce correct RGBA for channel 2 (red)', () => {
        const sliceData = new Uint8Array(100);
        sliceData[5] = 2; // channel 2 at pixel (5,0)

        const result = buildLayerImageData(
            sliceData, 10, 10,
            () => true,
        );

        expect(result).not.toBeNull();

        const offset = 5 * 4;
        const expected = CHANNEL_RGB[2]; // [255, 0, 0, 153]
        expect(result!.data[offset]).toBe(expected[0]);
        expect(result!.data[offset + 1]).toBe(expected[1]);
        expect(result!.data[offset + 2]).toBe(expected[2]);
        expect(result!.data[offset + 3]).toBe(expected[3]);
    });

    it('should handle all 8 channels correctly', () => {
        const sliceData = new Uint8Array(100);
        for (let ch = 1; ch <= 8; ch++) {
            sliceData[ch - 1] = ch;
        }

        const result = buildLayerImageData(
            sliceData, 10, 10,
            () => true,
        );

        expect(result).not.toBeNull();

        for (let ch = 1; ch <= 8; ch++) {
            const offset = (ch - 1) * 4;
            const expected = CHANNEL_RGB[ch as ChannelValue];
            expect(result!.data[offset]).toBe(expected[0]);
            expect(result!.data[offset + 1]).toBe(expected[1]);
            expect(result!.data[offset + 2]).toBe(expected[2]);
            expect(result!.data[offset + 3]).toBe(expected[3]);
        }
    });

    it('should leave channel 0 pixels as transparent', () => {
        const sliceData = new Uint8Array(100);
        sliceData[0] = 0; // explicitly channel 0
        sliceData[1] = 1; // channel 1

        const result = buildLayerImageData(
            sliceData, 10, 10,
            () => true,
        );

        expect(result).not.toBeNull();

        // Pixel 0: should be transparent (default zeros in ImageData)
        expect(result!.data[0]).toBe(0);
        expect(result!.data[1]).toBe(0);
        expect(result!.data[2]).toBe(0);
        expect(result!.data[3]).toBe(0);
    });

    it('should respect visibility filter - hide specific channel', () => {
        const sliceData = new Uint8Array(100);
        sliceData[0] = 1; // channel 1
        sliceData[1] = 2; // channel 2

        // Only channel 1 is visible
        const result = buildLayerImageData(
            sliceData, 10, 10,
            (ch) => ch === 1,
        );

        expect(result).not.toBeNull();

        // Pixel 0: channel 1 visible (green)
        expect(result!.data[0]).toBe(0);    // R
        expect(result!.data[1]).toBe(255);  // G
        expect(result!.data[3]).toBe(153);  // A

        // Pixel 1: channel 2 hidden (transparent)
        expect(result!.data[4]).toBe(0);
        expect(result!.data[5]).toBe(0);
        expect(result!.data[6]).toBe(0);
        expect(result!.data[7]).toBe(0);
    });

    it('should return null if all visible channels are hidden', () => {
        const sliceData = new Uint8Array(100);
        sliceData[0] = 1;
        sliceData[1] = 2;

        // All channels hidden
        const result = buildLayerImageData(
            sliceData, 10, 10,
            () => false,
        );

        expect(result).toBeNull();
    });

    it('should handle mixed channels in a single slice', () => {
        const sliceData = new Uint8Array(100);
        sliceData[0] = 1; // green
        sliceData[10] = 3; // blue (pixel at row 1, col 0)
        sliceData[55] = 5; // magenta (pixel at row 5, col 5)

        const result = buildLayerImageData(
            sliceData, 10, 10,
            () => true,
        );

        expect(result).not.toBeNull();

        // Check pixel (0,0) = channel 1
        expect(result!.data[0]).toBe(CHANNEL_RGB[1][0]);

        // Check pixel (0,1) = channel 3 at index 10
        const idx10 = 10 * 4;
        expect(result!.data[idx10]).toBe(CHANNEL_RGB[3][0]);
        expect(result!.data[idx10 + 1]).toBe(CHANNEL_RGB[3][1]);
        expect(result!.data[idx10 + 2]).toBe(CHANNEL_RGB[3][2]);

        // Check pixel (5,5) = channel 5 at index 55
        const idx55 = 55 * 4;
        expect(result!.data[idx55]).toBe(CHANNEL_RGB[5][0]);
        expect(result!.data[idx55 + 1]).toBe(CHANNEL_RGB[5][1]);
    });
});

// ===== MaskRenderer Tests =====

describe('MaskRenderer', () => {
    let renderer: MaskRenderer;
    let layerManager: LayerManager;
    let visibilityManager: VisibilityManager;

    // Mock canvas and context
    let mockCanvas: any;
    let mockCtx: any;
    let mockBufferCanvas: any;
    let mockBufferCtx: any;

    beforeEach(() => {
        layerManager = new LayerManager(dimensions);
        visibilityManager = new VisibilityManager();

        // Create mock context
        mockCtx = {
            clearRect: vi.fn(),
            drawImage: vi.fn(),
            putImageData: vi.fn(),
            globalAlpha: 1.0,
            imageSmoothingEnabled: true,
        };

        mockBufferCtx = {
            clearRect: vi.fn(),
            putImageData: vi.fn(),
        };

        mockCanvas = {
            width: 0,
            height: 0,
            getContext: vi.fn().mockReturnValue(mockCtx),
        };

        mockBufferCanvas = {
            width: 0,
            height: 0,
            getContext: vi.fn().mockReturnValue(mockBufferCtx),
        };

        // Mock document.createElement to return buffer canvas
        const originalCreateElement = document.createElement.bind(document);
        vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
            if (tag === 'canvas') {
                return mockBufferCanvas;
            }
            return originalCreateElement(tag);
        });

        renderer = new MaskRenderer();
        renderer.setTarget(mockCanvas);
        renderer.setManagers(layerManager, visibilityManager);
    });

    afterEach(() => {
        renderer.dispose();
        vi.restoreAllMocks();
    });

    // ----- Setup & Configuration -----

    describe('setup', () => {
        it('should set target canvas', () => {
            expect(renderer.getTarget()).toBe(mockCanvas);
        });

        it('should initialize with default config', () => {
            expect(renderer.isDirty()).toBe(false);
            expect(renderer.isRunning()).toBe(false);
        });

        it('should mark dirty on config change', () => {
            renderer.updateConfig({ sliceIndex: 5 });
            expect(renderer.isDirty()).toBe(true);
        });

        it('should not mark dirty for same config values', () => {
            renderer.updateConfig({ sliceIndex: 0 }); // same as default
            expect(renderer.isDirty()).toBe(false);
        });
    });

    // ----- Core Rendering -----

    describe('render', () => {
        it('should not render without target canvas', () => {
            const emptyRenderer = new MaskRenderer();
            // Should not throw
            emptyRenderer.render(
                layerManager, visibilityManager,
                0, 'z', 1, 0.7,
            );
        });

        it('should not render with zero dimensions', () => {
            const emptyLayers = new LayerManager();
            renderer.render(emptyLayers, visibilityManager, 0, 'z', 1, 0.7);
            expect(mockCtx.clearRect).not.toHaveBeenCalled();
        });

        it('should clear target canvas before rendering', () => {
            renderer.render(layerManager, visibilityManager, 0, 'z', 2, 0.7);
            expect(mockCtx.clearRect).toHaveBeenCalledWith(0, 0, 20, 20);
        });

        it('should set correct target canvas size based on sizeFactor', () => {
            renderer.render(layerManager, visibilityManager, 0, 'z', 3, 0.7);
            expect(mockCanvas.width).toBe(30);  // 10 * 3
            expect(mockCanvas.height).toBe(30); // 10 * 3
        });

        it('should disable image smoothing for crisp edges', () => {
            renderer.render(layerManager, visibilityManager, 0, 'z', 2, 0.7);
            expect(mockCtx.imageSmoothingEnabled).toBe(false);
        });

        it('should set and reset globalAlpha', () => {
            renderer.render(layerManager, visibilityManager, 0, 'z', 1, 0.5);
            // After render, globalAlpha should be reset to 1.0
            expect(mockCtx.globalAlpha).toBe(1.0);
        });

        it('should skip rendering if all layers are hidden', () => {
            visibilityManager.hideAllLayers();
            renderer.render(layerManager, visibilityManager, 0, 'z', 1, 0.7);
            // drawImage should NOT be called since no layers are visible
            expect(mockCtx.drawImage).not.toHaveBeenCalled();
        });

        it('should render visible layers with data', () => {
            // Paint some data on layer1
            layerManager.setActiveLayer('layer1');
            layerManager.applyBrush(0, 5, 5, 2, 1); // green circle

            renderer.render(layerManager, visibilityManager, 0, 'z', 2, 0.7);

            // Buffer should have been used
            expect(mockBufferCtx.putImageData).toHaveBeenCalled();
            // drawImage should have been called for the layer
            expect(mockCtx.drawImage).toHaveBeenCalled();
        });

        it('should not render empty layers (no visible pixels)', () => {
            // All layers empty (no painted data)
            renderer.render(layerManager, visibilityManager, 0, 'z', 1, 0.7);
            // drawImage should NOT be called since no layers have data
            expect(mockCtx.drawImage).not.toHaveBeenCalled();
        });

        it('should render multiple visible layers', () => {
            // Paint on layer1
            layerManager.setActiveLayer('layer1');
            layerManager.applyBrush(0, 3, 3, 1, 1);

            // Paint on layer2
            layerManager.setActiveLayer('layer2');
            layerManager.applyBrush(0, 7, 7, 1, 2);

            renderer.render(layerManager, visibilityManager, 0, 'z', 1, 0.7);

            // drawImage should be called twice (once per visible layer with data)
            expect(mockCtx.drawImage).toHaveBeenCalledTimes(2);
        });

        it('should skip hidden layers even if they have data', () => {
            // Paint on layer1 and layer2
            layerManager.setActiveLayer('layer1');
            layerManager.applyBrush(0, 3, 3, 1, 1);
            layerManager.setActiveLayer('layer2');
            layerManager.applyBrush(0, 7, 7, 1, 2);

            // Hide layer1
            visibilityManager.setLayerVisible('layer1', false);

            renderer.render(layerManager, visibilityManager, 0, 'z', 1, 0.7);

            // Only layer2 should be rendered
            expect(mockCtx.drawImage).toHaveBeenCalledTimes(1);
        });

        it('should skip channels that are hidden', () => {
            // Paint channel 1 and channel 2 on layer1
            layerManager.setActiveLayer('layer1');
            layerManager.applyBrush(0, 3, 3, 1, 1); // channel 1
            layerManager.applyBrush(0, 7, 7, 1, 2); // channel 2

            // Hide channel 1 for layer1
            visibilityManager.setChannelVisible('layer1', 1, false);

            renderer.render(layerManager, visibilityManager, 0, 'z', 1, 0.7);

            // Layer should still render (channel 2 is visible)
            expect(mockCtx.drawImage).toHaveBeenCalledTimes(1);

            // Verify the putImageData was called - the imageData should only
            // contain channel 2 pixels
            const putCall = mockBufferCtx.putImageData.mock.calls[0];
            const imageData = putCall[0] as ImageData;

            // Check that pixel at (3,3) (channel 1) is transparent
            const idx33 = (3 * 10 + 3) * 4;
            expect(imageData.data[idx33 + 3]).toBe(0); // alpha = 0 (hidden)

            // Check that pixel at (7,7) (channel 2) is visible
            const idx77 = (7 * 10 + 7) * 4;
            expect(imageData.data[idx77]).toBe(255);  // R
            expect(imageData.data[idx77 + 3]).toBe(153); // A
        });

        it('should use correct scaling in drawImage call', () => {
            layerManager.setActiveLayer('layer1');
            layerManager.applyBrush(0, 5, 5, 1, 1);

            renderer.render(layerManager, visibilityManager, 0, 'z', 3, 0.7);

            expect(mockCtx.drawImage).toHaveBeenCalledWith(
                mockBufferCanvas,
                0, 0, 10, 10,   // source: original dimensions
                0, 0, 30, 30,   // dest: scaled dimensions
            );
        });

        it('should clear dirty state after render', () => {
            renderer.markDirty();
            expect(renderer.isDirty()).toBe(true);

            renderer.render(layerManager, visibilityManager, 0, 'z', 1, 0.7);

            expect(renderer.isDirty()).toBe(false);
            expect(renderer.isFullDirty()).toBe(false);
            expect(renderer.getDirtyRects()).toHaveLength(0);
        });
    });

    // ----- Render Callback -----

    describe('render callback', () => {
        it('should invoke callback with stats after render', () => {
            const cb = vi.fn();
            renderer.setRenderCallback(cb);

            layerManager.setActiveLayer('layer1');
            layerManager.applyBrush(0, 5, 5, 1, 1);

            renderer.render(layerManager, visibilityManager, 0, 'z', 1, 0.7);

            expect(cb).toHaveBeenCalledTimes(1);
            const stats: RenderStats = cb.mock.calls[0][0];
            expect(stats.layersRendered).toBe(1);
            expect(stats.pixelsProcessed).toBeGreaterThan(0);
            expect(stats.visiblePixels).toBeGreaterThan(0);
            expect(stats.frameTimeMs).toBeGreaterThanOrEqual(0);
        });

        it('should report 0 layers rendered for empty data', () => {
            const cb = vi.fn();
            renderer.setRenderCallback(cb);

            renderer.render(layerManager, visibilityManager, 0, 'z', 1, 0.7);

            const stats: RenderStats = cb.mock.calls[0][0];
            expect(stats.layersRendered).toBe(0);
            expect(stats.visiblePixels).toBe(0);
        });
    });

    // ----- Dirty State Management -----

    describe('dirty state', () => {
        it('should start as not dirty', () => {
            expect(renderer.isDirty()).toBe(false);
        });

        it('should become dirty after requestRender', () => {
            renderer.requestRender();
            expect(renderer.isDirty()).toBe(true);
            expect(renderer.isFullDirty()).toBe(true);
        });

        it('should become dirty after markDirty without rect', () => {
            renderer.markDirty();
            expect(renderer.isDirty()).toBe(true);
            expect(renderer.isFullDirty()).toBe(true);
        });

        it('should track dirty rects', () => {
            const rect = { minX: 0, minY: 0, maxX: 5, maxY: 5 };
            renderer.markDirty(rect);
            expect(renderer.isDirty()).toBe(true);
            expect(renderer.getDirtyRects()).toHaveLength(1);
            expect(renderer.getDirtyRects()[0]).toEqual(rect);
        });

        it('should accumulate multiple dirty rects', () => {
            renderer.markDirty({ minX: 0, minY: 0, maxX: 5, maxY: 5 });
            renderer.markDirty({ minX: 5, minY: 5, maxX: 10, maxY: 10 });
            expect(renderer.getDirtyRects()).toHaveLength(2);
        });

        it('should clear dirty state after render', () => {
            renderer.markDirty({ minX: 0, minY: 0, maxX: 5, maxY: 5 });
            renderer.render(layerManager, visibilityManager, 0, 'z', 1, 0.7);
            expect(renderer.isDirty()).toBe(false);
            expect(renderer.getDirtyRects()).toHaveLength(0);
        });
    });

    // ----- Animation Loop -----

    describe('animation loop', () => {
        beforeEach(() => {
            vi.useFakeTimers();
        });

        afterEach(() => {
            vi.useRealTimers();
        });

        it('should not be running initially', () => {
            expect(renderer.isRunning()).toBe(false);
        });

        it('should start and stop the loop', () => {
            renderer.startLoop();
            expect(renderer.isRunning()).toBe(true);

            renderer.stopLoop();
            expect(renderer.isRunning()).toBe(false);
        });

        it('should not start twice', () => {
            renderer.startLoop();
            renderer.startLoop(); // should be no-op
            expect(renderer.isRunning()).toBe(true);
        });
    });

    // ----- Lifecycle -----

    describe('dispose', () => {
        it('should stop loop and clear references', () => {
            renderer.startLoop();
            renderer.markDirty({ minX: 0, minY: 0, maxX: 5, maxY: 5 });

            renderer.dispose();

            expect(renderer.isRunning()).toBe(false);
            expect(renderer.getTarget()).toBeNull();
            expect(renderer.getDirtyRects()).toHaveLength(0);
        });

        it('should be safe to call multiple times', () => {
            renderer.dispose();
            renderer.dispose(); // should not throw
        });
    });

    // ----- Config Updates -----

    describe('updateConfig', () => {
        it('should trigger dirty on sliceIndex change', () => {
            renderer.updateConfig({ sliceIndex: 5 });
            expect(renderer.isDirty()).toBe(true);
        });

        it('should trigger dirty on axis change', () => {
            renderer.updateConfig({ axis: 'x' });
            expect(renderer.isDirty()).toBe(true);
        });

        it('should trigger dirty on sizeFactor change', () => {
            renderer.updateConfig({ sizeFactor: 2.5 });
            expect(renderer.isDirty()).toBe(true);
        });

        it('should trigger dirty on globalAlpha change', () => {
            renderer.updateConfig({ globalAlpha: 0.3 });
            expect(renderer.isDirty()).toBe(true);
        });

        it('should not trigger dirty for identical values', () => {
            // Default config: sliceIndex=0, axis='z', sizeFactor=1, globalAlpha=0.7
            renderer.updateConfig({ sliceIndex: 0, axis: 'z' });
            expect(renderer.isDirty()).toBe(false);
        });
    });
});
