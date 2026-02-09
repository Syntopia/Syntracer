import { triangulateSceneForPreview } from "./preview_mesh.js";

const SHADOW_MAP_SIZE = 1024;
const PREVIEW_VOLUME_OPACITY_SCALE = 1.0;
const PREVIEW_BRIGHTNESS_GAIN = 0.5;

function createSceneTargets(gl, width, height) {
  const colorTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, colorTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const normalTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, normalTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const depthTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, depthTexture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.DEPTH_COMPONENT24, width, height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTexture, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, normalTexture, 0);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`Scene framebuffer incomplete: ${status}`);
  }

  return { framebuffer, colorTexture, normalTexture, depthTexture, width, height };
}

function deleteSceneTargets(gl, sceneTargets) {
  if (!sceneTargets) return;
  if (sceneTargets.colorTexture) gl.deleteTexture(sceneTargets.colorTexture);
  if (sceneTargets.normalTexture) gl.deleteTexture(sceneTargets.normalTexture);
  if (sceneTargets.depthTexture) gl.deleteTexture(sceneTargets.depthTexture);
  if (sceneTargets.framebuffer) gl.deleteFramebuffer(sceneTargets.framebuffer);
}

function ensureSceneTargets(previewState, width, height) {
  const { gl } = previewState;
  if (
    previewState.sceneTargets
    && previewState.sceneTargets.width === width
    && previewState.sceneTargets.height === height
  ) {
    return previewState.sceneTargets;
  }
  deleteSceneTargets(gl, previewState.sceneTargets);
  previewState.sceneTargets = createSceneTargets(gl, width, height);
  return previewState.sceneTargets;
}

function invertMatrix4(m) {
  const inv = new Float32Array(16);
  const out = new Float32Array(16);

  inv[0] = m[5] * m[10] * m[15]
    - m[5] * m[11] * m[14]
    - m[9] * m[6] * m[15]
    + m[9] * m[7] * m[14]
    + m[13] * m[6] * m[11]
    - m[13] * m[7] * m[10];
  inv[4] = -m[4] * m[10] * m[15]
    + m[4] * m[11] * m[14]
    + m[8] * m[6] * m[15]
    - m[8] * m[7] * m[14]
    - m[12] * m[6] * m[11]
    + m[12] * m[7] * m[10];
  inv[8] = m[4] * m[9] * m[15]
    - m[4] * m[11] * m[13]
    - m[8] * m[5] * m[15]
    + m[8] * m[7] * m[13]
    + m[12] * m[5] * m[11]
    - m[12] * m[7] * m[9];
  inv[12] = -m[4] * m[9] * m[14]
    + m[4] * m[10] * m[13]
    + m[8] * m[5] * m[14]
    - m[8] * m[6] * m[13]
    - m[12] * m[5] * m[10]
    + m[12] * m[6] * m[9];
  inv[1] = -m[1] * m[10] * m[15]
    + m[1] * m[11] * m[14]
    + m[9] * m[2] * m[15]
    - m[9] * m[3] * m[14]
    - m[13] * m[2] * m[11]
    + m[13] * m[3] * m[10];
  inv[5] = m[0] * m[10] * m[15]
    - m[0] * m[11] * m[14]
    - m[8] * m[2] * m[15]
    + m[8] * m[3] * m[14]
    + m[12] * m[2] * m[11]
    - m[12] * m[3] * m[10];
  inv[9] = -m[0] * m[9] * m[15]
    + m[0] * m[11] * m[13]
    + m[8] * m[1] * m[15]
    - m[8] * m[3] * m[13]
    - m[12] * m[1] * m[11]
    + m[12] * m[3] * m[9];
  inv[13] = m[0] * m[9] * m[14]
    - m[0] * m[10] * m[13]
    - m[8] * m[1] * m[14]
    + m[8] * m[2] * m[13]
    + m[12] * m[1] * m[10]
    - m[12] * m[2] * m[9];
  inv[2] = m[1] * m[6] * m[15]
    - m[1] * m[7] * m[14]
    - m[5] * m[2] * m[15]
    + m[5] * m[3] * m[14]
    + m[13] * m[2] * m[7]
    - m[13] * m[3] * m[6];
  inv[6] = -m[0] * m[6] * m[15]
    + m[0] * m[7] * m[14]
    + m[4] * m[2] * m[15]
    - m[4] * m[3] * m[14]
    - m[12] * m[2] * m[7]
    + m[12] * m[3] * m[6];
  inv[10] = m[0] * m[5] * m[15]
    - m[0] * m[7] * m[13]
    - m[4] * m[1] * m[15]
    + m[4] * m[3] * m[13]
    + m[12] * m[1] * m[7]
    - m[12] * m[3] * m[5];
  inv[14] = -m[0] * m[5] * m[14]
    + m[0] * m[6] * m[13]
    + m[4] * m[1] * m[14]
    - m[4] * m[2] * m[13]
    - m[12] * m[1] * m[6]
    + m[12] * m[2] * m[5];
  inv[3] = -m[1] * m[6] * m[11]
    + m[1] * m[7] * m[10]
    + m[5] * m[2] * m[11]
    - m[5] * m[3] * m[10]
    - m[9] * m[2] * m[7]
    + m[9] * m[3] * m[6];
  inv[7] = m[0] * m[6] * m[11]
    - m[0] * m[7] * m[10]
    - m[4] * m[2] * m[11]
    + m[4] * m[3] * m[10]
    + m[8] * m[2] * m[7]
    - m[8] * m[3] * m[6];
  inv[11] = -m[0] * m[5] * m[11]
    + m[0] * m[7] * m[9]
    + m[4] * m[1] * m[11]
    - m[4] * m[3] * m[9]
    - m[8] * m[1] * m[7]
    + m[8] * m[3] * m[5];
  inv[15] = m[0] * m[5] * m[10]
    - m[0] * m[6] * m[9]
    - m[4] * m[1] * m[10]
    + m[4] * m[2] * m[9]
    + m[8] * m[1] * m[6]
    - m[8] * m[2] * m[5];

  const det = m[0] * inv[0] + m[1] * inv[4] + m[2] * inv[8] + m[3] * inv[12];
  if (Math.abs(det) < 1e-9) {
    return identity4();
  }
  const invDet = 1.0 / det;
  for (let i = 0; i < 16; i += 1) {
    out[i] = inv[i] * invDet;
  }
  return out;
}

function clampNumber(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.max(min, Math.min(max, n));
}

export function normalizePreviewQualitySettings(input) {
  return {
    shadows: input?.shadows !== false,
    ssr: Boolean(input?.ssr),
    edgeAccentStrength: clampNumber(input?.edgeAccentStrength, 0.0, 1.0, 0.0),
    lightIntensityScale: clampNumber(input?.lightIntensityScale, 0.0, 3.0, 1.0)
  };
}

export function choosePreviewVolumeTechnique(cameraDirty) {
  return cameraDirty ? 1 : 0; // 0=raymarch, 1=slices
}

