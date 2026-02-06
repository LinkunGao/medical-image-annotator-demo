/**
 * SegmentationManager
 *
 * Phase 7 - Integration
 *
 * Unified entry point for the segmentation module.
 * Manages all core components (LayerManager, VisibilityManager, UndoManager, etc.)
 * and provides backward-compatible API for Vue components.
 *
 * Design Pattern: Dependency Injection
 * - Does not import project-level modules (@/ paths)
 * - Accepts callbacks and adapters for external interactions
 */

import type {
    LayerId,
    AxisType,
    MaskSliceData,
    ExportMaskData,
    ImportMaskData,
    Delta,
    VolumeDimensions,
    ChannelValue,
} from './core/types';

import { LayerManager } from './core/LayerManager';
import { VisibilityManager } from './core/VisibilityManager';
import { UndoManager } from './core/UndoManager';
import { KeyboardManager, type KeyBindings } from './core/KeyboardManager';
import { MaskRenderer } from './rendering/MaskRenderer';
import { ToolCoordinator, type GuiTool } from './tools/ToolCoordinator';

// ===== Adapter Interfaces (Dependency Injection) =====

/**
 * Adapter for rendering operations
 * Project layer provides the canvas contexts
 */
export interface RenderingAdapter {
    /**
     * Get the mask display canvas context
     */
    getMaskDisplayContext(): CanvasRenderingContext2D | null;

    /**
     * Get the drawing layer canvas context (for temporary previews)
     */
    getDrawingContext(): CanvasRenderingContext2D | null;

    /**
     * Get the drawing layer canvas element
     */
    getDrawingCanvas(): HTMLCanvasElement | null;

    /**
     * Request a render frame
     */
    requestRender(): void;
}

/**
 * Adapter for dimension and spacing info
 * Project layer provides NRRD metadata
 */
export interface DimensionAdapter {
    /**
     * Get current image dimensions [width, height, depth]
     */
    getDimensions(): [number, number, number];

    /**
     * Get voxel spacing
     */
    getVoxelSpacing(): number[];

    /**
     * Get space origin
     */
    getSpaceOrigin(): number[];

    /**
     * Get current slice index
     */
    getCurrentSliceIndex(): number;

    /**
     * Get current axis
     */
    getCurrentAxis(): AxisType;

    /**
     * Get size factor (zoom level)
     */
    getSizeFactor(): number;

    /**
     * Get global alpha (transparency)
     */
    getGlobalAlpha(): number;
}

/**
 * Callback for state changes
 */
export type StateChangeCallback = (state: SegmentationState) => void;

/**
 * Current segmentation state (for UI binding)
 */
export interface SegmentationState {
    currentLayer: LayerId;
    currentTool: GuiTool;
    currentChannel: number;
    brushSize: number;
    globalAlpha: number;
    crosshairEnabled: boolean;
    allowedInteractions: Set<string>;
    calculatorTarget: 'tumour' | 'skin' | 'nipple' | 'ribcage';
}

// ===== Main Class =====

/**
 * SegmentationManager - Unified entry point
 *
 * Usage:
 * ```typescript
 * const manager = new SegmentationManager();
 * manager.setRenderingAdapter(renderingAdapter);
 * manager.setDimensionAdapter(dimensionAdapter);
 * manager.initialize([448, 448, 120]);
 * ```
 */
export class SegmentationManager {
    // ===== Core Components =====
    private layerManager: LayerManager;
    private visibilityManager: VisibilityManager;
    private undoManager: UndoManager;
    private keyboardManager: KeyboardManager;
    private renderer: MaskRenderer;
    private coordinator: ToolCoordinator;

    // ===== Adapters (Dependency Injection) =====
    private renderingAdapter: RenderingAdapter | null = null;
    private dimensionAdapter: DimensionAdapter | null = null;

    // ===== Callbacks =====
    private stateChangeCallback: StateChangeCallback | null = null;

    // ===== Internal State =====
    private currentChannel: number = 1;
    private brushSize: number = 15;
    private calculatorTarget: 'tumour' | 'skin' | 'nipple' | 'ribcage' = 'tumour';
    private initialized: boolean = false;

    constructor() {
        // Initialize core components
        this.layerManager = new LayerManager();
        this.visibilityManager = new VisibilityManager();
        this.undoManager = new UndoManager();
        this.keyboardManager = new KeyboardManager();
        this.renderer = new MaskRenderer();
        this.coordinator = new ToolCoordinator();

        // Wire up coordinator callbacks
        this.coordinator.onStateChange = (allowed, guiTool, crosshairEnabled) => {
            this.notifyStateChange();
        };

        this.coordinator.onArrowSlice = (direction) => {
            // Arrow slice is handled externally via callback
            // The project layer will call setCurrentSlice()
        };

        this.coordinator.onDragSlice = (e) => {
            // Drag slice is handled externally via callback
            // The project layer will call setCurrentSlice()
        };
    }

