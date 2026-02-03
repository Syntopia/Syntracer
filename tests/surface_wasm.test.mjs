import test from "node:test";
import assert from "node:assert/strict";
import { packAtomsForWasm } from "../src/surface_wasm.js";

test("packAtomsForWasm flattens centers and radii", () => {
  const atoms = [
    { center: [1, 2, 3], radius: 1.5 },
    { center: [-1, 0, 4], radius: 2.0 }
  ];

  const { centers, radii } = packAtomsForWasm(atoms);

  assert.equal(centers.length, 6);
  assert.deepEqual(Array.from(centers), [1, 2, 3, -1, 0, 4]);
  assert.equal(radii.length, 2);
  assert.deepEqual(Array.from(radii), [1.5, 2.0]);
});
