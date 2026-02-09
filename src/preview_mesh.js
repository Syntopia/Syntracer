function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalize3(vx, vy, vz) {
  const len = Math.hypot(vx, vy, vz) || 1;
  return [vx / len, vy / len, vz / len];
}

function orthonormalBasisFromAxis(axis) {
  const ax = Math.abs(axis[0]);
  const az = Math.abs(axis[2]);
  const ref = ax > 0.8 ? [0, 0, 1] : [1, 0, 0];
  const ux = axis[1] * ref[2] - axis[2] * ref[1];
  const uy = axis[2] * ref[0] - axis[0] * ref[2];
  const uz = axis[0] * ref[1] - axis[1] * ref[0];
  const u = normalize3(ux, uy, uz);
  const vx = axis[1] * u[2] - axis[2] * u[1];
  const vy = axis[2] * u[0] - axis[0] * u[2];
  const vz = axis[0] * u[1] - axis[1] * u[0];
  const v = normalize3(vx, vy, vz);
  if (az > 0.95) {
    return { u: [1, 0, 0], v: [0, 1, 0] };
  }
  return { u, v };
}

function resolveMaterial(sceneData, materialIndex) {
  const materials = Array.isArray(sceneData.materials) ? sceneData.materials : [];
  const safeIndex = clamp(Math.trunc(Number(materialIndex) || 0), 0, Math.max(0, materials.length - 1));
  const material = materials[safeIndex] || null;

  if (!material) {
    return {
      mode: "metallic",
      metallic: 0,
      roughness: 0.45,
      rimBoost: 0,
      opacity: 1,
      matteSpecular: 0.03,
      matteRoughness: 0.5,
      surfaceTransmission: 0,
      surfaceOpacity: 0,
      useImportedColor: true,
      baseColor: [0.8, 0.8, 0.8]
    };
  }

  return {
    mode: material.mode || "metallic",
    metallic: clamp(Number(material.metallic ?? 0), 0, 1),
    roughness: clamp(Number(material.roughness ?? 0.45), 0.02, 1),
    rimBoost: clamp(Number(material.rimBoost ?? 0), 0, 2),
    opacity: clamp(Number(material.opacity ?? 1), 0, 1),
    matteSpecular: clamp(Number(material.matteSpecular ?? 0.03), 0, 1),
    matteRoughness: clamp(Number(material.matteRoughness ?? 0.6), 0.02, 1),
    surfaceTransmission: clamp(Number(material.surfaceTransmission ?? 0), 0, 1),
    surfaceOpacity: clamp(Number(material.surfaceOpacity ?? 0), 0, 1),
    useImportedColor: material.useImportedColor !== false,
    baseColor: Array.isArray(material.baseColor) && material.baseColor.length === 3
      ? [
          clamp(Number(material.baseColor[0]), 0, 1),
          clamp(Number(material.baseColor[1]), 0, 1),
          clamp(Number(material.baseColor[2]), 0, 1)
        ]
      : [0.8, 0.8, 0.8]
  };
}

export function mapPreviewMaterial(material, importedColor) {
  const baseColor = material.useImportedColor ? importedColor : material.baseColor;
  let metallic = material.metallic;
  let roughness = material.roughness;
  let opacity = material.opacity;

  if (material.mode === "matte") {
    metallic = 0;
    roughness = clamp(material.matteRoughness, 0.05, 1);
  } else if (material.mode === "surface-glass") {
    metallic = 0;
    roughness = clamp(0.03 + material.surfaceOpacity * 0.2, 0.02, 0.3);
    opacity *= clamp(1.0 - material.surfaceTransmission * 0.82, 0.08, 1.0);
  } else if (material.mode === "translucent-plastic") {
    metallic = 0.03;
    roughness = clamp(0.18 + material.surfaceOpacity * 0.35, 0.08, 0.6);
    opacity *= clamp(1.0 - material.surfaceTransmission * 0.65, 0.2, 1.0);
  }

  return {
    color: baseColor,
    metallic,
    roughness,
    opacity,
    rimBoost: material.rimBoost
  };
}

function pushVertex(storage, pos, normal, shading) {
  storage.positions.push(pos[0], pos[1], pos[2]);
  storage.normals.push(normal[0], normal[1], normal[2]);
  storage.colors.push(shading.color[0], shading.color[1], shading.color[2]);
  storage.material.push(shading.roughness, shading.metallic, shading.opacity, shading.rimBoost);
}

