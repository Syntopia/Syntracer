import { createLogger } from "./logger.js";
import { applyOrbitDragToRotation, resolveRotationLock } from "./camera_orbit.js";
import { primTypeLabel, traceSceneRay } from "./ray_pick.js";
import { computePrimitiveWorldBounds, projectAabbToCanvasRect } from "./overlay_bbox.js";
import { buildUnifiedBVH, flattenBVH, PRIM_TRIANGLE, PRIM_SPHERE, PRIM_CYLINDER } from "./bvh.js";
import {
  packBvhNodes, packTriangles, packTriNormals, packTriFlags, packPrimIndices,
  packSpheres, packSphereColorsWithMaterialIndices, packTriColorsWithMaterialIndices,
  packCylinders, packCylinderColorsWithMaterialIndices, packMaterialTable
} from "./packing.js";
import { createEnvironmentController } from "./environment_controller.js";
import { createUiController } from "./ui_controller.js";
import { createInputController } from "./input_controller.js";
import { hasSurfaceFlags } from "./scene_controller.js";
import { formatPolyCount, cameraRelativeLightDir } from "./renderer_controller.js";
import {
  parseAutoDetect,
  parseCubeFile,
  fetchPDB,
  getBuiltinMolecule
} from "./molecular.js";
import {
  createSceneGraphFromMolData,
  appendSceneGraphFromMolData,
  addRepresentationToObject,
  updateRepresentation,
  selectObject,
  selectRepresentation,
  toggleObjectVisibility,
  toggleRepresentationVisibility,
  deleteObjectFromSceneGraph,
  deleteRepresentationFromObject,
  listVisibleRepresentations,
  findRepresentation,
  findObject,
  cloneMaterial,
  cloneDisplay,
  displayStylesForObjectType,
  SCENE_OBJECT_TYPES
} from "./scene_graph.js";
import { compileSceneGraphGeometry, findPrimitivePickRange } from "./scene_graph_compile.js";
import {
  initWebGL,
  createDataTexture,
  createEnvTexture,
  createCdfTexture,
  createVolumeTexture,
  createAccumTargets,
  resizeAccumTargets,
  createTextureUnit,
  createTextureUnit3D,
  setTraceUniforms,
  setDisplayUniforms,
  drawFullscreen,
  MAX_BRUTE_FORCE_TRIS
} from "./webgl.js";
import {
  createPreviewBackend,
  disposePreviewBackend,
  renderPreviewFrame,
  choosePreviewVolumeTechnique
} from "./preview_webgl.js";
import { createRenderModeController, RENDER_MODES } from "./render_mode_controller.js";

const canvas = document.getElementById("view");
const canvasContainer = canvas?.closest(".canvas-container");
const renderOverlay = document.getElementById("renderOverlay");
const loadingOverlay = document.getElementById("loadingOverlay");
const hoverBoxOverlay = document.getElementById("hoverBoxOverlay");
const hoverInfoOverlay = document.getElementById("hoverInfoOverlay");
const statusEl = document.getElementById("status");
const logger = createLogger(statusEl);

const exampleSelect = document.getElementById("exampleSelect");
const loadExampleBtn = document.getElementById("loadExample");
const envSelect = document.getElementById("envSelect");
const envIntensityInput = document.getElementById("envIntensity");
const envBgIntensityInput = document.getElementById("envBgIntensity");
const envUniformColorInput = document.getElementById("uniformEnvColor");
const envRotationInput = document.getElementById("envRotation");
const envRotationVerticalInput = document.getElementById("envRotationVertical");
const envMaxLumInput = document.getElementById("envMaxLum");
const analyticSkyResolutionSelect = document.getElementById("analyticSkyResolution");
const analyticSkyTurbidityInput = document.getElementById("analyticSkyTurbidity");
const analyticSkySunAzimuthInput = document.getElementById("analyticSkySunAzimuth");
const analyticSkySunElevationInput = document.getElementById("analyticSkySunElevation");
const analyticSkyIntensityInput = document.getElementById("analyticSkyIntensity");
const analyticSkySunIntensityInput = document.getElementById("analyticSkySunIntensity");
const analyticSkySunRadiusInput = document.getElementById("analyticSkySunRadius");
const analyticSkyGroundAlbedoInput = document.getElementById("analyticSkyGroundAlbedo");
const analyticSkyHorizonSoftnessInput = document.getElementById("analyticSkyHorizonSoftness");
const molFileInput = document.getElementById("molFileInput");
const pdbIdInput = document.getElementById("pdbIdInput");
const loadPdbIdBtn = document.getElementById("loadPdbId");
const sceneGraphTree = document.getElementById("sceneGraphTree");
const representationSelectionHint = document.getElementById("representationSelectionHint");
const representationActionBtn = document.getElementById("representationActionBtn");
const pdbDisplayStyle = document.getElementById("pdbDisplayStyle");
const pdbAtomScale = document.getElementById("pdbAtomScale");
const pdbBondRadius = document.getElementById("pdbBondRadius");
const probeRadiusInput = document.getElementById("probeRadius");
const surfaceResolutionInput = document.getElementById("surfaceResolution");
const clipEnableToggle = document.getElementById("clipEnable");
const clipDistanceInput = document.getElementById("clipDistance");
const clipLockToggle = document.getElementById("clipLock");
const scaleSelect = document.getElementById("scaleSelect");
const fastScaleSelect = document.getElementById("fastScaleSelect");
const materialSelect = document.getElementById("materialSelect");
const metallicInput = document.getElementById("metallic");
const roughnessInput = document.getElementById("roughness");
const rimBoostInput = document.getElementById("rimBoost");
const metallicOpacityInput = document.getElementById("metallicOpacity");
const matteSpecularInput = document.getElementById("matteSpecular");
const matteRoughnessInput = document.getElementById("matteRoughness");
const matteDiffuseRoughnessInput = document.getElementById("matteDiffuseRoughness");
const wrapDiffuseInput = document.getElementById("wrapDiffuse");
const surfaceIorInput = document.getElementById("surfaceIor");
const surfaceTransmissionInput = document.getElementById("surfaceTransmission");
const showSheetHbondsToggle = document.getElementById("showSheetHbonds");
const surfaceOpacityInput = document.getElementById("surfaceOpacity");
const maxBouncesInput = document.getElementById("maxBounces");
const exposureInput = document.getElementById("exposure");
const cameraFovInput = document.getElementById("cameraFov");
const dofEnableToggle = document.getElementById("dofEnable");
const dofApertureInput = document.getElementById("dofAperture");
const dofFocusDistanceInput = document.getElementById("dofFocusDistance");
const ambientIntensityInput = document.getElementById("ambientIntensity");
const ambientColorInput = document.getElementById("ambientColor");
const samplesPerBounceInput = document.getElementById("samplesPerBounce");
const maxFramesInput = document.getElementById("maxFrames");
const toneMapSelect = document.getElementById("toneMapSelect");
const edgeAccentInput = document.getElementById("edgeAccent");
const shadowToggle = document.getElementById("shadowToggle");
const previewShadowsToggle = document.getElementById("previewShadowsToggle");
const previewSsrToggle = document.getElementById("previewSsrToggle");
const previewLightIntensityInput = document.getElementById("previewLightIntensity");
const volumeEnableToggle = document.getElementById("volumeEnable");
const volumeColorInput = document.getElementById("volumeColor");
const volumeDensityInput = document.getElementById("volumeDensity");
const volumeOpacityInput = document.getElementById("volumeOpacity");
const volumeStepInput = document.getElementById("volumeStep");
const volumeMaxStepsInput = document.getElementById("volumeMaxSteps");
const volumeThresholdInput = document.getElementById("volumeThreshold");
const light1Enable = document.getElementById("light1Enable");
const light1Azimuth = document.getElementById("light1Azimuth");
const light1Elevation = document.getElementById("light1Elevation");
const light1Intensity = document.getElementById("light1Intensity");
const light1Extent = document.getElementById("light1Extent");
const light1Color = document.getElementById("light1Color");
const light2Enable = document.getElementById("light2Enable");
const light2Azimuth = document.getElementById("light2Azimuth");
const light2Elevation = document.getElementById("light2Elevation");
const light2Intensity = document.getElementById("light2Intensity");
const light2Extent = document.getElementById("light2Extent");
const light2Color = document.getElementById("light2Color");
const visModeSelect = document.getElementById("visModeSelect");
const displayAtomControls = document.querySelector(".display-atom-controls");
const displayBondControls = document.querySelector(".display-bond-controls");
const displayCartoonControls = document.querySelector(".display-cartoon-controls");
const displaySesControls = document.querySelector(".display-ses-controls");
const displayIsosurfaceControls = document.querySelector(".display-isosurface-controls");
const displayVolumeControls = document.querySelector(".display-volume-controls");
const isoLevelInput = document.getElementById("isoLevel");
const isoPositiveColorInput = document.getElementById("isoPositiveColor");
const isoNegativeColorInput = document.getElementById("isoNegativeColor");
const volumeValueMinInput = document.getElementById("volumeValueMin");
const volumeValueMaxInput = document.getElementById("volumeValueMax");
const volumeOpacityScaleInput = document.getElementById("volumeOpacityScale");
const volumeStepSizeInput = document.getElementById("volumeStepSize");
const volumePositiveColorInput = document.getElementById("volumePositiveColor");
const volumeNegativeColorInput = document.getElementById("volumeNegativeColor");
const volumeTransferPresetSelect = document.getElementById("volumeTransferPreset");
const materialSection = materialSelect?.closest(".form-section") || null;

const hiresModal = document.getElementById("hiresModal");
const hiresForm = document.getElementById("hiresForm");
const hiresProgress = document.getElementById("hiresProgress");
const hiresWidthInput = document.getElementById("hiresWidth");
const hiresHeightInput = document.getElementById("hiresHeight");
const hiresIterationsInput = document.getElementById("hiresIterations");
const hiresTransparentCheckbox = document.getElementById("hiresTransparent");
const hiresRenderBtn = document.getElementById("hiresRenderBtn");
const hiresStartBtn = document.getElementById("hiresStart");
const hiresCloseBtn = document.getElementById("hiresClose");
const hiresCancelBtn = document.getElementById("hiresCancel");
const hiresProgressFill = document.getElementById("hiresProgressFill");
const hiresProgressText = document.getElementById("hiresProgressText");
const renderModePathtracingBtn = document.getElementById("renderModePathtracing");
const renderModePreviewBtn = document.getElementById("renderModePreview");

const tabButtons = Array.from(document.querySelectorAll("[data-tab-button]"));
const tabPanels = Array.from(document.querySelectorAll("[data-tab-panel]"));

let sceneData = null;
let glState = null;
let previewState = null;
let isRendering = false;
let isLoading = false;
let glInitFailed = false;
let sceneGraph = null;
let currentMolMeta = null;
const repGeometryCache = new Map();
const renderModeController = createRenderModeController(RENDER_MODES.PATHTRACING);

const cameraState = {
  target: [0, 0, 0],
  distance: 4,
  rotation: [0, 0, 0, 1],
  fov: Math.PI / 3,
  width: 1,
  height: 1
};

const renderState = {
  renderScale: 1.0,
  fastScale: 0.25,
  scale: 1.0,
  frameIndex: 0,
  cameraDirty: true,
  useBvh: true,
  useImportedColor: true,
  baseColor: [0.8, 0.8, 0.8],
  materialMode: "metallic",
  metallic: 0.0,
  roughness: 0.4,
  rimBoost: 0.2,
  opacity: 1.0,
  matteSpecular: 0.03,
  matteRoughness: 0.5,
  matteDiffuseRoughness: 0.5,
  wrapDiffuse: 0.2,
  surfaceIor: 1.0,
  surfaceTransmission: 0.35,
  surfaceOpacity: 0.0,
  maxBounces: 4,
  maxFrames: 100,
  exposure: 1.0,
  dofEnabled: false,
  dofAperture: 0.03,
  dofFocusDistance: 4.0,
  toneMap: "aces",
  edgeAccent: 0.5,
  ambientIntensity: 0.0,
  ambientColor: [1.0, 1.0, 1.0],
  envUrl: null,
  envCacheKey: null,
  envIntensity: 0.1,
  envBgIntensity: 0.3,
  envRotationDeg: 0.0,
  envRotationVerticalDeg: 0.0,
  envMaxLuminance: 200.0,
  envData: null,
  rayBias: 1e-5,
  tMin: 1e-5,
  samplesPerBounce: 1,
  castShadows: true,
  previewShadows: true,
  previewSsr: true,
  previewLightIntensity: 1.0,
  volumeEnabled: false,
  volumeColor: [0.435, 0.643, 1.0],
  volumeDensity: 1.0,
  volumeOpacity: 1.0,
  volumeStep: 0.5,
  volumeMaxSteps: 256,
  volumeThreshold: 0.0,
  lights: [
    // Camera-relative studio lighting: key, fill, rim
    { enabled: true, azimuth: -40, elevation: -30, intensity: 5.0, angle: 5, color: [1.0, 1.0, 1.0] },
    { enabled: true, azimuth: 40, elevation: 0, intensity: 0.6, angle: 50, color: [1.0, 1.0, 1.0] },
    { enabled: true, azimuth: 170, elevation: 10, intensity: 0.35, angle: 6, color: [1.0, 1.0, 1.0] }
  ],
  clipEnabled: false,
  clipDistance: 0.0,
  clipLocked: false,
  clipLockedNormal: null,
  clipLockedOffset: null,
  clipLockedSide: null,
  visMode: 0,
  transparentBg: 0,
  hiresMode: false
};

const envCache = new Map();

const inputState = {
  dragging: false,
  lastX: 0,
  lastY: 0,
  dragMode: "rotate",
  rotateAxisLock: null,
  keys: new Set()
};

const interactionState = {
  lastActive: 0
};

const AUTO_FIT_ZOOM_FACTOR = 1.8;
const PREVIEW_EDGE_ACCENT_SCALE = 0.5;
const PREVIEW_FPS_IDLE_MS = 1000;
const FPS_RESET_GAP_MS = 750;
const FPS_MIN_DT_SAMPLES = 8;
const FPS_MIN_DT_MS = 4;
const FPS_MAX_DT_MS = 1000;
const FPS_SMOOTH_ALPHA = 0.2;

const pointerState = {
  overCanvas: false,
  x: 0,
  y: 0
};

let hoverOverlayErrorMessage = null;
const renderStats = {
  frameDtMs: [],
  lastFrameTimeMs: 0,
  fpsSmoothed: 0,
  lastRenderedAtMs: 0,
  lastMode: RENDER_MODES.PATHTRACING,
  lastPrimaryText: "",
  lastFpsUiUpdateMs: 0
};

function ensureRenderOverlayRows() {
  if (!renderOverlay) return { primaryEl: null, fpsEl: null };
  let primaryEl = renderOverlay.querySelector(".render-overlay-primary");
  let fpsEl = renderOverlay.querySelector(".render-overlay-fps");
  if (!primaryEl || !fpsEl) {
    renderOverlay.innerHTML = "";
    primaryEl = document.createElement("div");
    primaryEl.className = "render-overlay-primary";
    fpsEl = document.createElement("div");
    fpsEl.className = "render-overlay-fps";
    renderOverlay.appendChild(primaryEl);
    renderOverlay.appendChild(fpsEl);
  }
  return { primaryEl, fpsEl };
}

function resetFpsStats() {
  renderStats.frameDtMs.length = 0;
  renderStats.fpsSmoothed = 0;
  renderStats.lastFrameTimeMs = 0;
}

function noteRenderedFrame(mode) {
  const now = performance.now();
  if (renderStats.lastRenderedAtMs > 0 && (now - renderStats.lastRenderedAtMs) > FPS_RESET_GAP_MS) {
    resetFpsStats();
  }
  if (renderStats.lastFrameTimeMs > 0) {
    const dtMs = now - renderStats.lastFrameTimeMs;
    if (dtMs >= FPS_MIN_DT_MS && dtMs <= FPS_MAX_DT_MS) {
      renderStats.frameDtMs.push(dtMs);
      if (renderStats.frameDtMs.length > 120) {
        renderStats.frameDtMs.shift();
      }
    }
  }
  renderStats.lastFrameTimeMs = now;
  renderStats.lastRenderedAtMs = now;
  renderStats.lastMode = mode;
}

function formatFpsOverlayText() {
  const now = performance.now();
  if (renderStats.lastMode === RENDER_MODES.PREVIEW && now - renderStats.lastRenderedAtMs > PREVIEW_FPS_IDLE_MS) {
    return "FPS: idle";
  }
  const dts = renderStats.frameDtMs;
  if (dts.length < FPS_MIN_DT_SAMPLES) {
    return "FPS: --";
  }
  const sorted = dts.slice().sort((a, b) => a - b);
  const trim = Math.floor(sorted.length * 0.15);
  const kept = sorted.slice(trim, sorted.length - trim);
  if (kept.length === 0) {
    return "FPS: --";
  }
  const avgDt = kept.reduce((sum, dt) => sum + dt, 0) / kept.length;
  if (!Number.isFinite(avgDt) || avgDt <= 0) {
    return "FPS: --";
  }
  const fpsRaw = Math.min(240, 1000 / avgDt);
  renderStats.fpsSmoothed = renderStats.fpsSmoothed > 0
    ? renderStats.fpsSmoothed * (1 - FPS_SMOOTH_ALPHA) + fpsRaw * FPS_SMOOTH_ALPHA
    : fpsRaw;
  return `FPS: ${renderStats.fpsSmoothed.toFixed(1)}`;
}

function setRenderOverlayText(primaryText) {
  if (!renderOverlay) return;
  const { primaryEl, fpsEl } = ensureRenderOverlayRows();
  if (!primaryEl || !fpsEl) return;
  renderStats.lastPrimaryText = primaryText;
  primaryEl.textContent = primaryText;
  fpsEl.textContent = formatFpsOverlayText();
  renderStats.lastFpsUiUpdateMs = performance.now();
  renderOverlay.style.display = "block";
}

function refreshRenderOverlayFpsOnly(timeMs) {
  if (!renderOverlay || !renderStats.lastPrimaryText) return;
  if (timeMs - renderStats.lastFpsUiUpdateMs < 200) return;
  const { fpsEl } = ensureRenderOverlayRows();
  if (!fpsEl) return;
  fpsEl.textContent = formatFpsOverlayText();
  renderStats.lastFpsUiUpdateMs = timeMs;
}

const OBJECT_TYPE_LABELS = Object.freeze({
  protein: "Protein",
  ligand: "Ligand",
  water: "Water",
  "metal-ions": "Metal ions",
  volume: "Volume"
});

function snapshotCurrentMaterial() {
  return {
    useImportedColor: true,
    baseColor: [0.8, 0.8, 0.8],
    mode: renderState.materialMode,
    metallic: renderState.metallic,
    roughness: renderState.roughness,
    rimBoost: renderState.rimBoost,
    opacity: renderState.opacity,
    matteSpecular: renderState.matteSpecular,
    matteRoughness: renderState.matteRoughness,
    matteDiffuseRoughness: renderState.matteDiffuseRoughness,
    wrapDiffuse: renderState.wrapDiffuse,
    surfaceIor: renderState.surfaceIor,
    surfaceTransmission: renderState.surfaceTransmission,
    surfaceOpacity: renderState.surfaceOpacity
  };
}

/**
 * Create a test scene with spheres and cylinders for debugging.
 * This can be called manually or hooked up to a UI element.
 */
