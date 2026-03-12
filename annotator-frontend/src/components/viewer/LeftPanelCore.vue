<template>
    <div ref="baseContainer" class="left-container dark guide-left-panel">
      <div v-show="showDebugPanel" ref="debugContainer" class="left_gui"></div>
      <div ref="canvasContainer" class="canvas_container"></div>
      <div v-show="showSliceIndex" ref="sliceIndexContainer" class="copper3d_sliceNumber">
          Medical Image Slice Index
      </div>

      <div v-show="enableUpload">
          <slot name="drag-to-upload"></slot>
      </div>

      <div v-show="showTumourDistancePanel">
          <slot name="tumour-distance-panel"></slot>
      </div>
    </div>
    <div
        v-show="showBottomNavBar"
        class="nav_bar_left_container"
        ref="bottomNavBarContainer"
    >
        <slot name="bottom-nav-bar"></slot>
    </div>
</template>

<script setup lang="ts">
/**
 * Left Panel Core Component
 *
 * @description Core 2D medical image viewer using Copper3D NrrdTools.
 * Handles loading and displaying NRRD image slices with segmentation tools.
 *
 * Features:
 * - NRRD image loading from URLs
 * - Slice navigation and orientation switching
 * - Drawing tools (pencil, brush, eraser) for segmentation
 * - Mask data extraction for saving annotations
 * - Sphere positioning for tumour distance calculation
 *
 * @prop {boolean} showSliceIndex - Whether to show slice index panel
 * @prop {boolean} showDebugPanel - Whether to show debug GUI panel
 * @prop {boolean} showTumourDistancePanel - Whether to show distance overlay
 * @prop {boolean} showBottomNavBar - Whether to show bottom navigation bar
 * @prop {boolean} enableUpload - Whether to enable file upload slot
 * @prop {string[]} currentCaseContrastUrls - URLs of NRRD files to load
 * @prop {string} currentCaseName - Name of current case
 * @prop {Object} emitter - Event emitter instance for cross-component communication
 *
 * @emits update:finishedCopperInit - On Copper3D initialization complete
 * @emits update:getMaskData - On mask data extraction
 * @emits update:sphereData - On sphere position/radius change
 * @emits update:calculateSpherePositionsData - On sphere positions for distance calculation
 * @emits update:sliceNumber - On slice navigation change
 * @emits update:afterLoadAllCaseImages - On all images loaded
 * @emits update:setMaskData - On mask data set
 * @emits update:mouseDragContrast - On contrast adjustment via drag
 */
import * as Copper from "copper3d";
// import * as Copper from "@/ts/index";
import "copper3d/dist/css/style.css";
import { GUI, GUIController } from "dat.gui";
import { ref, onMounted, onUnmounted, onBeforeUnmount, watch, watchEffect } from "vue";
// import emitter from "@/plugins/custom-emitter";
import loadingGif from "@/assets/loading.svg";
import {
  getEraserUrlsForOffLine,
  getCursorUrlsForOffLine,
} from "@/plugins/view-utils/tools";
import { switchAnimationStatus, addNameToLoadedMeshes } from "./utils";
import { ILoadedMeshes, } from "@/models";

/** Reference to base container element */
let baseContainer = ref<HTMLDivElement>();
/** Reference to debug GUI container */
let debugContainer = ref<HTMLDivElement>();
/** Reference to canvas container for 2D rendering */
let canvasContainer = ref<HTMLDivElement>();
/** Reference to bottom navigation bar container */
let bottomNavBarContainer = ref<HTMLDivElement>();
/** Reference to slice index display container */
let sliceIndexContainer = ref<HTMLDivElement>();

/** dat.gui instance for debug panel */
let gui = new GUI({ width: 300, autoPlace: false });

// Copper3D render scene core variables
/** Main Copper3D renderer instance */
let appRenderer: Copper.copperRenderer;
/** NrrdTools instance for 2D slice interaction */
let nrrdTools: Copper.NrrdTools;
/** Copper3D scene instance */
let scene: Copper.copperScene;
/** Loading bar animation container */
let loadBarMain = ref<Copper.loadingBarType>();
/** Loading container element */
let loadingContainer = ref<HTMLDivElement>();
/** Progress text element */
let progress = ref<HTMLDivElement>();   

// offline working variables
/** Pre-loaded eraser cursor URLs for offline use */
const eraserUrls = getEraserUrlsForOffLine();
/** Pre-loaded pencil cursor URLs for offline use */
const cursorUrls = getCursorUrlsForOffLine();

// trial variables
let toolNrrdStates: Copper.NrrdState;

// core load images variables
let allSlices: Array<any> = [];
let allLoadedMeshes: Array<ILoadedMeshes> = [];

// used to trigger nrrdTools to display loaded images slices, once the filesCount === currentCaseContrastUrls.length
let filesCount = ref(0);
// when firstLoad is true, it means that we need to initialize the nrrdTools
let firstLoad = true;
// used to remove the nrrdTools.start function in scene preRenderCallbackFunction, when we unmount the component
let coreRenderId = 0;

