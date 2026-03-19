<template>
  <div>
    <Switcher
      v-if="debugSetting"
      :title="'Debug Mode'"
      :label="switchDebugLabel"
      v-model:controller="debugMode"
      @toggleUpdate="toggleDebug"
    />
    <Switcher
      v-if="stickyNavSetting"
      :title="'Sticky Tool Settings Bar'"
      :label="switchStickyLabel"
      v-model:controller="stickyMode"
      @toggleUpdate="toggleSticky"
    />

    <Dialog 
      :btnText="'Keyboard Settings'"
      btnColor = "deep-orange"
      btnIcon = "mdi-cog"
      @on-open="handleDialogOpen"
      @on-cancel="handleDialogCancel"
      @on-save="handleDialogSave"
    >

    <template #title>
      <h2 class="text-h5 mb-6">Keyboard Settings</h2>
    </template>

    <template #description>
      <p class="mb-4 text-medium-emphasis text-body-2">
        Customize your keyboard shortcuts for Tumour Study Tool. 
        <br/>
        Click `Save` button to save your changes. Click grey area to cancel.
      </p>
    </template>

    <div v-if="keyBoardSetting">
      <div v-for="(d, i) in settingsData" :key="i" class="d-flex align-center justify-space-between px-10">
        <h4 class="pb-3">
          {{ d.label }}
        </h4>
        <div class="w-50 d-flex">
          <v-btn
            :color="contrastEnabled ? 'warning' : 'success'"
            variant="outlined"
            size="small"
            class="mr-2 align-self-start mt-4"
            rounded="md"
            :style="{ visibility: d.type === 'contrast' ? 'visible' : 'hidden' }"
            @click="toggleContrast"
          >
            {{ contrastEnabled ? 'Disable' : 'Enable' }}
          </v-btn>
          <v-text-field
            v-model="keyboardSettings[d.type]"
            variant="outlined"
            class="flex-grow-1"
            @keydown="handleKeyDown($event, d.type)"
          ></v-text-field>
          
        </div>
      </div>
    </div>
    
    <div class="d-flex align-center justify-space-between px-10">
      <h4 class="pb-3">
        Mouse Wheel Mode:
      </h4>
      <div class="w-33">
        <v-select
          label="Select"
          v-model="keyboardSettings.mouseWheel"
          :items="mouseModes"
          variant="outlined"
        ></v-select>
      </div>
    </div>

    <div class="px-10 mb-4">
      <p class="text-medium-emphasis text-body-2">
        <strong>Shortcut:</strong> Ctrl+1 = Scroll:Zoom, Ctrl+2 = Scroll:Slice
      </p>
    </div>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
/**
 * System Options Control Component
 *
 * @description Provides system-level configuration controls including:
 * - Debug mode toggle
 * - Sticky navigation setting
 * - Keyboard shortcut configuration dialog
 *
 * Integrates with Copper3D NrrdTools for keyboard settings management.
 *
 * @prop {boolean} keyBoardSetting - Show keyboard settings dialog
 * @prop {boolean} stickyNavSetting - Show sticky nav toggle
 * @prop {boolean} debugSetting - Show debug mode toggle
 * @prop {boolean} stick - Initial sticky mode state
 * @prop {Copper.NrrdTools} nrrdTools - Copper3D NRRD tools instance
 *
 * @emits updateDebug - Emitted when debug mode is toggled
 * @emits updateSticky - Emitted when sticky mode is toggled
 */
import * as Copper from "@/ts/index";
import Switcher from "@/components/common/Switcher.vue";
import { ref, onMounted, onUnmounted, watch, computed } from "vue";
import Dialog from "@/components/common/Dialog.vue";
import { IKeyboardSettings } from "@/models";


/**
 * Props interface for component configuration
 */
interface Props {
  keyBoardSetting?: boolean;
  stickyNavSetting?: boolean;
  debugSetting?: boolean;
  stick?: boolean;
  nrrdTools?: Copper.NrrdTools;
}

const props = withDefaults(defineProps<Props>(), {
  keyBoardSetting: false,
  stickyNavSetting: false,
  debugSetting: false,
  stick: true,
});

const emit = defineEmits(["updateDebug","updateSticky"]);

/** Debug mode state */
const debugMode = ref(false);

/** Sticky navigation mode state */
const stickyMode = ref(true);

/** Label for debug mode switch */
const switchDebugLabel = ref("off");

