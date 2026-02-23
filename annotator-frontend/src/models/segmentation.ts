import * as Copper from "copper3d";
import * as THREE from "three";

export interface IExportMask {
    caseName?: string;
    sliceIndex?: number;
    dataFormat?: string;
    width?: number;
    height?: number;
    voxelSpacing?: number[];
    spaceOrigin?: number[];
    data?: number[];
    [proName: string]: any;
}

export interface IStoredMasks {
    label1: IExportMask[];
    label2: IExportMask[];
    label3: IExportMask[];
    hasData: false;
}

export interface IExportMasks {
    caseId: string | number;
    masks: IStoredMasks;
}

export interface IReplaceMask {
    caseId: string | number;
    sliceIndex: number;
    layerId: string;
    channelId: number;
    axis: "x" | "y" | "z";
    sliceData: number[];
    width: number;
    height: number;
}

export interface ITumourPositionNNMask {
    caseId: string | number;
    position: Array<number>;
}

export interface IMaskTumourObjData {
    maskTumourObjUrl?: string;
    meshVolume?: number;
}

export interface ILoadedMeshes {
    x: THREE.Mesh;
    y: THREE.Mesh;
    z: THREE.Mesh;
    order: number;
}

export interface ILeftRightData {
    maskNrrdMeshes: Copper.nrrdMeshesType;
    maskSlices: Copper.nrrdSliceType;
    url: string;
    register: boolean;
}

// =============================================================================
// Phase 0 - Data Persistence Strategy: New Interfaces
// =============================================================================

/**
 * Single voxel change in a mask layer
 */
export interface IMaskDeltaChange {
    x: number;      // voxel X coordinate
    y: number;      // voxel Y coordinate
    z: number;      // voxel Z coordinate (slice index)
    value: number;  // channel value (0-8, where 0 = transparent)
}

/**
 * Request for incremental mask updates
 */
export interface IMaskDeltaRequest {
    caseId: string | number;
    layer: 'layer1' | 'layer2' | 'layer3';
    changes: IMaskDeltaChange[];
}

/**
 * Request for initializing empty masks for a new case
 */
export interface IMaskInitLayersRequest {
    caseId: string | number;
    layerId: string;
    dimensions: [number, number, number];  // [width, height, depth]
    voxelSpacing?: [number, number, number];
    spaceOrigin?: [number, number, number];
}

/**
 * Response from /api/mask/all endpoint (msgpack decoded)
 */
export interface IAllMasksResponse {
    shape: number[] | null;
    layer1: Uint8Array | null;
    layer2: Uint8Array | null;
    layer3: Uint8Array | null;
}

/**
 * Layer-specific output paths from backend
 */
export interface ILayerOutput {
    // Config.OUTPUTS[0]: mask-meta-json
    mask_meta_json_path: string | null;
    mask_meta_json_size: number | null;
    // Config.OUTPUTS[1-3]: mask-layer*-nii
    mask_layer1_nii_path: string | null;
    mask_layer1_nii_size: number | null;
    mask_layer2_nii_path: string | null;
    mask_layer2_nii_size: number | null;
    mask_layer3_nii_path: string | null;
    mask_layer3_nii_size: number | null;
    // Config.OUTPUTS[4]: mask-obj
    mask_obj_path: string | null;
    mask_obj_size: number | null;
}

/**
 * Layer loading status
 */
export type LayerId = string;

export interface ILayerStatus {
    layer: LayerId;
    loaded: boolean;
    hasData: boolean;
    size: number;
}