function pushTriangleIndices(storage, i0, i1, i2, opacity) {
  storage.indices.push(i0, i1, i2);
  if (opacity >= 0.999) {
    storage.opaqueIndices.push(i0, i1, i2);
  } else {
    storage.transparentIndices.push(i0, i1, i2);
  }
}

function addSceneTriangles(storage, sceneData) {
  const tris = Array.isArray(sceneData.tris) ? sceneData.tris : [];
  const positions = sceneData.positions || new Float32Array(0);
  const normals = sceneData.normals || new Float32Array(0);
  const triColors = sceneData.triColors || new Float32Array(0);
  const triMaterialIndices = sceneData.triMaterialIndices || new Float32Array(0);

  for (let triIndex = 0; triIndex < tris.length; triIndex += 1) {
    const tri = tris[triIndex];
    if (!tri || tri.length !== 3) {
      throw new Error(`Triangle ${triIndex} is invalid.`);
    }
    if (triColors.length < (triIndex + 1) * 3) {
      throw new Error(`Triangle color data is missing for triangle ${triIndex}.`);
    }
    const color = [triColors[triIndex * 3], triColors[triIndex * 3 + 1], triColors[triIndex * 3 + 2]];
    const material = resolveMaterial(sceneData, triMaterialIndices[triIndex] || 0);
    const shading = mapPreviewMaterial(material, color);

    const base = storage.positions.length / 3;
    const triPositions = new Array(3);
    const triNormals = new Array(3);
    for (let k = 0; k < 3; k += 1) {
      const vertexIndex = tri[k] * 3;
      const pos = [positions[vertexIndex], positions[vertexIndex + 1], positions[vertexIndex + 2]];
      let n = [normals[vertexIndex], normals[vertexIndex + 1], normals[vertexIndex + 2]];
      if (!Number.isFinite(n[0]) || !Number.isFinite(n[1]) || !Number.isFinite(n[2])) {
        n = [0, 0, 1];
      }
      const nn = normalize3(n[0], n[1], n[2]);
      triPositions[k] = pos;
      triNormals[k] = nn;
      pushVertex(storage, pos, nn, shading);
    }
    const e1 = [
      triPositions[1][0] - triPositions[0][0],
      triPositions[1][1] - triPositions[0][1],
      triPositions[1][2] - triPositions[0][2]
    ];
    const e2 = [
      triPositions[2][0] - triPositions[0][0],
      triPositions[2][1] - triPositions[0][1],
      triPositions[2][2] - triPositions[0][2]
    ];
    const face = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0]
    ];
    const avgNormal = normalize3(
      triNormals[0][0] + triNormals[1][0] + triNormals[2][0],
      triNormals[0][1] + triNormals[1][1] + triNormals[2][1],
      triNormals[0][2] + triNormals[1][2] + triNormals[2][2]
    );
    const orient = face[0] * avgNormal[0] + face[1] * avgNormal[1] + face[2] * avgNormal[2];
    if (orient >= 0) {
      pushTriangleIndices(storage, base, base + 1, base + 2, shading.opacity);
    } else {
      pushTriangleIndices(storage, base, base + 2, base + 1, shading.opacity);
    }
  }
}

function buildUnitSphereTemplate(latSteps, lonSteps) {
  const vertices = [];
  const indices = [];

  for (let lat = 0; lat <= latSteps; lat += 1) {
    const theta = (lat / latSteps) * Math.PI;
    const sinTheta = Math.sin(theta);
    const cosTheta = Math.cos(theta);
    for (let lon = 0; lon <= lonSteps; lon += 1) {
      const phi = (lon / lonSteps) * Math.PI * 2;
      const x = Math.cos(phi) * sinTheta;
      const y = cosTheta;
      const z = Math.sin(phi) * sinTheta;
      vertices.push([x, y, z]);
    }
  }

  const stride = lonSteps + 1;
  for (let lat = 0; lat < latSteps; lat += 1) {
    for (let lon = 0; lon < lonSteps; lon += 1) {
      const a = lat * stride + lon;
      const b = a + stride;
      const c = a + 1;
      const d = b + 1;
      // Winding must be CCW when viewed from outside the sphere.
      indices.push(a, c, b);
      indices.push(c, d, b);
    }
  }

  return { vertices, indices };
}

