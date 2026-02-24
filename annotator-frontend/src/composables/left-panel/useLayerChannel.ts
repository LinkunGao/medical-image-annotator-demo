/**
 * useLayerChannel Composable
 *
 * Phase 3.5: Layer/Channel Selection UI
 * Phase B: Dynamic per-layer channel colors
 *
 * Manages layer and channel selection state for the segmentation module.
 * Provides reactive state for Vue components and syncs with NrrdTools.
 */
import { ref, computed, type Ref, type ComputedRef } from "vue";
import * as Copper from "@/ts/index";
// import * as Copper from "copper3d";

// ===== Types =====

export interface ILayerChannelDeps {
    nrrdTools: Ref<Copper.NrrdTools | undefined>;
}

export interface LayerConfig {
    id: Copper.LayerId;
    name: string;
    disable?: boolean;
    disabledChannels?: number[];
}

export interface ChannelConfig {
    value: Copper.ChannelValue;
    name: string;
    color: string;  // From CHANNEL_COLORS or custom per-layer color
}

// ===== Constants =====

/**
 * Layer configurations
 */
// export const LAYER_CONFIGS: LayerConfig[] = [
//     { id: 'layer1', name: 'Layer 1' },  // Green
//     { id: 'layer2', name: 'Layer 2', disabledChannels: [2, 3, 4, 5, 6, 7, 8] },  // Blue
//     { id: 'layer3', name: 'Layer 3', disable: true },  // Orange
// ];
export const LAYER_CONFIGS: LayerConfig[] = [
    { id: 'layer1', name: 'Layer 1' },
    { id: 'layer2', name: 'Layer 2' },
    { id: 'layer3', name: 'Layer 3' },
    { id: 'layer4', name: 'Layer 4' },
];

/**
 * Static default channel configurations (channels 1-8, channel 0 is transparent/erased).
 * Used as fallback when NrrdTools is not available.
 */
export const CHANNEL_CONFIGS: ChannelConfig[] = [
    { value: 1 as Copper.ChannelValue, name: 'Ch 1', color: Copper.CHANNEL_COLORS[1] },
    { value: 2 as Copper.ChannelValue, name: 'Ch 2', color: Copper.CHANNEL_COLORS[2] },
    { value: 3 as Copper.ChannelValue, name: 'Ch 3', color: Copper.CHANNEL_COLORS[3] },
    { value: 4 as Copper.ChannelValue, name: 'Ch 4', color: Copper.CHANNEL_COLORS[4] },
    { value: 5 as Copper.ChannelValue, name: 'Ch 5', color: Copper.CHANNEL_COLORS[5] },
    { value: 6 as Copper.ChannelValue, name: 'Ch 6', color: Copper.CHANNEL_COLORS[6] },
    { value: 7 as Copper.ChannelValue, name: 'Ch 7', color: Copper.CHANNEL_COLORS[7] },
    { value: 8 as Copper.ChannelValue, name: 'Ch 8', color: Copper.CHANNEL_COLORS[8] },
];

// ===== Composable =====

