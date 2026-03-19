<template>
  <v-card class="mx-auto">
    <v-list v-model:opened="open">
      <v-list-item
        prepend-icon="mdi-tools"
        color="success"
        title="Tools Core Settings"
      ></v-list-item>
      <ImageCtl />
      <OperationCtl />
      <NavRightPanel />
      <SysOpts>
        <SysOptsCtl :key-board-setting="true" :debug-setting="true" :sticky-nav-setting="true" :stick="stickMode" :nrrd-tools="nrrdTools" @update-debug="handleUpdateDebug" @update-sticky="handleUpdateSticky"/>
      </SysOpts>
    </v-list>
  </v-card>
</template>

<script setup lang="ts">
/**
 * Navigation Panel Component
 *
 * @description Main navigation panel container that organizes all tool settings.
 * Renders image controls, operation controls, right panel controls, and system options.
 *
 * Manages panel open/close states via event bus and passes NrrdTools instance
 * to child components for configuration.
 *
 * @listens IntroGuide:OperationStatus - Opens Operation panel when intro guide requests
 * @listens Common:OpenCalculatorBox - Adds calculator to open panels
 * @listens Common:CloseCalculatorBox - Removes calculator from open panels
 * @listens Core:NrrdTools - Receives NrrdTools instance from core
 * @listens Common:DrawerStatus - Updates sticky mode based on drawer state
 *
 * @emits Common:DebugMode - Emitted when debug mode is toggled
 * @emits Common:NavStickyMode - Emitted when sticky mode is toggled
 */
import { ref, onMounted, onUnmounted } from "vue";
import ImageCtl from "@/components/segmentation/NrrdImageCtl.vue";
import OperationCtl from "@/components/segmentation/OperationCtl.vue";
import NavRightPanel from "./NavRightPanel.vue";
import SysOpts from "@/components/segmentation/SysOpts.vue";
import SysOptsCtl from "@/components/segmentation/SysOptsCtl.vue";
import emitter from "@/plugins/custom-emitter";
import * as Copper from "@/ts/index";

/** Currently open list groups (controlled by v-list v-model:opened) */
const open = ref(["Cases"]);

/** Whether navigation bar should be in sticky mode */
const stickMode = ref<boolean>(true);

/** NrrdTools instance received from core for keyboard settings configuration */
const nrrdTools = ref<Copper.NrrdTools>();

onMounted(()=>{
  manageEmitters();
})

/**
 * Registers event listeners for panel state management.
 */
function manageEmitters() {
  emitter.on("IntroGuide:OperationStatus", emitterOnOperationStatus);
  emitter.on("Common:OpenCalculatorBox", emitterOnOpenCalculatorBox)
  emitter.on("Common:CloseCalculatorBox", emitterOnCloseCalculatorBox)
  emitter.on("Core:NrrdTools", emitterOnNrrdTools)
  emitter.on("Common:DrawerStatus", emitterOnDrawerStatus);
}

/**
 * Opens the Operation panel when intro guide requests it.
 */
const emitterOnOperationStatus = (val:string)=>{
  if(val==="open" && !open.value.includes("Operation")){
    open.value.push("Operation")
  }
}

/**
 * Adds a panel to the open list (e.g., Calculator).
 */
const emitterOnOpenCalculatorBox = (val:string)=>{
  open.value.push(val)
}

/**
 * Removes a panel from the open list.
 */
const emitterOnCloseCalculatorBox = (val:string)=>{
  open.value = open.value.filter(item => item !== val)
}

/**
 * Stores the NrrdTools instance received from core components.
 */
const emitterOnNrrdTools = (val: Copper.NrrdTools)=>{
  nrrdTools.value = val;
};

/**
 * Updates sticky mode based on drawer open/close state.
 */
const emitterOnDrawerStatus = (val:boolean)=>{
  stickMode.value = val;
}

/**
 * Forwards debug mode toggle to event bus.
 */
function handleUpdateDebug(value:boolean){
  emitter.emit("Common:DebugMode", value);
}

/**
 * Forwards sticky mode toggle to event bus.
 */
function handleUpdateSticky(value:boolean){
  emitter.emit("Common:NavStickyMode", value);
}

/**
 * Cleanup: Remove all event listeners on unmount.
 */
onUnmounted(()=>{
  emitter.off("IntroGuide:OperationStatus", emitterOnOperationStatus);
  emitter.off("Common:OpenCalculatorBox", emitterOnOpenCalculatorBox)
  emitter.off("Common:CloseCalculatorBox", emitterOnCloseCalculatorBox)
  emitter.off("Core:NrrdTools", emitterOnNrrdTools)
  emitter.off("Common:DrawerStatus", emitterOnDrawerStatus);
})

</script>

<style lang="scss"></style>
