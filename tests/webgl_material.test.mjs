import test from "node:test";
import assert from "node:assert/strict";
import { __test__mapMaterialMode, __test__mapEdgeAccentMode } from "../src/webgl.js";

test("material mode mapping includes translucent plastic", () => {
  assert.equal(__test__mapMaterialMode("metallic"), 0);
  assert.equal(__test__mapMaterialMode("matte"), 1);
  assert.equal(__test__mapMaterialMode("surface-glass"), 2);
  assert.equal(__test__mapMaterialMode("translucent-plastic"), 3);
  assert.equal(__test__mapMaterialMode(3), 3);
});

test("edge accent mode mapping includes grazing angle", () => {
  assert.equal(__test__mapEdgeAccentMode("screen-space"), 0);
  assert.equal(__test__mapEdgeAccentMode("grazing-angle"), 1);
  assert.equal(__test__mapEdgeAccentMode(1), 1);
  assert.equal(__test__mapEdgeAccentMode("invalid"), 0);
});
