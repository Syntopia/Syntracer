import { addRepresentationToObject, cloneDisplay, cloneMaterial } from "./scene_graph.js";
import { RENDER_MODES } from "./render_mode_controller.js";

export const SETTINGS_CLIPBOARD_TYPE = "syntracer-settings";
export const SETTINGS_CLIPBOARD_VERSION = 1;

const RENDER_STATE_KEYS = Object.freeze([
  "renderScale",
  "fastScale",
  "useImportedColor",
  "baseColor",
  "materialMode",
  "metallic",
  "roughness",
  "rimBoost",
  "opacity",
  "matteSpecular",
  "matteRoughness",
  "matteDiffuseRoughness",
  "wrapDiffuse",
  "surfaceIor",
  "surfaceTransmission",
  "surfaceOpacity",
  "maxBounces",
  "maxFrames",
  "exposure",
  "dofEnabled",
  "dofAperture",
  "dofFocusDistance",
  "toneMap",
  "edgeAccent",
  "edgeAccentMode",
  "ambientIntensity",
  "ambientColor",
  "envUrl",
  "envIntensity",
  "envBgIntensity",
  "envRotationDeg",
  "envRotationVerticalDeg",
  "envMaxLuminance",
  "samplesPerBounce",
  "castShadows",
  "previewShadows",
  "previewSsr",
  "previewLightIntensity",
  "volumeEnabled",
  "volumeColor",
  "volumeDensity",
  "volumeOpacity",
  "volumeStep",
  "volumeMaxSteps",
  "volumeThreshold",
  "lights",
  "clipEnabled",
  "clipDistance",
  "clipLocked",
  "visMode"
]);

function deepCopy(value) {
  if (value == null) return value;
  return JSON.parse(JSON.stringify(value));
}

function copyVec(value, label) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`${label} must be a vec3.`);
  }
  const out = value.map((item) => Number(item));
  if (!out.every((item) => Number.isFinite(item))) {
    throw new Error(`${label} must contain finite numbers.`);
  }
  return out;
}

function sanitizeCameraState(cameraState) {
  if (!cameraState || typeof cameraState !== "object") {
    throw new Error("cameraState is required.");
  }
  const distance = Number(cameraState.distance);
  const fov = Number(cameraState.fov);
  if (!Number.isFinite(distance) || distance <= 0) {
    throw new Error("cameraState.distance must be > 0.");
  }
  if (!Number.isFinite(fov) || fov <= 0 || fov >= Math.PI) {
    throw new Error("cameraState.fov must be in radians within (0, PI).");
  }
  const target = copyVec(cameraState.target, "cameraState.target");
  const rotation = Array.isArray(cameraState.rotation)
    ? cameraState.rotation.map((item) => Number(item))
    : null;
  if (!rotation || rotation.length !== 4 || !rotation.every((item) => Number.isFinite(item))) {
    throw new Error("cameraState.rotation must be a finite quaternion [x,y,z,w].");
  }
  return { target, distance, rotation, fov };
}

function sanitizeRepresentationSnapshot(representation, objectType, repIndex) {
  if (!representation || typeof representation !== "object") {
    throw new Error(`representation[${repIndex}] is invalid.`);
  }
  const name = String(representation.name ?? "").trim();
  if (!name) {
    throw new Error(`representation[${repIndex}].name must be non-empty.`);
  }
  return {
    id: representation.id || null,
    index: repIndex,
    name,
    visible: Boolean(representation.visible),
    display: cloneDisplay(representation.display, objectType),
    material: cloneMaterial(representation.material)
  };
}

function buildSceneGraphSnapshot(sceneGraph) {
  if (!sceneGraph) return null;
  if (!Array.isArray(sceneGraph.objects)) {
    throw new Error("sceneGraph.objects must be an array.");
  }
  const objects = sceneGraph.objects.map((object, objectIndex) => {
    if (!object || typeof object !== "object") {
      throw new Error(`sceneGraph.objects[${objectIndex}] is invalid.`);
    }
    if (!Array.isArray(object.representations)) {
      throw new Error(`sceneGraph.objects[${objectIndex}].representations must be an array.`);
    }
    return {
      id: object.id || null,
      index: objectIndex,
      type: String(object.type || ""),
      visible: Boolean(object.visible),
      expanded: Boolean(object.expanded),
      representations: object.representations.map((representation, repIndex) =>
        sanitizeRepresentationSnapshot(representation, object.type, repIndex)
      )
    };
  });
  return { objects };
}

function buildRenderStateSnapshot(renderState) {
  if (!renderState || typeof renderState !== "object") {
    throw new Error("renderState is required.");
  }
  const out = {};
  for (const key of RENDER_STATE_KEYS) {
    out[key] = deepCopy(renderState[key]);
  }
  return out;
}

function sanitizeRenderMode(renderMode) {
  if (renderMode !== RENDER_MODES.PATHTRACING && renderMode !== RENDER_MODES.PREVIEW) {
    throw new Error(`Unsupported render mode: ${renderMode}`);
  }
  return renderMode;
}

