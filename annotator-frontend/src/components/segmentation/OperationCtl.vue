<template>
    <Operation>


      <template #FunctionalControl>
        <FunctionalControl
          v-model="commFuncRadios"
          :disabled="commFuncRadiosDisabled"
          :radio-values="commFuncRadioValues"
          @update:selected-radio="toggleFuncRadios" 
          />
      </template>

      <template #SliderControl>
        <SliderControl 
          v-model:slider-radio="commSliderRadios"
          v-model:slider="slider"
          :disabled="commSliderRadiosDisabled"
          :slider-radio-values="commSliderRadioValues"
          :slider-color="sliderColor"
          :slider-disabled="sliderDisabled"
          :slider-max="sliderMax"
          :slider-min="sliderMin"
          :slider-step="sliderStep"
          @update:selected-slider-radio="toggleSliderRadios"
          @update:slider="toggleSlider"
          @update:slider-finished="toggleSliderFinished"
        />
      </template>

      <template #ButtonControl>
        <ButtonsControl
          :comm-func-btn-values="commFuncBtnValues"
          @update:btnClicked="onBtnClick"
        />
      </template>

      <template #OperationAdvance>
        <OperationAdvance />
      </template>

      <!-- Phase 7 - Step 10b: Layer/Channel Selection -->
      <template #LayerChannel>
        <LayerChannelSelector />
      </template>
    </Operation>
</template>

<script setup lang="ts">
/**
 * Operation Control Component
 *
 * Phase 1 Refactored: All guiSettings access replaced with NrrdTools typed API.
 *
 * @listens Segementation:CaseSwitched - Resets controls when case changes
 * @listens Segmentation:FinishLoadAllCaseImages - Enables controls after loading
 * @listens Common:DragImageWindowCenter - Updates window center via drag
 * @listens Common:DragImageWindowHigh - Updates window high via drag
 * @listens Core:NrrdTools - Receives NrrdTools instance
 *
 * @emits Common:OpenCalculatorBox - Opens calculator panel
 * @emits Common:CloseCalculatorBox - Closes calculator panel
 * @emits SegmentationTrial:CalulatorTimerFunction - Timer control for calculator
 */
import OperationAdvance from "./OperationAdvance.vue";
import LayerChannelSelector from "./LayerChannelSelector.vue";

import Operation from "@/components/navigation/Operation.vue"
import FunctionalControl from "@/components/navigation/FunctionalControl.vue";
import SliderControl from "@/components/navigation/SliderControl.vue";
import ButtonsControl from "@/components/navigation/ButtonsControl.vue";
import { ref, onMounted, onUnmounted } from "vue";
import emitter from "@/plugins/custom-emitter";
// import type { NrrdTools, ToolMode } from "@/ts/index";
import type { NrrdTools, ToolMode } from "copper3d";

const commFuncRadios = ref("pencil");
const commFuncRadiosDisabled = ref(true);
const commSliderRadios = ref("");
const commSliderRadiosDisabled = ref(true);
const slider = ref(0);
const sliderColor = ref("grey");
const sliderDisabled = ref(true);
const sliderMax = ref(100);
const sliderMin = ref(0);
const sliderStep = ref(1);

const btnUndoDisabled = ref(true);
const btnResetZoomDisabled = ref(true);
const btnClearDisabled = ref(true);
const btnClearAllDisabled = ref(true);

const contrastDragSensitivity = ref(25);

let nrrdTools: NrrdTools;

const commFuncRadioValues = ref([
  { label: "Pencil", value: "pencil", color: "success" },
  { label: "Brush", value: "brush", color: "info" },
  { label: "Eraser", value: "eraser", color: "error" },
]);

const commSliderRadioValues = ref([
  { label: "Opacity", value: "globalAlpha", color: "success" },
  { label: "Layer Alpha", value: "layerAlpha", color: "secondary" },
  { label: "B&E Size", value: "brushAndEraserSize", color: "info" },
  { label: "WindowHigh", value: "windowHigh", color: "warning" },
  { label: "WindowCenter", value: "windowLow", color: "error" },
  { label: "WindowSensitivity", value: "sensitivity", color: "pink-darken-1" },
]);

const commFuncBtnValues = ref([
  {
    label: "Undo",
    value: "undo",
    disabled: btnUndoDisabled,
    color: "nav-success-2",
  },
  {
    label: "Reset Zoom",
    value: "resetZoom",
    disabled: btnResetZoomDisabled,
    color: "nav-success-2",
  },
  {
    label: "Clear Slice Mask",
    value: "clearActiveSliceMask",
    disabled: btnClearDisabled,
    color: "nav-success-2",
  },
  {
    label: "Clear All Slices Masks",
    value: "clearActiveLayerMask",
    disabled: btnClearAllDisabled,
    color: "nav-success",
  },
]);

onMounted(() => {
  manageEmitters();
});

