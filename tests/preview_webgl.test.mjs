import test from "node:test";
import assert from "node:assert/strict";

import {
  sortTransparentIndicesByCameraDepth,
  choosePreviewVolumeTechnique,
  normalizePreviewQualitySettings
} from "../src/preview_webgl.js";

test("sortTransparentIndicesByCameraDepth sorts triangles back-to-front", () => {
  const positions = new Float32Array([
    // Near triangle around z=1
    0, 0, 1,
    1, 0, 1,
    0, 1, 1,
    // Far triangle around z=5
    0, 0, 5,
    1, 0, 5,
    0, 1, 5
  ]);
  const transparentIndices = new Uint32Array([
    0, 1, 2,
    3, 4, 5
  ]);

  const sorted = sortTransparentIndicesByCameraDepth(positions, transparentIndices, [0, 0, 0]);
  assert.deepEqual(Array.from(sorted), [3, 4, 5, 0, 1, 2]);
});

test("sortTransparentIndicesByCameraDepth validates index multiple-of-3", () => {
  assert.throws(
    () => sortTransparentIndicesByCameraDepth(new Float32Array([0, 0, 0]), new Uint32Array([0, 1]), [0, 0, 0]),
    /multiple of 3/
  );
});

test("choosePreviewVolumeTechnique switches between slice and raymarch", () => {
  assert.equal(choosePreviewVolumeTechnique(true), 1);
  assert.equal(choosePreviewVolumeTechnique(false), 0);
});

test("normalizePreviewQualitySettings applies defaults", () => {
  const settings = normalizePreviewQualitySettings(undefined);
  assert.deepEqual(settings, {
    shadows: true,
    ssr: false,
    edgeAccentStrength: 0.0,
    lightIntensityScale: 1.0
  });
});

test("normalizePreviewQualitySettings clamps values", () => {
  const settings = normalizePreviewQualitySettings({
    shadows: false,
    ssr: "yes",
    edgeAccentStrength: 99,
    lightIntensityScale: 99
  });
  assert.deepEqual(settings, {
    shadows: false,
    ssr: true,
    edgeAccentStrength: 1.0,
    lightIntensityScale: 3.0
  });
});
