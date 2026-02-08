import test from "node:test";
import assert from "node:assert/strict";
import {
  ANALYTIC_SKY_ID,
  UNIFORM_ENV_ID,
  analyticSkyCacheKey,
  uniformEnvCacheKey,
  computeSunDirection,
  normalizeAnalyticSkySettings,
  normalizeUniformEnvSettings,
  generateUniformEnvironment
} from "../src/analytic_sky.js";

test("analytic sky identifier is stable", () => {
  assert.equal(ANALYTIC_SKY_ID, "analytic://preetham-perez");
});

test("uniform environment identifier is stable", () => {
  assert.equal(UNIFORM_ENV_ID, "analytic://uniform");
});

test("analytic sky cache key changes when settings change", () => {
  const keyA = analyticSkyCacheKey({
    width: 1024,
    height: 512,
    turbidity: 2.5,
    sunAzimuthDeg: 30,
    sunElevationDeg: 35
  });
  const keyB = analyticSkyCacheKey({
    width: 1024,
    height: 512,
    turbidity: 3.0,
    sunAzimuthDeg: 30,
    sunElevationDeg: 35
  });
  assert.notEqual(keyA, keyB);
});

test("analytic sky settings reject invalid ranges", () => {
  assert.throws(
    () => normalizeAnalyticSkySettings({ width: 0, height: 512 }),
    /width/i
  );
  assert.throws(
    () => normalizeAnalyticSkySettings({ turbidity: 50 }),
    /turbidity/i
  );
  assert.throws(
    () => normalizeAnalyticSkySettings({ sunAngularRadiusDeg: -1 }),
    /angular radius/i
  );
});

test("sun direction is normalized", () => {
  const dir = computeSunDirection(45, 25);
  const len = Math.hypot(dir[0], dir[1], dir[2]);
  assert(Math.abs(len - 1) < 1e-6);
});

test("uniform environment settings validate color range and cache key changes", () => {
  assert.throws(
    () => normalizeUniformEnvSettings({ color: [1.2, 0, 0] }),
    /component/i
  );
  const keyA = uniformEnvCacheKey({ color: [1, 1, 1] });
  const keyB = uniformEnvCacheKey({ color: [0.5, 1, 1] });
  assert.notEqual(keyA, keyB);
});

test("uniform environment generator fills RGBA texture data", async () => {
  const env = await generateUniformEnvironment({
    width: 4,
    height: 2,
    color: [0.25, 0.5, 0.75]
  });
  assert.equal(env.source, UNIFORM_ENV_ID);
  assert.equal(env.width, 4);
  assert.equal(env.height, 2);
  assert.equal(env.data.length, 4 * 2 * 4);
  for (let i = 0; i < env.data.length; i += 4) {
    assert.equal(env.data[i], 0.25);
    assert.equal(env.data[i + 1], 0.5);
    assert.equal(env.data[i + 2], 0.75);
    assert.equal(env.data[i + 3], 1.0);
  }
});