function loadTestPrimitives() {
  logger.info("Creating test scene with spheres and cylinders");

  // Empty triangle data
  const positions = new Float32Array(0);
  const indices = new Uint32Array(0);
  const normals = new Float32Array(0);
  const triColors = new Float32Array(0);
  const triFlags = new Float32Array(0);

  // Test spheres - a small molecule-like arrangement
  const spheres = [
    { center: [0, 0, 0], radius: 0.5, color: [1.0, 0.2, 0.2] },    // Central red sphere
    { center: [1.2, 0, 0], radius: 0.35, color: [0.2, 0.2, 1.0] }, // Right blue sphere
    { center: [-1.2, 0, 0], radius: 0.35, color: [0.2, 1.0, 0.2] }, // Left green sphere
    { center: [0, 1.2, 0], radius: 0.35, color: [1.0, 1.0, 0.2] }, // Top yellow sphere
    { center: [0, -1.2, 0], radius: 0.35, color: [1.0, 0.5, 0.0] }, // Bottom orange sphere
  ];

  // Test cylinders - bonds connecting spheres
  const cylinders = [
    { p1: [0.5, 0, 0], p2: [0.85, 0, 0], radius: 0.1, color: [0.8, 0.8, 0.8] }, // Center to right
    { p1: [-0.5, 0, 0], p2: [-0.85, 0, 0], radius: 0.1, color: [0.8, 0.8, 0.8] }, // Center to left
    { p1: [0, 0.5, 0], p2: [0, 0.85, 0], radius: 0.1, color: [0.8, 0.8, 0.8] }, // Center to top
    { p1: [0, -0.5, 0], p2: [0, -0.85, 0], radius: 0.1, color: [0.8, 0.8, 0.8] }, // Center to bottom
  ];

  logger.info(`Created ${spheres.length} spheres, ${cylinders.length} cylinders`);

  const bvh = buildUnifiedBVH(
    { positions, indices },
    spheres,
    cylinders,
    { maxLeafSize: 4, maxDepth: 32 }
  );
  logger.info(`BVH nodes: ${bvh.nodes.length}, primitives: ${bvh.primitives.length}`);

  const flat = flattenBVH(bvh.nodes, bvh.primitives, bvh.triCount, bvh.sphereCount, bvh.cylinderCount);
  const material = snapshotCurrentMaterial();
  const triMaterialIndices = new Float32Array(0);
  const sphereMaterialIndices = new Float32Array(spheres.length);
  const cylinderMaterialIndices = new Float32Array(cylinders.length);

  sceneData = {
    positions,
    indices,
    normals,
    triColors,
    triFlags,
    hasSurfaceFlags: hasSurfaceFlags(triFlags),
    nodes: bvh.nodes,
    tris: bvh.tris,
    primitives: bvh.primitives,
    primIndexBuffer: flat.primIndexBuffer,
    triCount: bvh.triCount,
    sphereCount: bvh.sphereCount,
    cylinderCount: bvh.cylinderCount,
    spheres,
    cylinders,
    sceneScale: 1.0,
    volume: null,
    volumeDisplay: null,
    pickRanges: null,
    materials: [material],
    triMaterialIndices,
    sphereMaterialIndices,
    cylinderMaterialIndices
  };
  sceneGraph = null;
  currentMolMeta = null;
  repGeometryCache.clear();
  renderSceneGraphTree();
  updateClipRange();
  renderState.frameIndex = 0;
  renderState.cameraDirty = true;

  // Compute bounds from spheres and cylinders
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const s of spheres) {
    minX = Math.min(minX, s.center[0] - s.radius);
    minY = Math.min(minY, s.center[1] - s.radius);
    minZ = Math.min(minZ, s.center[2] - s.radius);
    maxX = Math.max(maxX, s.center[0] + s.radius);
    maxY = Math.max(maxY, s.center[1] + s.radius);
    maxZ = Math.max(maxZ, s.center[2] + s.radius);
  }

  for (const c of cylinders) {
    minX = Math.min(minX, c.p1[0] - c.radius, c.p2[0] - c.radius);
    minY = Math.min(minY, c.p1[1] - c.radius, c.p2[1] - c.radius);
    minZ = Math.min(minZ, c.p1[2] - c.radius, c.p2[2] - c.radius);
    maxX = Math.max(maxX, c.p1[0] + c.radius, c.p2[0] + c.radius);
    maxY = Math.max(maxY, c.p1[1] + c.radius, c.p2[1] + c.radius);
    maxZ = Math.max(maxZ, c.p1[2] + c.radius, c.p2[2] + c.radius);
  }

  const bounds = { minX, minY, minZ, maxX, maxY, maxZ };
  logger.info(
    `Bounds min (${bounds.minX.toFixed(2)}, ${bounds.minY.toFixed(2)}, ${bounds.minZ.toFixed(2)}) max (${bounds.maxX.toFixed(2)}, ${bounds.maxY.toFixed(2)}, ${bounds.maxZ.toFixed(2)})`
  );

  const dx = bounds.maxX - bounds.minX;
  const dy = bounds.maxY - bounds.minY;
  const dz = bounds.maxZ - bounds.minZ;
  sceneData.sceneScale = Math.max(1e-3, Math.sqrt(dx * dx + dy * dy + dz * dz) * 0.5);
  const suggestedBias = Math.max(1e-5, sceneData.sceneScale * 1e-5);
  renderState.rayBias = suggestedBias;
  renderState.tMin = suggestedBias;
  applyCameraToBounds(bounds);

  // Reset textures so they get recreated
  if (glState) {
    glState.textures = null;
  }

  logger.info("Test primitives loaded.");
}

// Expose for debugging in console
window.loadTestPrimitives = loadTestPrimitives;

/**
 * Generate a large test scene with many random spheres.
 * Uses a seeded pseudo-random number generator for reproducibility.
 */
function loadRandomSpheres(count) {
  logger.info(`Creating test scene with ${count} random spheres`);

  // Simple seeded PRNG (mulberry32)
  let seed = 12345;
  function random() {
    seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  // Empty triangle data
  const positions = new Float32Array(0);
  const indices = new Uint32Array(0);
  const normals = new Float32Array(0);
  const triColors = new Float32Array(0);
  const triFlags = new Float32Array(0);

  // Generate random spheres in a cube
  const spheres = [];
  const cubeSize = Math.pow(count, 1/3) * 2; // Scale cube size with sphere count
  const minRadius = 0.15;
  const maxRadius = 0.4;

  for (let i = 0; i < count; i++) {
    const x = (random() - 0.5) * cubeSize;
    const y = (random() - 0.5) * cubeSize;
    const z = (random() - 0.5) * cubeSize;
    const radius = minRadius + random() * (maxRadius - minRadius);

    // Random vibrant colors
    const hue = random();
    const saturation = 0.6 + random() * 0.4;
    const lightness = 0.4 + random() * 0.3;
    const color = hslToRgb(hue, saturation, lightness);

    spheres.push({ center: [x, y, z], radius, color });
  }

  // No cylinders for this test
  const cylinders = [];

  logger.info(`Generated ${spheres.length} spheres, building BVH...`);
  const startTime = performance.now();

  const bvh = buildUnifiedBVH(
    { positions, indices },
    spheres,
    cylinders,
    { maxLeafSize: 4, maxDepth: 32 }
  );

  const bvhTime = performance.now() - startTime;
  logger.info(`BVH built in ${bvhTime.toFixed(1)}ms: ${bvh.nodes.length} nodes, ${bvh.primitives.length} primitives`);

  const flat = flattenBVH(bvh.nodes, bvh.primitives, bvh.triCount, bvh.sphereCount, bvh.cylinderCount);
  const material = snapshotCurrentMaterial();
  const triMaterialIndices = new Float32Array(0);
  const sphereMaterialIndices = new Float32Array(spheres.length);
  const cylinderMaterialIndices = new Float32Array(cylinders.length);

  sceneData = {
    positions,
    indices,
    normals,
    triColors,
    triFlags,
    hasSurfaceFlags: hasSurfaceFlags(triFlags),
    nodes: bvh.nodes,
    tris: bvh.tris,
    primitives: bvh.primitives,
    primIndexBuffer: flat.primIndexBuffer,
    triCount: bvh.triCount,
    sphereCount: bvh.sphereCount,
    cylinderCount: bvh.cylinderCount,
    spheres,
    cylinders,
    sceneScale: 1.0,
    volume: null,
    volumeDisplay: null,
    pickRanges: null,
    materials: [material],
    triMaterialIndices,
    sphereMaterialIndices,
    cylinderMaterialIndices
  };
  sceneGraph = null;
  currentMolMeta = null;
  repGeometryCache.clear();
  renderSceneGraphTree();
  updateClipRange();
  renderState.frameIndex = 0;
  renderState.cameraDirty = true;

  // Compute bounds from spheres
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;

  for (const s of spheres) {
    minX = Math.min(minX, s.center[0] - s.radius);
    minY = Math.min(minY, s.center[1] - s.radius);
    minZ = Math.min(minZ, s.center[2] - s.radius);
    maxX = Math.max(maxX, s.center[0] + s.radius);
    maxY = Math.max(maxY, s.center[1] + s.radius);
    maxZ = Math.max(maxZ, s.center[2] + s.radius);
  }

  const bounds = { minX, minY, minZ, maxX, maxY, maxZ };
  logger.info(
    `Bounds min (${bounds.minX.toFixed(2)}, ${bounds.minY.toFixed(2)}, ${bounds.minZ.toFixed(2)}) max (${bounds.maxX.toFixed(2)}, ${bounds.maxY.toFixed(2)}, ${bounds.maxZ.toFixed(2)})`
  );

  const dx = bounds.maxX - bounds.minX;
  const dy = bounds.maxY - bounds.minY;
  const dz = bounds.maxZ - bounds.minZ;
  sceneData.sceneScale = Math.max(1e-3, Math.sqrt(dx * dx + dy * dy + dz * dz) * 0.5);
  const suggestedBias = Math.max(1e-5, sceneData.sceneScale * 1e-5);
  renderState.rayBias = suggestedBias;
  renderState.tMin = suggestedBias;
  applyCameraToBounds(bounds);

  // Reset textures so they get recreated
  if (glState) {
    glState.textures = null;
  }

  logger.info(`${count} spheres loaded successfully.`);
}

// HSL to RGB conversion helper
function hslToRgb(h, s, l) {
  let r, g, b;
  if (s === 0) {
    r = g = b = l;
  } else {
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1/3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1/3);
  }
  return [r, g, b];
}

// Expose for debugging in console
window.loadRandomSpheres = loadRandomSpheres;

/**
 * Load a molecular file (PDB or SDF) and render it.
 * @param {string} text - File content
 * @param {string} filename - Original filename for format detection
 */
/**
 * Get current molecular display options from UI.
 */
function inferSourceKind(filename) {
  const ext = String(filename || "").toLowerCase();
  if (ext.endsWith(".pdb")) return "pdb";
  if (ext.endsWith(".cube")) return "cube";
  if (ext.endsWith(".sdf") || ext.endsWith(".mol")) return "sdf";
  return null;
}

function requireSupportedImportFilename(filename) {
  const lower = String(filename || "").toLowerCase();
  const supported = [".pdb", ".sdf", ".mol", ".cube"];
  if (!supported.some((ext) => lower.endsWith(ext))) {
    throw new Error(
      `Unsupported file format for "${filename}". Supported formats: ${supported.join(", ")}.`
    );
  }
}

function getDisplaySettingsFromControls() {
  const style = String(pdbDisplayStyle?.value || "ball-and-stick");
  const atomScale = requireNumberInput(pdbAtomScale, "Atom radius scale");
  const bondRadius = requireNumberInput(pdbBondRadius, "Bond radius");
  const probeRadius = requireNumberInput(probeRadiusInput, "Probe radius");
  const surfaceResolution = requireNumberInput(surfaceResolutionInput, "Surface resolution");
  const isoLevel = requireNumberInput(isoLevelInput, "Iso-level");
  if (!isoPositiveColorInput) throw new Error("Positive isosurface color input is missing.");
  if (!isoNegativeColorInput) throw new Error("Negative isosurface color input is missing.");
  const isoPositiveColor = hexToRgb(isoPositiveColorInput.value);
  const isoNegativeColor = hexToRgb(isoNegativeColorInput.value);
  const volumeValueMin = requireNumberInput(volumeValueMinInput, "Volume value window min");
  const volumeValueMax = requireNumberInput(volumeValueMaxInput, "Volume value window max");
  const volumeOpacityScale = requireNumberInput(volumeOpacityScaleInput, "Volume opacity scale");
  const volumeStepSize = requireNumberInput(volumeStepSizeInput, "Volume step size");
  if (!volumePositiveColorInput) throw new Error("Positive volume color input is missing.");
  if (!volumeNegativeColorInput) throw new Error("Negative volume color input is missing.");
  const volumePositiveColor = hexToRgb(volumePositiveColorInput.value);
  const volumeNegativeColor = hexToRgb(volumeNegativeColorInput.value);
  const volumeTransferPreset = String(volumeTransferPresetSelect?.value || "orbital");

  if (atomScale <= 0) throw new Error("Atom radius scale must be > 0.");
  if (bondRadius < 0) throw new Error("Bond radius must be >= 0.");
  if (probeRadius <= 0) throw new Error("Probe radius must be > 0.");
  if (surfaceResolution <= 0) throw new Error("Surface resolution must be > 0.");
  if (isoLevel < 0 || isoLevel > 1) throw new Error("Iso-level must be between 0 and 1.");
  if (volumeValueMin >= volumeValueMax) throw new Error("Volume value window min must be less than max.");
  if (volumeOpacityScale < 0) throw new Error("Volume opacity scale must be >= 0.");
  if (volumeStepSize <= 0) throw new Error("Volume step size must be > 0.");
  if (!["orbital", "grayscale", "heatmap"].includes(volumeTransferPreset)) {
    throw new Error(`Unsupported volume transfer preset: ${volumeTransferPreset}`);
  }

  return {
    style,
    atomScale,
    bondRadius,
    probeRadius,
    surfaceResolution,
    isoLevel,
    isoPositiveColor,
    isoNegativeColor,
    volumeValueMin,
    volumeValueMax,
    volumeOpacityScale,
    volumeStepSize,
    volumePositiveColor,
    volumeNegativeColor,
    volumeTransferPreset,
    showSheetHbonds: showSheetHbondsToggle?.checked || false
  };
}

function getMaterialSettingsFromControls() {
  return {
    mode: materialSelect?.value || "metallic",
    metallic: clamp(Number(metallicInput?.value ?? 0.0), 0.0, 1.0),
    roughness: clamp(Number(roughnessInput?.value ?? 0.4), 0.02, 1.0),
    rimBoost: clamp(Number(rimBoostInput?.value ?? 0.2), 0.0, 1.0),
    opacity: clamp(Number(metallicOpacityInput?.value ?? 1.0), 0.0, 1.0),
    matteSpecular: clamp(Number(matteSpecularInput?.value ?? 0.03), 0.0, 0.08),
    matteRoughness: clamp(Number(matteRoughnessInput?.value ?? 0.5), 0.1, 1.0),
    matteDiffuseRoughness: clamp(Number(matteDiffuseRoughnessInput?.value ?? 0.5), 0.0, 1.0),
    wrapDiffuse: clamp(Number(wrapDiffuseInput?.value ?? 0.2), 0.0, 0.5),
    surfaceIor: clamp(Number(surfaceIorInput?.value ?? 1.0), 1.0, 2.5),
    surfaceTransmission: clamp(Number(surfaceTransmissionInput?.value ?? 0.35), 0.0, 1.0),
    surfaceOpacity: clamp(Number(surfaceOpacityInput?.value ?? 0.0), 0.0, 1.0)
  };
}

function applyMaterialToRenderState(material) {
  const normalized = cloneMaterial(material);
  renderState.useImportedColor = true;
  renderState.baseColor = [0.8, 0.8, 0.8];
  renderState.materialMode = normalized.mode;
  renderState.metallic = normalized.metallic;
  renderState.roughness = normalized.roughness;
  renderState.rimBoost = normalized.rimBoost;
  renderState.opacity = normalized.opacity;
  renderState.matteSpecular = normalized.matteSpecular;
  renderState.matteRoughness = normalized.matteRoughness;
  renderState.matteDiffuseRoughness = normalized.matteDiffuseRoughness;
  renderState.wrapDiffuse = normalized.wrapDiffuse;
  renderState.surfaceIor = normalized.surfaceIor;
  renderState.surfaceTransmission = normalized.surfaceTransmission;
  renderState.surfaceOpacity = normalized.surfaceOpacity;
}

function updateDisplayControlsVisibility() {
  const style = String(pdbDisplayStyle?.value || "ball-and-stick");
  const selectedObject = getSelectedObject();
  const selectedType = selectedObject?.type || null;
  if (displayAtomControls) {
    displayAtomControls.style.display = style === "ball-and-stick" ? "block" : "none";
  }
  if (displayBondControls) {
    displayBondControls.style.display = (style === "ball-and-stick" || style === "stick") ? "block" : "none";
  }
  if (displayCartoonControls) {
    displayCartoonControls.style.display = style === "cartoon" ? "block" : "none";
  }
  if (displaySesControls) {
    displaySesControls.style.display = style === "ses" ? "block" : "none";
  }
  if (displayIsosurfaceControls) {
    displayIsosurfaceControls.style.display = style === "isosurface" ? "block" : "none";
  }
  if (displayVolumeControls) {
    displayVolumeControls.style.display = style === "volumetric" ? "block" : "none";
  }
  if (materialSection) {
    const hideMaterialForVolumetric = selectedType === SCENE_OBJECT_TYPES.VOLUME && style === "volumetric";
    materialSection.style.display = hideMaterialForVolumetric ? "none" : "block";
  }
}

function updateDisplayStyleOptionsForObjectType(objectType) {
  if (!pdbDisplayStyle || !objectType) return;
  const allowed = new Set(displayStylesForObjectType(objectType));
  for (const option of Array.from(pdbDisplayStyle.options)) {
    const enabled = allowed.has(option.value);
    option.hidden = !enabled;
    option.disabled = !enabled;
  }
  if (!allowed.has(pdbDisplayStyle.value)) {
    const firstAllowed = Array.from(pdbDisplayStyle.options).find((opt) => allowed.has(opt.value));
    if (!firstAllowed) {
      throw new Error(`No display styles available for object type ${objectType}.`);
    }
    pdbDisplayStyle.value = firstAllowed.value;
  }
}

function autoRepresentationName(display, material) {
  const style = String(display?.style || "stick");
  const materialMode = String(material?.mode || "metallic");
  const styleLabel = ({
    "ball-and-stick": "Ball+Stick",
    vdw: "Spacefill",
    stick: "Stick",
    cartoon: "Cartoon",
    ses: "SES",
    isosurface: "Isosurface",
    volumetric: "Volumetric"
  })[style] || style;
  if (style === "volumetric") {
    return styleLabel;
  }
  const materialLabel = ({
    metallic: "Metallic",
    matte: "Matte",
    "surface-glass": "Surface Glass",
    "translucent-plastic": "Translucent Plastic"
  })[materialMode] || materialMode;
  return `${styleLabel} (${materialLabel})`;
}

