/**
 * VisibilityManager - Layer and Channel Visibility Control
 * 
 * Phase 2 - Core Data Layer
 * 
 * Controls which layers and channels are visible during rendering
 */

import type {
    LayerId,
    ChannelValue,
    VisibilityState,
    DEFAULT_VISIBILITY_STATE,
} from './types';

/**
 * Callback for visibility changes
 */
export type VisibilityChangeCallback = (state: VisibilityState) => void;

/**
 * VisibilityManager controls layer and channel visibility
 */
export class VisibilityManager {
    /**
     * Current visibility state
     */
    private state: VisibilityState;

    /**
     * Change listeners
     */
    private listeners: Set<VisibilityChangeCallback> = new Set();

    constructor() {
        // Initialize with default state (all visible)
        this.state = {
            layers: {
                layer1: true,
                layer2: true,
                layer3: true,
            },
            channels: {
                layer1: [true, true, true, true, true, true, true, true, true],
                layer2: [true, true, true, true, true, true, true, true, true],
                layer3: [true, true, true, true, true, true, true, true, true],
            },
        };
    }

    /**
     * Set layer visibility
     */
    setLayerVisible(layerId: LayerId, visible: boolean): void {
        if (this.state.layers[layerId] !== visible) {
            this.state.layers[layerId] = visible;
            this.notifyListeners();
        }
    }

    /**
     * Toggle layer visibility
     */
    toggleLayer(layerId: LayerId): boolean {
        const newValue = !this.state.layers[layerId];
        this.state.layers[layerId] = newValue;
        this.notifyListeners();
        return newValue;
    }

    /**
     * Check if layer is visible
     */
    isLayerVisible(layerId: LayerId): boolean {
        return this.state.layers[layerId];
    }

    /**
     * Set channel visibility for a specific layer
     */
    setChannelVisible(layerId: LayerId, channel: ChannelValue, visible: boolean): void {
        if (this.state.channels[layerId][channel] !== visible) {
            this.state.channels[layerId][channel] = visible;
            this.notifyListeners();
        }
    }

    /**
     * Toggle channel visibility
     */
    toggleChannel(layerId: LayerId, channel: ChannelValue): boolean {
        const newValue = !this.state.channels[layerId][channel];
        this.state.channels[layerId][channel] = newValue;
        this.notifyListeners();
        return newValue;
    }

    /**
     * Check if channel is visible
     */
    isChannelVisible(layerId: LayerId, channel: ChannelValue): boolean {
        return this.state.channels[layerId][channel];
    }

    /**
     * Get all visible layers
     */
    getVisibleLayers(): LayerId[] {
        const visible: LayerId[] = [];
        if (this.state.layers.layer1) visible.push('layer1');
        if (this.state.layers.layer2) visible.push('layer2');
        if (this.state.layers.layer3) visible.push('layer3');
        return visible;
    }

    /**
     * Get visible channels for a layer
     */
    getVisibleChannels(layerId: LayerId): ChannelValue[] {
        const channels: ChannelValue[] = [];
        for (let i = 0; i <= 8; i++) {
            if (this.state.channels[layerId][i]) {
                channels.push(i as ChannelValue);
            }
        }
        return channels;
    }

    /**
     * Show all layers
     */
    showAllLayers(): void {
        this.state.layers.layer1 = true;
        this.state.layers.layer2 = true;
        this.state.layers.layer3 = true;
        this.notifyListeners();
    }

    /**
     * Hide all layers
     */
    hideAllLayers(): void {
        this.state.layers.layer1 = false;
        this.state.layers.layer2 = false;
        this.state.layers.layer3 = false;
        this.notifyListeners();
    }

    /**
     * Show only specified layer (solo mode)
     */
    soloLayer(layerId: LayerId): void {
        this.state.layers.layer1 = layerId === 'layer1';
        this.state.layers.layer2 = layerId === 'layer2';
        this.state.layers.layer3 = layerId === 'layer3';
        this.notifyListeners();
    }

    /**
     * Show all channels for a layer
     */
    showAllChannels(layerId: LayerId): void {
        for (let i = 0; i <= 8; i++) {
            this.state.channels[layerId][i] = true;
        }
        this.notifyListeners();
    }

    /**
     * Hide all channels for a layer (except channel 0 which is transparent)
     */
    hideAllChannels(layerId: LayerId): void {
        for (let i = 1; i <= 8; i++) {
            this.state.channels[layerId][i] = false;
        }
        this.notifyListeners();
    }

    /**
     * Get current visibility state
     */
    getState(): VisibilityState {
        return JSON.parse(JSON.stringify(this.state)); // Deep copy
    }

    /**
     * Set entire visibility state
     */
    setState(state: VisibilityState): void {
        this.state = JSON.parse(JSON.stringify(state)); // Deep copy
        this.notifyListeners();
    }

    /**
     * Reset to default visibility (all visible)
     */
    reset(): void {
        this.state = {
            layers: {
                layer1: true,
                layer2: true,
                layer3: true,
            },
            channels: {
                layer1: [true, true, true, true, true, true, true, true, true],
                layer2: [true, true, true, true, true, true, true, true, true],
                layer3: [true, true, true, true, true, true, true, true, true],
            },
        };
        this.notifyListeners();
    }

    /**
     * Add change listener
     */
    addListener(callback: VisibilityChangeCallback): void {
        this.listeners.add(callback);
    }

    /**
     * Remove change listener
     */
    removeListener(callback: VisibilityChangeCallback): void {
        this.listeners.delete(callback);
    }

    /**
     * Notify all listeners of state change
     */
    private notifyListeners(): void {
        const stateCopy = this.getState();
        for (const listener of this.listeners) {
            listener(stateCopy);
        }
    }

    /**
     * Check if a voxel should be rendered
     * @param layerId - Layer to check
     * @param channelValue - Channel value of the voxel
     */
    shouldRenderVoxel(layerId: LayerId, channelValue: ChannelValue): boolean {
        // Channel 0 is always invisible (transparent)
        if (channelValue === 0) return false;

        // Check layer visibility
        if (!this.state.layers[layerId]) return false;

        // Check channel visibility
        return this.state.channels[layerId][channelValue];
    }
}

// Export singleton instance
export const visibilityManager = new VisibilityManager();
