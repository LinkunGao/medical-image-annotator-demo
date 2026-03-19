/**
 * WebSocket Sync Composable
 *
 * @description Manages WebSocket connection for tumour model synchronization:
 * - Connects to backend WebSocket for case-specific updates
 * - Handles OBJ reload notifications
 * - Handles mesh deletion notifications
 *
 * @module composables/right-panel/useWebSocketSync
 */
import { ref, type Ref } from "vue";
import { useSingleFile } from "@/plugins/api/index";
import { switchAnimationStatus } from "@/components/viewer/utils";
import { useToast } from "@/composables/useToast";
import * as Copper from "@/ts/index";
import * as THREE from "three";
import { IDetails } from "@/models";
import { getWsBaseUrl } from "@/plugins/api/getBaseUrl";

/**
 * Interface for WebSocket dependencies
 */
export interface IWebSocketDeps {
    loadingContainer: Ref<HTMLDivElement | undefined>;
    progress: Ref<HTMLDivElement | undefined>;
    copperScene: Ref<Copper.copperScene | undefined>;
    currentCaseDetails: Ref<IDetails | undefined>;
    maskMeshUrl: Ref<string | undefined>;
    preTumourSphere: Ref<THREE.Mesh | undefined>;
    segmentMask3DModel: Ref<THREE.Group | THREE.Mesh | undefined>;
    openLoading: Ref<boolean>;
    tumourVolume: Ref<number>;
    loadSegmentMaskMesh: (url: string) => void;
    initPanelValue: () => void;
}

/**
 * Composable for WebSocket synchronization
 */
export function useWebSocketSync(deps: IWebSocketDeps) {
    const {
        loadingContainer,
        progress,
        copperScene,
        currentCaseDetails,
        maskMeshUrl,
        preTumourSphere,
        segmentMask3DModel,
        openLoading,
        tumourVolume,
        loadSegmentMaskMesh,
        initPanelValue,
    } = deps;

    const toast = useToast();
    let socket: WebSocket | null = null;

    /**
     * Initializes WebSocket connection for a case
     */
    function initSocket(caseId: string) {
        if (socket) {
            socket.close();
        }
        socket = new WebSocket(`${getWsBaseUrl()}/${caseId}`);
        socket.onopen = function (e) {
            console.log(`WebSocket connected for case: ${caseId}`);
        };
        socket.onmessage = handleWebSocketMessage;
        socket.onclose = function (e) {
            console.log(`WebSocket closed for case: ${caseId}`);
        };
    }

    /**
     * Handles WebSocket messages
     */
    async function handleWebSocketMessage(event: MessageEvent) {
        try {
            const data = JSON.parse(event.data);

            if (data.status === "complete" && data.action === "reload_obj") {
                console.log("Received OBJ reload notification:", data);

                if (data.volume) {
                    tumourVolume.value = Math.ceil(data.volume) / 1000;
                }

                const objUrl = currentCaseDetails.value?.output.mask_obj_path;
                if (objUrl) {
                    // Use cache busting parameter to get the latest file
                    const file = await useSingleFile(objUrl, true);
                    if (file && file instanceof Blob) {
                        if (maskMeshUrl.value) {
                            URL.revokeObjectURL(maskMeshUrl.value);
                        }
                        maskMeshUrl.value = URL.createObjectURL(file);
                        loadSegmentMaskMesh(maskMeshUrl.value);
                        toast.success("3D model loaded successfully");
                    }
                }

                if (preTumourSphere.value && copperScene.value) {
                    copperScene.value.scene.remove(preTumourSphere.value);
                    preTumourSphere.value = undefined;
                }

                switchAnimationStatus(loadingContainer.value!, progress.value!, "none");
                openLoading.value = false;
            } else if (data.status === "complete" && data.action === "reload_gltf") {
                if (data.volume) {
                    tumourVolume.value = Math.ceil(data.volume) / 1000;
                }

                const glbUrl = currentCaseDetails.value?.output.mask_glb_path;
                if (glbUrl) {
                    // Use cache busting parameter to get the latest file
                    const file = await useSingleFile(glbUrl, true);
                    if (file && file instanceof Blob) {
                        if (maskMeshUrl.value) {
                            URL.revokeObjectURL(maskMeshUrl.value);
                        }
                        maskMeshUrl.value = URL.createObjectURL(file);
                        loadSegmentMaskMesh(maskMeshUrl.value);
                        toast.success("3D model updated successfully");
                    }
                }

                if (preTumourSphere.value && copperScene.value) {
                    copperScene.value.scene.remove(preTumourSphere.value);
                    preTumourSphere.value = undefined;
                }

                switchAnimationStatus(loadingContainer.value!, progress.value!, "none");
                openLoading.value = false;
            } else if (data.status === "error" && data.action === "gltf_conversion_error") {

                // Hide loading animation
                if (loadingContainer.value && progress.value) {
                    switchAnimationStatus(loadingContainer.value, progress.value, "none");
                }
                openLoading.value = false;

                // Remove existing mesh from scene
                if (segmentMask3DModel.value && copperScene.value) {
                    copperScene.value.scene.remove(segmentMask3DModel.value);
                    segmentMask3DModel.value = undefined;
                }

                // Reset tumour volume
                tumourVolume.value = 0;

                // Show user-friendly error message
                const errorMsg = `Cannot convert ${data.layer_id} to 3D model: ${data.error}`;
                toast.warning(errorMsg);
            } else if (data.status === "delete" || event.data === "delete") {
                tumourVolume.value = 0;
                if (segmentMask3DModel.value && copperScene.value) {
                    copperScene.value.scene.remove(segmentMask3DModel.value);
                }
                segmentMask3DModel.value = undefined;
                initPanelValue();
                openLoading.value = false;
            }
        } catch (e) {
            console.error("Error handling WebSocket message:", e);
            console.log("Event data:", event.data);
            openLoading.value = false;
        }
    }

    /**
     * Closes WebSocket connection
     */
    function closeSocket() {
        if (socket) {
            socket.close();
            socket = null;
        }
    }

    return {
        initSocket,
        closeSocket,
    };
}
