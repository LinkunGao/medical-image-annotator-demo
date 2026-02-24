<template>
  <v-list-group value="LayerChannel">
    <template v-slot:activator="{ props }">
      <v-list-item
        v-bind="props"
        color="nav-success-2"
        prepend-icon="mdi-layers-triple"
        title="Layer & Channel"
      ></v-list-item>
    </template>

    <div class="lc-container" :class="{ 'global-disabled': !controlsEnabled }">
      <!-- Layer Section -->
      <div class="section-header">
        <span class="label">Layers</span>
      </div>

      <div class="layer-list">
        <div
          v-for="layer in LAYER_CONFIGS"
          :key="layer.id"
          class="layer-item"
          :class="{
            'active': activeLayer === layer.id,
            'is-hidden': !layerVisibility[layer.id],
            'is-disabled': isLayerDisabled(layer.id)
          }"
        >
          <!-- Visibility Toggle (Left) -->
          <div
            class="layer-vis-btn"
            :class="{ 'visible': layerVisibility[layer.id], 'hidden': !layerVisibility[layer.id] }"
            @click.stop="onToggleLayerVisibility(layer.id)"
          >
            <v-icon size="14">{{ layerVisibility[layer.id] ? 'mdi-eye' : 'mdi-eye-off' }}</v-icon>
            <v-tooltip activator="parent" location="top" open-delay="400">Toggle Visibility</v-tooltip>
          </div>

          <!-- Selection (Right) -->
          <div
            class="layer-select-area"
            @click="onSelectLayer(layer.id)"
          >
            <span class="layer-name">{{ layer.name }}</span>
            <span v-if="!layerVisibility[layer.id]" class="status-text">(Hidden)</span>
          </div>
        </div>
      </div>

      <!-- Channel Section -->
      <div class="section-header mt-3">
        <span class="label">Channels</span>
        <div v-if="controlsEnabled" class="active-badge" :style="activeBadgeStyle">
          Selected: Ch {{ activeChannel }}
        </div>
      </div>

      <div class="channel-grid">
        <div
          v-for="channel in dynamicChannelConfigs"
          :key="channel.value"
          class="channel-card"
          :class="{
            'active': activeChannel === channel.value,
            'is-disabled': isChannelDisabled(channel.value),
            'parent-hidden': !layerVisibility[activeLayer] || isLayerDisabled(activeLayer)
          }"
          :style="getChannelStyle(channel)"
          @click="onSelectChannel(channel.value)"
        >
          <div class="channel-content">
            <span class="channel-num">{{ channel.value }}</span>
          </div>

          <!-- Visibility Toggle (Absolute Positioned) -->
          <div
            v-if="layerVisibility[activeLayer]"
            class="channel-vis-toggle"
            @click.stop="onToggleChannelVisibility(channel.value)"
            :class="{ 'vis-active': channelVisibility[activeLayer]?.[channel.value], 'is-disabled': isLayerDisabled(activeLayer) || channelDisabled[activeLayer]?.[channel.value] }"
          >
            <v-icon size="12" :color="getVisIconColor(channel.value)">
              {{ channelVisibility[activeLayer]?.[channel.value] ? 'mdi-eye' : 'mdi-eye-off' }}
            </v-icon>
          </div>
        </div>
      </div>

      <!-- Disabled Overlay when controls not enabled -->
      <div v-if="!controlsEnabled" class="disabled-overlay">
        <span>Load image to enable</span>
      </div>

    </div>
  </v-list-group>
</template>

<script setup lang="ts">
/**
 * LayerChannelSelector Component
 *
 * Phase 3.5: Layer/Channel Selection UI
 *
 * Wired to NrrdTools via useLayerChannel composable.
 */
import { ref, computed, onMounted, onUnmounted } from "vue";
import emitter from "@/plugins/custom-emitter";
import * as Copper from "@/ts/index";
// import * as Copper from "copper3d";
import { useLayerChannel, LAYER_CONFIGS, type ChannelConfig } from "@/composables/left-panel";

// ===== NrrdTools ref (received via emitter) =====
const nrrdTools = ref<Copper.NrrdTools | undefined>();

// ===== Composable =====
const {
  activeLayer,
  activeChannel,
  layerVisibility,
  channelVisibility,
  layerDisabled,
  channelDisabled,
  controlsEnabled,
  dynamicChannelConfigs,
  setActiveLayer,
  setActiveChannel,
  toggleLayerVisibility,
  toggleChannelVisibility,
  enableControls,
  disableControls,
  syncFromManager,
  refreshChannelColors,
} = useLayerChannel({ nrrdTools });