export function useLayerChannel(deps: ILayerChannelDeps) {

    // ===== Reactive State =====

    /** Currently active layer */
    const activeLayer = ref<Copper.LayerId>('layer1');

    /** Currently active channel */
    const activeChannel = ref<Copper.ChannelValue>(1 as Copper.ChannelValue);

    /** Layer visibility states */
    const layerVisibility = ref<Record<Copper.LayerId, boolean>>(
        Object.fromEntries(LAYER_CONFIGS.map(l => [l.id, true]))
    );

    /** Channel visibility states (per layer) */
    const channelVisibility = ref<Record<Copper.LayerId, Record<number, boolean>>>(
        Object.fromEntries(LAYER_CONFIGS.map(l => [l.id, { 1: true, 2: true, 3: true, 4: true, 5: true, 6: true, 7: true, 8: true }]))
    );

    /** Layer disabled states */
    const layerDisabled = ref<Record<Copper.LayerId, boolean>>(
        Object.fromEntries(LAYER_CONFIGS.map(l => [l.id, l.disable ?? false]))
    );

    /** Channel disabled states (per layer) */
    const channelDisabled = ref<Record<Copper.LayerId, Record<number, boolean>>>(
        Object.fromEntries(LAYER_CONFIGS.map(l => [
            l.id,
            Object.fromEntries([1, 2, 3, 4, 5, 6, 7, 8].map(ch => [ch, l.disabledChannels?.includes(ch) ?? false]))
        ]))
    );

    /** Whether the controls are enabled (after images loaded) */
    const controlsEnabled = ref(false);

    /**
     * Color version counter — incremented to trigger re-computation
     * of dynamic channel colors (Vue can't track MaskVolume mutations).
     */
    const colorVersion = ref(0);

    // ===== Computed =====

    /**
     * Dynamic channel configs reflecting per-layer custom colors.
     * Automatically re-evaluates when activeLayer, colorVersion, or nrrdTools change.
     */

    const dynamicChannelConfigs: ComputedRef<ChannelConfig[]> = computed(() => {
        colorVersion.value; // trigger reactivity on color changes

        return ([1, 2, 3, 4, 5, 6, 7, 8] as Copper.ChannelValue[]).map(val => ({
            value: val,
            name: `Ch ${val}`,
            color: deps.nrrdTools.value
                ? deps.nrrdTools.value.getChannelCssColor(activeLayer.value, val)
                : Copper.CHANNEL_COLORS[val],
        }));
    });

    /** Get display color for the active channel (dynamic, from volume) */
    const activeChannelColor: ComputedRef<string> = computed(() => {
        colorVersion.value; // trigger reactivity on color changes
        if (deps.nrrdTools.value) {
            return deps.nrrdTools.value.getChannelCssColor(activeLayer.value, activeChannel.value);
        }
        return Copper.CHANNEL_COLORS[activeChannel.value] || 'rgba(0,0,0,0)';
    });

    /** Get display name for the active layer */
    const activeLayerName: ComputedRef<string> = computed(() => {
        const config = LAYER_CONFIGS.find(l => l.id === activeLayer.value);
        return config?.name || activeLayer.value;
    });

    // ===== Actions =====

    /**
     * Set the active layer and sync to NrrdTools
     */
    function setActiveLayer(layerId: Copper.LayerId): void {
        activeLayer.value = layerId;
        deps.nrrdTools.value?.setActiveLayer(layerId);
    }

    /**
     * Set the active channel and sync to NrrdTools
     */
    function setActiveChannel(channel: Copper.ChannelValue): void {
        activeChannel.value = channel;
        deps.nrrdTools.value?.setActiveChannel(channel);
    }

    /**
     * Toggle layer visibility and sync to NrrdTools
     */
    function toggleLayerVisibility(layerId: Copper.LayerId): void {
        const newValue = !layerVisibility.value[layerId];
        layerVisibility.value[layerId] = newValue;
        deps.nrrdTools.value?.setLayerVisible(layerId, newValue);
    }

    /**
     * Toggle channel visibility and sync to NrrdTools
     */
    function toggleChannelVisibility(layerId: Copper.LayerId, channel: Copper.ChannelValue): void {
        const newValue = !channelVisibility.value[layerId][channel];
        channelVisibility.value[layerId][channel] = newValue;
        deps.nrrdTools.value?.setChannelVisible(layerId, channel, newValue);
    }

    /**
     * Disable/Enable layer
     */
    function setLayerDisabled(layerId: Copper.LayerId, disabled: boolean): void {
        layerDisabled.value[layerId] = disabled;
    }

    /**
     * Disable/Enable channel
     */
    function setChannelDisabled(layerId: Copper.LayerId, channel: number, disabled: boolean): void {
        if (!channelDisabled.value[layerId]) {
            channelDisabled.value[layerId] = {};
        }
        channelDisabled.value[layerId][channel] = disabled;
    }

    /**
     * Enable controls after images loaded
     */
    function enableControls(): void {
        controlsEnabled.value = true;
    }

    /**
     * Disable controls (e.g., when switching cases)
     */
    function disableControls(): void {
        controlsEnabled.value = false;
    }

    /**
     * Force re-evaluation of dynamic channel colors.
     * Call this after using NrrdTools.setChannelColor() externally.
     */
    function refreshChannelColors(): void {
        colorVersion.value++;
    }

    /**
     * Sync state from NrrdTools (called after initialization)
     */
    function syncFromManager(): void {
        const tools = deps.nrrdTools.value;
        if (!tools) return;

        // Sync active layer and channel
        activeLayer.value = tools.getActiveLayer();
        activeChannel.value = tools.getActiveChannel() as Copper.ChannelValue;


        // Sync visibility states
        const layerVis = tools.getLayerVisibility();
        const channelVis = tools.getChannelVisibility();

        // Iterate over all configured layers (derived from LAYER_CONFIGS, not hardcoded),
        // so adding a new layer to LAYER_CONFIGS automatically includes it here.
        const layers = LAYER_CONFIGS.map(l => l.id);
        layers.forEach(layerId => {
            // Fall back to visible (true) if NrrdTools has no record for this layer yet
            layerVisibility.value[layerId] = layerVis[layerId] ?? true;
            // Only overwrite channel visibility if NrrdTools actually has data for this layer
            if (channelVis[layerId]) {
                channelVisibility.value[layerId] = { ...channelVis[layerId] };
            }
        });

        // Also refresh channel colors from volumes
        refreshChannelColors();
    }

    // ===== Return =====

    return {
        // State
        activeLayer,
        activeChannel,
        layerVisibility,
        channelVisibility,
        layerDisabled,
        channelDisabled,
        controlsEnabled,

        // Computed
        dynamicChannelConfigs,
        activeChannelColor,
        activeLayerName,

        // Actions
        setActiveLayer,
        setActiveChannel,
        toggleLayerVisibility,
        toggleChannelVisibility,
        setLayerDisabled,
        setChannelDisabled,
        enableControls,
        disableControls,
        refreshChannelColors,
        syncFromManager,

        // Configs (for UI rendering)
        LAYER_CONFIGS,
        CHANNEL_CONFIGS,
    };
}
