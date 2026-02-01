function decodeDataUri(uri) {
  if (!uri.startsWith("data:")) {
    throw new Error("Only data: URIs are supported for buffers.");
  }
  const match = uri.match(/^data:.*?;base64,(.*)$/);
  if (!match) {
    throw new Error("Only base64-encoded data URIs are supported.");
  }
  const binary = atob(match[1]);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function mapObjectToArray(obj, label) {
  if (Array.isArray(obj)) {
    return { array: obj, map: null };
  }
  if (!obj || typeof obj !== "object") {
    throw new Error(`${label} must be an array or object.`);
  }
  const keys = Object.keys(obj);
  const array = keys.map((key) => obj[key]);
  const map = new Map();
  keys.forEach((key, index) => {
    map.set(key, index);
  });
  return { array, map };
}

function resolveIndex(value, map, label) {
  if (value === undefined || value === null) return value;
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    if (!map || !map.has(value)) {
      throw new Error(`Unknown ${label} reference: ${value}`);
    }
    return map.get(value);
  }
  throw new Error(`Invalid ${label} reference type.`);
}

function normalizeGltf(raw) {
  const { array: buffers, map: bufferMap } = mapObjectToArray(raw.buffers, "buffers");
  const { array: bufferViews, map: bufferViewMap } = mapObjectToArray(raw.bufferViews, "bufferViews");
  const { array: accessors, map: accessorMap } = mapObjectToArray(raw.accessors, "accessors");
  const { array: meshes, map: meshMap } = mapObjectToArray(raw.meshes, "meshes");
  const { array: materials, map: materialMap } = mapObjectToArray(raw.materials || [], "materials");
  const { array: nodes, map: nodeMap } = mapObjectToArray(raw.nodes, "nodes");
  const { array: scenes, map: sceneMap } = mapObjectToArray(raw.scenes, "scenes");

  accessors.forEach((accessor) => {
    accessor.bufferView = resolveIndex(accessor.bufferView, bufferViewMap, "bufferView");
  });

  bufferViews.forEach((view) => {
    view.buffer = resolveIndex(view.buffer, bufferMap, "buffer");
  });

  meshes.forEach((mesh) => {
    mesh.primitives.forEach((primitive) => {
      Object.keys(primitive.attributes).forEach((key) => {
        primitive.attributes[key] = resolveIndex(
          primitive.attributes[key],
          accessorMap,
          `accessor (${key})`
        );
      });
      if (primitive.indices !== undefined) {
        primitive.indices = resolveIndex(primitive.indices, accessorMap, "indices accessor");
      }
      if (primitive.material !== undefined) {
        primitive.material = resolveIndex(primitive.material, materialMap, "material");
      }
    });
  });

  nodes.forEach((node) => {
    if (node.mesh !== undefined) {
      node.mesh = resolveIndex(node.mesh, meshMap, "mesh");
    }
    if (node.meshes) {
      node.meshes = node.meshes.map((mesh) => resolveIndex(mesh, meshMap, "mesh"));
    }
    if (node.children) {
      node.children = node.children.map((child) => resolveIndex(child, nodeMap, "node"));
    }
  });

  scenes.forEach((scene) => {
    if (scene.nodes) {
      scene.nodes = scene.nodes.map((node) => resolveIndex(node, nodeMap, "node"));
    }
  });

  const sceneIndex = resolveIndex(raw.scene ?? 0, sceneMap, "scene") ?? 0;

  return {
    buffers,
    bufferViews,
    accessors,
    materials,
    meshes,
    nodes,
    scenes,
    scene: sceneIndex
  };
}

async function loadBuffers(gltf, baseUrl, fetchFn) {
  const buffers = [];
  for (const buffer of gltf.buffers) {
    if (!buffer.uri) {
      throw new Error("Buffer missing uri.");
    }
    if (buffer.uri.startsWith("data:")) {
      buffers.push(decodeDataUri(buffer.uri));
    } else {
      if (!baseUrl) {
        throw new Error("External buffer URI requires a base URL.");
      }
      const url = new URL(buffer.uri, baseUrl).toString();
      const res = await fetchFn(url);
      if (!res.ok) {
        throw new Error(`Failed to fetch buffer: ${url}`);
      }
      buffers.push(await res.arrayBuffer());
    }
  }
  return buffers;
}