// ===== Logic =====

// Helper to check if a layer is disabled
const isLayerDisabled = (layerId: Copper.LayerId) => {
  return layerDisabled.value[layerId] || LAYER_CONFIGS.find(l => l.id === layerId)?.disable;
};

// Helper to check if a channel is disabled
const isChannelDisabled = (val: number) => {
  // If parent layer is disabled, everything is disabled
  if (isLayerDisabled(activeLayer.value)) return true;
  // If channel is explicitly disabled
  if (channelDisabled.value[activeLayer.value]?.[val]) return true;
  // If parent layer is hidden, everything is disabled
  if (!layerVisibility.value[activeLayer.value]) return true;
  // If channel itself is hidden, it's disabled for selection
  return !channelVisibility.value[activeLayer.value]?.[val];
};

// Style for active badge
const activeBadgeStyle = computed(() => {
  if (!controlsEnabled.value) return {};
  const conf = dynamicChannelConfigs.value.find(c => c.value === activeChannel.value);
  const color = conf?.color.replace(',0.6)', ',1)').replace('rgba', 'rgba') || '#fff';
  return {
    backgroundColor: color,
    boxShadow: `0 0 8px ${color}`
  };
});

const getChannelStyle = (channel: ChannelConfig) => {
  const isActive = activeChannel.value === channel.value;
  const isHidden = !channelVisibility.value[activeLayer.value]?.[channel.value];
  const isLayerHidden = !layerVisibility.value[activeLayer.value];
  const isParentDisabled = isLayerDisabled(activeLayer.value);

  if (isLayerHidden || isParentDisabled) return {};

  const baseColor = channel.color.replace(',0.6)', ',1)');

  if (isActive) {
    return {
      borderColor: baseColor,
      boxShadow: `inset 0 0 15px ${channel.color}, 0 0 5px ${baseColor}`,
      color: '#fff'
    };
  }

  if (isHidden) {
      return { opacity: 0.4 };
  }

  return {
      borderColor: 'rgba(var(--v-theme-on-surface), 0.12)'
  };
};

const getVisIconColor = (val: number) => {
  const isVisible = channelVisibility.value[activeLayer.value]?.[val];
  return isVisible ? 'rgba(var(--v-theme-on-surface), 0.9)' : 'rgba(var(--v-theme-on-surface), 0.38)';
};

// ===== Event Handlers =====

function onSelectLayer(layerId: Copper.LayerId): void {
  if (isLayerDisabled(layerId)) return;
  if (!layerVisibility.value[layerId]) {
    return;
  }
  setActiveLayer(layerId);
  emitter.emit("LayerChannel:ActiveChanged", { layerId, channel: activeChannel.value });
}

function onSelectChannel(channel: Copper.ChannelValue): void {
  if (isChannelDisabled(channel)) return;
  setActiveChannel(channel);
  emitter.emit("LayerChannel:ActiveChanged", { layerId: activeLayer.value, channel });
}

function onToggleLayerVisibility(layerId: Copper.LayerId): void {
  if (isLayerDisabled(layerId)) return;
  toggleLayerVisibility(layerId);
}

function onToggleChannelVisibility(channel: Copper.ChannelValue): void {
  if (isLayerDisabled(activeLayer.value)) return;
  if (channelDisabled.value[activeLayer.value]?.[channel]) return;
  toggleChannelVisibility(activeLayer.value, channel);
}

// ===== Emitter Handlers =====

const emitterOnNrrdTools = (tools: Copper.NrrdTools) => {
  nrrdTools.value = tools;
};

const emitterOnFinishLoadAllCaseImages = () => {
  enableControls();
  syncFromManager();
};

const emitterOnCaseSwitched = () => {
  disableControls();
};

// ===== Lifecycle =====

onMounted(() => {
  emitter.on("Core:NrrdTools", emitterOnNrrdTools);
  emitter.on("Segmentation:FinishLoadAllCaseImages", emitterOnFinishLoadAllCaseImages);
  emitter.on("Segementation:CaseSwitched", emitterOnCaseSwitched);
  emitter.on("LayerChannel:RefreshColors", refreshChannelColors);
});

onUnmounted(() => {
  emitter.off("Core:NrrdTools", emitterOnNrrdTools);
  emitter.off("Segmentation:FinishLoadAllCaseImages", emitterOnFinishLoadAllCaseImages);
  emitter.off("Segementation:CaseSwitched", emitterOnCaseSwitched);
  emitter.off("LayerChannel:RefreshColors", refreshChannelColors);
});
</script>

