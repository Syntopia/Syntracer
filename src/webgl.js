export const MAX_BRUTE_FORCE_TRIS = 65536;

const TRACE_VS = `#version 300 es
precision highp float;
const vec2 positions[3] = vec2[3](
  vec2(-1.0, -3.0),
  vec2(3.0, 1.0),
  vec2(-1.0, 1.0)
);
const vec2 uvs[3] = vec2[3](
  vec2(0.0, 2.0),
  vec2(2.0, 0.0),
  vec2(0.0, 0.0)
);
out vec2 vUv;
void main() {
  gl_Position = vec4(positions[gl_VertexID], 0.0, 1.0);
  vUv = uvs[gl_VertexID];
}
`;

const TRACE_FS = `#version 300 es
precision highp float;
precision highp int;

in vec2 vUv;
layout(location = 0) out vec4 outColor;

uniform sampler2D uBvhTex;
uniform sampler2D uTriTex;
uniform sampler2D uTriNormalTex;
uniform sampler2D uTriColorTex;
uniform sampler2D uTriIndexTex;
uniform sampler2D uAccumTex;
uniform sampler2D uEnvTex;
uniform vec3 uCamOrigin;
uniform vec3 uCamRight;
uniform vec3 uCamUp;
uniform vec3 uCamForward;
uniform vec2 uResolution;
uniform vec2 uBvhTexSize;
uniform vec2 uTriTexSize;
uniform vec2 uTriNormalTexSize;
uniform vec2 uTriColorTexSize;
uniform vec2 uTriIndexTexSize;
uniform int uFrameIndex;
uniform int uTriCount;
uniform int uUseBvh;
uniform int uUseGltfColor;
uniform vec3 uBaseColor;
uniform float uMetallic;
uniform float uRoughness;
uniform int uMaxBounces;
uniform float uExposure;
uniform float uAmbientIntensity;
uniform vec3 uAmbientColor;
uniform int uSamplesPerBounce;
uniform int uCastShadows;
uniform float uRayBias;
uniform float uTMin;
uniform float uEnvIntensity;
uniform int uUseEnv;
uniform int uLightEnabled[2];
uniform vec3 uLightDir[2];
uniform vec3 uLightColor[2];
uniform float uLightIntensity[2];

const float PI = 3.14159265359;

ivec2 texCoordFromIndex(int index, ivec2 size) {
  int x = index % size.x;
  int y = index / size.x;
  return ivec2(x, y);
}

vec4 fetchTexel(sampler2D tex, int index, ivec2 size) {
  ivec2 coord = texCoordFromIndex(index, size);
  return texelFetch(tex, coord, 0);
}

vec3 fetchTriNormal(int triIndex, vec3 bary) {
  int base = triIndex * 3;
  vec3 n0 = fetchTexel(uTriNormalTex, base + 0, ivec2(uTriNormalTexSize)).xyz;
  vec3 n1 = fetchTexel(uTriNormalTex, base + 1, ivec2(uTriNormalTexSize)).xyz;
  vec3 n2 = fetchTexel(uTriNormalTex, base + 2, ivec2(uTriNormalTexSize)).xyz;
  vec3 n = n0 * bary.x + n1 * bary.y + n2 * bary.z;
  return normalize(n);
}

vec3 fetchTriColor(int triIndex) {
  return fetchTexel(uTriColorTex, triIndex, ivec2(uTriColorTexSize)).rgb;
}

void fetchTriVerts(int triIndex, out vec3 v0, out vec3 v1, out vec3 v2) {
  int base = triIndex * 3;
  v0 = fetchTexel(uTriTex, base + 0, ivec2(uTriTexSize)).xyz;
  v1 = fetchTexel(uTriTex, base + 1, ivec2(uTriTexSize)).xyz;
  v2 = fetchTexel(uTriTex, base + 2, ivec2(uTriTexSize)).xyz;
}

float maxComponent(vec3 v) {
  return max(v.x, max(v.y, v.z));
}

vec3 sampleEnv(vec3 dir) {
  if (uUseEnv == 0) {
    return vec3(0.0);
  }
  vec3 d = normalize(dir);
  float u = atan(d.z, d.x) / (2.0 * PI) + 0.5;
  float v = acos(clamp(d.y, -1.0, 1.0)) / PI;
  return texture(uEnvTex, vec2(u, v)).rgb * uEnvIntensity;
}

bool intersectAABB(vec3 bmin, vec3 bmax, vec3 origin, vec3 dir, float tMax) {
  float tmin = 0.0;
  float tmax = tMax;

  if (abs(dir.x) < 1e-8) {
    if (origin.x < bmin.x || origin.x > bmax.x) return false;
  } else {
    float inv = 1.0 / dir.x;
    float t1 = (bmin.x - origin.x) * inv;
    float t2 = (bmax.x - origin.x) * inv;
    float tNear = min(t1, t2);
    float tFar = max(t1, t2);
    tmin = max(tmin, tNear);
    tmax = min(tmax, tFar);
    if (tmax < tmin) return false;
  }

  if (abs(dir.y) < 1e-8) {
    if (origin.y < bmin.y || origin.y > bmax.y) return false;
  } else {
    float inv = 1.0 / dir.y;
    float t1 = (bmin.y - origin.y) * inv;
    float t2 = (bmax.y - origin.y) * inv;
    float tNear = min(t1, t2);
    float tFar = max(t1, t2);
    tmin = max(tmin, tNear);
    tmax = min(tmax, tFar);
    if (tmax < tmin) return false;
  }

  if (abs(dir.z) < 1e-8) {
    if (origin.z < bmin.z || origin.z > bmax.z) return false;
  } else {
    float inv = 1.0 / dir.z;
    float t1 = (bmin.z - origin.z) * inv;
    float t2 = (bmax.z - origin.z) * inv;
    float tNear = min(t1, t2);
    float tFar = max(t1, t2);
    tmin = max(tmin, tNear);
    tmax = min(tmax, tFar);
    if (tmax < tmin) return false;
  }

  return tmax >= max(tmin, 0.0);
}

vec4 intersectTri(vec3 origin, vec3 dir, vec3 v0, vec3 v1, vec3 v2) {
  vec3 e1 = v1 - v0;
  vec3 e2 = v2 - v0;
  vec3 p = cross(dir, e2);
  float det = dot(e1, p);
  if (abs(det) < 1e-6) {
    return vec4(-1.0);
  }
  float invDet = 1.0 / det;
  vec3 tvec = origin - v0;
  float u = dot(tvec, p) * invDet;
  vec3 q = cross(tvec, e1);
  float v = dot(dir, q) * invDet;
  if (u < 0.0 || v < 0.0 || u + v > 1.0) {
    return vec4(-1.0);
  }
  float t = dot(e2, q) * invDet;
  if (t <= uTMin) {
    return vec4(-1.0);
  }
  return vec4(t, u, v, 1.0);
}

bool traceClosest(vec3 origin, vec3 dir, out float outT, out int outTri, out vec3 outBary) {
  float closest = 1e20;
  int hitTri = -1;
  vec3 hitBary = vec3(0.0);

  if (uUseBvh == 0) {
    for (int i = 0; i < ${MAX_BRUTE_FORCE_TRIS}; i += 1) {
      if (i >= uTriCount) {
        break;
      }
      int triBase = i * 3;
      vec3 v0 = fetchTexel(uTriTex, triBase + 0, ivec2(uTriTexSize)).xyz;
      vec3 v1 = fetchTexel(uTriTex, triBase + 1, ivec2(uTriTexSize)).xyz;
      vec3 v2 = fetchTexel(uTriTex, triBase + 2, ivec2(uTriTexSize)).xyz;
      vec4 hit = intersectTri(origin, dir, v0, v1, v2);
      if (hit.x > 0.0 && hit.x < closest) {
        closest = hit.x;
        hitTri = i;
        float u = hit.y;
        float v = hit.z;
        hitBary = vec3(1.0 - u - v, u, v);
      }
    }
  } else {
    int stack[128];
    int stackPtr = 0;
    stack[stackPtr] = 0;
    stackPtr += 1;

    for (int step = 0; step < 1024; step += 1) {
      if (stackPtr == 0) {
        break;
      }
      stackPtr -= 1;
      int nodeIndex = stack[stackPtr];
      int baseIndex = nodeIndex * 3;

      vec4 t0 = fetchTexel(uBvhTex, baseIndex + 0, ivec2(uBvhTexSize));
      vec4 t1 = fetchTexel(uBvhTex, baseIndex + 1, ivec2(uBvhTexSize));
      vec4 t2 = fetchTexel(uBvhTex, baseIndex + 2, ivec2(uBvhTexSize));

      vec3 bmin = t0.xyz;
      float leftFirst = t0.w;
      vec3 bmax = t1.xyz;
      float primCount = t1.w;
      float rightChild = t2.x;

      if (!intersectAABB(bmin, bmax, origin, dir, closest)) {
        continue;
      }

      if (primCount > 0.5) {
        int first = int(leftFirst + 0.5);
        int count = int(primCount + 0.5);
        for (int i = 0; i < 64; i += 1) {
          if (i >= count) {
            break;
          }
          int triListIndex = first + i;
          int triIndex = int(fetchTexel(uTriIndexTex, triListIndex, ivec2(uTriIndexTexSize)).x + 0.5);
          int triBase = triIndex * 3;
          vec3 v0 = fetchTexel(uTriTex, triBase + 0, ivec2(uTriTexSize)).xyz;
          vec3 v1 = fetchTexel(uTriTex, triBase + 1, ivec2(uTriTexSize)).xyz;
          vec3 v2 = fetchTexel(uTriTex, triBase + 2, ivec2(uTriTexSize)).xyz;
          vec4 hit = intersectTri(origin, dir, v0, v1, v2);
          if (hit.x > 0.0 && hit.x < closest) {
            closest = hit.x;
            hitTri = triIndex;
            float u = hit.y;
            float v = hit.z;
            hitBary = vec3(1.0 - u - v, u, v);
          }
        }
      } else {
        int left = int(leftFirst + 0.5);
        int right = int(rightChild + 0.5);
        if (stackPtr < 127) {
          stack[stackPtr] = right;
          stackPtr += 1;
        }
        if (stackPtr < 127) {
          stack[stackPtr] = left;
          stackPtr += 1;
        }
      }
    }
  }

  outT = closest;
  outTri = hitTri;
  outBary = hitBary;
  return hitTri >= 0;
}

bool traceAny(vec3 origin, vec3 dir, float tMax) {
  if (uUseBvh == 0) {
    for (int i = 0; i < ${MAX_BRUTE_FORCE_TRIS}; i += 1) {
      if (i >= uTriCount) {
        break;
      }
      int triBase = i * 3;
      vec3 v0 = fetchTexel(uTriTex, triBase + 0, ivec2(uTriTexSize)).xyz;
      vec3 v1 = fetchTexel(uTriTex, triBase + 1, ivec2(uTriTexSize)).xyz;
      vec3 v2 = fetchTexel(uTriTex, triBase + 2, ivec2(uTriTexSize)).xyz;
      vec4 hit = intersectTri(origin, dir, v0, v1, v2);
      if (hit.x > 0.0 && hit.x < tMax) {
        return true;
      }
    }
    return false;
  }

  int stack[128];
  int stackPtr = 0;
  stack[stackPtr] = 0;
  stackPtr += 1;

  for (int step = 0; step < 1024; step += 1) {
    if (stackPtr == 0) {
      break;
    }
    stackPtr -= 1;
    int nodeIndex = stack[stackPtr];
    int baseIndex = nodeIndex * 3;

    vec4 t0 = fetchTexel(uBvhTex, baseIndex + 0, ivec2(uBvhTexSize));
    vec4 t1 = fetchTexel(uBvhTex, baseIndex + 1, ivec2(uBvhTexSize));
    vec4 t2 = fetchTexel(uBvhTex, baseIndex + 2, ivec2(uBvhTexSize));

    vec3 bmin = t0.xyz;
    float leftFirst = t0.w;
    vec3 bmax = t1.xyz;
    float primCount = t1.w;
    float rightChild = t2.x;

    if (!intersectAABB(bmin, bmax, origin, dir, tMax)) {
      continue;
    }

    if (primCount > 0.5) {
      int first = int(leftFirst + 0.5);
      int count = int(primCount + 0.5);
      for (int i = 0; i < 64; i += 1) {
        if (i >= count) {
          break;
        }
        int triListIndex = first + i;
        int triIndex = int(fetchTexel(uTriIndexTex, triListIndex, ivec2(uTriIndexTexSize)).x + 0.5);
        int triBase = triIndex * 3;
        vec3 v0 = fetchTexel(uTriTex, triBase + 0, ivec2(uTriTexSize)).xyz;
        vec3 v1 = fetchTexel(uTriTex, triBase + 1, ivec2(uTriTexSize)).xyz;
        vec3 v2 = fetchTexel(uTriTex, triBase + 2, ivec2(uTriTexSize)).xyz;
        vec4 hit = intersectTri(origin, dir, v0, v1, v2);
        if (hit.x > 0.0 && hit.x < tMax) {
          return true;
        }
      }
    } else {
      int left = int(leftFirst + 0.5);
      int right = int(rightChild + 0.5);
      if (stackPtr < 127) {
        stack[stackPtr] = right;
        stackPtr += 1;
      }
      if (stackPtr < 127) {
        stack[stackPtr] = left;
        stackPtr += 1;
      }
    }
  }
  return false;
}

bool traceAnyMin(vec3 origin, vec3 dir, float tMax, float tMin) {
  if (uUseBvh == 0) {
    for (int i = 0; i < ${MAX_BRUTE_FORCE_TRIS}; i += 1) {
      if (i >= uTriCount) {
        break;
      }
      int triBase = i * 3;
      vec3 v0 = fetchTexel(uTriTex, triBase + 0, ivec2(uTriTexSize)).xyz;
      vec3 v1 = fetchTexel(uTriTex, triBase + 1, ivec2(uTriTexSize)).xyz;
      vec3 v2 = fetchTexel(uTriTex, triBase + 2, ivec2(uTriTexSize)).xyz;
      vec4 hit = intersectTri(origin, dir, v0, v1, v2);
      if (hit.x > tMin && hit.x < tMax) {
        return true;
      }
    }
    return false;
  }

  int stack[128];
  int stackPtr = 0;
  stack[stackPtr] = 0;
  stackPtr += 1;

  for (int step = 0; step < 1024; step += 1) {
    if (stackPtr == 0) {
      break;
    }
    stackPtr -= 1;
    int nodeIndex = stack[stackPtr];
    int baseIndex = nodeIndex * 3;

    vec4 t0 = fetchTexel(uBvhTex, baseIndex + 0, ivec2(uBvhTexSize));
    vec4 t1 = fetchTexel(uBvhTex, baseIndex + 1, ivec2(uBvhTexSize));
    vec4 t2 = fetchTexel(uBvhTex, baseIndex + 2, ivec2(uBvhTexSize));

    vec3 bmin = t0.xyz;
    float leftFirst = t0.w;
    vec3 bmax = t1.xyz;
    float primCount = t1.w;
    float rightChild = t2.x;

    if (!intersectAABB(bmin, bmax, origin, dir, tMax)) {
      continue;
    }

    if (primCount > 0.5) {
      int first = int(leftFirst + 0.5);
      int count = int(primCount + 0.5);
      for (int i = 0; i < 64; i += 1) {
        if (i >= count) {
          break;
        }
        int triListIndex = first + i;
        int triIndex = int(fetchTexel(uTriIndexTex, triListIndex, ivec2(uTriIndexTexSize)).x + 0.5);
        int triBase = triIndex * 3;
        vec3 v0 = fetchTexel(uTriTex, triBase + 0, ivec2(uTriTexSize)).xyz;
        vec3 v1 = fetchTexel(uTriTex, triBase + 1, ivec2(uTriTexSize)).xyz;
        vec3 v2 = fetchTexel(uTriTex, triBase + 2, ivec2(uTriTexSize)).xyz;
        vec4 hit = intersectTri(origin, dir, v0, v1, v2);
        if (hit.x > tMin && hit.x < tMax) {
          return true;
        }
      }
    } else {
      int left = int(leftFirst + 0.5);
      int right = int(rightChild + 0.5);
      if (stackPtr < 127) {
        stack[stackPtr] = right;
        stackPtr += 1;
      }
      if (stackPtr < 127) {
        stack[stackPtr] = left;
        stackPtr += 1;
      }
    }
  }
  return false;
}

uint initSeed() {
  uint sx = uint(gl_FragCoord.x);
  uint sy = uint(gl_FragCoord.y);
  return sx * 1973u + sy * 9277u + uint(uFrameIndex) * 26699u + 1u;
}

float rand(inout uint state) {
  state = state * 1664525u + 1013904223u;
  return float(state & 0x00FFFFFFu) / float(0x01000000u);
}

vec3 cosineSampleHemisphere(vec3 n, inout uint state) {
  float r1 = rand(state);
  float r2 = rand(state);
  float phi = 2.0 * PI * r1;
  float cosTheta = sqrt(1.0 - r2);
  float sinTheta = sqrt(r2);
  vec3 local = vec3(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
  vec3 up = abs(n.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 tangent = normalize(cross(up, n));
  vec3 bitangent = cross(n, tangent);
  return normalize(tangent * local.x + bitangent * local.y + n * local.z);
}

vec3 reflectSample(vec3 dir, vec3 n, float roughness, inout uint state) {
  vec3 r = reflect(dir, n);
  if (roughness <= 0.02) {
    return normalize(r);
  }
  float r1 = rand(state);
  float r2 = rand(state);
  float phi = 2.0 * PI * r1;
  float cosTheta = pow(1.0 - r2, 1.0 / (roughness * 4.0 + 1.0));
  float sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
  vec3 local = vec3(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
  vec3 up = abs(r.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 tangent = normalize(cross(up, r));
  vec3 bitangent = cross(r, tangent);
  return normalize(tangent * local.x + bitangent * local.y + r * local.z);
}

vec3 sampleGGXHalfVector(vec3 n, float roughness, inout uint state) {
  float a = roughness * roughness;
  float a2 = a * a;
  float r1 = rand(state);
  float r2 = rand(state);
  float phi = 2.0 * PI * r1;
  float cosTheta = sqrt((1.0 - r2) / (1.0 + (a2 - 1.0) * r2));
  float sinTheta = sqrt(max(0.0, 1.0 - cosTheta * cosTheta));
  vec3 local = vec3(cos(phi) * sinTheta, sin(phi) * sinTheta, cosTheta);
  vec3 up = abs(n.z) < 0.999 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 tangent = normalize(cross(up, n));
  vec3 bitangent = cross(n, tangent);
  return normalize(tangent * local.x + bitangent * local.y + n * local.z);
}

vec3 fresnelSchlick(float cosTheta, vec3 F0) {
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

float distributionGGX(float NdotH, float roughness) {
  float a = roughness * roughness;
  float a2 = a * a;
  float denom = (NdotH * NdotH) * (a2 - 1.0) + 1.0;
  return a2 / (PI * denom * denom + 1e-6);
}

float geometrySchlickGGX(float NdotV, float roughness) {
  float r = roughness + 1.0;
  float k = (r * r) / 8.0;
  return NdotV / (NdotV * (1.0 - k) + k);
}

float geometrySmith(float NdotV, float NdotL, float roughness) {
  float ggx1 = geometrySchlickGGX(NdotV, roughness);
  float ggx2 = geometrySchlickGGX(NdotL, roughness);
  return ggx1 * ggx2;
}

vec3 shadeDirect(vec3 hitPos, vec3 shadingNormal, vec3 geomNormal, vec3 baseColor, vec3 V) {
  vec3 direct = vec3(0.0);
  float bias = max(uRayBias, 1e-4);
  for (int i = 0; i < 2; i += 1) {
    if (uLightEnabled[i] == 0) {
      continue;
    }
    vec3 lightDir = normalize(-uLightDir[i]);
    float NdotL = max(dot(shadingNormal, lightDir), 0.0);
    if (NdotL <= 0.0) {
      continue;
    }
    float visibility = 1.0;
    if (uCastShadows == 1) {
      float tmin = max(bias, uTMin);
      visibility = traceAnyMin(hitPos + geomNormal * bias, lightDir, 1e20, tmin) ? 0.0 : 1.0;
    }
    vec3 radiance = uLightColor[i] * uLightIntensity[i] * visibility;

    vec3 H = normalize(V + lightDir);
    float NdotV = max(dot(shadingNormal, V), 0.0);
    float NdotH = max(dot(shadingNormal, H), 0.0);
    float VdotH = max(dot(V, H), 0.0);
    float rough = clamp(uRoughness, 0.04, 1.0);
    vec3 F0 = mix(vec3(0.04), baseColor, uMetallic);
    vec3 F = fresnelSchlick(VdotH, F0);
    float D = distributionGGX(NdotH, rough);
    float G = geometrySmith(NdotV, NdotL, rough);
    vec3 spec = (D * G) * F / max(4.0 * NdotV * NdotL, 1e-4);

    vec3 kd = (vec3(1.0) - F) * (1.0 - uMetallic);
    vec3 diffuse = kd * baseColor / PI;
    direct += (diffuse + spec) * radiance * NdotL;
  }
  return direct;
}

vec3 tracePath(vec3 origin, vec3 dir, inout uint seed) {
  vec3 radiance = vec3(0.0);
  vec3 throughput = vec3(1.0);
  float bias = max(uRayBias, 1e-4);
  for (int bounce = 0; bounce < 8; bounce += 1) {
    if (bounce >= uMaxBounces) {
      break;
    }
    float t;
    int tri;
    vec3 bary;
    bool hit = traceClosest(origin, dir, t, tri, bary);
    if (!hit) {
      radiance += throughput * (uAmbientColor * uAmbientIntensity + sampleEnv(dir));
      break;
    }

    vec3 v0;
    vec3 v1;
    vec3 v2;
    fetchTriVerts(tri, v0, v1, v2);
    vec3 geomNormal = normalize(cross(v1 - v0, v2 - v0));
    if (dot(geomNormal, dir) > 0.0) {
      geomNormal = -geomNormal;
    }

    vec3 shadingNormal = fetchTriNormal(tri, bary);
    if (dot(shadingNormal, geomNormal) < 0.0) {
      shadingNormal = -shadingNormal;
    }

    vec3 hitPos = origin + dir * t;
    vec3 baseColor = mix(uBaseColor, fetchTriColor(tri), float(uUseGltfColor));
    vec3 V = normalize(-dir);

    vec3 direct = shadeDirect(hitPos, shadingNormal, geomNormal, baseColor, V);
    radiance += throughput * direct;

    vec3 F0 = mix(vec3(0.04), baseColor, uMetallic);
    float specWeight = maxComponent(F0);
    float diffWeight = (1.0 - uMetallic) * maxComponent(baseColor);
    float sum = specWeight + diffWeight;
    float specProb = sum > 0.0 ? specWeight / sum : 1.0;
    specProb = clamp(specProb, 0.0, 1.0);

    float r = rand(seed);
    vec3 newDir;
    float NdotL;
    if (r < specProb) {
      vec3 H = sampleGGXHalfVector(shadingNormal, uRoughness, seed);
      newDir = normalize(reflect(-V, H));
      NdotL = max(dot(shadingNormal, newDir), 0.0);
      if (NdotL <= 0.0) {
        break;
      }
      float NdotV = max(dot(shadingNormal, V), 0.0);
      float NdotH = max(dot(shadingNormal, H), 0.0);
      float VdotH = max(dot(V, H), 0.0);
      float D = distributionGGX(NdotH, uRoughness);
      float G = geometrySmith(NdotV, NdotL, uRoughness);
      vec3 F = fresnelSchlick(VdotH, F0);
      vec3 spec = (D * G) * F / max(4.0 * NdotV * NdotL, 1e-4);
      float pdf = D * NdotH / max(4.0 * VdotH, 1e-4);
      float denom = max(pdf * max(specProb, 1e-4), 1e-4);
      throughput *= spec * NdotL / denom;
    } else {
      newDir = cosineSampleHemisphere(shadingNormal, seed);
      NdotL = max(dot(shadingNormal, newDir), 0.0);
      vec3 diffuseColor = baseColor * (1.0 - uMetallic);
      vec3 diff = diffuseColor / PI;
      float pdf = NdotL / PI;
      float denom = max(pdf * max(1.0 - specProb, 1e-4), 1e-4);
      throughput *= diff * NdotL / denom;
    }

    origin = hitPos + geomNormal * bias;
    dir = newDir;

    if (bounce > 2) {
      float p = clamp(maxComponent(throughput), 0.05, 0.95);
      if (rand(seed) > p) {
        break;
      }
      throughput /= p;
    }
  }
  return radiance;
}

void main() {
  int spp = clamp(uSamplesPerBounce, 1, 8);
  vec3 sum = vec3(0.0);
  for (int s = 0; s < 8; s += 1) {
    if (s >= spp) {
      break;
    }
    uint seed = initSeed() + uint(s) * 747796405u;
    vec2 jitter = vec2(rand(seed), rand(seed)) - vec2(0.5);
    vec2 pixel = gl_FragCoord.xy + jitter;
    vec2 uv = (pixel + vec2(0.5)) / uResolution * 2.0 - 1.0;
    vec3 dir = normalize(uCamForward + uv.x * uCamRight + uv.y * uCamUp);
    sum += tracePath(uCamOrigin, dir, seed);
  }
  vec3 color = sum / float(spp);
  color *= uExposure;

  vec4 prev = texelFetch(uAccumTex, ivec2(gl_FragCoord.xy), 0);
  if (uFrameIndex == 0) {
    outColor = vec4(color, 1.0);
  } else {
    float fi = float(uFrameIndex);
    vec3 accum = (prev.rgb * fi + color) / (fi + 1.0);
    outColor = vec4(accum, 1.0);
  }
}
`;

