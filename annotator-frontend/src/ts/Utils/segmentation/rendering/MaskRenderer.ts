/**
 * MaskRenderer - Multi-layer Composite Renderer
 *
 * Phase 4 - Rendering Pipeline
 *
 * Reads from LayerManager (Uint8Array slices), applies VisibilityManager
 * settings, and renders to a target Canvas.
 *
 * Features:
 * - Multi-layer compositing (layer1 → layer2 → layer3)
 * - Per-channel visibility filtering via VisibilityManager
 * - Zoom scaling via sizeFactor (nearest-neighbor for crisp edges)
 * - Global alpha transparency
 * - requestAnimationFrame batching (only re-renders when dirty)
 * - Dirty region tracking for future partial-update optimisation
 *
 * Key design: This module lives inside the npm package boundary.
 * It does NOT import any project-level modules (`@/`).
 * Canvas references are injected via setTarget().
 */

import type { LayerManager } from '../core/LayerManager';
import type { VisibilityManager } from '../core/VisibilityManager';
import type { AxisType, LayerId, ChannelValue, BoundingBox } from '../core/types';
import { CHANNEL_RGB } from '../core/types';

// ===== Types =====

/**
 * Render configuration for the current frame
 */
export interface RenderConfig {
    sliceIndex: number;
    axis: AxisType;
    sizeFactor: number;
    globalAlpha: number;
}

/**
 * Render statistics returned after each frame
 */
export interface RenderStats {
    layersRendered: number;
    pixelsProcessed: number;
    visiblePixels: number;
    frameTimeMs: number;
}

/**
 * Callback invoked after each render frame
 */
export type RenderCallback = (stats: RenderStats) => void;

// ===== Constants =====

/** Layer render order (bottom to top) */
const LAYER_ORDER: LayerId[] = ['layer1', 'layer2', 'layer3'];

// ===== Exported Helper =====

/**
 * Build an ImageData from a Uint8Array slice, filtered by visibility.
 *
 * Exported separately so unit tests can verify pixel logic without
 * requiring a full Canvas mock.
 *
 * @param sliceData  - Uint8Array where each element is a channel value (0-8)
 * @param width      - Slice width in original pixels
 * @param height     - Slice height in original pixels
 * @param isVisible  - Callback: (channel) => boolean; determines whether a
 *                     given channel value should be rendered
 * @returns ImageData with RGBA pixels, or null if no visible pixels exist
 */
export function buildLayerImageData(
    sliceData: Uint8Array,
    width: number,
    height: number,
    isVisible: (channel: ChannelValue) => boolean,
): ImageData | null {
    const totalPixels = width * height;
    if (sliceData.length < totalPixels) return null;

    const imageData = new ImageData(width, height);
    const rgba = imageData.data; // Uint8ClampedArray, length = totalPixels * 4

    let hasVisiblePixels = false;

    for (let i = 0; i < totalPixels; i++) {
        const channel = sliceData[i] as ChannelValue;

        // Channel 0 is always transparent
        if (channel === 0) continue;

        // Skip hidden channels
        if (!isVisible(channel)) continue;

        const color = CHANNEL_RGB[channel];
        if (!color) continue;

        const offset = i * 4;
        rgba[offset] = color[0];     // R
        rgba[offset + 1] = color[1]; // G
        rgba[offset + 2] = color[2]; // B
        rgba[offset + 3] = color[3]; // A

        hasVisiblePixels = true;
    }

    return hasVisiblePixels ? imageData : null;
}

// ===== MaskRenderer =====

export class MaskRenderer {
    // ----- Target canvas (injected via setTarget) -----
    private targetCtx: CanvasRenderingContext2D | null = null;
    private targetCanvas: HTMLCanvasElement | null = null;

    // ----- Offscreen buffer at original dimensions -----
    private bufferCanvas: HTMLCanvasElement | null = null;
    private bufferCtx: CanvasRenderingContext2D | null = null;
    private bufferWidth: number = 0;
    private bufferHeight: number = 0;

    // ----- Managers (stored for rAF re-renders) -----
    private layerManager: LayerManager | null = null;
    private visibilityManager: VisibilityManager | null = null;

    // ----- Render configuration -----
    private config: RenderConfig = {
        sliceIndex: 0,
        axis: 'z',
        sizeFactor: 1,
        globalAlpha: 0.7,
    };

