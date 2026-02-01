import { createLogger } from "./logger.js";
import { loadGltfFromText } from "./gltf.js";
import { buildSAHBVH, flattenBVH } from "./bvh.js";
import { packBvhNodes, packTriangles, packTriNormals, packTriColors, packTriIndices } from "./packing.js";
import { loadHDR } from "./hdr.js";
import {
  initWebGL,
  createDataTexture,
  createEnvTexture,
  createAccumTargets,
  resizeAccumTargets,
  createTextureUnit,
  setTraceUniforms,
  setDisplayUniforms,
  drawFullscreen,
  MAX_BRUTE_FORCE_TRIS
} from "./webgl.js";

const canvas = document.getElementById("view");
const statusEl = document.getElementById("status");
const logger = createLogger(statusEl);

const exampleSelect = document.getElementById("exampleSelect");
const loadExampleBtn = document.getElementById("loadExample");
const envSelect = document.getElementById("envSelect");
const envIntensityInput = document.getElementById("envIntensity");
const fileInput = document.getElementById("fileInput");
const loadFileBtn = document.getElementById("loadFile");
const renderBtn = document.getElementById("renderBtn");
const scaleSelect = document.getElementById("scaleSelect");
const bruteforceToggle = document.getElementById("bruteforceToggle");
const useGltfColorToggle = document.getElementById("useGltfColor");
const baseColorInput = document.getElementById("baseColor");
const metallicInput = document.getElementById("metallic");
const roughnessInput = document.getElementById("roughness");
const maxBouncesInput = document.getElementById("maxBounces");
const exposureInput = document.getElementById("exposure");
const ambientIntensityInput = document.getElementById("ambientIntensity");
const ambientColorInput = document.getElementById("ambientColor");
const rayBiasInput = document.getElementById("rayBias");
const tMinInput = document.getElementById("tMin");
const samplesPerBounceInput = document.getElementById("samplesPerBounce");
const shadowToggle = document.getElementById("shadowToggle");
const light1Enable = document.getElementById("light1Enable");
const light1Azimuth = document.getElementById("light1Azimuth");
const light1Elevation = document.getElementById("light1Elevation");
const light1Intensity = document.getElementById("light1Intensity");
const light1Color = document.getElementById("light1Color");
const light2Enable = document.getElementById("light2Enable");
const light2Azimuth = document.getElementById("light2Azimuth");
const light2Elevation = document.getElementById("light2Elevation");
const light2Intensity = document.getElementById("light2Intensity");
const light2Color = document.getElementById("light2Color");

const tabButtons = Array.from(document.querySelectorAll("[data-tab-button]"));
const tabPanels = Array.from(document.querySelectorAll("[data-tab-panel]"));

let sceneData = null;
let glState = null;
let isRendering = false;
let isLoading = false;
let loggedFirstFrame = false;
let glInitFailed = false;

const cameraState = {
  target: [0, 0, 0],
  distance: 4,
  yaw: 0,
  pitch: 0,
  fov: Math.PI / 3,
  width: 1,
  height: 1
};

const renderState = {
  scale: 0.75,
  frameIndex: 0,
  cameraDirty: true,
  useBvh: true,
  useGltfColor: true,
  baseColor: [0.8, 0.8, 0.8],
  metallic: 0.0,
  roughness: 0.4,
  maxBounces: 2,
  exposure: 1.0,
  ambientIntensity: 0.0,
  ambientColor: [1.0, 1.0, 1.0],
  envUrl: null,
  envIntensity: 1.0,
  envData: null,
  rayBias: 1e-5,
  tMin: 1e-5,
  samplesPerBounce: 2,
  castShadows: true,
  lights: [
    { enabled: true, azimuth: 45, elevation: 35, intensity: 1.5, color: [1.0, 1.0, 1.0] },
    { enabled: false, azimuth: -35, elevation: 15, intensity: 0.6, color: [1.0, 1.0, 1.0] }
  ]
};

const envCache = new Map();

const inputState = {
  dragging: false,
  lastX: 0,
  lastY: 0,
  keys: new Set()
};

async function fetchText(url) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }
  return await res.text();
}

