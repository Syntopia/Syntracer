import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parsePDB, parseAutoDetect, parseXYZ, splitMolDataByHetatm } from "../src/molecular.js";

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

test("parseAutoDetect handles cube files by returning molecule data", () => {
  const cubeText = readFileSync("tests/hf_total_density.cube", "utf8");
  const mol = parseAutoDetect(cubeText, "hf_total_density.cube");
  assert.equal(mol.atoms.length, 6);
  assert.ok(Array.isArray(mol.bonds));
});

test("parseXYZ parses XYZ atoms and infers bonds from distances", () => {
  const xyz = [
    "5",
    "methanol",
    "C 0.000 0.000 0.000",
    "O 1.430 0.000 0.000",
    "H -0.600 0.930 0.000",
    "H -0.600 -0.930 0.000",
    "H 1.900 0.820 0.000",
    ""
  ].join("\n");

  const mol = parseXYZ(xyz);
  assert.equal(mol.atoms.length, 5, "Should parse all atoms.");
  assert.equal(mol.atoms[1].element, "O", "Should preserve element symbols.");
  assert.ok(Array.isArray(mol.bonds), "Should expose bonds array.");
  assert.ok(mol.bonds.length >= 4, "Should infer expected covalent bonds.");
});

test("parseAutoDetect handles xyz extension by using XYZ parser", () => {
  const xyz = [
    "2",
    "hydrogen",
    "H 0.0 0.0 0.0",
    "H 0.74 0.0 0.0",
    ""
  ].join("\n");
  const mol = parseAutoDetect(xyz, "h2.xyz");
  assert.equal(mol.atoms.length, 2);
  assert.deepEqual(mol.bonds, [[0, 1]]);
});

test("parseXYZ rejects malformed XYZ input", () => {
  const invalid = [
    "2",
    "bad",
    "H 0.0 0.0",
    "H 0.74 0.0 0.0",
    ""
  ].join("\n");
  assert.throws(
    () => parseXYZ(invalid),
    /Invalid XYZ file: atom line 3 must include symbol and x\/y\/z\./
  );
});
