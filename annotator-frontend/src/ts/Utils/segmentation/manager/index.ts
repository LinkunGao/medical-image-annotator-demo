/**
 * Segmentation Module - Main Exports
 *
 * Phase 7 - Integration
 *
 * Unified entry point for the refactored segmentation module
 */

// ===== Main Manager =====
export { SegmentationManager } from './SegmentationManager';
export type {
    RenderingAdapter,
    DimensionAdapter,
    StateChangeCallback as ManagerStateChangeCallback,
    SegmentationState,
} from './SegmentationManager';

// ===== Re-export Core Modules =====
export * from './core';

// ===== Re-export Tools =====
export * from './tools';

// ===== Re-export Rendering =====
export * from './rendering/MaskRenderer';
