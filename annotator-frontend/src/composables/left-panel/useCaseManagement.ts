/**
 * Case Management Composable
 *
 * @description Handles case switching and image management:
 * - Case switching with URL management
 * - Register vs origin image switching
 * - Slice data storage and switching
 * - Emits case details to other components
 *
 * @module composables/left-panel/useCaseManagement
 */
import { ref, type Ref } from "vue";
import * as Copper from "@/ts/index";
import {
    IDetails,
    ICaseUrls,
    ILoadUrls,
    ILoadedMeshes,
    IToolConfig,
    IToolAfterLoadImagesResponse,
} from "@/models";
import { revokeAppUrls } from "@/plugins/view-utils/tools";
import { switchAnimationStatus } from "@/components/viewer/utils";
import { useSegmentationCasesStore } from "@/store/app";
import { storeToRefs } from "pinia";
import emitter from "@/plugins/custom-emitter";

/**
 * Suffix types for contrast/registration URLs
 */
const suffixes = ["pre", "1", "2", "3", "4"] as const;
type Suffix = (typeof suffixes)[number];
type InputKey = `contrast_${Suffix}` | `registration_${Suffix}`;

/**
 * Interface for case management dependencies
 */
export interface ICaseManagementDeps {
    nrrdTools: Ref<Copper.NrrdTools | undefined>;
    loadingContainer: Ref<HTMLDivElement | undefined>;
    progress: Ref<HTMLDivElement | undefined>;
    config: Ref<IToolConfig | null>;
}

/**
 * Composable for case management
 */
