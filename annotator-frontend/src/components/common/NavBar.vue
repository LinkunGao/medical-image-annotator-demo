<template>
  <div  class="nav dark guide-left-nav-tool" ref="nav_container" :class="{ compact: isCompact }">
    <div v-show="panelWidth >= 300" class="content" id="left_nav_bar" @dblclick.stop>
      <div class="d-flex align-center flex-grow-1" v-if="!isCompact">
        <v-slider
          v-model="sliceNum"
          :max="p.max"
          :min="p.min"
          :step="1"
          thumb-label
          density="compact"
          hide-details
          color="#f4511e"
          track-color="grey"
          class="guide-left-slider mr-4"
          @update:modelValue="onChangeSlider"
          @click.stop
        />
        <v-text-field
          v-model.number="sliceNum"
          type="number"
          density="compact"
          hide-details
          variant="outlined"
          style="max-width: 140px;"
          class="centered-input"
          :max="p.max"
          :min="p.min"
          @update:modelValue="onChangeSlider"
          @click.stop
        >
          <template v-slot:prepend>
             <v-btn icon="mdi-minus" density="compact" variant="text" size="small" @click="sliceNum > p.min && (sliceNum--, onChangeSlider())"></v-btn>
          </template>
          <template v-slot:append>
             <v-btn icon="mdi-plus" density="compact" variant="text" size="small" @click="sliceNum < p.max && (sliceNum++, onChangeSlider())"></v-btn>
          </template>
        </v-text-field>
      </div>
      <div class="arrows">
        <div class="left-views guide-left-views">
          <span @click="onSwitchSliceOrientation('x')">
            <i class="switch_font">{{ isCompact2 ? 'S' : 'Sagittal' }}</i>
          </span>
          <span @click="onSwitchSliceOrientation('z')">
            <i class="switch_font">{{ isCompact2 ? 'A' : 'Axial' }}</i>
          </span>
          <span @click="onSwitchSliceOrientation('y')">
            <i class="switch_font">{{ isCompact2 ? 'C' : 'Coronal' }}</i>
          </span>
        </div>
        

        <span class="save guide-left-sync" @click="onSave()">
          <div>
            <!-- <ion-icon name="save-outline"></ion-icon> -->
            <ion-icon  name="sync-outline"></ion-icon>
          </div>
          <div>
            <i >sync</i>
          </div>
        </span>
        <!-- <span @click="openDialog">
          <ion-icon name="cloud-upload-outline"></ion-icon>
        </span> -->
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * Left Panel Navigation Bar Component
 *
 * @description Bottom navigation bar for the left (2D) panel providing:
 * - Slice number slider with numeric input
 * - Orientation switching buttons (Sagittal, Axial, Coronal)
 * - Sync button for saving annotations
 *
 * Handles keyboard navigation (Arrow Up/Down) for slice navigation.
 *
 * @prop {number} fileNum - Number of files in current case
 * @prop {number} max - Maximum slice number
 * @prop {number} initSliceIndex - Initial slice index on load
 * @prop {number} immediateSliceNum - Current slice number (reactive)
 *
 * @emits onSliceChange - Emitted when slice number changes (delta value)
 * @emits onChangeOrientation - Emitted when view orientation changes
 * @emits onSave - Emitted when sync button is clicked
 *
 * @listens Common:ToggleAppTheme - Updates dark/light mode styling
 */
import { ref, reactive, toRefs, watchEffect, onMounted, onUnmounted, computed} from "vue";
import emitter from "@/plugins/custom-emitter";

/**
 * Component props interface
 */
type Props = {
  fileNum: number;
  min?: number;
  max?: number;
  showContrast?: boolean;
  initSliceIndex?: number;
  immediateSliceNum?: number;
  contrastIndex?: number;
  isAxisClicked?: boolean;
  panelWidth?: number;
};

/** Reference to nav container for theme toggling */
const nav_container = ref<HTMLDivElement>();

onMounted(() => {
  manageEmitters();
});

function manageEmitters() {
  emitter.on("Common:ToggleAppTheme", emmiterOnToggleAppTheme);
}

const emmiterOnToggleAppTheme = () => {
    nav_container.value?.classList.toggle("dark");
};

let p = withDefaults(defineProps<Props>(), {
  min: 0,
  max: 160,
  immediateSliceNum: 0,
  contrastIndex: 0,
  fileNum: 0,
  showContrast: false,
  isAxisClicked: false,
  panelWidth: 1000
});

const isCompact = computed(() => {
  return p.panelWidth < 800;
});

const isCompact2 = computed(() => {
  return p.panelWidth < 400;
});

const state = reactive(p);
const { immediateSliceNum, contrastIndex, initSliceIndex, fileNum } =
  toRefs(state);
const sliceNum = ref(0);

let magnification = 1;
let filesNum = 0;
let currentSliderNum = 0;
let isAxis = false;
let isFileChange = false;

let timer:any = undefined;

const emit = defineEmits([
  "onSliceChange",
  "resetMainAreaSize",
  "onChangeOrientation",
  "onOpenDialog",
  "onSave",
]);

const onSave = () => {
  emit("onSave", true);
};