async function loadGltfText(text, baseUrl = null) {
  logger.info("Parsing glTF");
  const { positions, indices, normals, triColors } = await loadGltfFromText(text, baseUrl, fetch);
  logger.info(`Loaded ${positions.length / 3} vertices, ${indices.length / 3} triangles`);
  if (positions.length === 0 || indices.length === 0) {
    throw new Error(
      `Loaded empty geometry (positions: ${positions.length}, indices: ${indices.length}).`
    );
  }

  logger.info("Building SAH BVH on CPU");
  const bvh = buildSAHBVH(positions, indices, { maxLeafSize: 4, maxDepth: 32 });
  logger.info(`BVH nodes: ${bvh.nodes.length}`);

  const flat = flattenBVH(bvh.nodes, bvh.tris);

  sceneData = {
    positions,
    indices,
    normals,
    triColors,
    nodes: bvh.nodes,
    tris: bvh.tris,
    triIndexBuffer: flat.triIndexBuffer,
    triCount: bvh.tris.length,
    triIndexCount: flat.triIndexBuffer.length,
    sceneScale: 1.0
  };
  renderState.frameIndex = 0;
  renderState.cameraDirty = true;

  const bounds = computeBounds(positions);
  if (bounds) {
    logger.info(
      `Bounds min (${bounds.minX.toFixed(2)}, ${bounds.minY.toFixed(2)}, ${bounds.minZ.toFixed(2)}) max (${bounds.maxX.toFixed(2)}, ${bounds.maxY.toFixed(2)}, ${bounds.maxZ.toFixed(2)})`
    );
    const dx = bounds.maxX - bounds.minX;
    const dy = bounds.maxY - bounds.minY;
    const dz = bounds.maxZ - bounds.minZ;
    sceneData.sceneScale = Math.max(1e-3, Math.sqrt(dx * dx + dy * dy + dz * dz) * 0.5);
    const suggestedBias = Math.max(1e-5, sceneData.sceneScale * 1e-5);
    rayBiasInput.value = suggestedBias.toFixed(6);
    tMinInput.value = suggestedBias.toFixed(6);
    renderState.rayBias = suggestedBias;
    renderState.tMin = suggestedBias;
    applyCameraToBounds(bounds);
  }
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hexToRgb(hex) {
  const value = hex.startsWith("#") ? hex.slice(1) : hex;
  if (value.length !== 6) return [1, 1, 1];
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return [r / 255, g / 255, b / 255];
}

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
  loggedFirstFrame = false;
  if (reason) {
    logger.info(reason);
  }
}

function setActiveTab(name) {
  tabButtons.forEach((button) => {
    button.classList.toggle("active", button.dataset.tabButton === name);
  });
  tabPanels.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.tabPanel === name);
  });
}

function updateMaterialState() {
  renderState.useGltfColor = useGltfColorToggle.checked;
  renderState.baseColor = hexToRgb(baseColorInput.value);
  renderState.metallic = clamp(Number(metallicInput.value), 0, 1);
  renderState.roughness = clamp(Number(roughnessInput.value), 0.02, 1);
  renderState.maxBounces = clamp(Number(maxBouncesInput.value), 0, 6);
  renderState.exposure = clamp(Number(exposureInput.value), 0, 5);
  renderState.ambientIntensity = clamp(Number(ambientIntensityInput.value), 0, 2);
  renderState.ambientColor = hexToRgb(ambientColorInput.value);
  renderState.envIntensity = clamp(Number(envIntensityInput.value), 0, 5);
  renderState.rayBias = clamp(Number(rayBiasInput.value), 0, 1);
  renderState.tMin = clamp(Number(tMinInput.value), 0, 1);
  renderState.samplesPerBounce = clamp(Number(samplesPerBounceInput.value), 1, 8);
  renderState.castShadows = shadowToggle.checked;
  resetAccumulation("Material settings updated.");
}