export function useCaseManagement(deps: ICaseManagementDeps) {
    const { nrrdTools, loadingContainer, progress, config } = deps;

    const { allCasesDetails } = storeToRefs(useSegmentationCasesStore());
    const { getAllCasesDetails } = useSegmentationCasesStore();

    /** Current case name */
    const currentCaseName = ref("");
    /** Current case contrast URLs */
    const currentCaseContrastUrls = ref<Array<string>>([]);
    /** Whether to load mask data */
    const loadMask = ref(true);
    /** Current case detail */
    const currentCaseDetail = ref<IDetails | undefined>(undefined);

    // Image data storage
    let displaySlices: Array<any> = [];
    let displayLoadedMeshes: Array<ILoadedMeshes> = [];
    let registerSlices: Array<any> = [];
    let regitserMeshes: Array<ILoadedMeshes> = [];
    let originSlices: Array<any> = [];
    let originMeshes: Array<ILoadedMeshes> = [];
    let originUrls: ICaseUrls = { nrrdUrls: [], jsonUrl: "" };
    let regiterUrls: ICaseUrls = { nrrdUrls: [], jsonUrl: "" };
    let loadedUrls: ILoadUrls = {};

    /** Register switch bar status (true = register, false = origin) */
    let regiterSwitchBarStatus = true;

    /**
     * Syncs contrast and registration pairs
     */
    function syncPair(input: Record<InputKey, string>, suffix: Suffix) {
        const cKey = `contrast_${suffix}` as const;
        const rKey = `registration_${suffix}` as const;

        if (input[cKey] == null && input[rKey] != null) {
            input[cKey] = input[rKey];
        } else if (input[rKey] == null && input[cKey] != null) {
            input[rKey] = input[cKey];
        }
    }

    /**
     * Handles case switching
     */
    async function onCaseSwitched(casename: string) {
        regiterSwitchBarStatus = true;

        switchAnimationStatus(
            loadingContainer.value!,
            progress.value!,
            "flex",
            "Saving masks data, please wait......"
        );

        // Clear URLs
        originUrls.nrrdUrls.length = 0;
        regiterUrls.nrrdUrls.length = 0;
        originUrls.jsonUrl = "";
        regiterUrls.jsonUrl = "";
        originSlices.length = 0;
        registerSlices.length = 0;

        currentCaseName.value = casename;

        await getAllCasesDetails({
            user_uuid: config.value!.user_info.uuid,
            assay_uuid: config.value!.assay_info.uuid,
        });

        switchAnimationStatus(
            loadingContainer.value!,
            progress.value!,
            "flex",
            "Prepare Nrrd files, please wait......"
        );

        currentCaseDetail.value = allCasesDetails.value?.details.find(
            (detail) => detail.name === currentCaseName.value
        );

        if (currentCaseDetail.value) {
            regiterUrls = {
                nrrdUrls: [],
                jsonUrl:
                    Number(currentCaseDetail.value.output.mask_meta_json_size) > 0
                        ? currentCaseDetail.value.output.mask_meta_json_path
                        : "",
            };
            originUrls = {
                nrrdUrls: [],
                jsonUrl:
                    Number(currentCaseDetail.value.output.mask_meta_json_size) > 0
                        ? currentCaseDetail.value.output.mask_meta_json_path
                        : "",
            };

            suffixes.forEach((suffix) => {
                syncPair(currentCaseDetail.value!.input, suffix);
                if (!!currentCaseDetail.value!.input[`registration_${suffix}`]) {
                    regiterUrls.nrrdUrls.push(
                        currentCaseDetail.value!.input[`registration_${suffix}`]
                    );
                }
                if (!!currentCaseDetail.value!.input[`contrast_${suffix}`]) {
                    originUrls.nrrdUrls.push(
                        currentCaseDetail.value!.input[`contrast_${suffix}`]
                    );
                }
            });

            currentCaseContrastUrls.value = regiterUrls.nrrdUrls;

            emitter.emit("Segmentation:CaseDetails", {
                currentCaseName: currentCaseName.value,
                currentCaseId: currentCaseDetail.value!.id,
                details: allCasesDetails.value?.details,
                maskNrrd: !!currentCaseContrastUrls.value[1]
                    ? currentCaseContrastUrls.value[1]
                    : currentCaseContrastUrls.value[0],
            });
        } else {
            throw new Error("Case detail not found");
        }

        loadMask.value = true;
    }

    /**
     * Handles register/origin image switching
     */
    async function onRegistedStateChanged(isShowRegisterImage: boolean) {
        switchAnimationStatus(
            loadingContainer.value!,
            progress.value!,
            "flex",
            "Prepare and Loading data, please wait......"
        );

        let sendToRightContrstUrl = "";

        if (!isShowRegisterImage) {
            regiterSwitchBarStatus = false;

            if (originSlices.length > 0) {
                displaySlices = [...originSlices];
                displayLoadedMeshes = [...originMeshes];
                nrrdTools.value!.switchAllSlicesArrayData(displaySlices);
            } else {
                currentCaseContrastUrls.value = originUrls.nrrdUrls;
            }
            sendToRightContrstUrl = originUrls.nrrdUrls[1]
                ? originUrls.nrrdUrls[1]
                : originUrls.nrrdUrls[0];
        } else {
            regiterSwitchBarStatus = true;
            displaySlices = [...registerSlices];
            displayLoadedMeshes = [...regitserMeshes];
            nrrdTools.value!.switchAllSlicesArrayData(displaySlices);
            sendToRightContrstUrl = regiterUrls.nrrdUrls[1]
                ? regiterUrls.nrrdUrls[1]
                : regiterUrls.nrrdUrls[0];
        }

        emitter.emit("Segmentation:RegisterButtonStatusChanged", {
            maskNrrdMeshes: !!displayLoadedMeshes[1]
                ? displayLoadedMeshes[1]
                : displayLoadedMeshes[0],
            maskSlices: !!displaySlices[1] ? displaySlices[1] : displaySlices[0],
            url: sendToRightContrstUrl,
            register: isShowRegisterImage,
        });

        tellAllRelevantComponentsImagesLoaded();
        switchAnimationStatus(loadingContainer.value!, progress.value!, "none");
    }

    /**
     * Notifies components that images are loaded
     */
    function tellAllRelevantComponentsImagesLoaded() {
        emitter.emit("Segmentation:FinishLoadAllCaseImages");
    }

    /**
     * Handles all images loaded from core
     */
    function handleAllImagesLoaded(res: IToolAfterLoadImagesResponse) {
        displaySlices = res.allSlices;
        displayLoadedMeshes = res.allLoadedMeshes;

        if (regiterSwitchBarStatus) {
            registerSlices = [...displaySlices];
            regitserMeshes = [...displayLoadedMeshes];
        } else {
            originSlices = [...displaySlices];
            originMeshes = [...displayLoadedMeshes];
        }
    }

    /**
     * Cleans up loaded URLs
     */
    function releaseUrls() {
        revokeAppUrls(loadedUrls);
        loadedUrls = {};
    }

    /**
     * Cleans up all data
     */
    function cleanup() {
        currentCaseContrastUrls.value.length = 0;
        displaySlices.length = 0;
        displayLoadedMeshes.length = 0;
        originSlices.length = 0;
        registerSlices.length = 0;
    }

    return {
        currentCaseName,
        currentCaseContrastUrls,
        loadMask,
        currentCaseDetail,
        allCasesDetails,
        originUrls,
        regiterUrls,
        getRegisterSwitchBarStatus: () => regiterSwitchBarStatus,
        onCaseSwitched,
        onRegistedStateChanged,
        handleAllImagesLoaded,
        tellAllRelevantComponentsImagesLoaded,
        releaseUrls,
        cleanup,
    };
}
