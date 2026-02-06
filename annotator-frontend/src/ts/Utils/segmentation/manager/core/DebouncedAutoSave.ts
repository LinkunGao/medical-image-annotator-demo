/**
 * DebouncedAutoSave - Batched Delta Change Auto-Save
 *
 * Phase 0 - Data Persistence Strategy
 *
 * Collects delta changes per layer and saves them in batches.
 * Uses dependency injection for the save operation (no project-level imports).
 */

import type { LayerId, Delta } from './types';

// ===== Configuration =====

/**
 * Auto-save configuration
 */
export interface AutoSaveConfig {
    /** Debounce time in milliseconds (default: 500) */
    debounceMs?: number;
    /** Maximum batch size before forced save (default: 1000) */
    maxBatchSize?: number;
}

/**
 * Callback type for save operation.
 * The project layer provides the actual API implementation.
 */
export type SaveDeltaCallback = (
    layerId: LayerId,
    changes: Delta[]
) => Promise<void>;

/**
 * Callback type for sendBeacon-style save (for beforeUnload).
 * Should be a synchronous or fire-and-forget operation.
 */
export type BeaconSaveCallback = (
    layerId: LayerId,
    changes: Delta[]
) => void;

/**
 * DebouncedAutoSave collects delta changes and saves them in batches.
 *
 * Usage:
 *   const autoSave = new DebouncedAutoSave({ debounceMs: 500 });
 *   autoSave.setSaveCallback(async (layerId, changes) => {
 *       await api.applyMaskDelta({ caseId, layer: layerId, changes });
 *   });
 *   autoSave.addChange(delta);
 */
export class DebouncedAutoSave {
    private pendingChanges: Map<LayerId, Delta[]> = new Map();
    private debounceTimers: Map<LayerId, ReturnType<typeof setTimeout>> = new Map();
    private config: Required<AutoSaveConfig>;

    private saveFn: SaveDeltaCallback | null = null;
    private beaconFn: BeaconSaveCallback | null = null;

    private _saving: boolean = false;

    constructor(config?: AutoSaveConfig) {
        this.config = {
            debounceMs: config?.debounceMs ?? 500,
            maxBatchSize: config?.maxBatchSize ?? 1000,
        };
    }

    /**
     * Set the save callback for normal debounced saves.
     */
    setSaveCallback(fn: SaveDeltaCallback): void {
        this.saveFn = fn;
    }

    /**
     * Set the beacon callback for beforeUnload saves.
     * This should use navigator.sendBeacon or similar fire-and-forget mechanism.
     */
    setBeaconCallback(fn: BeaconSaveCallback): void {
        this.beaconFn = fn;
    }

    /**
     * Add a single delta change.
     * Changes are collected per layer and saved after debounce timeout.
     */
    addChange(delta: Delta): void {
        const layerId = delta.layer;

        // Initialize pending array for layer if needed
        if (!this.pendingChanges.has(layerId)) {
            this.pendingChanges.set(layerId, []);
        }

        const pending = this.pendingChanges.get(layerId)!;
        pending.push(delta);

        // Force save if max batch size reached
        if (pending.length >= this.config.maxBatchSize) {
            this.flushLayer(layerId);
            return;
        }

        // Reset debounce timer
        this.resetTimer(layerId);
    }

    /**
     * Add multiple delta changes at once.
     */
    addChanges(deltas: Delta[]): void {
        for (const delta of deltas) {
            this.addChange(delta);
        }
    }

    /**
     * Flush pending changes for a specific layer immediately.
     */
    async flushLayer(layerId: LayerId): Promise<void> {
        // Clear timer
        const timer = this.debounceTimers.get(layerId);
        if (timer) {
            clearTimeout(timer);
            this.debounceTimers.delete(layerId);
        }

        // Get and clear pending changes
        const changes = this.pendingChanges.get(layerId);
        if (!changes || changes.length === 0) return;

        this.pendingChanges.set(layerId, []);

        // Save
        if (this.saveFn) {
            this._saving = true;
            try {
                await this.saveFn(layerId, changes);
            } catch (error) {
                console.error(`DebouncedAutoSave: Failed to save ${layerId}:`, error);
                // Re-queue failed changes
                const current = this.pendingChanges.get(layerId) ?? [];
                this.pendingChanges.set(layerId, [...changes, ...current]);
            } finally {
                this._saving = false;
            }
        }
    }

    /**
     * Flush all pending changes for all layers.
     */
    async flushAll(): Promise<void> {
        const layers: LayerId[] = ['layer1', 'layer2', 'layer3'];
        await Promise.all(layers.map(layerId => this.flushLayer(layerId)));
    }

    /**
     * Handle beforeUnload event - uses beacon callback for reliability.
     * Call this in the window 'beforeunload' event handler.
     */
    beforeUnload(): void {
        const callback = this.beaconFn ?? this.saveFn;
        if (!callback) return;

        const layers: LayerId[] = ['layer1', 'layer2', 'layer3'];
        for (const layerId of layers) {
            const changes = this.pendingChanges.get(layerId);
            if (changes && changes.length > 0) {
                if (this.beaconFn) {
                    this.beaconFn(layerId, changes);
                }
                this.pendingChanges.set(layerId, []);
            }
        }

        // Clear all timers
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
    }

    /**
     * Get count of pending changes for a layer
     */
    getPendingCount(layerId: LayerId): number {
        return this.pendingChanges.get(layerId)?.length ?? 0;
    }

    /**
     * Get total pending changes across all layers
     */
    getTotalPendingCount(): number {
        let total = 0;
        for (const changes of this.pendingChanges.values()) {
            total += changes.length;
        }
        return total;
    }

    /**
     * Check if currently saving
     */
    get saving(): boolean {
        return this._saving;
    }

    /**
     * Check if there are any pending changes
     */
    get hasPendingChanges(): boolean {
        return this.getTotalPendingCount() > 0;
    }

    /**
     * Dispose: flush all and clean up timers
     */
    async dispose(): Promise<void> {
        await this.flushAll();
        for (const timer of this.debounceTimers.values()) {
            clearTimeout(timer);
        }
        this.debounceTimers.clear();
        this.pendingChanges.clear();
    }

    // ===== Private helpers =====

    private resetTimer(layerId: LayerId): void {
        // Clear existing timer
        const existing = this.debounceTimers.get(layerId);
        if (existing) {
            clearTimeout(existing);
        }

        // Set new debounce timer
        const timer = setTimeout(() => {
            this.debounceTimers.delete(layerId);
            this.flushLayer(layerId);
        }, this.config.debounceMs);

        this.debounceTimers.set(layerId, timer);
    }
}

// Export singleton instance
export const autoSave = new DebouncedAutoSave();