function applyRepresentationToControls(representation, objectType) {
  if (!representation) return;
  const display = cloneDisplay(representation.display, objectType);
  if (pdbDisplayStyle) pdbDisplayStyle.value = display.style;
  setSliderValue(pdbAtomScale, display.atomScale);
  setSliderValue(pdbBondRadius, display.bondRadius);
  setSliderValue(probeRadiusInput, display.probeRadius);
  setSliderValue(surfaceResolutionInput, display.surfaceResolution);
  setSliderValue(isoLevelInput, display.isoLevel);
  if (isoPositiveColorInput) {
    isoPositiveColorInput.value = rgbToHex(display.isoPositiveColor);
  }
  if (isoNegativeColorInput) {
    isoNegativeColorInput.value = rgbToHex(display.isoNegativeColor);
  }
  setSliderValue(volumeValueMinInput, display.volumeValueMin);
  setSliderValue(volumeValueMaxInput, display.volumeValueMax);
  setSliderValue(volumeOpacityScaleInput, display.volumeOpacityScale);
  setSliderValue(volumeStepSizeInput, display.volumeStepSize);
  if (volumePositiveColorInput) {
    volumePositiveColorInput.value = rgbToHex(display.volumePositiveColor);
  }
  if (volumeNegativeColorInput) {
    volumeNegativeColorInput.value = rgbToHex(display.volumeNegativeColor);
  }
  if (volumeTransferPresetSelect) {
    volumeTransferPresetSelect.value = display.volumeTransferPreset;
  }
  if (showSheetHbondsToggle) showSheetHbondsToggle.checked = Boolean(display.showSheetHbonds);
  updateDisplayControlsVisibility();

  const material = cloneMaterial(representation.material);
  if (materialSelect) materialSelect.value = material.mode;
  setSliderValue(metallicInput, material.metallic);
  setSliderValue(roughnessInput, material.roughness);
  setSliderValue(rimBoostInput, material.rimBoost);
  setSliderValue(metallicOpacityInput, material.opacity);
  setSliderValue(matteSpecularInput, material.matteSpecular);
  setSliderValue(matteRoughnessInput, material.matteRoughness);
  setSliderValue(matteDiffuseRoughnessInput, material.matteDiffuseRoughness);
  setSliderValue(wrapDiffuseInput, material.wrapDiffuse);
  setSliderValue(surfaceIorInput, material.surfaceIor);
  setSliderValue(surfaceTransmissionInput, material.surfaceTransmission);
  setSliderValue(surfaceOpacityInput, material.surfaceOpacity);
  updateMaterialVisibility();
}

function getSelectedObject() {
  if (!sceneGraph?.selection?.objectId) return null;
  try {
    return findObject(sceneGraph, sceneGraph.selection.objectId);
  } catch {
    return null;
  }
}

function getSelectedRepresentation() {
  if (!sceneGraph?.selection || sceneGraph.selection.kind !== "representation") {
    return null;
  }
  try {
    return findRepresentation(
      sceneGraph,
      sceneGraph.selection.objectId,
      sceneGraph.selection.representationId
    );
  } catch {
    return null;
  }
}

function updateRepresentationControlsFromSelection() {
  const selectedRep = getSelectedRepresentation();
  const selectedObject = getSelectedObject();
  if (!selectedObject) {
    for (const option of Array.from(pdbDisplayStyle?.options || [])) {
      option.hidden = false;
      option.disabled = false;
    }
    updateDisplayControlsVisibility();
    if (representationSelectionHint) {
      representationSelectionHint.textContent = "Select an object or style in Project.";
    }
    if (representationActionBtn) {
      representationActionBtn.disabled = true;
      representationActionBtn.textContent = "Add Style";
    }
    return;
  }

  const objectLabel = selectedObject.label || selectedObject.type;
  updateDisplayStyleOptionsForObjectType(selectedObject.type);
  if (selectedRep) {
    if (representationSelectionHint) {
      representationSelectionHint.textContent = `Selected: ${objectLabel} / ${selectedRep.representation.name}`;
    }
    if (representationActionBtn) {
      representationActionBtn.disabled = false;
      representationActionBtn.textContent = "Update Style";
    }
    applyRepresentationToControls(selectedRep.representation, selectedObject.type);
  } else {
    if (representationSelectionHint) {
      representationSelectionHint.textContent = `Selected object: ${objectLabel}`;
    }
    if (representationActionBtn) {
      representationActionBtn.disabled = false;
      representationActionBtn.textContent = "Add Style";
    }
    updateDisplayControlsVisibility();
  }
}

function createSceneGraphRow(label, checked, selected, options = {}) {
  const className = options.className || "";
  const collapsible = Boolean(options.collapsible);
  const expanded = options.expanded !== false;
  const deletable = Boolean(options.deletable);
  const row = document.createElement("div");
  row.className = `scene-graph-row ${className}`.trim();
  if (selected) {
    row.classList.add("selected");
  }

  let toggle = null;
  if (collapsible) {
    toggle = document.createElement("button");
    toggle.type = "button";
    toggle.className = "scene-graph-toggle";
    toggle.textContent = expanded ? "▾" : "▸";
    row.appendChild(toggle);
  } else {
    const spacer = document.createElement("span");
    spacer.className = "scene-graph-toggle-spacer";
    row.appendChild(spacer);
  }

  const checkbox = document.createElement("input");
  checkbox.type = "checkbox";
  checkbox.checked = checked;
  row.appendChild(checkbox);

  const labelText = String(label || "").trim();
  const labelMatch = labelText.match(/^(.*?)(\s*\([^()]+\))$/);
  const mainLabel = labelMatch ? labelMatch[1].trim() : labelText;
  const metaLabel = labelMatch ? labelMatch[2].trim() : "";

  const labelEl = document.createElement("span");
  labelEl.className = "scene-graph-label";

  const labelMainEl = document.createElement("span");
  labelMainEl.className = "scene-graph-label-main";
  labelMainEl.textContent = mainLabel;
  labelEl.appendChild(labelMainEl);

  if (metaLabel) {
    const labelMetaEl = document.createElement("span");
    labelMetaEl.className = "scene-graph-label-meta";
    labelMetaEl.textContent = metaLabel;
    labelEl.appendChild(labelMetaEl);
  }

  row.appendChild(labelEl);

  let deleteButton = null;
  if (deletable) {
    deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "scene-graph-delete";
    deleteButton.title = "Delete";
    deleteButton.setAttribute("aria-label", "Delete");
    deleteButton.textContent = "🗑";
    row.appendChild(deleteButton);
  }

  return { row, checkbox, toggle, deleteButton };
}

async function rebuildSceneFromSceneGraph(options = {}) {
  if (!sceneGraph) {
    throw new Error("Scene graph is empty.");
  }
  const fitCamera = options.fitCamera ?? false;
  const visible = listVisibleRepresentations(sceneGraph);
  if (visible.length === 0) {
    sceneData = null;
    glState = null;
    hideHoverBoxOverlay();
    hideHoverInfoOverlay();
    resetAccumulation("No visible representations.");
    return;
  }

  const compiled = await compileSceneGraphGeometry(sceneGraph, {
    geometryCache: repGeometryCache,
    logger,
    onProgress(step, total, message) {
      setLoadingOverlay(true, `Surface ${step}/${total}: ${message}`);
    }
  });
  setLoadingOverlay(false);

  applyMaterialToRenderState(compiled.primaryMaterial);

  const positions = compiled.positions;
  const indices = compiled.indices;
  const normals = compiled.normals;
  const triColors = compiled.triColors;
  const triFlags = compiled.triFlags;
  const displaySpheres = compiled.spheres;
  const displayCylinders = compiled.cylinders;

  logger.info(
    `Compiling scene graph: ${displaySpheres.length} atoms, ${displayCylinders.length} bonds, ${indices.length / 3} triangles`
  );
  const startTime = performance.now();
  const bvh = buildUnifiedBVH(
    { positions, indices },
    displaySpheres,
    displayCylinders,
    { maxLeafSize: 4, maxDepth: 32 }
  );
  const bvhTime = performance.now() - startTime;
  logger.info(`BVH built in ${bvhTime.toFixed(1)}ms: ${bvh.nodes.length} nodes`);

  const flat = flattenBVH(bvh.nodes, bvh.primitives, bvh.triCount, bvh.sphereCount, bvh.cylinderCount);
  const volumeData = compiled.volumeData || null;

  sceneData = {
    positions,
    indices,
    normals,
    triColors,
    triFlags,
    hasSurfaceFlags: hasSurfaceFlags(triFlags),
    nodes: bvh.nodes,
    tris: bvh.tris,
    primitives: bvh.primitives,
    primIndexBuffer: flat.primIndexBuffer,
    triCount: bvh.triCount,
    sphereCount: bvh.sphereCount,
    cylinderCount: bvh.cylinderCount,
    spheres: displaySpheres,
    cylinders: displayCylinders,
    sceneScale: 1.0,
    volume: volumeData,
    volumeDisplay: compiled.volumeDisplay || null,
    pickRanges: compiled.pickRanges,
    materials: compiled.materials,
    triMaterialIndices: compiled.triMaterialIndices,
    sphereMaterialIndices: compiled.sphereMaterialIndices,
    cylinderMaterialIndices: compiled.cylinderMaterialIndices
  };
  renderState.frameIndex = 0;
  renderState.cameraDirty = true;

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  let hasBounds = false;

  for (const s of displaySpheres) {
    minX = Math.min(minX, s.center[0] - s.radius);
    minY = Math.min(minY, s.center[1] - s.radius);
    minZ = Math.min(minZ, s.center[2] - s.radius);
    maxX = Math.max(maxX, s.center[0] + s.radius);
    maxY = Math.max(maxY, s.center[1] + s.radius);
    maxZ = Math.max(maxZ, s.center[2] + s.radius);
    hasBounds = true;
  }

  for (const c of displayCylinders) {
    minX = Math.min(minX, c.p1[0] - c.radius, c.p2[0] - c.radius);
    minY = Math.min(minY, c.p1[1] - c.radius, c.p2[1] - c.radius);
    minZ = Math.min(minZ, c.p1[2] - c.radius, c.p2[2] - c.radius);
    maxX = Math.max(maxX, c.p1[0] + c.radius, c.p2[0] + c.radius);
    maxY = Math.max(maxY, c.p1[1] + c.radius, c.p2[1] + c.radius);
    maxZ = Math.max(maxZ, c.p1[2] + c.radius, c.p2[2] + c.radius);
    hasBounds = true;
  }

  for (let i = 0; i < positions.length; i += 3) {
    minX = Math.min(minX, positions[i]);
    minY = Math.min(minY, positions[i + 1]);
    minZ = Math.min(minZ, positions[i + 2]);
    maxX = Math.max(maxX, positions[i]);
    maxY = Math.max(maxY, positions[i + 1]);
    maxZ = Math.max(maxZ, positions[i + 2]);
    hasBounds = true;
  }

  if (volumeData && volumeData.bounds) {
    if (!hasBounds) {
      minX = volumeData.bounds.minX;
      minY = volumeData.bounds.minY;
      minZ = volumeData.bounds.minZ;
      maxX = volumeData.bounds.maxX;
      maxY = volumeData.bounds.maxY;
      maxZ = volumeData.bounds.maxZ;
      hasBounds = true;
    } else {
      minX = Math.min(minX, volumeData.bounds.minX);
      minY = Math.min(minY, volumeData.bounds.minY);
      minZ = Math.min(minZ, volumeData.bounds.minZ);
      maxX = Math.max(maxX, volumeData.bounds.maxX);
      maxY = Math.max(maxY, volumeData.bounds.maxY);
      maxZ = Math.max(maxZ, volumeData.bounds.maxZ);
    }
  }

  if (!hasBounds) {
    throw new Error("Could not determine scene bounds (no visible geometry).");
  }

  const bounds = { minX, minY, minZ, maxX, maxY, maxZ };
  const dx = bounds.maxX - bounds.minX;
  const dy = bounds.maxY - bounds.minY;
  const dz = bounds.maxZ - bounds.minZ;
  sceneData.sceneScale = Math.max(1e-3, Math.sqrt(dx * dx + dy * dy + dz * dz) * 0.5);
  const suggestedBias = Math.max(1e-5, sceneData.sceneScale * 1e-5);
  renderState.rayBias = suggestedBias;
  renderState.tMin = suggestedBias;
  if (fitCamera) {
    applyCameraToBounds(bounds);
  }

  updateClipRange();
  glState = null;
}

function renderSceneGraphTree() {
  if (!sceneGraphTree) {
    throw new Error("Scene graph tree container is missing.");
  }
  sceneGraphTree.innerHTML = "";

  if (!sceneGraph || !Array.isArray(sceneGraph.objects) || sceneGraph.objects.length === 0) {
    const empty = document.createElement("div");
    empty.className = "selection-hint";
    empty.textContent = "No objects loaded.";
    sceneGraphTree.appendChild(empty);
    updateRepresentationControlsFromSelection();
    return;
  }

  for (const object of sceneGraph.objects) {
    if (typeof object.expanded !== "boolean") {
      object.expanded = true;
    }
    const group = document.createElement("div");
    group.className = "scene-graph-group";
    const objectSelected = sceneGraph.selection?.kind === "object" && sceneGraph.selection.objectId === object.id;
    const { row, checkbox, toggle, deleteButton } = createSceneGraphRow(object.label, object.visible, objectSelected, {
      className: "object",
      collapsible: true,
      expanded: object.expanded,
      deletable: true
    });

    checkbox.addEventListener("click", (event) => event.stopPropagation());
    checkbox.addEventListener("change", () => {
      toggleObjectVisibility(sceneGraph, object.id, checkbox.checked);
      rebuildSceneFromSceneGraph().then(() => startRenderLoop()).catch((err) => logger.error(err.message || String(err)));
    });
    toggle?.addEventListener("click", (event) => {
      event.stopPropagation();
      object.expanded = !object.expanded;
      renderSceneGraphTree();
    });
    row.addEventListener("click", () => {
      selectObject(sceneGraph, object.id);
      renderSceneGraphTree();
    });
    deleteButton?.addEventListener("click", (event) => {
      event.stopPropagation();
      const removed = deleteObjectFromSceneGraph(sceneGraph, object.id);
      for (const rep of removed.representations || []) {
        repGeometryCache.delete(rep.id);
      }
      rebuildSceneFromSceneGraph().then(() => startRenderLoop()).catch((err) => logger.error(err.message || String(err)));
      renderSceneGraphTree();
    });
    group.appendChild(row);

    const children = document.createElement("div");
    children.className = "scene-graph-children";
    children.style.display = object.expanded ? "flex" : "none";

    for (const representation of object.representations) {
      const repSelected = (
        sceneGraph.selection?.kind === "representation"
        && sceneGraph.selection.objectId === object.id
        && sceneGraph.selection.representationId === representation.id
      );
      const repRow = createSceneGraphRow(representation.name, representation.visible, repSelected, {
        className: "rep",
        deletable: true
      });
      repRow.checkbox.addEventListener("click", (event) => event.stopPropagation());
      repRow.checkbox.addEventListener("change", () => {
        toggleRepresentationVisibility(sceneGraph, object.id, representation.id, repRow.checkbox.checked);
        rebuildSceneFromSceneGraph().then(() => startRenderLoop()).catch((err) => logger.error(err.message || String(err)));
      });
      repRow.row.addEventListener("click", () => {
        selectRepresentation(sceneGraph, object.id, representation.id);
        renderSceneGraphTree();
      });
      repRow.deleteButton?.addEventListener("click", (event) => {
        event.stopPropagation();
        const removed = deleteRepresentationFromObject(sceneGraph, object.id, representation.id);
        repGeometryCache.delete(removed.id);
        rebuildSceneFromSceneGraph().then(() => startRenderLoop()).catch((err) => logger.error(err.message || String(err)));
        renderSceneGraphTree();
      });
      children.appendChild(repRow.row);
    }
    group.appendChild(children);
    sceneGraphTree.appendChild(group);
  }

  updateRepresentationControlsFromSelection();
}