    // ===== Initialization =====

    /**
     * Initialize with dimensions
     * @param dimensions Volume dimensions {width, height, depth}
     */
    initialize(dimensions: VolumeDimensions): void {
        this.layerManager.initialize(dimensions);
        this.initialized = true;
    }

    /**
     * Set rendering adapter (required)
     */
    setRenderingAdapter(adapter: RenderingAdapter): void {
        this.renderingAdapter = adapter;
    }

    /**
     * Set dimension adapter (required)
     */
    setDimensionAdapter(adapter: DimensionAdapter): void {
        this.dimensionAdapter = adapter;
    }

    /**
     * Set state change callback
     */
    onStateChange(callback: StateChangeCallback): void {
        this.stateChangeCallback = callback;
    }

    // ===== Backward-Compatible API =====

    /**
     * Get mask data (backward-compatible with NrrdTools.getMaskData)
     *
     * Returns data in the old format:
     * ```
     * {
     *   label1: [{ sliceIndex, width, height, voxelSpacing, spaceOrigin, data }],
     *   label2: [...],
     *   label3: [...]
     * }
     * ```
     */
    getMaskData(axis?: AxisType): ImportMaskData {
        if (!this.initialized || !this.dimensionAdapter) {
            throw new Error('SegmentationManager not initialized');
        }

        const currentAxis = axis || this.dimensionAdapter.getCurrentAxis();
        const voxelSpacing = this.dimensionAdapter.getVoxelSpacing();
        const spaceOrigin = this.dimensionAdapter.getSpaceOrigin();

        const result: ImportMaskData = {
            layer1: [],
            layer2: [],
            layer3: [],
        };

        // Export all non-empty slices for each layer
        const layers: LayerId[] = ['layer1', 'layer2', 'layer3'];
        layers.forEach((layerId) => {
            const layer = this.layerManager.getLayer(layerId);
            if (!layer) return;

            // Get all slice indices from the layer's internal map
            // We need to access the private slices map, but since we can't,
            // we'll iterate through expected depth range and check for data
            const [width, height, depth] = this.dimensionAdapter!.getDimensions();
            for (let sliceIndex = 0; sliceIndex < depth; sliceIndex++) {
                const sliceData = layer.getSlice(sliceIndex);

                // Check if slice has any non-zero data
                let hasData = false;
                for (let i = 0; i < sliceData.length; i++) {
                    if (sliceData[i] !== 0) {
                        hasData = true;
                        break;
                    }
                }

                if (hasData) {
                    result[layerId].push({
                        layer: layerId,
                        axis: currentAxis,
                        sliceIndex,
                        width,
                        height,
                        voxelSpacing,
                        spaceOrigin,
                        data: Array.from(sliceData),
                    });
                }
            }
        });

        return result;
    }

    /**
     * Set mask data (backward-compatible with NrrdTools.setMasksData)
     *
     * @param masksData Data in the old format
     */
    setMasksData(masksData: ImportMaskData): void {
        if (!this.initialized) {
            throw new Error('SegmentationManager not initialized');
        }

        // Import layer1
        if (masksData.layer1) {
            masksData.layer1.forEach((exportData) => {
                this.importSlice('layer1', exportData);
            });
        }

        // Import layer2
        if (masksData.layer2) {
            masksData.layer2.forEach((exportData) => {
                this.importSlice('layer2', exportData);
            });
        }

        // Import layer3
        if (masksData.layer3) {
            masksData.layer3.forEach((exportData) => {
                this.importSlice('layer3', exportData);
            });
        }

        // Trigger render
        this.requestRender();
    }

    // ===== Internal Helpers =====

    private importSlice(layerId: LayerId, data: ExportMaskData): void {
        const layer = this.layerManager.getLayer(layerId);
        if (!layer) return;

        // Get the slice (creates empty if not exists)
        const sliceData = layer.getSlice(data.sliceIndex);

        // Copy data into the slice
        const sourceData = new Uint8Array(data.data);
        for (let i = 0; i < sourceData.length && i < sliceData.length; i++) {
            sliceData[i] = sourceData[i];
        }
    }

    private requestRender(): void {
        if (this.renderingAdapter) {
            this.renderingAdapter.requestRender();
        }
    }

    private notifyStateChange(): void {
        if (!this.stateChangeCallback) return;

        this.stateChangeCallback({
            currentLayer: this.layerManager.currentLayer,
            currentTool: this.coordinator.getGuiTool(),
            currentChannel: this.currentChannel,
            brushSize: this.brushSize,
            globalAlpha: this.dimensionAdapter?.getGlobalAlpha() || 0.7,
            crosshairEnabled: this.coordinator.isCrosshairEnabled(),
            allowedInteractions: this.coordinator.getAllowed(),
            calculatorTarget: this.calculatorTarget,
        });
    }

