// One predicate for presentation, active geometry and recovery. Empty owned
// exit switches are not native layers and must never suspend their own frames.
export const NATIVE_LAYER_SELECTOR='dialog[open]:not([data-va-owned]),[aria-modal="true"]:not([data-va-owned]),[popover]:popover-open:not([data-va-owned])';
export const hasNativeLayer=document=>!!document.querySelector(NATIVE_LAYER_SELECTOR);
