<!-- :show-bottom-nav-bar="panelWidth >= 30 ? true : false" -->
<template>
  <RightPanelCore
    ref="rightPanelCoreRef"
    :show-loading-animation="openLoading"
    @update:finished-copper-init="onFinishedCopperInit"
    @update:reset-nrrd-image-view="handleResetNrrdImageView"
  >
    <template #tumour-distance-panel>
      <!-- <TumourDistancePanelRight 
        :tumour-volume="distanceCalc.tumourVolume.value"
        :tumour-extent="distanceCalc.tumourExtent.value"
        :skin-dist="distanceCalc.skinDist.value"
        :rib-dist="distanceCalc.ribDist.value"
        :nipple-dist="distanceCalc.nippleDist.value"
        :nipple-clock="distanceCalc.nippleClock.value"
      /> -->
    </template>
    <template #bottom-nav-bar>
      <NavBarRight
        :panel-width="Math.ceil(panelWidth)"
        :panel-percent="Math.ceil(panelPercent)"
        :settings="sliderSettingsValue"
        @on-view-single-click="handleViewSingleClick"
        @on-view-double-click="handleViewsDoubleClick"
      />
    </template>
  </RightPanelCore>
</template>

<script setup lang="ts">
/**
 * Right Panel Controller Component (Refactored)
 *
 * @description Main controller for the right (3D) image viewing panel.
 * Now uses composables for modular, maintainable code.
 *
 * Composables used:
 * - useWebSocketSync: WebSocket for tumour model sync
 * - useCoordinateTransform: NRRD coordinate handling
 * - useRightDistanceCalculation: Distance calculations
 * - useRightPanelModels: 3D model loading
 */
import RightPanelCore from "@/components/viewer/RightPanelCore.vue";
import TumourDistancePanelRight from "@/components/viewer/TumourDistancePanelRight.vue";
import NavBarRight from "@/components/common/NavBarRight.vue";
import * as THREE from "three";
import "copper3d/dist/css/style.css";
import * as Copper from "@/ts/index";
import { onMounted, ref, watch, onUnmounted } from "vue";
import emitter from "@/plugins/custom-emitter";
import { useSingleFile } from "@/plugins/api/index";
import {
  ICaseDetails,
  IDetails,
  ICommXYZ,
  ILeftRightData,
  ISaveSphere,
} from "@/models";
import { switchAnimationStatus } from "@/components/viewer/utils";
import { PanelOperationManager } from "@/plugins/view-utils/utils-right";

// Import composables
import {
  useWebSocketSync,
  useCoordinateTransform,
  useRightDistanceCalculation,
  useRightPanelModels,
} from "@/composables/right-panel";

// Props
type Props = {
  panelWidth?: number;
  panelPercent?: number;
};

const props = withDefaults(defineProps<Props>(), {
  panelWidth: 1000,
  panelPercent: 35,
});

// Component refs
const rightPanelCoreRef = ref<InstanceType<typeof RightPanelCore>>();
const openLoading = ref(false);
const currentCasename = ref<string>("");
const currentImageType = ref<"register" | "origin">("register");
const maskMeshUrl = ref<string>();
const currentCaseDetails = ref<IDetails>();

// Copper refs
const copperScene = ref<Copper.copperScene>();
let panelOperator: PanelOperationManager;
const loadingContainer = ref<HTMLDivElement | undefined>();
const progress = ref<HTMLDivElement | undefined>();

// Slider settings for NavBar
const sliderSettingsValue = ref<{
  panelOperator: PanelOperationManager;
  dimensions: number[];
  spacing: number[];
  currentValue: number[];
}>();

// Initialize composables
const coords = useCoordinateTransform();

const distanceCalc = useRightDistanceCalculation({ copperScene });

const models = useRightPanelModels({
  copperScene,
  nrrdBias: coords.nrrdBias,
});

const webSocket = useWebSocketSync({
  loadingContainer,
  progress,
  copperScene,
  currentCaseDetails,
  maskMeshUrl,
  preTumourSphere: models.preTumourSphere,
  segmentMask3DModel: models.segmentMask3DModel,
  openLoading,
  tumourVolume: distanceCalc.tumourVolume,
  loadSegmentMaskMesh: (url: string) => {
    models.loadSegmentMaskMesh(url, (position) => {
      distanceCalc.tumourPosition.value = position;
      distanceCalc.displayAndCalculateNSR();
    });
  },
  initPanelValue: distanceCalc.initPanelValue,
});