function addSphereMeshes(storage, sceneData, options) {
  const spheres = Array.isArray(sceneData.spheres) ? sceneData.spheres : [];
  const sphereMaterialIndices = sceneData.sphereMaterialIndices || new Float32Array(0);
  const latSteps = options.sphereLatSteps ?? 14;
  const lonSteps = options.sphereLonSteps ?? 22;
  const template = buildUnitSphereTemplate(latSteps, lonSteps);

  for (let sphereIndex = 0; sphereIndex < spheres.length; sphereIndex += 1) {
    const sphere = spheres[sphereIndex];
    if (!Array.isArray(sphere.center) || sphere.center.length !== 3) {
      throw new Error(`Sphere ${sphereIndex} is missing a valid center.`);
    }
    if (!Number.isFinite(sphere.radius) || sphere.radius <= 0) {
      throw new Error(`Sphere ${sphereIndex} has invalid radius ${sphere.radius}.`);
    }
    if (!Array.isArray(sphere.color) || sphere.color.length !== 3) {
      throw new Error(`Sphere ${sphereIndex} is missing a valid color.`);
    }
    const color = sphere.color;
    const material = resolveMaterial(sceneData, sphereMaterialIndices[sphereIndex] || 0);
    const shading = mapPreviewMaterial(material, color);
    const base = storage.positions.length / 3;

    for (const vertex of template.vertices) {
      const pos = [
        sphere.center[0] + vertex[0] * sphere.radius,
        sphere.center[1] + vertex[1] * sphere.radius,
        sphere.center[2] + vertex[2] * sphere.radius
      ];
      pushVertex(storage, pos, vertex, shading);
    }

    for (let i = 0; i < template.indices.length; i += 3) {
      pushTriangleIndices(
        storage,
        base + template.indices[i],
        base + template.indices[i + 1],
        base + template.indices[i + 2],
        shading.opacity
      );
    }
  }
}

function addCylinderMeshes(storage, sceneData, options) {
  const cylinders = Array.isArray(sceneData.cylinders) ? sceneData.cylinders : [];
  const cylinderMaterialIndices = sceneData.cylinderMaterialIndices || new Float32Array(0);
  const segments = options.cylinderSegments ?? 24;

  for (let cylinderIndex = 0; cylinderIndex < cylinders.length; cylinderIndex += 1) {
    const cylinder = cylinders[cylinderIndex];
    if (!Array.isArray(cylinder.p1) || cylinder.p1.length !== 3) {
      throw new Error(`Cylinder ${cylinderIndex} is missing a valid p1 endpoint.`);
    }
    if (!Array.isArray(cylinder.p2) || cylinder.p2.length !== 3) {
      throw new Error(`Cylinder ${cylinderIndex} is missing a valid p2 endpoint.`);
    }
    if (!Number.isFinite(cylinder.radius) || cylinder.radius <= 0) {
      throw new Error(`Cylinder ${cylinderIndex} has invalid radius ${cylinder.radius}.`);
    }
    if (!Array.isArray(cylinder.color) || cylinder.color.length !== 3) {
      throw new Error(`Cylinder ${cylinderIndex} is missing a valid color.`);
    }
    const axisRaw = [
      cylinder.p2[0] - cylinder.p1[0],
      cylinder.p2[1] - cylinder.p1[1],
      cylinder.p2[2] - cylinder.p1[2]
    ];
    const length = Math.hypot(axisRaw[0], axisRaw[1], axisRaw[2]);
    if (length < 1e-8) {
      continue;
    }
    const axis = normalize3(axisRaw[0], axisRaw[1], axisRaw[2]);
    const basis = orthonormalBasisFromAxis(axis);

    const color = cylinder.color;
    const material = resolveMaterial(sceneData, cylinderMaterialIndices[cylinderIndex] || 0);
    const shading = mapPreviewMaterial(material, color);

    const ringStart = storage.positions.length / 3;

    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      const angle = t * Math.PI * 2;
      const radialX = Math.cos(angle);
      const radialY = Math.sin(angle);
      const radial = [
        basis.u[0] * radialX + basis.v[0] * radialY,
        basis.u[1] * radialX + basis.v[1] * radialY,
        basis.u[2] * radialX + basis.v[2] * radialY
      ];

      const bottomPos = [
        cylinder.p1[0] + radial[0] * cylinder.radius,
        cylinder.p1[1] + radial[1] * cylinder.radius,
        cylinder.p1[2] + radial[2] * cylinder.radius
      ];
      const topPos = [
        cylinder.p2[0] + radial[0] * cylinder.radius,
        cylinder.p2[1] + radial[1] * cylinder.radius,
        cylinder.p2[2] + radial[2] * cylinder.radius
      ];

      pushVertex(storage, bottomPos, radial, shading);
      pushVertex(storage, topPos, radial, shading);
    }

    for (let i = 0; i < segments; i += 1) {
      const base = ringStart + i * 2;
      pushTriangleIndices(storage, base, base + 2, base + 1, shading.opacity);
      pushTriangleIndices(storage, base + 2, base + 3, base + 1, shading.opacity);
    }

    const bottomCenter = storage.positions.length / 3;
    pushVertex(storage, cylinder.p1, [-axis[0], -axis[1], -axis[2]], shading);
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      const angle = t * Math.PI * 2;
      const radialX = Math.cos(angle);
      const radialY = Math.sin(angle);
      const radial = [
        basis.u[0] * radialX + basis.v[0] * radialY,
        basis.u[1] * radialX + basis.v[1] * radialY,
        basis.u[2] * radialX + basis.v[2] * radialY
      ];
      const pos = [
        cylinder.p1[0] + radial[0] * cylinder.radius,
        cylinder.p1[1] + radial[1] * cylinder.radius,
        cylinder.p1[2] + radial[2] * cylinder.radius
      ];
      pushVertex(storage, pos, [-axis[0], -axis[1], -axis[2]], shading);
    }
    for (let i = 0; i < segments; i += 1) {
      pushTriangleIndices(storage, bottomCenter, bottomCenter + i + 2, bottomCenter + i + 1, shading.opacity);
    }

    const topCenter = storage.positions.length / 3;
    pushVertex(storage, cylinder.p2, axis, shading);
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      const angle = t * Math.PI * 2;
      const radialX = Math.cos(angle);
      const radialY = Math.sin(angle);
      const radial = [
        basis.u[0] * radialX + basis.v[0] * radialY,
        basis.u[1] * radialX + basis.v[1] * radialY,
        basis.u[2] * radialX + basis.v[2] * radialY
      ];
      const pos = [
        cylinder.p2[0] + radial[0] * cylinder.radius,
        cylinder.p2[1] + radial[1] * cylinder.radius,
        cylinder.p2[2] + radial[2] * cylinder.radius
      ];
      pushVertex(storage, pos, axis, shading);
    }
    for (let i = 0; i < segments; i += 1) {
      pushTriangleIndices(storage, topCenter, topCenter + i + 1, topCenter + i + 2, shading.opacity);
    }
  }
}

