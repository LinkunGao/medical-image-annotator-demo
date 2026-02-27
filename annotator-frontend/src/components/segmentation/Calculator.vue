<template>
  <v-list-group value="Calculator">
    <template v-slot:activator="{ props }">
      <v-list-item
        v-bind="props"
        color="nav-success-2"
        prepend-icon="mdi-map-marker-distance"
        title="Calculate Distance"
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
        v-model="calculatorPickerRadios"
        label=""
        :inline="true"
        :disabled="calculatorPickerRadiosDisabled"
        @update:modelValue="toggleCalculatorPickerRadios"
      >
        <v-radio
          v-for="(item, idx) in commFuncRadioValues"
          :key="idx"
          :label="item.label"
          :value="item.value"
          :color="item.color"
        ></v-radio>
      </v-radio-group>
      <v-btn
      block
      density="comfortable"
      :disabled="calculatorPickerRadiosDisabled"
      @click="onBtnClick('finish')"
      >Finish</v-btn>
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
 * Calculator Component
 *
 * Phase 1 Refactored: All guiSettings access replaced with NrrdTools typed API.
 *
 * @listens Segementation:CaseSwitched - Resets calculator on case change
 * @listens Segmentation:FinishLoadAllCaseImages - Enables controls after loading
 * @listens Common:OpenCalculatorBox - Opens calculator panel
 * @listens Common:CloseCalculatorBox - Closes calculator panel
 * @listens SegmentationTrial:CalulatorTimerFunction - Controls timing reports
 */
import { ref, onMounted, onUnmounted } from "vue";
import emitter from "@/plugins/custom-emitter";
import type { NrrdTools } from "@/ts/index";

const calculatorPickerRadios = ref("tumour");
const calculatorPickerRadiosDisabled = ref(true);

const commFuncRadioValues = ref([
  { label: "Skin", value: "skin", color: "#FFEB3B" },
  { label: "Nipple", value: "nipple", color: "#E91E63" },
  { label: "Ribcage", value: "ribcage", color: "#2196F3" },
]);

let nrrdTools: NrrdTools;

const startTime = ref<number[]>([0, 0, 0]);
const skinTime = ref<string>();
const nippleTime = ref<string>();
const ribTime = ref<string>();
const finishTime = ref<string>();

onMounted(() => {
  manageEmitters();
});

function manageEmitters() {
  emitter.on("Segementation:CaseSwitched", emitterOnCaseSwitched);
  emitter.on("Segmentation:FinishLoadAllCaseImages", emitterOnFinishLoadAllCaseImages);
  emitter.on("Common:OpenCalculatorBox", emitterOnOpenCalculatorBox);
  emitter.on("Common:CloseCalculatorBox", emitterOnCloseCalculatorBox);
  emitter.on("SegmentationTrial:CalulatorTimerFunction", emitterOnCalulatorTimerFunction);
  emitter.on("Core:NrrdTools", emitterOnNrrdTools);
}

const emitterOnNrrdTools = (tool: NrrdTools) => {
  nrrdTools = tool;
}

const emitterOnCaseSwitched = () => {
  if (nrrdTools?.isCalculatorActive()) onBtnClick("load case");
  emitter.emit("Common:CloseCalculatorBox", "Calculator");
}

const emitterOnFinishLoadAllCaseImages = () => {
  calculatorPickerRadios.value = "tumour";
  if (nrrdTools?.isCalculatorActive()) calculatorPickerRadiosDisabled.value = false;
}

const emitterOnOpenCalculatorBox = () => {
  calculatorPickerRadiosDisabled.value = false;
}

const emitterOnCloseCalculatorBox = () => {
  calculatorPickerRadiosDisabled.value = true;
  onBtnClick("close calculate");
}

const emitterOnCalulatorTimerFunction = (status: string) => {
  calculatorTimerReport(status);
}

function calculatorTimerReport(status: string) {
  const now = new Date();
  const currentTime = [now.getHours(), now.getMinutes(), now.getSeconds()];
  switch (status) {
    case "start":
      console.log("start timer: ", now.getHours() + ":", now.getMinutes() + ":", now.getSeconds());
      startTime.value = currentTime;
      nippleTime.value = "";
      skinTime.value = "";
      ribTime.value = "";
      finishTime.value = "";
      break;
    case "skin":
      console.log("skin timer: ", now.getHours() + ":", now.getMinutes() + ":", now.getSeconds());
      break;
    case "nipple":
      console.log("nipple timer: ", now.getHours() + ":", now.getMinutes() + ":", now.getSeconds());
      break;
    case "ribcage":
      console.log("ribcage timer: ", now.getHours() + ":", now.getMinutes() + ":", now.getSeconds());
      break;
    case "finish":
      console.log("finish timer: ", now.getHours() + ":", now.getMinutes() + ":", now.getSeconds());
      break;
    default:
      break;
  }
}

function toggleCalculatorPickerRadios(val: string | null) {
  if (!nrrdTools || !val) return;
  nrrdTools.setActiveSphereType(val as any);
}

function onBtnClick(val: string) {
  if (!nrrdTools) return;
  calculatorPickerRadios.value = "tumour";
  nrrdTools.setActiveSphereType("tumour");
  calculatorPickerRadiosDisabled.value = true;
  calculatorTimerReport("finish");
}

onUnmounted(() => {
  emitter.off("Segementation:CaseSwitched", emitterOnCaseSwitched);
  emitter.off("Segmentation:FinishLoadAllCaseImages", emitterOnFinishLoadAllCaseImages);
  emitter.off("Common:OpenCalculatorBox", emitterOnOpenCalculatorBox);
  emitter.off("Common:CloseCalculatorBox", emitterOnCloseCalculatorBox);
  emitter.off("SegmentationTrial:CalulatorTimerFunction", emitterOnCalulatorTimerFunction);
  emitter.off("Core:NrrdTools", emitterOnNrrdTools);
});

</script>

<style scoped></style>
  