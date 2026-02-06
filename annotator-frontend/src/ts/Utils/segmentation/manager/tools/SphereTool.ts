/**
 * SphereTool - 3D Sphere Placement Tool
 *
 * Phase 3 - Tool Abstraction
 *
 * Behavior (from existing DrawToolCore sphere logic):
 * 1. On pointer down: record sphere center in 3D, show preview circle
 * 2. On wheel (while holding): adjust radius [1, 50], redraw preview
 * 3. On pointer up: apply 3D sphere across all affected slices,
 *    store position, notify callback
 *
 * Supports 4 sphere types: tumour, skin, nipple, ribcage
 * Each type has its own color and stored 3D position.
 *
 * Cross-axis coordinate conversion is handled via SphereAdapter
 * since it depends on volume metadata (mm distances, space origins).
 */

import { BaseTool } from './BaseTool';
import type { ToolName } from './BaseTool';
import type { Delta, Point3D, AxisType } from '../core/types';

// ===== Sphere Types =====

export type SphereType = 'tumour' | 'skin' | 'nipple' | 'ribcage';

export const SPHERE_COLORS: Record<SphereType, string> = {
    tumour: '#00ff00',
    skin: '#FFEB3B',
    ribcage: '#2196F3',
    nipple: '#E91E63',
};

/** Sphere origin stored per axis: { x: [mx, my, slice], y: [...], z: [...] } */
export interface SphereOrigin {
    x: [number, number, number];
    y: [number, number, number];
    z: [number, number, number];
}

/** Decay mode for cross-slice circle radius calculation */
export type SphereDecayMode = 'linear' | 'spherical';

// ===== Sphere Adapter =====

/**
 * Adapter for cross-axis coordinate conversion and external callbacks.
 * The project layer provides a concrete implementation.
 */
export interface SphereAdapter {
    /**
     * Convert a cursor point from one axis view to another.
     * Returns the sphere center coordinates on the target axis.
     *
     * @param fromAxis - Source axis
     * @param toAxis - Target axis
     * @param mouseX - X position in original coords on source axis
     * @param mouseY - Y position in original coords on source axis
     * @param sliceIndex - Current slice index on source axis
     * @returns Converted coordinates: { x, y, sliceIndex } on target axis
     */
    convertCursorPoint(
        fromAxis: AxisType,
        toAxis: AxisType,
        mouseX: number,
        mouseY: number,
        sliceIndex: number
    ): { x: number; y: number; sliceIndex: number } | null;

    /**
     * Get the max slice count for a given axis.
     * Needed to clamp sphere slices within bounds.
     */
    getMaxSlice(axis: AxisType): number;

    /**
     * Callback when sphere is placed.
     * @param origin - Sphere center on all 3 axes
     * @param radius - Sphere radius
     */
    onSpherePlaced?: (origin: SphereOrigin, radius: number) => void;

    /**
     * Callback when calculator sphere positions are updated.
     * @param positions - All 4 sphere type positions
     * @param currentAxis - The axis on which the sphere was placed
     */
    onCalculatorPositionsUpdated?: (
        positions: Record<SphereType, SphereOrigin | null>,
        currentAxis: AxisType
    ) => void;
}

// ===== Sphere Tool =====

/** Default initial sphere radius */
const DEFAULT_RADIUS = 3;
const MIN_RADIUS = 1;
const MAX_RADIUS = 50;

export class SphereTool extends BaseTool {
    readonly name: ToolName = 'sphere';

    /** Currently active sphere type (which position marker to place) */
    private activeSphereType: SphereType = 'tumour';

    /** Sphere positions for all 4 types (global, not per-layer) */
    private positions: Map<SphereType, SphereOrigin | null> = new Map([
        ['tumour', null],
        ['skin', null],
        ['nipple', null],
        ['ribcage', null],
    ]);

    /** Current sphere radius */
    private radius: number = DEFAULT_RADIUS;

    /** Whether the user is currently placing a sphere (holding pointer) */
    private isPlacing: boolean = false;

    /** Center position on current axis (original coords) */
    private centerX: number = 0;
    private centerY: number = 0;
    private centerSlice: number = 0;

    /** Decay mode: 'linear' matches existing DrawToolCore, 'spherical' uses true formula */
    private decayMode: SphereDecayMode = 'spherical';

    /** Adapter for cross-axis conversion (injected) */
    private adapter: SphereAdapter | null = null;

    /**
     * Set the sphere adapter for cross-axis conversion.
     */
    setAdapter(adapter: SphereAdapter): void {
        this.adapter = adapter;
    }

