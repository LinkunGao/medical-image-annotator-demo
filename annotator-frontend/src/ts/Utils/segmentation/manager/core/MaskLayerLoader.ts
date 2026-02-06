/**
 * MaskLayerLoader - Mask Data Loading & Distribution
 *
 * Phase 0 - Data Persistence Strategy
 *
 * Loads mask data from various sources and distributes to MaskLayer instances.
 * Uses dependency injection for all network operations (no project-level imports).
 */

import { LayerManager } from './LayerManager';
import type { LayerId, VolumeDimensions } from './types';

// ===== Types for dependency injection =====

/**
 * Dimensions of the loaded mask volume
 */
export interface MaskDimensions {
    width: number;
    height: number;
    depth: number;
}

/**
 * Data structure for all 3 layers loaded together
 */
export interface LoadedLayerData {
    shape: number[] | null;
    layer1: Uint8Array | null;
    layer2: Uint8Array | null;
    layer3: Uint8Array | null;
}

/**
 * Adapter interface for network operations.
 * The project layer provides the actual implementation.
 */
export interface MaskLoaderAdapter {
    /** Load all 3 layers in a single request */
    fetchAllMasks(caseId: string | number): Promise<LoadedLayerData | null>;
    /** Load raw data for a specific layer */
    fetchLayerRaw(caseId: string | number, layerId: LayerId): Promise<ArrayBuffer | null>;
    /** Initialize empty mask volumes on the backend */
    initLayers(
        caseId: string | number,
        dimensions: number[],
        voxelSpacing?: number[],
        spaceOrigin?: number[]
    ): Promise<boolean>;
}

/**
 * MaskLayerLoader manages loading mask data and distributing it to layers.
 *
 * Usage:
 *   const loader = new MaskLayerLoader(layerManager);
 *   loader.setAdapter(myAdapter);  // project layer provides adapter
 *   await loader.loadAllMasks(caseId);
 */
export class MaskLayerLoader {
    private adapter: MaskLoaderAdapter | null = null;
    private _layerManager: LayerManager;
    private _dimensions: MaskDimensions | null = null;
    private _loaded: boolean = false;

    constructor(layerManager: LayerManager) {
        this._layerManager = layerManager;
    }

    /**
     * Set the adapter for network operations.
     * Must be called before any load operations.
     */
    setAdapter(adapter: MaskLoaderAdapter): void {
        this.adapter = adapter;
    }

    /**
     * Load all 3 mask layers in a single request
     * @param caseId - The case ID to load
     * @returns true if loaded successfully
     */
    async loadAllMasks(caseId: string | number): Promise<boolean> {
        if (!this.adapter) {
            console.error('MaskLayerLoader: No adapter set. Call setAdapter() first.');
            return false;
        }

        try {
            const data = await this.adapter.fetchAllMasks(caseId);
            if (!data) return false;

            // Set dimensions from shape
            if (data.shape && data.shape.length >= 3) {
                this._dimensions = {
                    width: data.shape[0],
                    height: data.shape[1],
                    depth: data.shape[2],
                };
                this._layerManager.initialize(this._dimensions);
            }

            // Distribute data to layers
            if (data.layer1) this._layerManager.setLayerData('layer1', data.layer1);
            if (data.layer2) this._layerManager.setLayerData('layer2', data.layer2);
            if (data.layer3) this._layerManager.setLayerData('layer3', data.layer3);

            this._loaded = true;
            return true;
        } catch (error) {
            console.error('MaskLayerLoader: Failed to load all masks:', error);
            return false;
        }
    }

    /**
     * Load raw data for a specific layer
     * @param caseId - The case ID
     * @param layerId - Which layer to load
     * @param parser - Optional function to parse the ArrayBuffer (e.g., NIfTI parser)
     * @returns true if loaded successfully
     */
    async loadLayerRaw(
        caseId: string | number,
        layerId: LayerId,
        parser?: (buffer: ArrayBuffer) => Uint8Array | null
    ): Promise<boolean> {
        if (!this.adapter) {
            console.error('MaskLayerLoader: No adapter set. Call setAdapter() first.');
            return false;
        }

        try {
            const buffer = await this.adapter.fetchLayerRaw(caseId, layerId);
            if (!buffer) return false;

            let data: Uint8Array | null;

            if (parser) {
                data = parser(buffer);
            } else {
                data = new Uint8Array(buffer);
            }

            if (data) {
                this._layerManager.setLayerData(layerId, data);
                return true;
            }

            return false;
        } catch (error) {
            console.error(`MaskLayerLoader: Failed to load raw data for ${layerId}:`, error);
            return false;
        }
    }

    /**
     * Load from raw Uint8Array directly (e.g., from AI inference output)
     * @param layerId - Which layer to load into
     * @param data - Raw Uint8Array volume data
     */
    loadFromRaw(layerId: LayerId, data: Uint8Array): void {
        this._layerManager.setLayerData(layerId, data);
        this._loaded = true;
    }

    /**
     * Initialize empty NIfTI mask volumes on the backend for a new case
     */
    async initializeEmptyMasks(
        caseId: string | number,
        dimensions: VolumeDimensions,
        voxelSpacing?: number[],
        spaceOrigin?: number[]
    ): Promise<boolean> {
        if (!this.adapter) {
            console.error('MaskLayerLoader: No adapter set. Call setAdapter() first.');
            return false;
        }

        try {
            const success = await this.adapter.initLayers(
                caseId,
                [dimensions.width, dimensions.height, dimensions.depth],
                voxelSpacing,
                spaceOrigin
            );

            if (success) {
                this._dimensions = dimensions;
                this._layerManager.initialize(dimensions);
            }

            return success;
        } catch (error) {
            console.error('MaskLayerLoader: Failed to initialize empty masks:', error);
            return false;
        }
    }

    /**
     * Get slice data from a specific layer (delegates to LayerManager)
     */
    getSlice(layerId: LayerId, sliceIndex: number): Uint8Array {
        return this._layerManager.getSlice(layerId, sliceIndex);
    }

    /**
     * Get the full layer data as a reference to the MaskLayer
     */
    getLayerData(layerId: LayerId) {
        return this._layerManager.getLayer(layerId);
    }

    /**
     * Get loaded dimensions
     */
    get dimensions(): MaskDimensions | null {
        return this._dimensions;
    }

    /**
     * Check if data has been loaded
     */
    get loaded(): boolean {
        return this._loaded;
    }

    /**
     * Reset loader state
     */
    reset(): void {
        this._loaded = false;
        this._dimensions = null;
    }
}

// Export singleton factory (user passes in their LayerManager)
export const maskLayerLoader = new MaskLayerLoader(new LayerManager());