function requireNumberInput(input, label) {
  if (!input) {
    throw new Error(`${label} input is missing.`);
  }
  const value = Number(input.value);
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

function parseMolecularImport(text, filename) {
  logger.info(`Parsing molecular file: ${filename}`);
  requireSupportedImportFilename(filename);

  const sourceKind = inferSourceKind(filename);
  if (!sourceKind) {
    throw new Error(`Unsupported source kind for file: ${filename}`);
  }
  let molData = null;
  let volumeData = null;

  if (sourceKind === "cube") {
    const parsedCube = parseCubeFile(text);
    molData = parsedCube.molData;
    volumeData = parsedCube.volumeData;
  } else {
    molData = parseAutoDetect(text, filename);
    volumeData = null;
  }

  logger.info(`Parsed ${molData.atoms.length} atoms, ${molData.bonds.length} bonds`);
  if (volumeData) {
    const [nx, ny, nz] = volumeData.dims;
    logger.info(`Parsed volume grid: ${nx}x${ny}x${nz}`);
  }

  return { sourceKind, molData, volumeData };
}

function appendParsedImportToSceneGraph(parsedImport) {
  if (!parsedImport || !parsedImport.molData) {
    throw new Error("Parsed import payload is invalid.");
  }
  const { sourceKind, molData, volumeData } = parsedImport;
  const options = {
    sourceKind,
    volumeGrids: volumeData ? [volumeData] : []
  };

  if (!sceneGraph || !Array.isArray(sceneGraph.objects) || sceneGraph.objects.length === 0) {
    sceneGraph = createSceneGraphFromMolData(molData, options);
  } else {
    appendSceneGraphFromMolData(sceneGraph, molData, options);
  }

  currentMolMeta = { sourceKind, volumeData };
}

async function importMolecularFiles(files, options = {}) {
  const fileList = Array.from(files || []);
  if (fileList.length === 0) {
    throw new Error("No files provided for import.");
  }

  const parsedImports = [];
  for (const file of fileList) {
    const text = await file.text();
    parsedImports.push({
      fileName: file.name,
      parsed: parseMolecularImport(text, file.name)
    });
  }

  const hadScene = Boolean(sceneGraph && Array.isArray(sceneGraph.objects) && sceneGraph.objects.length > 0);
  const shouldFitCamera = options.fitCamera ?? !hadScene;

  for (const item of parsedImports) {
    appendParsedImportToSceneGraph(item.parsed);
    logger.info(`Imported ${item.fileName} and appended to Project.`);
  }

  renderSceneGraphTree();
  await rebuildSceneFromSceneGraph({ fitCamera: shouldFitCamera });
  logger.info(`Import complete. Added ${parsedImports.length} file(s) to Project.`);
}

async function loadMolecularFile(text, filename) {
  const parsed = parseMolecularImport(text, filename);
  appendParsedImportToSceneGraph(parsed);
  renderSceneGraphTree();
  await rebuildSceneFromSceneGraph({ fitCamera: true });
  logger.info("Molecular structure loaded.");
}

/**
 * Fetch and load a PDB file by ID from RCSB.
 */
async function loadPDBById(pdbId) {
  logger.info(`Fetching PDB: ${pdbId}`);
  const molData = await fetchPDB(pdbId);
  logger.info(`Parsed ${molData.atoms.length} atoms, ${molData.bonds.length} bonds`);

  const volumeData = null;
  sceneGraph = createSceneGraphFromMolData(molData, {
    sourceKind: "pdb",
    volumeGrids: []
  });
  currentMolMeta = { sourceKind: "pdb", volumeData };
  repGeometryCache.clear();
  renderSceneGraphTree();
  await rebuildSceneFromSceneGraph({ fitCamera: true });
}

/**
 * Load a built-in small molecule by name.
 */
async function loadBuiltinMolecule(name) {
  logger.info(`Loading built-in molecule: ${name}`);
  const molData = getBuiltinMolecule(name);
  logger.info(`Parsed ${molData.atoms.length} atoms, ${molData.bonds.length} bonds`);
  sceneGraph = createSceneGraphFromMolData(molData, {
    sourceKind: "sdf",
    volumeGrids: []
  });
  currentMolMeta = { sourceKind: "sdf", volumeData: null };
  repGeometryCache.clear();
  renderSceneGraphTree();
  await rebuildSceneFromSceneGraph({ fitCamera: true });
}

// Expose for debugging in console
window.loadMolecularFile = loadMolecularFile;
window.loadPDBById = loadPDBById;
window.loadBuiltinMolecule = loadBuiltinMolecule;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

const uiController = createUiController({
  tabButtons,
  tabPanels,
  materialSelect,
  dofEnableToggle,
  maxFramesInput,
  clipDistanceInput,
  renderState,
  clamp,
  getSceneData: () => sceneData
});

const {
  setActiveTab,
  updateMaterialVisibility,
  updateDofVisibility,
  setSliderValue,
  updateRenderLimits,
  updateClipRange
} = uiController;

const inputController = createInputController({
  canvas,
  pointerState,
  clamp
});

const {
  isTextEntryTarget,
  updatePointerFromMouseEvent,
  normalizeVec3,
  buildCameraRayFromCanvasPixel
} = inputController;

function setLoadingOverlay(visible, message = "Loading...") {
  if (!loadingOverlay) return;
  if (visible) {
    loadingOverlay.textContent = message;
    loadingOverlay.style.display = "block";
  } else {
    loadingOverlay.style.display = "none";
  }
}

function markInteractionActive(time = performance.now()) {
  interactionState.lastActive = time;
}

function isCameraInteracting(time = performance.now()) {
  if (inputState.dragging || inputState.keys.size > 0) {
    return true;
  }
  return time - interactionState.lastActive < 120;
}

function hexToRgb(hex) {
  const value = hex.startsWith("#") ? hex.slice(1) : hex;
  if (value.length !== 6) return [1, 1, 1];
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return [r / 255, g / 255, b / 255];
}

function rgbToHex(rgb) {
  if (!Array.isArray(rgb) || rgb.length !== 3) {
    return "#ffffff";
  }
  const toChannel = (v) => {
    const n = Math.max(0, Math.min(255, Math.round(Number(v) * 255)));
    return n.toString(16).padStart(2, "0");
  };
  return `#${toChannel(rgb[0])}${toChannel(rgb[1])}${toChannel(rgb[2])}`;
}

// Deprecated: kept for potential world-space lights.
function lightDirFromAngles(azimuthDeg, elevationDeg) {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  const x = Math.cos(el) * Math.sin(az);
  const y = Math.sin(el);
  const z = Math.cos(el) * Math.cos(az);
  return [x, y, z];
}

function resetAccumulation(reason) {
  renderState.frameIndex = 0;
  renderState.cameraDirty = true;
  resetFpsStats();
  if (renderOverlay) {
    renderOverlay.style.display = "none";
  }
  if (reason) {
    logger.info(reason);
  }
}

function updateRenderModeUi() {
  const mode = renderModeController.getMode();
  renderModePathtracingBtn?.classList.toggle("active", mode === RENDER_MODES.PATHTRACING);
  renderModePreviewBtn?.classList.toggle("active", mode === RENDER_MODES.PREVIEW);
  if (hiresRenderBtn) {
    const isPreview = renderModeController.isPreview();
    hiresRenderBtn.disabled = isPreview;
    hiresRenderBtn.title = isPreview ? "Hi-res export is available in Pathtracing mode." : "";
  }
}

function updateMaterialState() {
  renderState.maxBounces = clamp(Number(maxBouncesInput.value), 0, 6);
  renderState.exposure = clamp(Number(exposureInput.value), 0, 5);
  const fovDeg = requireNumberInput(cameraFovInput, "Camera FOV");
  if (fovDeg < 20.0 || fovDeg > 100.0) {
    throw new Error("Camera FOV must be between 20 and 100 degrees.");
  }
  cameraState.fov = (fovDeg * Math.PI) / 180.0;
  renderState.dofEnabled = dofEnableToggle?.checked ?? false;
  const dofAperture = requireNumberInput(dofApertureInput, "Depth-of-field aperture");
  const dofFocusDistance = requireNumberInput(dofFocusDistanceInput, "Depth-of-field focus distance");
  if (dofAperture < 0.0 || dofAperture > 1.0) {
    throw new Error("Depth-of-field aperture must be between 0 and 1.0.");
  }
  if (dofFocusDistance <= 0.0 || dofFocusDistance > 1000.0) {
    throw new Error("Depth-of-field focus distance must be > 0 and <= 1000.");
  }
  renderState.dofAperture = dofAperture;
  renderState.dofFocusDistance = dofFocusDistance;
  renderState.ambientIntensity = clamp(Number(ambientIntensityInput.value), 0, 2);
  renderState.ambientColor = hexToRgb(ambientColorInput.value);
  renderState.envIntensity = clamp(Number(envIntensityInput.value), 0, 1.0);
  renderState.envBgIntensity = clamp(Number(envBgIntensityInput?.value ?? 1.0), 0, 2.0);
  renderState.useBvh = true;
  renderState.rayBias = clamp(renderState.rayBias, 1e-7, 1);
  renderState.tMin = clamp(renderState.tMin, 1e-7, 1);
  renderState.samplesPerBounce = clamp(Number(samplesPerBounceInput.value), 1, 8);
  renderState.castShadows = shadowToggle.checked;
  renderState.toneMap = toneMapSelect?.value || "reinhard";
  renderState.edgeAccent = clamp(Number(edgeAccentInput?.value ?? 0.0), 0.0, 1.0);
  resetAccumulation("Render settings updated.");
}

function updatePreviewQualityState() {
  renderState.previewShadows = previewShadowsToggle?.checked ?? true;
  renderState.previewSsr = previewSsrToggle?.checked ?? false;
  renderState.previewLightIntensity = clamp(Number(previewLightIntensityInput?.value ?? 1.0), 0.0, 2.0);
  resetAccumulation("Preview quality updated.");
}

function getEffectiveEdgeAccentStrength() {
  if (renderState.dofEnabled) {
    return 0.0;
  }
  if (isCameraInteracting()) {
    return 0.0;
  }
  return renderState.edgeAccent;
}

function updateVolumeState() {
  if (!volumeEnableToggle) {
    throw new Error("Volume controls are missing.");
  }
  renderState.volumeEnabled = volumeEnableToggle.checked;
  if (!volumeColorInput) {
    throw new Error("Volume color input is missing.");
  }
  renderState.volumeColor = hexToRgb(volumeColorInput.value);

  const density = requireNumberInput(volumeDensityInput, "Volume density");
  const opacity = requireNumberInput(volumeOpacityInput, "Volume opacity");
  const step = requireNumberInput(volumeStepInput, "Volume step");
  const maxSteps = requireNumberInput(volumeMaxStepsInput, "Volume max steps");
  const threshold = requireNumberInput(volumeThresholdInput, "Volume threshold");

  if (density < 0) {
    throw new Error("Volume density must be >= 0.");
  }
  if (opacity < 0) {
    throw new Error("Volume opacity must be >= 0.");
  }
  if (step <= 0) {
    throw new Error("Volume step must be > 0.");
  }
  if (maxSteps <= 0) {
    throw new Error("Volume max steps must be > 0.");
  }
  if (threshold < 0 || threshold > 1) {
    throw new Error("Volume threshold must be between 0 and 1.");
  }

  renderState.volumeDensity = density;
  renderState.volumeOpacity = opacity;
  renderState.volumeStep = step;
  renderState.volumeMaxSteps = Math.floor(maxSteps);
  renderState.volumeThreshold = threshold;

  if (renderState.volumeEnabled && sceneData && !sceneData.volume) {
    logger.warn("Volume enabled but no volume data is available. Enable a volumetric representation.");
  }

  resetAccumulation("Volume settings updated.");
}

function applyMaterialPreset(mode) {
  if (mode !== "translucent-plastic") return;
  // Dielectric translucent plastic defaults.
  setSliderValue(metallicInput, 0.0);
  setSliderValue(roughnessInput, 0.22);
  setSliderValue(rimBoostInput, 0.0);
  setSliderValue(surfaceIorInput, 1.0);
  setSliderValue(surfaceTransmissionInput, 0.55);
  setSliderValue(surfaceOpacityInput, 0.15);
  logger.info("Applied preset: Translucent Plastic");
}

function mapVolumeTransferPresetToUniform(preset) {
  if (preset === "orbital") return 0;
  if (preset === "grayscale") return 1;
  if (preset === "heatmap") return 2;
  return 0;
}

function buildRepresentationPatchFromUi(objectType) {
  const display = cloneDisplay(getDisplaySettingsFromControls(), objectType);
  const material = cloneMaterial(getMaterialSettingsFromControls());
  return {
    name: autoRepresentationName(display, material),
    display,
    material
  };
}

async function modifySelectedRepresentationFromUi() {
  if (!sceneGraph || sceneGraph.selection?.kind !== "representation") {
    throw new Error("Select a representation first.");
  }
  const object = findObject(sceneGraph, sceneGraph.selection.objectId);
  const patch = buildRepresentationPatchFromUi(object.type);
  updateRepresentation(sceneGraph, object.id, sceneGraph.selection.representationId, patch);
  repGeometryCache.delete(sceneGraph.selection.representationId);
  applyMaterialToRenderState(patch.material);
  updateMaterialState();
  await rebuildSceneFromSceneGraph();
  renderSceneGraphTree();
  resetAccumulation("Representation updated.");
}

async function addRepresentationFromUi() {
  if (!sceneGraph || sceneGraph.selection?.kind !== "object") {
    throw new Error("Select an object to add a representation.");
  }
  const objectId = sceneGraph.selection.objectId;
  const newRep = addRepresentationToObject(sceneGraph, objectId);
  const object = findObject(sceneGraph, objectId);
  const patch = buildRepresentationPatchFromUi(object.type);
  updateRepresentation(sceneGraph, objectId, newRep.id, patch);
  repGeometryCache.delete(newRep.id);
  applyMaterialToRenderState(patch.material);
  updateMaterialState();
  await rebuildSceneFromSceneGraph();
  renderSceneGraphTree();
  resetAccumulation("Representation added.");
}

async function applyRepresentationActionFromSelection() {
  if (!sceneGraph || !sceneGraph.selection) {
    throw new Error("Select an object or representation first.");
  }
  if (sceneGraph.selection.kind === "representation") {
    await modifySelectedRepresentationFromUi();
    return;
  }
  if (sceneGraph.selection.kind === "object") {
    await addRepresentationFromUi();
    return;
  }
  throw new Error("Unsupported scene graph selection.");
}

function updateClipState({ preserveLock = false } = {}) {
  renderState.clipEnabled = clipEnableToggle?.checked || false;
  renderState.clipDistance = clamp(Number(clipDistanceInput?.value ?? 0), 0, 1e6);
  const lock = clipLockToggle?.checked || false;
  if (lock) {
    const cam = computeCameraVectors();
    if (!renderState.clipLocked || !renderState.clipLockedNormal || !preserveLock) {
      const len = Math.hypot(cam.forward[0], cam.forward[1], cam.forward[2]) || 1;
      renderState.clipLockedNormal = [cam.forward[0] / len, cam.forward[1] / len, cam.forward[2] / len];
    }
    const n = renderState.clipLockedNormal;
    if (n) {
      const planePoint = [
        cam.origin[0] + n[0] * renderState.clipDistance,
        cam.origin[1] + n[1] * renderState.clipDistance,
        cam.origin[2] + n[2] * renderState.clipDistance
      ];
      renderState.clipLockedOffset = n[0] * planePoint[0] + n[1] * planePoint[1] + n[2] * planePoint[2];
      const camSide = n[0] * cam.origin[0] + n[1] * cam.origin[1] + n[2] * cam.origin[2] - renderState.clipLockedOffset;
      renderState.clipLockedSide = camSide >= 0 ? 1 : -1;
    }
  } else {
    renderState.clipLockedNormal = null;
    renderState.clipLockedOffset = null;
    renderState.clipLockedSide = null;
  }
  renderState.clipLocked = lock;
  resetAccumulation("Clipping plane updated.");
}

const environmentController = createEnvironmentController({
  envSelect,
  envIntensityInput,
  envBgIntensityInput,
  envUniformColorInput,
  envRotationInput,
  envRotationVerticalInput,
  envMaxLumInput,
  analyticSkyResolutionSelect,
  analyticSkyTurbidityInput,
  analyticSkySunAzimuthInput,
  analyticSkySunElevationInput,
  analyticSkyIntensityInput,
  analyticSkySunIntensityInput,
  analyticSkySunRadiusInput,
  analyticSkyGroundAlbedoInput,
  analyticSkyHorizonSoftnessInput,
  renderState,
  envCache,
  logger,
  clamp,
  requireNumberInput,
  setLoadingOverlay,
  resetAccumulation,
  createEnvTexture,
  createCdfTexture,
  getGlState: () => glState
});

const {
  updateEnvironmentVisibility,
  uploadEnvironmentToGl,
  updateEnvironmentState,
  loadEnvManifest
} = environmentController;

function updateLightState() {
  renderState.lights[0] = {
    enabled: light1Enable.checked,
    azimuth: Number(light1Azimuth.value),
    elevation: Number(light1Elevation.value),
    intensity: clamp(Number(light1Intensity.value), 0, 20),
    angle: clamp(Number(light1Extent.value), 0, 60),
    color: hexToRgb(light1Color.value)
  };
  renderState.lights[1] = {
    enabled: light2Enable.checked,
    azimuth: Number(light2Azimuth.value),
    elevation: Number(light2Elevation.value),
    intensity: clamp(Number(light2Intensity.value), 0, 20),
    angle: clamp(Number(light2Extent.value), 0, 60),
    color: hexToRgb(light2Color.value)
  };
  resetAccumulation("Lighting updated.");
}

function computeBounds(positions) {
  if (!positions || positions.length < 3) return null;
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }
  return { minX, minY, minZ, maxX, maxY, maxZ };
}

function applyCameraToBounds(bounds) {
  const cx = (bounds.minX + bounds.maxX) * 0.5;
  const cy = (bounds.minY + bounds.maxY) * 0.5;
  const cz = (bounds.minZ + bounds.maxZ) * 0.5;
  const dx = bounds.maxX - bounds.minX;
  const dy = bounds.maxY - bounds.minY;
  const dz = bounds.maxZ - bounds.minZ;
  const radius = Math.max(1e-3, Math.sqrt(dx * dx + dy * dy + dz * dz) * 0.5);
  const fitDistance = radius / Math.tan(cameraState.fov / 2) * 1.4;
  const distance = fitDistance / AUTO_FIT_ZOOM_FACTOR;
  cameraState.target = [cx, cy, cz];
  cameraState.distance = distance;
  // Pitch camera down ~15 degrees so we look slightly upward into the sky
  cameraState.rotation = quatFromAxisAngle([1, 0, 0], -15 * Math.PI / 180);
  renderState.cameraDirty = true;
  renderState.frameIndex = 0;
  logger.info(
    `Camera fit to bounds center (${cx.toFixed(2)}, ${cy.toFixed(2)}, ${cz.toFixed(2)}) radius ${radius.toFixed(2)}`
  );
}

function computePCA(positions) {
  const n = positions.length;
  if (n === 0) return { centroid: [0,0,0], axes: [[1,0,0],[0,1,0],[0,0,1]] };

  // Centroid
  let cx = 0, cy = 0, cz = 0;
  for (const p of positions) { cx += p[0]; cy += p[1]; cz += p[2]; }
  cx /= n; cy /= n; cz /= n;

  // Covariance matrix (symmetric 3x3)
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const p of positions) {
    const dx = p[0] - cx, dy = p[1] - cy, dz = p[2] - cz;
    xx += dx*dx; xy += dx*dy; xz += dx*dz;
    yy += dy*dy; yz += dy*dz; zz += dz*dz;
  }

  // Power iteration for eigenvectors with deflation
  function powerIteration(mxx, mxy, mxz, myy, myz, mzz, seed) {
    let v = seed.slice();
    for (let i = 0; i < 30; i++) {
      const nx = mxx*v[0] + mxy*v[1] + mxz*v[2];
      const ny = mxy*v[0] + myy*v[1] + myz*v[2];
      const nz = mxz*v[0] + myz*v[1] + mzz*v[2];
      const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
      if (len < 1e-12) break;
      v = [nx/len, ny/len, nz/len];
    }
    const ev = (mxx*v[0]+mxy*v[1]+mxz*v[2])*v[0]
             + (mxy*v[0]+myy*v[1]+myz*v[2])*v[1]
             + (mxz*v[0]+myz*v[1]+mzz*v[2])*v[2];
    return { vec: v, val: ev };
  }

  function deflate(mxx, mxy, mxz, myy, myz, mzz, vec, val) {
    return [
      mxx - val*vec[0]*vec[0], mxy - val*vec[0]*vec[1], mxz - val*vec[0]*vec[2],
      myy - val*vec[1]*vec[1], myz - val*vec[1]*vec[2],
      mzz - val*vec[2]*vec[2]
    ];
  }

  const e1 = powerIteration(xx, xy, xz, yy, yz, zz, [1, 0.1, 0.05]);
  const [dxx, dxy, dxz, dyy, dyz, dzz] = deflate(xx, xy, xz, yy, yz, zz, e1.vec, e1.val);
  const e2 = powerIteration(dxx, dxy, dxz, dyy, dyz, dzz, [0.05, 1, 0.1]);
  // e3 = e1 × e2 (orthogonal by construction)
  const e3vec = [
    e1.vec[1]*e2.vec[2] - e1.vec[2]*e2.vec[1],
    e1.vec[2]*e2.vec[0] - e1.vec[0]*e2.vec[2],
    e1.vec[0]*e2.vec[1] - e1.vec[1]*e2.vec[0]
  ];
  const e3len = Math.hypot(e3vec[0], e3vec[1], e3vec[2]) || 1;
  const e3 = [e3vec[0]/e3len, e3vec[1]/e3len, e3vec[2]/e3len];

  // axes[0]=PC1 (largest), axes[1]=PC2 (medium), axes[2]=PC3 (smallest)
  return { centroid: [cx, cy, cz], axes: [e1.vec, e2.vec, e3] };
}

function quatFromBasis(right, up, forward) {
  const m00 = right[0], m01 = up[0], m02 = forward[0];
  const m10 = right[1], m11 = up[1], m12 = forward[1];
  const m20 = right[2], m21 = up[2], m22 = forward[2];
  const trace = m00 + m11 + m22;
  let qw, qx, qy, qz;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    qw = 0.25 / s;
    qx = (m21 - m12) * s;
    qy = (m02 - m20) * s;
    qz = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    qw = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }
  return normalizeQuat([qx, qy, qz, qw]);
}

function normalizeQuat(q) {
  const len = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  return [q[0] / len, q[1] / len, q[2] / len, q[3] / len];
}