function manageEmitters() {
  emitter.on("Segementation:CaseSwitched", emitterOnCaseSwitched);
  emitter.on("Segmentation:FinishLoadAllCaseImages", emitterOnFinishLoadAllCaseImages);
  emitter.on("Common:DragImageWindowCenter", emitterOnDragImageWindowCenter);
  emitter.on("Common:DragImageWindowHigh", emitterOnDragImageWindowHigh);
  emitter.on("Core:NrrdTools", emitterOnNrrdTools);
  emitter.on("LayerChannel:ActiveLayerChanged", emitterOnActiveLayerChanged);
}

const emitterOnCaseSwitched = async (_casename: string) => {
  try {
    setTimeout(() => {
      commFuncRadios.value = "pencil";
    }, 500);
  } catch (e) {
    console.log("first time load images -- ignore");
  }
  commFuncRadiosDisabled.value = true;
  commSliderRadiosDisabled.value = true;
  sliderDisabled.value = true;

  btnUndoDisabled.value = true;
  btnResetZoomDisabled.value = true;
  btnClearDisabled.value = true;
  btnClearAllDisabled.value = true;
}

const emitterOnFinishLoadAllCaseImages = () => {
  commSliderRadios.value = "globalAlpha";
  updateSliderSettings();
  commFuncRadiosDisabled.value = false;
  commSliderRadiosDisabled.value = false;
  sliderDisabled.value = false;

  btnUndoDisabled.value = false;
  btnResetZoomDisabled.value = false;
  btnClearDisabled.value = false;
  btnClearAllDisabled.value = false;
}

const emitterOnDragImageWindowCenter = (step: number) => {
  nrrdTools.adjustContrast("windowLow", step * contrastDragSensitivity.value);
}

const emitterOnDragImageWindowHigh = (step: number) => {
  nrrdTools.adjustContrast("windowHigh", step * contrastDragSensitivity.value);
}

const emitterOnNrrdTools = (tool: NrrdTools) => {
  nrrdTools = tool;
}

const emitterOnActiveLayerChanged = (_layerId: string) => {
  // When active layer changes, refresh slider if Layer Alpha is selected
  if (commSliderRadios.value === "layerAlpha") {
    updateSliderSettings();
  }
}

/** Map Eraser radio value to ToolMode */
const MODE_MAP: Record<string, ToolMode> = {
  pencil: "pencil",
  brush: "brush",
  eraser: "eraser",
  sphere: "sphere",
  calculator: "calculator",
};

function toggleFuncRadios(val: string) {
  const mode = MODE_MAP[val] ?? "pencil";

  if (mode === "calculator") {
    emitter.emit("Common:OpenCalculatorBox", "Calculator");
    emitter.emit("SegmentationTrial:CalulatorTimerFunction", "start");
  } else {
    emitter.emit("Common:CloseCalculatorBox", "Calculator");
  }

  nrrdTools.setMode(mode);
}

function toggleSliderRadios(_val: any) {
  updateSliderSettings();
}

function toggleSlider(val: number) {
  if (commSliderRadios.value === "sensitivity") {
    contrastDragSensitivity.value = val;
    return;
  }

  switch (commSliderRadios.value) {
    case "globalAlpha":
      nrrdTools.setOpacity(val);
      break;
    case "layerAlpha":
      nrrdTools.setLayerOpacity(nrrdTools.getActiveLayer(), val);
      break;
    case "brushAndEraserSize":
      nrrdTools.setBrushSize(val);
      break;
    case "windowHigh":
      nrrdTools.setWindowHigh(val);
      break;
    case "windowLow":
      nrrdTools.setWindowLow(val);
      break;
  }
}

function toggleSliderFinished(_val: number) {
  if (commSliderRadios.value === "windowHigh" || commSliderRadios.value === "windowLow") {
    nrrdTools.finishWindowAdjustment();
  }
}

function updateSliderSettings() {
  const radioSettings = commSliderRadioValues.value.filter(
    (item) => item.value === commSliderRadios.value
  );
  if (radioSettings.length > 0) {
    sliderColor.value = radioSettings[0].color;
  }

  if (commSliderRadios.value === "sensitivity") {
    sliderMax.value = 50;
    sliderMin.value = 1;
    sliderStep.value = 1;
    slider.value = contrastDragSensitivity.value;
    return;
  }

  const meta = nrrdTools?.getSliderMeta(commSliderRadios.value);
  if (meta) {
    slider.value = meta.value;
    sliderMax.value = meta.max;
    sliderMin.value = meta.min;
    sliderStep.value = meta.step;
  }
}

function onBtnClick(val: string) {
  nrrdTools.executeAction(val as any);
}

onUnmounted(() => {
  emitter.off("Segementation:CaseSwitched", emitterOnCaseSwitched);
  emitter.off("Segmentation:FinishLoadAllCaseImages", emitterOnFinishLoadAllCaseImages);
  emitter.off("Common:DragImageWindowCenter", emitterOnDragImageWindowCenter);
  emitter.off("Common:DragImageWindowHigh", emitterOnDragImageWindowHigh);
  emitter.off("Core:NrrdTools", emitterOnNrrdTools);
  emitter.off("LayerChannel:ActiveLayerChanged", emitterOnActiveLayerChanged);
});

</script>