export function sortTransparentIndicesByCameraDepth(positions, transparentIndices, cameraOrigin) {
  if (!(positions instanceof Float32Array)) {
    throw new Error("positions must be a Float32Array.");
  }
  if (!(transparentIndices instanceof Uint32Array)) {
    throw new Error("transparentIndices must be a Uint32Array.");
  }
  if (!Array.isArray(cameraOrigin) || cameraOrigin.length !== 3) {
    throw new Error("cameraOrigin must be a vec3 array.");
  }
  if (transparentIndices.length % 3 !== 0) {
    throw new Error("transparentIndices length must be a multiple of 3.");
  }

  const triCount = transparentIndices.length / 3;
  if (triCount === 0) {
    return new Uint32Array(0);
  }
  const order = new Array(triCount);
  for (let tri = 0; tri < triCount; tri += 1) {
    const base = tri * 3;
    const i0 = transparentIndices[base] * 3;
    const i1 = transparentIndices[base + 1] * 3;
    const i2 = transparentIndices[base + 2] * 3;
    const cx = (positions[i0] + positions[i1] + positions[i2]) / 3;
    const cy = (positions[i0 + 1] + positions[i1 + 1] + positions[i2 + 1]) / 3;
    const cz = (positions[i0 + 2] + positions[i1 + 2] + positions[i2 + 2]) / 3;
    const dx = cx - cameraOrigin[0];
    const dy = cy - cameraOrigin[1];
    const dz = cz - cameraOrigin[2];
    const d2 = dx * dx + dy * dy + dz * dz;
    order[tri] = { tri, d2 };
  }

  order.sort((a, b) => b.d2 - a.d2);
  const sorted = new Uint32Array(transparentIndices.length);
  for (let outTri = 0; outTri < triCount; outTri += 1) {
    const srcTri = order[outTri].tri;
    const srcBase = srcTri * 3;
    const outBase = outTri * 3;
    sorted[outBase] = transparentIndices[srcBase];
    sorted[outBase + 1] = transparentIndices[srcBase + 1];
    sorted[outBase + 2] = transparentIndices[srcBase + 2];
  }

  return sorted;
}

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const message = gl.getShaderInfoLog(shader) || "Unknown shader compile error.";
    gl.deleteShader(shader);
    throw new Error(message);
  }
  return shader;
}

function createProgram(gl, vertexSource, fragmentSource) {
  const vertexShader = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fragmentShader = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);
  gl.deleteShader(vertexShader);
  gl.deleteShader(fragmentShader);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const message = gl.getProgramInfoLog(program) || "Unknown program link error.";
    gl.deleteProgram(program);
    throw new Error(message);
  }

  return program;
}