function quatFromAxisAngle(axis, angle) {
  const half = angle * 0.5;
  const s = Math.sin(half);
  return normalizeQuat([axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(half)]);
}

function quatMultiply(a, b) {
  const ax = a[0], ay = a[1], az = a[2], aw = a[3];
  const bx = b[0], by = b[1], bz = b[2], bw = b[3];
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz
  ];
}

function quatRotateVec(q, v) {
  const qx = q[0], qy = q[1], qz = q[2], qw = q[3];
  const vx = v[0], vy = v[1], vz = v[2];
  const tx = 2 * (qy * vz - qz * vy);
  const ty = 2 * (qz * vx - qx * vz);
  const tz = 2 * (qx * vy - qy * vx);
  return [
    vx + qw * tx + (qy * tz - qz * ty),
    vy + qw * ty + (qz * tx - qx * tz),
    vz + qw * tz + (qx * ty - qy * tx)
  ];
}

function computeCameraVectors() {
  const { rotation, distance, target, fov, width, height } = cameraState;
  const forward = quatRotateVec(rotation, [0, 0, 1]);
  const origin = [
    target[0] - forward[0] * distance,
    target[1] - forward[1] * distance,
    target[2] - forward[2] * distance
  ];

  const up = quatRotateVec(rotation, [0, 1, 0]);
  const right = [
    forward[1] * up[2] - forward[2] * up[1],
    forward[2] * up[0] - forward[0] * up[2],
    forward[0] * up[1] - forward[1] * up[0]
  ];
  const rightLen = Math.hypot(right[0], right[1], right[2]) || 1;
  right[0] /= rightLen;
  right[1] /= rightLen;
  right[2] /= rightLen;

  const upOrtho = [
    right[1] * forward[2] - right[2] * forward[1],
    right[2] * forward[0] - right[0] * forward[2],
    right[0] * forward[1] - right[1] * forward[0]
  ];

  const aspect = width / height;
  const scale = Math.tan(fov / 2);
  const rightScaled = [right[0] * scale * aspect, right[1] * scale * aspect, right[2] * scale * aspect];
  const upScaled = [upOrtho[0] * scale, upOrtho[1] * scale, upOrtho[2] * scale];

  return {
    origin,
    forward: [forward[0], forward[1], forward[2]],
    right: rightScaled,
    up: upScaled,
    width,
    height
  };
}

function updateCameraFromInput(dt) {
  if (inputState.keys.size === 0) return false;
  const moveSpeed = cameraState.distance * 0.6 * dt;
  const orbit = computeCameraVectors();
  const forward = [orbit.forward[0], orbit.forward[1], orbit.forward[2]];
  const right = [
    orbit.right[0] / Math.hypot(orbit.right[0], orbit.right[1], orbit.right[2]),
    orbit.right[1] / Math.hypot(orbit.right[0], orbit.right[1], orbit.right[2]),
    orbit.right[2] / Math.hypot(orbit.right[0], orbit.right[1], orbit.right[2])
  ];

  let moved = false;

  if (inputState.keys.has("w")) {
    cameraState.target[0] += forward[0] * moveSpeed;
    cameraState.target[1] += forward[1] * moveSpeed;
    cameraState.target[2] += forward[2] * moveSpeed;
    moved = true;
  }
  if (inputState.keys.has("s")) {
    cameraState.target[0] -= forward[0] * moveSpeed;
    cameraState.target[1] -= forward[1] * moveSpeed;
    cameraState.target[2] -= forward[2] * moveSpeed;
    moved = true;
  }
  if (inputState.keys.has("a")) {
    cameraState.target[0] -= right[0] * moveSpeed;
    cameraState.target[1] -= right[1] * moveSpeed;
    cameraState.target[2] -= right[2] * moveSpeed;
    moved = true;
  }
  if (inputState.keys.has("d")) {
    cameraState.target[0] += right[0] * moveSpeed;
    cameraState.target[1] += right[1] * moveSpeed;
    cameraState.target[2] += right[2] * moveSpeed;
    moved = true;
  }
  if (inputState.keys.has("q") || inputState.keys.has("e")) {
    const rollSpeed = 1.5 * dt; // radians per second
    const rollAngle = inputState.keys.has("q") ? rollSpeed : -rollSpeed;
    const rollQuat = quatFromAxisAngle(forward, rollAngle);
    cameraState.rotation = normalizeQuat(quatMultiply(rollQuat, cameraState.rotation));
    moved = true;
  }

  return moved;
}

function applyOrbitDrag(dx, dy) {
  cameraState.rotation = applyOrbitDragToRotation(cameraState.rotation, dx, dy);
}

function tracePointerHit(camera) {
  if (!sceneData) {
    return null;
  }
  const rayDir = buildCameraRayFromCanvasPixel(camera, pointerState.x, pointerState.y);
  const clip = getActiveClipPlane(camera);
  return traceSceneRay(sceneData, camera.origin, rayDir, {
    tMin: Math.max(1e-6, renderState.tMin),
    clip: clip.enabled ? { normal: clip.normal, offset: clip.offset, side: clip.side, enabled: true } : null
  });
}

function getActiveClipPlane(camera) {
  const enabled = Boolean(renderState.clipEnabled);
  const camForward = normalizeVec3(camera.forward);
  let normal = camForward;
  let offset = 0.0;
  let side = 1.0;

  if (renderState.clipLocked && renderState.clipLockedNormal) {
    normal = normalizeVec3(renderState.clipLockedNormal);
    if (renderState.clipLockedOffset != null) {
      offset = renderState.clipLockedOffset;
    }
    if (renderState.clipLockedSide != null) {
      side = renderState.clipLockedSide;
    }
  }

  if (enabled && !(renderState.clipLocked && renderState.clipLockedOffset != null)) {
    const planePoint = [
      camera.origin[0] + normal[0] * renderState.clipDistance,
      camera.origin[1] + normal[1] * renderState.clipDistance,
      camera.origin[2] + normal[2] * renderState.clipDistance
    ];
    offset = normal[0] * planePoint[0] + normal[1] * planePoint[1] + normal[2] * planePoint[2];
  }

  if (enabled && !(renderState.clipLocked && renderState.clipLockedSide != null)) {
    const camSide = normal[0] * camera.origin[0] + normal[1] * camera.origin[1] + normal[2] * camera.origin[2] - offset;
    side = camSide >= 0 ? 1 : -1;
  }

  return { enabled, normal, offset, side };
}

function hideHoverInfoOverlay() {
  if (!hoverInfoOverlay) return;
  hoverInfoOverlay.style.display = "none";
}

function hideHoverBoxOverlay() {
  if (!hoverBoxOverlay) return;
  hoverBoxOverlay.style.display = "none";
}

const HOVER_KEY_HINTS = Object.freeze([
  "F: focus",
  "C: center",
  "1/2/3: PCA align"
]);

function drawHoverInfoOverlay(label, hints = HOVER_KEY_HINTS) {
  if (!hoverInfoOverlay || !label) return;
  hoverInfoOverlay.innerHTML = "";

  const title = document.createElement("div");
  title.className = "hover-info-title";
  title.textContent = label;
  hoverInfoOverlay.appendChild(title);

  if (Array.isArray(hints) && hints.length > 0) {
    const hintLine = document.createElement("div");
    hintLine.className = "hover-info-hints";
    hintLine.textContent = hints.join("   ");
    hoverInfoOverlay.appendChild(hintLine);
  }

  hoverInfoOverlay.style.display = "block";
}

function drawHoverBoxOverlay(box) {
  if (!hoverBoxOverlay || !canvas || !canvasContainer) return;
  const canvasRect = canvas.getBoundingClientRect();
  const containerRect = canvasContainer.getBoundingClientRect();
  const offsetLeft = canvasRect.left - containerRect.left;
  const offsetTop = canvasRect.top - containerRect.top;
  hoverBoxOverlay.style.left = `${offsetLeft + box.minX}px`;
  hoverBoxOverlay.style.top = `${offsetTop + box.minY}px`;
  hoverBoxOverlay.style.width = `${box.width}px`;
  hoverBoxOverlay.style.height = `${box.height}px`;
  hoverBoxOverlay.style.display = "block";
}

function getHoverObjectLabelFromRange(range) {
  const fromLabel = String(range?.objectLabel || "").replace(/\s*\([^)]*\)\s*$/, "").trim();
  if (fromLabel.length > 0) {
    return fromLabel;
  }
  const objectType = String(range?.objectType || "");
  if (OBJECT_TYPE_LABELS[objectType]) {
    return OBJECT_TYPE_LABELS[objectType];
  }
  return "Object";
}

function getSceneObjectByRange(range) {
  if (!range?.objectId || !sceneGraph?.objects) {
    return null;
  }
  return sceneGraph.objects.find((object) => object.id === range.objectId) || null;
}

function atomChainLabel(atom) {
  const chain = String(atom?.chainId || "").trim();
  return chain.length > 0 ? chain : "?";
}

function atomResidueLabel(atom) {
  const name = String(atom?.resName || "").trim() || "RES";
  const seqValue = Number(atom?.resSeq);
  const seq = Number.isFinite(seqValue)
    ? String(Math.trunc(seqValue))
    : (String(atom?.resSeq || "").trim() || "?");
  const insertion = String(atom?.iCode || "").trim();
  return `${name}${seq}${insertion}`;
}

function atomNameLabel(atom) {
  const atomName = String(atom?.name || "").trim();
  if (atomName.length > 0) {
    return atomName;
  }
  return String(atom?.element || "").trim() || "atom";
}

function formatAtomPath(atom) {
  return `${atomChainLabel(atom)} -> ${atomResidueLabel(atom)} -> ${atomNameLabel(atom)}`;
}

function formatShortAtomLabel(atom) {
  return `${atomChainLabel(atom)}:${atomResidueLabel(atom)}:${atomNameLabel(atom)}`;
}

function getHoverLabelForHit(hit) {
  if (!sceneData) {
    return null;
  }
  const range = findPrimitivePickRange(sceneData.pickRanges, hit.primType, hit.primIndex);
  if (!range) {
    return `${primTypeLabel(hit.primType)} ${hit.primIndex}`;
  }

  const objectLabel = getHoverObjectLabelFromRange(range);
  const sceneObject = getSceneObjectByRange(range);
  const atoms = sceneObject?.molData?.atoms;
  const localIndex = hit.primIndex - range.start;

  if (hit.primType === PRIM_SPHERE && range.sphereAtomIndices && Array.isArray(atoms)) {
    const atomIndex = range.sphereAtomIndices[localIndex];
    const atom = Number.isInteger(atomIndex) ? atoms[atomIndex] : null;
    if (atom) {
      return `${objectLabel} [${formatAtomPath(atom)}]`;
    }
  }

  if (hit.primType === PRIM_CYLINDER && range.cylinderBondAtomPairs && Array.isArray(atoms)) {
    const bondPair = range.cylinderBondAtomPairs[localIndex];
    if (Array.isArray(bondPair) && bondPair.length === 2) {
      const atomA = atoms[bondPair[0]];
      const atomB = atoms[bondPair[1]];
      if (atomA && atomB) {
        const sameResidue = atomChainLabel(atomA) === atomChainLabel(atomB)
          && atomResidueLabel(atomA) === atomResidueLabel(atomB);
        if (sameResidue) {
          return `${objectLabel} [${atomChainLabel(atomA)} -> ${atomResidueLabel(atomA)} -> ${atomNameLabel(atomA)}-${atomNameLabel(atomB)}]`;
        }
        return `${objectLabel} [${formatShortAtomLabel(atomA)} -> ${formatShortAtomLabel(atomB)}]`;
      }
    }
  }

  const repName = String(range.representationName || "").trim();
  if (repName.length > 0) {
    return `${objectLabel} [${repName}]`;
  }
  return objectLabel;
}

function getPrimitiveFocusPoint(hit) {
  if (!sceneData) {
    throw new Error("No scene is available for primitive focus point lookup.");
  }
  if (hit.primType === PRIM_SPHERE) {
    const sphere = sceneData.spheres[hit.primIndex];
    if (!sphere) {
      throw new Error(`Cannot focus sphere ${hit.primIndex}: primitive is missing.`);
    }
    return [sphere.center[0], sphere.center[1], sphere.center[2]];
  }
  if (hit.primType === PRIM_CYLINDER) {
    const cylinder = sceneData.cylinders[hit.primIndex];
    if (!cylinder) {
      throw new Error(`Cannot focus cylinder ${hit.primIndex}: primitive is missing.`);
    }
    return [
      (cylinder.p1[0] + cylinder.p2[0]) * 0.5,
      (cylinder.p1[1] + cylinder.p2[1]) * 0.5,
      (cylinder.p1[2] + cylinder.p2[2]) * 0.5
    ];
  }
  if (hit.primType === PRIM_TRIANGLE) {
    const tri = sceneData.tris[hit.primIndex];
    if (!tri) {
      throw new Error(`Cannot focus triangle ${hit.primIndex}: primitive is missing.`);
    }
    const i0 = tri[0] * 3;
    const i1 = tri[1] * 3;
    const i2 = tri[2] * 3;
    return [
      (sceneData.positions[i0] + sceneData.positions[i1] + sceneData.positions[i2]) / 3,
      (sceneData.positions[i0 + 1] + sceneData.positions[i1 + 1] + sceneData.positions[i2 + 1]) / 3,
      (sceneData.positions[i0 + 2] + sceneData.positions[i1 + 2] + sceneData.positions[i2 + 2]) / 3
    ];
  }
  throw new Error(`Unknown primitive type ${hit.primType} for focus point lookup.`);
}

function updateHoverBoxOverlay(camera = null) {
  if ((!hoverBoxOverlay && !hoverInfoOverlay) || !canvas) return;
  if (!sceneData || !pointerState.overCanvas) {
    hideHoverBoxOverlay();
    hideHoverInfoOverlay();
    return;
  }

  const activeCamera = camera || computeCameraVectors();
  const hit = tracePointerHit(activeCamera);
  if (!hit) {
    hideHoverBoxOverlay();
    hideHoverInfoOverlay();
    return;
  }

  const canvasWidth = Math.max(1, Math.floor(canvas.clientWidth));
  const canvasHeight = Math.max(1, Math.floor(canvas.clientHeight));
  const bounds = computePrimitiveWorldBounds(sceneData, hit.primType, hit.primIndex);
  const box = projectAabbToCanvasRect(bounds, activeCamera, canvasWidth, canvasHeight);
  if (!box) {
    hideHoverBoxOverlay();
    hideHoverInfoOverlay();
    return;
  }
  drawHoverBoxOverlay(box);
  const hoverLabel = getHoverLabelForHit(hit);
  if (hoverLabel) {
    drawHoverInfoOverlay(hoverLabel);
  } else {
    hideHoverInfoOverlay();
  }
}

function safeUpdateHoverBoxOverlay(camera = null) {
  try {
    updateHoverBoxOverlay(camera);
    hoverOverlayErrorMessage = null;
  } catch (err) {
    hideHoverBoxOverlay();
    hideHoverInfoOverlay();
    const msg = err?.message || String(err);
    if (hoverOverlayErrorMessage !== msg) {
      hoverOverlayErrorMessage = msg;
      logger.warn(`[hover] ${msg}`);
    }
  }
}

function centerOrbitFromMouseRay() {
  if (!sceneData) {
    logger.warn("Orbit center not updated: no scene is loaded.");
    return;
  }
  if (!pointerState.overCanvas) {
    logger.info("Orbit center not updated: mouse is not over the render canvas.");
    return;
  }

  const camera = computeCameraVectors();
  const hit = tracePointerHit(camera);
  if (!hit) {
    logger.info("Orbit center not updated: no object found under mouse.");
    return;
  }

  const focusPoint = getPrimitiveFocusPoint(hit);
  cameraState.target = [focusPoint[0], focusPoint[1], focusPoint[2]];
  renderState.cameraDirty = true;
  resetAccumulation();

  const hoverLabel = getHoverLabelForHit(hit) || `${primTypeLabel(hit.primType)} ${hit.primIndex}`;
  logger.info(
    `[focus] Orbit center updated to ${focusPoint[0].toFixed(2)}, ${focusPoint[1].toFixed(2)}, ${focusPoint[2].toFixed(2)} (${hoverLabel})`
  );
  safeUpdateHoverBoxOverlay(computeCameraVectors());
}

function autofocusFromMouseRay() {
  if (!sceneData) {
    logger.warn("Focus not updated: no scene is loaded.");
    return;
  }
  if (!pointerState.overCanvas) {
    logger.info("Focus not updated: mouse is not over the render canvas.");
    return;
  }
  if (!dofFocusDistanceInput) {
    throw new Error("Depth-of-field focus distance input is missing.");
  }

  const camera = computeCameraVectors();
  const hit = tracePointerHit(camera);

  if (!hit) {
    logger.info("Focus not updated: no object found under mouse.");
    return;
  }

  const minFocus = Number(dofFocusDistanceInput.min);
  const maxFocus = Number(dofFocusDistanceInput.max);
  if (!Number.isFinite(minFocus) || !Number.isFinite(maxFocus)) {
    throw new Error("Depth-of-field focus slider range is invalid.");
  }
  const clampedFocus = clamp(hit.t, minFocus, maxFocus);
  setSliderValue(dofFocusDistanceInput, clampedFocus);
  dofFocusDistanceInput.dispatchEvent(new Event("input", { bubbles: true }));

  const message = `Focal distance updated to ${clampedFocus.toFixed(1)}`;
  logger.info(
    `[focus] ${message} (hit ${primTypeLabel(hit.primType)} ${hit.primIndex}, t=${hit.t.toFixed(3)})`
  );
  if (Math.abs(clampedFocus - hit.t) > 1e-6) {
    logger.warn(
      `[focus] Requested hit distance ${hit.t.toFixed(3)} exceeded focus slider range [${minFocus}, ${maxFocus}].`
    );
  }
}

function alignCameraToPCA(viewIndex) {
  if (!sceneData || !sceneGraph) {
    logger.warn("PCA align: no scene loaded.");
    return;
  }
  if (!pointerState.overCanvas) return;

  const camera = computeCameraVectors();
  const hit = tracePointerHit(camera);
  if (!hit) {
    logger.info("PCA align: no object under mouse.");
    return;
  }

  const range = findPrimitivePickRange(sceneData.pickRanges, hit.primType, hit.primIndex);
  const sceneObject = range ? getSceneObjectByRange(range) : null;
  if (!sceneObject) {
    logger.warn("PCA align: could not identify scene object.");
    return;
  }

  // Gather positions
  const atoms = sceneObject.molData?.atoms;
  let positions;
  if (Array.isArray(atoms) && atoms.length > 0) {
    positions = atoms.map(a => a.position);
  } else if (sceneObject.volumeData?.bounds) {
    const b = sceneObject.volumeData.bounds;
    positions = [
      [b.minX, b.minY, b.minZ], [b.maxX, b.minY, b.minZ],
      [b.minX, b.maxY, b.minZ], [b.maxX, b.maxY, b.minZ],
      [b.minX, b.minY, b.maxZ], [b.maxX, b.minY, b.maxZ],
      [b.minX, b.maxY, b.maxZ], [b.maxX, b.maxY, b.maxZ]
    ];
  } else {
    logger.warn("PCA align: object has no positions.");
    return;
  }

  const { centroid, axes } = computePCA(positions);
  const [pc1, pc2, pc3] = axes;

  let right, up, forward;
  if (viewIndex === 1) {
    right = pc1; up = pc2; forward = pc3;
  } else if (viewIndex === 2) {
    right = pc1; up = pc3; forward = pc2;
  } else {
    right = pc2; up = pc3; forward = pc1;
  }

  // Ensure right-handed: forward = right × up
  const cross = [
    right[1]*up[2] - right[2]*up[1],
    right[2]*up[0] - right[0]*up[2],
    right[0]*up[1] - right[1]*up[0]
  ];
  const dot = cross[0]*forward[0] + cross[1]*forward[1] + cross[2]*forward[2];
  if (dot < 0) forward = [-forward[0], -forward[1], -forward[2]];

  cameraState.target = [centroid[0], centroid[1], centroid[2]];
  cameraState.rotation = quatFromBasis(right, up, forward);
  renderState.cameraDirty = true;
  resetAccumulation();

  const label = getHoverLabelForHit(hit) || sceneObject.label;
  logger.info(`PCA view ${viewIndex} on ${label}`);
  updateHoverBoxOverlay();
}