    // ----- Animation loop state -----
    private dirty: boolean = false;
    private fullDirty: boolean = true;
    private rafId: number = 0;
    private running: boolean = false;

    // ----- Dirty region tracking -----
    private dirtyRects: BoundingBox[] = [];

    // ----- Optional callback -----
    private onRender: RenderCallback | null = null;

    // ===== Setup =====

    /**
     * Set the target canvas where masks are rendered.
     * This is the maskDisplayCanvas (top layer in the 3-canvas architecture).
     */
    setTarget(canvas: HTMLCanvasElement): void {
        this.targetCanvas = canvas;
        this.targetCtx = canvas.getContext('2d', { willReadFrequently: false });
    }

    /**
     * Get the current target canvas
     */
    getTarget(): HTMLCanvasElement | null {
        return this.targetCanvas;
    }

    /**
     * Set managers used during the animation loop.
     */
    setManagers(layers: LayerManager, visibility: VisibilityManager): void {
        this.layerManager = layers;
        this.visibilityManager = visibility;
    }

    /**
     * Update render configuration.
     * Changes automatically trigger a re-render on the next frame.
     */
    updateConfig(config: Partial<RenderConfig>): void {
        const prev = { ...this.config };
        Object.assign(this.config, config);

        // Detect meaningful state change
        if (
            prev.sliceIndex !== this.config.sliceIndex ||
            prev.axis !== this.config.axis ||
            prev.sizeFactor !== this.config.sizeFactor ||
            prev.globalAlpha !== this.config.globalAlpha
        ) {
            this.requestRender();
        }
    }

    /**
     * Set optional callback invoked after each render.
     */
    setRenderCallback(cb: RenderCallback | null): void {
        this.onRender = cb;
    }

    // ===== Core Render =====

    /**
     * Main render method.
     *
     * Composites all visible layers onto the target canvas:
     * 1. Clear target
     * 2. For each visible layer (in order):
     *    a. Build ImageData from Uint8Array slice
     *    b. Put ImageData on offscreen buffer (original size)
     *    c. Draw buffer → target with zoom scaling
     * 3. Apply globalAlpha as overall transparency
     *
     * Can be called directly or via the requestAnimationFrame loop.
     */
    render(
        layers: LayerManager,
        visibility: VisibilityManager,
        sliceIndex: number,
        axis: AxisType,
        sizeFactor: number,
        globalAlpha: number,
    ): void {
        const t0 = performance.now();

        if (!this.targetCtx || !this.targetCanvas) return;

        const dims = layers.getDimensions();
        if (dims.width === 0 || dims.height === 0) return;

        // Ensure offscreen buffer matches original dimensions
        this.ensureBuffer(dims.width, dims.height);
        if (!this.bufferCtx || !this.bufferCanvas) return;

        // Calculate target (screen) size
        const targetWidth = Math.round(dims.width * sizeFactor);
        const targetHeight = Math.round(dims.height * sizeFactor);

        // Resize target canvas if needed
        if (this.targetCanvas.width !== targetWidth ||
            this.targetCanvas.height !== targetHeight) {
            this.targetCanvas.width = targetWidth;
            this.targetCanvas.height = targetHeight;
        }

        // Clear target
        this.targetCtx.clearRect(0, 0, targetWidth, targetHeight);

        // Disable image smoothing for crisp pixel edges (nearest-neighbor scaling)
        this.targetCtx.imageSmoothingEnabled = false;

        // Set global alpha for mask transparency
        this.targetCtx.globalAlpha = globalAlpha;

        // Stats
        let layersRendered = 0;
        let totalPixelsProcessed = 0;
        let totalVisiblePixels = 0;

        // Render each layer in order (layer1 bottom → layer3 top)
        for (const layerId of LAYER_ORDER) {
            if (!visibility.isLayerVisible(layerId)) continue;

            const sliceData = layers.getSlice(layerId, sliceIndex);
            totalPixelsProcessed += sliceData.length;

            // Build ImageData from channel values
            const imageData = buildLayerImageData(
                sliceData,
                dims.width,
                dims.height,
                (ch) => visibility.isChannelVisible(layerId, ch),
            );

            if (!imageData) continue;

            // Count visible pixels for stats
            for (let i = 3; i < imageData.data.length; i += 4) {
                if (imageData.data[i] > 0) totalVisiblePixels++;
            }

            // Put ImageData on buffer canvas (original size)
            this.bufferCtx.clearRect(0, 0, dims.width, dims.height);
            this.bufferCtx.putImageData(imageData, 0, 0);

            // Draw buffer → target with scaling (source-over composites layers)
            this.targetCtx.drawImage(
                this.bufferCanvas,
                0, 0, dims.width, dims.height,
                0, 0, targetWidth, targetHeight,
            );

            layersRendered++;
        }

        // Reset global alpha
        this.targetCtx.globalAlpha = 1.0;

        // Clear dirty state
        this.dirty = false;
        this.fullDirty = false;
        this.dirtyRects = [];

        // Notify callback
        const frameTimeMs = performance.now() - t0;
        if (this.onRender) {
            this.onRender({
                layersRendered,
                pixelsProcessed: totalPixelsProcessed,
                visiblePixels: totalVisiblePixels,
                frameTimeMs,
            });
        }
    }