function normalize3(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function dot3(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function sub3(a, b) {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross3(a, b) {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

function identity4() {
  const out = new Float32Array(16);
  out[0] = 1;
  out[5] = 1;
  out[10] = 1;
  out[15] = 1;
  return out;
}

function multiply4(a, b) {
  const out = new Float32Array(16);
  for (let row = 0; row < 4; row += 1) {
    for (let col = 0; col < 4; col += 1) {
      let sum = 0;
      for (let k = 0; k < 4; k += 1) {
        sum += a[row + k * 4] * b[k + col * 4];
      }
      out[row + col * 4] = sum;
    }
  }
  return out;
}

function transformPoint4(m, p) {
  const x = p[0], y = p[1], z = p[2];
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14]
  ];
}

function lookAt(eye, target, upHint) {
  const forward = normalize3(sub3(target, eye));
  let right = normalize3(cross3(forward, upHint));
  if (Math.hypot(right[0], right[1], right[2]) < 1e-6) {
    right = normalize3(cross3(forward, [1, 0, 0]));
  }
  const up = normalize3(cross3(right, forward));

  const view = new Float32Array(16);
  view[0] = right[0];
  view[1] = up[0];
  view[2] = -forward[0];
  view[3] = 0;
  view[4] = right[1];
  view[5] = up[1];
  view[6] = -forward[1];
  view[7] = 0;
  view[8] = right[2];
  view[9] = up[2];
  view[10] = -forward[2];
  view[11] = 0;
  view[12] = -dot3(right, eye);
  view[13] = -dot3(up, eye);
  view[14] = dot3(forward, eye);
  view[15] = 1;

  return view;
}

function perspective(fovY, aspect, near, far) {
  const f = 1 / Math.tan(fovY * 0.5);
  const nf = 1 / (near - far);
  const out = new Float32Array(16);
  out[0] = f / aspect;
  out[5] = f;
  out[10] = (far + near) * nf;
  out[11] = -1;
  out[14] = 2 * far * near * nf;
  return out;
}

function orthographic(left, right, bottom, top, near, far) {
  const out = new Float32Array(16);
  out[0] = 2 / (right - left);
  out[5] = 2 / (top - bottom);
  out[10] = -2 / (far - near);
  out[12] = -(right + left) / (right - left);
  out[13] = -(top + bottom) / (top - bottom);
  out[14] = -(far + near) / (far - near);
  out[15] = 1;
  return out;
}

function buildViewProjection(camera, fovY, aspect, near, far) {
  const forward = normalize3(camera.forward);
  const right = normalize3(camera.right);
  const up = normalize3(camera.up);
  const eye = camera.origin;

  const view = new Float32Array(16);
  view[0] = right[0];
  view[1] = up[0];
  view[2] = -forward[0];
  view[3] = 0;

  view[4] = right[1];
  view[5] = up[1];
  view[6] = -forward[1];
  view[7] = 0;

  view[8] = right[2];
  view[9] = up[2];
  view[10] = -forward[2];
  view[11] = 0;

  view[12] = -dot3(right, eye);
  view[13] = -dot3(up, eye);
  view[14] = dot3(forward, eye);
  view[15] = 1;

  return multiply4(perspective(fovY, aspect, near, far), view);
}

function computeMeshBounds(positions) {
  if (!positions || positions.length < 3) {
    return {
      min: [0, 0, 0],
      max: [0, 0, 0],
      center: [0, 0, 0],
      radius: 1
    };
  }

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

  const center = [(minX + maxX) * 0.5, (minY + maxY) * 0.5, (minZ + maxZ) * 0.5];
  const dx = maxX - minX;
  const dy = maxY - minY;
  const dz = maxZ - minZ;
  const radius = Math.max(1e-3, Math.sqrt(dx * dx + dy * dy + dz * dz) * 0.5);

  return {
    min: [minX, minY, minZ],
    max: [maxX, maxY, maxZ],
    center,
    radius
  };
}

function boundsCorners(bounds) {
  const [minX, minY, minZ] = bounds.min;
  const [maxX, maxY, maxZ] = bounds.max;
  return [
    [minX, minY, minZ], [maxX, minY, minZ],
    [minX, maxY, minZ], [maxX, maxY, minZ],
    [minX, minY, maxZ], [maxX, minY, maxZ],
    [minX, maxY, maxZ], [maxX, maxY, maxZ]
  ];
}

function buildLightViewProjection(lightDir, bounds) {
  const dir = normalize3(lightDir);
  const center = bounds.center;
  const eye = [
    center[0] - dir[0] * bounds.radius * 3,
    center[1] - dir[1] * bounds.radius * 3,
    center[2] - dir[2] * bounds.radius * 3
  ];
  const upHint = Math.abs(dir[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const view = lookAt(eye, center, upHint);

  const corners = boundsCorners(bounds);
  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;
  for (const corner of corners) {
    const p = transformPoint4(view, corner);
    minX = Math.min(minX, p[0]);
    minY = Math.min(minY, p[1]);
    minZ = Math.min(minZ, p[2]);
    maxX = Math.max(maxX, p[0]);
    maxY = Math.max(maxY, p[1]);
    maxZ = Math.max(maxZ, p[2]);
  }

  const pad = bounds.radius * 0.2 + 0.5;
  minX -= pad;
  minY -= pad;
  maxX += pad;
  maxY += pad;

  const near = Math.max(0.01, -maxZ - pad);
  const far = Math.max(near + 0.1, -minZ + pad);
  const proj = orthographic(minX, maxX, minY, maxY, near, far);
  return multiply4(proj, view);
}

const PREVIEW_VERTEX_SHADER = `#version 300 es
precision highp float;

layout(location = 0) in vec3 aPosition;
layout(location = 1) in vec3 aNormal;
layout(location = 2) in vec3 aColor;
layout(location = 3) in vec4 aMaterial;

uniform mat4 uViewProj;
uniform mat4 uLightViewProj0;
uniform mat4 uLightViewProj1;
uniform mat4 uLightViewProj2;

out vec3 vWorldPos;
out vec3 vNormal;
out vec3 vColor;
out vec4 vMaterial;
out vec4 vShadowPos0;
out vec4 vShadowPos1;
out vec4 vShadowPos2;

void main() {
  vec4 worldPos = vec4(aPosition, 1.0);
  vWorldPos = aPosition;
  vNormal = normalize(aNormal);
  vColor = aColor;
  vMaterial = aMaterial;
  vShadowPos0 = uLightViewProj0 * worldPos;
  vShadowPos1 = uLightViewProj1 * worldPos;
  vShadowPos2 = uLightViewProj2 * worldPos;
  gl_Position = uViewProj * worldPos;
}
`;

const PREVIEW_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec3 vWorldPos;
in vec3 vNormal;
in vec3 vColor;
in vec4 vMaterial;
in vec4 vShadowPos0;
in vec4 vShadowPos1;
in vec4 vShadowPos2;

uniform vec3 uCameraPos;
uniform vec3 uAmbientColor;
uniform float uAmbientIntensity;
uniform int uLightEnabled[3];
uniform vec3 uLightDir[3];
uniform vec3 uLightColor[3];
uniform float uLightIntensity[3];
uniform int uCastShadows;
uniform int uClipEnabled;
uniform vec3 uClipNormal;
uniform float uClipOffset;
uniform float uClipSide;
uniform int uToneMapMode;
uniform float uPreviewGain;
uniform sampler2D uShadowTex0;
uniform sampler2D uShadowTex1;
uniform sampler2D uShadowTex2;

layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outNormal;

vec3 toneMapReinhard(vec3 c) {
  return c / (1.0 + c);
}

vec3 toneMapAces(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

float readShadowTex(int index, vec2 uv) {
  if (index == 0) return texture(uShadowTex0, uv).r;
  if (index == 1) return texture(uShadowTex1, uv).r;
  return texture(uShadowTex2, uv).r;
}

float shadowFromCoord(int index, vec4 shadowPos, vec3 normal, vec3 lightDir) {
  vec3 proj = shadowPos.xyz / max(shadowPos.w, 1e-6);
  vec2 uv = proj.xy * 0.5 + 0.5;
  float depth = proj.z * 0.5 + 0.5;

  if (uv.x <= 0.0 || uv.y <= 0.0 || uv.x >= 1.0 || uv.y >= 1.0 || depth <= 0.0 || depth >= 1.0) {
    return 1.0;
  }

  float bias = max(0.0008, 0.005 * (1.0 - max(dot(normal, lightDir), 0.0)));
  vec2 texel = vec2(1.0 / 1024.0);

  float lit = 0.0;
  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      float closest = readShadowTex(index, uv + vec2(float(x), float(y)) * texel);
      lit += (depth - bias <= closest) ? 1.0 : 0.0;
    }
  }
  return lit / 9.0;
}

void main() {
  if (uClipEnabled == 1) {
    float side = dot(uClipNormal, vWorldPos) - uClipOffset;
    if (side * uClipSide < 0.0) {
      discard;
    }
  }

  vec3 N = normalize(vNormal);
  vec3 V = normalize(uCameraPos - vWorldPos);

  float roughness = clamp(vMaterial.x, 0.02, 1.0);
  float metallic = clamp(vMaterial.y, 0.0, 1.0);
  float opacity = clamp(vMaterial.z, 0.0, 1.0);
  float rimBoost = clamp(vMaterial.w, 0.0, 2.0);

  vec3 baseColor = clamp(vColor, 0.0, 1.0);
  vec3 F0 = mix(vec3(0.04), baseColor, metallic);

  vec3 lit = uAmbientColor * uAmbientIntensity * baseColor;

  for (int i = 0; i < 3; i++) {
    if (uLightEnabled[i] == 0) {
      continue;
    }
    vec3 L = normalize(-uLightDir[i]);
    float ndotl = max(dot(N, L), 0.0);
    if (ndotl <= 0.0) {
      continue;
    }

    float shadow = 1.0;
    if (uCastShadows == 1) {
      if (i == 0) shadow = shadowFromCoord(0, vShadowPos0, N, L);
      else if (i == 1) shadow = shadowFromCoord(1, vShadowPos1, N, L);
      else shadow = shadowFromCoord(2, vShadowPos2, N, L);
    }

    vec3 H = normalize(L + V);
    float ndoth = max(dot(N, H), 0.0);
    float exponent = mix(2.0, 72.0, 1.0 - roughness);
    float specPower = pow(ndoth, exponent);
    vec3 spec = F0 * specPower;
    vec3 diff = (1.0 - metallic) * baseColor * ndotl;

    vec3 lightColor = uLightColor[i] * uLightIntensity[i] * 0.45;
    lit += (diff + spec) * lightColor * shadow;
  }

  float rim = pow(1.0 - max(dot(N, V), 0.0), 2.5) * rimBoost;
  lit += baseColor * rim * 0.2;

  lit *= uPreviewGain;
  if (uToneMapMode == 1) {
    lit = toneMapReinhard(lit);
  } else if (uToneMapMode == 2) {
    lit = toneMapAces(lit);
  }
  lit = pow(max(lit, vec3(0.0)), vec3(1.0 / 2.2));

  outColor = vec4(clamp(lit, 0.0, 1.0), opacity);
  outNormal = vec4(N * 0.5 + 0.5, opacity);
}
`;

const SHADOW_VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec3 aPosition;
uniform mat4 uLightViewProj;
void main() {
  gl_Position = uLightViewProj * vec4(aPosition, 1.0);
}
`;

const SHADOW_FRAGMENT_SHADER = `#version 300 es
precision highp float;
void main() {}
`;

const BACKGROUND_VERTEX_SHADER = `#version 300 es
precision highp float;
const vec2 positions[3] = vec2[3](
  vec2(-1.0, -3.0),
  vec2(3.0, 1.0),
  vec2(-1.0, 1.0)
);
void main() {
  gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
}
`;

const BACKGROUND_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamForward;
uniform vec2 uResolution;
uniform int uUseEnv;
uniform sampler2D uEnvTex;
uniform vec2 uEnvSize;
uniform float uEnvBgIntensity;
uniform float uEnvRotationYawRad;
uniform float uEnvRotationPitchRad;
uniform int uToneMapMode;
uniform float uPreviewGain;

layout(location = 0) out vec4 outColor;

vec3 rotateYawPitch(vec3 d, float yaw, float pitch) {
  float sy = sin(yaw);
  float cy = cos(yaw);
  vec3 yrot = vec3(cy * d.x + sy * d.z, d.y, -sy * d.x + cy * d.z);
  float sp = sin(pitch);
  float cp = cos(pitch);
  return vec3(yrot.x, cp * yrot.y - sp * yrot.z, sp * yrot.y + cp * yrot.z);
}

vec2 dirToEquirectUv(vec3 dir) {
  float phi = atan(dir.z, dir.x);
  float theta = acos(clamp(dir.y, -1.0, 1.0));
  return vec2((phi + 3.14159265359) / 6.28318530718, theta / 3.14159265359);
}

vec3 toneMapReinhard(vec3 c) {
  return c / (1.0 + c);
}

vec3 toneMapAces(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec2 ndc = (gl_FragCoord.xy + vec2(0.5)) / uResolution * 2.0 - 1.0;
  vec3 dir = normalize(
    uCamForward +
    ndc.x * uCamRight +
    ndc.y * uCamUp
  );

  vec3 color;
  if (uUseEnv == 1) {
    vec3 rotated = rotateYawPitch(dir, uEnvRotationYawRad, uEnvRotationPitchRad);
    vec2 uv = dirToEquirectUv(normalize(rotated));
    color = texture(uEnvTex, uv).rgb * uEnvBgIntensity;
  } else {
    float t = clamp(0.5 * (dir.y + 1.0), 0.0, 1.0);
    color = mix(vec3(0.14, 0.14, 0.16), vec3(0.24, 0.26, 0.30), t);
  }

  color *= uPreviewGain;
  if (uToneMapMode == 1) {
    color = toneMapReinhard(color);
  } else if (uToneMapMode == 2) {
    color = toneMapAces(color);
  }
  color = pow(max(color, vec3(0.0)), vec3(1.0 / 2.2));

  outColor = vec4(color, 1.0);
}
`;

const COMPOSITE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

uniform sampler2D uSceneColor;
uniform sampler2D uSceneNormal;
uniform sampler2D uSceneDepth;
uniform vec2 uResolution;
uniform int uEnableSsr;
uniform mat4 uInvViewProj;
uniform vec3 uCameraPos;
uniform float uEdgeAccentStrength;

layout(location = 0) out vec4 outColor;

float depthAt(vec2 uv) {
  return texture(uSceneDepth, uv).r;
}

vec3 normalAt(vec2 uv) {
  vec3 n = texture(uSceneNormal, uv).xyz * 2.0 - 1.0;
  float lenN = length(n);
  if (lenN < 1e-5) return vec3(0.0, 0.0, 1.0);
  return n / lenN;
}

vec3 worldPosAt(vec2 uv, float depth) {
  vec4 clip = vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 world = uInvViewProj * clip;
  return world.xyz / max(world.w, 1e-6);
}

vec3 computeSsr(vec2 uv, vec3 baseColor, vec3 centerPos, vec3 centerNormal, float roughnessHint) {
  vec3 viewDir = normalize(uCameraPos - centerPos);
  vec3 refl = reflect(-viewDir, centerNormal);
  vec2 stepUv = refl.xy * (1.0 / max(uResolution, vec2(1.0))) * 18.0;
  vec2 marchUv = uv;
  vec3 hit = baseColor;
  float hitWeight = 0.0;
  for (int i = 0; i < 12; i++) {
    marchUv += stepUv;
    if (marchUv.x <= 0.0 || marchUv.y <= 0.0 || marchUv.x >= 1.0 || marchUv.y >= 1.0) break;
    float sd = depthAt(marchUv);
    if (sd >= 0.999999) continue;
    vec3 sampleColor = texture(uSceneColor, marchUv).rgb;
    float fade = 1.0 - float(i) / 12.0;
    hit += sampleColor * fade;
    hitWeight += fade;
    if (i > 3) break;
  }
  if (hitWeight <= 1e-4) return baseColor;
  vec3 reflected = hit / (1.0 + hitWeight);
  float fresnel = pow(1.0 - max(dot(centerNormal, viewDir), 0.0), 2.0);
  float weight = mix(0.04, 0.18, fresnel) * (1.0 - roughnessHint);
  return mix(baseColor, reflected, clamp(weight, 0.0, 0.25));
}

float computeNormalOcclusion(vec2 uv, vec3 centerNormal) {
  vec2 texel = 1.0 / max(uResolution, vec2(1.0));
  vec2 offsets[4] = vec2[4](
    vec2(1.0, 0.0),
    vec2(-1.0, 0.0),
    vec2(0.0, 1.0),
    vec2(0.0, -1.0)
  );
  float edge = 0.0;
  for (int i = 0; i < 4; i++) {
    vec3 n = normalAt(clamp(uv + offsets[i] * texel * 2.0, vec2(0.001), vec2(0.999)));
    edge += (1.0 - max(dot(centerNormal, n), 0.0));
  }
  float edgeStrength = clamp(uEdgeAccentStrength, 0.0, 1.0) * 0.85;
  return clamp(1.0 - edge * edgeStrength, 0.6, 1.0);
}

vec3 computeSsrFallback(vec2 uv, vec3 baseColor, vec3 normal) {
  vec2 reflectUv = clamp(
    uv + vec2(normal.x, -normal.y) * 0.06,
    vec2(0.001),
    vec2(0.999)
  );
  vec3 reflected = texture(uSceneColor, reflectUv).rgb;
  float weight = 0.18 + 0.12 * pow(1.0 - abs(normal.z), 2.0);
  return mix(baseColor, reflected, clamp(weight, 0.0, 0.35));
}

float edgeLuma(vec3 c) {
  vec3 compressed = c / (vec3(1.0) + c);
  return dot(compressed, vec3(0.2126, 0.7152, 0.0722));
}

float computeEdgeAccent(vec2 uv) {
  vec2 texel = 1.0 / max(uResolution, vec2(1.0));
  float lL = edgeLuma(texture(uSceneColor, clamp(uv + vec2(-texel.x, 0.0), vec2(0.001), vec2(0.999))).rgb);
  float lR = edgeLuma(texture(uSceneColor, clamp(uv + vec2(texel.x, 0.0), vec2(0.001), vec2(0.999))).rgb);
  float lD = edgeLuma(texture(uSceneColor, clamp(uv + vec2(0.0, -texel.y), vec2(0.001), vec2(0.999))).rgb);
  float lU = edgeLuma(texture(uSceneColor, clamp(uv + vec2(0.0, texel.y), vec2(0.001), vec2(0.999))).rgb);
  float grad = length(vec2(lR - lL, lU - lD));
  return smoothstep(0.05, 0.28, grad);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution;
  vec4 scene = texture(uSceneColor, uv);
  vec3 rawNormal = texture(uSceneNormal, uv).xyz;
  float depth = depthAt(uv);

  // Volume pass can contribute color without writing normal, and alpha can be
  // very small in the intermediate RGBA8 target. Consider non-zero color too.
  bool hasGeometry = (scene.a > 1e-4)
    || (dot(rawNormal, rawNormal) > 1e-6)
    || (dot(scene.rgb, scene.rgb) > 1e-7);
  if (!hasGeometry) {
    outColor = vec4(0.0, 0.0, 0.0, 0.0);
    return;
  }

  vec3 color = scene.rgb;
  // Volume-only pixels have color but no normal/depth — pass through as-is
  bool hasNormal = dot(rawNormal, rawNormal) > 1e-6;
  if (!hasNormal && depth >= 0.999999) {
    outColor = vec4(color, scene.a > 1e-4 ? 1.0 : 0.0);
    return;
  }

  vec3 normal = normalAt(uv);
  if (uEdgeAccentStrength > 0.0) {
    color *= computeNormalOcclusion(uv, normal);
  }
  if (depth >= 0.999999 || uEnableSsr == 0) {
    if (uEnableSsr == 1) {
      color = computeSsrFallback(uv, color, normal);
    }
    if (uEdgeAccentStrength > 0.0) {
      float edge = computeEdgeAccent(uv);
      color *= (1.0 - 0.7 * edge * clamp(uEdgeAccentStrength, 0.0, 1.0));
    }
    outColor = vec4(color, 1.0);
    return;
  }

  vec3 pos = worldPosAt(uv, depth);
  float roughnessHint = 0.5 + 0.5 * abs(normal.z);

  if (uEnableSsr == 1) {
    vec3 ssrDepth = computeSsr(uv, color, pos, normal, roughnessHint);
    vec3 ssrFallback = computeSsrFallback(uv, color, normal);
    color = mix(ssrDepth, ssrFallback, 0.35);
  }
  if (uEdgeAccentStrength > 0.0) {
    float edge = computeEdgeAccent(uv);
    color *= (1.0 - 0.7 * edge * clamp(uEdgeAccentStrength, 0.0, 1.0));
  }
  outColor = vec4(color, 1.0);
}
`;

const VOLUME_VERTEX_SHADER = `#version 300 es
precision highp float;
const vec2 positions[3] = vec2[3](
  vec2(-1.0, -3.0),
  vec2(3.0, 1.0),
  vec2(-1.0, 1.0)
);
void main() {
  gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
}
`;

const VOLUME_FRAGMENT_SHADER = `#version 300 es
precision highp float;
precision highp sampler3D;

uniform sampler3D uVolumeTex;
uniform vec3 uCamOrigin;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamForward;
uniform vec2 uResolution;
uniform vec3 uVolumeMin;
uniform vec3 uVolumeMax;
uniform vec3 uVolumeInvSize;
uniform float uVolumeMaxValue;
uniform float uVolumeThreshold;
uniform float uVolumeValueMax;
uniform float uVolumeDensity;
uniform float uVolumeOpacity;
uniform float uVolumeStep;
uniform int uVolumeMaxSteps;
uniform int uTransferPreset;
uniform vec3 uPositiveColor;
uniform vec3 uNegativeColor;
uniform int uTechnique;
uniform int uSliceCount;
uniform int uToneMapMode;
uniform float uPreviewGain;
uniform int uClipEnabled;
uniform vec3 uClipNormal;
uniform float uClipOffset;
uniform float uClipSide;

layout(location = 0) out vec4 outColor;

bool intersectAabb(vec3 ro, vec3 rd, vec3 bmin, vec3 bmax, out float tNear, out float tFar) {
  vec3 invDir = 1.0 / max(abs(rd), vec3(1e-8)) * sign(rd);
  vec3 t0 = (bmin - ro) * invDir;
  vec3 t1 = (bmax - ro) * invDir;
  vec3 tMin = min(t0, t1);
  vec3 tMax = max(t0, t1);
  tNear = max(max(tMin.x, tMin.y), tMin.z);
  tFar = min(min(tMax.x, tMax.y), tMax.z);
  return tFar >= max(tNear, 0.0);
}

vec4 transfer(float value) {
  float maxV = max(abs(uVolumeMaxValue), 1e-6);
  float signedNorm = value / maxV;
  float mag = abs(signedNorm);
  float threshold = clamp(uVolumeThreshold, 0.0, 1.0);
  float windowSpan = max(uVolumeValueMax - threshold, 1e-6);
  float mapped = clamp((mag - threshold) / windowSpan, 0.0, 1.0);

  if (uTransferPreset == 1) { // grayscale
    return vec4(vec3(mapped), mapped);
  }
  if (uTransferPreset == 2) { // heatmap
    vec3 c = vec3(
      smoothstep(0.0, 0.6, mapped),
      smoothstep(0.2, 0.85, mapped),
      smoothstep(0.5, 1.0, mapped)
    );
    return vec4(c, mapped);
  }
  vec3 c = signedNorm >= 0.0 ? uPositiveColor : uNegativeColor; // orbital
  return vec4(c, mapped);
}

vec3 toneMapReinhard(vec3 c) {
  return c / (1.0 + c);
}

vec3 toneMapAces(vec3 x) {
  const float a = 2.51;
  const float b = 0.03;
  const float c = 2.43;
  const float d = 0.59;
  const float e = 0.14;
  return clamp((x * (a * x + b)) / (x * (c * x + d) + e), 0.0, 1.0);
}

void main() {
  vec2 uv = (gl_FragCoord.xy + vec2(0.5)) / uResolution * 2.0 - 1.0;
  vec3 rayDir = normalize(uCamForward + uv.x * uCamRight + uv.y * uCamUp);
  vec3 rayOrigin = uCamOrigin;

  float tEnter;
  float tExit;
  if (!intersectAabb(rayOrigin, rayDir, uVolumeMin, uVolumeMax, tEnter, tExit)) {
    discard;
  }

  tEnter = max(0.0, tEnter);
  if (tExit <= tEnter) {
    discard;
  }

  vec3 accumColor = vec3(0.0);
  float accumAlpha = 0.0;

  if (uTechnique == 1) {
    int slices = max(8, uSliceCount);
    float dt = (tExit - tEnter) / float(slices);
    for (int i = 0; i < 512; i += 1) {
      if (i >= slices) break;
      float t = tEnter + (float(i) + 0.5) * dt;
      vec3 p = rayOrigin + rayDir * t;
      if (uClipEnabled == 1) {
        float clipSide = dot(uClipNormal, p) - uClipOffset;
        if (clipSide * uClipSide < 0.0) {
          continue;
        }
      }
      vec3 texCoord = (p - uVolumeMin) * uVolumeInvSize;
      float value = texture(uVolumeTex, texCoord).r;
      vec4 tr = transfer(value);
      if (tr.a > 0.0) {
        float alpha = 1.0 - exp(-tr.a * uVolumeDensity * dt);
        alpha = clamp(alpha * uVolumeOpacity, 0.0, 1.0);
        vec3 contrib = tr.rgb * alpha;
        accumColor += (1.0 - accumAlpha) * contrib;
        accumAlpha += (1.0 - accumAlpha) * alpha;
        if (accumAlpha > 0.995) break;
      }
    }
  } else {
    float stepLen = max(0.001, uVolumeStep);
    int maxSteps = max(8, uVolumeMaxSteps);
    float t = tEnter;
    for (int i = 0; i < 2048; i += 1) {
      if (i >= maxSteps || t > tExit) break;
      float currentStep = min(stepLen, tExit - t);
      vec3 p = rayOrigin + rayDir * t;
      if (uClipEnabled == 1) {
        float clipSide = dot(uClipNormal, p) - uClipOffset;
        if (clipSide * uClipSide < 0.0) {
          t += stepLen;
          continue;
        }
      }
      vec3 texCoord = (p - uVolumeMin) * uVolumeInvSize;
      float value = texture(uVolumeTex, texCoord).r;
      vec4 tr = transfer(value);
      if (tr.a > 0.0) {
        float alpha = 1.0 - exp(-tr.a * uVolumeDensity * currentStep);
        alpha = clamp(alpha * uVolumeOpacity, 0.0, 1.0);
        vec3 contrib = tr.rgb * alpha;
        accumColor += (1.0 - accumAlpha) * contrib;
        accumAlpha += (1.0 - accumAlpha) * alpha;
        if (accumAlpha > 0.995) break;
      }
      t += stepLen;
    }
  }

  if (accumAlpha <= 1e-5) {
    discard;
  }
  accumColor *= uPreviewGain;
  if (uToneMapMode == 1) {
    accumColor = toneMapReinhard(accumColor);
  } else if (uToneMapMode == 2) {
    accumColor = toneMapAces(accumColor);
  }
  accumColor = pow(max(accumColor, vec3(0.0)), vec3(1.0 / 2.2));
  float a = clamp(accumAlpha, 0.0, 1.0);
  outColor = vec4(accumColor / max(a, 1e-5), a);
}
`;

function toneMapMode(toneMap) {
  if (toneMap === "none") return 0;
  if (toneMap === "reinhard") return 1;
  return 2;
}

function deleteBuffer(gl, buffer) {
  if (buffer) gl.deleteBuffer(buffer);
}

function createShadowMap(gl) {
  const depthTexture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, depthTexture);
  gl.texImage2D(
    gl.TEXTURE_2D,
    0,
    gl.DEPTH_COMPONENT24,
    SHADOW_MAP_SIZE,
    SHADOW_MAP_SIZE,
    0,
    gl.DEPTH_COMPONENT,
    gl.UNSIGNED_INT,
    null
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTexture, 0);
  gl.drawBuffers([gl.NONE]);
  gl.readBuffer(gl.NONE);

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`Shadow framebuffer incomplete: ${status}`);
  }

  return { depthTexture, framebuffer };
}

