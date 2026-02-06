/**
 * UndoManager - Per-Layer Undo/Redo Stack Management
 * 
 * Phase 2 - Core Data Layer
 * 
 * Key Design: Each layer has an independent undo/redo stack.
 * Undo/redo operations only affect the currently active layer.
 */

import type { LayerId, Delta } from './types';

/**
 * Configuration for undo manager
 */
export interface UndoManagerConfig {
    /**
     * Maximum number of undo steps per layer
     * Default: 50
     */
    maxStackSize: number;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: UndoManagerConfig = {
    maxStackSize: 50,
};

/**
 * Callback for stack state changes
 */
export type UndoStateCallback = (canUndo: boolean, canRedo: boolean) => void;

/**
 * UndoManager with per-layer independent stacks
 */
export class UndoManager {
    /**
     * Undo stacks for each layer
     * Each stack contains arrays of deltas (one array per operation)
     */
    private undoStacks: Map<LayerId, Delta[][]> = new Map([
        ['layer1', []],
        ['layer2', []],
        ['layer3', []],
    ]);

    /**
     * Redo stacks for each layer
     */
    private redoStacks: Map<LayerId, Delta[][]> = new Map([
        ['layer1', []],
        ['layer2', []],
        ['layer3', []],
    ]);

    /**
     * Currently active layer
     */
    private activeLayer: LayerId = 'layer1';

    /**
     * Configuration
     */
    private config: UndoManagerConfig;

    /**
     * State change listeners
     */
    private listeners: Set<UndoStateCallback> = new Set();

    constructor(config: Partial<UndoManagerConfig> = {}) {
        this.config = { ...DEFAULT_CONFIG, ...config };
    }

    /**
     * Set the active layer for undo/redo operations
     */
    setActiveLayer(layer: LayerId): void {
        if (this.activeLayer !== layer) {
            this.activeLayer = layer;
            this.notifyListeners();
        }
    }

    /**
     * Get the active layer
     */
    getActiveLayer(): LayerId {
        return this.activeLayer;
    }

    /**
     * Push a batch of deltas onto the undo stack
     * This represents a single undoable operation
     */
    push(deltas: Delta[]): void {
        if (deltas.length === 0) return;

        const stack = this.undoStacks.get(this.activeLayer)!;

        // Add to stack
        stack.push(deltas);

        // Trim if over max size
        while (stack.length > this.config.maxStackSize) {
            stack.shift();
        }

        // Clear redo stack (any redo history is lost when new action is performed)
        this.redoStacks.get(this.activeLayer)!.length = 0;

        this.notifyListeners();
    }

    /**
     * Undo the last operation on the active layer
     * @returns The deltas that were undone, or undefined if nothing to undo
     */
    undo(): Delta[] | undefined {
        const undoStack = this.undoStacks.get(this.activeLayer)!;
        const deltas = undoStack.pop();

        if (deltas) {
            // Move to redo stack
            this.redoStacks.get(this.activeLayer)!.push(deltas);
            this.notifyListeners();
        }

        return deltas;
    }

    /**
     * Redo the last undone operation on the active layer
     * @returns The deltas that were redone, or undefined if nothing to redo
     */
    redo(): Delta[] | undefined {
        const redoStack = this.redoStacks.get(this.activeLayer)!;
        const deltas = redoStack.pop();

        if (deltas) {
            // Move back to undo stack
            this.undoStacks.get(this.activeLayer)!.push(deltas);
            this.notifyListeners();
        }

        return deltas;
    }

    /**
     * Check if undo is available for active layer
     */
    canUndo(): boolean {
        return this.undoStacks.get(this.activeLayer)!.length > 0;
    }

    /**
     * Check if redo is available for active layer
     */
    canRedo(): boolean {
        return this.redoStacks.get(this.activeLayer)!.length > 0;
    }

    /**
     * Get undo stack size for active layer
     */
    getUndoCount(): number {
        return this.undoStacks.get(this.activeLayer)!.length;
    }

    /**
     * Get redo stack size for active layer
     */
    getRedoCount(): number {
        return this.redoStacks.get(this.activeLayer)!.length;
    }

    /**
     * Check if undo is available for a specific layer
     */
    canUndoLayer(layer: LayerId): boolean {
        return this.undoStacks.get(layer)!.length > 0;
    }

    /**
     * Check if redo is available for a specific layer
     */
    canRedoLayer(layer: LayerId): boolean {
        return this.redoStacks.get(layer)!.length > 0;
    }

    /**
     * Clear undo/redo stacks for active layer
     */
    clearActive(): void {
        this.undoStacks.get(this.activeLayer)!.length = 0;
        this.redoStacks.get(this.activeLayer)!.length = 0;
        this.notifyListeners();
    }

    /**
     * Clear undo/redo stacks for a specific layer
     */
    clearLayer(layer: LayerId): void {
        this.undoStacks.get(layer)!.length = 0;
        this.redoStacks.get(layer)!.length = 0;
        if (layer === this.activeLayer) {
            this.notifyListeners();
        }
    }

    /**
     * Clear all undo/redo stacks for all layers
     */
    clearAll(): void {
        for (const layer of ['layer1', 'layer2', 'layer3'] as LayerId[]) {
            this.undoStacks.get(layer)!.length = 0;
            this.redoStacks.get(layer)!.length = 0;
        }
        this.notifyListeners();
    }

    /**
     * Add listener for undo/redo state changes
     */
    addListener(callback: UndoStateCallback): void {
        this.listeners.add(callback);
        // Immediately notify with current state
        callback(this.canUndo(), this.canRedo());
    }

    /**
     * Remove listener
     */
    removeListener(callback: UndoStateCallback): void {
        this.listeners.delete(callback);
    }

    /**
     * Notify listeners of state change
     */
    private notifyListeners(): void {
        const canUndo = this.canUndo();
        const canRedo = this.canRedo();
        for (const listener of this.listeners) {
            listener(canUndo, canRedo);
        }
    }

    /**
     * Get summary of stack sizes for all layers
     */
    getStackSummary(): Record<LayerId, { undo: number; redo: number }> {
        return {
            layer1: {
                undo: this.undoStacks.get('layer1')!.length,
                redo: this.redoStacks.get('layer1')!.length,
            },
            layer2: {
                undo: this.undoStacks.get('layer2')!.length,
                redo: this.redoStacks.get('layer2')!.length,
            },
            layer3: {
                undo: this.undoStacks.get('layer3')!.length,
                redo: this.redoStacks.get('layer3')!.length,
            },
        };
    }
}

// Export singleton instance
export const undoManager = new UndoManager();
