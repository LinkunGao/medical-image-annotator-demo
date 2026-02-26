<!-- :show-bottom-nav-bar="panelWidth >= 60 ? true : false" -->
<template>
  <LeftPanelCore 
    ref="leftPanelCoreRef"
    v-model:load-mask="caseManagement.loadMask.value"
    :show-debug-panel="isShowDebugPanel" 
    :show-slice-index="true"
    :enable-upload="true"
    :show-tumour-distance-panel="distanceCalc.showCalculatorValue.value"
    :current-case-contrast-urls="caseManagement.currentCaseContrastUrls.value"
    :current-case-name="caseManagement.currentCaseName.value"
    :emitter="emitter"
    @update:finished-copper-init="onFinishedCopperInit"
    @update:get-mask-data="maskOps.getMaskData"
    @update:clear-layer-volume="maskOps.onClearLayerVolume"
    @update:set-mask-data="maskOps.setMaskData"
    @update:sphere-data="distanceCalc.getSphereData"
    @update:calculate-sphere-positions-data="distanceCalc.getCalculateSpherePositionsData"
    @update:slice-number="sliceNav.getSliceNum"
    @update:mouse-drag-contrast="getContrastMove"
    @update:after-load-all-case-images="handleAllImagesLoaded"
    >
    <template #drag-to-upload>
      <Upload
        :dialog="dialog"
        @on-close-dialog="onCloseDialog"
        @get-load-files-urls="handleUploadFiles"
      />
    </template>
    <template #tumour-distance-panel>
      <TumourDistancePanel 
        :dts="distanceCalc.dts.value" 
        :dtn="distanceCalc.dtn.value" 
        :dtr="distanceCalc.dtr.value" 
      />
    </template>
    <template #bottom-nav-bar>
      <NavBar
        :file-num="sliceNav.currentCaseContractsCount.value"
        :max="sliceNav.max.value"
        :immediate-slice-num="sliceNav.immediateSliceNum.value"
        :contrast-index="sliceNav.contrastNum.value"
        :init-slice-index="sliceNav.initSliceIndex.value"
        :panel-width="Math.ceil(panelWidth)"
        :panel-percent="Math.ceil(panelPercent)"
        @on-slice-change="sliceNav.getSliceChangedNum"
        @reset-main-area-size="sliceNav.resetMainAreaSize"
        @on-change-orientation="sliceNav.resetSlicesOrientation"
        @on-save="maskOps.onSaveMask"
        @on-open-dialog="onOpenDialog"
      />
    </template>
  </LeftPanelCore>
</template>

<script setup lang="ts">
/**
 * Left Panel Controller Component (Refactored)
 *
 * @description Main controller for the left (2D) image viewing panel.
 * Now uses composables for modular, maintainable code.
 *
 * Composables used:
 * - useCaseManagement: Case switching and URL management
 * - useMaskOperations: Mask loading/saving
 * - useDistanceCalculation: DTS/DTN/DTR calculations
 * - useSliceNavigation: Slice controls
 * - useLeftPanelEmitters: Event handling
 * - useDebugGui: Debug panel GUI
 */
import LeftPanelCore from "@/components/viewer/LeftPanelCore.vue";
import TumourDistancePanel from "@/components/viewer/TumourDistancePanelLeft.vue";
import NavBar from "@/components/common/NavBar.vue";
import Upload from "@/components/common/Upload.vue";

import { GUI } from "dat.gui";
import "copper3d/dist/css/style.css";
// import * as Copper from "copper3d";
import * as Copper from "@/ts/index";

import { onBeforeMount, onMounted, ref, onUnmounted } from "vue";
import {
  ILeftCoreCopperInit,
  IToolAfterLoadImagesResponse,
  IToolGetMouseDragContrastMove,
  IToolConfig
} from "@/models";
import emitter from "@/plugins/custom-emitter";
import { switchAnimationStatus } from "@/components/viewer/utils";

// Import composables
import {
  useCaseManagement,
  useMaskOperations,
  useDistanceCalculation,
  useSliceNavigation,
  useLeftPanelEmitters,
  useDebugGui,
} from "@/composables/left-panel";

// Props
type Props = {
  panelWidth?: number;
  panelPercent?: number;
};

type TContrastSelected = {
  [key: string]: boolean;
};

withDefaults(defineProps<Props>(), {
  panelWidth: 1300,
  panelPercent: 64,
});

// Config from localStorage
const config = ref<IToolConfig | null>(null);
onBeforeMount(() => {
  const configStr = localStorage.getItem("app_config");
  config.value = configStr ? JSON.parse(configStr) : null;
  if (!config.value) {
    throw new Error("app_config is not found!");
  }
});

// Component refs
const leftPanelCoreRef = ref<InstanceType<typeof LeftPanelCore>>();
const isShowDebugPanel = ref(false);
const dialog = ref(false);

