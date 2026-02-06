/**
 * StateManager
 *
 * Phase 7 - Integration
 *
 * Centralized state management for GUI components.
 * Replaces the scattered `guiSettings.guiState` / `guiSetting.onChange()` pattern
 * with a type-safe, reactive state management system.
 *
 * Design Pattern: Observer + Reactive State
 * - Provides type-safe state update methods
 * - Notifies subscribers on state changes
 * - Decouples Vue components from internal implementation
 */

import type { LayerId } from './types';
import type { GuiTool } from '../tools/ToolCoordinator';

// ===== State Types =====

/**
 * Complete GUI state
 */
export interface GUIState {
    // === Tool Selection ===
    currentTool: GuiTool;
    currentLayer: LayerId;
    currentChannel: number; // 0-8

    // === Drawing Parameters ===
    brushSize: number; // 1-100
    globalAlpha: number; // 0.1-1.0
    segmentation: boolean; // Pencil mode (true) or Brush mode (false)

    // === Tool-Specific States ===
    sphere: boolean; // Sphere tool enabled
    calculator: boolean; // Calculator tool enabled
    eraser: boolean; // Eraser mode

    // === Calculator Sub-State ===
    calculatorTarget: 'tumour' | 'skin' | 'nipple' | 'ribcage';

    // === Contrast Adjustment ===
    windowCenter: number;
    windowWidth: number;

    // === Zoom & Navigation ===
    sizeFactor: number; // 1.0-8.0
    mainAreaSize: number;
    dragSensitivity: number;

    // === Colors ===
    fillColor: string;
    brushColor: string;
    lineWidth: number;

    // === Cursor ===
    cursor: string;
    defaultPaintCursor: string;
}

/**
 * State change listener
 */
export type StateChangeListener = (state: Readonly<GUIState>) => void;

/**
 * Partial state update
 */
export type PartialStateUpdate = Partial<GUIState>;

// ===== Main Class =====

/**
 * StateManager - Centralized GUI state management
 *
 * Usage:
 * ```typescript
 * const stateManager = new StateManager();
 * stateManager.subscribe((state) => {
 *   console.log('State changed:', state);
 * });
 * stateManager.setCurrentTool('brush');
 * ```
 */
export class StateManager {
    // ===== Internal State =====
    private state: GUIState;
    private listeners: Set<StateChangeListener> = new Set();

    constructor(initialState?: Partial<GUIState>) {
        // Initialize with default values
        this.state = {
            currentTool: 'pencil',
            currentLayer: 'layer1',
            currentChannel: 1,
            brushSize: 15,
            globalAlpha: 0.7,
            segmentation: true,
            sphere: false,
            calculator: false,
            eraser: false,
            calculatorTarget: 'tumour',
            windowCenter: 0,
            windowWidth: 1,
            sizeFactor: 1.0,
            mainAreaSize: 1,
            dragSensitivity: 1,
            fillColor: 'rgba(0,255,0,0.6)',
            brushColor: 'rgba(0,255,0,0.6)',
            lineWidth: 2,
            cursor: 'default',
            defaultPaintCursor: 'crosshair',
            ...initialState,
        };
    }

    // ===== Subscription API =====