export function disposePreviewBackend(previewState) {
  if (!previewState) return;
  const { gl } = previewState;
  deleteBuffer(gl, previewState.positionBuffer);
  deleteBuffer(gl, previewState.normalBuffer);
  deleteBuffer(gl, previewState.colorBuffer);
  deleteBuffer(gl, previewState.materialBuffer);
  deleteBuffer(gl, previewState.indexBuffer);
  deleteBuffer(gl, previewState.opaqueIndexBuffer);
  deleteBuffer(gl, previewState.transparentIndexBuffer);
  if (previewState.vao) gl.deleteVertexArray(previewState.vao);
  if (previewState.emptyVao) gl.deleteVertexArray(previewState.emptyVao);
  if (previewState.program) gl.deleteProgram(previewState.program);
  if (previewState.shadowProgram) gl.deleteProgram(previewState.shadowProgram);
  if (previewState.backgroundProgram) gl.deleteProgram(previewState.backgroundProgram);
  if (previewState.compositeProgram) gl.deleteProgram(previewState.compositeProgram);
  if (previewState.volumeProgram) gl.deleteProgram(previewState.volumeProgram);
  deleteSceneTargets(gl, previewState.sceneTargets);
  for (const shadow of previewState.shadowMaps || []) {
    if (!shadow) continue;
    if (shadow.depthTexture) gl.deleteTexture(shadow.depthTexture);
    if (shadow.framebuffer) gl.deleteFramebuffer(shadow.framebuffer);
  }
}