async function loadEnvironment(url) {
  if (!url) {
    renderState.envUrl = null;
    renderState.envData = null;
    if (glState) {
      if (glState.envTex && glState.envTex !== glState.blackEnvTex) {
        glState.gl.deleteTexture(glState.envTex);
      }
      glState.envTex = glState.blackEnvTex;
      glState.envSize = [1, 1];
      glState.envUrl = null;
    }
    return;
  }

  if (envCache.has(url)) {
    renderState.envData = envCache.get(url);
  } else {
    logger.info(`Loading environment: ${url}`);
    const env = await loadHDR(url, logger);
    envCache.set(url, env);
    renderState.envData = env;
  }
  renderState.envUrl = url;

  if (glState && renderState.envData) {
    if (glState.envTex && glState.envTex !== glState.blackEnvTex) {
      glState.gl.deleteTexture(glState.envTex);
    }
    glState.envTex = createEnvTexture(
      glState.gl,
      renderState.envData.width,
      renderState.envData.height,
      renderState.envData.data
    );
    glState.envSize = [renderState.envData.width, renderState.envData.height];
    glState.envUrl = url;
  }
}

async function updateEnvironmentState() {
  renderState.envIntensity = clamp(Number(envIntensityInput.value), 0, 5);
  const url = envSelect.value || null;
  if (url !== renderState.envUrl) {
    try {
      await loadEnvironment(url);
      resetAccumulation("Environment updated.");
    } catch (err) {
      logger.error(err.message || String(err));
    }
  } else {
    resetAccumulation("Environment intensity updated.");
  }
}

function updateLightState() {
  renderState.lights[0] = {
    enabled: light1Enable.checked,
    azimuth: Number(light1Azimuth.value),
    elevation: Number(light1Elevation.value),
    intensity: clamp(Number(light1Intensity.value), 0, 10),
    color: hexToRgb(light1Color.value)
  };
  renderState.lights[1] = {
    enabled: light2Enable.checked,
    azimuth: Number(light2Azimuth.value),
    elevation: Number(light2Elevation.value),
    intensity: clamp(Number(light2Intensity.value), 0, 10),
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
  const distance = radius / Math.tan(cameraState.fov / 2) * 1.4;
  cameraState.target = [cx, cy, cz];
  cameraState.distance = distance;
  cameraState.yaw = 0;
  cameraState.pitch = 0;
  renderState.cameraDirty = true;
  renderState.frameIndex = 0;
  logger.info(
    `Camera fit to bounds center (${cx.toFixed(2)}, ${cy.toFixed(2)}, ${cz.toFixed(2)}) radius ${radius.toFixed(2)}`
  );
}

function computeCameraVectors() {
  const { yaw, pitch, distance, target, fov, width, height } = cameraState;
  const cosPitch = Math.cos(pitch);
  const sinPitch = Math.sin(pitch);
  const cosYaw = Math.cos(yaw);
  const sinYaw = Math.sin(yaw);

  const forward = [cosPitch * sinYaw, sinPitch, cosPitch * cosYaw];
  const origin = [
    target[0] - forward[0] * distance,
    target[1] - forward[1] * distance,
    target[2] - forward[2] * distance
  ];

  const worldUp = [0, 1, 0];
  const right = [
    worldUp[1] * forward[2] - worldUp[2] * forward[1],
    worldUp[2] * forward[0] - worldUp[0] * forward[2],
    worldUp[0] * forward[1] - worldUp[1] * forward[0]
  ];
  const rightLen = Math.hypot(right[0], right[1], right[2]) || 1;
  right[0] /= rightLen;
  right[1] /= rightLen;
  right[2] /= rightLen;

  const up = [
    forward[1] * right[2] - forward[2] * right[1],
    forward[2] * right[0] - forward[0] * right[2],
    forward[0] * right[1] - forward[1] * right[0]
  ];

  const aspect = width / height;
  const scale = Math.tan(fov / 2);
  const rightScaled = [right[0] * scale * aspect, right[1] * scale * aspect, right[2] * scale * aspect];
  const upScaled = [up[0] * scale, up[1] * scale, up[2] * scale];

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
  if (inputState.keys.has("q")) {
    cameraState.target[1] += moveSpeed;
    moved = true;
  }
  if (inputState.keys.has("e")) {
    cameraState.target[1] -= moveSpeed;
    moved = true;
  }

  return moved;
}

function ensureWebGL() {
  if (!glState) {
    if (glInitFailed) {
      throw new Error("WebGL initialization previously failed.");
    }
    try {
      const { gl, traceProgram, displayProgram, vao } = initWebGL(canvas, logger);
      const blackEnvTex = createEnvTexture(gl, 1, 1, new Float32Array([0, 0, 0, 1]));
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
        envSize: [1, 1],
        envUrl: null
      };
    } catch (err) {
      glInitFailed = true;
      throw err;
    }
  }
  return glState;
}

