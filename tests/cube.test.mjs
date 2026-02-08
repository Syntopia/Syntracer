import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { parseCubeFile } from "../src/cube.js";

test("parseCubeFile parses molecule and volume grid from cube file", () => {
  const cubeText = readFileSync("tests/hf_total_density.cube", "utf8");
  const parsed = parseCubeFile(cubeText);

  assert.ok(parsed);
  assert.ok(parsed.molData);
  assert.ok(parsed.volumeData);
  assert.equal(parsed.molData.atoms.length, 6);
  assert.equal(parsed.volumeData.dims.length, 3);
  assert.deepEqual(parsed.volumeData.dims, [30, 30, 30]);
  assert.equal(parsed.volumeData.units, "angstrom");

  const c0 = parsed.molData.atoms[0];
  const c1 = parsed.molData.atoms[1];
  const dx = c1.position[0] - c0.position[0];
  const dy = c1.position[1] - c0.position[1];
  const dz = c1.position[2] - c0.position[2];
  const ccDistance = Math.sqrt(dx * dx + dy * dy + dz * dz);
  assert.ok(Math.abs(ccDistance - 1.339) < 0.05, `Unexpected C-C distance: ${ccDistance}`);

  assert.ok(parsed.molData.bonds.length > 0, "Cube molecule should get inferred bonds.");
  assert.ok(parsed.volumeData.maxValue > parsed.volumeData.minValue);
  assert.ok(parsed.volumeData.bounds.maxX > parsed.volumeData.bounds.minX);
  assert.ok(parsed.volumeData.bounds.maxY > parsed.volumeData.bounds.minY);
  assert.ok(parsed.volumeData.bounds.maxZ > parsed.volumeData.bounds.minZ);
});

test("parseCubeFile fails for multi-value datasets", () => {
  const cube = [
    "CUBE TEST",
    "multi value",
    " 1 0.0 0.0 0.0 2",
    " 2 1.0 0.0 0.0",
    " 2 0.0 1.0 0.0",
    " 2 0.0 0.0 1.0",
    " 1 0.0 0.0 0.0 0.0",
    " 0.1 0.2 0.3 0.4 0.5 0.6 0.7 0.8",
    ""
  ].join("\n");

  assert.throws(
    () => parseCubeFile(cube),
    /multi-value grids are not supported/i
  );
});

test("parseCubeFile reorders voxel values from cube order (z-fastest) to internal x-fastest layout", () => {
  const cube = [
    "CUBE TEST",
    "voxel order",
    " 1 0.0 0.0 0.0",
    " -2 1.0 0.0 0.0",
    " -2 0.0 2.0 0.0",
    " -3 0.0 0.0 3.0",
    " 1 0.0 0.0 0.0 0.0",
    " 0 1 2 3 4 5 6 7 8 9 10 11",
    ""
  ].join("\n");

  const parsed = parseCubeFile(cube);
  const [nx, ny, nz] = parsed.volumeData.dims;
  assert.deepEqual([nx, ny, nz], [2, 2, 3]);

  const idx = (x, y, z) => x + y * nx + z * nx * ny;
  assert.equal(parsed.volumeData.data[idx(0, 0, 0)], 0);
  assert.equal(parsed.volumeData.data[idx(0, 0, 1)], 1);
  assert.equal(parsed.volumeData.data[idx(0, 0, 2)], 2);
  assert.equal(parsed.volumeData.data[idx(1, 0, 0)], 6);
  assert.equal(parsed.volumeData.data[idx(1, 1, 1)], 10);
  assert.equal(parsed.volumeData.data[idx(1, 1, 2)], 11);
});