function getAccessorData(gltf, accessorIndex, buffers) {
  const accessor = gltf.accessors[accessorIndex];
  const view = gltf.bufferViews[accessor.bufferView];
  const buffer = buffers[view.buffer];
  const byteOffset = (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const count = accessor.count;
  const componentType = accessor.componentType;
  const type = accessor.type;

  if (type === "VEC3" && componentType !== 5126) {
    throw new Error("POSITION accessors must be Float32 (componentType 5126).");
  }

  let components = 1;
  if (type === "SCALAR") components = 1;
  if (type === "VEC2") components = 2;
  if (type === "VEC3") components = 3;
  if (type === "VEC4") components = 4;

  const componentSize = componentType === 5126 || componentType === 5125 ? 4 : 2;
  const stride = view.byteStride && view.byteStride > 0 ? view.byteStride : components * componentSize;

  const slice = buffer.slice(byteOffset, byteOffset + view.byteLength);
  return { accessor, slice, components, byteStride: stride, count, componentType };
}

function readComponent(view, componentType, byteOffset) {
  if (componentType === 5126) return view.getFloat32(byteOffset, true);
  if (componentType === 5125) return view.getUint32(byteOffset, true);
  if (componentType === 5123) return view.getUint16(byteOffset, true);
  if (componentType === 5122) return view.getInt16(byteOffset, true);
  if (componentType === 5121) return view.getUint8(byteOffset);
  if (componentType === 5120) return view.getInt8(byteOffset);
  throw new Error(`Unsupported accessor componentType: ${componentType}`);
}

function componentByteSize(componentType) {
  if (componentType === 5126) return 4;
  if (componentType === 5125) return 4;
  if (componentType === 5123) return 2;
  if (componentType === 5122) return 2;
  if (componentType === 5121) return 1;
  if (componentType === 5120) return 1;
  throw new Error(`Unsupported accessor componentType: ${componentType}`);
}

function normalizeComponent(value, componentType) {
  if (componentType === 5126) return value;
  if (componentType === 5125) return value;
  if (componentType === 5123) return value / 65535;
  if (componentType === 5122) return Math.max(-1, value / 32767);
  if (componentType === 5121) return value / 255;
  if (componentType === 5120) return Math.max(-1, value / 127);
  return value;
}

function readAccessorToArray(gltf, accessorIndex, buffers) {
  const { slice, components, byteStride, count, componentType } = getAccessorData(
    gltf,
    accessorIndex,
    buffers
  );

  if (componentType === 5126) {
    const out = new Float32Array(count * components);
    const view = new DataView(slice);
    for (let i = 0; i < count; i += 1) {
      for (let c = 0; c < components; c += 1) {
        out[i * components + c] = view.getFloat32(i * byteStride + c * 4, true);
      }
    }
    return out;
  }

  if (componentType === 5123) {
    const out = new Uint16Array(count * components);
    const view = new DataView(slice);
    for (let i = 0; i < count; i += 1) {
      for (let c = 0; c < components; c += 1) {
        out[i * components + c] = view.getUint16(i * byteStride + c * 2, true);
      }
    }
    return out;
  }

  if (componentType === 5125) {
    const out = new Uint32Array(count * components);
    const view = new DataView(slice);
    for (let i = 0; i < count; i += 1) {
      for (let c = 0; c < components; c += 1) {
        out[i * components + c] = view.getUint32(i * byteStride + c * 4, true);
      }
    }
    return out;
  }

  throw new Error(`Unsupported accessor componentType: ${componentType}`);
}

function readAccessorToFloatArray(gltf, accessorIndex, buffers) {
  const { accessor, slice, components, byteStride, count, componentType } = getAccessorData(
    gltf,
    accessorIndex,
    buffers
  );
  const out = new Float32Array(count * components);
  const view = new DataView(slice);
  const componentSize = componentByteSize(componentType);
  for (let i = 0; i < count; i += 1) {
    for (let c = 0; c < components; c += 1) {
      const value = readComponent(view, componentType, i * byteStride + c * componentSize);
      out[i * components + c] = accessor.normalized
        ? normalizeComponent(value, componentType)
        : Number(value);
    }
  }
  return out;
}

function mat4Identity() {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function mat4Multiply(a, b) {
  const out = new Array(16).fill(0);
  for (let r = 0; r < 4; r += 1) {
    for (let c = 0; c < 4; c += 1) {
      out[r * 4 + c] =
        a[r * 4 + 0] * b[0 * 4 + c] +
        a[r * 4 + 1] * b[1 * 4 + c] +
        a[r * 4 + 2] * b[2 * 4 + c] +
        a[r * 4 + 3] * b[3 * 4 + c];
    }
  }
  return out;
}

function mat4FromTRS(translation, rotation, scale) {
  const [x, y, z, w] = rotation;
  const xx = x * x;
  const yy = y * y;
  const zz = z * z;
  const xy = x * y;
  const xz = x * z;
  const yz = y * z;
  const wx = w * x;
  const wy = w * y;
  const wz = w * z;

  const sx = scale[0];
  const sy = scale[1];
  const sz = scale[2];

  return [
    (1 - 2 * (yy + zz)) * sx,
    (2 * (xy + wz)) * sx,
    (2 * (xz - wy)) * sx,
    0,
    (2 * (xy - wz)) * sy,
    (1 - 2 * (xx + zz)) * sy,
    (2 * (yz + wx)) * sy,
    0,
    (2 * (xz + wy)) * sz,
    (2 * (yz - wx)) * sz,
    (1 - 2 * (xx + yy)) * sz,
    0,
    translation[0],
    translation[1],
    translation[2],
    1
  ];
}

function transformPoint(m, p) {
  const x = p[0];
  const y = p[1];
  const z = p[2];
  return [
    m[0] * x + m[4] * y + m[8] * z + m[12],
    m[1] * x + m[5] * y + m[9] * z + m[13],
    m[2] * x + m[6] * y + m[10] * z + m[14]
  ];
}

function normalMatrixFromMat4(m) {
  const a00 = m[0];
  const a01 = m[4];
  const a02 = m[8];
  const a10 = m[1];
  const a11 = m[5];
  const a12 = m[9];
  const a20 = m[2];
  const a21 = m[6];
  const a22 = m[10];

  const b01 = a22 * a11 - a12 * a21;
  const b11 = -a22 * a10 + a12 * a20;
  const b21 = a21 * a10 - a11 * a20;

  let det = a00 * b01 + a01 * b11 + a02 * b21;
  if (Math.abs(det) < 1e-8) {
    det = 1;
  }
  const invDet = 1 / det;

  const inv00 = b01 * invDet;
  const inv01 = (-a22 * a01 + a02 * a21) * invDet;
  const inv02 = (a12 * a01 - a02 * a11) * invDet;
  const inv10 = b11 * invDet;
  const inv11 = (a22 * a00 - a02 * a20) * invDet;
  const inv12 = (-a12 * a00 + a02 * a10) * invDet;
  const inv20 = b21 * invDet;
  const inv21 = (-a21 * a00 + a01 * a20) * invDet;
  const inv22 = (a11 * a00 - a01 * a10) * invDet;

  return [
    inv00, inv10, inv20,
    inv01, inv11, inv21,
    inv02, inv12, inv22
  ];
}

function transformNormal(n, normalMatrix) {
  const x = n[0];
  const y = n[1];
  const z = n[2];
  return [
    normalMatrix[0] * x + normalMatrix[3] * y + normalMatrix[6] * z,
    normalMatrix[1] * x + normalMatrix[4] * y + normalMatrix[7] * z,
    normalMatrix[2] * x + normalMatrix[5] * y + normalMatrix[8] * z
  ];
}

function normalizeVec3(v) {
  const len = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / len, v[1] / len, v[2] / len];
}

function resolveNodeMatrix(node) {
  if (node.matrix) {
    return node.matrix;
  }
  const translation = node.translation || [0, 0, 0];
  const rotation = node.rotation || [0, 0, 0, 1];
  const scale = node.scale || [1, 1, 1];
  return mat4FromTRS(translation, rotation, scale);
}

function traverseNodes(gltf, nodeIndex, parentMatrix, meshes) {
  const node = gltf.nodes[nodeIndex];
  const local = resolveNodeMatrix(node);
  const world = mat4Multiply(parentMatrix, local);

  if (node.mesh !== undefined) {
    meshes.push({ mesh: gltf.meshes[node.mesh], matrix: world });
  }
  if (node.meshes) {
    for (const meshIndex of node.meshes) {
      meshes.push({ mesh: gltf.meshes[meshIndex], matrix: world });
    }
  }

  if (node.children) {
    for (const child of node.children) {
      traverseNodes(gltf, child, world, meshes);
    }
  }
}

export async function loadGltfFromText(text, baseUrl = null, fetchFn = fetch) {
  const raw = JSON.parse(text);
  if (!raw.buffers || !raw.bufferViews || !raw.accessors) {
    throw new Error("glTF is missing buffers/bufferViews/accessors.");
  }
  const gltf = normalizeGltf(raw);
  if (!gltf.meshes || gltf.meshes.length === 0) {
    throw new Error("glTF has no meshes.");
  }

  const buffers = await loadBuffers(gltf, baseUrl, fetchFn);
  const meshes = [];
  const scene = gltf.scenes[gltf.scene ?? 0];
  if (!scene || !scene.nodes) {
    throw new Error("glTF has no default scene nodes.");
  }

  for (const nodeIndex of scene.nodes) {
    traverseNodes(gltf, nodeIndex, mat4Identity(), meshes);
  }

  const positions = [];
  const indices = [];
  const normals = [];
  const vertexColors = [];
  let vertexOffset = 0;
  let missingNormals = false;
  const materialDefaults = {
    baseColorFactor: [1, 1, 1, 1]
  };
  const materials = gltf.materials.length > 0 ? gltf.materials : [materialDefaults];

  for (const entry of meshes) {
    for (const primitive of entry.mesh.primitives) {
      if (primitive.attributes.POSITION === undefined) {
        throw new Error("Primitive missing POSITION attribute.");
      }

      const posArray = readAccessorToArray(gltf, primitive.attributes.POSITION, buffers);
      const transformed = new Float32Array(posArray.length);
      const normalMatrix = normalMatrixFromMat4(entry.matrix);
      for (let i = 0; i < posArray.length; i += 3) {
        const p = transformPoint(entry.matrix, [posArray[i], posArray[i + 1], posArray[i + 2]]);
        transformed[i] = p[0];
        transformed[i + 1] = p[1];
        transformed[i + 2] = p[2];
      }
      positions.push(transformed);

      let normalArray = null;
      if (primitive.attributes.NORMAL !== undefined) {
        normalArray = readAccessorToFloatArray(gltf, primitive.attributes.NORMAL, buffers);
      }
      const vertexCount = transformed.length / 3;
      const transformedNormals = new Float32Array(vertexCount * 3);
      if (normalArray) {
        for (let i = 0; i < vertexCount; i += 1) {
          const base = i * 3;
          const n = transformNormal(
            [normalArray[base], normalArray[base + 1], normalArray[base + 2]],
            normalMatrix
          );
          const nn = normalizeVec3(n);
          transformedNormals[base] = nn[0];
          transformedNormals[base + 1] = nn[1];
          transformedNormals[base + 2] = nn[2];
        }
      } else {
        missingNormals = true;
      }
      normals.push(transformedNormals);

      const materialIndex = primitive.material ?? 0;
      const material = materials[materialIndex] || materialDefaults;
      const baseColorRgb = resolveBaseColor(material);

      let colorArray = null;
      if (primitive.attributes.COLOR_0 !== undefined) {
        colorArray = readAccessorToFloatArray(gltf, primitive.attributes.COLOR_0, buffers);
      }
      const colors = new Float32Array(vertexCount * 3);
      for (let i = 0; i < vertexCount; i += 1) {
        let r = baseColorRgb[0];
        let g = baseColorRgb[1];
        let b = baseColorRgb[2];
        if (colorArray) {
          const stride = colorArray.length / vertexCount;
          const base = i * stride;
          r *= colorArray[base];
          g *= colorArray[base + 1];
          b *= colorArray[base + 2];
        }
        colors[i * 3] = r;
        colors[i * 3 + 1] = g;
        colors[i * 3 + 2] = b;
      }
      vertexColors.push(colors);

      if (primitive.indices !== undefined) {
        const idxArray = readAccessorToArray(gltf, primitive.indices, buffers);
        for (let i = 0; i < idxArray.length; i += 1) {
          indices.push(Number(idxArray[i]) + vertexOffset);
        }
      } else {
        const triCount = transformed.length / 3;
        for (let i = 0; i < triCount; i += 1) {
          indices.push(vertexOffset + i);
        }
      }

      vertexOffset += transformed.length / 3;
    }
  }

  const mergedPositions = new Float32Array(vertexOffset * 3);
  const mergedNormals = new Float32Array(vertexOffset * 3);
  const mergedColors = new Float32Array(vertexOffset * 3);
  let pOffset = 0;
  for (const chunk of positions) {
    mergedPositions.set(chunk, pOffset);
    pOffset += chunk.length;
  }
  let nOffset = 0;
  for (const chunk of normals) {
    mergedNormals.set(chunk, nOffset);
    nOffset += chunk.length;
  }
  let cOffset = 0;
  for (const chunk of vertexColors) {
    mergedColors.set(chunk, cOffset);
    cOffset += chunk.length;
  }

  if (missingNormals) {
    for (let i = 0; i < mergedNormals.length; i += 1) {
      mergedNormals[i] = 0;
    }
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i] * 3;
      const i1 = indices[i + 1] * 3;
      const i2 = indices[i + 2] * 3;
      const v0 = [mergedPositions[i0], mergedPositions[i0 + 1], mergedPositions[i0 + 2]];
      const v1 = [mergedPositions[i1], mergedPositions[i1 + 1], mergedPositions[i1 + 2]];
      const v2 = [mergedPositions[i2], mergedPositions[i2 + 1], mergedPositions[i2 + 2]];
      const e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
      const e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
      const nx = e1[1] * e2[2] - e1[2] * e2[1];
      const ny = e1[2] * e2[0] - e1[0] * e2[2];
      const nz = e1[0] * e2[1] - e1[1] * e2[0];
      mergedNormals[i0] += nx;
      mergedNormals[i0 + 1] += ny;
      mergedNormals[i0 + 2] += nz;
      mergedNormals[i1] += nx;
      mergedNormals[i1 + 1] += ny;
      mergedNormals[i1 + 2] += nz;
      mergedNormals[i2] += nx;
      mergedNormals[i2 + 1] += ny;
      mergedNormals[i2 + 2] += nz;
    }
    for (let i = 0; i < mergedNormals.length; i += 3) {
      const n = normalizeVec3([mergedNormals[i], mergedNormals[i + 1], mergedNormals[i + 2]]);
      mergedNormals[i] = n[0];
      mergedNormals[i + 1] = n[1];
      mergedNormals[i + 2] = n[2];
    }
  }

  const triCount = indices.length / 3;
  const triColors = new Float32Array(triCount * 3);
  for (let i = 0; i < triCount; i += 1) {
    const i0 = indices[i * 3] * 3;
    const i1 = indices[i * 3 + 1] * 3;
    const i2 = indices[i * 3 + 2] * 3;
    const r = (mergedColors[i0] + mergedColors[i1] + mergedColors[i2]) / 3;
    const g = (mergedColors[i0 + 1] + mergedColors[i1 + 1] + mergedColors[i2 + 1]) / 3;
    const b = (mergedColors[i0 + 2] + mergedColors[i1 + 2] + mergedColors[i2 + 2]) / 3;
    triColors[i * 3] = r;
    triColors[i * 3 + 1] = g;
    triColors[i * 3 + 2] = b;
  }

  return {
    positions: mergedPositions,
    indices: new Uint32Array(indices),
    normals: mergedNormals,
    triColors
  };
}
  function resolveBaseColor(material) {
    const pbr = material.pbrMetallicRoughness || {};
    const candidate = pbr.baseColorFactor ?? material.values?.diffuse ?? material.baseColorFactor;
    if (Array.isArray(candidate) && candidate.length >= 3) {
      const r = Number(candidate[0]);
      const g = Number(candidate[1]);
      const b = Number(candidate[2]);
      if (Number.isFinite(r) && Number.isFinite(g) && Number.isFinite(b)) {
        return [r, g, b];
      }
    }
    return [1, 1, 1];
  }
