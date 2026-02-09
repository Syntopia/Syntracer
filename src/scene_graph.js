const WATER_RESIDUES = new Set(["HOH", "WAT", "H2O"]);
const METAL_ELEMENTS = new Set([
  "LI", "NA", "K", "RB", "CS", "MG", "CA", "SR", "BA",
  "AL", "FE", "ZN", "CU", "MN", "CO", "NI", "CD", "HG",
  "CR", "V", "MO", "W", "TI", "AG", "AU", "PT", "PD", "PB"
]);

export const SCENE_OBJECT_TYPES = Object.freeze({
  PROTEIN: "protein",
  LIGAND: "ligand",
  WATER: "water",
  METAL_IONS: "metal-ions",
  VOLUME: "volume"
});

export const DISPLAY_STYLES = Object.freeze([
  "ball-and-stick",
  "vdw",
  "stick",
  "cartoon",
  "ses",
  "isosurface",
  "volumetric"
]);

const OBJECT_LABELS = Object.freeze({
  [SCENE_OBJECT_TYPES.PROTEIN]: "Protein",
  [SCENE_OBJECT_TYPES.LIGAND]: "Ligand",
  [SCENE_OBJECT_TYPES.WATER]: "Water",
  [SCENE_OBJECT_TYPES.METAL_IONS]: "Metal ions",
  [SCENE_OBJECT_TYPES.VOLUME]: "Volume"
});

function cloneVec3(v) {
  if (!Array.isArray(v) || v.length !== 3) {
    throw new Error("Expected an RGB vector with 3 components.");
  }
  return [Number(v[0]), Number(v[1]), Number(v[2])];
}

function normalizeColorVec3(v, label) {
  const out = cloneVec3(v);
  for (let i = 0; i < 3; i += 1) {
    if (!Number.isFinite(out[i]) || out[i] < 0 || out[i] > 1) {
      throw new Error(`${label} must contain finite RGB values in [0, 1].`);
    }
  }
  return out;
}

export function createDefaultMaterial() {
  return {
    useImportedColor: true,
    baseColor: [0.8, 0.8, 0.8],
    mode: "metallic",
    metallic: 0.0,
    roughness: 0.4,
    rimBoost: 0.2,
    matteSpecular: 0.03,
    matteRoughness: 0.5,
    matteDiffuseRoughness: 0.5,
    wrapDiffuse: 0.2,
    opacity: 1.0,
    surfaceIor: 1.0,
    surfaceTransmission: 0.35,
    surfaceOpacity: 0.0
  };
}

export function defaultDisplayForObjectType(objectType) {
  if (!Object.values(SCENE_OBJECT_TYPES).includes(objectType)) {
    throw new Error(`Unknown object type: ${objectType}`);
  }
  if (objectType === SCENE_OBJECT_TYPES.VOLUME) {
    return {
      style: "volumetric",
      isoLevel: 0.77,
      isoPositiveColor: [0.15, 0.85, 0.2],
      isoNegativeColor: [0.9, 0.2, 0.2],
      volumeValueMin: 0.0,
      volumeValueMax: 0.72,
      volumeOpacityScale: 1.0,
      volumeStepSize: 0.2,
      volumePositiveColor: [0.15, 0.85, 0.2],
      volumeNegativeColor: [0.9, 0.2, 0.2],
      volumeTransferPreset: "orbital",
      atomScale: 1.0,
      bondRadius: 0.25,
      probeRadius: 1.4,
      surfaceResolution: 0.25,
      smoothNormals: false,
      showSheetHbonds: false
    };
  }
  let style = "stick";
  if (objectType === SCENE_OBJECT_TYPES.PROTEIN) {
    style = "cartoon";
  } else if (objectType === SCENE_OBJECT_TYPES.WATER || objectType === SCENE_OBJECT_TYPES.METAL_IONS) {
    style = "vdw";
  }
  return {
    style,
    atomScale: 1.0,
    bondRadius: 0.25,
    probeRadius: 1.4,
    surfaceResolution: 0.25,
    isoLevel: 0.77,
    isoPositiveColor: [0.15, 0.85, 0.2],
    isoNegativeColor: [0.9, 0.2, 0.2],
    volumeValueMin: 0.0,
    volumeValueMax: 0.72,
    volumeOpacityScale: 1.0,
    volumeStepSize: 0.2,
    volumePositiveColor: [0.15, 0.85, 0.2],
    volumeNegativeColor: [0.9, 0.2, 0.2],
    volumeTransferPreset: "orbital",
    smoothNormals: false,
    showSheetHbonds: false
  };
}

