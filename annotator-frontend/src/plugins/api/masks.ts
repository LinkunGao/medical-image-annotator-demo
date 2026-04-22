import http from "./client";
import { getApiBaseUrl } from "./getBaseUrl";
import {
    IExportMasks,
    IReplaceMask,
    IMaskDeltaRequest,
    IMaskInitLayersRequest,
    IAllMasksResponse,
} from "@/models";

/**
 * init the mask data in backend (legacy JSON format)
 * @param body
 * @returns
 */
export async function useInitMasks(body: IExportMasks) {
    const success = http.post<boolean>("/mask/init", body);
    return success;
}

/**
 * replace the specific mask (legacy JSON format)
 * @param body
 * @returns
 */
export async function useReplaceMask(body: IReplaceMask) {
    const success = http.post<boolean>("/mask/replace", body);
    return success;
}

/**
 * Save mask - Convert NIfTI mask layer to OBJ 3D mesh
 * @param case_id - The case ID
 * @param layer_id - The layer to convert ('layer1', 'layer2', or 'layer3'), defaults to 'layer1'
 * @returns Promise with success status
 */
export async function useSaveMasks(
    case_id: string | number,
    layer_id: 'layer1' | 'layer2' | 'layer3' | 'layer4' = 'layer1'
) {
    const result = http.get<{ success: boolean; message: string; layer_id: string }>(
        "/mask/save-gltf",
        { case_id, layer_id }
    );
    return result;
}

export async function useClearMaskMesh(case_id: string | number) {
    let res = http.get<string>("/clearmesh", { case_id });
    return res;
}



/**
 * Get raw NIfTI data for a specific layer
 * @param caseId - The case ID
 * @param layerId - The layer ID ('layer1', 'layer2', or 'layer3')
 * @returns Promise with raw ArrayBuffer of NIfTI data
 */
export async function useGetMaskRaw(
    caseId: string | number,
    layerId: 'layer1' | 'layer2' | 'layer3'
): Promise<ArrayBuffer | null> {
    try {
        const response = await fetch(`${getApiBaseUrl()}/mask/raw/${caseId}/${layerId}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/octet-stream',
            },
        });

        if (!response.ok) {
            console.error(`Failed to load raw mask: ${response.status}`);
            return null;
        }

        return await response.arrayBuffer();
    } catch (error) {
        console.error(`Error loading raw mask for ${layerId}:`, error);
        return null;
    }
}

/**
 * Apply incremental delta updates to a specific layer
 * @param delta - The delta changes to apply
 * @returns Promise with success status and changes applied count
 */
export async function useApplyMaskDelta(
    delta: IMaskDeltaRequest
): Promise<{ success: boolean; changesApplied: number } | null> {
    try {
        const result = await http.post<{ success: boolean; changesApplied: number }>(
            "/mask/delta",
            delta
        );
        return result;
    } catch (error) {
        console.error('Error applying mask delta:', error);
        return null;
    }
}

/**
 * Initialize empty NIfTI mask files for a new case
 * @param request - The initialization request with dimensions
 * @returns Promise with success status
 */
export async function useInitMaskLayers(
    request: IMaskInitLayersRequest
): Promise<{ success: boolean; dimensions: number[]; layer_initialized: string; file_size: number } | null> {
    try {
        const result = await http.post<{
            success: boolean;
            dimensions: number[];
            layer_initialized: string;
            file_size: number;
        }>("/mask/init-layers", request);
        return result;
    } catch (error) {
        console.error('Error initializing mask layers:', error);
        return null;
    }
}

/**
 * Create a WebSocket connection for real-time mask updates
 * @param caseId - The case ID
 * @param onMessage - Callback for incoming mask data
 * @returns WebSocket instance
 */
export function createMaskWebSocket(
    caseId: string | number,
    onMessage: (data: Uint8Array) => void
): WebSocket {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const ws = new WebSocket(`${protocol}//${host}/ws/mask/${caseId}`);

    ws.binaryType = 'arraybuffer';

    ws.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
            onMessage(new Uint8Array(event.data));
        }
    };

    ws.onerror = (error) => {
        console.error('Mask WebSocket error:', error);
    };

    return ws;
}
