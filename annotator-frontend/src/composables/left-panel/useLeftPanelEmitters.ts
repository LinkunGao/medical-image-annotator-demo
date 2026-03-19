/**
 * Left Panel Emitters Composable
 *
 * @description Manages all event emitter subscriptions for the left panel:
 * - Calculator box events
 * - Debug mode toggle
 * - Theme toggle
 * - Case switching
 * - Contrast changes
 * - Register image changes
 *
 * @module composables/left-panel/useLeftPanelEmitters
 */
import { onUnmounted, type Ref } from "vue";
import emitter from "@/plugins/custom-emitter";

/**
 * Interface for emitter event handlers
 */
export interface IEmitterHandlers {
    onOpenCalculatorBox: () => void;
    onCloseCalculatorBox: () => void;
    onDebugMode: (flag: boolean) => void;
    onToggleAppTheme: () => void;
    onCaseSwitched: (casename: string) => Promise<void>;
    onContrastChanged: (result: { contrastState: boolean; order: number }) => void;
    onRegisterImageChanged: (result: boolean) => Promise<void>;
    onSwitchAnimationStatus?: (payload: { status: "flex" | "none"; text?: string }) => void;
}

/**
 * Composable for managing left panel emitters
 */
export function useLeftPanelEmitters(handlers: IEmitterHandlers) {
    /**
     * Registers all event listeners
     */
    const manageEmitters = () => {
        emitter.on("Common:OpenCalculatorBox", handlers.onOpenCalculatorBox);
        emitter.on("Common:CloseCalculatorBox", handlers.onCloseCalculatorBox);
        emitter.on("Common:DebugMode", handlers.onDebugMode);
        emitter.on("Common:ToggleAppTheme", handlers.onToggleAppTheme);
        emitter.on("Segementation:CaseSwitched", handlers.onCaseSwitched);
        emitter.on("Segmentation:ContrastChanged", handlers.onContrastChanged);
        emitter.on("Segmentation:RegisterImageChanged", handlers.onRegisterImageChanged);
        if (handlers.onSwitchAnimationStatus) {
            emitter.on("Segmentation:SwitchAnimationStatus", handlers.onSwitchAnimationStatus);
        }
    };

    /**
     * Unregisters all event listeners
     */
    const cleanupEmitters = () => {
        emitter.off("Common:OpenCalculatorBox", handlers.onOpenCalculatorBox);
        emitter.off("Common:CloseCalculatorBox", handlers.onCloseCalculatorBox);
        emitter.off("Common:DebugMode", handlers.onDebugMode);
        emitter.off("Common:ToggleAppTheme", handlers.onToggleAppTheme);
        emitter.off("Segementation:CaseSwitched", handlers.onCaseSwitched);
        emitter.off("Segmentation:ContrastChanged", handlers.onContrastChanged);
        emitter.off("Segmentation:RegisterImageChanged", handlers.onRegisterImageChanged);
        if (handlers.onSwitchAnimationStatus) {
            emitter.off("Segmentation:SwitchAnimationStatus", handlers.onSwitchAnimationStatus);
        }
    };

    return {
        manageEmitters,
        cleanupEmitters,
    };
}
