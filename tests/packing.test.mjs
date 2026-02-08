import test from "node:test";
import assert from "node:assert/strict";
import {
  packTriFlags,
  packTriColorsWithMaterialIndices,
  packSphereColorsWithMaterialIndices,
  packCylinderColorsWithMaterialIndices,
  packMaterialTable
} from "../src/packing.js";

test("packTriFlags packs flag values into texels", () => {
  const triFlags = new Float32Array([0, 1, 0.5]);
  const packed = packTriFlags(triFlags, 4);

  assert.equal(packed.width, 3);
  assert.equal(packed.height, 1);
  assert.equal(packed.data.length, 12);
  assert.equal(packed.data[0], 0);
  assert.equal(packed.data[4], 1);
  assert.equal(packed.data[8], 0.5);
});

test("packTriFlags creates a minimal texture for empty input", () => {
  const packed = packTriFlags(new Float32Array(0), 4);

  assert.equal(packed.width, 1);
  assert.equal(packed.height, 1);
  assert.equal(packed.data.length, 4);
  assert.equal(packed.data[0], 0);
});

test("packTriColorsWithMaterialIndices stores material index in alpha channel", () => {
  const triColors = new Float32Array([1, 0, 0, 0, 1, 0]);
  const triMaterialIndices = new Float32Array([2, 3]);
  const packed = packTriColorsWithMaterialIndices(triColors, triMaterialIndices, 8);
  assert.equal(packed.width, 2);
  assert.equal(packed.height, 1);
  assert.equal(packed.data[3], 2);
  assert.equal(packed.data[7], 3);
});

test("packSphereColorsWithMaterialIndices and packCylinderColorsWithMaterialIndices store alpha", () => {
  const spheres = [{ color: [0.1, 0.2, 0.3] }, { color: [0.4, 0.5, 0.6] }];
  const spherePacked = packSphereColorsWithMaterialIndices(spheres, new Float32Array([1, 4]), 8);
  assert.equal(spherePacked.data[3], 1);
  assert.equal(spherePacked.data[7], 4);

  const cylinders = [{ color: [0.7, 0.6, 0.5] }];
  const cylinderPacked = packCylinderColorsWithMaterialIndices(cylinders, new Float32Array([5]), 8);
  assert.equal(cylinderPacked.data[3], 5);
});

test("packMaterialTable encodes material mode and key parameters", () => {
  const materials = [
    {
      mode: "metallic",
      useImportedColor: true,
      baseColor: [0.8, 0.8, 0.8],
      metallic: 0.2,
      roughness: 0.3,
      rimBoost: 0.1,
      matteSpecular: 0.03,
      matteRoughness: 0.5,
      matteDiffuseRoughness: 0.4,
      wrapDiffuse: 0.2,
      surfaceIor: 1.33,
      surfaceTransmission: 0.35,
      surfaceOpacity: 0.05
    },
    {
      mode: "surface-glass",
      useImportedColor: false,
      baseColor: [0.2, 0.3, 0.4],
      metallic: 0.0,
      roughness: 0.25,
      rimBoost: 0.0,
      matteSpecular: 0.02,
      matteRoughness: 0.6,
      matteDiffuseRoughness: 0.5,
      wrapDiffuse: 0.1,
      surfaceIor: 1.5,
      surfaceTransmission: 0.7,
      surfaceOpacity: 0.2
    }
  ];
  const packed = packMaterialTable(materials, 16);
  assert.equal(packed.count, 2);
  assert.equal(packed.texelsPerMaterial, 4);
  assert.equal(packed.data[0], 0);
  assert.ok(Math.abs(packed.data[4] - 0.03) < 1e-6);
  assert.ok(Math.abs(packed.data[8] - 1.33) < 1e-6);
  assert.ok(Math.abs(packed.data[12] - 0.8) < 1e-6);
  assert.equal(packed.data[16], 2);
  assert.equal(packed.data[27], 0);
});