function uploadSceneTextures(gl, maxTextureSize) {
  const bvh = packBvhNodes(sceneData.nodes, maxTextureSize);
  const tris = packTriangles(sceneData.tris, sceneData.positions, maxTextureSize);
  const triNormals = packTriNormals(sceneData.tris, sceneData.normals, maxTextureSize);
  const triColors = packTriColors(sceneData.triColors, maxTextureSize);
  const triIndices = packTriIndices(sceneData.triIndexBuffer, maxTextureSize);

  const bvhTex = createDataTexture(gl, bvh.width, bvh.height, bvh.data);
  const triTex = createDataTexture(gl, tris.width, tris.height, tris.data);
  const triNormalTex = createDataTexture(gl, triNormals.width, triNormals.height, triNormals.data);
  const triColorTex = createDataTexture(gl, triColors.width, triColors.height, triColors.data);
  const triIndexTex = createDataTexture(gl, triIndices.width, triIndices.height, triIndices.data);

  return {
    bvh,
    tris,
    triNormals,
    triColors,
    triIndices,
    bvhTex,
    triTex,
    triNormalTex,
    triColorTex,
    triIndexTex,
  };
}

function renderFrame() {
  if (!sceneData) {
    logger.warn("No scene loaded yet.");
    return;
  }
  const { gl, traceProgram, displayProgram, vao } = ensureWebGL();

  const displayWidth = Math.max(1, Math.floor(canvas.clientWidth));
  const displayHeight = Math.max(1, Math.floor(canvas.clientHeight));
  const scale = renderState.scale;
  const renderWidth = Math.max(1, Math.floor(displayWidth * scale));
  const renderHeight = Math.max(1, Math.floor(displayHeight * scale));

  if (renderWidth <= 1 || renderHeight <= 1) {
    logger.warn(`Canvas size is too small: ${renderWidth}x${renderHeight}`);
    return;
  }

  if (!loggedFirstFrame) {
    logger.info(`Rendering ${renderWidth}x${renderHeight} (scale ${scale.toFixed(2)}x)`);
    loggedFirstFrame = true;
  }

  canvas.width = displayWidth;
  canvas.height = displayHeight;
  cameraState.width = renderWidth;
  cameraState.height = renderHeight;

  if (!glState.textures) {
    const maxTextureSize = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    logger.info(`Uploading textures (MAX_TEXTURE_SIZE ${maxTextureSize})`);
    glState.textures = uploadSceneTextures(gl, maxTextureSize);
  }

  if (renderState.envData && glState.envUrl !== renderState.envUrl) {
    if (glState.envTex && glState.envTex !== glState.blackEnvTex) {
      gl.deleteTexture(glState.envTex);
    }
    glState.envTex = createEnvTexture(
      gl,
      renderState.envData.width,
      renderState.envData.height,
      renderState.envData.data
    );
    glState.envSize = [renderState.envData.width, renderState.envData.height];
    glState.envUrl = renderState.envUrl;
  }

  if (!renderState.useBvh && sceneData.triCount > MAX_BRUTE_FORCE_TRIS) {
    throw new Error(
      `Brute force mode supports up to ${MAX_BRUTE_FORCE_TRIS} triangles; scene has ${sceneData.triCount}.`
    );
  }

  if (!glState.accum) {
    logger.info("Allocating accumulation targets");
    glState.accum = createAccumTargets(gl, renderWidth, renderHeight);
    renderState.frameIndex = 0;
  } else {
    glState.accum = resizeAccumTargets(gl, glState.accum, renderWidth, renderHeight);
  }

  const camera = computeCameraVectors();
  const lightDirs = renderState.lights.map((light) =>
    lightDirFromAngles(light.azimuth, light.elevation)
  );

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
  createTextureUnit(gl, glState.textures.triIndexTex, 4);
  createTextureUnit(gl, glState.accum.textures[prevIndex], 5);
  createTextureUnit(gl, glState.envTex || glState.blackEnvTex, 6);

  setTraceUniforms(gl, traceProgram, {
    bvhUnit: 0,
    triUnit: 1,
    triNormalUnit: 2,
    triColorUnit: 3,
    triIndexUnit: 4,
    accumUnit: 5,
    envUnit: 6,
    camOrigin: camera.origin,
    camRight: camera.right,
    camUp: camera.up,
    camForward: camera.forward,
    resolution: [renderWidth, renderHeight],
    bvhTexSize: [glState.textures.bvh.width, glState.textures.bvh.height],
    triTexSize: [glState.textures.tris.width, glState.textures.tris.height],
    triNormalTexSize: [glState.textures.triNormals.width, glState.textures.triNormals.height],
    triColorTexSize: [glState.textures.triColors.width, glState.textures.triColors.height],
    triIndexTexSize: [glState.textures.triIndices.width, glState.textures.triIndices.height],
    envTexSize: glState.envSize || [1, 1],
    frameIndex: renderState.frameIndex,
    triCount: sceneData.triCount,
    useBvh: renderState.useBvh ? 1 : 0,
    useGltfColor: renderState.useGltfColor ? 1 : 0,
    baseColor: renderState.baseColor,
    metallic: renderState.metallic,
    roughness: renderState.roughness,
    maxBounces: renderState.maxBounces,
    exposure: renderState.exposure,
    ambientIntensity: renderState.ambientIntensity,
    ambientColor: renderState.ambientColor,
    envIntensity: renderState.envIntensity,
    useEnv: renderState.envUrl ? 1 : 0,
    samplesPerBounce: renderState.samplesPerBounce,
    castShadows: renderState.castShadows ? 1 : 0,
    rayBias: renderState.rayBias,
    tMin: renderState.tMin,
    lights: renderState.lights,
    lightDirs
  });

  gl.useProgram(traceProgram);
  drawFullscreen(gl);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, displayWidth, displayHeight);
  createTextureUnit(gl, glState.accum.textures[accumIndex], 0);

  setDisplayUniforms(gl, displayProgram, {
    displayUnit: 0,
    displayResolution: [displayWidth, displayHeight]
  });

  gl.useProgram(displayProgram);
  drawFullscreen(gl);

  glState.frameParity = prevIndex;
  renderState.frameIndex += 1;
  renderState.cameraDirty = false;
}