/** Label for sticky mode switch */
const switchStickyLabel = ref("on");

/** Whether the contrast shortcut (Ctrl/Meta) is currently enabled. */
const contrastEnabled = ref(true);

/**
 * Local copy of keyboard settings for editing in dialog.
 * Changes are only applied when user clicks Save.
 */
const keyboardSettings = ref<IKeyboardSettings>({
  draw: '',
  undo: "",
  redo: "",
  contrast: [],
  crosshair: "",
  mouseWheel: "",
});

/** Available mouse wheel mode options */
const mouseModes = ref([
  "Scroll:Zoom",
  "Scroll:Slice",
]);

/**
 * Configuration data for keyboard settings form.
 * Defines labels and types for each configurable key.
 */
const settingsData = ref([
  {
    label: "Key for Draw Mode:",
    type: "draw",
  },
  {
    label: "Key for Undo:",
    type: "undo",
  },
  {
    label: "Key for Redo:",
    type: "redo",
  },
  {
    label: "Key for Contrast:",
    type: "contrast",
  },
  {
    label: "Key for Crosshair:",
    type: "crosshair",
  },
])

/**
 * Watch for nrrdTools changes and sync keyboard settings.
 * Updates local settings when tools instance changes.
 */
watch(
  ()=>props.nrrdTools,
  (tool)=>{
    if (!tool) return;
    keyboardSettings.value = tool.getKeyboardSettings();
    contrastEnabled.value = tool.isContrastShortcutEnabled();
  });

/**
 * Watch for external sticky mode changes and update UI.
 */
watch(
  ()=>props.stick,
  (newVal)=>{
    stickyMode.value = newVal;
    switchStickyLabel.value =  stickyMode.value === false ? "off" : "on";
  }
)

/**
 * Toggles debug mode and emits update event.
 *
 * @param value - New debug mode state
 */
function toggleDebug(value: boolean) {
  switchDebugLabel.value = switchDebugLabel.value === "on" ? "off" : "on";
  emit("updateDebug", value);
}

/**
 * Toggles sticky navigation mode and emits update event.
 *
 * @param value - New sticky mode state
 */
function toggleSticky(value: boolean) {
  switchStickyLabel.value = switchStickyLabel.value === "on" ? "off" : "on";
  emit("updateSticky", value);
}

/**
 * Handles keyboard input for configuring shortcut keys.
 * Uses setTimeout to allow Vue to process the input event before updating.
 *
 * @param event - Keyboard event from input field
 * @param type - Type of keyboard setting being configured
 */
function handleKeyDown(event: KeyboardEvent, type: string) {
  switch(type) {
    case "draw":
      setTimeout(()=>{ keyboardSettings.value.draw = event.key; }, 10);
      break;
    case "undo":
      setTimeout(()=>{ keyboardSettings.value.undo = event.key; }, 10);
      break;
    case "redo":
      setTimeout(()=>{ keyboardSettings.value.redo = event.key; }, 10);
      break;
    case "contrast":
      setTimeout(()=>{ keyboardSettings.value.contrast = [event.key]; }, 10);
      break;
    case "crosshair":
      setTimeout(()=>{ keyboardSettings.value.crosshair = event.key; }, 10);
      break;
  }
}

/**
 * Toggles the contrast shortcut (Ctrl/Meta key) on or off.
 * The button label and color reflect the current state.
 */
function toggleContrast() {
  const newState = !contrastEnabled.value;
  contrastEnabled.value = newState;
  props.nrrdTools?.setContrastShortcutEnabled(newState);
}

/**
 * Handles dialog open event.
 * Enables keyboard configuration mode in NrrdTools to prevent
 * keyboard shortcuts from triggering during configuration.
 */
function handleDialogOpen() {
  props.nrrdTools!.enterKeyboardConfig();
}

/**
 * Handles dialog cancel event.
 * Resets local keyboard settings to original values from NrrdTools.
 */
function handleDialogCancel() {
  props.nrrdTools!.exitKeyboardConfig();
  keyboardSettings.value = props.nrrdTools!.getKeyboardSettings();
}

/**
 * Handles dialog save event.
 * Applies local keyboard settings to NrrdTools.
 * mouseWheel re-binding is handled automatically inside setKeyboardSettings.
 */
function handleDialogSave() {
  props.nrrdTools!.exitKeyboardConfig();
  props.nrrdTools!.setKeyboardSettings(keyboardSettings.value as any);
}

</script>

<style scoped></style>
