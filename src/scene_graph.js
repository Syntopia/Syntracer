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
  METAL_IONS: "metal-ions"
});

export const DISPLAY_STYLES = Object.freeze([
  "ball-and-stick",
  "vdw",
  "stick",
  "cartoon",
  "ses"
]);

const OBJECT_LABELS = Object.freeze({
  [SCENE_OBJECT_TYPES.PROTEIN]: "Protein",
  [SCENE_OBJECT_TYPES.LIGAND]: "Ligand",
  [SCENE_OBJECT_TYPES.WATER]: "Water",
  [SCENE_OBJECT_TYPES.METAL_IONS]: "Metal ions"
});

function cloneVec3(v) {
  if (!Array.isArray(v) || v.length !== 3) {
    throw new Error("Expected an RGB vector with 3 components.");
  }
  return [Number(v[0]), Number(v[1]), Number(v[2])];
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
    surfaceIor: 1.0,
    surfaceTransmission: 0.35,
    surfaceOpacity: 0.0
  };
}

export function defaultDisplayForObjectType(objectType) {
  if (!Object.values(SCENE_OBJECT_TYPES).includes(objectType)) {
    throw new Error(`Unknown object type: ${objectType}`);
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
    bondRadius: 0.12,
    probeRadius: 1.4,
    surfaceResolution: 0.25,
    smoothNormals: false,
    showSheetHbonds: false
  };
}

function normalizeStyle(style) {
  if (!DISPLAY_STYLES.includes(style)) {
    throw new Error(`Unsupported molecular display style: ${style}`);
  }
  return style;
}

function normalizeDisplaySettings(display, objectType) {
  const base = defaultDisplayForObjectType(objectType);
  const style = normalizeStyle(display?.style ?? base.style);

  const atomScale = Number(display?.atomScale ?? base.atomScale);
  const bondRadius = Number(display?.bondRadius ?? base.bondRadius);
  const probeRadius = Number(display?.probeRadius ?? base.probeRadius);
  const surfaceResolution = Number(display?.surfaceResolution ?? base.surfaceResolution);

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

  return {
    style,
    atomScale,
    bondRadius,
    probeRadius,
    surfaceResolution,
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

export function createSceneGraphFromMolData(molData, options = {}) {
  const sourceKind = options.sourceKind || "pdb";
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

  return {
    objects,
    selection: objects.length > 0
      ? { kind: "object", objectId: objects[0].id, representationId: null }
      : null,
    nextObjectId: objectSeq,
    nextRepId: repSeq
  };
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
