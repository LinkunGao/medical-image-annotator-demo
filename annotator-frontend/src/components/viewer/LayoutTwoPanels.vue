<template>
    <div class="main-container" ref="mainContainer">
        <div
            v-show="!rightFullScreen"
            class="box bg-image_view ml-1 my-1 mt-2 rounded"
            ref="left_container"
            @dblclick.stop="togglePanelActive('left', $event)"
        >
        <slot name="left"></slot>
        </div>
        <div class="d-flex justify-center align-center" ref="splitBar">
        <div
            v-show="!leftFullScreen && !rightFullScreen"
            class="split-bar bg-split-line rounded-lg guide-main-split-bar"
        ></div>
        </div>

        <div
            v-show="!leftFullScreen"
            class="box box_right bg-image_view mr-1 my-1 mt-2 rounded"
            ref="right_container"
            @dblclick.stop="togglePanelActive('right', $event)"
        >
        <slot name="right"></slot>
        </div>
    </div>
</template> 

<script lang="ts" setup>
/**
 * Two Panels Layout Component
 *
 * @description Split-view layout container with resizable left and right panels.
 * Features:
 * - Draggable split bar for resizing panels
 * - Double-click to toggle panel full-screen mode
 * - Sticky mode support for navigation panels
 *
 * @slot left - Left panel content (typically 2D image viewer)
 * @slot right - Right panel content (typically 3D model viewer)
 *
 * @exposes leftPanelWidth - Current left panel width in pixels
 * @exposes rightPanelWidth - Current right panel width in pixels
 *
 * @listens Common:NavStickyMode - Updates panel sizing for sticky navigation
 */
import { ref, onMounted, onUnmounted } from "vue";
import emitter from "@/plugins/custom-emitter";;
import { throttle } from "@/plugins/view-utils/tools";

/** Reference to main container element */
const mainContainer = ref<HTMLDivElement>();

/** Reference to split bar divider element */
const splitBar = ref<HTMLDivElement>();

/** Reference to left panel container */
const left_container = ref<HTMLDivElement>();

/** Reference to right panel container */
const right_container = ref<HTMLDivElement>();

/** Whether left panel is in full-screen mode */
let leftFullScreen = ref(false);

/** Whether right panel is in full-screen mode */
let rightFullScreen = ref(false);

/** Elements to ignore for double-click detection */
const ignoreElements = ["INPUT", "I", "svg", "path"];

/** Current left panel width (exposed for external use) */
const leftPanelWidth = ref(1000);

/** Current right panel width (exposed for external use) */
const rightPanelWidth = ref(600);

/** Current left panel percentage of total width (exposed for external use) */
const percent = ref(65);

defineExpose({
leftPanelWidth,
rightPanelWidth,
percent,
})

/** Whether split bar is currently being dragged */
let isDragging = false;

/** Whether navigation is in sticky mode */
let nav_sticky = false;
onMounted(() => {
manageEmitters();

splitBar.value?.addEventListener("mousedown", function (e) {
    isDragging = true;
    document.addEventListener("mousemove", throttle(moveSplitLine, 100));
});

document.addEventListener("mouseup", function (e) {
    isDragging = false;
    document.removeEventListener("mousemove", moveSplitLine);
});
});

function manageEmitters() {
    emitter.on("Common:NavStickyMode", emitterOnNavStickyMode);
}

const emitterOnNavStickyMode = (val: boolean) => {
    nav_sticky = val;
    if (val && left_container.value?.classList.contains("panel_active")) {
        left_container.value?.classList.add("nav_panel_active");
    } else if (val &&right_container.value?.classList.contains("panel_active")) {
        right_container.value?.classList.add("nav_panel_active");
    } else {
        left_container.value?.classList.remove("nav_panel_active");
        right_container.value?.classList.remove("nav_panel_active");
    }
}

function moveSplitLine(e: MouseEvent) {
    if (isDragging) {
        const containerRect = (mainContainer.value as HTMLDivElement).getBoundingClientRect();
        let clientX = e.clientX;
        if (nav_sticky) {
            clientX = e.clientX + 350;
        }
        const mousePosition = clientX - containerRect.left;

        const minLeft = containerRect.left;
        const maxLeft =
        containerRect.right - (splitBar.value as HTMLDivElement).offsetWidth;
        let splitPercent = ((mousePosition - minLeft) / (maxLeft - minLeft)) * 100;
        // if (splitPercent < 0 || splitPercent > 100) {
        //   return;
        // }
        if (splitPercent < 10) {
            splitPercent = 1;
            (mainContainer.value as HTMLDivElement).style.gridTemplateColumns =
                splitPercent - 1 + "% 1%" + (100 - splitPercent) + "%";
            } else if (splitPercent > 90) {
            splitPercent = 100;
            (mainContainer.value as HTMLDivElement).style.gridTemplateColumns =
                splitPercent - 1 + "% 1%" + (100 - splitPercent) + "%";
            } else {
            (mainContainer.value as HTMLDivElement).style.gridTemplateColumns =
                splitPercent - 1 + "% 1%" + (100 - splitPercent) + "%";
        }
        leftPanelWidth.value = left_container.value?.getBoundingClientRect()
        .width as number;
        rightPanelWidth.value = right_container.value?.getBoundingClientRect()
        .width as number;
        percent.value = splitPercent;
    }
}

function togglePanelActive(panel: string, e: MouseEvent) {
    const nodeName = (e.target as HTMLElement).nodeName;
    if (ignoreElements.includes(nodeName)) return;
    switch (panel) {
        case "left":
            leftFullScreen.value = !leftFullScreen.value;

            left_container.value?.classList.toggle("panel_active");
            if (!left_container.value?.classList.contains("panel_active")) {
                left_container.value?.classList.remove("nav_panel_active");
            } else {
                if (
                nav_sticky &&
                !left_container.value?.classList.contains("nav_panel_active")
                ) {
                left_container.value?.classList.add("nav_panel_active");
                }
            }
            leftPanelWidth.value = left_container.value?.getBoundingClientRect()
                .width as number;
            break;
        case "right":
            rightFullScreen.value = !rightFullScreen.value;
            right_container.value?.classList.toggle("panel_active");
            if (!right_container.value?.classList.contains("panel_active")) {
                right_container.value?.classList.remove("nav_panel_active");
            } else {
                if (
                nav_sticky &&
                !right_container.value?.classList.contains("nav_panel_active")
                ) {
                right_container.value?.classList.add("nav_panel_active");
                }
            }
            setTimeout(() => {
                // delay 500ms
                // set a time out to make sure after the browser finish render the doms, then we get the correct panel width.
                rightPanelWidth.value = right_container.value?.getBoundingClientRect()
                .width as number;
            }, 300);
            break;
    }
}

onUnmounted(() => {
    emitter.off("Common:NavStickyMode", emitterOnNavStickyMode);
});
</script>

<style scoped>
.main-container {
    display: grid;
    grid-template-columns: 64% 1% 35%;
    width: 100%;
    /* height: 90vh; */
    overflow: hidden;
    position: relative;
    user-select: none;
    -webkit-user-select: none;
}

.box {
    display: flex;
    flex-direction: column;
    height: calc(100dvh - 80px);
}
.box_right {
    display: flex;
    align-items: center;
    justify-content: center;
}
.panel_active {
    width: 100%;
    position: fixed;
    z-index: 100;
}
.nav_panel_active {
    width: calc(100vw - 350px);
}

.split-bar {
    width: 4px;
    height: 10%;
    cursor: col-resize;
}
</style>
