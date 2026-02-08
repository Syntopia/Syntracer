import test from "node:test";
import assert from "node:assert/strict";
import { buildRepresentationGeometry } from "../src/representation_builder.js";
import { SCENE_OBJECT_TYPES, createDefaultMaterial, defaultDisplayForObjectType } from "../src/scene_graph.js";

function makeVolumeObject(data) {
  return {
    type: SCENE_OBJECT_TYPES.VOLUME,
    atomCount: 0,
    molData: { atoms: [], bonds: [], secondary: { helices: [], sheets: [] } },
    volumeData: data
  };
}

function hasColor(triColors, target, eps = 1e-3) {
  for (let i = 0; i < triColors.length; i += 3) {
    if (
      Math.abs(triColors[i] - target[0]) <= eps
      && Math.abs(triColors[i + 1] - target[1]) <= eps
      && Math.abs(triColors[i + 2] - target[2]) <= eps
    ) {
      return true;
    }
  }
  return false;
}

test("volume isosurface colors positive and negative levels separately", () => {
  const data = new Float32Array([
    -1.0, -0.1,
     0.1,  1.0,
    -1.0, -0.1,
     0.1,  1.0
  ]);
  const object = makeVolumeObject({
    data,
    dims: [2, 2, 2],
    origin: [0, 0, 0],
    spacing: [1, 1, 1],
    minValue: -1.0,
    maxValue: 1.0,
    absMax: 1.0,
    minAbsNonZero: 0.1,
    bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
    version: 1
  });

  const display = {
    ...defaultDisplayForObjectType(SCENE_OBJECT_TYPES.VOLUME),
    style: "isosurface",
    isoLevel: 0.5,
    isoPositiveColor: [0.0, 1.0, 0.0],
    isoNegativeColor: [1.0, 0.0, 0.0]
  };
  const representation = {
    display,
    material: createDefaultMaterial()
  };

  const geometry = buildRepresentationGeometry({ object, representation });
  assert.ok(geometry.indices.length > 0, "Isosurface should produce triangles.");
  assert.ok(hasColor(geometry.triColors, [0.0, 1.0, 0.0]), "Positive surface color missing.");
  assert.ok(hasColor(geometry.triColors, [1.0, 0.0, 0.0]), "Negative surface color missing.");
});

test("volume isosurface isoLevel=0 remains finite when grid contains zeros", () => {
  const data = new Float32Array([
    -1.0, 0.0,
     0.0, 1.0,
    -1.0, 0.0,
     0.0, 1.0
  ]);
  const object = makeVolumeObject({
    data,
    dims: [2, 2, 2],
    origin: [0, 0, 0],
    spacing: [1, 1, 1],
    minValue: -1.0,
    maxValue: 1.0,
    absMax: 1.0,
    minAbsNonZero: 0.0,
    bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
    version: 2
  });
  const representation = {
    display: {
      ...defaultDisplayForObjectType(SCENE_OBJECT_TYPES.VOLUME),
      style: "isosurface",
      isoLevel: 0.0
    },
    material: createDefaultMaterial()
  };

  const geometry = buildRepresentationGeometry({ object, representation });
  assert.ok(Number.isFinite(geometry.positions[0]));
});
