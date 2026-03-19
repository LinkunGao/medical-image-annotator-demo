/**
 * Slice Navigation Composable
 *
 * @description Handles slice navigation controls for the left panel:
 * - Slice orientation switching (x, y, z)
 * - Slice number changes via slider
 * - Main area size adjustments
 * - Slice index tracking
 *
 * @module composables/left-panel/useSliceNavigation
 */
import { ref, type Ref } from "vue";
import * as Copper from "@/ts/index";

/**
 * Interface for slice navigation dependencies
 */
export interface ISliceNavigationDeps {
    nrrdTools: Ref<Copper.NrrdTools | undefined>;
}

/**
 * Composable for slice navigation
 */
export function useSliceNavigation(deps: ISliceNavigationDeps) {
    const { nrrdTools } = deps;

    /** Maximum slice number */
    const max = ref(0);
    /** Current slice number */
    const immediateSliceNum = ref(0);
    /** Current contrast index */
    const contrastNum = ref(0);
    /** Number of contrast images */
    const currentCaseContractsCount = ref(0);
    /** Initial slice index */
    const initSliceIndex = ref(0);

    /**
     * Resets slice orientation axis
     */
    const resetSlicesOrientation = (axis: "x" | "y" | "z") => {
        nrrdTools.value!.setSliceOrientation(axis);
        max.value = nrrdTools.value!.getMaxSliceNum()[1];
        const { currentSliceIndex, contrastIndex } =
            nrrdTools.value!.getCurrentSlicesNumAndContrastNum();
        immediateSliceNum.value = currentSliceIndex;
        contrastNum.value = contrastIndex;
    };

    /**
     * Handles slice change from slider
     */
    const getSliceChangedNum = (sliceNum: number) => {
        nrrdTools.value!.setSliceMoving(sliceNum);
    };

    /**
     * Resets main area size
     */
    const resetMainAreaSize = (factor: number) => {
        nrrdTools.value!.setMainAreaSize(factor);
    };

    /**
     * Gets current slice number from tool events
     */
    const getSliceNum = (res: { index: number; contrastindex: number }) => {
        const { index, contrastindex } = res;
        immediateSliceNum.value = index;
        contrastNum.value = contrastindex;
    };

    /**
     * Handles contrast selection change
     */
    const onContrastSelected = (flag: boolean, i: number) => {
        if (flag) {
            currentCaseContractsCount.value += 1;
            nrrdTools.value!.addSkip(i);
        } else {
            currentCaseContractsCount.value -= 1;
            nrrdTools.value!.removeSkip(i);
        }
        const maxNum = nrrdTools.value!.getMaxSliceNum()[1];
        if (maxNum) {
            max.value = maxNum;
            const { currentSliceIndex, contrastIndex } =
                nrrdTools.value!.getCurrentSlicesNumAndContrastNum();
            immediateSliceNum.value = currentSliceIndex;
            contrastNum.value = contrastIndex + 1;
        }
    };

    /**
     * Updates navigation state after images loaded
     */
    const updateNavigationAfterLoad = () => {
        const currentSliceIndex = nrrdTools.value!.getCurrentSliceIndex();
        initSliceIndex.value = currentSliceIndex;
        immediateSliceNum.value = currentSliceIndex;  // Set immediateSliceNum for slider
        max.value = nrrdTools.value!.getMaxSliceNum()[1];
    };

    return {
        max,
        immediateSliceNum,
        contrastNum,
        currentCaseContractsCount,
        initSliceIndex,
        resetSlicesOrientation,
        getSliceChangedNum,
        resetMainAreaSize,
        getSliceNum,
        onContrastSelected,
        updateNavigationAfterLoad,
    };
}