function levelCameraToGroundPlane() {
  // Rotate the camera around its forward (view) axis so the z=0 ground plane appears level.
  // "Level" means the world-Z axis, projected onto the camera's image plane, points straight up on screen.
  const forward = quatRotateVec(cameraState.rotation, [0, 0, 1]);
  const up = quatRotateVec(cameraState.rotation, [0, 1, 0]);

  // World up is [0,0,1] (z=0 ground plane means Z is vertical)
  const worldUp = [0, 0, 1];

  // Project worldUp onto the camera's image plane (perpendicular to forward)
  const dot = worldUp[0]*forward[0] + worldUp[1]*forward[1] + worldUp[2]*forward[2];
  const projected = [
    worldUp[0] - dot*forward[0],
    worldUp[1] - dot*forward[1],
    worldUp[2] - dot*forward[2]
  ];
  const projLen = Math.hypot(projected[0], projected[1], projected[2]);
  if (projLen < 1e-8) {
    // Camera is looking straight up or down along Z — can't define "level"
    logger.info("Level: camera is looking along Z axis, cannot determine level orientation.");
    return;
  }
  // Desired up direction (normalized)
  const desiredUp = [projected[0]/projLen, projected[1]/projLen, projected[2]/projLen];

  // Compute the roll angle between current up and desired up, around forward
  const cosAngle = up[0]*desiredUp[0] + up[1]*desiredUp[1] + up[2]*desiredUp[2];
  // Cross product of up and desiredUp to determine sign
  const cross = [
    up[1]*desiredUp[2] - up[2]*desiredUp[1],
    up[2]*desiredUp[0] - up[0]*desiredUp[2],
    up[0]*desiredUp[1] - up[1]*desiredUp[0]
  ];
  const sinAngle = cross[0]*forward[0] + cross[1]*forward[1] + cross[2]*forward[2];
  const angle = Math.atan2(sinAngle, cosAngle);

  if (Math.abs(angle) < 1e-6) {
    logger.info("Level: camera is already level.");
    return;
  }

  const rollQuat = quatFromAxisAngle(forward, angle);
  cameraState.rotation = normalizeQuat(quatMultiply(rollQuat, cameraState.rotation));
  renderState.cameraDirty = true;
  resetAccumulation();
  logger.info("Camera leveled to ground plane.");
}

function ensureWebGL() {
  if (!glState) {
    if (glInitFailed) {
      throw new Error("WebGL initialization previously failed.");
    }
    try {
      const { gl, traceProgram, displayProgram, vao } = initWebGL(canvas, logger);
      const blackEnvTex = createEnvTexture(gl, 1, 1, new Float32Array([0, 0, 0, 1]));
      const dummyVolumeTex = createVolumeTexture(gl, 1, 1, 1, new Float32Array([0]));
      // Create dummy CDF textures (1x1 with value 1.0) for when no env is loaded
      const dummyCdfTex = createCdfTexture(gl, new Float32Array([0, 1]), 2, 1);
      glState = {
        gl,
        traceProgram,
        displayProgram,
        vao,
        textures: null,
        accum: null,
        frameParity: 0,
        envTex: blackEnvTex,
        blackEnvTex,
        volumeTex: dummyVolumeTex,
        dummyVolumeTex,
        volumeVersion: null,
        envMarginalCdfTex: dummyCdfTex,
        envConditionalCdfTex: dummyCdfTex,
        dummyCdfTex,
        envSize: [1, 1],
        envUrl: null,
        envCacheKey: null
      };
    } catch (err) {
      glInitFailed = true;
      throw err;
    }
  }
  return glState;
}

function ensurePreviewBackend() {
  const { gl } = ensureWebGL();
  if (!previewState || previewState.gl !== gl) {
    if (previewState) {
      disposePreviewBackend(previewState);
    }
    previewState = createPreviewBackend(gl, logger);
  }
  return previewState;
}

function uploadSceneTextures(gl, maxTextureSize) {
  if (!Array.isArray(sceneData.materials) || sceneData.materials.length === 0) {
    throw new Error("Scene material table is missing.");
  }
  if (!sceneData.triMaterialIndices || sceneData.triMaterialIndices.length !== sceneData.triCount) {
    throw new Error(
      `Triangle material index buffer mismatch: expected ${sceneData.triCount}, got ${sceneData.triMaterialIndices?.length ?? "null"}.`
    );
  }
  if (!sceneData.sphereMaterialIndices || sceneData.sphereMaterialIndices.length !== sceneData.sphereCount) {
    throw new Error(
      `Sphere material index buffer mismatch: expected ${sceneData.sphereCount}, got ${sceneData.sphereMaterialIndices?.length ?? "null"}.`
    );
  }
  if (!sceneData.cylinderMaterialIndices || sceneData.cylinderMaterialIndices.length !== sceneData.cylinderCount) {
    throw new Error(
      `Cylinder material index buffer mismatch: expected ${sceneData.cylinderCount}, got ${sceneData.cylinderMaterialIndices?.length ?? "null"}.`
    );
  }

  const bvh = packBvhNodes(sceneData.nodes, maxTextureSize);
  const tris = packTriangles(sceneData.tris, sceneData.positions, maxTextureSize);
  const triNormals = packTriNormals(sceneData.tris, sceneData.normals, maxTextureSize);
  const triColors = packTriColorsWithMaterialIndices(
    sceneData.triColors,
    sceneData.triMaterialIndices,
    maxTextureSize
  );
  const triFlags = packTriFlags(sceneData.triFlags || new Float32Array(0), maxTextureSize);
  const primIndices = packPrimIndices(sceneData.primIndexBuffer, maxTextureSize);
  const spheresPacked = packSpheres(sceneData.spheres, maxTextureSize);
  const sphereColors = packSphereColorsWithMaterialIndices(
    sceneData.spheres,
    sceneData.sphereMaterialIndices,
    maxTextureSize
  );
  const cylindersPacked = packCylinders(sceneData.cylinders, maxTextureSize);
  const cylinderColors = packCylinderColorsWithMaterialIndices(
    sceneData.cylinders,
    sceneData.cylinderMaterialIndices,
    maxTextureSize
  );
  const materialTable = packMaterialTable(sceneData.materials, maxTextureSize);

  const bvhTex = createDataTexture(gl, bvh.width, bvh.height, bvh.data);
  const triTex = createDataTexture(gl, tris.width, tris.height, tris.data);
  const triNormalTex = createDataTexture(gl, triNormals.width, triNormals.height, triNormals.data);
  const triColorTex = createDataTexture(gl, triColors.width, triColors.height, triColors.data);
  const triFlagTex = createDataTexture(gl, triFlags.width, triFlags.height, triFlags.data);
  const primIndexTex = createDataTexture(gl, primIndices.width, primIndices.height, primIndices.data);
  const sphereTex = createDataTexture(gl, spheresPacked.width, spheresPacked.height, spheresPacked.data);
  const sphereColorTex = createDataTexture(gl, sphereColors.width, sphereColors.height, sphereColors.data);
  const cylinderTex = createDataTexture(gl, cylindersPacked.width, cylindersPacked.height, cylindersPacked.data);
  const cylinderColorTex = createDataTexture(gl, cylinderColors.width, cylinderColors.height, cylinderColors.data);
  const materialTex = createDataTexture(gl, materialTable.width, materialTable.height, materialTable.data);

  return {
    bvh,
    tris,
    triNormals,
    triColors,
    triFlags,
    primIndices,
    spheresPacked,
    sphereColors,
    cylindersPacked,
    cylinderColors,
    materialTable,
    bvhTex,
    triTex,
    triNormalTex,
    triColorTex,
    triFlagTex,
    primIndexTex,
    sphereTex,
    sphereColorTex,
    cylinderTex,
    cylinderColorTex,
    materialTex,
  };
}

function buildPreviewVolumeState(gl) {
  const volumetricDisplay = sceneData?.volumeDisplay || null;
  const hasVolumetricRepresentation = Boolean(
    sceneData?.volume
    && volumetricDisplay
    && volumetricDisplay.style === "volumetric"
  );

  let volumeEnabled = hasVolumetricRepresentation ? 1 : (renderState.volumeEnabled ? 1 : 0);
  let volumeMin = [0, 0, 0];
  let volumeMax = [0, 0, 0];
  let volumeInvSize = [0, 0, 0];
  let volumeMaxValue = 1.0;
  let volumeThreshold = renderState.volumeThreshold;
  let volumeValueMax = 1.0;
  let volumeOpacity = renderState.volumeOpacity;
  let volumeStep = renderState.volumeStep;
  let volumeTransferPreset = 0;
  let volumePositiveColor = [0.15, 0.85, 0.2];
  let volumeNegativeColor = [0.9, 0.2, 0.2];
  let volumeDensity = renderState.volumeDensity;

  if (hasVolumetricRepresentation) {
    const volMinNorm = clamp(Number(volumetricDisplay.volumeValueMin ?? 0.0), 0.0, 0.99);
    const volMaxNorm = clamp(Number(volumetricDisplay.volumeValueMax ?? 1.0), 0.01, 1.0);
    if (volMaxNorm <= volMinNorm) {
      throw new Error("Volume value window max must be greater than min.");
    }
    const vol = sceneData.volume;
    const volAbsMax = Number(vol?.absMax ?? vol?.maxValue ?? 1.0);
    const volMinAbs = Number(vol?.minAbsNonZero ?? 0);
    const lower = Math.max(
      (Number.isFinite(volMinAbs) && volMinAbs > 0) ? volMinAbs : volAbsMax * 1e-6,
      volAbsMax * 1e-12, 1e-12
    );
    const upper = Math.max(volAbsMax, lower * (1 + 1e-9));
    const logLower = Math.log(lower / upper);
    volumeThreshold = Math.exp(logLower + volMinNorm * (0 - logLower));
    volumeValueMax = Math.exp(logLower + volMaxNorm * (0 - logLower));
    volumeOpacity = clamp(Number(volumetricDisplay.volumeOpacityScale ?? 1.0), 0.0, 20.0);
    volumeStep = clamp(Number(volumetricDisplay.volumeStepSize ?? 0.5), 0.01, 5.0);
    volumeTransferPreset = mapVolumeTransferPresetToUniform(volumetricDisplay.volumeTransferPreset);
    if (volumetricDisplay.volumePositiveColor) volumePositiveColor = volumetricDisplay.volumePositiveColor;
    if (volumetricDisplay.volumeNegativeColor) volumeNegativeColor = volumetricDisplay.volumeNegativeColor;
    volumeDensity = 1.0;
  }

  if (!volumeEnabled) {
    return { enabled: false };
  }
  if (!sceneData?.volume) {
    throw new Error("Volume rendering enabled but no volume data is available.");
  }

  const volume = sceneData.volume;
  const [nx, ny, nz] = volume.dims;
  if (!glState.volumeTex || glState.volumeVersion !== volume.version) {
    if (glState.volumeTex && glState.volumeTex !== glState.dummyVolumeTex) {
      gl.deleteTexture(glState.volumeTex);
    }
    logger.info(`Uploading volume texture (${nx}x${ny}x${nz})`);
    glState.volumeTex = createVolumeTexture(gl, nx, ny, nz, volume.data);
    glState.volumeVersion = volume.version;
  }
  volumeMin = [volume.bounds.minX, volume.bounds.minY, volume.bounds.minZ];
  volumeMax = [volume.bounds.maxX, volume.bounds.maxY, volume.bounds.maxZ];
  const sizeX = volumeMax[0] - volumeMin[0];
  const sizeY = volumeMax[1] - volumeMin[1];
  const sizeZ = volumeMax[2] - volumeMin[2];
  volumeInvSize = [
    sizeX > 0 ? 1 / sizeX : 0,
    sizeY > 0 ? 1 / sizeY : 0,
    sizeZ > 0 ? 1 / sizeZ : 0
  ];
  volumeMaxValue = Number(volume.absMax ?? volume.maxValue ?? 1.0);

  const technique = choosePreviewVolumeTechnique(renderState.cameraDirty);
  return {
    enabled: true,
    texture: glState.volumeTex || glState.dummyVolumeTex,
    min: volumeMin,
    max: volumeMax,
    invSize: volumeInvSize,
    maxValue: volumeMaxValue,
    threshold: volumeThreshold,
    valueMax: volumeValueMax,
    opacity: volumeOpacity,
    step: volumeStep,
    density: volumeDensity,
    maxSteps: Math.max(16, Math.min(2048, renderState.volumeMaxSteps)),
    transferPreset: volumeTransferPreset,
    positiveColor: volumePositiveColor,
    negativeColor: volumeNegativeColor,
    toneMap: renderState.toneMap,
    technique,
    sliceCount: technique === 1 ? 48 : 96
  };
}

function renderPreviewFrameInternal() {
  if (renderState.hiresMode) {
    throw new Error("Hi-res render is only supported in Pathtracing mode.");
  }
  if (!sceneData) {
    logger.warn("No scene loaded yet.");
    return;
  }

  const displayWidth = Math.max(1, Math.floor(canvas.clientWidth));
  const displayHeight = Math.max(1, Math.floor(canvas.clientHeight));
  if (displayWidth <= 1 || displayHeight <= 1) {
    logger.warn(`Canvas size is too small: ${displayWidth}x${displayHeight}`);
    return;
  }

  canvas.width = displayWidth;
  canvas.height = displayHeight;
  cameraState.width = displayWidth;
  cameraState.height = displayHeight;

  const backend = ensurePreviewBackend();
  const { gl } = ensureWebGL();
  if (renderState.envData && glState.envCacheKey !== renderState.envCacheKey) {
    uploadEnvironmentToGl(renderState.envData);
  }
  const volumeState = buildPreviewVolumeState(gl);
  const camera = computeCameraVectors();
  const forwardLen = Math.hypot(camera.forward[0], camera.forward[1], camera.forward[2]) || 1;
  const rightLen = Math.hypot(camera.right[0], camera.right[1], camera.right[2]) || 1;
  const upLen = Math.hypot(camera.up[0], camera.up[1], camera.up[2]) || 1;
  const camForward = [camera.forward[0] / forwardLen, camera.forward[1] / forwardLen, camera.forward[2] / forwardLen];
  const camRight = [camera.right[0] / rightLen, camera.right[1] / rightLen, camera.right[2] / rightLen];
  const camUp = [camera.up[0] / upLen, camera.up[1] / upLen, camera.up[2] / upLen];
  const lightDirs = renderState.lights.map((light) =>
    cameraRelativeLightDir(light.azimuth, light.elevation, camForward, camRight, camUp)
  );
  const clip = getActiveClipPlane(camera);
  const edgeAccentStrength = getEffectiveEdgeAccentStrength();
  const previewEdgeAccentStrength = edgeAccentStrength * PREVIEW_EDGE_ACCENT_SCALE;

  renderPreviewFrame(backend, {
    sceneData,
    camera,
    renderState,
    clip,
    lightDirs,
    displayWidth,
    displayHeight,
    cameraFov: cameraState.fov,
    envTexture: glState.envTex || glState.blackEnvTex,
    envSize: glState.envSize || [1, 1],
    hasEnvironment: Boolean(renderState.envUrl && glState.envTex),
    volumeState,
    previewQuality: {
      shadows: renderState.previewShadows,
      ssr: renderState.previewSsr,
      edgeAccentStrength: previewEdgeAccentStrength,
      lightIntensityScale: renderState.previewLightIntensity
    },
    logger
  });

  renderState.frameIndex = 0;
  renderState.cameraDirty = false;
  noteRenderedFrame(RENDER_MODES.PREVIEW);

  const polyCount = sceneData.triCount || 0;
  const primCount = (sceneData.sphereCount || 0) + (sceneData.cylinderCount || 0);
  setRenderOverlayText(`Preview (Raster) ${formatPolyCount(polyCount)} plys, ${formatPolyCount(primCount)} prims`);
  safeUpdateHoverBoxOverlay(camera);
}