const { currentCaseContrastUrls, currentCaseName, emitter } = defineProps({
    showSliceIndex:{
        type: Boolean,
        default: true
    },
    showDebugPanel:{
        type: Boolean,
        default: false
    },
    showTumourDistancePanel:{
        type: Boolean,
        default: false
    },
    showBottomNavBar:{
        type: Boolean,
        default: true
    },
    enableUpload:{
        type: Boolean,
        default: false
    },
    currentCaseContrastUrls:{
        type: Array<String>,
        default: []
    },
    currentCaseName:{
        type: String,
        default: ""
    },
    emitter:{
      type: Object,
    }
});

defineExpose({
    loadBarMain,
    loadingContainer,
    progress,
    gui,
    baseContainer
});

const loadMask = defineModel('loadMask', {
    type: Boolean,
    default: false
});

const emit = defineEmits(
  [
    "update:finishedCopperInit",
    "update:getMaskData",
    "update:clearLayerVolume",
    "update:sphereData",
    "update:calculateSpherePositionsData",
    "update:sliceNumber",
    "update:afterLoadAllCaseImages",
    "update:setMaskData",
    "update:mouseDragContrast"]);

watch(() => currentCaseContrastUrls, (newVal, oldVal) => {

    if (newVal.length > 0) {
        readyToLoad(currentCaseName);
    }
});

onMounted(() => {
    initCopper();
});

function initCopper() {
    debugContainer.value?.appendChild(gui.domElement);

    appRenderer = new Copper.copperRenderer(
        baseContainer.value as HTMLDivElement,
        {
            guiOpen: false,
            alpha: true,
        }
    );
    
    // setup nrrdTools with 4 layers for segmentation masks
    nrrdTools = new Copper.NrrdTools(canvasContainer.value as HTMLDivElement, {layers: ["layer1", "layer2", "layer3", "layer4"] });
    // nrrdTools = new Copper.NrrdTools(canvasContainer.value as HTMLDivElement);
    nrrdTools.setDisplaySliceIndexPanel(
        sliceIndexContainer.value as HTMLDivElement
    );
    // for offline working
    // nrrdTools.setBaseCanvasesSize(1.5);
    nrrdTools.setEraserUrls(eraserUrls);
    nrrdTools.setPencilIconUrls(cursorUrls);
    // nrrdTools.setMainAreaSize(3);
    
    toolNrrdStates = nrrdTools.getNrrdToolsSettings();
    loadBarMain.value = Copper.loading(loadingGif);

    loadingContainer.value = loadBarMain.value.loadingContainer;
    progress.value = loadBarMain.value.progress;

    (canvasContainer.value as HTMLDivElement).appendChild(
        loadBarMain.value.loadingContainer
    );

    setupCopperScene("nrrd_tools");
    appRenderer.animate();

    emit("update:finishedCopperInit", {
        appRenderer,
        nrrdTools,
        scene,
    });
}

function setupCopperScene(name: string) {
  scene = appRenderer!.getSceneByName(name) as Copper.copperScene;
  if (scene == undefined) {
    scene = appRenderer!.createScene(name) as Copper.copperScene;
    if (scene) {
      appRenderer!.setCurrentScene(scene);
    }
  }
}


// core load images

const readyToLoad = ( name: string) => {
  if (currentCaseContrastUrls.length > 0) {
    return new Promise<{ meshes: Array<Copper.nrrdMeshesType>; slices: any[] }>(
      (resolve, reject) => {
        loadAllNrrds(currentCaseContrastUrls as string[], name, resolve, reject);
      }
    );
  }
};

const loadAllNrrds = (
  urls: Array<string>,
  name: string,
  resolve?: (value: {
    meshes: Array<Copper.nrrdMeshesType>;
    slices: any[];
  }) => void,
  reject?: (reason?: any) => void
) => {
  switchAnimationStatus(loadingContainer.value!, progress.value!, "none");
  allSlices = [];
  allLoadedMeshes = [];
  for (let i = 0; i < urls.length; i++) {
    imageLoader(name, urls[i], i, urls.length, resolve);
  }
};

const imageLoader = (name:string, url:string, order: number, total:number, resolve?: (value: {
    meshes: Array<Copper.nrrdMeshesType>;
    slices: any[];
  }) => void) =>{
  const onload = ( volume: any, nrrdMesh: Copper.nrrdMeshesType, nrrdSlices: Copper.nrrdSliceType)=>{
    addNameToLoadedMeshes(nrrdMesh, name);
    const newNrrdSlice = Object.assign(nrrdSlices, { order });
    const newNrrdMesh = Object.assign(nrrdMesh, { order });
    allSlices.push(newNrrdSlice);
    allLoadedMeshes.push(newNrrdMesh);
    filesCount.value += 1;
    
    if (filesCount.value >= total) {
      allLoadedMeshes.sort((a: any, b: any) => {
        return a.order - b.order;
      });
      allSlices.sort((a: any, b: any) => {
        return a.order - b.order;
      });
      !!resolve && resolve({ meshes: allLoadedMeshes, slices: allSlices });
    }
  }
  scene?.loadNrrd(url, loadBarMain.value!, true, onload);
}

