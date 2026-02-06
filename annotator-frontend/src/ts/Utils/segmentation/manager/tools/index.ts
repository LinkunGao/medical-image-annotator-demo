/**
 * Tool Module Exports
 *
 * Phase 3 - Tool Abstraction
 * Phase 5 - Crosshair & Sphere Tools
 * Phase 6 - Tool Coordination
 */

// Base Tool
export { BaseTool } from './BaseTool';
export type { ToolContext, ToolName } from './BaseTool';

// Drawing Tools
export { PencilTool } from './PencilTool';
export { BrushTool } from './BrushTool';
export { EraserTool } from './EraserTool';

// Navigation Tools
export { PanTool } from './PanTool';
export type { PanAdapter } from './PanTool';

export { ZoomTool } from './ZoomTool';
export type { ZoomAdapter } from './ZoomTool';

// Crosshair Tool
export { CrosshairTool } from './CrosshairTool';
export type { CrosshairAdapter } from './CrosshairTool';

// Sphere / Calculator Tools
export { SphereTool, SPHERE_COLORS } from './SphereTool';
export type { SphereType, SphereOrigin, SphereDecayMode, SphereAdapter } from './SphereTool';

// Adjustment Tools
export { ContrastTool } from './ContrastTool';
export type { ContrastAdapter } from './ContrastTool';

// Tool Coordinator
export { ToolCoordinator } from './ToolCoordinator';
export type {
    GuiTool,
    InteractionType,
    StateChangeCallback,
    ArrowSliceCallback,
    DragSliceCallback,
} from './ToolCoordinator';
