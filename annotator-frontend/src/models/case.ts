interface IInput {
    contrast_pre: string;
    contrast_1: string;
    contrast_2: string;
    contrast_3: string;
    contrast_4: string;
    registration_pre: string;
    registration_1: string;
    registration_2: string;
    registration_3: string;
    registration_4: string;
}

interface IOutput {
    mask_meta_json_path: string;
    mask_meta_json_size: string | number;
    mask_obj_path: string;
    mask_obj_size: string | number;
    mask_glb_path: string;
    mask_glb_size: string | number;
    // Phase 4/5: NIfTI mask layer paths and sizes
    mask_layer1_nii_path?: string;
    mask_layer1_nii_size?: string | number;
    mask_layer2_nii_path?: string;
    mask_layer2_nii_size?: string | number;
    mask_layer3_nii_path?: string;
    mask_layer3_nii_size?: string | number;
}

export interface IDetails {
    id: string | number;
    name: string;
    assay_uuid: string;
    input: IInput;
    output: IOutput;
    masked?: boolean;
    file_paths?: {
        registration_nrrd_paths: string[];
        origin_nrrd_paths: string[];
        segmentation_manual_mask_paths: string[];
    };
}

export interface INrrdCaseNames {
    names: string[];
    details: Array<IDetails>;
    [proName: string]: any;
}

export interface ICaseUrls {
    nrrdUrls: Array<string>;
    jsonUrl?: string;
}

export interface ICaseRegUrls {
    nrrdUrls: Array<string>;
}

export interface ICaseDetails {
    currentCaseName: string;
    currentCaseId: string;
    details: Array<IDetails>;
    maskNrrd: string;
}

export interface ILoadUrls {
    [proName: string]: any;
}