    /**
     * Subscribe to state changes
     * @returns Unsubscribe function
     */
    subscribe(listener: StateChangeListener): () => void {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * Notify all listeners
     */
    private notify(): void {
        const frozenState = Object.freeze({ ...this.state });
        this.listeners.forEach((listener) => listener(frozenState));
    }

    // ===== State Access =====

    /**
     * Get current state (read-only)
     */
    getState(): Readonly<GUIState> {
        return Object.freeze({ ...this.state });
    }

    /**
     * Get a specific state property
     */
    get<K extends keyof GUIState>(key: K): GUIState[K] {
        return this.state[key];
    }

    // ===== State Updates =====

    /**
     * Update multiple state properties at once
     */
    setState(updates: PartialStateUpdate): void {
        Object.assign(this.state, updates);
        this.notify();
    }

    /**
     * Update a single state property
     */
    set<K extends keyof GUIState>(key: K, value: GUIState[K]): void {
        if (this.state[key] === value) return; // Skip if no change
        this.state[key] = value;
        this.notify();
    }

    // ===== Tool Selection Methods =====

    /**
     * Set current tool
     */
    setCurrentTool(tool: GuiTool): void {
        this.state.currentTool = tool;

        // Update related flags
        switch (tool) {
            case 'pencil':
                this.state.segmentation = true;
                this.state.sphere = false;
                this.state.calculator = false;
                this.state.eraser = false;
                break;
            case 'brush':
                this.state.segmentation = false;
                this.state.sphere = false;
                this.state.calculator = false;
                this.state.eraser = false;
                break;
            case 'eraser':
                this.state.segmentation = false;
                this.state.sphere = false;
                this.state.calculator = false;
                this.state.eraser = true;
                break;
            case 'sphere':
                this.state.segmentation = false;
                this.state.sphere = true;
                this.state.calculator = false;
                this.state.eraser = false;
                break;
            case 'calculator':
                this.state.segmentation = false;
                this.state.sphere = false;
                this.state.calculator = true;
                this.state.eraser = false;
                break;
        }

        this.notify();
    }

    /**
     * Get current tool
     */
    getCurrentTool(): GuiTool {
        return this.state.currentTool;
    }

    // ===== Layer Selection Methods =====

    /**
     * Set current layer
     */
    setCurrentLayer(layer: LayerId): void {
        this.state.currentLayer = layer;
        this.notify();
    }

    /**
     * Get current layer
     */
    getCurrentLayer(): LayerId {
        return this.state.currentLayer;
    }

    // ===== Channel (Color) Methods =====

    /**
     * Set current channel
     */
    setCurrentChannel(channel: number): void {
        if (channel < 0 || channel > 8) {
            throw new Error('Channel must be between 0 and 8');
        }
        this.state.currentChannel = channel;
        this.updateColorsFromChannel(channel);
        this.notify();
    }

    /**
     * Get current channel
     */
    getCurrentChannel(): number {
        return this.state.currentChannel;
    }

    /**
     * Update fill/brush colors based on channel
     */
    private updateColorsFromChannel(channel: number): void {
        const channelColors: Record<number, string> = {
            0: 'rgba(0,0,0,0)',
            1: 'rgba(0,255,0,0.6)',
            2: 'rgba(255,0,0,0.6)',
            3: 'rgba(0,0,255,0.6)',
            4: 'rgba(255,255,0,0.6)',
            5: 'rgba(255,0,255,0.6)',
            6: 'rgba(0,255,255,0.6)',
            7: 'rgba(255,128,0,0.6)',
            8: 'rgba(128,0,255,0.6)',
        };

        const color = channelColors[channel] || channelColors[1];
        this.state.fillColor = color;
        this.state.brushColor = color;
    }

    // ===== Drawing Parameters Methods =====

    /**
     * Set brush size
     */
    setBrushSize(size: number): void {
        if (size < 1 || size > 100) {
            throw new Error('Brush size must be between 1 and 100');
        }
        this.state.brushSize = size;
        this.notify();
    }

    /**
     * Get brush size
     */
    getBrushSize(): number {
        return this.state.brushSize;
    }

    /**
     * Set global alpha (transparency)
     */
    setGlobalAlpha(alpha: number): void {
        if (alpha < 0.1 || alpha > 1.0) {
            throw new Error('Global alpha must be between 0.1 and 1.0');
        }
        this.state.globalAlpha = alpha;
        this.notify();
    }

    /**
     * Get global alpha
     */
    getGlobalAlpha(): number {
        return this.state.globalAlpha;
    }

    // ===== Calculator Methods =====

    /**
     * Set calculator target
     */
    setCalculatorTarget(target: 'tumour' | 'skin' | 'nipple' | 'ribcage'): void {
        this.state.calculatorTarget = target;

        // Update channel based on calculator target
        const targetChannelMap: Record<typeof target, number> = {
            tumour: 1, // Green
            skin: 2, // Red
            nipple: 3, // Blue
            ribcage: 4, // Yellow
        };

        this.setCurrentChannel(targetChannelMap[target]);
    }

    /**
     * Get calculator target
     */
    getCalculatorTarget(): 'tumour' | 'skin' | 'nipple' | 'ribcage' {
        return this.state.calculatorTarget;
    }

    // ===== Contrast Methods =====

    /**
     * Set window center
     */
    setWindowCenter(center: number): void {
        this.state.windowCenter = center;
        this.notify();
    }

    /**
     * Get window center
     */
    getWindowCenter(): number {
        return this.state.windowCenter;
    }

    /**
     * Set window width
     */
    setWindowWidth(width: number): void {
        if (width < 1) {
            throw new Error('Window width must be at least 1');
        }
        this.state.windowWidth = width;
        this.notify();
    }

    /**
     * Get window width
     */
    getWindowWidth(): number {
        return this.state.windowWidth;
    }

    // ===== Zoom Methods =====

    /**
     * Set size factor (zoom level)
     */
    setSizeFactor(factor: number): void {
        if (factor < 1.0 || factor > 8.0) {
            throw new Error('Size factor must be between 1.0 and 8.0');
        }
        this.state.sizeFactor = factor;
        this.notify();
    }

    /**
     * Get size factor
     */
    getSizeFactor(): number {
        return this.state.sizeFactor;
    }

    /**
     * Reset zoom to 1.0
     */
    resetZoom(): void {
        this.setSizeFactor(1.0);
    }

    // ===== Cursor Methods =====

    /**
     * Set cursor style
     */
    setCursor(cursor: string): void {
        this.state.cursor = cursor;
        this.notify();
    }

    /**
     * Get cursor style
     */
    getCursor(): string {
        return this.state.cursor;
    }

    /**
     * Reset cursor to default
     */
    resetCursor(): void {
        this.state.cursor = this.state.defaultPaintCursor;
        this.notify();
    }

    // ===== Utility Methods =====

    /**
     * Reset to default state
     */
    reset(): void {
        this.state = {
            currentTool: 'pencil',
            currentLayer: 'layer1',
            currentChannel: 1,
            brushSize: 15,
            globalAlpha: 0.7,
            segmentation: true,
            sphere: false,
            calculator: false,
            eraser: false,
            calculatorTarget: 'tumour',
            windowCenter: 0,
            windowWidth: 1,
            sizeFactor: 1.0,
            mainAreaSize: 1,
            dragSensitivity: 1,
            fillColor: 'rgba(0,255,0,0.6)',
            brushColor: 'rgba(0,255,0,0.6)',
            lineWidth: 2,
            cursor: 'default',
            defaultPaintCursor: 'crosshair',
        };
        this.notify();
    }

    /**
     * Export state as plain object (for persistence)
     */
    export(): GUIState {
        return { ...this.state };
    }

    /**
     * Import state from plain object (for restoration)
     */
    import(state: Partial<GUIState>): void {
        this.setState(state);
    }

    /**
     * Clear all listeners
     */
    clearListeners(): void {
        this.listeners.clear();
    }
}