    /**
     * Set which sphere type to place next.
     */
    setActiveSphereType(type: SphereType): void {
        this.activeSphereType = type;
    }

    /**
     * Get the currently active sphere type.
     */
    getActiveSphereType(): SphereType {
        return this.activeSphereType;
    }

    /**
     * Set decay mode for cross-slice radius calculation.
     */
    setDecayMode(mode: SphereDecayMode): void {
        this.decayMode = mode;
    }

    /**
     * Get stored position for a sphere type.
     */
    getPosition(type: SphereType): SphereOrigin | null {
        return this.positions.get(type) ?? null;
    }

    /**
     * Get all sphere positions.
     */
    getAllPositions(): Record<SphereType, SphereOrigin | null> {
        return {
            tumour: this.positions.get('tumour') ?? null,
            skin: this.positions.get('skin') ?? null,
            nipple: this.positions.get('nipple') ?? null,
            ribcage: this.positions.get('ribcage') ?? null,
        };
    }

    /**
     * Clear a specific sphere position.
     */
    clearPosition(type: SphereType): void {
        this.positions.set(type, null);
    }

    /**
     * Get current radius.
     */
    getRadius(): number {
        return this.radius;
    }

    // ===== Lifecycle =====

    activate(): void {
        this.radius = DEFAULT_RADIUS;
        if (this.ctx.drawingCanvas) {
            this.ctx.drawingCanvas.style.cursor = 'crosshair';
        }
    }

    deactivate(): void {
        this.isPlacing = false;
        this.clearDrawingCanvas();
    }

    // ===== Pointer Events =====

    /**
     * Start placing sphere: record center in original coords
     */
    onPointerDown(e: PointerEvent): Delta[] {
        const { x, y } = this.screenToOriginal(e.offsetX, e.offsetY);

        this.isPlacing = true;
        this.centerX = x;
        this.centerY = y;
        this.centerSlice = this.ctx.currentSlice;
        this.radius = DEFAULT_RADIUS;

        // Draw preview on current slice
        this.drawSpherePreview();

        return [];
    }

    /**
     * Pointer move is not used for sphere (position is fixed at down).
     */
    onPointerMove(_e: PointerEvent): Delta[] {
        return [];
    }

    /**
     * Release: apply sphere to mask data across all affected slices
     */
    onPointerUp(_e: PointerEvent): Delta[] {
        if (!this.isPlacing) return [];
        this.isPlacing = false;

        // 1. Build SphereOrigin for all 3 axes
        const origin = this.buildSphereOrigin();

        // 2. Store position for the active sphere type
        this.positions.set(this.activeSphereType, origin);

        // 3. Apply 3D sphere to mask data on current axis
        const deltas = this.applySphere3D(
            this.centerX,
            this.centerY,
            this.centerSlice,
            this.radius
        );

        // 4. Push to undo
        if (deltas.length > 0) {
            this.ctx.undoManager.push(deltas);
        }

        // 5. Notify callbacks
        if (this.adapter?.onSpherePlaced) {
            this.adapter.onSpherePlaced(origin, this.radius);
        }
        if (this.adapter?.onCalculatorPositionsUpdated) {
            this.adapter.onCalculatorPositionsUpdated(
                this.getAllPositions(),
                this.ctx.currentAxis
            );
        }

        // 6. Clear preview and re-render
        this.clearDrawingCanvas();
        this.ctx.requestRender();

        return deltas;
    }

    /**
     * Scroll wheel adjusts sphere radius while placing.
     */
    onWheel(e: WheelEvent): void {
        if (!this.isPlacing) return;

        // Adjust radius
        if (e.deltaY < 0) {
            this.radius += 1;
        } else {
            this.radius -= 1;
        }
        this.radius = Math.max(MIN_RADIUS, Math.min(MAX_RADIUS, this.radius));

        // Redraw preview with new radius
        this.drawSpherePreview();
    }

    /**
     * Cancel placement if pointer leaves
     */
    onPointerLeave(_e: PointerEvent): void {
        if (this.isPlacing) {
            this.isPlacing = false;
            this.clearDrawingCanvas();
        }
    }

    // ===== 3D Sphere Application =====

