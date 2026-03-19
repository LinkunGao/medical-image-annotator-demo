/**
 * Right Panel Models Composable
 *
 * @description Handles 3D model loading and management:
 * - NRRD mesh loading and switching
 * - Tumour OBJ model loading
 * - Breast model loading
 * - Nipple sphere positioning
 * - Model cleanup
 *
 * @module composables/right-panel/useRightPanelModels
 */
import { ref, type Ref } from "vue";
import * as THREE from "three";
import * as Copper from "@/ts/index";
import { ICommXYZ, ISaveSphere } from "@/models";

/**
 * Interface for model management dependencies
 */
export interface IModelsDeps {
    copperScene: Ref<Copper.copperScene | undefined>;
    nrrdBias: Ref<THREE.Vector3>;
}

/**
 * Composable for right panel model management
 */

/**
 * Return type for useRightPanelModels composable
 */
export interface IUseRightPanelModelsReturn {
    allRightPanelMeshes: Ref<Array<THREE.Object3D>>;
    segmentMask3DModel: Ref<THREE.Group | THREE.Mesh | undefined>;
    breast3DModel: Ref<THREE.Group | undefined>;
    preTumourSphere: Ref<THREE.Mesh | undefined>;
    tumourSliceIndex: Ref<ICommXYZ>;
    nippleSphereL: THREE.Mesh;
    nippleSphereR: THREE.Mesh;
    updateNrrdMeshToCopperScene: (
        updatedNrrdMesh: Copper.nrrdMeshesType,
        updatedNrrdSlice: Copper.nrrdSliceType,
        recordSliceIndex?: ICommXYZ
    ) => void;
    resetSliceIndex: (sliceIndex: ICommXYZ) => void;
    loadSegmentMaskMesh: (
        tomourUrl: string,
        onLoaded: (position: THREE.Vector3) => void
    ) => void;
    loadBreastModel: (url: string) => void;
    drawPreviewSphere: (
        sphereData: ISaveSphere,
        correctedOrigin: number[],
        onPositionSet: (position: THREE.Vector3) => void
    ) => void;
    removeOldMeshes: () => void;
    toggleBreastVisibility: (visible: boolean) => void;
    getNrrdData: () => {
        loadNrrdMeshes: Copper.nrrdMeshesType;
        loadNrrdSlices: Copper.nrrdSliceType;
    };
    setNrrdData: (
        meshes: Copper.nrrdMeshesType,
        slices: Copper.nrrdSliceType,
        imageType: "register" | "origin"
    ) => void;
}

/**
 * Composable for right panel model management
 */
