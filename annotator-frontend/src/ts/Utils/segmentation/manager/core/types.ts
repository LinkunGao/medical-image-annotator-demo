/**
 * Core Segmentation Types
 * 
 * Phase 2 - Core Data Layer
 * 
 * Defines all type interfaces for mask data storage and manipulation
 */

// ===== Layer Types =====
export type LayerId = 'layer1' | 'layer2' | 'layer3';
export type AxisType = 'x' | 'y' | 'z';
export type ChannelValue = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

// ===== Mask Data Types =====

/**
 * Single slice data structure
 */
export interface MaskSliceData {
    sliceIndex: number;
    width: number;
    height: number;
    data: Uint8Array; // length = width * height, values 0-8 represent channels
}

/**
 * Export format for sending to backend
 */
export interface ExportMaskData {
    layer: LayerId;
    axis: AxisType;
    sliceIndex: number;
    width: number;
    height: number;
    voxelSpacing: number[];
    spaceOrigin: number[];
    data: number[]; // Uint8Array converted to number[] for JSON serialization
}

/**
 * Import format from backend
 */
export interface ImportMaskData {
    layer1: ExportMaskData[];
    layer2: ExportMaskData[];
    layer3: ExportMaskData[];
}

// ===== Delta Types (for undo/redo and incremental sync) =====

/**
 * Single voxel change record
 */
export interface Delta {
    layer: LayerId;
    axis: AxisType;
    slice: number;
    idx: number;     // 1D index in original dimensions
    prev: number;    // previous channel value
    next: number;    // new channel value
}

/**
 * Batch of changes for a single operation
 */
export interface DeltaBatch {
    timestamp: number;
    deltas: Delta[];
}

// ===== Color Scheme =====

/**
 * Channel color palette with alpha transparency
 * Channel 0 is transparent (erased)
 * Channels 1-8 are visible with 60% opacity
 */
export const CHANNEL_COLORS: Record<ChannelValue, string> = {
    0: 'rgba(0,0,0,0)',         // Transparent (erased)
    1: 'rgba(0,255,0,0.6)',     // Green
    2: 'rgba(255,0,0,0.6)',     // Red
    3: 'rgba(0,0,255,0.6)',     // Blue
    4: 'rgba(255,255,0,0.6)',   // Yellow
    5: 'rgba(255,0,255,0.6)',   // Magenta
    6: 'rgba(0,255,255,0.6)',   // Cyan
    7: 'rgba(255,128,0,0.6)',   // Orange
    8: 'rgba(128,0,255,0.6)',   // Purple
};

/**
 * RGB values for each channel (for ImageData manipulation)
 */
export const CHANNEL_RGB: Record<ChannelValue, [number, number, number, number]> = {
    0: [0, 0, 0, 0],           // Transparent
    1: [0, 255, 0, 153],       // Green (60% alpha = 0.6 * 255)
    2: [255, 0, 0, 153],       // Red
    3: [0, 0, 255, 153],       // Blue
    4: [255, 255, 0, 153],     // Yellow
    5: [255, 0, 255, 153],     // Magenta
    6: [0, 255, 255, 153],     // Cyan
    7: [255, 128, 0, 153],     // Orange
    8: [128, 0, 255, 153],     // Purple
};

// ===== Configuration Types =====

/**
 * Layer configuration
 */
export interface LayerConfig {
    id: LayerId;
    name: string;
    visible: boolean;
    locked: boolean;
}

/**
 * Default layer configurations
 */
export const DEFAULT_LAYER_CONFIGS: LayerConfig[] = [
    { id: 'layer1', name: 'Layer 1', visible: true, locked: false },
    { id: 'layer2', name: 'Layer 2', visible: true, locked: false },
    { id: 'layer3', name: 'Layer 3', visible: true, locked: false },
];

/**
 * Visibility state for layers and channels
 */
export interface VisibilityState {
    layers: Record<LayerId, boolean>;
    channels: Record<LayerId, boolean[]>; // Each layer has 9 channels (0-8)
}

/**
 * Default visibility state
 */
export const DEFAULT_VISIBILITY_STATE: VisibilityState = {
    layers: {
        layer1: true,
        layer2: true,
        layer3: true,
    },
    channels: {
        layer1: [true, true, true, true, true, true, true, true, true],
        layer2: [true, true, true, true, true, true, true, true, true],
        layer3: [true, true, true, true, true, true, true, true, true],
    },
};

// ===== Utility Types =====

/**
 * Point in 2D space (screen or original coordinates)
 */
export interface Point2D {
    x: number;
    y: number;
}

/**
 * Point in 3D space (voxel coordinates)
 */
export interface Point3D {
    x: number;
    y: number;
    z: number;
}

/**
 * Bounding box for dirty region tracking
 */
export interface BoundingBox {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

/**
 * Volume dimensions
 */
export interface VolumeDimensions {
    width: number;  // X dimension
    height: number; // Y dimension
    depth: number;  // Z dimension (number of slices)
}