    /**
     * Apply a 3D sphere to the mask data across multiple slices.
     *
     * For each slice within radius distance from the center slice,
     * draws a circle with radius determined by the decay mode:
     * - 'spherical': r_slice = sqrt(R² - d²)  (true sphere)
     * - 'linear':    r_slice = R - d            (existing DrawToolCore pattern)
     */
    private applySphere3D(
        cx: number,
        cy: number,
        centerSlice: number,
        radius: number
    ): Delta[] {
        const allDeltas: Delta[] = [];
        const maxSlice = this.adapter?.getMaxSlice(this.ctx.currentAxis) ?? Infinity;
        const channel = this.ctx.currentChannel;

        for (let d = -radius; d <= radius; d++) {
            const sliceIndex = centerSlice + d;

            // Clamp to valid range
            if (sliceIndex < 0 || sliceIndex > maxSlice) continue;

            // Calculate circle radius at this distance from center
            const absD = Math.abs(d);
            let sliceRadius: number;

            if (this.decayMode === 'spherical') {
                // True sphere: r = sqrt(R² - d²)
                const rSquared = radius * radius - absD * absD;
                if (rSquared <= 0) continue;
                sliceRadius = Math.sqrt(rSquared);
            } else {
                // Linear decay (matching existing DrawToolCore)
                sliceRadius = radius - absD;
                if (sliceRadius <= 0) continue;
            }

            // Apply circular brush at this slice
            const deltas = this.ctx.layerManager.applyBrush(
                sliceIndex,
                cx,
                cy,
                sliceRadius,
                channel
            );

            allDeltas.push(...deltas);
        }

        return allDeltas;
    }

    // ===== Cross-Axis Origin Calculation =====

    /**
     * Build SphereOrigin with coordinates on all 3 axes.
     * Uses the adapter's convertCursorPoint to compute cross-axis coordinates.
     */
    private buildSphereOrigin(): SphereOrigin {
        const axis = this.ctx.currentAxis;
        const origin: SphereOrigin = {
            x: [0, 0, 0],
            y: [0, 0, 0],
            z: [0, 0, 0],
        };

        // Current axis: known directly
        origin[axis] = [this.centerX, this.centerY, this.centerSlice];

        // Other two axes: convert via adapter
        if (this.adapter) {
            const axisOrder: Record<AxisType, [AxisType, AxisType]> = {
                x: ['y', 'z'],
                y: ['z', 'x'],
                z: ['x', 'y'],
            };
            const [axis1, axis2] = axisOrder[axis];

            const conv1 = this.adapter.convertCursorPoint(
                axis,
                axis1,
                this.centerX,
                this.centerY,
                this.centerSlice
            );
            if (conv1) {
                origin[axis1] = [conv1.x, conv1.y, conv1.sliceIndex];
            }

            const conv2 = this.adapter.convertCursorPoint(
                axis,
                axis2,
                this.centerX,
                this.centerY,
                this.centerSlice
            );
            if (conv2) {
                origin[axis2] = [conv2.x, conv2.y, conv2.sliceIndex];
            }
        }

        return origin;
    }

    // ===== Preview Rendering =====

    /**
     * Draw sphere preview circle on the drawing canvas.
     * Shows the circle at the center position with current radius.
     * Also draws any other placed spheres on the current slice.
     */
    private drawSpherePreview(): void {
        const ctx = this.ctx.drawingCtx;
        if (!ctx) return;

        this.clearDrawingCanvas();

        // Draw existing placed spheres on this slice first
        this.drawExistingSpheres(ctx);

        // Draw current placement preview
        const screenPos = this.originalToScreen(this.centerX, this.centerY);
        const screenRadius = this.radius * this.ctx.sizeFactor;

        const color = SPHERE_COLORS[this.activeSphereType];
        ctx.beginPath();
        ctx.arc(screenPos.x, screenPos.y, screenRadius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.6;
        ctx.fill();
        ctx.globalAlpha = 1.0;
        ctx.closePath();
    }

    /**
     * Draw all previously placed spheres that are on the current slice.
     */
    private drawExistingSpheres(ctx: CanvasRenderingContext2D): void {
        const currentAxis = this.ctx.currentAxis;
        const currentSlice = this.ctx.currentSlice;

        for (const [type, origin] of this.positions.entries()) {
            if (!origin) continue;

            // Check if this sphere's center on the current axis matches the current slice
            const [mx, my, sliceIdx] = origin[currentAxis];
            if (sliceIdx !== currentSlice) continue;

            // Don't redraw the one currently being placed (it's drawn separately)
            if (this.isPlacing && type === this.activeSphereType) continue;

            const screenPos = this.originalToScreen(mx, my);
            const screenRadius = this.radius * this.ctx.sizeFactor;

            ctx.beginPath();
            ctx.arc(screenPos.x, screenPos.y, screenRadius, 0, Math.PI * 2);
            ctx.fillStyle = SPHERE_COLORS[type];
            ctx.globalAlpha = 0.6;
            ctx.fill();
            ctx.globalAlpha = 1.0;
            ctx.closePath();
        }
    }
}
