<template>
  <v-list-group value="Advance">
    <template v-slot:activator="{ props }">
      <v-list-item
        v-bind="props"
        color="nav-success-2"
        prepend-icon="mdi-axe-battle"
        title="Advance Settings"
      ></v-list-item>
    </template>
    <v-container fluid>
      <v-progress-linear
        color="nav-success-2"
        buffer-value="0"
        stream
      ></v-progress-linear>
      <v-radio-group
        class="radio-group"
        v-model="commColorPickerRadios"
        label="Canvas Color Picker"
        :inline="true"
        :disabled="commColorPickerRadiosDisabled"
        @update:modelValue="toggleColorPickerRadios"
      >
        <v-radio
          v-for="(item, idx) in commFuncRadioValues"
          :key="idx"
          :label="item.label"
          :value="item.value"
          :color="item.color"
        ></v-radio>
      </v-radio-group>

      <v-color-picker
        v-model:model-value="commColorPicker"
        class="ml-2"
        mode="hex"
        hide-inputs
        :disabled="commColorPickerDisabled"
        @update:modelValue="handleOnColorPicked"
      ></v-color-picker>
      <v-progress-linear
        color="nav-success-2"
        buffer-value="0"
        stream
      ></v-progress-linear>
    </v-container>
  </v-list-group>
</template>

<script setup lang="ts">
/**
 * Operation Advance Component
 *
 * @description Advanced settings panel for customizing drawing colors:
 * - Pencil stroke color
 * - Pencil fill color
 * - Brush color
 *
 * Uses Vuetify color picker integrated with Copper3D GUI state.
 *
 * @listens Segmentation:FinishLoadAllCaseImages - Enables color picker after loading
 */
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import emitter from "@/plugins/custom-emitter";
import * as Copper from "@/ts/index";
// import * as Copper from "copper3d";

/** Convert a hex color string (#rrggbb or #rrggbbaa) to an RGBA object */
function hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
    a: h.length === 8 ? parseInt(h.substring(6, 8), 16) : 255,
  };
}

/** Convert a CSS rgba/rgb string to #rrggbb hex */
function cssRgbaToHex(css: string): string {
  const match = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return '#ffffff';
  const r = parseInt(match[1]).toString(16).padStart(2, '0');
  const g = parseInt(match[2]).toString(16).padStart(2, '0');
  const b = parseInt(match[3]).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

/** Currently selected color mode (color, channelColor) */
const commColorPickerRadios = ref("");

/** Whether color picker radios are disabled */
const commColorPickerRadiosDisabled = ref(true);

/** Current color picker value in hex format */
const commColorPicker = ref("#009688");

/** Whether color picker is disabled */
const commColorPickerDisabled = ref(true);

/** Pencil stroke color */
const pencilColor = ref("#f50a33");

/** NrrdTools instance (received via emitter) */
const nrrdTools = ref<Copper.NrrdTools | undefined>();

/** Currently active layer id — kept in sync via LayerChannel:ActiveChanged */
const activeLayerId = ref<string>('layer1');

/** Currently active channel — kept in sync via LayerChannel:ActiveChanged */
const activeChannelNum = ref<number>(1);

/**
 * Version counter — incremented to force channelColor to re-read from the volume
 * (Vue can't track mutations inside MaskVolume).
 */
const colorVersion = ref(0);

/**
 * Dynamically computed hex color of the currently active layer/channel.
 * Re-evaluates when layer, channel, or colorVersion changes.
 */
const channelColor = computed(() => {
  colorVersion.value; // reactive dependency for forced recomputation
  if (!nrrdTools.value) return '#ffffff';
  return cssRgbaToHex(nrrdTools.value.getChannelCssColor(activeLayerId.value, activeChannelNum.value));
});

// When channelColor changes and the picker is in channelColor mode, sync the picker display
watch(channelColor, (newColor) => {
  if (commColorPickerRadios.value === 'channelColor') {
    commColorPicker.value = newColor;
  }
});

/**
 * Radio button configuration for color type selection.
 * Colors are bound reactively to current values.
 */
const commFuncRadioValues = ref([
  { label: "Pencil Color", value: "color", color: pencilColor },
  { label: "Channel Color", value: "channelColor", color: channelColor },
]);

/** GUI settings reference from NrrdTools */
const guiSettings = ref<any>();

onMounted(() => {
  manageEmitters();
});

function manageEmitters() {
  emitter.on("Segmentation:FinishLoadAllCaseImages", emitterOnFinishLoadAllCaseImages);
  emitter.on("Core:NrrdTools", emitterOnNrrdTools);
  emitter.on("LayerChannel:ActiveChanged", emitterOnActiveChanged);
  emitter.on("LayerChannel:RefreshColors", emitterOnRefreshColors);
}

const emitterOnNrrdTools = (tools: Copper.NrrdTools) => {
  nrrdTools.value = tools;
};

const emitterOnActiveChanged = (payload: { layerId: string; channel: number }) => {
  activeLayerId.value = payload.layerId;
  activeChannelNum.value = payload.channel;
};

/** Increment colorVersion so channelColor recomputes after an external setChannelColor call */
const emitterOnRefreshColors = () => {
  colorVersion.value++;
};

const emitterOnFinishLoadAllCaseImages = (val:
  {
    guiState: Copper.IGUIStates;
    guiSetting: Copper.IGuiParameterSettings;
  }) => {
  guiSettings.value = val;
  commColorPickerRadios.value = "color";
  commColorPicker.value = guiSettings.value.guiState.color;
  pencilColor.value = guiSettings.value.guiState.color;

  commColorPickerRadiosDisabled.value = false;
  commColorPickerDisabled.value = false;
}

function toggleColorPickerRadios(val: string | null) {
  if (val === null) return;
  if (val === "channelColor") {
    // Show the current channel color in the picker
    commColorPicker.value = channelColor.value;
    return;
  }
  commColorPicker.value = guiSettings.value.guiState[val];
}

function handleOnColorPicked(color: string) {
  switch (commColorPickerRadios.value) {
    case "color":
      pencilColor.value = guiSettings.value.guiState.color = color;
      break;
    case "channelColor": {
      if (!nrrdTools.value) break;
      const rgba = hexToRgba(color);
      nrrdTools.value.setChannelColor(activeLayerId.value, activeChannelNum.value, rgba);
      // Force channelColor to recompute, then notify LayerChannelSelector
      colorVersion.value++;
      emitter.emit("LayerChannel:RefreshColors");
      break;
    }
  }
}

onUnmounted(() => {
  emitter.off("Segmentation:FinishLoadAllCaseImages", emitterOnFinishLoadAllCaseImages);
  emitter.off("Core:NrrdTools", emitterOnNrrdTools);
  emitter.off("LayerChannel:ActiveChanged", emitterOnActiveChanged);
  emitter.off("LayerChannel:RefreshColors", emitterOnRefreshColors);
});
</script>

<style scoped></style>
