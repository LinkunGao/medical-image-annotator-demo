/**
 * LayerManager - Manages 3 Independent Mask Layers
 * 
 * Phase 2 - Core Data Layer
 * 
 * Provides unified interface for accessing and managing layer1, layer2, layer3
 */

import { MaskLayer } from './MaskLayer';
import type {
    LayerId,
    AxisType,
    Delta,
    LayerConfig,
    VolumeDimensions,
    DEFAULT_LAYER_CONFIGS,
} from './types';

/**
 * Layer lock status
 */
interface LayerLockState {
    layer1: boolean;
    layer2: boolean;
    layer3: boolean;
}

/**
 * LayerManager manages all three mask layers
 */
export class LayerManager {
    /**
     * The three mask layers
     */
    readonly layers: {
        layer1: MaskLayer;
        layer2: MaskLayer;
        layer3: MaskLayer;
    };

    /**
     * Currently active layer for editing
     */
    private _currentLayer: LayerId = 'layer1';

    /**
     * Layer lock state
     */
    private lockState: LayerLockState = {
        layer1: false,
        layer2: false,
        layer3: false,
    };

    /**
     * Layer configurations
     */
    private configs: Map<LayerId, LayerConfig> = new Map();

    constructor(dimensions?: VolumeDimensions) {
        this.layers = {
            layer1: new MaskLayer('layer1', dimensions),
            layer2: new MaskLayer('layer2', dimensions),
            layer3: new MaskLayer('layer3', dimensions),
        };

        // Initialize default configs
        this.configs.set('layer1', { id: 'layer1', name: 'Layer 1', visible: true, locked: false });
        this.configs.set('layer2', { id: 'layer2', name: 'Layer 2', visible: true, locked: false });
        this.configs.set('layer3', { id: 'layer3', name: 'Layer 3', visible: true, locked: false });
    }

    /**
     * Initialize all layers with dimensions
     */
    initialize(dimensions: VolumeDimensions): void {
        this.layers.layer1.initialize(dimensions);
        this.layers.layer2.initialize(dimensions);
        this.layers.layer3.initialize(dimensions);
    }

    /**
     * Get the currently active layer
     */
    get currentLayer(): LayerId {
        return this._currentLayer;
    }

    /**
     * Get the active layer instance
     */
    getActiveLayer(): MaskLayer {
        return this.layers[this._currentLayer];
    }

    /**
     * Set active layer by ID
     * @returns true if successful, false if layer is locked
     */
    setActiveLayer(layerId: LayerId): boolean {
        if (this.lockState[layerId]) {
            console.warn(`Cannot set active layer: ${layerId} is locked`);
            return false;
        }
        this._currentLayer = layerId;
        return true;
    }

    /**
     * Get a specific layer by ID
     */
    getLayer(layerId: LayerId): MaskLayer {
        return this.layers[layerId];
    }

    /**
     * Lock a layer to prevent editing
     */
    lockLayer(layerId: LayerId): void {
        this.lockState[layerId] = true;
        const config = this.configs.get(layerId);
        if (config) {
            config.locked = true;
        }
    }

    /**
     * Unlock a layer
     */
    unlockLayer(layerId: LayerId): void {
        this.lockState[layerId] = false;
        const config = this.configs.get(layerId);
        if (config) {
            config.locked = false;
        }
    }

    /**
     * Check if a layer is locked
     */
    isLocked(layerId: LayerId): boolean {
        return this.lockState[layerId];
    }

    /**
     * Set layer visibility
     */
    setLayerVisible(layerId: LayerId, visible: boolean): void {
        const config = this.configs.get(layerId);
        if (config) {
            config.visible = visible;
        }
    }

    /**
     * Check if a layer is visible
     */
    isVisible(layerId: LayerId): boolean {
        return this.configs.get(layerId)?.visible ?? true;
    }

    /**
     * Get all layer IDs
     */
    getAllLayerIds(): LayerId[] {
        return ['layer1', 'layer2', 'layer3'];
    }

