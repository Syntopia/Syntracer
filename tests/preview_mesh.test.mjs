import test from "node:test";
import assert from "node:assert/strict";

import { triangulateSceneForPreview, mapPreviewMaterial } from "../src/preview_mesh.js";

function makeSceneData() {
  return {
    positions: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0
    ]),
    normals: new Float32Array([
      0, 0, 1,
      0, 0, 1,
      0, 0, 1
    ]),
    tris: [[0, 1, 2]],
    triColors: new Float32Array([0.2, 0.3, 0.4]),
    triMaterialIndices: new Float32Array([0]),
    spheres: [{ center: [0, 0, 0], radius: 0.5, color: [0.5, 0.6, 0.7] }],
    sphereMaterialIndices: new Float32Array([1]),
    cylinders: [{ p1: [0, 0, 0], p2: [0, 1, 0], radius: 0.1, color: [0.7, 0.2, 0.2] }],
    cylinderMaterialIndices: new Float32Array([2]),
    materials: [
      {
        mode: "metallic",
        metallic: 0.8,
        roughness: 0.2,
        opacity: 1,
        rimBoost: 0,
        useImportedColor: true,
        baseColor: [1, 1, 1]
      },
      {
        mode: "matte",
        matteRoughness: 0.7,
        opacity: 1,
        rimBoost: 0,
        useImportedColor: true,
        baseColor: [1, 1, 1]
      },
      {
        mode: "surface-glass",
        surfaceTransmission: 0.8,
        surfaceOpacity: 0.1,
        opacity: 1,
        rimBoost: 0,
        useImportedColor: true,
        baseColor: [1, 1, 1]
      }
    ]
  };
}

test("triangulateSceneForPreview converts triangles, spheres, and cylinders", () => {
  const mesh = triangulateSceneForPreview(makeSceneData(), {
    sphereLatSteps: 2,
    sphereLonSteps: 4,
    cylinderSegments: 4
  });

  const expectedTriangles = 1 + (2 * 4 * 2) + (4 * 2 + 4 + 4);
  assert.equal(mesh.triangleCount, expectedTriangles);
  assert.equal(mesh.positions.length % 3, 0);
  assert.equal(mesh.normals.length, mesh.positions.length);
  assert.equal(mesh.colors.length, mesh.positions.length);
  assert.equal(mesh.material.length, (mesh.positions.length / 3) * 4);
  assert.equal(mesh.indices.length, expectedTriangles * 3);
  assert.equal(mesh.opaqueIndices.length + mesh.transparentIndices.length, mesh.indices.length);
  assert.ok(mesh.transparentIndices.length > 0);
});

test("mapPreviewMaterial approximates transmissive materials by reducing opacity", () => {
  const mapped = mapPreviewMaterial({
    mode: "surface-glass",
    metallic: 0,
    roughness: 0.1,
    opacity: 1,
    rimBoost: 0,
    matteSpecular: 0.03,
    matteRoughness: 0.5,
    surfaceTransmission: 0.75,
    surfaceOpacity: 0.2,
    useImportedColor: true,
    baseColor: [1, 1, 1]
  }, [0.2, 0.3, 0.4]);

  assert.ok(mapped.opacity < 1);
  assert.equal(mapped.color[0], 0.2);
  assert.equal(mapped.color[1], 0.3);
  assert.equal(mapped.color[2], 0.4);
});

test("scene triangle winding is aligned to vertex normals for culling", () => {
  const scene = {
    positions: new Float32Array([
      0, 0, 0,
      1, 0, 0,
      0, 1, 0
    ]),
    normals: new Float32Array([
      0, 0, 1,
      0, 0, 1,
      0, 0, 1
    ]),
    // Intentionally reversed input winding.
    tris: [[0, 2, 1]],
    triColors: new Float32Array([0.7, 0.7, 0.7]),
    triMaterialIndices: new Float32Array([0]),
    spheres: [],
    sphereMaterialIndices: new Float32Array(0),
    cylinders: [],
    cylinderMaterialIndices: new Float32Array(0),
    materials: [{ mode: "metallic", metallic: 0, roughness: 0.5, opacity: 1, rimBoost: 0, useImportedColor: true, baseColor: [1, 1, 1] }]
  };

  const mesh = triangulateSceneForPreview(scene);
  const i0 = mesh.indices[0] * 3;
  const i1 = mesh.indices[1] * 3;
  const i2 = mesh.indices[2] * 3;
  const p0 = [mesh.positions[i0], mesh.positions[i0 + 1], mesh.positions[i0 + 2]];
  const p1 = [mesh.positions[i1], mesh.positions[i1 + 1], mesh.positions[i1 + 2]];
  const p2 = [mesh.positions[i2], mesh.positions[i2 + 1], mesh.positions[i2 + 2]];
  const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
  const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
  const face = [
    e1[1] * e2[2] - e1[2] * e2[1],
    e1[2] * e2[0] - e1[0] * e2[2],
    e1[0] * e2[1] - e1[1] * e2[0]
  ];
  assert.ok(face[2] > 0, "Triangle should be rewound to match +Z normals.");
});

test("sphere template winding points outward for culling", () => {
  const scene = {
    positions: new Float32Array(0),
    normals: new Float32Array(0),
    tris: [],
    triColors: new Float32Array(0),
    triMaterialIndices: new Float32Array(0),
    spheres: [{ center: [0, 0, 0], radius: 1, color: [1, 1, 1] }],
    sphereMaterialIndices: new Float32Array([0]),
    cylinders: [],
    cylinderMaterialIndices: new Float32Array(0),
    materials: [{ mode: "metallic", metallic: 0, roughness: 0.5, opacity: 1, rimBoost: 0, useImportedColor: true, baseColor: [1, 1, 1] }]
  };

  const mesh = triangulateSceneForPreview(scene, { sphereLatSteps: 6, sphereLonSteps: 12, cylinderSegments: 8 });
  let outward = 0;
  let inward = 0;
  for (let i = 0; i < mesh.indices.length; i += 3) {
    const i0 = mesh.indices[i] * 3;
    const i1 = mesh.indices[i + 1] * 3;
    const i2 = mesh.indices[i + 2] * 3;
    const p0 = [mesh.positions[i0], mesh.positions[i0 + 1], mesh.positions[i0 + 2]];
    const p1 = [mesh.positions[i1], mesh.positions[i1 + 1], mesh.positions[i1 + 2]];
    const p2 = [mesh.positions[i2], mesh.positions[i2 + 1], mesh.positions[i2 + 2]];
    const e1 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]];
    const e2 = [p2[0] - p0[0], p2[1] - p0[1], p2[2] - p0[2]];
    const cross = [
      e1[1] * e2[2] - e1[2] * e2[1],
      e1[2] * e2[0] - e1[0] * e2[2],
      e1[0] * e2[1] - e1[1] * e2[0]
    ];
    const center = [
      (p0[0] + p1[0] + p2[0]) / 3,
      (p0[1] + p1[1] + p2[1]) / 3,
      (p0[2] + p1[2] + p2[2]) / 3
    ];
    const dot = cross[0] * center[0] + cross[1] * center[1] + cross[2] * center[2];
    if (dot >= 0) outward += 1;
    else inward += 1;
  }
  assert.ok(outward > 0);
  assert.equal(inward, 0, "Sphere winding should be outward (CCW from outside view).");
});