async function startRenderLoop() {
  if (isRendering) {
    return;
  }
  renderBtn.disabled = true;
  renderBtn.textContent = "Pause";
  isRendering = true;
  logger.info("Interactive render started.");
  let lastTime = performance.now();

  const loop = (time) => {
    if (!isRendering) {
      renderBtn.disabled = false;
      return;
    }
    const dt = Math.max(0.001, (time - lastTime) / 1000);
    lastTime = time;
    const moved = updateCameraFromInput(dt);
    if (moved) {
      renderState.cameraDirty = true;
    }
    try {
      renderFrame();
    } catch (err) {
      logger.error(err.message || String(err));
      isRendering = false;
      renderBtn.disabled = false;
      renderBtn.textContent = "Render";
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
  renderBtn.textContent = "Render";
  logger.info("Paused.");
}

async function loadExampleScene(url) {
  if (isLoading) return;
  isLoading = true;
  renderBtn.disabled = true;
  try {
    logger.info(`Loading example: ${url}`);
    const text = await fetchText(url);
    const baseUrl = new URL(url, window.location.href).toString();
    await loadGltfText(text, baseUrl);
    logger.info("Example loaded.");
  } catch (err) {
    logger.error(err.message || String(err));
  } finally {
    renderBtn.disabled = false;
    isLoading = false;
    glState = null;
  }
}

loadExampleBtn.addEventListener("click", async () => {
  const url = exampleSelect.value;
  await loadExampleScene(url);
});

loadFileBtn.addEventListener("click", async () => {
  renderBtn.disabled = true;
  try {
    const file = fileInput.files?.[0];
    if (!file) {
      throw new Error("Please pick a .gltf file.");
    }
    logger.info(`Loading file: ${file.name}`);
    const text = await file.text();
    await loadGltfText(text, null);
    logger.info("File loaded.");
    glState = null;
  } catch (err) {
    logger.error(err.message || String(err));
  } finally {
    renderBtn.disabled = false;
  }
});

renderBtn.addEventListener("click", async () => {
  if (isRendering) {
    stopRenderLoop();
    return;
  }
  await startRenderLoop();
});

canvas.addEventListener("mousedown", (event) => {
  inputState.dragging = true;
  inputState.lastX = event.clientX;
  inputState.lastY = event.clientY;
});

canvas.addEventListener("mouseup", () => {
  inputState.dragging = false;
});

canvas.addEventListener("mouseleave", () => {
  inputState.dragging = false;
});

canvas.addEventListener("mousemove", (event) => {
  if (!inputState.dragging) return;
  const dx = event.clientX - inputState.lastX;
  const dy = event.clientY - inputState.lastY;
  inputState.lastX = event.clientX;
  inputState.lastY = event.clientY;

  const rotateSpeed = 0.005;
  cameraState.yaw -= dx * rotateSpeed;
  cameraState.pitch -= dy * rotateSpeed;
  cameraState.pitch = clamp(cameraState.pitch, -1.45, 1.45);
  renderState.cameraDirty = true;
});

canvas.addEventListener("wheel", (event) => {
  event.preventDefault();
  const zoom = Math.exp(event.deltaY * 0.0015);
  cameraState.distance = clamp(cameraState.distance * zoom, 0.6, 25);
  renderState.cameraDirty = true;
}, { passive: false });

window.addEventListener("keydown", (event) => {
  inputState.keys.add(event.key.toLowerCase());
});

window.addEventListener("keyup", (event) => {
  inputState.keys.delete(event.key.toLowerCase());
});

scaleSelect.addEventListener("change", () => {
  const value = Number(scaleSelect.value);
  if (!Number.isFinite(value) || value <= 0) {
    return;
  }
  renderState.scale = value;
  resetAccumulation(`Render scale set to ${value.toFixed(2)}x`);
  glState = null;
});

envSelect.addEventListener("change", () => {
  updateEnvironmentState().catch((err) => logger.error(err.message || String(err)));
});
envIntensityInput.addEventListener("input", () => {
  updateEnvironmentState().catch((err) => logger.error(err.message || String(err)));
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    setActiveTab(button.dataset.tabButton);
  });
});

