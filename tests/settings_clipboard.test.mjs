import test from "node:test";
import assert from "node:assert/strict";

import { createSceneGraphFromMolData } from "../src/scene_graph.js";
import { RENDER_MODES } from "../src/render_mode_controller.js";
import {
  createSettingsClipboardPayload,
  parseSettingsClipboardText,
  applySettingsClipboardPayload,
  SETTINGS_CLIPBOARD_TYPE
} from "../src/settings_clipboard.js";

function makeMolData() {
  return {
    atoms: [
      { element: "C", isHet: true, resName: "LIG", position: [0, 0, 0] },
      { element: "O", isHet: true, resName: "LIG", position: [1, 0, 0] }
    ],
    bonds: [[0, 1]],
    secondary: { helices: [], sheets: [] }
  };
}

function makeRenderState() {
  return {
    renderScale: 1.0,
    fastScale: 0.25,
    useImportedColor: true,
    baseColor: [0.8, 0.8, 0.8],
    materialMode: "metallic",
    metallic: 0.0,
    roughness: 0.4,
    rimBoost: 0.2,
    opacity: 1.0,
    matteSpecular: 0.03,
    matteRoughness: 0.5,
    matteDiffuseRoughness: 0.5,
    wrapDiffuse: 0.2,
    surfaceIor: 1.0,
    surfaceTransmission: 0.35,
    surfaceOpacity: 0.0,
    maxBounces: 4,
    maxFrames: 100,
    exposure: 1.0,
    dofEnabled: false,
    dofAperture: 0.03,
    dofFocusDistance: 4.0,
    toneMap: "aces",
    edgeAccent: 0.5,
    edgeAccentMode: "screen-space",
    ambientIntensity: 0.0,
    ambientColor: [1, 1, 1],
    envUrl: "analytic://preetham-perez",
    envIntensity: 0.1,
    envBgIntensity: 0.3,
    envRotationDeg: 0.0,
    envRotationVerticalDeg: 0.0,
    envMaxLuminance: 200.0,
    samplesPerBounce: 1,
    castShadows: true,
    previewShadows: true,
    previewSsr: true,
    previewLightIntensity: 1.0,
    volumeEnabled: false,
    volumeColor: [0.4, 0.6, 1.0],
    volumeDensity: 1.0,
    volumeOpacity: 1.0,
    volumeStep: 0.5,
    volumeMaxSteps: 256,
    volumeThreshold: 0.0,
    lights: [
      { enabled: true, azimuth: -40, elevation: -30, intensity: 5.0, angle: 5, color: [1, 1, 1] },
      { enabled: true, azimuth: 40, elevation: 0, intensity: 0.6, angle: 50, color: [1, 1, 1] }
    ],
    clipEnabled: false,
    clipDistance: 0.0,
    clipLocked: false,
    visMode: 0
  };
}

test("settings payload roundtrips through JSON parser", () => {
  const sceneGraph = createSceneGraphFromMolData(makeMolData(), { sourceKind: "sdf" });
  const payload = createSettingsClipboardPayload({
    renderMode: RENDER_MODES.PATHTRACING,
    cameraState: {
      target: [1, 2, 3],
      distance: 7,
      rotation: [0, 0, 0, 1],
      fov: Math.PI / 3
    },
    renderState: makeRenderState(),
    sceneGraph,
    uiState: { environment: { envSelect: "analytic://preetham-perez" } }
  });
  assert.equal(payload.type, SETTINGS_CLIPBOARD_TYPE);
  const reparsed = parseSettingsClipboardText(JSON.stringify(payload));
  assert.equal(reparsed.renderMode, RENDER_MODES.PATHTRACING);
  assert.deepEqual(reparsed.cameraState.target, [1, 2, 3]);
  assert.equal(reparsed.sceneGraph.objects.length, 1);
  assert.equal(reparsed.uiState.environment.envSelect, "analytic://preetham-perez");
});