    /**
     * Get layer configuration
     */
    getConfig(layerId: LayerId): LayerConfig | undefined {
        return this.configs.get(layerId);
    }

    /**
     * Set layer configuration
     */
    setConfig(layerId: LayerId, config: Partial<LayerConfig>): void {
        const existing = this.configs.get(layerId);
        if (existing) {
            Object.assign(existing, config);
            // Sync lock state
            if (config.locked !== undefined) {
                this.lockState[layerId] = config.locked;
            }
        }
    }

    /**
     * Set volume data for a specific layer
     */
    setLayerData(layerId: LayerId, data: Uint8Array): void {
        this.layers[layerId].setVolumeData(data);
    }

    /**
     * Get slice from active layer
     */
    getActiveSlice(sliceIndex: number): Uint8Array {
        return this.getActiveLayer().getSlice(sliceIndex);
    }

    /**
     * Get slice from specific layer
     */
    getSlice(layerId: LayerId, sliceIndex: number): Uint8Array {
        return this.layers[layerId].getSlice(sliceIndex);
    }

    /**
     * Apply brush to active layer
     */
    applyBrush(
        slice: number,
        cx: number,
        cy: number,
        radius: number,
        channel: number
    ): Delta[] {
        if (this.lockState[this._currentLayer]) {
            console.warn('Cannot apply brush: current layer is locked');
            return [];
        }
        return this.getActiveLayer().applyBrush(slice, cx, cy, radius, channel);
    }

    /**
     * Fill polygon on active layer
     */
    fillPolygon(slice: number, polygon: { x: number; y: number }[], channel: number): Delta[] {
        if (this.lockState[this._currentLayer]) {
            console.warn('Cannot fill polygon: current layer is locked');
            return [];
        }
        return this.getActiveLayer().fillPolygon(slice, polygon, channel);
    }

    /**
     * Erase on active layer
     */
    erase(slice: number, cx: number, cy: number, radius: number): Delta[] {
        if (this.lockState[this._currentLayer]) {
            console.warn('Cannot erase: current layer is locked');
            return [];
        }
        return this.getActiveLayer().erase(slice, cx, cy, radius);
    }

    /**
     * Apply deltas to the appropriate layer
     */
    applyDeltas(deltas: Delta[], reverse: boolean = false): void {
        // Group deltas by layer
        const layer1Deltas = deltas.filter(d => d.layer === 'layer1');
        const layer2Deltas = deltas.filter(d => d.layer === 'layer2');
        const layer3Deltas = deltas.filter(d => d.layer === 'layer3');

        if (layer1Deltas.length > 0) {
            this.layers.layer1.applyDeltas(layer1Deltas, reverse);
        }
        if (layer2Deltas.length > 0) {
            this.layers.layer2.applyDeltas(layer2Deltas, reverse);
        }
        if (layer3Deltas.length > 0) {
            this.layers.layer3.applyDeltas(layer3Deltas, reverse);
        }
    }

    /**
     * Set axis for all layers
     */
    setAxis(axis: AxisType): void {
        this.layers.layer1.setAxis(axis);
        this.layers.layer2.setAxis(axis);
        this.layers.layer3.setAxis(axis);
    }

    /**
     * Check if any layer has data
     */
    hasData(): boolean {
        return (
            this.layers.layer1.hasData() ||
            this.layers.layer2.hasData() ||
            this.layers.layer3.hasData()
        );
    }

    /**
     * Clear all layers
     */
    clearAll(): void {
        this.layers.layer1.clear();
        this.layers.layer2.clear();
        this.layers.layer3.clear();
    }

    /**
     * Clear a specific layer
     */
    clearLayer(layerId: LayerId): void {
        if (this.lockState[layerId]) {
            console.warn(`Cannot clear: ${layerId} is locked`);
            return;
        }
        this.layers[layerId].clear();
    }

    /**
     * Get dimensions from active layer
     */
    getDimensions(): VolumeDimensions {
        return this.getActiveLayer().getDimensions();
    }
}

// Export singleton instance for convenience
export const layerManager = new LayerManager();
