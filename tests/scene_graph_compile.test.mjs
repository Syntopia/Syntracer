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
  assert.equal(compiled.cylinders.length, 1);
  assert.equal(compiled.materials.length, 1);
  assert.equal(compiled.sphereMaterialIndices.length, 2);
  assert.equal(compiled.cylinderMaterialIndices.length, 1);
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
  assert.equal(compiled.cylinderMaterialIndices.length, 1);

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
  assert.deepEqual(cylinderRange.cylinderBondAtomPairs, [[0, 1]]);
});