export function displayStylesForObjectType(objectType) {
  if (objectType === SCENE_OBJECT_TYPES.VOLUME) {
    return ["isosurface", "volumetric"];
  }
  return ["ball-and-stick", "vdw", "stick", "cartoon", "ses"];
}

function normalizeStyle(style, objectType) {
  if (!DISPLAY_STYLES.includes(style)) {
    throw new Error(`Unsupported display style: ${style}`);
  }
  const allowed = displayStylesForObjectType(objectType);
  if (!allowed.includes(style)) {
    throw new Error(`Display style ${style} is not allowed for object type ${objectType}.`);
  }
  return style;
}

function normalizeDisplaySettings(display, objectType) {
  const base = defaultDisplayForObjectType(objectType);
  const style = normalizeStyle(display?.style ?? base.style, objectType);

  const atomScale = Number(display?.atomScale ?? base.atomScale);
  const bondRadius = Number(display?.bondRadius ?? base.bondRadius);
  const probeRadius = Number(display?.probeRadius ?? base.probeRadius);
  const surfaceResolution = Number(display?.surfaceResolution ?? base.surfaceResolution);
  const isoLevel = Number(display?.isoLevel ?? base.isoLevel);
  const isoPositiveColor = normalizeColorVec3(
    display?.isoPositiveColor ?? base.isoPositiveColor,
    "Positive isosurface color"
  );
  const isoNegativeColor = normalizeColorVec3(
    display?.isoNegativeColor ?? base.isoNegativeColor,
    "Negative isosurface color"
  );
  const volumeValueMin = Number(display?.volumeValueMin ?? base.volumeValueMin);
  const volumeValueMax = Number(display?.volumeValueMax ?? base.volumeValueMax);
  const volumeOpacityScale = Number(display?.volumeOpacityScale ?? base.volumeOpacityScale);
  const volumeStepSize = Number(display?.volumeStepSize ?? base.volumeStepSize);
  const volumePositiveColor = normalizeColorVec3(
    display?.volumePositiveColor ?? base.volumePositiveColor,
    "Positive volume color"
  );
  const volumeNegativeColor = normalizeColorVec3(
    display?.volumeNegativeColor ?? base.volumeNegativeColor,
    "Negative volume color"
  );
  const volumeTransferPreset = String(display?.volumeTransferPreset ?? base.volumeTransferPreset);
  const allowedVolumeTransferPresets = new Set(["orbital", "grayscale", "heatmap"]);

  if (!Number.isFinite(atomScale) || atomScale <= 0) {
    throw new Error("Atom radius scale must be > 0.");
  }
  if (!Number.isFinite(bondRadius) || bondRadius < 0) {
    throw new Error("Bond radius must be >= 0.");
  }
  if (!Number.isFinite(probeRadius) || probeRadius <= 0) {
    throw new Error("Probe radius must be > 0.");
  }
  if (!Number.isFinite(surfaceResolution) || surfaceResolution <= 0) {
    throw new Error("Surface resolution must be > 0.");
  }
  if (!Number.isFinite(isoLevel) || isoLevel < 0 || isoLevel > 1) {
    throw new Error("Iso-level must be within [0, 1].");
  }
  if (!Number.isFinite(volumeValueMin) || !Number.isFinite(volumeValueMax)) {
    throw new Error("Volume value window bounds must be finite.");
  }
  if (volumeValueMin >= volumeValueMax) {
    throw new Error("Volume value window min must be < max.");
  }
  if (!Number.isFinite(volumeOpacityScale) || volumeOpacityScale < 0) {
    throw new Error("Volume opacity scale must be >= 0.");
  }
  if (!Number.isFinite(volumeStepSize) || volumeStepSize <= 0) {
    throw new Error("Volume step size must be > 0.");
  }
  if (!allowedVolumeTransferPresets.has(volumeTransferPreset)) {
    throw new Error(`Unsupported volume transfer preset: ${volumeTransferPreset}`);
  }

  return {
    style,
    atomScale,
    bondRadius,
    probeRadius,
    surfaceResolution,
    isoLevel,
    isoPositiveColor,
    isoNegativeColor,
    volumeValueMin,
    volumeValueMax,
    volumeOpacityScale,
    volumeStepSize,
    volumePositiveColor,
    volumeNegativeColor,
    volumeTransferPreset,
    smoothNormals: Boolean(display?.smoothNormals ?? base.smoothNormals),
    showSheetHbonds: Boolean(display?.showSheetHbonds ?? base.showSheetHbonds)
  };
}

