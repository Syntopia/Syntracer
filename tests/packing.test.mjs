import test from "node:test";
import assert from "node:assert/strict";
import { packTriFlags } from "../src/packing.js";

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