<style scoped>
.lc-container {
  padding: 12px;
  background: rgb(var(--v-theme-surface));
  position: relative;
  min-height: 150px;
  border-radius: 4px;
}

.disabled-overlay {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(var(--v-theme-surface), 0.8);
    backdrop-filter: blur(2px);
    z-index: 10;
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(var(--v-theme-on-surface), 0.7);
    font-size: 12px;
    font-weight: 500;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.label {
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: rgba(var(--v-theme-on-surface), 0.7);
  font-weight: 600;
}

.active-badge {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 10px;
  color: rgb(var(--v-theme-on-primary));
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  box-shadow: 0 0 5px rgba(var(--v-theme-on-surface), 0.3);
  transition: all 0.3s ease;
}

/* ===== Layer Styles ===== */

.layer-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.layer-item {
  display: flex;
  height: 32px;
  border-radius: 6px;
  background: rgba(var(--v-theme-on-surface), 0.08);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  overflow: hidden;
  transition: all 0.2s ease;
}

.layer-item.active {
  border-color: rgb(var(--v-theme-nav-success-2));
  background: linear-gradient(90deg, rgba(var(--v-theme-nav-success-2), 0.2), rgba(var(--v-theme-nav-success-2), 0.05));
}

.layer-item.is-hidden {
    opacity: 0.6;
    border-style: dashed;
}

.layer-item.is-disabled {
    cursor: not-allowed;
    opacity: 0.5;
    filter: grayscale(1);
    border-style: dashed;
}

.layer-item.is-disabled .layer-vis-btn {
    pointer-events: none;
}

.layer-item.is-disabled .layer-select-area {
    pointer-events: none;
    color: rgba(var(--v-theme-on-surface), 0.4);
}

/* Visibility Toggle (Left Part) */
.layer-vis-btn {
  width: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  border-right: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  background: rgba(var(--v-theme-on-surface), 0.05);
  transition: background 0.2s;
}

.layer-vis-btn:hover {
  background: rgba(var(--v-theme-on-surface), 0.15);
}

.layer-vis-btn.visible {
  color: rgb(var(--v-theme-on-surface));
  text-shadow: 0 0 5px rgba(var(--v-theme-on-surface), 0.3);
}

.layer-vis-btn.hidden {
  color: rgba(var(--v-theme-on-surface), 0.3);
}

/* Selection Area (Right Part) */
.layer-select-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 12px;
  cursor: pointer;
  font-size: 12px;
  font-weight: 500;
  color: rgba(var(--v-theme-on-surface), 0.8);
}

.layer-item.is-hidden .layer-select-area {
    cursor: not-allowed;
    color: rgba(var(--v-theme-on-surface), 0.4);
}

.layer-item.active .layer-select-area {
  color: rgb(var(--v-theme-on-surface));
  font-weight: bold;
}

.layer-select-area:hover {
  background: rgba(var(--v-theme-on-surface), 0.05);
}

.status-text {
    font-size: 10px;
    font-style: italic;
    opacity: 0.7;
}

/* ===== Channel Styles ===== */

.channel-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}

.channel-card {
  position: relative;
  height: 44px;
  background: rgba(var(--v-theme-surface), 0.5);
  border: 1px solid rgba(var(--v-theme-on-surface), 0.12);
  border-radius: 6px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  overflow: hidden;
}

.channel-card:hover {
  background: rgba(var(--v-theme-on-surface), 0.08);
  transform: translateY(-1px);
}

.channel-card.active {
  transform: scale(1.02);
  z-index: 1;
}

.channel-card.is-disabled {
    cursor: not-allowed;
    opacity: 0.4;
    filter: grayscale(0.8);
    border-style: dashed;
}

.channel-card.parent-hidden {
    pointer-events: none;
    opacity: 0.2;
}

.channel-num {
  font-size: 14px;
  font-weight: bold;
  opacity: 0.9;
  z-index: 2;
  text-shadow: 0 1px 2px rgba(0,0,0,0.8);
}

/* Channel Visibility Toggle */
.channel-vis-toggle {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: rgba(var(--v-theme-on-surface), 0.2);
  opacity: 0.6;
  z-index: 5;
  cursor: pointer;
  transition: all 0.2s;
}

.channel-vis-toggle:hover {
  background: rgba(var(--v-theme-on-surface), 0.4);
  opacity: 1;
  transform: scale(1.1);
}

.channel-vis-toggle.is-disabled {
  pointer-events: none;
  opacity: 0.2;
}
</style>
