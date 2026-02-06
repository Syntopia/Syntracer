import test from "node:test";
import assert from "node:assert/strict";
import { buildNitrogenDensityVolume } from "../src/volume.js";

test("buildNitrogenDensityVolume creates a grid centered on nitrogen atoms", () => {
  const molData = {
    atoms: [
      { element: "N", position: [0, 0, 0] },
      { element: "C", position: [5, 0, 0] }
    ]
  };

  const volume = buildNitrogenDensityVolume(molData, {
    spacing: 1.0,
    gaussianScale: 3.0,
    cutoffSigma: 2.0,
    maxVoxels: 1_000_000
  });

  assert.ok(volume.data.length > 0, "Volume data should not be empty");
  assert.equal(volume.dims.length, 3, "Volume dims should have length 3");
  assert.ok(volume.maxValue > 0, "Volume max should be positive");

  const [nx, ny, nz] = volume.dims;
  const ix = Math.round((0 - volume.origin[0]) / volume.spacing[0]);
  const iy = Math.round((0 - volume.origin[1]) / volume.spacing[1]);
  const iz = Math.round((0 - volume.origin[2]) / volume.spacing[2]);

  assert.ok(ix >= 0 && ix < nx, "Center x index should be within grid");
  assert.ok(iy >= 0 && iy < ny, "Center y index should be within grid");
  assert.ok(iz >= 0 && iz < nz, "Center z index should be within grid");

  const centerIdx = ix + iy * nx + iz * nx * ny;
  const centerValue = volume.data[centerIdx];

  assert.ok(centerValue > 0, "Center voxel should have density");
  assert.ok(
    centerValue >= volume.maxValue * 0.9,
    "Center voxel should be near max density"
  );
});

test("buildNitrogenDensityVolume throws when no nitrogen atoms exist", () => {
  const molData = {
    atoms: [{ element: "C", position: [0, 0, 0] }]
  };

  assert.throws(
    () => buildNitrogenDensityVolume(molData, { spacing: 1.0 }),
    /No nitrogen atoms/,
    "Should throw when no N atoms are present"
  );
});