// hooks
const getContrastMove = (step:number, towards:"horizental"|"vertical") =>{
  emit("update:mouseDragContrast", { step, towards });
}
const getSliceNum = (index: number, contrastindex: number) => {
 emit("update:sliceNumber", { index, contrastindex });
};
const getMaskData = (
  sliceData: Uint8Array,
  layerId: string,
  channelId: number,
  sliceIndex: number,
  axis: "x" | "y" | "z",
  width: number,
  height: number,
  clearFlag?: boolean) => {
  emit("update:getMaskData", {
    sliceData,
    layerId,
    channelId,
    sliceIndex,
    axis,
    width,
    height,
    clearFlag,
  });
};
const onClearLayerVolume = (layerId: string) => {
  emit("update:clearLayerVolume", { layerId });
};
const getSphereData = (sphereOrigin: number[], sphereRadius: number) => {
  emit("update:sphereData", {
    sphereOrigin,
    sphereRadius,
  });
};
const getCalculateSpherePositionsData = (tumourSphereOrigin:Copper.ICommXYZ | null, skinSphereOrigin:Copper.ICommXYZ | null, ribSphereOrigin:Copper.ICommXYZ | null, nippleSphereOrigin:Copper.ICommXYZ | null, aix:"x"|"y"|"z") => {
  emit("update:calculateSpherePositionsData", {
    tumourSphereOrigin,
    skinSphereOrigin,
    ribSphereOrigin,
    nippleSphereOrigin,
    aix
  });
};
const setMaskData = () => {
  emit("update:setMaskData");
};

// watch filesCount, when filesCount.value === currentCaseContrastUrls.length, then we can start to display the images
watch(filesCount, ()=>{
  if (
    filesCount.value != 0 &&
    filesCount.value === currentCaseContrastUrls.length
  ) {
    console.log("All files ready!");

    nrrdTools!.reset();
    nrrdTools!.setAllSlices(allSlices);

    if (firstLoad) {

      nrrdTools!.drag({ getSliceNum });
      nrrdTools!.draw({ getMaskData, onClearLayerVolume, getSphereData, getCalculateSpherePositionsData});
      nrrdTools!.setupGUI(gui as GUI);
      nrrdTools!.enableContrastDragEvents(getContrastMove)

      coreRenderId = scene?.addPreRenderCallbackFunction(nrrdTools!.start) as number;
      emitter!.emit("Core:NrrdTools", nrrdTools);
    } else {
      nrrdTools!.redrawMianPreOnDisplayCanvas();
    }

    if (loadMask.value) {
      setMaskData();
    }
    
    emit("update:afterLoadAllCaseImages", {
      allSlices,
      allLoadedMeshes,
    });

    firstLoad = false;
    loadMask.value = false;

    filesCount.value = 0;
  }
})


onUnmounted(() => {
  scene?.removePreRenderCallbackFunction(coreRenderId);
});

</script>

<style>
.left-container {
  width: 100%;
  /* height: 100vh; */
  flex: 0 0 90%;
  overflow: hidden;
  position: relative;
  /* border: 1px solid palevioletred; */
}
/**
  * Hide the canvas element, because we use the nrrdTools to render the images
  make sure the canvas element is not visible and not affect the layout
  */
.left-container > canvas {
  height: 0 !important;
}
.left_gui {
  /* position: fixed; */
  position: absolute;
  top: 0;
  right: 0;
  z-index: 100;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}
.canvas_container {
  /* position: fixed; */
  position: absolute;
  width: 100%;
  height: 100%;
  display: flex;
  justify-content: center;
  align-items: center;
}

.nav_bar_left_container {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
}

.copper3d_sliceNumber {
  position: relative;
  width: 300px;
  text-align: center;
  top: 5% !important;
  right: 1% !important;
  left: 0px !important;
  margin: 0 auto;
  border: 3px solid salmon;
  border-radius: 10px;
  padding: 5px;
  font-size: 0.9em;
  font-weight: 700;
  color: rgba(26, 26, 26, 0.965);
  cursor: no-drop;
  transition: border-color 0.25s;
}

.copper3d_sliceNumber:hover {
  border-color: #eb4a05;
}
.copper3d_sliceNumber:focus,
.copper3d_sliceNumber:focus-visible {
  outline: 4px auto -webkit-focus-ring-color;
}

.dark .copper3d_sliceNumber {
  border: 3px solid #009688;
  color: #fff8ec;
}

.dark .copper3d_sliceNumber:hover {
  border-color: #4db6ac;
}

.copper3D_scene_div {
  display: flex;
  justify-content: center;
  align-items: center;
}

.copper3D_loading_progress {
  color: darkgray !important;
  text-align: center;
  width: 60%;
}
.copper3D_drawingCanvasContainer {
  max-width: 80%;
  max-height: 80%;
}
</style>