export function createPreviewBackend(gl, logger) {
  const program = createProgram(gl, PREVIEW_VERTEX_SHADER, PREVIEW_FRAGMENT_SHADER);
  const shadowProgram = createProgram(gl, SHADOW_VERTEX_SHADER, SHADOW_FRAGMENT_SHADER);
  const backgroundProgram = createProgram(gl, BACKGROUND_VERTEX_SHADER, BACKGROUND_FRAGMENT_SHADER);
  const compositeProgram = createProgram(gl, BACKGROUND_VERTEX_SHADER, COMPOSITE_FRAGMENT_SHADER);
  const volumeProgram = createProgram(gl, VOLUME_VERTEX_SHADER, VOLUME_FRAGMENT_SHADER);

  const vao = gl.createVertexArray();
  const emptyVao = gl.createVertexArray();
  const positionBuffer = gl.createBuffer();
  const normalBuffer = gl.createBuffer();
  const colorBuffer = gl.createBuffer();
  const materialBuffer = gl.createBuffer();
  const indexBuffer = gl.createBuffer();
  const opaqueIndexBuffer = gl.createBuffer();
  const transparentIndexBuffer = gl.createBuffer();

  if (!vao || !emptyVao || !positionBuffer || !normalBuffer || !colorBuffer || !materialBuffer || !indexBuffer || !opaqueIndexBuffer || !transparentIndexBuffer) {
    throw new Error("Failed to allocate preview renderer buffers.");
  }

  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, normalBuffer);
  gl.enableVertexAttribArray(1);
  gl.vertexAttribPointer(1, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
  gl.enableVertexAttribArray(2);
  gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ARRAY_BUFFER, materialBuffer);
  gl.enableVertexAttribArray(3);
  gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 0, 0);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
  gl.bindVertexArray(null);

  const shadowMaps = [createShadowMap(gl), createShadowMap(gl), createShadowMap(gl)];

  logger?.info("Preview backend initialized.");

  return {
    gl,
    program,
    shadowProgram,
    backgroundProgram,
    compositeProgram,
    volumeProgram,
    vao,
    emptyVao,
    positionBuffer,
    normalBuffer,
    colorBuffer,
    materialBuffer,
    indexBuffer,
    opaqueIndexBuffer,
    transparentIndexBuffer,
    indexCount: 0,
    opaqueIndexCount: 0,
    transparentIndexCount: 0,
    transparentIndicesSource: new Uint32Array(0),
    positionSource: new Float32Array(0),
    sceneRef: null,
    meshBounds: null,
    lightViewProj: [identity4(), identity4(), identity4()],
    shadowMaps,
    sceneTargets: null
  };
}