export function normalizeMaterial(material) {
  const base = createDefaultMaterial();
  const mode = material?.mode ?? base.mode;
  const allowedModes = new Set(["metallic", "matte", "surface-glass", "translucent-plastic"]);
  if (!allowedModes.has(mode)) {
    throw new Error(`Unsupported material mode: ${mode}`);
  }

  const out = {
    useImportedColor: Boolean(material?.useImportedColor ?? base.useImportedColor),
    baseColor: cloneVec3(material?.baseColor ?? base.baseColor),
    mode,
    metallic: Number(material?.metallic ?? base.metallic),
    roughness: Number(material?.roughness ?? base.roughness),
    rimBoost: Number(material?.rimBoost ?? base.rimBoost),
    matteSpecular: Number(material?.matteSpecular ?? base.matteSpecular),
    matteRoughness: Number(material?.matteRoughness ?? base.matteRoughness),
    matteDiffuseRoughness: Number(material?.matteDiffuseRoughness ?? base.matteDiffuseRoughness),
    wrapDiffuse: Number(material?.wrapDiffuse ?? base.wrapDiffuse),
    opacity: Number(material?.opacity ?? base.opacity),
    surfaceIor: Number(material?.surfaceIor ?? base.surfaceIor),
    surfaceTransmission: Number(material?.surfaceTransmission ?? base.surfaceTransmission),
    surfaceOpacity: Number(material?.surfaceOpacity ?? base.surfaceOpacity)
  };

  for (const [key, value] of Object.entries(out)) {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new Error(`Material parameter ${key} must be finite.`);
    }
  }

  return out;
}

function classifyAtomType(atom, sourceKind) {
  if (!atom || !atom.element) {
    throw new Error("Atom is missing required element metadata.");
  }
  if (sourceKind !== "pdb") {
    return SCENE_OBJECT_TYPES.LIGAND;
  }
  if (!atom.isHet) {
    return SCENE_OBJECT_TYPES.PROTEIN;
  }
  const resName = String(atom.resName || "").toUpperCase();
  if (WATER_RESIDUES.has(resName)) {
    return SCENE_OBJECT_TYPES.WATER;
  }
  const element = String(atom.element || "").toUpperCase();
  if (METAL_ELEMENTS.has(element)) {
    return SCENE_OBJECT_TYPES.METAL_IONS;
  }
  return SCENE_OBJECT_TYPES.LIGAND;
}

function buildSubsetMolData(molData, indexList) {
  const indexSet = new Set(indexList);
  const reindex = new Map();
  const atoms = [];

  for (const srcIndex of indexList) {
    reindex.set(srcIndex, atoms.length);
    atoms.push(molData.atoms[srcIndex]);
  }

  const bonds = [];
  for (const [i, j] of molData.bonds) {
    if (indexSet.has(i) && indexSet.has(j)) {
      bonds.push([reindex.get(i), reindex.get(j)]);
    }
  }

  return {
    atoms,
    bonds,
    secondary: molData.secondary || { helices: [], sheets: [] }
  };
}

export function partitionMolDataByType(molData, sourceKind = "pdb") {
  if (!molData || !Array.isArray(molData.atoms) || !Array.isArray(molData.bonds)) {
    throw new Error("Invalid molecular data; expected atoms and bonds arrays.");
  }

  const buckets = {
    [SCENE_OBJECT_TYPES.PROTEIN]: [],
    [SCENE_OBJECT_TYPES.LIGAND]: [],
    [SCENE_OBJECT_TYPES.WATER]: [],
    [SCENE_OBJECT_TYPES.METAL_IONS]: []
  };

  for (let i = 0; i < molData.atoms.length; i += 1) {
    const atom = molData.atoms[i];
    const type = classifyAtomType(atom, sourceKind);
    buckets[type].push(i);
  }

  const out = {};
  for (const [type, indices] of Object.entries(buckets)) {
    out[type] = {
      type,
      atomCount: indices.length,
      molData: buildSubsetMolData(molData, indices)
    };
  }
  return out;
}

function createDefaultRepresentation(objectType, repId) {
  const display = defaultDisplayForObjectType(objectType);
  let name = "Stick";
  if (display.style === "cartoon") {
    name = "Cartoon";
  } else if (display.style === "vdw") {
    name = "Spacefill";
  } else if (display.style === "isosurface") {
    name = "Isosurface";
  } else if (display.style === "volumetric") {
    name = "Volumetric";
  }
  return {
    id: repId,
    name,
    visible: true,
    display,
    material: createDefaultMaterial()
  };
}

function createObjectLabel(type, atomCount) {
  const name = OBJECT_LABELS[type] || type;
  return `${name} (${atomCount} atoms)`;
}

