/**
 * KeyboardManager - Customizable Keyboard Shortcut Management
 * 
 * Phase 2 - Core Data Layer
 * 
 * Supports user-customizable key bindings with ability to disable specific shortcuts
 */

/**
 * Keyboard action types
 */
export type KeyboardAction =
    | 'draw'        // Enable drawing mode (Shift by default)
    | 'undo'        // Undo last action (Ctrl+Z)
    | 'redo'        // Redo last undone action (Ctrl+Y)
    | 'crosshair'   // Toggle crosshair mode (S)
    | 'contrast'    // Toggle contrast mode (Ctrl)
    | 'escape';     // Cancel current operation (Escape)

/**
 * Mouse wheel behavior options
 */
export type MouseWheelBehavior = 'Scroll:Zoom' | 'Scroll:Slice';

/**
 * Key bindings configuration
 */
export interface KeyBindings {
    draw: string;           // Key for drawing mode (default: 'Shift')
    undo: string;           // Key for undo (default: 'z', combined with Ctrl)
    redo: string;           // Key for redo (default: 'y', combined with Ctrl)
    crosshair: string;      // Key for crosshair toggle (default: 's')
    contrast: string[];     // Keys for contrast mode (default: ['Control'])
    mouseWheel: MouseWheelBehavior; // Mouse wheel behavior
}

/**
 * Action enabled/disabled state
 */
export interface ActionEnabledState {
    draw: boolean;
    undo: boolean;
    redo: boolean;
    crosshair: boolean;
    contrast: boolean;
}

/**
 * Default key bindings
 */
export const DEFAULT_KEY_BINDINGS: KeyBindings = {
    draw: 'Shift',
    undo: 'z',
    redo: 'y',
    crosshair: 's',
    contrast: ['Control', 'Meta'],
    mouseWheel: 'Scroll:Zoom',
};

/**
 * Default enabled state (all enabled)
 */
const DEFAULT_ENABLED_STATE: ActionEnabledState = {
    draw: true,
    undo: true,
    redo: true,
    crosshair: true,
    contrast: true,
};

/**
 * Callback for keyboard actions
 */
export type KeyboardActionCallback = (action: KeyboardAction, event: KeyboardEvent) => void;

/**
 * Keyboard state tracking
 */
interface KeyState {
    shiftPressed: boolean;
    ctrlPressed: boolean;
    metaPressed: boolean;
    currentKeys: Set<string>;
}

/**
 * KeyboardManager handles keyboard input and maps to actions
 */
export class KeyboardManager {
    /**
     * Current key bindings
     */
    private bindings: KeyBindings;

    /**
     * Action enabled state
     */
    private enabledState: ActionEnabledState;

    /**
     * Registered container element
     */
    private container: HTMLElement | null = null;

    /**
     * Action callback
     */
    private actionCallback: KeyboardActionCallback | null = null;

    /**
     * Key state tracking
     */
    private keyState: KeyState = {
        shiftPressed: false,
        ctrlPressed: false,
        metaPressed: false,
        currentKeys: new Set(),
    };

    /**
     * Bound event handlers (for cleanup)
     */
    private keydownHandler: ((e: KeyboardEvent) => void) | null = null;
    private keyupHandler: ((e: KeyboardEvent) => void) | null = null;
    private blurHandler: (() => void) | null = null;

    constructor(bindings: Partial<KeyBindings> = {}) {
        this.bindings = { ...DEFAULT_KEY_BINDINGS, ...bindings };
        this.enabledState = { ...DEFAULT_ENABLED_STATE };
    }

    /**
     * Set a specific key binding
     */
    setBinding<K extends keyof KeyBindings>(action: K, key: KeyBindings[K]): void {
        this.bindings[action] = key;
    }

    /**
     * Get current key bindings
     */
    getBindings(): KeyBindings {
        return { ...this.bindings };
    }

    /**
     * Set all bindings at once
     */
    setBindings(bindings: Partial<KeyBindings>): void {
        this.bindings = { ...this.bindings, ...bindings };
    }

    /**
     * Enable/disable a specific action
     */
    setActionEnabled(action: keyof ActionEnabledState, enabled: boolean): void {
        this.enabledState[action] = enabled;
    }

    /**
     * Check if an action is enabled
     */
    isActionEnabled(action: keyof ActionEnabledState): boolean {
        return this.enabledState[action];
    }

    /**
     * Set the callback for keyboard actions
     */
    onAction(callback: KeyboardActionCallback): void {
        this.actionCallback = callback;
    }

    /**
     * Register keyboard listeners on a container element
     */
    register(container: HTMLElement): void {
        // Unregister from previous container if any
        this.unregister();

        this.container = container;

        // Create bound handlers
        this.keydownHandler = this.handleKeyDown.bind(this);
        this.keyupHandler = this.handleKeyUp.bind(this);
        this.blurHandler = this.handleBlur.bind(this);

        // Add event listeners
        window.addEventListener('keydown', this.keydownHandler);
        window.addEventListener('keyup', this.keyupHandler);
        window.addEventListener('blur', this.blurHandler);
    }

