import test from "node:test";
import assert from "node:assert/strict";
import {
  __test__buildResidues,
  __test__computeSheetStrandDiagnostics,
  __test__computeSheetNormals,
  buildBackboneCartoon
} from "../src/cartoon.js";

function makeResidueAtoms(index) {
  const baseX = index * 3.8;
  const chainId = "A";
  const resSeq = index + 1;
  const resName = "ALA";

  return [
    {
      serial: index * 4 + 1,
      name: "N",
      element: "N",
      position: [baseX - 1.3, 0.2, 0.0],
      isHet: false,
      altLoc: "",
      resName,
      chainId,
      resSeq,
      iCode: "",
      occupancy: 1.0
    },
    {
      serial: index * 4 + 2,
      name: "CA",
      element: "C",
      position: [baseX, 0.0, 0.0],
      isHet: false,
      altLoc: "",
      resName,
      chainId,
      resSeq,
      iCode: "",
      occupancy: 1.0
    },
    {
      serial: index * 4 + 3,
      name: "C",
      element: "C",
      position: [baseX + 1.5, -0.2, 0.0],
      isHet: false,
      altLoc: "",
      resName,
      chainId,
      resSeq,
      iCode: "",
      occupancy: 1.0
    },
    {
      serial: index * 4 + 4,
      name: "O",
      element: "O",
      position: [baseX + 2.5, -0.3, 0.1],
      isHet: false,
      altLoc: "",
      resName,
      chainId,
      resSeq,
      iCode: "",
      occupancy: 1.0
    }
  ];
}

function makeSheetResidueAtoms(index, chainId, y) {
  const caX = index * 2.6;
  const resSeq = index + 1;
  const resName = "VAL";
  const oYOffset = chainId === "A" ? 0.9 : -0.9;

  return [
    {
      serial: 1000 + index * 10 + (chainId === "A" ? 1 : 101),
      name: "N",
      element: "N",
      position: [caX - 0.6, y, 0.0],
      isHet: false,
      altLoc: "",
      resName,
      chainId,
      resSeq,
      iCode: "",
      occupancy: 1.0
    },
    {
      serial: 1000 + index * 10 + (chainId === "A" ? 2 : 102),
      name: "CA",
      element: "C",
      position: [caX, y, 0.0],
      isHet: false,
      altLoc: "",
      resName,
      chainId,
      resSeq,
      iCode: "",
      occupancy: 1.0
    },
    {
      serial: 1000 + index * 10 + (chainId === "A" ? 3 : 103),
      name: "C",
      element: "C",
      position: [caX + 0.6, y, 0.0],
      isHet: false,
      altLoc: "",
      resName,
      chainId,
      resSeq,
      iCode: "",
      occupancy: 1.0
    },
    {
      serial: 1000 + index * 10 + (chainId === "A" ? 4 : 104),
      name: "O",
      element: "O",
      position: [caX + 1.0, y + oYOffset, 0.0],
      isHet: false,
      altLoc: "",
      resName,
      chainId,
      resSeq,
      iCode: "",
      occupancy: 1.0
    }
  ];
}

function makeSheetResidueAtoms3D(index, chainId, y, z) {
  const atoms = makeSheetResidueAtoms(index, chainId, y);
  for (const atom of atoms) {
    atom.position = [atom.position[0], atom.position[1], z];
  }
  return atoms;
}