function createVolumeLabel(volumeData) {
  if (!volumeData || !Array.isArray(volumeData.dims) || volumeData.dims.length !== 3) {
    throw new Error("Volume object requires dims metadata.");
  }
  const [nx, ny, nz] = volumeData.dims;
  return `${OBJECT_LABELS[SCENE_OBJECT_TYPES.VOLUME]} (${nx}x${ny}x${nz})`;
}

export function createSceneGraphFromMolData(molData, options = {}) {
  const sourceKind = options.sourceKind || "pdb";
  const volumeGrids = options.volumeGrids || [];
  if (!Array.isArray(volumeGrids)) {
    throw new Error("volumeGrids must be an array when provided.");
  }
  const partitions = partitionMolDataByType(molData, sourceKind);

  const orderedTypes = [
    SCENE_OBJECT_TYPES.PROTEIN,
    SCENE_OBJECT_TYPES.LIGAND,
    SCENE_OBJECT_TYPES.WATER,
    SCENE_OBJECT_TYPES.METAL_IONS
  ];

  const objects = [];
  let objectSeq = 1;
  let repSeq = 1;

  for (const type of orderedTypes) {
    const bucket = partitions[type];
    if (!bucket || bucket.atomCount === 0) continue;

    const objectId = `obj-${objectSeq}`;
    objectSeq += 1;
    const repId = `rep-${repSeq}`;
    repSeq += 1;

    objects.push({
      id: objectId,
      type,
      visible: true,
      atomCount: bucket.atomCount,
      label: createObjectLabel(type, bucket.atomCount),
      molData: bucket.molData,
      representations: [createDefaultRepresentation(type, repId)]
    });
  }

  for (const volumeData of volumeGrids) {
    const objectId = `obj-${objectSeq}`;
    objectSeq += 1;
    const repId = `rep-${repSeq}`;
    repSeq += 1;
    objects.push({
      id: objectId,
      type: SCENE_OBJECT_TYPES.VOLUME,
      visible: true,
      atomCount: 0,
      label: createVolumeLabel(volumeData),
      molData: { atoms: [], bonds: [], secondary: { helices: [], sheets: [] } },
      volumeData,
      representations: [createDefaultRepresentation(SCENE_OBJECT_TYPES.VOLUME, repId)]
    });
  }

  return {
    objects,
    selection: objects.length > 0
      ? { kind: "object", objectId: objects[0].id, representationId: null }
      : null,
    nextObjectId: objectSeq,
    nextRepId: repSeq
  };
}

export function appendSceneGraphFromMolData(sceneGraph, molData, options = {}) {
  if (!sceneGraph || !Array.isArray(sceneGraph.objects)) {
    throw new Error("Scene graph is invalid.");
  }
  if (!Number.isInteger(sceneGraph.nextObjectId) || sceneGraph.nextObjectId <= 0) {
    throw new Error("Scene graph nextObjectId is invalid.");
  }
  if (!Number.isInteger(sceneGraph.nextRepId) || sceneGraph.nextRepId <= 0) {
    throw new Error("Scene graph nextRepId is invalid.");
  }

  const incoming = createSceneGraphFromMolData(molData, options);
  const appendedObjectIds = [];

  for (const object of incoming.objects) {
    object.id = `obj-${sceneGraph.nextObjectId}`;
    sceneGraph.nextObjectId += 1;
    appendedObjectIds.push(object.id);
    for (const rep of object.representations || []) {
      rep.id = `rep-${sceneGraph.nextRepId}`;
      sceneGraph.nextRepId += 1;
    }
    sceneGraph.objects.push(object);
  }

  if (!sceneGraph.selection && sceneGraph.objects.length > 0) {
    sceneGraph.selection = { kind: "object", objectId: sceneGraph.objects[0].id, representationId: null };
  }

  return appendedObjectIds;
}

export function listVisibleRepresentations(sceneGraph) {
  if (!sceneGraph || !Array.isArray(sceneGraph.objects)) {
    throw new Error("Scene graph is invalid.");
  }
  const out = [];
  for (const object of sceneGraph.objects) {
    if (!object.visible) continue;
    for (const rep of object.representations || []) {
      if (!rep.visible) continue;
      out.push({ object, representation: rep });
    }
  }
  return out;
}

export function findObject(sceneGraph, objectId) {
  if (!sceneGraph || !Array.isArray(sceneGraph.objects)) {
    throw new Error("Scene graph is invalid.");
  }
  const object = sceneGraph.objects.find((o) => o.id === objectId);
  if (!object) {
    throw new Error(`Scene object not found: ${objectId}`);
  }
  return object;
}