// Watch panel width for resize
watch(() => props.panelWidth, () => {
  copperScene.value?.onWindowResize();
});

// Lifecycle
onMounted(() => {
  loadingContainer.value = rightPanelCoreRef.value?.loadingContainer;
  progress.value = rightPanelCoreRef.value?.progress;
  manageEmitters();
});

onUnmounted(() => {
  emitter.off("Common:ResizeCopperSceneWhenNavChanged", emitterOnResizeCopperSceneWhenNavChanged);
  emitter.off("Segmentation:CaseDetails", emitterOnCaseDetails);
  emitter.off("Segmentation:SyncTumourModelButtonClicked", emitterOnSyncTumourModelButtonClicked);
  emitter.off("Segmentation:RegisterButtonStatusChanged", emitterOnRegisterButtonStatusChanged);
  emitter.off("SegmentationTrial:DrawSphereFunction", emitterOnDrawSphereFunction);
  emitter.off("Common:ToggleRightModelVisibility", emitterOnToggleBreastVisibility);
  webSocket.closeSocket();
});

// Event handlers
function onFinishedCopperInit(data: { 
  appRenderer: Copper.copperRenderer; 
  copperScene: Copper.copperScene; 
  panelOperator: PanelOperationManager;
}) {
  copperScene.value = data.copperScene;
  panelOperator = data.panelOperator;
}

function handleResetNrrdImageView() {
  const { loadNrrdMeshes, loadNrrdSlices } = models.getNrrdData();
  if (loadNrrdSlices) {
    models.resetSliceIndex(models.tumourSliceIndex.value);
    requestUpdateSliderSettings();
  }
}

function handleViewSingleClick(view: string) {
  const { loadNrrdMeshes, loadNrrdSlices } = models.getNrrdData();
  rightPanelCoreRef.value?.onNavBarSingleClick(view, loadNrrdMeshes, loadNrrdSlices);
}

function handleViewsDoubleClick(view: string) {
  const { loadNrrdMeshes, loadNrrdSlices } = models.getNrrdData();
  rightPanelCoreRef.value?.onNavBarDoubleClick(view, loadNrrdMeshes, loadNrrdSlices);
}

function requestUpdateSliderSettings() {
  const { loadNrrdSlices } = models.getNrrdData();
  if (!loadNrrdSlices) return;
  
  sliderSettingsValue.value = {
    panelOperator,
    dimensions: coords.nrrdDimensions.value,
    spacing: coords.nrrdSpacing.value,
    currentValue: [
      Math.ceil(loadNrrdSlices.x.index / coords.nrrdSpacing.value[0]),
      Math.ceil(loadNrrdSlices.y.index / coords.nrrdSpacing.value[1]),
      Math.ceil(loadNrrdSlices.z.index / coords.nrrdSpacing.value[2]),
    ],
  };
}

// Emitter management
function manageEmitters() {
  emitter.on("Common:ResizeCopperSceneWhenNavChanged", emitterOnResizeCopperSceneWhenNavChanged);
  emitter.on("Segmentation:CaseDetails", emitterOnCaseDetails);
  emitter.on("Segmentation:SyncTumourModelButtonClicked", emitterOnSyncTumourModelButtonClicked);
  emitter.on("Segmentation:RegisterButtonStatusChanged", emitterOnRegisterButtonStatusChanged);
  emitter.on("SegmentationTrial:DrawSphereFunction", emitterOnDrawSphereFunction);
  emitter.on("Common:ToggleRightModelVisibility", emitterOnToggleBreastVisibility);
}

// Emitter handlers
const emitterOnResizeCopperSceneWhenNavChanged = () => {
  setTimeout(() => { copperScene.value?.onWindowResize(); }, 300);
};