function uploadPreviewMesh(previewState, mesh) {
  const { gl } = previewState;

  gl.bindBuffer(gl.ARRAY_BUFFER, previewState.positionBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.positions, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, previewState.normalBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.normals, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, previewState.colorBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.colors, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ARRAY_BUFFER, previewState.materialBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, mesh.material, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, previewState.indexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.indices, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, previewState.opaqueIndexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.opaqueIndices, gl.STATIC_DRAW);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, previewState.transparentIndexBuffer);
  gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, mesh.transparentIndices, gl.STATIC_DRAW);

  previewState.indexCount = mesh.indices.length;
  previewState.opaqueIndexCount = mesh.opaqueIndices.length;
  previewState.transparentIndexCount = mesh.transparentIndices.length;
  previewState.transparentIndicesSource = mesh.transparentIndices;
  previewState.positionSource = mesh.positions;
  previewState.meshBounds = computeMeshBounds(mesh.positions);
}

function setLightUniforms(gl, program, renderState, lightDirs, intensityScale) {
  const enabled = [0, 0, 0];
  const dirs = new Float32Array(9);
  const colors = new Float32Array(9);
  const intensity = new Float32Array(3);

  for (let i = 0; i < 3; i += 1) {
    const light = renderState.lights[i] || { enabled: false, color: [1, 1, 1], intensity: 0 };
    const dir = lightDirs[i] || [0, 1, 0];
    enabled[i] = light.enabled ? 1 : 0;
    dirs[i * 3 + 0] = dir[0];
    dirs[i * 3 + 1] = dir[1];
    dirs[i * 3 + 2] = dir[2];
    colors[i * 3 + 0] = light.color?.[0] ?? 1;
    colors[i * 3 + 1] = light.color?.[1] ?? 1;
    colors[i * 3 + 2] = light.color?.[2] ?? 1;
    intensity[i] = (light.intensity ?? 0) * intensityScale;
  }

  gl.uniform1iv(gl.getUniformLocation(program, "uLightEnabled"), enabled);
  gl.uniform3fv(gl.getUniformLocation(program, "uLightDir"), dirs);
  gl.uniform3fv(gl.getUniformLocation(program, "uLightColor"), colors);
  gl.uniform1fv(gl.getUniformLocation(program, "uLightIntensity"), intensity);
}

function setShadowMatrices(gl, program, lightViewProj) {
  gl.uniformMatrix4fv(gl.getUniformLocation(program, "uLightViewProj0"), false, lightViewProj[0]);
  gl.uniformMatrix4fv(gl.getUniformLocation(program, "uLightViewProj1"), false, lightViewProj[1]);
  gl.uniformMatrix4fv(gl.getUniformLocation(program, "uLightViewProj2"), false, lightViewProj[2]);
}

