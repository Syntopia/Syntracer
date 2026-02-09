export const RENDER_MODES = Object.freeze({
  PATHTRACING: "pathtracing",
  PREVIEW: "preview"
});

export function modeLabel(mode) {
  return mode === RENDER_MODES.PREVIEW ? "Preview (Raster)" : "Pathtracing";
}

export function createRenderModeController(initialMode = RENDER_MODES.PATHTRACING) {
  let mode = initialMode === RENDER_MODES.PREVIEW ? RENDER_MODES.PREVIEW : RENDER_MODES.PATHTRACING;

  return {
    getMode() {
      return mode;
    },
    isPreview() {
      return mode === RENDER_MODES.PREVIEW;
    },
    setMode(nextMode) {
      if (nextMode !== RENDER_MODES.PATHTRACING && nextMode !== RENDER_MODES.PREVIEW) {
        throw new Error(`Unknown render mode: ${nextMode}`);
      }
      const changed = nextMode !== mode;
      mode = nextMode;
      return changed;
    },
    toggleMode() {
      mode = mode === RENDER_MODES.PATHTRACING ? RENDER_MODES.PREVIEW : RENDER_MODES.PATHTRACING;
      return mode;
    }
  };
}
