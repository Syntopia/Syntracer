import test from "node:test";
import assert from "node:assert/strict";
import {
  packBvhNodes,
  packTriangles,
  packTriColors,
  packTriIndices,
  computeLayoutForTests
} from "../src/packing.js";

const simpleNodes = [
  {
    bounds: { minX: 0, minY: 0, minZ: 0, maxX: 1, maxY: 1, maxZ: 1 },
    leftFirst: 0,
    primCount: 1,
    rightChild: 0,
    triIndices: [0]
  }
];

const tris = [[0, 1, 2]];
const positions = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]);


test("compute layout respects max size", () => {
  const layout = computeLayoutForTests(10, 8, 4);
  assert.equal(layout.width, 4);
  assert.equal(layout.height, 3);
});

test("packBvhNodes encodes node texels", () => {
  const packed = packBvhNodes(simpleNodes, 64);
  assert.equal(packed.width * packed.height * 4, packed.data.length);
  assert.equal(packed.texelsPerNode, 3);
  assert.equal(packed.data[0], 0);
  assert.equal(packed.data[3], 0);
  assert.equal(packed.data[7], 1);
});

test("packTriangles expands triangles", () => {
  const packed = packTriangles(tris, positions, 64);
  assert.equal(packed.texelsPerTri, 3);
  assert.equal(packed.data[0], 0);
  assert.equal(packed.data[4], 1);
  assert.equal(packed.data[8], 0);
});

test("packTriIndices packs indices into texels", () => {
  const packed = packTriIndices(new Uint32Array([2, 5, 7]), 64);
  assert.equal(packed.data[0], 2);
  assert.equal(packed.data[4], 5);
  assert.equal(packed.data[8], 7);
});

test("packTriColors packs per-triangle colors", () => {
  const colors = new Float32Array([1, 0.5, 0.25, 0.1, 0.2, 0.3]);
  const packed = packTriColors(colors, 64);
  assert.ok(Math.abs(packed.data[0] - 1) < 1e-6);
  assert.ok(Math.abs(packed.data[1] - 0.5) < 1e-6);
  assert.ok(Math.abs(packed.data[2] - 0.25) < 1e-6);
  assert.ok(Math.abs(packed.data[4] - 0.1) < 1e-6);
  assert.ok(Math.abs(packed.data[5] - 0.2) < 1e-6);
  assert.ok(Math.abs(packed.data[6] - 0.3) < 1e-6);
});
