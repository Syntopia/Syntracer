import test from "node:test";
import assert from "node:assert/strict";
import { parsePDB, splitMolDataByHetatm } from "../src/molecular.js";

test("parsePDB marks HETATM and splitMolDataByHetatm partitions atoms/bonds", () => {
  const pdb = [
    "ATOM      1  N   ALA A   1       0.000   0.000   0.000  1.00  0.00           N",
    "HETATM    2  C1  LIG A   2       1.000   0.000   0.000  1.00  0.00           C",
    "HETATM    3  O1  LIG A   2       1.500   0.000   0.000  1.00  0.00           O",
    "CONECT    2    3",
    ""
  ].join("\n");

  const mol = parsePDB(pdb);
  assert.equal(mol.atoms.length, 3, "Should parse 3 atoms");
  assert.equal(mol.atoms.filter((a) => a.isHet).length, 2, "Should mark 2 HETATM atoms");
  assert.equal(mol.atoms[0].resName, "ALA", "Should parse residue name");
  assert.equal(mol.atoms[0].chainId, "A", "Should parse chain ID");
  assert.equal(mol.atoms[0].resSeq, 1, "Should parse residue sequence");

  const split = splitMolDataByHetatm(mol);
  assert.equal(split.standard.atoms.length, 1, "Should have 1 standard atom");
  assert.equal(split.hetero.atoms.length, 2, "Should have 2 hetero atoms");
  assert.equal(split.hetero.bonds.length, 1, "Should keep hetero bonds");
  assert.equal(split.standard.bonds.length, 0, "Should have no standard bonds");
});

test("parsePDB captures HELIX and SHEET records", () => {
  const makeLine = (record) => {
    const line = Array(81).fill(" ");
    const put = (index, text) => {
      for (let i = 0; i < text.length; i += 1) {
        line[index + i] = text[i];
      }
    };
    put(0, record);
    return { line, put, toString: () => line.join("").trimEnd() };
  };

  const helix = makeLine("HELIX");
  helix.put(19, "A");
  helix.put(21, "1");
  helix.put(31, "A");
  helix.put(33, "5");

  const sheet = makeLine("SHEET");
  sheet.put(21, "A");
  sheet.put(22, "8");
  sheet.put(32, "A");
  sheet.put(33, "10");

  const pdb = [
    helix.toString(),
    sheet.toString(),
    "ATOM      1  N   ALA A   1       0.000   0.000   0.000  1.00  0.00           N",
    ""
  ].join("\n");

  const mol = parsePDB(pdb);
  assert.equal(mol.secondary.helices.length, 1, "Should parse one helix range");
  assert.equal(mol.secondary.sheets.length, 1, "Should parse one sheet range");
  assert.equal(mol.secondary.helices[0].chainId, "A", "Helix chain ID should match");
  assert.equal(mol.secondary.helices[0].startSeq, 1, "Helix start seq should match");
  assert.equal(mol.secondary.helices[0].endSeq, 5, "Helix end seq should match");
});