// Copper3D refs
const nrrdTools = ref<Copper.NrrdTools | undefined>();
const loadBarMain = ref<Copper.loadingBarType | undefined>();
const loadingContainer = ref<HTMLDivElement | undefined>();
const progress = ref<HTMLDivElement | undefined>();
const gui = ref<GUI | undefined>();
const baseContainer = ref<HTMLDivElement | undefined>();

// Initialize composables
const caseManagement = useCaseManagement({
  nrrdTools,
  loadingContainer,
  progress,
  config,
});

const maskOps = useMaskOperations({
  nrrdTools,
  loadingContainer,
  progress,
  loadBarMain,
  currentCaseDetail: caseManagement.currentCaseDetail,
  currentCaseName: caseManagement.currentCaseName,
  allCasesDetails: caseManagement.allCasesDetails,
  originUrls: caseManagement.originUrls,
  regiterUrls: caseManagement.regiterUrls,
});

const distanceCalc = useDistanceCalculation({
  nrrdTools,
  currentCaseName: caseManagement.currentCaseName,
});

const sliceNav = useSliceNavigation({
  nrrdTools
});

// Emitter handlers
const emitterHandlers = {
  onOpenCalculatorBox: distanceCalc.openCalculatorBox,
  onCloseCalculatorBox: distanceCalc.closeCalculatorBox,
  onDebugMode: (flag: boolean) => { isShowDebugPanel.value = flag; },
  onToggleAppTheme: () => { baseContainer.value?.classList.toggle("dark"); },
  onCaseSwitched: caseManagement.onCaseSwitched,
  onContrastChanged: (result: { contrastState: boolean; order: number }) => {
    sliceNav.onContrastSelected(result.contrastState, result.order);
  },
  onRegisterImageChanged: caseManagement.onRegistedStateChanged,
};

const { manageEmitters, cleanupEmitters } = useLeftPanelEmitters(emitterHandlers);

// Debug GUI
let displaySlicesLength = 0;
const debugGui = useDebugGui({
  gui,
  allCasesNames: ref(caseManagement.allCasesDetails.value?.names),
  onCaseSwitched: caseManagement.onCaseSwitched,
  onRegistedStateChanged: caseManagement.onRegistedStateChanged,
  onContrastSelected: sliceNav.onContrastSelected,
  releaseUrls: caseManagement.releaseUrls,
  displaySlicesLength: () => displaySlicesLength,
});

// Lifecycle
onMounted(async () => {
  loadBarMain.value = leftPanelCoreRef.value?.loadBarMain;
  loadingContainer.value = leftPanelCoreRef.value?.loadingContainer;
  progress.value = leftPanelCoreRef.value?.progress;
  gui.value = leftPanelCoreRef.value?.gui;
  baseContainer.value = leftPanelCoreRef.value?.baseContainer;

  manageEmitters();
  debugGui.setupGui();
});

onUnmounted(() => {
  cleanupEmitters();
  nrrdTools.value?.reset();
  caseManagement.cleanup();
});

// Event handlers
const onFinishedCopperInit = (copperInitData: ILeftCoreCopperInit) => {
  nrrdTools.value = copperInitData.nrrdTools;
  // disable contrast drag
  // nrrdTools.value.setContrastShortcutEnabled(false)
  // nrrdTools.value.setKeyboardSettings({ mouseWheel: 'Scroll:Slice' });
  // nrrdTools.value.gui_states.sphere = true;
  nrrdTools.value.setActiveSphereType("nipple");
};

const onOpenDialog = (flag: boolean) => { dialog.value = flag; };
const onCloseDialog = (flag: boolean) => { dialog.value = flag; };
const handleUploadFiles = (urls: string[]) => {
  caseManagement.currentCaseContrastUrls.value = urls;
};

const getContrastMove = (res: IToolGetMouseDragContrastMove) => {
  const { step, towards } = res;
  if (towards === "horizental") {
    emitter.emit("Common:DragImageWindowCenter", step);
  } else if (towards === "vertical") {
    emitter.emit("Common:DragImageWindowHigh", step);
  }
};

const handleAllImagesLoaded = async (res: IToolAfterLoadImagesResponse) => {
  // Store slices
  caseManagement.handleAllImagesLoaded(res);
  displaySlicesLength = res.allSlices.length;

  // Set file count FIRST (needed for slider calculation)
  sliceNav.currentCaseContractsCount.value = res.allSlices.length;

  // Then update nav state (sets initSliceIndex which uses fileNum)
  sliceNav.updateNavigationAfterLoad();


  // Build contrast state
  const selectedState: TContrastSelected = {};
  for (let i = 0; i < res.allSlices.length; i++) {
    if (i === 0) {
      selectedState["pre"] = true;
    } else {
      selectedState["contrast" + i] = true;
    }
  }

  // Update GUI
  debugGui.setUpGuiAfterLoading();
  debugGui.updateContrastFolder(selectedState);

  // Notify other components
  emitter.emit("Segmentation:ContrastImageStates", selectedState);
  caseManagement.tellAllRelevantComponentsImagesLoaded();
};
</script>

<style>
</style>