export function createSettingsClipboardPayload({
  renderMode,
  cameraState,
  renderState,
  sceneGraph = null,
  uiState = null
}) {
  return {
    type: SETTINGS_CLIPBOARD_TYPE,
    version: SETTINGS_CLIPBOARD_VERSION,
    renderMode: sanitizeRenderMode(renderMode),
    cameraState: sanitizeCameraState(cameraState),
    renderState: buildRenderStateSnapshot(renderState),
    sceneGraph: buildSceneGraphSnapshot(sceneGraph),
    uiState: uiState == null ? null : deepCopy(uiState)
  };
}

export function parseSettingsClipboardText(text) {
  const raw = JSON.parse(String(text ?? ""));
  if (!raw || typeof raw !== "object") {
    throw new Error("Clipboard settings must be a JSON object.");
  }
  if (raw.type !== SETTINGS_CLIPBOARD_TYPE) {
    throw new Error(`Unsupported clipboard settings type: ${raw.type}`);
  }
  if (raw.version !== SETTINGS_CLIPBOARD_VERSION) {
    throw new Error(`Unsupported clipboard settings version: ${raw.version}`);
  }
  return createSettingsClipboardPayload({
    renderMode: raw.renderMode,
    cameraState: raw.cameraState,
    renderState: raw.renderState,
    sceneGraph: raw.sceneGraph,
    uiState: raw.uiState
  });
}

function findObjectBySnapshot(sceneGraph, objectSnapshot) {
  if (!sceneGraph || !Array.isArray(sceneGraph.objects)) return null;
  if (objectSnapshot.id) {
    const byId = sceneGraph.objects.find((obj) => obj.id === objectSnapshot.id);
    if (byId) return byId;
  }
  const idx = Number(objectSnapshot.index);
  if (Number.isInteger(idx) && idx >= 0 && idx < sceneGraph.objects.length) {
    return sceneGraph.objects[idx];
  }
  return null;
}

function findRepresentationBySnapshot(object, repSnapshot) {
  if (!object || !Array.isArray(object.representations)) return null;
  if (repSnapshot.id) {
    const byId = object.representations.find((rep) => rep.id === repSnapshot.id);
    if (byId) return byId;
  }
  const idx = Number(repSnapshot.index);
  if (Number.isInteger(idx) && idx >= 0 && idx < object.representations.length) {
    return object.representations[idx];
  }
  return null;
}

function createRepresentationForSnapshot(sceneGraph, object, repSnapshot) {
  const created = addRepresentationToObject(sceneGraph, object.id);
  created.name = String(repSnapshot.name).trim();
  created.visible = Boolean(repSnapshot.visible);
  created.display = cloneDisplay(repSnapshot.display, object.type);
  created.material = cloneMaterial(repSnapshot.material);
  return created;
}

export function applySettingsClipboardPayload(payload, deps) {
  if (!payload || typeof payload !== "object") {
    throw new Error("payload is required.");
  }
  const { cameraState, renderState, sceneGraph, setRenderMode } = deps || {};
  if (!cameraState || !renderState || typeof setRenderMode !== "function") {
    throw new Error("cameraState, renderState and setRenderMode are required.");
  }

  const sanitized = createSettingsClipboardPayload(payload);
  setRenderMode(sanitized.renderMode);

  cameraState.target = deepCopy(sanitized.cameraState.target);
  cameraState.distance = sanitized.cameraState.distance;
  cameraState.rotation = deepCopy(sanitized.cameraState.rotation);
  cameraState.fov = sanitized.cameraState.fov;

  for (const key of RENDER_STATE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(sanitized.renderState, key)) {
      renderState[key] = deepCopy(sanitized.renderState[key]);
    }
  }

  const updatedRepresentationIds = [];
  let updatedObjects = 0;
  let updatedRepresentations = 0;
  if (sceneGraph && sanitized.sceneGraph && Array.isArray(sanitized.sceneGraph.objects)) {
    for (const objectSnapshot of sanitized.sceneGraph.objects) {
      const targetObject = findObjectBySnapshot(sceneGraph, objectSnapshot);
      if (!targetObject) continue;
      targetObject.visible = Boolean(objectSnapshot.visible);
      targetObject.expanded = Boolean(objectSnapshot.expanded);
      updatedObjects += 1;

      for (const repSnapshot of objectSnapshot.representations || []) {
        const targetRepresentation = findRepresentationBySnapshot(targetObject, repSnapshot)
          || createRepresentationForSnapshot(sceneGraph, targetObject, repSnapshot);
        targetRepresentation.name = String(repSnapshot.name).trim();
        targetRepresentation.visible = Boolean(repSnapshot.visible);
        targetRepresentation.display = cloneDisplay(repSnapshot.display, targetObject.type);
        targetRepresentation.material = cloneMaterial(repSnapshot.material);
        updatedRepresentations += 1;
        if (targetRepresentation.id) {
          updatedRepresentationIds.push(targetRepresentation.id);
        }
      }
    }
  }

  return {
    payload: sanitized,
    updatedObjects,
    updatedRepresentations,
    updatedRepresentationIds
  };
}
