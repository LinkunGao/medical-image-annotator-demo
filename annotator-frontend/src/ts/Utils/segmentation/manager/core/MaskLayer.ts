/**
 * MaskLayer - Single Layer Uint8Array Storage
 * 
 * Phase 2 - Core Data Layer
 * 
 * Key Principle: All coordinates are in ORIGINAL dimensions, not screen coordinates.
 * The caller must convert screen coordinates using sizeFactor before calling these methods.
 */

import type {
    LayerId,
    AxisType,
    Delta,
    ExportMaskData,
    Point2D,
    VolumeDimensions,
} from './types';

/**
 * MaskLayer manages a single 3D mask volume stored as Uint8Array
 * Each voxel value represents a channel (0-8)
 */
export class MaskLayer {
    readonly id: LayerId;
    private width: number;
    private height: number;
    private depth: number;

    /**
     * 3D volume stored as Map<sliceIndex, Uint8Array>
     * Each slice is width × height Uint8Array
     */
    private slices: Map<number, Uint8Array> = new Map();

    /**
     * Current axis for slice indexing
     */
    private currentAxis: AxisType = 'z';

    constructor(id: LayerId, dimensions?: VolumeDimensions) {
        this.id = id;
        this.width = dimensions?.width ?? 0;
        this.height = dimensions?.height ?? 0;
        this.depth = dimensions?.depth ?? 0;
    }

    /**
     * Initialize layer with dimensions
     */
    initialize(dimensions: VolumeDimensions): void {
        this.width = dimensions.width;
        this.height = dimensions.height;
        this.depth = dimensions.depth;
        this.slices.clear();
    }

    /**
     * Set the entire 3D volume from a flat Uint8Array
     * Expected layout: [slice0, slice1, ..., sliceN] where each slice is width * height
     */
    setVolumeData(data: Uint8Array): void {
        const sliceSize = this.width * this.height;
        const numSlices = Math.floor(data.length / sliceSize);

        this.slices.clear();
        for (let z = 0; z < numSlices; z++) {
            const start = z * sliceSize;
            const sliceData = data.slice(start, start + sliceSize);
            this.slices.set(z, sliceData);
        }
    }

    /**
     * Get slice data for rendering
     * @param sliceIndex - The slice index
     * @returns Uint8Array for the slice or empty array if not exists
     */
    getSlice(sliceIndex: number): Uint8Array {
        const existing = this.slices.get(sliceIndex);
        if (existing) {
            return existing;
        }

        // Create empty slice on demand
        const sliceSize = this.width * this.height;
        const newSlice = new Uint8Array(sliceSize);
        this.slices.set(sliceIndex, newSlice);
        return newSlice;
    }