const openDialog = () => {
  emit("onOpenDialog", true);
};

const onSwitchSliceOrientation = (axis: string) => {
  isAxis = true;
  emit("onChangeOrientation", axis);
  isAxis = false;
};

const onMagnificationClick = (factor: number) => {
  magnification += factor;
  if (magnification > 8) {
    magnification = 8;
  }
  if (magnification < 1) {
    magnification = 1;
  }
  emit("resetMainAreaSize", magnification);
};
document.addEventListener("keydown", (ev: KeyboardEvent) => {
  if (ev.key === "ArrowUp") {
    if (currentSliderNum > 0) {
      currentSliderNum -= 1;
      updateSlider();
      emit("onSliceChange", -1);
    }
  }
  if (ev.key === "ArrowDown") {
    if (currentSliderNum < p.max) {
      currentSliderNum += 1;
      updateSlider();
      emit("onSliceChange", 1);
    }
  }
});

const onChangeSlider = () => {
  const step = sliceNum.value - currentSliderNum;
  currentSliderNum += step;
  if (!isAxis && !isFileChange) {
    setTimeout(()=>{emit("onSliceChange", step);},1);  
  }
  isAxis = false;
  isFileChange = false;
};

const updateSlider = () => {
  sliceNum.value = currentSliderNum;
};

watchEffect(() => {
  currentSliderNum =
    immediateSliceNum.value * fileNum.value + contrastIndex.value;
  updateSlider();
});

watchEffect(() => {
  initSliceIndex?.value &&
    (currentSliderNum = (initSliceIndex?.value as number) * fileNum.value);
  updateSlider();
});

onUnmounted(() => {
  emitter.off("Common:ToggleAppTheme", emmiterOnToggleAppTheme);
});
</script>

<style scoped>


.nav {
  /* position: fixed;
  bottom: 25px;
  left: 10px; */

  height: 60px;
  width: 55%;
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 100;
  -webkit-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}
.nav .content {
  /* position: relative; */
  width: 100%;
  height: 100%;
  /* background-color: #edf1f4; */
  background-color: #f4f4f4;
  padding: 0 20px;
  border-radius: 10px;
  box-shadow: 0 30px 30px rgba(0, 0, 0, 0.05);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow-x: auto; /* Allow scrolling if content is too wide */
  scrollbar-width: none; /* Firefox */
  -ms-overflow-style: none; /* IE and Edge */
}

/* Hide scrollbar for webkit */
.nav .content::-webkit-scrollbar {
  display: none;
}

.dark .content {
  background: #33393e;
  /* box-shadow: 15px 15px 20px rgba(0, 0, 0, 0.25),
    -15px -15px 20px rgba(255, 255, 255, 0.1); */
  box-shadow: 15px 15px 20px rgba(0, 0, 0, 0.25),
    -5px -10px 15px rgba(255, 255, 255, 0.1);
}

.nav .content .arrows {
  display: flex;
  align-items: center;
}
.nav .content .arrows span {
  position: relative;
  padding: 10px;
  box-shadow: 5px 5px 10px rgba(0, 0, 0, 0.1), -5px -5px 20px #fff;
  margin: 5px;
  cursor: pointer;
  user-select: none;
  min-width: 25px;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 1.2em;
  color: #666;
  border: 2px solid #edf1f4;
  box-shadow: 5px 5px 10px rgba(0, 0, 0, 0.1), -5px -5px 10px #fff;
  border-radius: 10px;
  cursor: pointer;
}
.dark .content .arrows span {
  color: #eee;
  border: 2px solid #333;
  box-shadow: 5px 5px 10px rgba(0, 0, 0, 0.25),
    -5px -5px 10px rgba(255, 255, 255, 0.1);
  border-radius: 10px;
}
.nav .content .arrows span:active {
  box-shadow: inset 5px 5px 10px rgba(0, 0, 0, 0.1), inset -5px -5px 10px #fff;
  color: #f44336;
}

.dark .content .arrows span:active {
  box-shadow: inset 5px 5px 10px rgba(0, 0, 0, 0.25),
    inset -5px -5px 10px rgba(255, 255, 255, 0.1);
}

/* Compact Mode Styles */
.compact .content {
  padding: 0 5px;
}
.compact .arrows span {
  padding: 5px;
  margin: 2px;
  min-width: 20px;
  font-size: 1em;
}
.compact .switch_font {
  font-size: 0.8em;
}

.image {
  width: 1em;
  height: 1em;
}
.switch_font {
  font-size: 0.6em;
}
.switch_font:active {
  font-size: 0.6em;
  color: #f44336;
}
.save {
  display: flex;
  flex-direction: column;
  flex-wrap: wrap;
  align-items: center;
  justify-content: center;
}
.save div {
  padding: -10px 0;
  margin: -10px 0;
}
.save i {
  font-size: 0.5em;
}
.left-views{
  display: flex;
  flex-direction: row;
}
:deep(.centered-input input) {
  text-align: center;
}
/* Hide spin buttons for number input */
:deep(input::-webkit-outer-spin-button),
:deep(input::-webkit-inner-spin-button) {
  -webkit-appearance: none;
  margin: 0;
}
</style>