function renderFrame() {
  if (renderModeController.isPreview()) {
    renderPreviewFrameInternal();
    return;
  }
  if (!sceneData) {
    logger.warn("No scene loaded yet.");
    return;
  }
  const { gl, traceProgram, displayProgram, vao } = ensureWebGL();

  let displayWidth, displayHeight, renderWidth, renderHeight;
  if (renderState.hiresMode) {
    displayWidth = canvas.width;
    displayHeight = canvas.height;
    renderWidth = displayWidth;
    renderHeight = displayHeight;
  } else {
    displayWidth = Math.max(1, Math.floor(canvas.clientWidth));
    displayHeight = Math.max(1, Math.floor(canvas.clientHeight));
    const scale = renderState.scale;
    renderWidth = Math.max(1, Math.floor(displayWidth * scale));
    renderHeight = Math.max(1, Math.floor(displayHeight * scale));

    if (renderWidth <= 1 || renderHeight <= 1) {
      logger.warn(`Canvas size is too small: ${renderWidth}x${renderHeight}`);
      return;
    }

    canvas.width = displayWidth;
    canvas.height = displayHeight;
  }
  cameraState.width = renderWidth;
  cameraState.height = renderHeight;

  if (!glState.textures) {
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    glState.textures = uploadSceneTextures(gl, maxTextureSize);
  }

  if (renderState.envData && glState.envCacheKey !== renderState.envCacheKey) {
    uploadEnvironmentToGl(renderState.envData);
  }

  const volumetricDisplay = sceneData.volumeDisplay || null;
  const hasVolumetricRepresentation = Boolean(
    sceneData.volume
    && volumetricDisplay
    && volumetricDisplay.style === "volumetric"
  );

  let volumeEnabled = hasVolumetricRepresentation ? 1 : (renderState.volumeEnabled ? 1 : 0);
  let volumeMin = [0, 0, 0];
  let volumeMax = [0, 0, 0];
  let volumeInvSize = [0, 0, 0];
  let volumeMaxValue = 1.0;
  let volumeThreshold = renderState.volumeThreshold;
  let volumeValueMax = 1.0;
  let volumeOpacity = renderState.volumeOpacity;
  let volumeStep = renderState.volumeStep;
  let volumeTransferPreset = 0;
  let volumePositiveColor = [0.15, 0.85, 0.2];
  let volumeNegativeColor = [0.9, 0.2, 0.2];
  let volumeDensity = renderState.volumeDensity;

  if (hasVolumetricRepresentation) {
    const volMinNorm = clamp(Number(volumetricDisplay.volumeValueMin ?? 0.0), 0.0, 0.99);
    const volMaxNorm = clamp(Number(volumetricDisplay.volumeValueMax ?? 1.0), 0.01, 1.0);
    if (volMaxNorm <= volMinNorm) {
      throw new Error("Volume value window max must be greater than min.");
    }
    // Log-scale mapping matching the isosurface slider (same lower/upper derivation)
    const vol = sceneData.volume;
    const volAbsMax = Number(vol?.absMax ?? vol?.maxValue ?? 1.0);
    const volMinAbs = Number(vol?.minAbsNonZero ?? 0);
    const lower = Math.max(
      (Number.isFinite(volMinAbs) && volMinAbs > 0) ? volMinAbs : volAbsMax * 1e-6,
      volAbsMax * 1e-12, 1e-12
    );
    const upper = Math.max(volAbsMax, lower * (1 + 1e-9));
    const logLower = Math.log(lower / upper);  // normalized: lower/absMax in log space
    volumeThreshold = Math.exp(logLower + volMinNorm * (0 - logLower));  // maps [0,1] → [lower/upper, 1]
    volumeValueMax = Math.exp(logLower + volMaxNorm * (0 - logLower));
    volumeOpacity = clamp(Number(volumetricDisplay.volumeOpacityScale ?? 1.0), 0.0, 20.0);
    volumeStep = clamp(Number(volumetricDisplay.volumeStepSize ?? 0.5), 0.01, 5.0);
    volumeTransferPreset = mapVolumeTransferPresetToUniform(volumetricDisplay.volumeTransferPreset);
    if (volumetricDisplay.volumePositiveColor) volumePositiveColor = volumetricDisplay.volumePositiveColor;
    if (volumetricDisplay.volumeNegativeColor) volumeNegativeColor = volumetricDisplay.volumeNegativeColor;
    volumeDensity = 1.0;
  }

  if (volumeEnabled) {
    if (!sceneData.volume) {
      throw new Error("Volume rendering enabled but no volume data is available.");
    }
    const volume = sceneData.volume;
    const [nx, ny, nz] = volume.dims;
    if (!glState.volumeTex || glState.volumeVersion !== volume.version) {
      if (glState.volumeTex && glState.volumeTex !== glState.dummyVolumeTex) {
        gl.deleteTexture(glState.volumeTex);
      }
      logger.info(`Uploading volume texture (${nx}x${ny}x${nz})`);
      glState.volumeTex = createVolumeTexture(gl, nx, ny, nz, volume.data);
      glState.volumeVersion = volume.version;
    }
    volumeMin = [volume.bounds.minX, volume.bounds.minY, volume.bounds.minZ];
    volumeMax = [volume.bounds.maxX, volume.bounds.maxY, volume.bounds.maxZ];
    const sizeX = volumeMax[0] - volumeMin[0];
    const sizeY = volumeMax[1] - volumeMin[1];
    const sizeZ = volumeMax[2] - volumeMin[2];
    volumeInvSize = [
      sizeX > 0 ? 1 / sizeX : 0,
      sizeY > 0 ? 1 / sizeY : 0,
      sizeZ > 0 ? 1 / sizeZ : 0
    ];
    volumeMaxValue = Number(volume.absMax ?? volume.maxValue);
  }

  if (!renderState.useBvh && sceneData.triCount > MAX_BRUTE_FORCE_TRIS) {
    throw new Error(
      `Brute force mode supports up to ${MAX_BRUTE_FORCE_TRIS} triangles; scene has ${sceneData.triCount}.`
    );
  }

  if (!glState.accum) {
    glState.accum = createAccumTargets(gl, renderWidth, renderHeight);
    renderState.frameIndex = 0;
  } else {
    glState.accum = resizeAccumTargets(gl, glState.accum, renderWidth, renderHeight);
  }

  const camera = computeCameraVectors();
  const forwardLen = Math.hypot(camera.forward[0], camera.forward[1], camera.forward[2]) || 1;
  const rightLen = Math.hypot(camera.right[0], camera.right[1], camera.right[2]) || 1;
  const upLen = Math.hypot(camera.up[0], camera.up[1], camera.up[2]) || 1;
  const camForward = [camera.forward[0] / forwardLen, camera.forward[1] / forwardLen, camera.forward[2] / forwardLen];
  const camRight = [camera.right[0] / rightLen, camera.right[1] / rightLen, camera.right[2] / rightLen];
  const camUp = [camera.up[0] / upLen, camera.up[1] / upLen, camera.up[2] / upLen];
  const lightDirs = renderState.lights.map((light) =>
    cameraRelativeLightDir(light.azimuth, light.elevation, camForward, camRight, camUp)
  );
  const clip = getActiveClipPlane(camera);
  const clipEnabled = clip.enabled ? 1 : 0;
  const clipNormal = clip.normal;
  const clipOffset = clip.offset;
  const clipSide = clip.side;

  gl.disable(gl.DEPTH_TEST);
  gl.bindVertexArray(vao);

  const accumIndex = glState.frameParity % 2;
  const prevIndex = (glState.frameParity + 1) % 2;

  if (renderState.cameraDirty) {
    renderState.frameIndex = 0;
  }

  gl.viewport(0, 0, renderWidth, renderHeight);
  gl.bindFramebuffer(gl.FRAMEBUFFER, glState.accum.framebuffers[accumIndex]);

  createTextureUnit(gl, glState.textures.bvhTex, 0);
  createTextureUnit(gl, glState.textures.triTex, 1);
  createTextureUnit(gl, glState.textures.triNormalTex, 2);
  createTextureUnit(gl, glState.textures.triColorTex, 3);
  createTextureUnit(gl, glState.textures.primIndexTex, 4);
  createTextureUnit(gl, glState.accum.textures[prevIndex], 5);
  createTextureUnit(gl, glState.envTex || glState.blackEnvTex, 6);
  createTextureUnit(gl, glState.envMarginalCdfTex || glState.dummyCdfTex, 7);
  createTextureUnit(gl, glState.envConditionalCdfTex || glState.dummyCdfTex, 8);
  createTextureUnit(gl, glState.textures.sphereTex, 9);
  createTextureUnit(gl, glState.textures.sphereColorTex, 10);
  createTextureUnit(gl, glState.textures.cylinderTex, 11);
  createTextureUnit(gl, glState.textures.cylinderColorTex, 12);
  createTextureUnit3D(gl, glState.volumeTex || glState.dummyVolumeTex, 13);
  createTextureUnit(gl, glState.textures.triFlagTex, 14);
  createTextureUnit(gl, glState.textures.materialTex, 15);

setTraceUniforms(gl, traceProgram, {
    bvhUnit: 0,
    triUnit: 1,
    triNormalUnit: 2,
    triColorUnit: 3,
    triFlagUnit: 14,
    primIndexUnit: 4,
    accumUnit: 5,
    envUnit: 6,
    sphereUnit: 9,
    sphereColorUnit: 10,
    cylinderUnit: 11,
    cylinderColorUnit: 12,
    volumeUnit: 13,
    materialUnit: 15,
    camOrigin: camera.origin,
    camRight: camera.right,
    camUp: camera.up,
    camForward: camera.forward,
    resolution: [renderWidth, renderHeight],
    bvhTexSize: [glState.textures.bvh.width, glState.textures.bvh.height],
    triTexSize: [glState.textures.tris.width, glState.textures.tris.height],
    triNormalTexSize: [glState.textures.triNormals.width, glState.textures.triNormals.height],
    triColorTexSize: [glState.textures.triColors.width, glState.textures.triColors.height],
    triFlagTexSize: [glState.textures.triFlags.width, glState.textures.triFlags.height],
    materialTexSize: [glState.textures.materialTable.width, glState.textures.materialTable.height],
    primIndexTexSize: [glState.textures.primIndices.width, glState.textures.primIndices.height],
    sphereTexSize: [glState.textures.spheresPacked.width, glState.textures.spheresPacked.height],
    sphereColorTexSize: [glState.textures.sphereColors.width, glState.textures.sphereColors.height],
    cylinderTexSize: [glState.textures.cylindersPacked.width, glState.textures.cylindersPacked.height],
    cylinderColorTexSize: [glState.textures.cylinderColors.width, glState.textures.cylinderColors.height],
    envTexSize: glState.envSize || [1, 1],
    frameIndex: renderState.frameIndex,
    triCount: sceneData.triCount,
    sphereCount: sceneData.sphereCount,
    cylinderCount: sceneData.cylinderCount,
    materialCount: sceneData.materials.length,
    volumeEnabled,
    volumeMin,
    volumeMax,
    volumeInvSize,
    volumeMaxValue,
    volumeColor: renderState.volumeColor,
    volumeDensity,
    volumeOpacity,
    volumeStep,
    volumeMaxSteps: renderState.volumeMaxSteps,
    volumeThreshold,
    volumeValueMax,
    volumeTransferPreset,
    volumePositiveColor,
    volumeNegativeColor,
    useBvh: renderState.useBvh ? 1 : 0,
    useImportedColor: renderState.useImportedColor ? 1 : 0,
    baseColor: renderState.baseColor,
    metallic: renderState.metallic,
    roughness: renderState.roughness,
    rimBoost: renderState.rimBoost,
    maxBounces: renderState.maxBounces,
    exposure: renderState.exposure,
    dofEnabled: renderState.dofEnabled ? 1 : 0,
    dofAperture: renderState.dofAperture,
    dofFocusDistance: renderState.dofFocusDistance,
    ambientIntensity: renderState.ambientIntensity,
    ambientColor: renderState.ambientColor,
    envIntensity: renderState.envIntensity,
    envBgIntensity: renderState.envBgIntensity,
    envRotationYawRad: (renderState.envRotationDeg * Math.PI) / 180.0,
    envRotationPitchRad: (renderState.envRotationVerticalDeg * Math.PI) / 180.0,
    envMaxLuminance: renderState.envMaxLuminance,
    useEnv: renderState.envUrl ? 1 : 0,
    materialMode: renderState.materialMode,
    matteSpecular: renderState.matteSpecular,
    matteRoughness: renderState.matteRoughness,
    matteDiffuseRoughness: renderState.matteDiffuseRoughness,
    wrapDiffuse: renderState.wrapDiffuse,
    surfaceIor: renderState.surfaceIor,
    surfaceTransmission: renderState.surfaceTransmission,
    surfaceOpacity: renderState.surfaceOpacity,
    surfaceFlagMode: sceneData.hasSurfaceFlags ? 1 : 0,
    envMarginalCdfUnit: 7,
    envConditionalCdfUnit: 8,
    envSize: glState.envSize || [1, 1],
    samplesPerBounce: renderState.samplesPerBounce,
    castShadows: renderState.castShadows ? 1 : 0,
    rayBias: renderState.rayBias,
    tMin: renderState.tMin,
    lights: renderState.lights,
    lightDirs,
    clipEnabled,
    clipNormal,
    clipOffset,
    clipSide,
    visMode: renderState.visMode,
    transparentBg: renderState.transparentBg
  });

  gl.useProgram(traceProgram);
  drawFullscreen(gl);

  glState.frameParity = prevIndex;
  renderState.frameIndex += 1;
  renderState.cameraDirty = false;

  // In hi-res mode, skip the display pass and UI updates — only accumulate
  if (renderState.hiresMode) {
    return;
  }

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, displayWidth, displayHeight);
  createTextureUnit(gl, glState.accum.textures[accumIndex], 0);
  createTextureUnit(gl, glState.accum.auxTextures[accumIndex], 1);
  const edgeAccentStrength = getEffectiveEdgeAccentStrength();

  setDisplayUniforms(gl, displayProgram, {
    displayUnit: 0,
    auxUnit: 1,
    displayResolution: [displayWidth, displayHeight],
    toneMap: renderState.toneMap,
    edgeAccentStrength,
    transparentBg: renderState.transparentBg
  });

  gl.useProgram(displayProgram);
  drawFullscreen(gl);
  noteRenderedFrame(RENDER_MODES.PATHTRACING);

  if (sceneData) {
    const maxFrames = renderState.maxFrames > 0 ? renderState.maxFrames : "∞";
    const polyCount = sceneData.triCount || 0;
    const primCount = (sceneData.sphereCount || 0) + (sceneData.cylinderCount || 0);
    setRenderOverlayText(`${renderState.frameIndex}/${maxFrames} ${formatPolyCount(polyCount)} plys, ${formatPolyCount(primCount)} prims`);
  }
  safeUpdateHoverBoxOverlay(camera);
}

async function startRenderLoop() {
  if (isRendering) {
    return;
  }
  isRendering = true;
  logger.info("Interactive render started.");
  let lastTime = performance.now();

  const loop = (time) => {
    if (!isRendering) {
      return;
    }
    const movingNow = isCameraInteracting(time);
    const targetScale = movingNow ? renderState.fastScale : renderState.renderScale;
    if (renderState.scale !== targetScale) {
      renderState.scale = targetScale;
      resetAccumulation();
      glState = null;
    }
    const dt = Math.max(0.001, (time - lastTime) / 1000);
    lastTime = time;
    const moved = updateCameraFromInput(dt);
    if (moved) {
      renderState.cameraDirty = true;
      markInteractionActive(time);
    }
    if (renderModeController.isPreview()) {
      const shouldRenderPreview = renderState.cameraDirty || movingNow || moved;
      if (!shouldRenderPreview) {
        refreshRenderOverlayFpsOnly(time);
        requestAnimationFrame(loop);
        return;
      }
    }
    if (
      !renderModeController.isPreview()
      && renderState.maxFrames > 0
      && renderState.frameIndex >= renderState.maxFrames
      && !renderState.cameraDirty
    ) {
      requestAnimationFrame(loop);
      return;
    }
    try {
      renderFrame();
    } catch (err) {
      logger.error(err.message || String(err));
      isRendering = false;
      return;
    }
    requestAnimationFrame(loop);
  };

  requestAnimationFrame(loop);
}

function stopRenderLoop() {
  if (!isRendering) {
    return;
  }
  isRendering = false;
  if (renderOverlay) {
    renderOverlay.style.display = "none";
  }
  logger.info("Paused.");
}

