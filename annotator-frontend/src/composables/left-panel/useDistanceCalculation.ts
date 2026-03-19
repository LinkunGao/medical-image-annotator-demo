/**
 * Distance Calculation Composable
 *
 * @description Handles tumour distance calculations:
 * - Distance to Skin (DTS)
 * - Distance to Nipple (DTN)
 * - Distance to Ribcage (DTR)
 * - Sphere position data processing
 *
 * @module composables/left-panel/useDistanceCalculation
 */
import { ref, type Ref } from "vue";
import * as Copper from "@/ts/index";
import {
    ISaveSphere,
    IToolSphereData,
    IToolCalculateSpherePositionsData,
} from "@/models";
import { customRound, distance3D } from "@/plugins/view-utils/utils-left";
import { useSaveSphere } from "@/plugins/api/index";
import emitter from "@/plugins/custom-emitter";

/**
 * Interface for distance calculation dependencies
 */
export interface IDistanceCalculationDeps {
    nrrdTools: Ref<Copper.NrrdTools | undefined>;
    currentCaseName: Ref<string>;
}

/**
 * Composable for distance calculations
 */
export function useDistanceCalculation(deps: IDistanceCalculationDeps) {
    const { nrrdTools, currentCaseName } = deps;

    /** Distance to Skin in mm */
    const dts = ref(0);
    /** Distance to Nipple in mm */
    const dtn = ref(0);
    /** Distance to Ribcage in mm */
    const dtr = ref(0);
    /** Show calculator panel flag */
    const showCalculatorValue = ref(false);

    /**
     * Phase 7: Helper to get voxelSpacing - prefers SegmentationManager, falls back to NrrdTools
     */
    const getVoxelSpacing = (): number[] => {
        return nrrdTools.value!.getVoxelSpacing();
    };

    /**
     * Phase 7: Helper to get spaceOrigin - prefers SegmentationManager, falls back to NrrdTools
     */
    const getSpaceOrigin = (): number[] => {
        return nrrdTools.value!.getSpaceOrigin();
    };

    const getSphereData = async (res: IToolSphereData) => {
        const { sphereOrigin, sphereRadius } = res;
        const spacing = getVoxelSpacing();
        const origin = getSpaceOrigin();

        const sphereData: ISaveSphere = {
            caseId: currentCaseName.value,
            sliceId: sphereOrigin[2],
            origin,
            spacing,
            sphereRadiusMM: sphereRadius,
            sphereOriginMM: [
                sphereOrigin[0],
                sphereOrigin[1],
                sphereOrigin[2] * spacing[2],
            ],
        };

        emitter.emit("SegmentationTrial:DrawSphereFunction", sphereData);
        await useSaveSphere(sphereData);
    };

    /**
     * Calculates distances from tumour to skin, ribcage, and nipple
     * 
     * Coordinate format from Copper3D: { x: pixel, y: pixel, z: mm }
     */
    const getCalculateSpherePositionsData = async (
        res: IToolCalculateSpherePositionsData
    ) => {
        const {
            tumourSphereOrigin,
            skinSphereOrigin,
            ribSphereOrigin,
            nippleSphereOrigin,
            aix,
        } = res;

        const spacing = getVoxelSpacing();

        if (tumourSphereOrigin === null) {
            return;
        }

        // Calculate and update DTS
        if (skinSphereOrigin !== null) {
            dts.value = Number(
                distance3D(
                    tumourSphereOrigin[aix][0],
                    tumourSphereOrigin[aix][1],
                    tumourSphereOrigin[aix][2],
                    skinSphereOrigin[aix][0],
                    skinSphereOrigin[aix][1],
                    skinSphereOrigin[aix][2]
                ).toFixed(2)
            );
        }

        // Calculate and update DTR
        if (ribSphereOrigin !== null) {
            dtr.value = Number(
                distance3D(
                    tumourSphereOrigin[aix][0],
                    tumourSphereOrigin[aix][1],
                    tumourSphereOrigin[aix][2],
                    ribSphereOrigin[aix][0],
                    ribSphereOrigin[aix][1],
                    ribSphereOrigin[aix][2]
                ).toFixed(2)
            );
        }

        // Calculate and update DTN
        if (nippleSphereOrigin !== null) {
            dtn.value = Number(
                distance3D(
                    tumourSphereOrigin[aix][0],
                    tumourSphereOrigin[aix][1],
                    tumourSphereOrigin[aix][2],
                    nippleSphereOrigin[aix][0],
                    nippleSphereOrigin[aix][1],
                    nippleSphereOrigin[aix][2]
                ).toFixed(2)
            );
        }

        // Send status to calculator component
        if (nrrdTools.value!.getActiveSphereType() !== "tumour") {
            emitter.emit(
                "SegmentationTrial:CalulatorTimerFunction",
                nrrdTools.value!.getActiveSphereType()
            );
        }
    };

    /**
     * Opens calculator box
     */
    const openCalculatorBox = () => {
        showCalculatorValue.value = true;
    };

    /**
     * Closes calculator box
     */
    const closeCalculatorBox = () => {
        showCalculatorValue.value = false;
    };

    return {
        dts,
        dtn,
        dtr,
        showCalculatorValue,
        getSphereData,
        getCalculateSpherePositionsData,
        openCalculatorBox,
        closeCalculatorBox,
    };
}
