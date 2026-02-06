/**
 * Core Segmentation Module Exports
 *
 * Phase 0 - Data Persistence Strategy
 * Phase 2 - Core Data Layer
 * Phase 3 - Tool Abstraction
 * Phase 4 - Rendering Pipeline
 * Phase 5 - Crosshair & Sphere Tools
 * Phase 6 - Tool Coordination
 */

// ===== Phase 0: Data Persistence =====
export { MaskLayerLoader, maskLayerLoader } from './MaskLayerLoader';
export type { MaskDimensions, LoadedLayerData, MaskLoaderAdapter } from './MaskLayerLoader';

export { DebouncedAutoSave, autoSave } from './DebouncedAutoSave';
export type { AutoSaveConfig, SaveDeltaCallback, BeaconSaveCallback } from './DebouncedAutoSave';

// ===== Phase 2: Core Data Layer =====
// Types and Constants
export * from './types';

// MaskLayer - Single layer Uint8Array storage
export { MaskLayer } from './MaskLayer';

// LayerManager - 3 layer management
export { LayerManager, layerManager } from './LayerManager';

// VisibilityManager - Channel visibility control
export { VisibilityManager, visibilityManager } from './VisibilityManager';
export type { VisibilityChangeCallback } from './VisibilityManager';

// UndoManager - Per-layer undo/redo stacks
export { UndoManager, undoManager } from './UndoManager';
export type { UndoManagerConfig, UndoStateCallback } from './UndoManager';

// KeyboardManager - Customizable shortcuts
export { KeyboardManager, keyboardManager, DEFAULT_KEY_BINDINGS } from './KeyboardManager';
export type {
    KeyboardAction,
    MouseWheelBehavior,
    KeyBindings,
    ActionEnabledState,
    KeyboardActionCallback,
} from './KeyboardManager';

// ===== Phase 3: Tool Abstraction =====
export {
    BaseTool,
    PencilTool,
    BrushTool,
    EraserTool,
    PanTool,
    ZoomTool,
    SphereTool,
    SPHERE_COLORS,
    ContrastTool,
} from '../tools';
export type {
    ToolContext,
    ToolName,
    PanAdapter,
    ZoomAdapter,
    SphereType,
    SphereOrigin,
    SphereDecayMode,
    SphereAdapter,
    ContrastAdapter,
} from '../tools';

// ===== Phase 5: Crosshair & Sphere Tools =====
export { CrosshairTool } from '../tools';
export type { CrosshairAdapter } from '../tools';

// ===== Phase 6: Tool Coordination =====
export { ToolCoordinator } from '../tools';
export type {
    GuiTool,
    InteractionType,
    StateChangeCallback,
    ArrowSliceCallback,
    DragSliceCallback,
} from '../tools';

// ===== Phase 4: Rendering Pipeline =====
export { MaskRenderer, buildLayerImageData } from '../rendering/MaskRenderer';
export type { RenderConfig, RenderStats, RenderCallback } from '../rendering/MaskRenderer';

// ===== Phase 7: Integration =====
export { StateManager } from './StateManager';
export type { GUIState, StateChangeListener, PartialStateUpdate } from './StateManager';