function renderShadowMaps(previewState, renderState, lightDirs, quality) {
  const { gl } = previewState;
  if (!quality.shadows) {
    previewState.lightViewProj[0] = identity4();
    previewState.lightViewProj[1] = identity4();
    previewState.lightViewProj[2] = identity4();
    return;
  }
  gl.useProgram(previewState.shadowProgram);
  gl.bindVertexArray(previewState.vao);
  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, previewState.indexBuffer);

  for (let i = 0; i < 3; i += 1) {
    const light = renderState.lights[i] || { enabled: false };
    if (!light.enabled || previewState.indexCount === 0) {
      previewState.lightViewProj[i] = identity4();
      continue;
    }

    const lightViewProj = buildLightViewProjection(lightDirs[i], previewState.meshBounds);
    previewState.lightViewProj[i] = lightViewProj;

    const shadow = previewState.shadowMaps[i];
    gl.bindFramebuffer(gl.FRAMEBUFFER, shadow.framebuffer);
    gl.viewport(0, 0, SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    gl.enable(gl.DEPTH_TEST);
    gl.depthMask(true);
    gl.disable(gl.BLEND);
    gl.enable(gl.CULL_FACE);
    gl.cullFace(gl.FRONT);
    gl.enable(gl.POLYGON_OFFSET_FILL);
    gl.polygonOffset(1.25, 4.0);
    gl.clear(gl.DEPTH_BUFFER_BIT);

    gl.uniformMatrix4fv(gl.getUniformLocation(previewState.shadowProgram, "uLightViewProj"), false, lightViewProj);
    gl.drawElements(gl.TRIANGLES, previewState.indexCount, gl.UNSIGNED_INT, 0);
  }

  gl.disable(gl.POLYGON_OFFSET_FILL);
  gl.cullFace(gl.BACK);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
}

function renderEnvironmentBackground(previewState, params) {
  const { gl } = previewState;
  const { camera, displayWidth, displayHeight, renderState, envTexture, envSize, hasEnvironment } = params;

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, displayWidth, displayHeight);
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.BLEND);

  gl.useProgram(previewState.backgroundProgram);
  gl.bindVertexArray(previewState.emptyVao);

  gl.uniform3fv(gl.getUniformLocation(previewState.backgroundProgram, "uCamRight"), new Float32Array(camera.right));
  gl.uniform3fv(gl.getUniformLocation(previewState.backgroundProgram, "uCamUp"), new Float32Array(camera.up));
  gl.uniform3fv(gl.getUniformLocation(previewState.backgroundProgram, "uCamForward"), new Float32Array(normalize3(camera.forward)));
  gl.uniform2fv(gl.getUniformLocation(previewState.backgroundProgram, "uResolution"), new Float32Array([displayWidth, displayHeight]));
  gl.uniform1i(gl.getUniformLocation(previewState.backgroundProgram, "uUseEnv"), hasEnvironment ? 1 : 0);
  gl.uniform2fv(gl.getUniformLocation(previewState.backgroundProgram, "uEnvSize"), new Float32Array(envSize || [1, 1]));
  gl.uniform1f(gl.getUniformLocation(previewState.backgroundProgram, "uEnvBgIntensity"), renderState.envBgIntensity);
  gl.uniform1f(gl.getUniformLocation(previewState.backgroundProgram, "uEnvRotationYawRad"), (renderState.envRotationDeg * Math.PI) / 180.0);
  gl.uniform1f(gl.getUniformLocation(previewState.backgroundProgram, "uEnvRotationPitchRad"), (renderState.envRotationVerticalDeg * Math.PI) / 180.0);
  gl.uniform1i(gl.getUniformLocation(previewState.backgroundProgram, "uToneMapMode"), toneMapMode(renderState.toneMap));
  gl.uniform1f(gl.getUniformLocation(previewState.backgroundProgram, "uPreviewGain"), PREVIEW_BRIGHTNESS_GAIN);

  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, envTexture);
  gl.uniform1i(gl.getUniformLocation(previewState.backgroundProgram, "uEnvTex"), 0);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.bindVertexArray(null);
}

function renderPreviewVolume(previewState, params) {
  const { gl } = previewState;
  const {
    camera,
    displayWidth,
    displayHeight,
    clip,
    volumeState
  } = params;
  if (!volumeState?.enabled || !volumeState.texture) {
    return;
  }

  // Narrow draw buffers to COLOR_ATTACHMENT0 only — the volume shader writes
  // to location 0 only, and leaving a second draw buffer active with no
  // matching output causes some drivers (ANGLE/Chrome) to silently drop the draw.
  gl.drawBuffers([gl.COLOR_ATTACHMENT0]);

  gl.useProgram(previewState.volumeProgram);
  gl.bindVertexArray(previewState.emptyVao);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  gl.disable(gl.DEPTH_TEST);

  gl.activeTexture(gl.TEXTURE11);
  gl.bindTexture(gl.TEXTURE_3D, volumeState.texture);
  gl.uniform1i(gl.getUniformLocation(previewState.volumeProgram, "uVolumeTex"), 11);

  gl.uniform3fv(gl.getUniformLocation(previewState.volumeProgram, "uCamOrigin"), new Float32Array(camera.origin));
  gl.uniform3fv(gl.getUniformLocation(previewState.volumeProgram, "uCamRight"), new Float32Array(camera.right));
  gl.uniform3fv(gl.getUniformLocation(previewState.volumeProgram, "uCamUp"), new Float32Array(camera.up));
  gl.uniform3fv(gl.getUniformLocation(previewState.volumeProgram, "uCamForward"), new Float32Array(normalize3(camera.forward)));
  gl.uniform2fv(gl.getUniformLocation(previewState.volumeProgram, "uResolution"), new Float32Array([displayWidth, displayHeight]));

  gl.uniform3fv(gl.getUniformLocation(previewState.volumeProgram, "uVolumeMin"), new Float32Array(volumeState.min));
  gl.uniform3fv(gl.getUniformLocation(previewState.volumeProgram, "uVolumeMax"), new Float32Array(volumeState.max));
  gl.uniform3fv(gl.getUniformLocation(previewState.volumeProgram, "uVolumeInvSize"), new Float32Array(volumeState.invSize));
  gl.uniform1f(gl.getUniformLocation(previewState.volumeProgram, "uVolumeMaxValue"), volumeState.maxValue);
  gl.uniform1f(gl.getUniformLocation(previewState.volumeProgram, "uVolumeThreshold"), volumeState.threshold);
  gl.uniform1f(gl.getUniformLocation(previewState.volumeProgram, "uVolumeValueMax"), volumeState.valueMax);
  gl.uniform1f(gl.getUniformLocation(previewState.volumeProgram, "uVolumeDensity"), volumeState.density);
  gl.uniform1f(
    gl.getUniformLocation(previewState.volumeProgram, "uVolumeOpacity"),
    volumeState.opacity * PREVIEW_VOLUME_OPACITY_SCALE
  );
  gl.uniform1f(gl.getUniformLocation(previewState.volumeProgram, "uVolumeStep"), volumeState.step);
  gl.uniform1i(gl.getUniformLocation(previewState.volumeProgram, "uVolumeMaxSteps"), volumeState.maxSteps);
  gl.uniform1i(gl.getUniformLocation(previewState.volumeProgram, "uTransferPreset"), volumeState.transferPreset);
  gl.uniform1i(gl.getUniformLocation(previewState.volumeProgram, "uToneMapMode"), toneMapMode(volumeState.toneMap));
  gl.uniform1f(gl.getUniformLocation(previewState.volumeProgram, "uPreviewGain"), PREVIEW_BRIGHTNESS_GAIN);
  gl.uniform3fv(gl.getUniformLocation(previewState.volumeProgram, "uPositiveColor"), new Float32Array(volumeState.positiveColor));
  gl.uniform3fv(gl.getUniformLocation(previewState.volumeProgram, "uNegativeColor"), new Float32Array(volumeState.negativeColor));
  gl.uniform1i(gl.getUniformLocation(previewState.volumeProgram, "uTechnique"), volumeState.technique);
  gl.uniform1i(gl.getUniformLocation(previewState.volumeProgram, "uSliceCount"), volumeState.sliceCount);

  gl.uniform1i(gl.getUniformLocation(previewState.volumeProgram, "uClipEnabled"), clip.enabled ? 1 : 0);
  gl.uniform3fv(gl.getUniformLocation(previewState.volumeProgram, "uClipNormal"), new Float32Array(clip.normal));
  gl.uniform1f(gl.getUniformLocation(previewState.volumeProgram, "uClipOffset"), clip.offset);
  gl.uniform1f(gl.getUniformLocation(previewState.volumeProgram, "uClipSide"), clip.side);

  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  gl.bindVertexArray(null);

  // Restore MRT for subsequent passes (transparent geometry writes to both buffers)
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
}

