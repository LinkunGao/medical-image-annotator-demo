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
 * Phase 1 Refactored: guiSettings color access replaced with NrrdTools typed API.
 *
 * @listens Segmentation:FinishLoadAllCaseImages - Enables color picker after loading
 */
import { ref, computed, watch, onMounted, onUnmounted } from "vue";
import emitter from "@/plugins/custom-emitter";
// import type { NrrdTools } from "@/ts/index";
import type { NrrdTools } from "copper3d";

function hexToRgba(hex: string): { r: number; g: number; b: number; a: number } {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16),
    a: h.length === 8 ? parseInt(h.substring(6, 8), 16) : 255,
  };
}

function cssRgbaToHex(css: string): string {
  const match = css.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return '#ffffff';
  const r = parseInt(match[1]).toString(16).padStart(2, '0');
  const g = parseInt(match[2]).toString(16).padStart(2, '0');
  const b = parseInt(match[3]).toString(16).padStart(2, '0');
  return `#${r}${g}${b}`;
}

const commColorPickerRadios = ref("");
const commColorPickerRadiosDisabled = ref(true);
const commColorPicker = ref("#009688");
const commColorPickerDisabled = ref(true);
const pencilColor = ref("#f50a33");

const nrrdTools = ref<NrrdTools | undefined>();
const activeLayerId = ref<string>('layer1');
const activeChannelNum = ref<number>(1);
const colorVersion = ref(0);

const channelColor = computed(() => {
  colorVersion.value;
  if (!nrrdTools.value) return '#ffffff';
  return cssRgbaToHex(nrrdTools.value.getChannelCssColor(activeLayerId.value, activeChannelNum.value));
});

watch(channelColor, (newColor) => {
  if (commColorPickerRadios.value === 'channelColor') {
    commColorPicker.value = newColor;
  }
});

const commFuncRadioValues = ref([
  { label: "Pencil Color", value: "color", color: pencilColor },
  { label: "Channel Color", value: "channelColor", color: channelColor },
]);

onMounted(() => {
  manageEmitters();
});

function manageEmitters() {
  emitter.on("Segmentation:FinishLoadAllCaseImages", emitterOnFinishLoadAllCaseImages);
  emitter.on("Core:NrrdTools", emitterOnNrrdTools);
  emitter.on("LayerChannel:ActiveChanged", emitterOnActiveChanged);
  emitter.on("LayerChannel:RefreshColors", emitterOnRefreshColors);
}

const emitterOnNrrdTools = (tools: NrrdTools) => {
  nrrdTools.value = tools;
};

const emitterOnActiveChanged = (payload: { layerId: string; channel: number }) => {
  activeLayerId.value = payload.layerId;
  activeChannelNum.value = payload.channel;
};

const emitterOnRefreshColors = () => {
  colorVersion.value++;
};

const emitterOnFinishLoadAllCaseImages = () => {
  commColorPickerRadios.value = "color";
  if (nrrdTools.value) {
    const currentColor = nrrdTools.value.getPencilColor();
    commColorPicker.value = currentColor;
    pencilColor.value = currentColor;
  }

  commColorPickerRadiosDisabled.value = false;
  commColorPickerDisabled.value = false;
}

function toggleColorPickerRadios(val: string | null) {
  if (val === null) return;
  if (val === "channelColor") {
    commColorPicker.value = channelColor.value;
    return;
  }
  if (nrrdTools.value) {
    commColorPicker.value = nrrdTools.value.getPencilColor();
  }
}

function handleOnColorPicked(color: string) {
  switch (commColorPickerRadios.value) {
    case "color":
      if (nrrdTools.value) {
        nrrdTools.value.setPencilColor(color);
      }
      pencilColor.value = color;
      break;
    case "channelColor": {
      if (!nrrdTools.value) break;
      const rgba = hexToRgba(color);
      nrrdTools.value.setChannelColor(activeLayerId.value, activeChannelNum.value, rgba);
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