bruteforceToggle.addEventListener("change", () => {
  const mode = bruteforceToggle.value;
  renderState.useBvh = mode !== "bruteforce";
  resetAccumulation(`Traversal mode: ${renderState.useBvh ? "BVH" : "Brute force"}`);
});

useGltfColorToggle.addEventListener("change", updateMaterialState);
baseColorInput.addEventListener("input", updateMaterialState);
metallicInput.addEventListener("input", updateMaterialState);
roughnessInput.addEventListener("input", updateMaterialState);
maxBouncesInput.addEventListener("input", updateMaterialState);
exposureInput.addEventListener("input", updateMaterialState);
ambientIntensityInput.addEventListener("input", updateMaterialState);
ambientColorInput.addEventListener("input", updateMaterialState);
rayBiasInput.addEventListener("input", updateMaterialState);
tMinInput.addEventListener("input", updateMaterialState);
samplesPerBounceInput.addEventListener("input", updateMaterialState);
shadowToggle.addEventListener("change", updateMaterialState);

light1Enable.addEventListener("change", updateLightState);
light1Azimuth.addEventListener("input", updateLightState);
light1Elevation.addEventListener("input", updateLightState);
light1Intensity.addEventListener("input", updateLightState);
light1Color.addEventListener("input", updateLightState);
light2Enable.addEventListener("change", updateLightState);
light2Azimuth.addEventListener("input", updateLightState);
light2Elevation.addEventListener("input", updateLightState);
light2Intensity.addEventListener("input", updateLightState);
light2Color.addEventListener("input", updateLightState);

const params = new URLSearchParams(window.location.search);
const autorun = params.get("autorun");
const exampleParam = params.get("example");
if (exampleParam) {
  const option = Array.from(exampleSelect.options).find((opt) => opt.value === exampleParam);
  if (option) {
    exampleSelect.value = exampleParam;
  }
}

if (autorun === "1") {
  logger.info("Autorun enabled via query string.");
  setTimeout(() => {
    loadExampleScene(exampleSelect.value).then(() => startRenderLoop());
  }, 0);
} else {
  logger.info("Ready. Load an example or choose a .gltf file.");
}

updateMaterialState();
updateLightState();
updateEnvironmentState().catch((err) => logger.error(err.message || String(err)));
setActiveTab("tracing");
