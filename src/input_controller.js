export function createInputController(deps) {
  const { canvas, pointerState, clamp } = deps;

  function isTextEntryTarget(target) {
    if (!(target instanceof HTMLElement)) return false;
    if (target.isContentEditable) return true;
    const tag = target.tagName;
    return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
  }

  function updatePointerFromMouseEvent(event) {
    if (!canvas) {
      throw new Error("Render canvas is missing.");
    }
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      throw new Error("Canvas has invalid size for pointer tracking.");
    }
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    pointerState.x = clamp(x, 0, rect.width);
    pointerState.y = clamp(y, 0, rect.height);
    pointerState.overCanvas = true;
  }

  function normalizeVec3(v) {
    const len = Math.hypot(v[0], v[1], v[2]);
    if (len < 1e-10) {
      throw new Error("Cannot normalize zero-length vector.");
    }
    return [v[0] / len, v[1] / len, v[2] / len];
  }

  function buildCameraRayFromCanvasPixel(camera, canvasX, canvasY) {
    if (!canvas) {
      throw new Error("Render canvas is missing.");
    }
    const width = Math.max(1, Math.floor(canvas.clientWidth));
    const height = Math.max(1, Math.floor(canvas.clientHeight));
    if (width <= 0 || height <= 0) {
      throw new Error("Canvas size is invalid for ray picking.");
    }

    const ndcX = (canvasX / width) * 2.0 - 1.0;
    const ndcY = 1.0 - (canvasY / height) * 2.0;
    const dir = [
      camera.forward[0] + camera.right[0] * ndcX + camera.up[0] * ndcY,
      camera.forward[1] + camera.right[1] * ndcX + camera.up[1] * ndcY,
      camera.forward[2] + camera.right[2] * ndcX + camera.up[2] * ndcY
    ];
    return normalizeVec3(dir);
  }

  return {
    isTextEntryTarget,
    updatePointerFromMouseEvent,
    normalizeVec3,
    buildCameraRayFromCanvasPixel
  };
}