    /**
     * Apply brush stroke at given position
     * All coordinates must be in ORIGINAL dimensions (caller converts from screen coords)
     * 
     * @param slice - Slice index
     * @param cx - Center X in original dimensions
     * @param cy - Center Y in original dimensions
     * @param radius - Brush radius in original dimensions
     * @param channel - Channel value to paint (0-8)
     * @returns Array of Delta changes for undo/sync
     */
    applyBrush(slice: number, cx: number, cy: number, radius: number, channel: number): Delta[] {
        const deltas: Delta[] = [];
        const sliceData = this.getSlice(slice);

        // Iterate over bounding box of circle
        const minX = Math.max(0, Math.floor(cx - radius));
        const maxX = Math.min(this.width - 1, Math.ceil(cx + radius));
        const minY = Math.max(0, Math.floor(cy - radius));
        const maxY = Math.min(this.height - 1, Math.ceil(cy + radius));

        const radiusSquared = radius * radius;

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                // Check if point is within circle
                const dx = x - cx;
                const dy = y - cy;
                if (dx * dx + dy * dy <= radiusSquared) {
                    const idx = y * this.width + x;
                    const prev = sliceData[idx];

                    if (prev !== channel) {
                        sliceData[idx] = channel;
                        deltas.push({
                            layer: this.id,
                            axis: this.currentAxis,
                            slice,
                            idx,
                            prev,
                            next: channel,
                        });
                    }
                }
            }
        }

        return deltas;
    }

    /**
     * Fill polygon with specified channel
     * Used by Pencil tool for drawing closed shapes
     * 
     * @param slice - Slice index
     * @param polygon - Array of points forming the polygon (original dimensions)
     * @param channel - Channel value to fill with
     * @returns Array of Delta changes
     */
    fillPolygon(slice: number, polygon: Point2D[], channel: number): Delta[] {
        if (polygon.length < 3) {
            return [];
        }

        const deltas: Delta[] = [];
        const sliceData = this.getSlice(slice);

        // Find bounding box
        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        for (const p of polygon) {
            minX = Math.min(minX, p.x);
            maxX = Math.max(maxX, p.x);
            minY = Math.min(minY, p.y);
            maxY = Math.max(maxY, p.y);
        }

        // Clamp to slice bounds
        minX = Math.max(0, Math.floor(minX));
        maxX = Math.min(this.width - 1, Math.ceil(maxX));
        minY = Math.max(0, Math.floor(minY));
        maxY = Math.min(this.height - 1, Math.ceil(maxY));

        // Scan line fill using ray casting algorithm
        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                if (this.isPointInPolygon(x, y, polygon)) {
                    const idx = y * this.width + x;
                    const prev = sliceData[idx];

                    if (prev !== channel) {
                        sliceData[idx] = channel;
                        deltas.push({
                            layer: this.id,
                            axis: this.currentAxis,
                            slice,
                            idx,
                            prev,
                            next: channel,
                        });
                    }
                }
            }
        }

        return deltas;
    }

    /**
     * Ray casting algorithm for point-in-polygon test
     */
    private isPointInPolygon(x: number, y: number, polygon: Point2D[]): boolean {
        let inside = false;
        const n = polygon.length;

        for (let i = 0, j = n - 1; i < n; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;

            if (((yi > y) !== (yj > y)) &&
                (x < (xj - xi) * (y - yi) / (yj - yi) + xi)) {
                inside = !inside;
            }
        }

        return inside;
    }

    /**
     * Erase (set to channel 0) at given position
     * 
     * @param slice - Slice index
     * @param cx - Center X in original dimensions
     * @param cy - Center Y in original dimensions
     * @param radius - Eraser radius in original dimensions
     * @returns Array of Delta changes
     */
    erase(slice: number, cx: number, cy: number, radius: number): Delta[] {
        return this.applyBrush(slice, cx, cy, radius, 0);
    }

    /**
     * Apply a batch of deltas (for undo/redo)
     * 
     * @param deltas - Array of deltas to apply
     * @param reverse - If true, apply in reverse (undo)
     */
    applyDeltas(deltas: Delta[], reverse: boolean = false): void {
        for (const delta of deltas) {
            if (delta.layer !== this.id) continue;

            const sliceData = this.getSlice(delta.slice);
            sliceData[delta.idx] = reverse ? delta.prev : delta.next;
        }
    }

    /**
     * Export slice data for backend
     */
    exportSlice(
        sliceIndex: number,
        voxelSpacing: number[],
        spaceOrigin: number[]
    ): ExportMaskData {
        const sliceData = this.getSlice(sliceIndex);

        return {
            layer: this.id,
            axis: this.currentAxis,
            sliceIndex,
            width: this.width,
            height: this.height,
            voxelSpacing,
            spaceOrigin,
            data: Array.from(sliceData),
        };
    }

    /**
     * Import slice data from backend
     */
    importSlice(data: ExportMaskData): void {
        if (data.layer !== this.id) return;

        const sliceData = new Uint8Array(data.data);
        this.slices.set(data.sliceIndex, sliceData);

        // Update dimensions if not set
        if (this.width === 0) this.width = data.width;
        if (this.height === 0) this.height = data.height;
    }

    /**
     * Get a single voxel value
     */
    getVoxel(slice: number, x: number, y: number): number {
        const sliceData = this.slices.get(slice);
        if (!sliceData) return 0;

        const idx = y * this.width + x;
        return sliceData[idx] ?? 0;
    }

    /**
     * Set a single voxel value
     */
    setVoxel(slice: number, x: number, y: number, channel: number): Delta | null {
        const sliceData = this.getSlice(slice);
        const idx = y * this.width + x;
        const prev = sliceData[idx];

        if (prev === channel) return null;

        sliceData[idx] = channel;

        return {
            layer: this.id,
            axis: this.currentAxis,
            slice,
            idx,
            prev,
            next: channel,
        };
    }

    /**
     * Set current axis for operations
     */
    setAxis(axis: AxisType): void {
        this.currentAxis = axis;
    }

    /**
     * Get current dimensions
     */
    getDimensions(): VolumeDimensions {
        return {
            width: this.width,
            height: this.height,
            depth: this.depth,
        };
    }

    /**
     * Check if layer has any non-zero data
     */
    hasData(): boolean {
        for (const sliceData of this.slices.values()) {
            for (let i = 0; i < sliceData.length; i++) {
                if (sliceData[i] !== 0) return true;
            }
        }
        return false;
    }

    /**
     * Clear all data
     */
    clear(): void {
        this.slices.clear();
    }

    /**
     * Get total number of non-zero voxels
     */
    getVoxelCount(): number {
        let count = 0;
        for (const sliceData of this.slices.values()) {
            for (let i = 0; i < sliceData.length; i++) {
                if (sliceData[i] !== 0) count++;
            }
        }
        return count;
    }
}
