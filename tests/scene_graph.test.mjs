import test from "node:test";
import assert from "node:assert/strict";

import {
  SCENE_OBJECT_TYPES,
  createSceneGraphFromMolData,
  listVisibleRepresentations,
  toggleObjectVisibility,
  toggleRepresentationVisibility,
  addRepresentationToObject,
  updateRepresentation,
  selectRepresentation,
  partitionMolDataByType
} from "../src/scene_graph.js";

function makeMixedMolData() {
  return {
    atoms: [
      { element: "N", isHet: false, resName: "ALA", position: [0, 0, 0] },
      { element: "C", isHet: false, resName: "ALA", position: [1, 0, 0] },
      { element: "O", isHet: true, resName: "HOH", position: [2, 0, 0] },
      { element: "C", isHet: true, resName: "LIG", position: [3, 0, 0] },
      { element: "ZN", isHet: true, resName: "ZN", position: [4, 0, 0] }
    ],
    bonds: [
      [0, 1],
      [2, 3],
      [3, 4]
    ],
    secondary: { helices: [], sheets: [] }
  };
}

test("partitionMolDataByType separates protein/ligand/water/metals", () => {
  const partitions = partitionMolDataByType(makeMixedMolData(), "pdb");
  assert.equal(partitions[SCENE_OBJECT_TYPES.PROTEIN].atomCount, 2);
  assert.equal(partitions[SCENE_OBJECT_TYPES.LIGAND].atomCount, 1);
  assert.equal(partitions[SCENE_OBJECT_TYPES.WATER].atomCount, 1);
  assert.equal(partitions[SCENE_OBJECT_TYPES.METAL_IONS].atomCount, 1);

  assert.deepEqual(partitions[SCENE_OBJECT_TYPES.PROTEIN].molData.bonds, [[0, 1]]);
  assert.deepEqual(partitions[SCENE_OBJECT_TYPES.LIGAND].molData.bonds, []);
});

test("createSceneGraphFromMolData assigns default representation styles", () => {
  const graph = createSceneGraphFromMolData(makeMixedMolData(), { sourceKind: "pdb" });
  assert.equal(graph.objects.length, 4);

  const protein = graph.objects.find((o) => o.type === SCENE_OBJECT_TYPES.PROTEIN);
  const ligand = graph.objects.find((o) => o.type === SCENE_OBJECT_TYPES.LIGAND);
  const water = graph.objects.find((o) => o.type === SCENE_OBJECT_TYPES.WATER);
  const metal = graph.objects.find((o) => o.type === SCENE_OBJECT_TYPES.METAL_IONS);
  assert.ok(protein);
  assert.ok(ligand);
  assert.ok(water);
  assert.ok(metal);

  assert.equal(protein.representations[0].display.style, "cartoon");
  assert.equal(ligand.representations[0].display.style, "stick");
  assert.equal(water.representations[0].display.style, "vdw");
  assert.equal(metal.representations[0].display.style, "vdw");
  assert.equal(water.representations[0].name, "Spacefill");
  assert.equal(metal.representations[0].name, "Spacefill");
  assert.equal(protein.representations[0].material.mode, "metallic");

  assert.equal(graph.selection.kind, "object");
});

test("non-PDB sources classify everything as ligand", () => {
  const graph = createSceneGraphFromMolData(makeMixedMolData(), { sourceKind: "sdf" });
  assert.equal(graph.objects.length, 1);
  assert.equal(graph.objects[0].type, SCENE_OBJECT_TYPES.LIGAND);
  assert.equal(graph.objects[0].atomCount, 5);
});

test("visibility controls affect visible representation list", () => {
  const graph = createSceneGraphFromMolData(makeMixedMolData(), { sourceKind: "pdb" });
  const protein = graph.objects.find((o) => o.type === SCENE_OBJECT_TYPES.PROTEIN);

  const allVisible = listVisibleRepresentations(graph);
  assert.equal(allVisible.length, 4);

  toggleRepresentationVisibility(graph, protein.id, protein.representations[0].id, false);
  assert.equal(listVisibleRepresentations(graph).length, 3);

  toggleObjectVisibility(graph, protein.id, false);
  assert.equal(listVisibleRepresentations(graph).length, 3);
});

test("can add and update representations", () => {
  const graph = createSceneGraphFromMolData(makeMixedMolData(), { sourceKind: "pdb" });
  const protein = graph.objects.find((o) => o.type === SCENE_OBJECT_TYPES.PROTEIN);

  const rep = addRepresentationToObject(graph, protein.id);
  assert.equal(protein.representations.length, 2);
  assert.equal(rep.display.style, "cartoon");

  updateRepresentation(graph, protein.id, rep.id, {
    name: "Surface",
    display: {
      style: "ses",
      probeRadius: 1.8,
      surfaceResolution: 0.2,
      smoothNormals: true
    },
    material: {
      mode: "surface-glass",
      useImportedColor: false,
      baseColor: [0.5, 0.6, 0.7],
      surfaceIor: 1.45,
      surfaceTransmission: 0.4,
      surfaceOpacity: 0.1
    }
  });

  const updated = protein.representations.find((r) => r.id === rep.id);
  assert.equal(updated.name, "Surface");
  assert.equal(updated.display.style, "ses");
  assert.equal(updated.material.mode, "surface-glass");

  selectRepresentation(graph, protein.id, rep.id);
  assert.equal(graph.selection.kind, "representation");
  assert.equal(graph.selection.representationId, rep.id);
});