async function hiresRender() {
  if (renderModeController.isPreview()) {
    throw new Error("Switch to Pathtracing mode for hi-res rendering.");
  }
  const width = Math.max(64, Math.min(8192, Number(hiresWidthInput.value) || 1920));
  const height = Math.max(64, Math.min(8192, Number(hiresHeightInput.value) || 1080));
  const iterations = Math.max(1, Math.min(10000, Number(hiresIterationsInput.value) || 100));
  const transparent = hiresTransparentCheckbox.checked;

  // Show progress UI
  hiresForm.style.display = "none";
  hiresProgress.style.display = "block";
  hiresProgressFill.style.width = "0%";
  hiresProgressText.textContent = `0 / ${iterations} — estimating...`;

  // Pause interactive loop
  stopRenderLoop();

  // Save original state
  const savedCanvasW = canvas.width;
  const savedCanvasH = canvas.height;
  const savedCamW = cameraState.width;
  const savedCamH = cameraState.height;
  const savedScale = renderState.scale;
  const savedFrameIndex = renderState.frameIndex;
  const savedFrameParity = glState.frameParity;
  const savedHiresMode = renderState.hiresMode;
  const savedTransparentBg = renderState.transparentBg;

  // Override for hi-res
  canvas.width = width;
  canvas.height = height;
  cameraState.width = width;
  cameraState.height = height;
  renderState.scale = 1;
  renderState.frameIndex = 0;
  renderState.cameraDirty = true;
  renderState.hiresMode = true;
  renderState.transparentBg = transparent ? 1 : 0;

  const { gl } = ensureWebGL();

  // Create dedicated accum targets at hi-res
  const hiresAccum = createAccumTargets(gl, width, height);
  const savedAccum = glState.accum;
  glState.accum = hiresAccum;
  glState.frameParity = 0;

  let cancelled = false;
  hiresCancelBtn.onclick = () => { cancelled = true; };

  const startTime = performance.now();

  for (let i = 0; i < iterations; i++) {
    if (cancelled) break;

    renderFrame();

    // Update progress
    const pct = ((i + 1) / iterations * 100).toFixed(1);
    hiresProgressFill.style.width = pct + "%";
    const elapsed = performance.now() - startTime;
    const perFrame = elapsed / (i + 1);
    const remaining = perFrame * (iterations - i - 1);
    const etaStr = remaining > 60000
      ? (remaining / 60000).toFixed(1) + " min"
      : (remaining / 1000).toFixed(0) + " s";
    hiresProgressText.textContent = `${i + 1} / ${iterations} — ${cancelled ? "cancelled" : etaStr + " remaining"}`;

    // Yield to browser for repaint — requestAnimationFrame ensures a
    // compositor frame, then setTimeout defers to the next task so the
    // paint actually
    await new Promise(r => requestAnimationFrame(() => setTimeout(r, 0)));
  }

  // Read pixels — render display pass to an offscreen RGBA8 framebuffer
  if (!cancelled) {
    const { displayProgram } = ensureWebGL();

    const readTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, readTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const readFb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, readFb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, readTex, 0);

    // The last renderFrame swapped frameParity, so the most recent result is at the OTHER index
    const finalAccumIdx = (glState.frameParity + 1) % 2;
    gl.viewport(0, 0, width, height);
    createTextureUnit(gl, glState.accum.textures[finalAccumIdx], 0);
    createTextureUnit(gl, glState.accum.auxTextures[finalAccumIdx], 1);
    setDisplayUniforms(gl, displayProgram, {
      displayUnit: 0,
      auxUnit: 1,
      displayResolution: [width, height],
      toneMap: renderState.toneMap,
      edgeAccentStrength: renderState.dofEnabled ? 0.0 : renderState.edgeAccent,
      transparentBg: transparent ? 1 : 0
    });
    gl.useProgram(displayProgram);
    drawFullscreen(gl);

    // Read pixels
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    gl.deleteTexture(readTex);
    gl.deleteFramebuffer(readFb);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);

    // Flip vertically (WebGL is bottom-up) and create PNG
    const flipped = new Uint8Array(width * height * 4);
    const rowSize = width * 4;
    for (let y = 0; y < height; y++) {
      flipped.set(pixels.subarray((height - 1 - y) * rowSize, (height - y) * rowSize), y * rowSize);
    }

    const tmpCanvas = document.createElement("canvas");
    tmpCanvas.width = width;
    tmpCanvas.height = height;
    const ctx = tmpCanvas.getContext("2d");
    const imgData = new ImageData(new Uint8ClampedArray(flipped.buffer), width, height);
    ctx.putImageData(imgData, 0, 0);

    tmpCanvas.toBlob((blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `render_${width}x${height}_${iterations}spp.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, "image/png");
  }

  // Restore state
  renderState.transparentBg = savedTransparentBg;
  renderState.hiresMode = savedHiresMode;
  hiresAccum.textures.forEach(t => gl.deleteTexture(t));
  hiresAccum.auxTextures?.forEach(t => gl.deleteTexture(t));
  hiresAccum.framebuffers.forEach(f => gl.deleteFramebuffer(f));
  glState.accum = savedAccum;
  glState.frameParity = savedFrameParity;
  canvas.width = savedCanvasW;
  canvas.height = savedCanvasH;
  cameraState.width = savedCamW;
  cameraState.height = savedCamH;
  renderState.scale = savedScale;
  renderState.frameIndex = 0;
  renderState.cameraDirty = true;

  // Close modal and restart
  hiresModal.style.display = "none";
  hiresForm.style.display = "block";
  hiresProgress.style.display = "none";

  startRenderLoop();
}

// Hi-res render modal wiring
let hiresAspect = 16 / 9;

if (hiresRenderBtn) {
  hiresRenderBtn.onclick = () => {
    // Pause interactive rendering as soon as the modal is shown.
    stopRenderLoop();
    // Compute aspect ratio from current canvas
    const cw = canvas.clientWidth || 1920;
    const ch = canvas.clientHeight || 1080;
    hiresAspect = cw / ch;
    const w = 1920;
    const h = Math.round(w / hiresAspect);
    hiresWidthInput.value = w;
    hiresHeightInput.value = h;
    hiresForm.style.display = "block";
    hiresProgress.style.display = "none";
    hiresModal.style.display = "flex";
  };
}

if (hiresWidthInput) {
  hiresWidthInput.addEventListener("input", () => {
    const w = Number(hiresWidthInput.value);
    if (w >= 64 && w <= 8192) {
      hiresHeightInput.value = Math.round(w / hiresAspect);
    }
  });
}

if (hiresHeightInput) {
  hiresHeightInput.addEventListener("input", () => {
    const h = Number(hiresHeightInput.value);
    if (h >= 64 && h <= 8192) {
      hiresWidthInput.value = Math.round(h * hiresAspect);
    }
  });
}

if (hiresStartBtn) {
  hiresStartBtn.onclick = () => hiresRender();
}

if (hiresCloseBtn) {
  hiresCloseBtn.onclick = () => {
    hiresModal.style.display = "none";
    startRenderLoop().catch((err) => logger.error(err.message || String(err)));
  };
}

async function loadExampleScene(url) {
  if (isLoading) return;
  isLoading = true;
  setLoadingOverlay(true, "Loading scene...");
  let success = false;
  try {
    if (url === "__test_primitives__") {
      loadTestPrimitives();
      success = true;
    } else if (url === "__test_1000_spheres__") {
      loadRandomSpheres(1000);
      success = true;
    } else if (url === "__test_10000_spheres__") {
      loadRandomSpheres(10000);
      success = true;
    } else if (url.startsWith("mol:")) {
      const molName = url.slice(4);
      await loadBuiltinMolecule(molName);
      success = true;
    } else if (url.startsWith("pdb:")) {
      const pdbId = url.slice(4);
      await loadPDBById(pdbId);
      success = true;
    } else {
      throw new Error(`Unsupported example selection: ${url}`);
    }
  } catch (err) {
    logger.error(err.message || String(err));
  } finally {
    isLoading = false;
    glState = null;
    setLoadingOverlay(false);
  }
  return success;
}

loadExampleBtn.addEventListener("click", async () => {
  const value = exampleSelect.value;
  setLoadingOverlay(true, "Loading example...");
  let loaded = false;
  try {
    loaded = await loadExampleScene(value);
  } catch (err) {
    logger.error(err.message || String(err));
  } finally {
    setLoadingOverlay(false);
  }
  if (loaded && sceneData) {
    await startRenderLoop();
  }
});

// Load molecular file from file input
molFileInput.addEventListener("change", async () => {
  setLoadingOverlay(true, "Loading molecular file(s)...");
  let loaded = false;
  try {
    const files = Array.from(molFileInput.files || []);
    if (files.length === 0) return;
    await importMolecularFiles(files);
    glState = null;
    loaded = true;
  } catch (err) {
    logger.error(err.message || String(err));
  } finally {
    setLoadingOverlay(false);
  }
  if (loaded && sceneData) {
    await startRenderLoop();
  }
});

function hasDraggedFiles(event) {
  const dt = event?.dataTransfer;
  if (!dt) return false;
  if (dt.files && dt.files.length > 0) return true;
  return Array.from(dt.types || []).includes("Files");
}

function handleDragOver(event) {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  if (event.dataTransfer) {
    event.dataTransfer.dropEffect = "copy";
  }
}

async function handleFileDrop(event) {
  if (!hasDraggedFiles(event)) return;
  event.preventDefault();
  const files = Array.from(event.dataTransfer?.files || []);
  if (files.length === 0) {
    return;
  }
  setLoadingOverlay(true, "Importing dropped file(s)...");
  let loaded = false;
  try {
    await importMolecularFiles(files);
    glState = null;
    loaded = true;
  } catch (err) {
    logger.error(err.message || String(err));
  } finally {
    setLoadingOverlay(false);
  }
  if (loaded && sceneData) {
    await startRenderLoop();
  }
}

window.addEventListener("dragover", handleDragOver);
window.addEventListener("drop", (event) => {
  handleFileDrop(event).catch((err) => logger.error(err?.message || String(err)));
});

loadPdbIdBtn.addEventListener("click", async () => {
  setLoadingOverlay(true, "Fetching PDB...");
  let loaded = false;
  try {
    const pdbId = pdbIdInput.value.trim();
    if (!pdbId || pdbId.length !== 4) {
      throw new Error("Please enter a valid 4-letter PDB ID.");
    }
    await loadPDBById(pdbId);
    glState = null;
    loaded = true;
  } catch (err) {
    logger.error(err.message || String(err));
  } finally {
    setLoadingOverlay(false);
  }
  if (loaded && sceneData) {
    await startRenderLoop();
  }
});

canvas.addEventListener("mousedown", (event) => {
  focusRenderCanvas();
  updatePointerFromMouseEvent(event);
  safeUpdateHoverBoxOverlay();
  inputState.dragging = true;
  inputState.lastX = event.clientX;
  inputState.lastY = event.clientY;
  inputState.rotateAxisLock = null;
  if (event.button === 2) {
    inputState.dragMode = "pan";
  } else if (event.shiftKey) {
    inputState.dragMode = "pan";
  } else if (event.ctrlKey) {
    inputState.dragMode = "zoom";
  } else {
    inputState.dragMode = "rotate";
  }
  markInteractionActive();
});

function focusRenderCanvas() {
  if (!canvas || document.activeElement === canvas) return;
  try {
    canvas.focus({ preventScroll: true });
  } catch (_err) {
    canvas.focus();
  }
}

canvas.addEventListener("mouseenter", (event) => {
  updatePointerFromMouseEvent(event);
  focusRenderCanvas();
  safeUpdateHoverBoxOverlay();
});

canvas.addEventListener("mouseup", () => {
  inputState.dragging = false;
  inputState.rotateAxisLock = null;
});

canvas.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});
canvasContainer?.addEventListener("contextmenu", (event) => {
  event.preventDefault();
});

canvas.addEventListener("mouseleave", () => {
  pointerState.overCanvas = false;
  hideHoverBoxOverlay();
  hideHoverInfoOverlay();
  inputState.dragging = false;
  inputState.rotateAxisLock = null;
});

canvas.addEventListener("mousemove", (event) => {
  updatePointerFromMouseEvent(event);
  if (!inputState.dragging) {
    safeUpdateHoverBoxOverlay();
    return;
  }
  const dx = event.clientX - inputState.lastX;
  const dy = event.clientY - inputState.lastY;
  inputState.lastX = event.clientX;
  inputState.lastY = event.clientY;
  markInteractionActive();

  const rightDown = (event.buttons & 2) !== 0;
  const mode = rightDown ? "pan" : (event.shiftKey ? "pan" : (event.ctrlKey ? "zoom" : inputState.dragMode));

  if (mode === "pan") {
    const panScale = cameraState.distance * 0.002;
    const orbit = computeCameraVectors();
    const rightLen = Math.hypot(orbit.right[0], orbit.right[1], orbit.right[2]) || 1;
    const upLen = Math.hypot(orbit.up[0], orbit.up[1], orbit.up[2]) || 1;
    const right = [orbit.right[0] / rightLen, orbit.right[1] / rightLen, orbit.right[2] / rightLen];
    const up = [orbit.up[0] / upLen, orbit.up[1] / upLen, orbit.up[2] / upLen];

    cameraState.target[0] -= right[0] * dx * panScale;
    cameraState.target[1] -= right[1] * dx * panScale;
    cameraState.target[2] -= right[2] * dx * panScale;
    cameraState.target[0] += up[0] * dy * panScale;
    cameraState.target[1] += up[1] * dy * panScale;
    cameraState.target[2] += up[2] * dy * panScale;
    renderState.cameraDirty = true;
    safeUpdateHoverBoxOverlay();
    return;
  }

  if (mode === "zoom") {
    const zoom = Math.exp(dy * 0.005);
    const sceneScale = sceneData?.sceneScale || 1.0;
    const minDist = Math.max(0.1, sceneScale * 0.1);
    const maxDist = Math.max(100, sceneScale * 20);
    cameraState.distance = clamp(cameraState.distance * zoom, minDist, maxDist);
    renderState.cameraDirty = true;
    safeUpdateHoverBoxOverlay();
    return;
  }
  inputState.rotateAxisLock = resolveRotationLock(inputState.rotateAxisLock, dx, dy);
  if (!inputState.rotateAxisLock) {
    return;
  }
  const lockDx = inputState.rotateAxisLock === "yaw" ? dx : 0;
  const lockDy = inputState.rotateAxisLock === "pitch" ? dy : 0;
  applyOrbitDrag(lockDx, lockDy);
  renderState.cameraDirty = true;
  safeUpdateHoverBoxOverlay();
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const zoom = Math.exp(event.deltaY * 0.0015);
  // Dynamic zoom limits based on scene scale
  const sceneScale = sceneData?.sceneScale || 1.0;
  const minDist = Math.max(0.1, sceneScale * 0.1);
  const maxDist = Math.max(100, sceneScale * 20);
  cameraState.distance = clamp(cameraState.distance * zoom, minDist, maxDist);
  renderState.cameraDirty = true;
  markInteractionActive();
  safeUpdateHoverBoxOverlay();
}, { passive: false });

window.addEventListener("keydown", (event) => {
  const key = event.key.toLowerCase();
  const isFocusShortcut = event.code === "KeyF" || key === "f";
  const isCenterShortcut = event.code === "KeyC" || key === "c";
  if (isFocusShortcut && !event.repeat && !isTextEntryTarget(event.target)) {
    try {
      autofocusFromMouseRay();
    } catch (err) {
      const msg = err?.message || String(err);
      logger.error(msg);
    }
    event.preventDefault();
    return;
  }
  if (isCenterShortcut && !event.repeat && !isTextEntryTarget(event.target)) {
    try {
      centerOrbitFromMouseRay();
    } catch (err) {
      const msg = err?.message || String(err);
      logger.error(msg);
    }
    event.preventDefault();
    return;
  }
  if (!event.repeat && !isTextEntryTarget(event.target) && (key === "1" || key === "2" || key === "3")) {
    try {
      alignCameraToPCA(Number(key));
    } catch (err) {
      logger.error(err?.message || String(err));
    }
    event.preventDefault();
    return;
  }
  if (!event.repeat && !isTextEntryTarget(event.target) && key === "z") {
    try {
      levelCameraToGroundPlane();
    } catch (err) {
      logger.error(err?.message || String(err));
    }
    event.preventDefault();
    return;
  }
  inputState.keys.add(key);
});

window.addEventListener("keyup", (event) => {
  inputState.keys.delete(event.key.toLowerCase());
});

scaleSelect.addEventListener("change", () => {
  const value = Number(scaleSelect.value);
  if (!Number.isFinite(value) || value <= 0) {
    return;
  }
  renderState.renderScale = value;
  if (!isCameraInteracting()) {
    renderState.scale = value;
    resetAccumulation(`Render scale set to ${value.toFixed(2)}x`);
    glState = null;
  }
});

fastScaleSelect.addEventListener("change", () => {
  const value = Number(fastScaleSelect.value);
  if (!Number.isFinite(value) || value <= 0) {
    return;
  }
  renderState.fastScale = value;
  if (isCameraInteracting()) {
    renderState.scale = value;
    resetAccumulation();
    glState = null;
  }
});

envSelect.addEventListener("change", () => {
  updateEnvironmentVisibility();
  updateEnvironmentState().catch((err) => logger.error(err.message || String(err)));
});
envIntensityInput.addEventListener("input", () => {
  updateEnvironmentState().catch((err) => logger.error(err.message || String(err)));
});
envBgIntensityInput?.addEventListener("input", () => {
  updateEnvironmentState().catch((err) => logger.error(err.message || String(err)));
});
envUniformColorInput?.addEventListener("input", () => {
  updateEnvironmentState().catch((err) => logger.error(err.message || String(err)));
});
envRotationInput?.addEventListener("input", () => {
  updateEnvironmentState().catch((err) => logger.error(err.message || String(err)));
});
envRotationVerticalInput?.addEventListener("input", () => {
  updateEnvironmentState().catch((err) => logger.error(err.message || String(err)));
});
envMaxLumInput?.addEventListener("input", () => {
  updateEnvironmentState().catch((err) => logger.error(err.message || String(err)));
});
analyticSkyResolutionSelect?.addEventListener("change", () => {
  updateEnvironmentState().catch((err) => logger.error(err.message || String(err)));
});
analyticSkyTurbidityInput?.addEventListener("input", () => {
  updateEnvironmentState().catch((err) => logger.error(err.message || String(err)));
});
analyticSkySunAzimuthInput?.addEventListener("input", () => {
  updateEnvironmentState().catch((err) => logger.error(err.message || String(err)));
});
analyticSkySunElevationInput?.addEventListener("input", () => {
  updateEnvironmentState().catch((err) => logger.error(err.message || String(err)));
});
analyticSkyIntensityInput?.addEventListener("input", () => {
  updateEnvironmentState().catch((err) => logger.error(err.message || String(err)));
});
analyticSkySunIntensityInput?.addEventListener("input", () => {
  updateEnvironmentState().catch((err) => logger.error(err.message || String(err)));
});
analyticSkySunRadiusInput?.addEventListener("input", () => {
  updateEnvironmentState().catch((err) => logger.error(err.message || String(err)));
});
analyticSkyGroundAlbedoInput?.addEventListener("input", () => {
  updateEnvironmentState().catch((err) => logger.error(err.message || String(err)));
});
analyticSkyHorizonSoftnessInput?.addEventListener("input", () => {
  updateEnvironmentState().catch((err) => logger.error(err.message || String(err)));
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveTab(button.dataset.tabButton);
  });
});

renderModePathtracingBtn?.addEventListener("click", () => {
  const changed = renderModeController.setMode(RENDER_MODES.PATHTRACING);
  if (changed) {
    logger.info("Render mode switched to Pathtracing.");
    resetAccumulation();
  }
  updateRenderModeUi();
});

renderModePreviewBtn?.addEventListener("click", () => {
  const changed = renderModeController.setMode(RENDER_MODES.PREVIEW);
  if (changed) {
    logger.info("Render mode switched to Preview.");
    resetAccumulation();
  }
  updateRenderModeUi();
});

clipEnableToggle?.addEventListener("change", () => updateClipState({ preserveLock: true }));
clipDistanceInput?.addEventListener("input", () => updateClipState({ preserveLock: true }));
clipLockToggle?.addEventListener("change", () => updateClipState({ preserveLock: false }));
materialSelect?.addEventListener("change", () => {
  applyMaterialPreset(materialSelect.value);
  updateMaterialVisibility();
});
pdbDisplayStyle?.addEventListener("change", updateDisplayControlsVisibility);
representationActionBtn?.addEventListener("click", () => {
  applyRepresentationActionFromSelection().then(() => startRenderLoop()).catch((err) => logger.error(err.message || String(err)));
});
maxBouncesInput.addEventListener("input", updateMaterialState);
exposureInput.addEventListener("input", updateMaterialState);
cameraFovInput?.addEventListener("input", updateMaterialState);
dofEnableToggle?.addEventListener("change", () => {
  updateDofVisibility();
  updateMaterialState();
});
dofApertureInput?.addEventListener("input", updateMaterialState);
dofFocusDistanceInput?.addEventListener("input", updateMaterialState);
toneMapSelect?.addEventListener("change", updateMaterialState);
edgeAccentInput?.addEventListener("input", updateMaterialState);
ambientIntensityInput.addEventListener("input", updateMaterialState);
ambientColorInput.addEventListener("input", updateMaterialState);
samplesPerBounceInput.addEventListener("input", updateMaterialState);
maxFramesInput?.addEventListener("input", updateRenderLimits);
shadowToggle.addEventListener("change", updateMaterialState);
previewShadowsToggle?.addEventListener("change", updatePreviewQualityState);
previewSsrToggle?.addEventListener("change", updatePreviewQualityState);
previewLightIntensityInput?.addEventListener("input", updatePreviewQualityState);

volumeEnableToggle?.addEventListener("change", () => {
  try {
    updateVolumeState();
  } catch (err) {
    logger.error(err.message || String(err));
  }
});
volumeColorInput?.addEventListener("input", () => {
  try {
    updateVolumeState();
  } catch (err) {
    logger.error(err.message || String(err));
  }
});
volumeDensityInput?.addEventListener("input", () => {
  try {
    updateVolumeState();
  } catch (err) {
    logger.error(err.message || String(err));
  }
});
volumeOpacityInput?.addEventListener("input", () => {
  try {
    updateVolumeState();
  } catch (err) {
    logger.error(err.message || String(err));
  }
});
volumeStepInput?.addEventListener("input", () => {
  try {
    updateVolumeState();
  } catch (err) {
    logger.error(err.message || String(err));
  }
});
volumeMaxStepsInput?.addEventListener("input", () => {
  try {
    updateVolumeState();
  } catch (err) {
    logger.error(err.message || String(err));
  }
});
volumeThresholdInput?.addEventListener("input", () => {
  try {
    updateVolumeState();
  } catch (err) {
    logger.error(err.message || String(err));
  }
});

light1Enable.addEventListener("change", updateLightState);
light1Azimuth.addEventListener("input", updateLightState);
light1Elevation.addEventListener("input", updateLightState);
light1Intensity.addEventListener("input", updateLightState);
light1Extent.addEventListener("input", updateLightState);
light1Color.addEventListener("input", updateLightState);
light2Enable.addEventListener("change", updateLightState);
light2Azimuth.addEventListener("input", updateLightState);
light2Elevation.addEventListener("input", updateLightState);
light2Intensity.addEventListener("input", updateLightState);
light2Extent.addEventListener("input", updateLightState);
light2Color.addEventListener("input", updateLightState);

visModeSelect?.addEventListener("change", () => {
  renderState.visMode = parseInt(visModeSelect.value, 10) || 0;
  resetAccumulation("Visualization mode changed.");
});

const params = new URLSearchParams(window.location.search);
const autorun = params.get("autorun");
const exampleParam = params.get("example");
if (exampleParam) {
  const option = Array.from(exampleSelect.options).find((opt) => opt.value === exampleParam);
  if (option) {
    exampleSelect.value = exampleParam;
  }
}

// Initialize: load manifest then start
loadEnvManifest().then(() => {
  if (autorun === "1") {
    logger.info("Autorun enabled via query string.");
    loadExampleScene(exampleSelect.value).then(() => startRenderLoop());
  } else {
    logger.info("Ready. Load an example or choose a molecular file.");
  }

  updateMaterialState();
  updateRenderModeUi();
  updateMaterialVisibility();
  updateDisplayControlsVisibility();
  updateDofVisibility();
  updateEnvironmentVisibility();
  updateClipState({ preserveLock: true });
  updateRenderLimits();
  updateLightState();
  updateEnvironmentState().catch((err) => logger.error(err.message || String(err)));
  renderSceneGraphTree();
});

setActiveTab("scene");