test("applySettingsClipboardPayload mutates camera/render and representation styles", () => {
  const sceneGraph = createSceneGraphFromMolData(makeMolData(), { sourceKind: "sdf" });
  const object = sceneGraph.objects[0];
  const rep = object.representations[0];
  const renderState = makeRenderState();
  const cameraState = {
    target: [0, 0, 0],
    distance: 3,
    rotation: [0, 0, 0, 1],
    fov: Math.PI / 4
  };

  const imported = createSettingsClipboardPayload({
    renderMode: RENDER_MODES.PREVIEW,
    cameraState: {
      target: [9, 8, 7],
      distance: 12,
      rotation: [0, 0.1, 0, 0.995],
      fov: Math.PI / 2.5
    },
    renderState: {
      ...makeRenderState(),
      exposure: 1.75,
      previewSsr: false,
      edgeAccent: 0.3
    },
    sceneGraph: {
      objects: [
        {
          id: object.id,
          index: 0,
          type: object.type,
          visible: true,
          expanded: true,
          representations: [
            {
              id: rep.id,
              index: 0,
              name: "Updated Style",
              visible: true,
              display: {
                ...rep.display,
                style: "vdw",
                atomScale: 1.3
              },
              material: {
                ...rep.material,
                mode: "surface-glass",
                opacity: 0.55,
                surfaceOpacity: 0.15
              }
            }
          ]
        }
      ]
    }
  });

  let mode = RENDER_MODES.PATHTRACING;
  const result = applySettingsClipboardPayload(imported, {
    cameraState,
    renderState,
    sceneGraph,
    setRenderMode: (nextMode) => {
      mode = nextMode;
      return true;
    }
  });

  assert.equal(mode, RENDER_MODES.PREVIEW);
  assert.deepEqual(cameraState.target, [9, 8, 7]);
  assert.equal(renderState.exposure, 1.75);
  assert.equal(renderState.previewSsr, false);
  assert.equal(renderState.edgeAccent, 0.3);
  assert.equal(object.representations[0].name, "Updated Style");
  assert.equal(object.representations[0].display.style, "vdw");
  assert.equal(object.representations[0].material.mode, "surface-glass");
  assert.equal(result.updatedRepresentations, 1);
  assert.deepEqual(result.updatedRepresentationIds, [rep.id]);
});

test("applySettingsClipboardPayload creates missing representations from snapshot", () => {
  const sceneGraph = createSceneGraphFromMolData(makeMolData(), { sourceKind: "sdf" });
  const object = sceneGraph.objects[0];
  const existingRep = object.representations[0];
  const renderState = makeRenderState();
  const cameraState = {
    target: [0, 0, 0],
    distance: 3,
    rotation: [0, 0, 0, 1],
    fov: Math.PI / 4
  };

  const imported = createSettingsClipboardPayload({
    renderMode: RENDER_MODES.PATHTRACING,
    cameraState,
    renderState,
    sceneGraph: {
      objects: [
        {
          id: object.id,
          index: 0,
          type: object.type,
          visible: true,
          expanded: true,
          representations: [
            {
              id: existingRep.id,
              index: 0,
              name: "Base",
              visible: true,
              display: existingRep.display,
              material: existingRep.material
            },
            {
              id: "rep-missing",
              index: 1,
              name: "Surface Added",
              visible: true,
              display: {
                ...existingRep.display,
                style: "ses",
                probeRadius: 1.8
              },
              material: {
                ...existingRep.material,
                mode: "matte",
                matteRoughness: 0.7
              }
            }
          ]
        }
      ]
    }
  });

  const result = applySettingsClipboardPayload(imported, {
    cameraState,
    renderState,
    sceneGraph,
    setRenderMode: () => true
  });

  assert.equal(object.representations.length, 2);
  assert.equal(object.representations[1].name, "Surface Added");
  assert.equal(object.representations[1].display.style, "ses");
  assert.equal(object.representations[1].material.mode, "matte");
  assert.equal(result.updatedRepresentations, 2);
  assert.equal(result.updatedRepresentationIds.length, 2);
});

test("parseSettingsClipboardText rejects unknown payload type", () => {
  assert.throws(
    () => parseSettingsClipboardText(JSON.stringify({ type: "wrong", version: 1 })),
    /Unsupported clipboard settings type/
  );
});