    // ===== Public API: Layer Management =====

    /**
     * Set active layer
     */
    setCurrentLayer(layer: LayerId): void {
        this.layerManager.setActiveLayer(layer);
        this.undoManager.setActiveLayer(layer);
        this.notifyStateChange();
    }

    /**
     * Get current layer
     */
    getCurrentLayer(): LayerId {
        return this.layerManager.currentLayer;
    }

    // ===== Public API: Tool Management =====

    /**
     * Set current tool
     */
    setCurrentTool(tool: GuiTool): void {
        this.coordinator.setGuiTool(tool);
        this.notifyStateChange();
    }

    /**
     * Get current tool
     */
    getCurrentTool(): GuiTool {
        return this.coordinator.getGuiTool();
    }

    // ===== Public API: Drawing Parameters =====

    /**
     * Set current channel (color)
     */
    setCurrentChannel(channel: number): void {
        if (channel < 0 || channel > 8) {
            throw new Error('Channel must be between 0 and 8');
        }
        this.currentChannel = channel;
        this.notifyStateChange();
    }

    /**
     * Get current channel
     */
    getCurrentChannel(): number {
        return this.currentChannel;
    }

    /**
     * Set brush size
     */
    setBrushSize(size: number): void {
        if (size < 1 || size > 100) {
            throw new Error('Brush size must be between 1 and 100');
        }
        this.brushSize = size;
        this.notifyStateChange();
    }

    /**
     * Get brush size
     */
    getBrushSize(): number {
        return this.brushSize;
    }

    // ===== Public API: Calculator =====

    /**
     * Set calculator measurement target
     * Phase 7 - Step 9: Syncs calculator target from UI
     */
    setCalculatorTarget(target: 'tumour' | 'skin' | 'nipple' | 'ribcage'): void {
        this.calculatorTarget = target;
        this.notifyStateChange();
    }

    /**
     * Get calculator measurement target
     */
    getCalculatorTarget(): 'tumour' | 'skin' | 'nipple' | 'ribcage' {
        return this.calculatorTarget;
    }

    // ===== Public API: Visibility Management =====

    /**
     * Set layer visibility
     */
    setLayerVisible(layer: LayerId, visible: boolean): void {
        this.visibilityManager.setLayerVisible(layer, visible);
        this.requestRender();
    }

    /**
     * Set channel visibility
     */
    setChannelVisible(layer: LayerId, channel: number, visible: boolean): void {
        if (channel < 0 || channel > 8) {
            throw new Error('Channel must be between 0 and 8');
        }
        this.visibilityManager.setChannelVisible(layer, channel as ChannelValue, visible);
        this.requestRender();
    }

    /**
     * Get layer visibility
     */
    isLayerVisible(layer: LayerId): boolean {
        return this.visibilityManager.isLayerVisible(layer);
    }

    /**
     * Get channel visibility
     */
    isChannelVisible(layer: LayerId, channel: number): boolean {
        if (channel < 0 || channel > 8) {
            throw new Error('Channel must be between 0 and 8');
        }
        return this.visibilityManager.isChannelVisible(layer, channel as ChannelValue);
    }

    // ===== Public API: Undo/Redo =====

    /**
     * Undo last operation
     */
    undo(): void {
        const deltas = this.undoManager.undo();
        if (deltas && deltas.length > 0) {
            this.applyDeltas(deltas, true);
            this.requestRender();
        }
    }

    /**
     * Redo last undone operation
     */
    redo(): void {
        const deltas = this.undoManager.redo();
        if (deltas && deltas.length > 0) {
            this.applyDeltas(deltas, false);
            this.requestRender();
        }
    }

    /**
     * Check if undo is available
     */
    canUndo(): boolean {
        return this.undoManager.canUndo();
    }

    /**
     * Check if redo is available
     */
    canRedo(): boolean {
        return this.undoManager.canRedo();
    }

    private applyDeltas(deltas: Delta[], isUndo: boolean): void {
        deltas.forEach((delta) => {
            const layer = this.layerManager.getLayer(delta.layer);
            if (!layer) return;

            const sliceData = layer.getSlice(delta.slice);
            if (!sliceData) return;

            // Apply delta
            const value = isUndo ? delta.prev : delta.next;
            sliceData[delta.idx] = value;
        });
    }

    // ===== Public API: Keyboard Management =====

    /**
     * Get keyboard bindings
     */
    getKeyBindings(): KeyBindings {
        return this.keyboardManager.getBindings();
    }

    /**
     * Set keyboard binding
     */
    setKeyBinding(action: keyof KeyBindings, key: string): void {
        this.keyboardManager.setBinding(action, key);
    }

    /**
     * Register keyboard events
     */
    registerKeyboard(container: HTMLElement): void {
        this.keyboardManager.register(container);
    }