export function useRightPanelModels(deps: IModelsDeps): IUseRightPanelModelsReturn {
    const { copperScene, nrrdBias } = deps;

    /** All meshes added to right panel for cleanup */
    const allRightPanelMeshes = ref<Array<THREE.Object3D>>([]);
    /** Loaded segment tumour 3D model */
    const segmentMask3DModel = ref<THREE.Group | THREE.Mesh | undefined>(undefined);
    /** Breast 3D model */
    const breast3DModel = ref<THREE.Group | undefined>(undefined);
    /** Preview tumour sphere */
    const preTumourSphere = ref<THREE.Mesh | undefined>(undefined);
    /** Current tumour slice index */
    const tumourSliceIndex = ref<ICommXYZ>({ x: 0, y: 0, z: 0 });

    // NRRD mesh references
    let loadNrrdMeshes: Copper.nrrdMeshesType;
    let loadNrrdSlices: Copper.nrrdSliceType;
    let registrationMeshes: Copper.nrrdMeshesType | undefined;
    let originMeshes: Copper.nrrdMeshesType | undefined;
    let registrationSlices: Copper.nrrdSliceType | undefined;
    let originSlices: Copper.nrrdSliceType | undefined;

    // Cancellation token: incremented on each cleanup to invalidate stale async callbacks
    let loadGeneration = 0;

    // Common geometry for spheres
    const commGeo = new THREE.SphereGeometry(3, 32, 16);
    const material = new THREE.MeshBasicMaterial({ color: "hotpink" });
    const nippleSphereL = new THREE.Mesh(commGeo, material);
    const nippleSphereR = new THREE.Mesh(commGeo, material);

    /**
     * Updates NRRD mesh in copper scene
     */
    function updateNrrdMeshToCopperScene(
        updatedNrrdMesh: Copper.nrrdMeshesType,
        updatedNrrdSlice: Copper.nrrdSliceType,
        recordSliceIndex?: ICommXYZ
    ) {
        if (!copperScene.value) return;

        if (loadNrrdMeshes) {
            copperScene.value.scene.remove(
                loadNrrdMeshes.x,
                loadNrrdMeshes.y,
                loadNrrdMeshes.z
            );
        }
        loadNrrdMeshes = updatedNrrdMesh;
        loadNrrdSlices = updatedNrrdSlice;
        if (recordSliceIndex) resetSliceIndex(recordSliceIndex);
        copperScene.value.scene.add(
            loadNrrdMeshes.x,
            loadNrrdMeshes.y,
            loadNrrdMeshes.z
        );
    }

    /**
     * Resets slice index positions
     */
    function resetSliceIndex(sliceIndex: ICommXYZ) {
        if (sliceIndex.x === 0 && sliceIndex.y === 0 && sliceIndex.z === 0) return;
        loadNrrdMeshes.x.renderOrder = 1;
        loadNrrdMeshes.y.renderOrder = 1;
        loadNrrdMeshes.z.renderOrder = 1;
        loadNrrdSlices.x.index = sliceIndex.x;
        loadNrrdSlices.y.index = sliceIndex.y;
        loadNrrdSlices.z.index = sliceIndex.z;
        loadNrrdSlices.x.repaint.call(loadNrrdSlices.x);
        loadNrrdSlices.y.repaint.call(loadNrrdSlices.y);
        loadNrrdSlices.z.repaint.call(loadNrrdSlices.z);
    }

    /**
     * Loads segmented tumour from OBJ URL
     */
    function loadSegmentMaskMesh(
        tomourUrl: string,
        onLoaded: (position: THREE.Vector3) => void
    ) {
        if (!copperScene.value) return;

        preTumourSphere.value = undefined;
        if (segmentMask3DModel.value) {
            copperScene.value.scene.remove(segmentMask3DModel.value);
            segmentMask3DModel.value = undefined;
        }

        const generation = loadGeneration;
        copperScene.value.loadPureGLB(tomourUrl, (content) => {
            // Stale callback from a previous case — remove from scene and bail out
            if (generation !== loadGeneration) {
                copperScene.value?.scene.remove(content);
                return;
            }

            allRightPanelMeshes.value.push(content);
            segmentMask3DModel.value = content;
            content.position.set(nrrdBias.value.x, nrrdBias.value.y, nrrdBias.value.z);
            const tumourMesh = content.children[0] as THREE.Mesh;
            tumourMesh.renderOrder = 3;

            const box = new THREE.Box3().setFromObject(content);
            const tumourPosition = box.getCenter(new THREE.Vector3());
            onLoaded(tumourPosition);

            const sliceIndex: ICommXYZ = {
                x: loadNrrdSlices.x.RSAMaxIndex / 2 + tumourPosition.x,
                y: loadNrrdSlices.y.RSAMaxIndex / 2 + tumourPosition.y,
                z: loadNrrdSlices.z.RSAMaxIndex / 2 + tumourPosition.z,
            };
            tumourSliceIndex.value = sliceIndex;
            resetSliceIndex(sliceIndex);
        });
    }

    /**
     * Loads breast model from OBJ URL
     */
    function loadBreastModel(url: string) {
        if (!url || !copperScene.value) return;

        const generation = loadGeneration;
        copperScene.value.loadOBJ(url, (content) => {
            // Stale callback from a previous case — remove from scene and bail out
            if (generation !== loadGeneration) {
                copperScene.value?.scene.remove(content);
                return;
            }

            breast3DModel.value = content;
            allRightPanelMeshes.value.push(content);
            content.position.set(nrrdBias.value.x, nrrdBias.value.y, nrrdBias.value.z);
            content.renderOrder = 3;
            content.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    (child as THREE.Mesh).renderOrder = 3;
                    (child as THREE.Mesh).material = new THREE.MeshBasicMaterial({
                        side: THREE.DoubleSide,
                        transparent: true,
                        opacity: 0.2,
                        color: "#795548",
                    });
                }
            });
        });
    }

    /**
     * Draws preview sphere from left panel data
     */
    function drawPreviewSphere(
        sphereData: ISaveSphere,
        correctedOrigin: number[],
        onPositionSet: (position: THREE.Vector3) => void
    ) {
        if (!copperScene.value) return;

        if (preTumourSphere.value) {
            copperScene.value.scene.remove(preTumourSphere.value);
            preTumourSphere.value = undefined;
        }
        if (segmentMask3DModel.value) {
            copperScene.value.scene.remove(segmentMask3DModel.value);
        }

        const geometry = new THREE.SphereGeometry(sphereData.sphereRadiusMM, 32, 16);
        const mat = new THREE.MeshBasicMaterial({ color: "#228b22" });
        const sphereTumour = new THREE.Mesh(geometry, mat);

        const spherePosition = [
            correctedOrigin[0] + sphereData.sphereOriginMM[0],
            correctedOrigin[1] + sphereData.sphereOriginMM[1],
            correctedOrigin[2] + sphereData.sphereOriginMM[2],
        ];
        sphereTumour.position.set(spherePosition[0], spherePosition[1], spherePosition[2]);

        const tumourPos = new THREE.Vector3(
            spherePosition[0],
            spherePosition[1],
            spherePosition[2]
        );
        onPositionSet(tumourPos);

        // Update slice indices
        loadNrrdSlices.x.index = loadNrrdSlices.x.RSAMaxIndex / 2 + sphereTumour.position.x;
        loadNrrdSlices.y.index = loadNrrdSlices.y.RSAMaxIndex / 2 + sphereTumour.position.y;
        loadNrrdSlices.z.index = loadNrrdSlices.z.RSAMaxIndex / 2 + sphereTumour.position.z;
        loadNrrdSlices.x.repaint.call(loadNrrdSlices.x);
        loadNrrdSlices.y.repaint.call(loadNrrdSlices.y);
        loadNrrdSlices.z.repaint.call(loadNrrdSlices.z);

        copperScene.value.scene.add(sphereTumour);
        preTumourSphere.value = sphereTumour;
        allRightPanelMeshes.value.push(sphereTumour);
    }

    /**
     * Removes old meshes from scene and invalidates any in-flight async loads
     */
    function removeOldMeshes() {
        if (!copperScene.value) return;
        // Increment generation so stale async callbacks (GLB/OBJ still loading) self-cancel
        loadGeneration++;
        allRightPanelMeshes.value.forEach((mesh) => {
            // Use removeFromParent() to handle meshes added by copper3d to internal groups
            mesh.removeFromParent();
            copperScene.value!.scene.remove(mesh);
            // Dispose geometry to free GPU memory
            mesh.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    (child as THREE.Mesh).geometry.dispose();
                }
            });
        });
        allRightPanelMeshes.value = [];
        segmentMask3DModel.value = undefined;
        breast3DModel.value = undefined;
        preTumourSphere.value = undefined;
    }

    /**
     * Toggles breast model visibility
     */
    function toggleBreastVisibility(visible: boolean) {
        if (breast3DModel.value) {
            breast3DModel.value.traverse((child) => {
                if ((child as THREE.Mesh).isMesh) {
                    child.visible = visible;
                }
            });
        }
    }

    /**
     * Gets current NRRD meshes and slices
     */
    function getNrrdData() {
        return { loadNrrdMeshes, loadNrrdSlices };
    }

    /**
     * Sets NRRD data references
     */
    function setNrrdData(
        meshes: Copper.nrrdMeshesType,
        slices: Copper.nrrdSliceType,
        imageType: "register" | "origin"
    ) {
        loadNrrdMeshes = meshes;
        loadNrrdSlices = slices;
        if (imageType === "register") {
            registrationMeshes = meshes;
            registrationSlices = slices;
        } else {
            originMeshes = meshes;
            originSlices = slices;
        }
    }

    return {
        allRightPanelMeshes,
        segmentMask3DModel,
        breast3DModel,
        preTumourSphere,
        tumourSliceIndex,
        nippleSphereL,
        nippleSphereR,
        updateNrrdMeshToCopperScene,
        resetSliceIndex,
        loadSegmentMaskMesh,
        loadBreastModel,
        drawPreviewSphere,
        removeOldMeshes,
        toggleBreastVisibility,
        getNrrdData,
        setNrrdData,
    };
}