function normalize(v) {
  const len = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
  if (len < 1e-8) return [0, 0, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function dot(a, b) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

test("buildBackboneCartoon creates mesh for a simple backbone", () => {
  const atoms = [];
  for (let i = 0; i < 6; i += 1) {
    atoms.push(...makeResidueAtoms(i));
  }

  const molData = { atoms, bonds: [] };
  const mesh = buildBackboneCartoon(molData);

  assert(mesh.positions.length > 0, "Positions should be populated");
  assert(mesh.indices.length > 0, "Indices should be populated");
  assert.equal(mesh.normals.length, mesh.positions.length, "Normals should match positions");
  assert.equal(mesh.triColors.length, (mesh.indices.length / 3) * 3, "triColors should match triangle count");
});

test("buildBackboneCartoon throws when backbone atoms are missing", () => {
  const atoms = makeResidueAtoms(0).filter((atom) => atom.name !== "O");
  const molData = { atoms, bonds: [] };
  assert.throws(() => buildBackboneCartoon(molData), /backbone atoms/i);
});

test("sheet normals stay orthogonal to explicit H-bond directions", () => {
  const atoms = [];
  atoms.push(...makeSheetResidueAtoms(0, "A", 0.0));
  atoms.push(...makeSheetResidueAtoms(1, "A", 0.0));
  atoms.push(...makeSheetResidueAtoms(0, "B", 3.2));
  atoms.push(...makeSheetResidueAtoms(1, "B", 3.2));

  const residues = __test__buildResidues(atoms);
  residues.forEach((residue, index) => {
    residue.index = index;
  });

  const ss = new Array(residues.length).fill("E");
  const hbonds = Array.from({ length: residues.length }, () => new Set());
  // Explicit inter-strand H-bonds. Nearby non-H-bond O/N contacts are intentionally present.
  hbonds[0].add(2);
  hbonds[1].add(3);

  const normals = __test__computeSheetNormals(residues, ss, hbonds);
  for (const n of normals) {
    assert(n, "Expected a sheet normal for each residue");
  }

  const hbondDirs = [
    normalize([
      residues[2].atoms.N.position[0] - residues[0].atoms.O.position[0],
      residues[2].atoms.N.position[1] - residues[0].atoms.O.position[1],
      residues[2].atoms.N.position[2] - residues[0].atoms.O.position[2]
    ]),
    normalize([
      residues[3].atoms.N.position[0] - residues[1].atoms.O.position[0],
      residues[3].atoms.N.position[1] - residues[1].atoms.O.position[1],
      residues[3].atoms.N.position[2] - residues[1].atoms.O.position[2]
    ])
  ];

  for (const n of normals) {
    const nn = normalize(n);
    for (const h of hbondDirs) {
      assert(Math.abs(dot(nn, h)) < 0.15, "Sheet normal should stay orthogonal to inter-strand H-bonds");
    }
  }
});

test("sheet strand diagnostics report per-strand H-bond counts and angles", () => {
  const atoms = [];
  atoms.push(...makeSheetResidueAtoms(0, "A", 0.0));
  atoms.push(...makeSheetResidueAtoms(1, "A", 0.0));
  atoms.push(...makeSheetResidueAtoms(0, "B", 3.2));
  atoms.push(...makeSheetResidueAtoms(1, "B", 3.2));

  const residues = __test__buildResidues(atoms);
  residues.forEach((residue, index) => {
    residue.index = index;
  });

  const ss = new Array(residues.length).fill("E");
  const hbonds = Array.from({ length: residues.length }, () => new Set());
  hbonds[0].add(2);
  hbonds[1].add(3);

  const sheetNormals = __test__computeSheetNormals(residues, ss, hbonds);
  const segments = [
    { type: "E", residues: [residues[0], residues[1]] },
    { type: "E", residues: [residues[2], residues[3]] }
  ];

  const diagnostics = __test__computeSheetStrandDiagnostics(residues, ss, hbonds, sheetNormals, segments);
  assert.equal(diagnostics.length, 2, "Expected diagnostics for both strands");

  for (const diag of diagnostics) {
    assert(diag.totalCount >= 2, "Each strand should report directional distance contacts");
    assert.equal(diag.partnerResidueCount, 2, "Each strand should see both residues from the neighboring strand");
    assert(diag.angleCount >= 2, "Expected at least one angle per detected contact");
    assert(diag.angleMean > 70, "Mean angle should stay near orthogonal");
    assert(diag.angleMean < 110, "Mean angle should stay near orthogonal");
  }
});

test("sheet orientation uses distance contacts even when DSSP hbond map is empty", () => {
  const atoms = [];
  atoms.push(...makeSheetResidueAtoms(0, "A", 0.0));
  atoms.push(...makeSheetResidueAtoms(1, "A", 0.0));
  atoms.push(...makeSheetResidueAtoms(0, "B", 3.2));
  atoms.push(...makeSheetResidueAtoms(1, "B", 3.2));

  const residues = __test__buildResidues(atoms);
  residues.forEach((residue, index) => {
    residue.index = index;
  });

  const ss = new Array(residues.length).fill("E");
  const emptyHBonds = Array.from({ length: residues.length }, () => new Set());
  const sheetNormals = __test__computeSheetNormals(residues, ss, emptyHBonds);
  const segments = [
    { type: "E", residues: [residues[0], residues[1]] },
    { type: "E", residues: [residues[2], residues[3]] }
  ];
  const diagnostics = __test__computeSheetStrandDiagnostics(
    residues,
    ss,
    emptyHBonds,
    sheetNormals,
    segments
  );

  for (const diag of diagnostics) {
    assert(diag.totalCount > 0, "Distance contacts should be reported even with empty DSSP hbonds");
    assert(diag.angleCount > 0, "Expected angle diagnostics from distance contacts");
  }
});

test("sheet normals are computed per strand, not as one sheet-wide average", () => {
  const atoms = [];
  // Strand pair 1: contacts primarily along +Y
  atoms.push(...makeSheetResidueAtoms3D(0, "A", 0.0, 0.0));
  atoms.push(...makeSheetResidueAtoms3D(1, "A", 0.0, 0.0));
  atoms.push(...makeSheetResidueAtoms3D(0, "B", 3.2, 0.0));
  atoms.push(...makeSheetResidueAtoms3D(1, "B", 3.2, 0.0));
  // Strand pair 2: contacts primarily along +Z
  // Use much larger residue indices to shift this group in +X and avoid cross-contacts.
  atoms.push(...makeSheetResidueAtoms3D(20, "C", 0.0, 0.0));
  atoms.push(...makeSheetResidueAtoms3D(21, "C", 0.0, 0.0));
  atoms.push(...makeSheetResidueAtoms3D(20, "D", 0.0, 3.2));
  atoms.push(...makeSheetResidueAtoms3D(21, "D", 0.0, 3.2));

  const residues = __test__buildResidues(atoms);
  residues.forEach((residue, index) => {
    residue.index = index;
  });

  const ss = new Array(residues.length).fill("E");
  const emptyHBonds = Array.from({ length: residues.length }, () => new Set());
  const normals = __test__computeSheetNormals(residues, ss, emptyHBonds);

  const nA = normalize(normals[0]);
  const nC = normalize(normals[4]);
  const alignment = Math.abs(dot(nA, nC));
  assert(alignment < 0.8, "Different strand neighborhoods should produce different strand normals");
});
