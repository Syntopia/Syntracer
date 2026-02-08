import test from "node:test";
import assert from "node:assert/strict";

import {
  createSceneGraphFromMolData,
  addRepresentationToObject,
  updateRepresentation,
  selectRepresentation,
  toggleRepresentationVisibility
} from "../src/scene_graph.js";
import { compileSceneGraphGeometry, findPrimitivePickRange } from "../src/scene_graph_compile.js";
import { PRIM_SPHERE, PRIM_CYLINDER } from "../src/bvh.js";

function makeMolData() {
  return {
    atoms: [
      { element: "C", isHet: false, resName: "LIG", position: [0, 0, 0] },
      { element: "N", isHet: false, resName: "LIG", position: [1.3, 0, 0] }
    ],
    bonds: [[0, 1]],
    secondary: { helices: [], sheets: [] }
  };
}

test("compileSceneGraphGeometry compiles visible representations and chooses selected primary material", () => {
  const graph = createSceneGraphFromMolData(makeMolData(), { sourceKind: "sdf" });
  const object = graph.objects[0];
  const rep = object.representations[0];

  updateRepresentation(graph, object.id, rep.id, {
    display: { style: "stick", bondRadius: 0.12, atomScale: 1.0 },
    material: { mode: "matte", baseColor: [0.2, 0.3, 0.4], useImportedColor: false }
  });
  selectRepresentation(graph, object.id, rep.id);

  const cache = new Map();
  const compiled = compileSceneGraphGeometry(graph, { geometryCache: cache, logger: null });
  assert.equal(compiled.spheres.length, 2);
  assert.equal(compiled.cylinders.length, 2);  // stick style splits each bond into 2 half-cylinders
  assert.equal(compiled.materials.length, 1);
  assert.equal(compiled.sphereMaterialIndices.length, 2);
  assert.equal(compiled.cylinderMaterialIndices.length, 2);
  assert.equal(compiled.primaryMaterial.mode, "matte");
  assert.equal(compiled.hasMaterialConflict, false);
  assert.ok(cache.has(rep.id));
});

test("compileSceneGraphGeometry reports conflicts when visible representations have different materials", () => {
  const graph = createSceneGraphFromMolData(makeMolData(), { sourceKind: "sdf" });
  const object = graph.objects[0];
  const baseRep = object.representations[0];

  const added = addRepresentationToObject(graph, object.id);
  updateRepresentation(graph, object.id, baseRep.id, {
    display: { style: "stick", bondRadius: 0.12, atomScale: 1.0 },
    material: { mode: "metallic" }
  });
  updateRepresentation(graph, object.id, added.id, {
    display: { style: "vdw", atomScale: 1.0 },
    material: { mode: "matte" }
  });

  const compiled = compileSceneGraphGeometry(graph, { geometryCache: new Map(), logger: null });
  assert.equal(compiled.hasMaterialConflict, true);
  assert.equal(compiled.materials.length, 2);
  assert.equal(compiled.sphereMaterialIndices.length, 4);
  assert.equal(compiled.cylinderMaterialIndices.length, 2);  // stick style: 2 half-cylinders per bond

  toggleRepresentationVisibility(graph, object.id, added.id, false);
  const compiledNoConflict = compileSceneGraphGeometry(graph, { geometryCache: new Map(), logger: null });
  assert.equal(compiledNoConflict.hasMaterialConflict, false);
});

test("compileSceneGraphGeometry exposes primitive pick ranges with atom and bond metadata", () => {
  const graph = createSceneGraphFromMolData(makeMolData(), { sourceKind: "sdf" });
  const object = graph.objects[0];
  const baseRep = object.representations[0];
  updateRepresentation(graph, object.id, baseRep.id, {
    display: { style: "stick", bondRadius: 0.12, atomScale: 1.0 }
  });

  const added = addRepresentationToObject(graph, object.id);
  updateRepresentation(graph, object.id, added.id, {
    display: { style: "vdw", atomScale: 1.0 }
  });

  const compiled = compileSceneGraphGeometry(graph, { geometryCache: new Map(), logger: null });
  assert.ok(compiled.pickRanges);
  assert.equal(compiled.pickRanges.sphereRanges.length, 2);
  assert.equal(compiled.pickRanges.cylinderRanges.length, 1);

  const firstSphereRange = findPrimitivePickRange(compiled.pickRanges, PRIM_SPHERE, 0);
  assert.ok(firstSphereRange);
  assert.deepEqual(firstSphereRange.sphereAtomIndices, [0, 1]);

  const secondSphereRange = findPrimitivePickRange(compiled.pickRanges, PRIM_SPHERE, 3);
  assert.ok(secondSphereRange);
  assert.equal(secondSphereRange.representationId, added.id);

  const cylinderRange = findPrimitivePickRange(compiled.pickRanges, PRIM_CYLINDER, 0);
  assert.ok(cylinderRange);
  assert.deepEqual(cylinderRange.cylinderBondAtomPairs, [[0, 1], [0, 1]]);  // stick style: 2 half-cylinders per bond
});

test("compileSceneGraphGeometry exposes active volumetric representation metadata", () => {
  const graph = createSceneGraphFromMolData(makeMolData(), {
    sourceKind: "sdf",
    volumeGrids: [{
      data: new Float32Array(8),
      dims: [2, 2, 2],
      origin: [0, 0, 0],
      spacing: [1, 1, 1],
      minValue: 0,
      maxValue: 1,
      bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
      version: 1
    }]
  });

  const volumeObject = graph.objects.find((o) => o.type === "volume");
  assert.ok(volumeObject);
  const rep = volumeObject.representations[0];
  updateRepresentation(graph, volumeObject.id, rep.id, {
    display: {
      style: "volumetric",
      volumeValueMin: 0.1,
      volumeValueMax: 0.9,
      volumeOpacityScale: 1.2,
      volumeStepSize: 0.4,
      volumeTransferPreset: "heatmap"
    }
  });

  const compiled = compileSceneGraphGeometry(graph, { geometryCache: new Map(), logger: null });
  assert.ok(compiled.volumeData);
  assert.equal(compiled.volumeData.dims[0], 2);
  assert.ok(compiled.volumeDisplay);
  assert.equal(compiled.volumeDisplay.style, "volumetric");
  assert.equal(compiled.volumeDisplay.volumeTransferPreset, "heatmap");
});

test("compileSceneGraphGeometry fails when multiple volumetric representations are visible", () => {
  const graph = createSceneGraphFromMolData(makeMolData(), {
    sourceKind: "sdf",
    volumeGrids: [{
      data: new Float32Array(8),
      dims: [2, 2, 2],
      origin: [0, 0, 0],
      spacing: [1, 1, 1],
      minValue: 0,
      maxValue: 1,
      bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
      version: 2
    }]
  });
  const volumeObject = graph.objects.find((o) => o.type === "volume");
  assert.ok(volumeObject);
  const repA = volumeObject.representations[0];
  const repB = addRepresentationToObject(graph, volumeObject.id);
  updateRepresentation(graph, volumeObject.id, repA.id, {
    display: { style: "volumetric", volumeValueMin: 0.1, volumeValueMax: 0.8 }
  });
  updateRepresentation(graph, volumeObject.id, repB.id, {
    display: { style: "volumetric", volumeValueMin: 0.2, volumeValueMax: 0.9 }
  });

  assert.throws(
    () => compileSceneGraphGeometry(graph, { geometryCache: new Map(), logger: null }),
    /Multiple volumetric representations are visible/i
  );
});