const DISPLAY_VS = TRACE_VS;

const DISPLAY_FS = `#version 300 es
precision highp float;

in vec2 vUv;
layout(location = 0) out vec4 outColor;

uniform sampler2D uDisplayTex;
uniform vec2 uDisplayResolution;

void main() {
  vec2 uv = gl_FragCoord.xy / uDisplayResolution;
  vec3 color = texture(uDisplayTex, uv).rgb;
  vec3 mapped = color / (vec3(1.0) + color);
  outColor = vec4(mapped, 1.0);
}
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const info = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(info || "Shader compilation failed");
  }
  return shader;
}

function createProgram(gl, vsSource, fsSource) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fsSource);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    const info = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(info || "Program link failed");
  }
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  return program;
}

function createFloatTexture(gl, width, height, data = null) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, data);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

export function createEnvTexture(gl, width, height, data = null) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, width, height, 0, gl.RGBA, gl.FLOAT, data);
  gl.bindTexture(gl.TEXTURE_2D, null);
  return tex;
}

function createFramebuffer(gl, tex) {
  const fb = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  if (status !== gl.FRAMEBUFFER_COMPLETE) {
    throw new Error(`Framebuffer incomplete: ${status}`);
  }
  return fb;
}

export function initWebGL(canvas, logger) {
  const gl = canvas.getContext("webgl2");
  if (!gl) {
    throw new Error("WebGL2 is not available in this browser.");
  }
  const ext = gl.getExtension("EXT_color_buffer_float");
  if (!ext) {
    throw new Error("EXT_color_buffer_float is required for float accumulation.");
  }
  const floatLinear = gl.getExtension("OES_texture_float_linear");
  if (!floatLinear) {
    throw new Error("OES_texture_float_linear is required for environment lighting.");
  }
  logger.info("WebGL2 context created");

  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);

  const traceProgram = createProgram(gl, TRACE_VS, TRACE_FS);
  const displayProgram = createProgram(gl, DISPLAY_VS, DISPLAY_FS);

  return { gl, traceProgram, displayProgram, vao };
}

export function createDataTexture(gl, width, height, data) {
  return createFloatTexture(gl, width, height, data);
}

export function createAccumTargets(gl, width, height) {
  const texA = createFloatTexture(gl, width, height, null);
  const texB = createFloatTexture(gl, width, height, null);
  const fbA = createFramebuffer(gl, texA);
  const fbB = createFramebuffer(gl, texB);
  return {
    textures: [texA, texB],
    framebuffers: [fbA, fbB],
    width,
    height
  };
}

export function resizeAccumTargets(gl, targets, width, height) {
  if (targets.width === width && targets.height === height) {
    return targets;
  }
  targets.textures.forEach((tex) => gl.deleteTexture(tex));
  targets.framebuffers.forEach((fb) => gl.deleteFramebuffer(fb));
  return createAccumTargets(gl, width, height);
}

export function createTextureUnit(gl, texture, unit) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
}

export function setTraceUniforms(gl, program, uniforms) {
  gl.useProgram(program);
  gl.uniform1i(gl.getUniformLocation(program, "uBvhTex"), uniforms.bvhUnit);
  gl.uniform1i(gl.getUniformLocation(program, "uTriTex"), uniforms.triUnit);
  gl.uniform1i(gl.getUniformLocation(program, "uTriNormalTex"), uniforms.triNormalUnit);
  gl.uniform1i(gl.getUniformLocation(program, "uTriColorTex"), uniforms.triColorUnit);
  gl.uniform1i(gl.getUniformLocation(program, "uTriIndexTex"), uniforms.triIndexUnit);
  gl.uniform1i(gl.getUniformLocation(program, "uAccumTex"), uniforms.accumUnit);
  gl.uniform1i(gl.getUniformLocation(program, "uEnvTex"), uniforms.envUnit);
  gl.uniform3fv(gl.getUniformLocation(program, "uCamOrigin"), uniforms.camOrigin);
  gl.uniform3fv(gl.getUniformLocation(program, "uCamRight"), uniforms.camRight);
  gl.uniform3fv(gl.getUniformLocation(program, "uCamUp"), uniforms.camUp);
  gl.uniform3fv(gl.getUniformLocation(program, "uCamForward"), uniforms.camForward);
  gl.uniform2fv(gl.getUniformLocation(program, "uResolution"), uniforms.resolution);
  gl.uniform2fv(gl.getUniformLocation(program, "uBvhTexSize"), uniforms.bvhTexSize);
  gl.uniform2fv(gl.getUniformLocation(program, "uTriTexSize"), uniforms.triTexSize);
  gl.uniform2fv(gl.getUniformLocation(program, "uTriNormalTexSize"), uniforms.triNormalTexSize);
  gl.uniform2fv(gl.getUniformLocation(program, "uTriColorTexSize"), uniforms.triColorTexSize);
  gl.uniform2fv(gl.getUniformLocation(program, "uTriIndexTexSize"), uniforms.triIndexTexSize);
  gl.uniform1i(gl.getUniformLocation(program, "uFrameIndex"), uniforms.frameIndex);
  gl.uniform1i(gl.getUniformLocation(program, "uTriCount"), uniforms.triCount);
  gl.uniform1i(gl.getUniformLocation(program, "uUseBvh"), uniforms.useBvh);
  gl.uniform1i(gl.getUniformLocation(program, "uUseGltfColor"), uniforms.useGltfColor);
  gl.uniform3fv(gl.getUniformLocation(program, "uBaseColor"), uniforms.baseColor);
  gl.uniform1f(gl.getUniformLocation(program, "uMetallic"), uniforms.metallic);
  gl.uniform1f(gl.getUniformLocation(program, "uRoughness"), uniforms.roughness);
  gl.uniform1i(gl.getUniformLocation(program, "uMaxBounces"), uniforms.maxBounces);
  gl.uniform1f(gl.getUniformLocation(program, "uExposure"), uniforms.exposure);
  gl.uniform1f(gl.getUniformLocation(program, "uAmbientIntensity"), uniforms.ambientIntensity);
  gl.uniform3fv(gl.getUniformLocation(program, "uAmbientColor"), uniforms.ambientColor);
  gl.uniform1i(gl.getUniformLocation(program, "uSamplesPerBounce"), uniforms.samplesPerBounce);
  gl.uniform1i(gl.getUniformLocation(program, "uCastShadows"), uniforms.castShadows);
  gl.uniform1f(gl.getUniformLocation(program, "uRayBias"), uniforms.rayBias);
  gl.uniform1f(gl.getUniformLocation(program, "uTMin"), uniforms.tMin);
  gl.uniform1f(gl.getUniformLocation(program, "uEnvIntensity"), uniforms.envIntensity);
  gl.uniform1i(gl.getUniformLocation(program, "uUseEnv"), uniforms.useEnv);

  const lightEnabled = new Int32Array(2);
  const lightDir = new Float32Array(6);
  const lightColor = new Float32Array(6);
  const lightIntensity = new Float32Array(2);
  for (let i = 0; i < 2; i += 1) {
    const light = uniforms.lights[i];
    const dir = uniforms.lightDirs[i];
    lightEnabled[i] = light.enabled ? 1 : 0;
    lightDir[i * 3] = dir[0];
    lightDir[i * 3 + 1] = dir[1];
    lightDir[i * 3 + 2] = dir[2];
    lightColor[i * 3] = light.color[0];
    lightColor[i * 3 + 1] = light.color[1];
    lightColor[i * 3 + 2] = light.color[2];
    lightIntensity[i] = light.intensity;
  }
  gl.uniform1iv(gl.getUniformLocation(program, "uLightEnabled"), lightEnabled);
  gl.uniform3fv(gl.getUniformLocation(program, "uLightDir"), lightDir);
  gl.uniform3fv(gl.getUniformLocation(program, "uLightColor"), lightColor);
  gl.uniform1fv(gl.getUniformLocation(program, "uLightIntensity"), lightIntensity);
}

export function setDisplayUniforms(gl, program, uniforms) {
  gl.useProgram(program);
  gl.uniform1i(gl.getUniformLocation(program, "uDisplayTex"), uniforms.displayUnit);
  gl.uniform2fv(gl.getUniformLocation(program, "uDisplayResolution"), uniforms.displayResolution);
}

export function drawFullscreen(gl) {
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}