const emitterOnCaseDetails = async (caseDetails: ICaseDetails) => {
  // Clear previous state
  models.removeOldMeshes();
  distanceCalc.cleanup();

  // Revoke old blob URL and clear mask reference
  if (maskMeshUrl.value) {
    URL.revokeObjectURL(maskMeshUrl.value);
    maskMeshUrl.value = undefined;
  }

  // Init WebSocket
  webSocket.initSocket(caseDetails.currentCaseId);
  
  // Get init data
  currentCasename.value = caseDetails.currentCaseName;
  currentCaseDetails.value = caseDetails.details?.find(
    (d: IDetails) => d.name === currentCasename.value
  );
  
  // // Get mask OBJ if exists
  // const objSize = currentCaseDetails.value?.output.mask_obj_size;
  // const maskUrl = currentCaseDetails.value?.output.mask_obj_path;
  // if (objSize && Number(objSize) > 0 && maskUrl) {
  //   const file = await useSingleFile(maskUrl);
  //   if (file) {
  //     maskMeshUrl.value = URL.createObjectURL(file);
  //   }
  // }

  // Get mask GLB if exists
  const glbSize = currentCaseDetails.value?.output.mask_glb_size;
  const maskUrl = currentCaseDetails.value?.output.mask_glb_path;
  
  if (glbSize && Number(glbSize) > 0 && maskUrl) {
    const file = await useSingleFile(maskUrl, true);
    if (file && file instanceof Blob) {
      maskMeshUrl.value = URL.createObjectURL(file);
    }
  }
  
  // Load NRRD
  currentImageType.value = "register";
  await loadNrrdCore(caseDetails.maskNrrd, currentImageType.value);
};

const emitterOnSyncTumourModelButtonClicked = () => {
  switchAnimationStatus(loadingContainer.value!, progress.value!, "flex");
  openLoading.value = true;
};

const emitterOnRegisterButtonStatusChanged = (data: ILeftRightData) => {
  const { url, register } = data;
  currentImageType.value = register ? "register" : "origin";
  
  const { loadNrrdSlices } = models.getNrrdData();
  const recordSliceIndex: ICommXYZ = loadNrrdSlices ? {
    x: loadNrrdSlices.x.index,
    y: loadNrrdSlices.y.index,
    z: loadNrrdSlices.z.index,
  } : { x: 0, y: 0, z: 0 };
  
  // Load origin if not loaded
  rightPanelCoreRef.value?.loadNrrd(url, currentImageType.value)?.then((nrrdData) => {
    coords.updateFromNrrdData(nrrdData);
    models.setNrrdData(nrrdData.nrrdMesh, nrrdData.nrrdSlices, currentImageType.value);
    models.updateNrrdMeshToCopperScene(nrrdData.nrrdMesh, nrrdData.nrrdSlices, recordSliceIndex);
    models.allRightPanelMeshes.value.push(nrrdData.nrrdMesh.x, nrrdData.nrrdMesh.y, nrrdData.nrrdMesh.z);
  });
};

const emitterOnDrawSphereFunction = (val: ISaveSphere) => {
  // Calculate volume
  distanceCalc.tumourVolume.value = Number(
    ((4 / 3) * Math.PI * Math.pow(val.sphereRadiusMM, 3) / 1000).toFixed(3)
  );
  
  models.drawPreviewSphere(val, coords.correctedOrigin.value, (position) => {
    distanceCalc.tumourPosition.value = position;
    distanceCalc.displayAndCalculateNSR();
  });
};

const emitterOnToggleBreastVisibility = (val: boolean) => {
  models.toggleBreastVisibility(val);
};

// Core NRRD loading
async function loadNrrdCore(nrrdUrl: string, imageType: "origin" | "register") {
  const nrrdData = await rightPanelCoreRef.value?.loadNrrd(nrrdUrl, imageType);
  if (!nrrdData) return;
  
  coords.updateFromNrrdData(nrrdData);
  models.setNrrdData(nrrdData.nrrdMesh, nrrdData.nrrdSlices, imageType);
  
  const sliceIndex: ICommXYZ = {
    x: nrrdData.nrrdSlices.x.RSAMaxIndex / 2,
    y: nrrdData.nrrdSlices.y.RSAMaxIndex / 2,
    z: nrrdData.nrrdSlices.z.RSAMaxIndex / 2,
  };
  
  models.updateNrrdMeshToCopperScene(nrrdData.nrrdMesh, nrrdData.nrrdSlices, sliceIndex);
  models.allRightPanelMeshes.value.push(nrrdData.nrrdMesh.x, nrrdData.nrrdMesh.y, nrrdData.nrrdMesh.z);
  
  rightPanelCoreRef.value?.resetNrrdImageView(nrrdData.nrrdMesh);
  
  // Load tumour if exists
  if (maskMeshUrl.value) {

    models.loadSegmentMaskMesh(maskMeshUrl.value, (position) => {
      distanceCalc.tumourPosition.value = position;
      distanceCalc.displayAndCalculateNSR();
    });
  } else {
    requestUpdateSliderSettings();
  }
}
</script>

<style scoped>
</style>