function renderComposite(previewState, params) {
  const { gl } = previewState;
  const { displayWidth, displayHeight, camera, viewProj, quality } = params;
  const sceneTargets = ensureSceneTargets(previewState, displayWidth, displayHeight);

  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, displayWidth, displayHeight);
  gl.disable(gl.CULL_FACE);
  gl.disable(gl.DEPTH_TEST);
  gl.depthMask(false);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

  gl.useProgram(previewState.compositeProgram);
  gl.bindVertexArray(previewState.emptyVao);

  gl.activeTexture(gl.TEXTURE12);
  gl.bindTexture(gl.TEXTURE_2D, sceneTargets.colorTexture);
  gl.uniform1i(gl.getUniformLocation(previewState.compositeProgram, "uSceneColor"), 12);

  gl.activeTexture(gl.TEXTURE13);
  gl.bindTexture(gl.TEXTURE_2D, sceneTargets.normalTexture);
  gl.uniform1i(gl.getUniformLocation(previewState.compositeProgram, "uSceneNormal"), 13);

  gl.activeTexture(gl.TEXTURE14);
  gl.bindTexture(gl.TEXTURE_2D, sceneTargets.depthTexture);
  gl.uniform1i(gl.getUniformLocation(previewState.compositeProgram, "uSceneDepth"), 14);

  gl.uniform2fv(gl.getUniformLocation(previewState.compositeProgram, "uResolution"), new Float32Array([displayWidth, displayHeight]));
  gl.uniform1i(gl.getUniformLocation(previewState.compositeProgram, "uEnableSsr"), quality.ssr ? 1 : 0);
  gl.uniform1f(gl.getUniformLocation(previewState.compositeProgram, "uEdgeAccentStrength"), quality.edgeAccentStrength);
  gl.uniform3fv(gl.getUniformLocation(previewState.compositeProgram, "uCameraPos"), new Float32Array(camera.origin));
  gl.uniformMatrix4fv(gl.getUniformLocation(previewState.compositeProgram, "uInvViewProj"), false, invertMatrix4(viewProj));

  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  gl.bindVertexArray(null);
}

export function renderPreviewFrame(previewState, params) {
  const {
    sceneData,
    camera,
    renderState,
    clip,
    lightDirs,
    displayWidth,
    displayHeight,
    logger,
    cameraFov,
    envTexture,
    envSize,
    hasEnvironment,
    volumeState,
    previewQuality
  } = params;

  if (!sceneData) return;
  if (!previewState || !previewState.program) {
    throw new Error("Preview backend is not initialized.");
  }

  if (previewState.sceneRef !== sceneData) {
    const mesh = triangulateSceneForPreview(sceneData);
    uploadPreviewMesh(previewState, mesh);
    previewState.sceneRef = sceneData;
    logger?.info(`Preview mesh uploaded (${mesh.triangleCount} triangles).`);
  }

  const quality = normalizePreviewQualitySettings(previewQuality);

  renderShadowMaps(previewState, renderState, lightDirs, quality);
  renderEnvironmentBackground(previewState, {
    camera,
    displayWidth,
    displayHeight,
    renderState,
    envTexture,
    envSize,
    hasEnvironment
  });

  const { gl, program, vao } = previewState;
  const aspect = Math.max(1e-6, displayWidth / Math.max(1, displayHeight));
  const viewProj = buildViewProjection(camera, cameraFov, aspect, 0.01, Math.max(1000.0, sceneData.sceneScale * 40.0));

  const sceneTargets = ensureSceneTargets(previewState, displayWidth, displayHeight);
  gl.bindFramebuffer(gl.FRAMEBUFFER, sceneTargets.framebuffer);
  gl.viewport(0, 0, displayWidth, displayHeight);
  gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
  // Background pass disables depth writes; re-enable before clearing depth.
  gl.depthMask(true);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.CULL_FACE);
  gl.cullFace(gl.BACK);

  gl.useProgram(program);
  gl.bindVertexArray(vao);

  gl.uniformMatrix4fv(gl.getUniformLocation(program, "uViewProj"), false, viewProj);
  setShadowMatrices(gl, program, previewState.lightViewProj);

  gl.uniform3fv(gl.getUniformLocation(program, "uCameraPos"), new Float32Array(camera.origin));
  gl.uniform3fv(gl.getUniformLocation(program, "uAmbientColor"), new Float32Array(renderState.ambientColor));
  gl.uniform1f(gl.getUniformLocation(program, "uAmbientIntensity"), renderState.ambientIntensity + 0.04);
  gl.uniform1i(gl.getUniformLocation(program, "uCastShadows"), renderState.castShadows && quality.shadows ? 1 : 0);
  gl.uniform1i(gl.getUniformLocation(program, "uClipEnabled"), clip.enabled ? 1 : 0);
  gl.uniform3fv(gl.getUniformLocation(program, "uClipNormal"), new Float32Array(clip.normal));
  gl.uniform1f(gl.getUniformLocation(program, "uClipOffset"), clip.offset);
  gl.uniform1f(gl.getUniformLocation(program, "uClipSide"), clip.side);
  gl.uniform1i(gl.getUniformLocation(program, "uToneMapMode"), toneMapMode(renderState.toneMap));
  gl.uniform1f(gl.getUniformLocation(program, "uPreviewGain"), PREVIEW_BRIGHTNESS_GAIN);

  setLightUniforms(gl, program, renderState, lightDirs, quality.lightIntensityScale);

  gl.activeTexture(gl.TEXTURE8);
  gl.bindTexture(gl.TEXTURE_2D, previewState.shadowMaps[0].depthTexture);
  gl.uniform1i(gl.getUniformLocation(program, "uShadowTex0"), 8);
  gl.activeTexture(gl.TEXTURE9);
  gl.bindTexture(gl.TEXTURE_2D, previewState.shadowMaps[1].depthTexture);
  gl.uniform1i(gl.getUniformLocation(program, "uShadowTex1"), 9);
  gl.activeTexture(gl.TEXTURE10);
  gl.bindTexture(gl.TEXTURE_2D, previewState.shadowMaps[2].depthTexture);
  gl.uniform1i(gl.getUniformLocation(program, "uShadowTex2"), 10);

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, previewState.opaqueIndexBuffer);
  gl.disable(gl.BLEND);
  gl.depthMask(true);
  if (previewState.opaqueIndexCount > 0) {
    gl.drawElements(gl.TRIANGLES, previewState.opaqueIndexCount, gl.UNSIGNED_INT, 0);
  }

  renderPreviewVolume(previewState, {
    camera,
    displayWidth,
    displayHeight,
    clip,
    volumeState
  });

  gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, previewState.transparentIndexBuffer);
  gl.enable(gl.DEPTH_TEST);
  gl.depthFunc(gl.LEQUAL);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  gl.depthMask(false);
  if (previewState.transparentIndexCount > 0) {
    const sortedTransparent = sortTransparentIndicesByCameraDepth(
      previewState.positionSource,
      previewState.transparentIndicesSource,
      camera.origin
    );
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, sortedTransparent, gl.DYNAMIC_DRAW);
    gl.drawElements(gl.TRIANGLES, previewState.transparentIndexCount, gl.UNSIGNED_INT, 0);
  }

  gl.disable(gl.BLEND);
  gl.depthMask(true);
  gl.bindVertexArray(null);

  renderComposite(previewState, {
    displayWidth,
    displayHeight,
    camera,
    viewProj,
    quality
  });
}
