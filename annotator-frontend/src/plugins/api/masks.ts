import http from "./client";
import {
    IExportMasks,
    IReplaceMask,
    IMaskDeltaRequest,
    IMaskInitLayersRequest,
    IAllMasksResponse,
} from "@/models";
import { decode } from "@msgpack/msgpack";

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
 * Save mask
 * @returns
 */
export async function useSaveMasks(case_id: string | number) {
    const success = http.get<boolean>("/mask/save", { case_id });
    return success;
}

export async function useClearMaskMesh(case_id: string | number) {
    let res = http.get<string>("/clearmesh", { case_id });
    return res;
}

// =============================================================================
// Phase 0 - Data Persistence Strategy: New Mask APIs
// =============================================================================

/**
 * Load all 3 mask layers in a single request (msgpack format)
 * @param caseId - The case ID
 * @returns Promise with decoded mask data for all layers
 */
export async function useGetAllMasks(caseId: string | number): Promise<IAllMasksResponse | null> {
    try {
        const response = await fetch(`/api/mask/all/${caseId}`, {
            method: 'GET',
            headers: {
                'Accept': 'application/msgpack',
            },
        });

        if (!response.ok) {
            console.error(`Failed to load masks: ${response.status}`);
            return null;
        }

        const arrayBuffer = await response.arrayBuffer();
        const decoded = decode(new Uint8Array(arrayBuffer)) as IAllMasksResponse;

        // Convert raw bytes to Uint8Array if present
        return {
            shape: decoded.shape,
            layer1: decoded.layer1 ? new Uint8Array(decoded.layer1) : null,
            layer2: decoded.layer2 ? new Uint8Array(decoded.layer2) : null,
            layer3: decoded.layer3 ? new Uint8Array(decoded.layer3) : null,
        };
    } catch (error) {
        console.error('Error loading all masks:', error);
        return null;
    }
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
        const response = await fetch(`/api/mask/raw/${caseId}/${layerId}`, {
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
): Promise<{ success: boolean; dimensions: number[]; layers_initialized: string[] } | null> {
    try {
        const result = await http.post<{
            success: boolean;
            dimensions: number[];
            layers_initialized: string[]
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