    // ===== Dirty State Management =====

    /**
     * Request a re-render on the next animation frame.
     * Multiple calls before the next frame are batched into one render.
     */
    requestRender(): void {
        this.dirty = true;
        this.fullDirty = true;

        if (!this.running) {
            // One-shot render via rAF
            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
            }
            this.rafId = requestAnimationFrame(() => this.onAnimationFrame());
        }
    }

    /**
     * Mark a specific region as dirty for future partial-update optimisation.
     * If no rect is provided, the entire canvas is marked dirty.
     */
    markDirty(rect?: BoundingBox): void {
        this.dirty = true;
        if (rect) {
            this.dirtyRects.push(rect);
        } else {
            this.fullDirty = true;
        }

        if (!this.running) {
            if (this.rafId) cancelAnimationFrame(this.rafId);
            this.rafId = requestAnimationFrame(() => this.onAnimationFrame());
        }
    }

    /**
     * Check if a render is pending.
     */
    isDirty(): boolean {
        return this.dirty;
    }

    /**
     * Get currently tracked dirty regions.
     */
    getDirtyRects(): readonly BoundingBox[] {
        return this.dirtyRects;
    }

    /**
     * Check if the entire canvas needs re-rendering.
     */
    isFullDirty(): boolean {
        return this.fullDirty;
    }

    // ===== Animation Loop =====

    /**
     * Start a continuous animation loop.
     * The loop calls render() on every frame where the dirty flag is set.
     */
    startLoop(): void {
        if (this.running) return;
        this.running = true;
        this.scheduleFrame();
    }

    /**
     * Stop the animation loop.
     */
    stopLoop(): void {
        this.running = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
            this.rafId = 0;
        }
    }

    /**
     * Check if the animation loop is active.
     */
    isRunning(): boolean {
        return this.running;
    }

    // ===== Lifecycle =====

    /**
     * Dispose of all resources.
     * Must be called when the renderer is no longer needed.
     */
    dispose(): void {
        this.stopLoop();
        this.targetCtx = null;
        this.targetCanvas = null;
        this.bufferCanvas = null;
        this.bufferCtx = null;
        this.layerManager = null;
        this.visibilityManager = null;
        this.dirtyRects = [];
        this.onRender = null;
    }

    // ===== Private Helpers =====

    /**
     * Ensure the offscreen buffer canvas matches the required dimensions.
     * The buffer is reused across frames for efficiency.
     */
    private ensureBuffer(width: number, height: number): void {
        if (
            this.bufferWidth === width &&
            this.bufferHeight === height &&
            this.bufferCanvas
        ) {
            return;
        }

        this.bufferCanvas = document.createElement('canvas');
        this.bufferCanvas.width = width;
        this.bufferCanvas.height = height;
        this.bufferCtx = this.bufferCanvas.getContext('2d', {
            willReadFrequently: true,
        })!;
        this.bufferWidth = width;
        this.bufferHeight = height;
    }

    /**
     * Animation frame callback.
     * Only triggers render() when the dirty flag is set.
     */
    private onAnimationFrame(): void {
        this.rafId = 0;

        if (this.dirty && this.layerManager && this.visibilityManager) {
            this.render(
                this.layerManager,
                this.visibilityManager,
                this.config.sliceIndex,
                this.config.axis,
                this.config.sizeFactor,
                this.config.globalAlpha,
            );
        }

        if (this.running) {
            this.scheduleFrame();
        }
    }

    /**
     * Schedule the next animation frame.
     */
    private scheduleFrame(): void {
        this.rafId = requestAnimationFrame(() => this.onAnimationFrame());
    }
}
