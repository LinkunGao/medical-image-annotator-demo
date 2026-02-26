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
 * @description Distance calculation panel for measuring tumour distances to:
 * - Skin surface
 * - Nipple position
 * - Ribcage
 *
 * Provides radio buttons to select measurement target and reports timing
 * for clinical trial purposes.
 *
 * @listens Segementation:CaseSwitched - Resets calculator on case change
 * @listens Segmentation:FinishLoadAllCaseImages - Enables controls after loading
 * @listens Common:OpenCalculatorBox - Opens calculator panel
 * @listens Common:CloseCalculatorBox - Closes calculator panel
 * @listens SegmentationTrial:CalulatorTimerFunction - Controls timing reports
 */
import { ref, onMounted, onUnmounted } from "vue";
import emitter from "@/plugins/custom-emitter";
import * as Copper from "@/ts/index";
// import * as Copper from "copper3d";

/** Currently selected measurement target (tumour, skin, nipple, ribcage) */
const calculatorPickerRadios = ref("tumour");

/** Whether calculator radios are disabled */
const calculatorPickerRadiosDisabled = ref(true);

/**
 * Radio button configuration for measurement targets.
 * Note: Tumour option is commented out as it's the default starting point.
 */
const commFuncRadioValues = ref([
  // { label: "Tumour", value: "tumour", color: "#4CAF50" },
  { label: "Skin", value: "skin", color: "#FFEB3B" },
  { label: "Nipple", value: "nipple", color: "#E91E63" },
  { label: "Ribcage", value: "ribcage", color: "#2196F3" },
]);

/** GUI settings reference from NrrdTools */
const guiSettings = ref<any>();

/** Timer start time for clinical trial tracking */
const startTime = ref<number[]>([0,0,0]);

/** Time when skin measurement was taken */
const skinTime = ref<string>();

/** Time when nipple measurement was taken */
const nippleTime = ref<string>();

/** Time when ribcage measurement was taken */
const ribTime = ref<string>();

/** Time when measurement was finished */
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
}

const emitterOnCaseSwitched = ()=>{
  if (!!guiSettings.value && guiSettings.value.guiState["calculator"]) onBtnClick("load case");
  emitter.emit("Common:CloseCalculatorBox", "Calculator");
}
const emitterOnFinishLoadAllCaseImages = (val:
  {
    guiState: Copper.IGUIStates;
    guiSetting: Copper.IGuiParameterSettings;
  }
) => {
  guiSettings.value = val;
  calculatorPickerRadios.value = "tumour";
  if(!!guiSettings.value && guiSettings.value.guiState["calculator"]) calculatorPickerRadiosDisabled.value = false;
}
const emitterOnOpenCalculatorBox = ()=>{
  calculatorPickerRadiosDisabled.value = false;      
}
const emitterOnCloseCalculatorBox = ()=>{
  calculatorPickerRadiosDisabled.value = true;
  onBtnClick("close calculate")
}
const emitterOnCalulatorTimerFunction = (status: string)=>{
  calculatorTimerReport(status);
}

function calculatorTimerReport(status:string){

  const now = new Date();
  const currentTime = [now.getHours(), now.getMinutes(), now.getSeconds()]
  switch (status) {
      case "start":
        console.log("start timer: ", now.getHours()+":", now.getMinutes()+":", now.getSeconds());
        startTime.value = currentTime;
        nippleTime.value = "";
        skinTime.value = "";
        ribTime.value = "";
        finishTime.value = "";
        break;
      case "skin":
        console.log("skin timer: ", now.getHours()+":", now.getMinutes()+":", now.getSeconds());
        break;
      case "nipple":
        console.log("nipple timer: ", now.getHours()+":", now.getMinutes()+":", now.getSeconds());
        break;
      case "ribcage":
        console.log("ribcage timer: ", now.getHours()+":", now.getMinutes()+":", now.getSeconds());
        break;
      case "finish":
        console.log("finish timer: ", now.getHours()+":", now.getMinutes()+":", now.getSeconds());
        break;
    
      default:
        break;
    }
}

function toggleCalculatorPickerRadios(val: string | null) {
  if (val === "skin"){
    // "tumour" | "skin" | "nipple" | "ribcage"
    guiSettings.value.guiState["activeSphereType"] = "skin";
  }
  if (val === "nipple"){
    guiSettings.value.guiState["activeSphereType"] = "nipple";
  }
  if (val === "ribcage"){
    guiSettings.value.guiState["activeSphereType"] = "ribcage";
  }

  guiSettings.value.guiSetting["activeSphereType"].onChange(calculatorPickerRadios.value);

}

function onBtnClick(val:string){
  if (!!guiSettings.value){
    calculatorPickerRadios.value = "tumour";
    guiSettings.value.guiState["activeSphereType"] = "tumour";
    calculatorPickerRadiosDisabled.value = true;

    calculatorTimerReport("finish")

  }
}

onUnmounted(() => {
  emitter.off("Segementation:CaseSwitched", emitterOnCaseSwitched);
  emitter.off("Segmentation:FinishLoadAllCaseImages", emitterOnFinishLoadAllCaseImages);
  emitter.off("Common:OpenCalculatorBox", emitterOnOpenCalculatorBox);
  emitter.off("Common:CloseCalculatorBox", emitterOnCloseCalculatorBox);
  emitter.off("SegmentationTrial:CalulatorTimerFunction", emitterOnCalulatorTimerFunction);
})

</script>

<style scoped></style>
  