    /**
     * Unregister keyboard events
     */
    unregisterKeyboard(): void {
        this.keyboardManager.unregister();
    }

    // ===== Public API: Rendering =====

    /**
     * Render current state
     */
    render(): void {
        if (!this.renderingAdapter || !this.dimensionAdapter) {
            throw new Error('Adapters not set');
        }

        const ctx = this.renderingAdapter.getMaskDisplayContext();
        if (!ctx) return;

        this.renderer.render(
            this.layerManager,
            this.visibilityManager,
            this.dimensionAdapter.getCurrentSliceIndex(),
            this.dimensionAdapter.getCurrentAxis(),
            this.dimensionAdapter.getSizeFactor(),
            this.dimensionAdapter.getGlobalAlpha()
        );
    }

    // ===== Public API: ToolCoordinator Delegation =====

    /**
     * Register a tool
     */
    registerTool(name: string, tool: any): void {
        this.coordinator.registerTool(name, tool);
    }

    /**
     * Dispatch pointer down event
     */
    dispatchPointerDown(e: PointerEvent): Delta[] {
        return this.coordinator.dispatchPointerDown(e);
    }

    /**
     * Dispatch pointer move event
     */
    dispatchPointerMove(e: PointerEvent): Delta[] {
        return this.coordinator.dispatchPointerMove(e);
    }

    /**
     * Dispatch pointer up event
     */
    dispatchPointerUp(e: PointerEvent): Delta[] {
        return this.coordinator.dispatchPointerUp(e);
    }

    /**
     * Dispatch wheel event
     */
    dispatchWheel(e: WheelEvent): void {
        this.coordinator.dispatchWheel(e);
    }

    /**
     * Dispatch arrow key event
     */
    dispatchArrowKey(direction: 'up' | 'down'): void {
        this.coordinator.dispatchArrowKey(direction);
    }

    /**
     * Update shift key state
     */
    onShiftChange(pressed: boolean): void {
        this.coordinator.onShiftChange(pressed);
    }

    /**
     * Update ctrl key state
     */
    onCtrlChange(pressed: boolean): void {
        this.coordinator.onCtrlChange(pressed);
    }

    /**
     * Update left button state
     */
    onLeftButtonChange(pressed: boolean): void {
        this.coordinator.onLeftButtonChange(pressed);
    }

    /**
     * Update right button state
     */
    onRightButtonChange(pressed: boolean): void {
        this.coordinator.onRightButtonChange(pressed);
    }

    /**
     * Toggle crosshair mode
     */
    onCrosshairToggle(): void {
        this.coordinator.onCrosshairToggle();
    }

    /**
     * Check if an interaction is allowed
     */
    canUse(interaction: string): boolean {
        return this.coordinator.canUse(interaction as any);
    }

    /**
     * Get all allowed interactions
     */
    getAllowedInteractions(): Set<string> {
        return this.coordinator.getAllowed();
    }

    // ===== Public API: Utility =====

    /**
     * Get dimensions
     */
    getDimensions(): [number, number, number] | VolumeDimensions {
        if (!this.dimensionAdapter) {
            throw new Error('DimensionAdapter not set');
        }
        return this.dimensionAdapter.getDimensions();
    }

    /**
     * Get voxel spacing
     */
    getVoxelSpacing(): number[] {
        if (!this.dimensionAdapter) {
            throw new Error('DimensionAdapter not set');
        }
        return this.dimensionAdapter.getVoxelSpacing();
    }

    /**
     * Get space origin
     */
    getSpaceOrigin(): number[] {
        if (!this.dimensionAdapter) {
            throw new Error('DimensionAdapter not set');
        }
        return this.dimensionAdapter.getSpaceOrigin();
    }

    /**
     * Check if initialized
     */
    isInitialized(): boolean {
        return this.initialized;
    }

    // ===== Public API: Manager Access (for ToolContext) =====

    /**
     * Get the LayerManager (for ToolContext creation)
     */
    getLayerManager(): LayerManager {
        return this.layerManager;
    }

    /**
     * Get the UndoManager (for ToolContext creation)
     */
    getUndoManager(): UndoManager {
        return this.undoManager;
    }

    /**
     * Get the VisibilityManager (for ToolContext creation)
     */
    getVisibilityManager(): VisibilityManager {
        return this.visibilityManager;
    }

    /**
     * Get the KeyboardManager (for ToolContext creation)
     */
    getKeyboardManager(): KeyboardManager {
        return this.keyboardManager;
    }

    /**
     * Get all registered tool names
     */
    getRegisteredTools(): string[] {
        return this.coordinator.getRegisteredTools();
    }

    /**
     * Destroy and cleanup
     */
    destroy(): void {
        this.keyboardManager.unregister();
        this.initialized = false;
    }
}
