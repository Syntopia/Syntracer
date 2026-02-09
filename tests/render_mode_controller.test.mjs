import test from "node:test";
import assert from "node:assert/strict";

import { createRenderModeController, modeLabel, RENDER_MODES } from "../src/render_mode_controller.js";

test("render mode controller toggles between pathtracing and preview", () => {
  const controller = createRenderModeController();
  assert.equal(controller.getMode(), RENDER_MODES.PATHTRACING);
  assert.equal(controller.isPreview(), false);

  assert.equal(controller.toggleMode(), RENDER_MODES.PREVIEW);
  assert.equal(controller.getMode(), RENDER_MODES.PREVIEW);
  assert.equal(controller.isPreview(), true);

  assert.equal(controller.toggleMode(), RENDER_MODES.PATHTRACING);
  assert.equal(controller.getMode(), RENDER_MODES.PATHTRACING);
  assert.equal(controller.isPreview(), false);
});

test("render mode controller validates explicit mode set", () => {
  const controller = createRenderModeController(RENDER_MODES.PREVIEW);
  assert.equal(controller.getMode(), RENDER_MODES.PREVIEW);
  assert.equal(controller.setMode(RENDER_MODES.PREVIEW), false);
  assert.equal(modeLabel(controller.getMode()), "Preview (Raster)");
  assert.equal(controller.setMode(RENDER_MODES.PATHTRACING), true);
  assert.equal(modeLabel(controller.getMode()), "Pathtracing");
  assert.throws(() => controller.setMode("bad-mode"), /Unknown render mode/);
});