export function triangulateSceneForPreview(sceneData, options = {}) {
  if (!sceneData) {
    throw new Error("Cannot build preview mesh without sceneData.");
  }
  if (!(sceneData.positions instanceof Float32Array)) {
    throw new Error("sceneData.positions must be a Float32Array.");
  }
  if (!(sceneData.normals instanceof Float32Array)) {
    throw new Error("sceneData.normals must be a Float32Array.");
  }
  if (!(sceneData.triColors instanceof Float32Array)) {
    throw new Error("sceneData.triColors must be a Float32Array.");
  }
  if (!(sceneData.triMaterialIndices instanceof Float32Array)) {
    throw new Error("sceneData.triMaterialIndices must be a Float32Array.");
  }
  if (!(sceneData.sphereMaterialIndices instanceof Float32Array)) {
    throw new Error("sceneData.sphereMaterialIndices must be a Float32Array.");
  }
  if (!(sceneData.cylinderMaterialIndices instanceof Float32Array)) {
    throw new Error("sceneData.cylinderMaterialIndices must be a Float32Array.");
  }
  if (!Array.isArray(sceneData.materials) || sceneData.materials.length === 0) {
    throw new Error("sceneData.materials must contain at least one material.");
  }

  const storage = {
    positions: [],
    normals: [],
    colors: [],
    material: [],
    indices: [],
    opaqueIndices: [],
    transparentIndices: []
  };

  addSceneTriangles(storage, sceneData);
  addSphereMeshes(storage, sceneData, options);
  addCylinderMeshes(storage, sceneData, options);

  return {
    positions: new Float32Array(storage.positions),
    normals: new Float32Array(storage.normals),
    colors: new Float32Array(storage.colors),
    material: new Float32Array(storage.material),
    indices: new Uint32Array(storage.indices),
    opaqueIndices: new Uint32Array(storage.opaqueIndices),
    transparentIndices: new Uint32Array(storage.transparentIndices),
    triangleCount: storage.indices.length / 3
  };
}
