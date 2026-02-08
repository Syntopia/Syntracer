import test from "node:test";
import assert from "node:assert/strict";

import {
  SCENE_OBJECT_TYPES,
  createSceneGraphFromMolData,
  appendSceneGraphFromMolData,
  listVisibleRepresentations,
  toggleObjectVisibility,
  toggleRepresentationVisibility,
  addRepresentationToObject,
  updateRepresentation,
  selectRepresentation,
  partitionMolDataByType,
  displayStylesForObjectType
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

test("scene graph can include volume objects with default volumetric representation", () => {
  const volumeData = {
    data: new Float32Array(8),
    dims: [2, 2, 2],
    origin: [0, 0, 0],
    spacing: [1, 1, 1],
    minValue: 0,
    maxValue: 1,
    bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
    version: 1
  };

  const graph = createSceneGraphFromMolData(makeMixedMolData(), {
    sourceKind: "sdf",
    volumeGrids: [volumeData]
  });
  const volumeObject = graph.objects.find((o) => o.type === SCENE_OBJECT_TYPES.VOLUME);
  assert.ok(volumeObject);
  assert.equal(volumeObject.label, "Volume (2x2x2)");
  assert.equal(volumeObject.representations[0].display.style, "volumetric");
  assert.equal(volumeObject.representations[0].name, "Volumetric");
  assert.deepEqual(volumeObject.representations[0].display.isoPositiveColor, [0.15, 0.85, 0.2]);
  assert.deepEqual(volumeObject.representations[0].display.isoNegativeColor, [0.9, 0.2, 0.2]);
});

test("display style availability is restricted by object type", () => {
  assert.deepEqual(
    displayStylesForObjectType(SCENE_OBJECT_TYPES.VOLUME),
    ["isosurface", "volumetric"]
  );
  assert.ok(displayStylesForObjectType(SCENE_OBJECT_TYPES.LIGAND).includes("stick"));
  assert.ok(!displayStylesForObjectType(SCENE_OBJECT_TYPES.LIGAND).includes("volumetric"));
});

test("appendSceneGraphFromMolData appends objects and advances ids", () => {
  const graph = createSceneGraphFromMolData(makeMixedMolData(), { sourceKind: "sdf" });
  const initialObjectCount = graph.objects.length;
  const initialNextObjectId = graph.nextObjectId;
  const initialNextRepId = graph.nextRepId;

  const appendedIds = appendSceneGraphFromMolData(
    graph,
    {
      atoms: [
        { element: "O", isHet: true, resName: "HOH", position: [10, 0, 0] }
      ],
      bonds: [],
      secondary: { helices: [], sheets: [] }
    },
    { sourceKind: "pdb" }
  );

  assert.equal(appendedIds.length, 1);
  assert.equal(graph.objects.length, initialObjectCount + 1);
  const appended = graph.objects[graph.objects.length - 1];
  assert.equal(appended.id, `obj-${initialNextObjectId}`);
  assert.equal(appended.representations[0].id, `rep-${initialNextRepId}`);
  assert.equal(graph.nextObjectId, initialNextObjectId + 1);
  assert.equal(graph.nextRepId, initialNextRepId + 1);
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
      opacity: 0.45,
      surfaceIor: 1.45,
      surfaceTransmission: 0.4,
      surfaceOpacity: 0.1
    }
  });

  const updated = protein.representations.find((r) => r.id === rep.id);
  assert.equal(updated.name, "Surface");
  assert.equal(updated.display.style, "ses");
  assert.equal(updated.material.mode, "surface-glass");
  assert.equal(updated.material.opacity, 0.45);

  selectRepresentation(graph, protein.id, rep.id);
  assert.equal(graph.selection.kind, "representation");
  assert.equal(graph.selection.representationId, rep.id);
});