    /**
     * Unregister keyboard listeners
     */
    unregister(): void {
        if (this.keydownHandler) {
            window.removeEventListener('keydown', this.keydownHandler);
            this.keydownHandler = null;
        }
        if (this.keyupHandler) {
            window.removeEventListener('keyup', this.keyupHandler);
            this.keyupHandler = null;
        }
        if (this.blurHandler) {
            window.removeEventListener('blur', this.blurHandler);
            this.blurHandler = null;
        }
        this.container = null;
        this.resetKeyState();
    }

    /**
     * Handle keydown events
     */
    private handleKeyDown(event: KeyboardEvent): void {
        // Update modifier state
        this.keyState.shiftPressed = event.shiftKey;
        this.keyState.ctrlPressed = event.ctrlKey;
        this.keyState.metaPressed = event.metaKey;
        this.keyState.currentKeys.add(event.key);

        // Check for actions
        this.processKeyEvent(event, 'down');
    }

    /**
     * Handle keyup events
     */
    private handleKeyUp(event: KeyboardEvent): void {
        // Update modifier state
        this.keyState.shiftPressed = event.shiftKey;
        this.keyState.ctrlPressed = event.ctrlKey;
        this.keyState.metaPressed = event.metaKey;
        this.keyState.currentKeys.delete(event.key);

        // Check for actions
        this.processKeyEvent(event, 'up');
    }

    /**
     * Handle window blur (reset all keys)
     */
    private handleBlur(): void {
        this.resetKeyState();
    }

    /**
     * Reset key state
     */
    private resetKeyState(): void {
        this.keyState = {
            shiftPressed: false,
            ctrlPressed: false,
            metaPressed: false,
            currentKeys: new Set(),
        };
    }

    /**
     * Process a keyboard event and trigger appropriate action
     */
    private processKeyEvent(event: KeyboardEvent, direction: 'down' | 'up'): void {
        if (!this.actionCallback) return;

        const key = event.key.toLowerCase();
        const isCtrl = event.ctrlKey || event.metaKey;

        // Draw mode (Shift key)
        if (this.enabledState.draw && event.key === this.bindings.draw) {
            this.actionCallback('draw', event);
            return;
        }

        // Undo (Ctrl+Z)
        if (this.enabledState.undo &&
            direction === 'down' &&
            isCtrl &&
            key === this.bindings.undo.toLowerCase()) {
            event.preventDefault();
            this.actionCallback('undo', event);
            return;
        }

        // Redo (Ctrl+Y or Ctrl+Shift+Z)
        if (this.enabledState.redo &&
            direction === 'down' &&
            isCtrl &&
            key === this.bindings.redo.toLowerCase()) {
            event.preventDefault();
            this.actionCallback('redo', event);
            return;
        }

        // Crosshair toggle (S key)
        if (this.enabledState.crosshair &&
            direction === 'down' &&
            key === this.bindings.crosshair.toLowerCase()) {
            this.actionCallback('crosshair', event);
            return;
        }

        // Contrast mode (Ctrl key)
        if (this.enabledState.contrast &&
            this.bindings.contrast.includes(event.key)) {
            this.actionCallback('contrast', event);
            return;
        }

        // Escape
        if (direction === 'down' && event.key === 'Escape') {
            this.actionCallback('escape', event);
            return;
        }
    }

    /**
     * Get current key state
     */
    getKeyState(): KeyState {
        return { ...this.keyState, currentKeys: new Set(this.keyState.currentKeys) };
    }

    /**
     * Check if shift is pressed
     */
    isShiftPressed(): boolean {
        return this.keyState.shiftPressed;
    }

    /**
     * Check if ctrl (or meta on Mac) is pressed
     */
    isCtrlPressed(): boolean {
        return this.keyState.ctrlPressed || this.keyState.metaPressed;
    }

    /**
     * Check if a specific key is currently pressed
     */
    isKeyPressed(key: string): boolean {
        return this.keyState.currentKeys.has(key);
    }

    /**
     * Get mouse wheel behavior setting
     */
    getMouseWheelBehavior(): MouseWheelBehavior {
        return this.bindings.mouseWheel;
    }

    /**
     * Set mouse wheel behavior
     */
    setMouseWheelBehavior(behavior: MouseWheelBehavior): void {
        this.bindings.mouseWheel = behavior;
    }

    /**
     * Toggle mouse wheel behavior
     */
    toggleMouseWheelBehavior(): MouseWheelBehavior {
        this.bindings.mouseWheel =
            this.bindings.mouseWheel === 'Scroll:Zoom' ? 'Scroll:Slice' : 'Scroll:Zoom';
        return this.bindings.mouseWheel;
    }
}

// Export singleton instance
export const keyboardManager = new KeyboardManager();