export function findRepresentation(sceneGraph, objectId, representationId) {
  const object = findObject(sceneGraph, objectId);
  const representation = (object.representations || []).find((r) => r.id === representationId);
  if (!representation) {
    throw new Error(`Representation not found: ${representationId}`);
  }
  return { object, representation };
}

export function selectObject(sceneGraph, objectId) {
  findObject(sceneGraph, objectId);
  sceneGraph.selection = { kind: "object", objectId, representationId: null };
}

export function selectRepresentation(sceneGraph, objectId, representationId) {
  findRepresentation(sceneGraph, objectId, representationId);
  sceneGraph.selection = { kind: "representation", objectId, representationId };
}

export function toggleObjectVisibility(sceneGraph, objectId, visible) {
  const object = findObject(sceneGraph, objectId);
  object.visible = Boolean(visible);
}

export function toggleRepresentationVisibility(sceneGraph, objectId, representationId, visible) {
  const { representation } = findRepresentation(sceneGraph, objectId, representationId);
  representation.visible = Boolean(visible);
}

export function addRepresentationToObject(sceneGraph, objectId) {
  const object = findObject(sceneGraph, objectId);
  if (!Number.isInteger(sceneGraph.nextRepId) || sceneGraph.nextRepId <= 0) {
    throw new Error("Scene graph nextRepId is invalid.");
  }
  const repId = `rep-${sceneGraph.nextRepId}`;
  sceneGraph.nextRepId += 1;

  const representation = {
    id: repId,
    name: `Representation ${object.representations.length + 1}`,
    visible: true,
    display: defaultDisplayForObjectType(object.type),
    material: createDefaultMaterial()
  };

  object.representations.push(representation);
  selectRepresentation(sceneGraph, objectId, repId);
  return representation;
}

function normalizeSelection(sceneGraph) {
  if (!sceneGraph || !Array.isArray(sceneGraph.objects)) {
    throw new Error("Scene graph is invalid.");
  }
  if (sceneGraph.objects.length === 0) {
    sceneGraph.selection = null;
    return;
  }

  const selection = sceneGraph.selection;
  if (!selection || !selection.objectId) {
    sceneGraph.selection = { kind: "object", objectId: sceneGraph.objects[0].id, representationId: null };
    return;
  }

  const object = sceneGraph.objects.find((o) => o.id === selection.objectId);
  if (!object) {
    sceneGraph.selection = { kind: "object", objectId: sceneGraph.objects[0].id, representationId: null };
    return;
  }

  if (selection.kind === "representation" && selection.representationId) {
    const hasRep = (object.representations || []).some((rep) => rep.id === selection.representationId);
    if (!hasRep) {
      sceneGraph.selection = { kind: "object", objectId: object.id, representationId: null };
    }
    return;
  }

  sceneGraph.selection = { kind: "object", objectId: object.id, representationId: null };
}

export function deleteObjectFromSceneGraph(sceneGraph, objectId) {
  if (!sceneGraph || !Array.isArray(sceneGraph.objects)) {
    throw new Error("Scene graph is invalid.");
  }
  const index = sceneGraph.objects.findIndex((o) => o.id === objectId);
  if (index < 0) {
    throw new Error(`Scene object not found: ${objectId}`);
  }
  const [removed] = sceneGraph.objects.splice(index, 1);
  normalizeSelection(sceneGraph);
  return removed;
}

export function deleteRepresentationFromObject(sceneGraph, objectId, representationId) {
  const object = findObject(sceneGraph, objectId);
  const representations = object.representations || [];
  const index = representations.findIndex((rep) => rep.id === representationId);
  if (index < 0) {
    throw new Error(`Representation not found: ${representationId}`);
  }
  const [removed] = representations.splice(index, 1);
  normalizeSelection(sceneGraph);
  return removed;
}

export function updateRepresentation(sceneGraph, objectId, representationId, patch) {
  const { object, representation } = findRepresentation(sceneGraph, objectId, representationId);
  if (!patch || typeof patch !== "object") {
    throw new Error("Representation patch must be an object.");
  }

  if (patch.name != null) {
    const name = String(patch.name).trim();
    if (!name) {
      throw new Error("Representation name must be non-empty.");
    }
    representation.name = name;
  }
  if (patch.visible != null) {
    representation.visible = Boolean(patch.visible);
  }
  if (patch.display) {
    representation.display = normalizeDisplaySettings(patch.display, object.type);
  }
  if (patch.material) {
    representation.material = normalizeMaterial(patch.material);
  }
  return representation;
}

export function cloneMaterial(material) {
  return normalizeMaterial(material);
}

export function cloneDisplay(display, objectType) {
  return normalizeDisplaySettings(display, objectType);
}
