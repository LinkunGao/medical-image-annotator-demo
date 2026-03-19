/**
 * Debug GUI Composable
 *
 * @description Manages dat.gui debug panel configuration:
 * - Case switching dropdown
 * - Contrast selection folder
 * - Register/origin toggle
 * - Options folder setup
 *
 * @module composables/left-panel/useDebugGui
 */
import { ref, type Ref } from "vue";
import { GUI, GUIController } from "dat.gui";
import * as Copper from "@/ts/index";
import emitter from "@/plugins/custom-emitter";

/**
 * Interface for GUI dependencies
 */
export interface IGuiDeps {
    gui: Ref<GUI | undefined>;
    allCasesNames: Ref<string[] | undefined>;
    onCaseSwitched: (caseId: string) => Promise<void>;
    onRegistedStateChanged: (isShow: boolean) => Promise<void>;
    onContrastSelected: (flag: boolean, i: number) => void;
    releaseUrls: () => void;
    displaySlicesLength: () => number;
}

/**
 * Composable for debug GUI management
 */
export function useDebugGui(deps: IGuiDeps) {
    const {
        gui,
        allCasesNames,
        onCaseSwitched,
        onRegistedStateChanged,
        onContrastSelected,
        releaseUrls,
        displaySlicesLength,
    } = deps;

    let regCkeckbox: GUIController;
    let selectedContrastFolder: GUI;
    let regCheckboxElement: HTMLInputElement;
    let optsGui: GUI | undefined = undefined;

    const state = {
        showContrast: false,
        switchCase: "",
        showRegisterImages: true,
        release: () => {
            releaseUrls();
        },
    };

    /**
     * Sets up initial GUI configuration
     */
    function setupGui() {
        if (!gui.value || !allCasesNames.value) return;

        state.switchCase = allCasesNames.value[0];

        gui.value
            .add(state, "switchCase", allCasesNames.value)
            .onChange(async (caseId: string) => {
                await onCaseSwitched(caseId);
                setUpGuiAfterLoading();
            });

        selectedContrastFolder = gui.value.addFolder("select display contrast");
    }

    /**
     * Sets up GUI after images are loaded
     */
    function setUpGuiAfterLoading() {
        if (!gui.value) return;

        if (!!optsGui) {
            gui.value.removeFolder(optsGui);
            optsGui = undefined;
            state.showRegisterImages = true;
        }

        optsGui = gui.value.addFolder("opts");
        regCkeckbox = optsGui.add(state, "showRegisterImages");
        regCheckboxElement = regCkeckbox.domElement.childNodes[0] as HTMLInputElement;

        regCkeckbox.onChange(async () => {
            if (regCheckboxElement.disabled) {
                state.showRegisterImages = !state.showRegisterImages;
                return;
            }
            await onRegistedStateChanged(state.showRegisterImages);
        });

        optsGui.add(state, "release");
        optsGui.closed = false;
    }

    /**
     * Updates contrast selection folder
     */
    function updateContrastFolder(selectedState: Record<string, boolean>) {
        if (!selectedContrastFolder) return;

        Copper.removeGuiFolderChilden(selectedContrastFolder);

        const length = displaySlicesLength();
        for (let i = 0; i < length; i++) {
            let name = "";
            i === 0 ? (name = "pre") : (name = "contrast" + i);
            selectedContrastFolder.add(selectedState, name).onChange((flag) => {
                onContrastSelected(flag, i);
            });
        }
    }

    /**
     * Switches register checkbox status
     */
    function switchRegCheckBoxStatus(
        pointerEvents: "none" | "auto",
        opacity: "0.5" | "1"
    ) {
        if (!regCkeckbox) return;

        const checkbox = regCkeckbox.domElement;
        const inputBox = checkbox.childNodes[0] as HTMLInputElement;
        inputBox.disabled = !inputBox.disabled;
        inputBox.readOnly = !inputBox.readOnly;
        checkbox.style.pointerEvents = pointerEvents;
        checkbox.style.opacity = opacity;
    }

    return {
        setupGui,
        setUpGuiAfterLoading,
        updateContrastFolder,
        switchRegCheckBoxStatus,
    };
}
