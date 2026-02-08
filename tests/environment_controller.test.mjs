import test from "node:test";
import assert from "node:assert/strict";
import { createEnvironmentController } from "../src/environment_controller.js";

function createDeps(overrides = {}) {
  const messages = [];
  const loadingStates = [];
  const renderState = {
    envUrl: null,
    envCacheKey: null,
    envData: null,
    envIntensity: 0.1,
    envRotationDeg: 0,
    envRotationVerticalDeg: 0,
    envMaxLuminance: 50
  };
  const deps = {
    envSelect: { value: "" },
    envIntensityInput: { value: "0.25" },
    envUniformColorInput: { value: "#ffffff" },
    envRotationInput: { value: "45" },
    envRotationVerticalInput: { value: "-30" },
    envMaxLumInput: { value: "120" },
    analyticSkyResolutionSelect: { value: "1024x512" },
    analyticSkyTurbidityInput: { value: "2.5" },
    analyticSkySunAzimuthInput: { value: "0" },
    analyticSkySunElevationInput: { value: "30" },
    analyticSkyIntensityInput: { value: "1.0" },
    analyticSkySunIntensityInput: { value: "20" },
    analyticSkySunRadiusInput: { value: "0.27" },
    analyticSkyGroundAlbedoInput: { value: "0.2" },
    analyticSkyHorizonSoftnessInput: { value: "0.1" },
    renderState,
    envCache: new Map(),
    logger: { info() {}, error() {} },
    clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
    requireNumberInput(input, label) {
      const value = Number(input?.value);
      if (!Number.isFinite(value)) {
        throw new Error(`${label} must be a finite number.`);
      }
      return value;
    },
    setLoadingOverlay(visible) {
      loadingStates.push(Boolean(visible));
    },
    resetAccumulation(message) {
      messages.push(message);
    },
    createEnvTexture() {
      throw new Error("createEnvTexture should not be called in this test.");
    },
    createCdfTexture() {
      throw new Error("createCdfTexture should not be called in this test.");
    },
    getGlState() {
      return null;
    }
  };
  return {
    deps: { ...deps, ...overrides },
    renderState,
    messages,
    loadingStates
  };
}

test("updateEnvironmentState applies intensity, rotation, and max luminance", async () => {
  const { deps, renderState, messages, loadingStates } = createDeps();
  const controller = createEnvironmentController(deps);

  await controller.updateEnvironmentState();

  assert.equal(renderState.envIntensity, 0.25);
  assert.equal(renderState.envRotationDeg, 45);
  assert.equal(renderState.envRotationVerticalDeg, -30);
  assert.equal(renderState.envMaxLuminance, 120);
  assert.deepEqual(loadingStates, [true, false]);
  assert.equal(messages.at(-1), "Environment settings updated.");
});

test("updateEnvironmentState clamps environment rotation to slider bounds", async () => {
  const { deps, renderState } = createDeps({
    envRotationInput: { value: "500" }
  });
  const controller = createEnvironmentController(deps);

  await controller.updateEnvironmentState();

  assert.equal(renderState.envRotationDeg, 180);
  assert.equal(renderState.envRotationVerticalDeg, -30);
});

test("updateEnvironmentState clamps vertical environment rotation to slider bounds", async () => {
  const { deps, renderState } = createDeps({
    envRotationVerticalInput: { value: "-999" }
  });
  const controller = createEnvironmentController(deps);

  await controller.updateEnvironmentState();

  assert.equal(renderState.envRotationVerticalDeg, -180);
});
