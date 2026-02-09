import { mergeTriangleMeshes } from "./scene_controller.js";
import { listVisibleRepresentations, SCENE_OBJECT_TYPES } from "./scene_graph.js";
import { buildRepresentationGeometry, representationGeometryCacheKey } from "./representation_builder.js";
import { PRIM_TRIANGLE, PRIM_SPHERE, PRIM_CYLINDER } from "./bvh.js";

function emptyGeometry() {
  return {
    positions: new Float32Array(0),
    indices: new Uint32Array(0),
    normals: new Float32Array(0),
    triColors: new Float32Array(0),
    triFlags: new Float32Array(0),
    spheres: [],
    cylinders: []
  };
}

function emptyPickRanges() {
  return {
    triangleRanges: [],
    sphereRanges: [],
    cylinderRanges: []
  };
}

function emptyMaterialAssignments() {
  return {
    materials: [],
    triMaterialIndices: [],
    sphereMaterialIndices: [],
    cylinderMaterialIndices: []
  };
}

function makePickRangeBase(entry) {
  const { object, representation } = entry;
  return {
    objectId: object.id,
    objectType: object.type,
    objectLabel: object.label,
    representationId: representation.id,
    representationName: representation.name,
    representationStyle: representation.display?.style || null
  };
}

function validateLocalIndexArray(values, count, label) {
  if (values == null) {
    return null;
  }
  if (!Array.isArray(values)) {
    throw new Error(`${label} metadata must be an array when provided.`);
  }
  if (values.length !== count) {
    throw new Error(`${label} metadata length mismatch: expected ${count}, got ${values.length}.`);
  }
  return values;
}

function addPickRange(target, start, count, entry, extra = {}) {
  if (!Number.isInteger(start) || start < 0) {
    throw new Error("Pick range start must be a non-negative integer.");
  }
  if (!Number.isInteger(count) || count < 0) {
    throw new Error("Pick range count must be a non-negative integer.");
  }
  if (count === 0) {
    return;
  }
  target.push({
    ...makePickRangeBase(entry),
    start,
    end: start + count,
    ...extra
  });
}

function rangesForPrimitiveType(pickRanges, primType) {
  if (primType === PRIM_TRIANGLE) return pickRanges.triangleRanges;
  if (primType === PRIM_SPHERE) return pickRanges.sphereRanges;
  if (primType === PRIM_CYLINDER) return pickRanges.cylinderRanges;
  throw new Error(`Unknown primitive type ${primType} for pick range lookup.`);
}

export function findPrimitivePickRange(pickRanges, primType, primIndex) {
  if (!pickRanges) {
    return null;
  }
  if (!Number.isInteger(primIndex) || primIndex < 0) {
    throw new Error(`Primitive index must be a non-negative integer, got ${primIndex}.`);
  }
  const ranges = rangesForPrimitiveType(pickRanges, primType);
  for (const range of ranges) {
    if (primIndex >= range.start && primIndex < range.end) {
      return range;
    }
  }
  return null;
}

function resolvePrimaryMaterial(sceneGraph, visibleEntries) {
  if (visibleEntries.length === 0) {
    throw new Error("No visible representations available.");
  }

  const selection = sceneGraph.selection;
  if (selection?.kind === "representation") {
    const match = visibleEntries.find(
      (entry) => entry.object.id === selection.objectId && entry.representation.id === selection.representationId
    );
    if (match) {
      return match.representation.material;
    }
  }

  return visibleEntries[0].representation.material;
}

export async function compileSceneGraphGeometry(sceneGraph, options = {}) {
  if (!sceneGraph || !Array.isArray(sceneGraph.objects)) {
    throw new Error("Scene graph is invalid.");
  }

  const logger = options.logger;
  const onProgress = options.onProgress ?? null;
  const geometryCache = options.geometryCache;
  if (!(geometryCache instanceof Map)) {
    throw new Error("geometryCache must be a Map.");
  }

  const visibleEntries = listVisibleRepresentations(sceneGraph);
  if (visibleEntries.length === 0) {
    throw new Error("No visible representations to compile.");
  }

  let merged = emptyGeometry();
  const pickRanges = emptyPickRanges();
  const materialAssignments = emptyMaterialAssignments();
  const materialIndexBySignature = new Map();
  const materialSignatures = new Set();
  let activeVolume = null;
  let activeVolumeDisplay = null;
  let activeVolumeRepId = null;

  for (const entry of visibleEntries) {
    const { object, representation } = entry;
    if (object.type === SCENE_OBJECT_TYPES.VOLUME && representation.display?.style === "volumetric") {
      if (!object.volumeData) {
        throw new Error(`Volume object ${object.id} is missing volumeData.`);
      }
      if (activeVolumeRepId != null && activeVolumeRepId !== representation.id) {
        throw new Error(
          "Multiple volumetric representations are visible. Only one volumetric representation can be active."
        );
      }
      activeVolume = object.volumeData;
      activeVolumeDisplay = representation.display;
      activeVolumeRepId = representation.id;
    }

    const cacheKey = representationGeometryCacheKey(object, representation);
    const cacheEntry = geometryCache.get(representation.id);

    let geometry = null;
    if (cacheEntry && cacheEntry.cacheKey === cacheKey) {
      geometry = cacheEntry.geometry;
    } else {
      geometry = await buildRepresentationGeometry({ object, representation, logger, onProgress });
      geometryCache.set(representation.id, {
        cacheKey,
        geometry
      });
    }

    const triStart = merged.indices.length / 3;
    const sphereStart = merged.spheres.length;
    const cylinderStart = merged.cylinders.length;
    const triCount = geometry.indices.length / 3;
    const sphereCount = geometry.spheres.length;
    const cylinderCount = geometry.cylinders.length;
    const materialSignature = JSON.stringify(representation.material);
    if (!materialIndexBySignature.has(materialSignature)) {
      materialIndexBySignature.set(materialSignature, materialAssignments.materials.length);
      materialAssignments.materials.push(JSON.parse(materialSignature));
    }
    const materialIndex = materialIndexBySignature.get(materialSignature);
    const sphereAtomIndices = validateLocalIndexArray(
      geometry.sphereAtomIndices,
      sphereCount,
      "Sphere index"
    );
    const cylinderBondAtomPairs = validateLocalIndexArray(
      geometry.cylinderBondAtomPairs,
      cylinderCount,
      "Cylinder bond"
    );
    addPickRange(pickRanges.triangleRanges, triStart, triCount, entry);
    addPickRange(pickRanges.sphereRanges, sphereStart, sphereCount, entry, { sphereAtomIndices });
    addPickRange(pickRanges.cylinderRanges, cylinderStart, cylinderCount, entry, { cylinderBondAtomPairs });
    for (let i = 0; i < triCount; i += 1) {
      materialAssignments.triMaterialIndices.push(materialIndex);
    }
    for (let i = 0; i < sphereCount; i += 1) {
      materialAssignments.sphereMaterialIndices.push(materialIndex);
    }
    for (let i = 0; i < cylinderCount; i += 1) {
      materialAssignments.cylinderMaterialIndices.push(materialIndex);
    }

    merged = {
      ...mergeTriangleMeshes(merged, geometry),
      spheres: merged.spheres.concat(geometry.spheres),
      cylinders: merged.cylinders.concat(geometry.cylinders)
    };

    materialSignatures.add(materialSignature);
  }

  return {
    ...merged,
    primaryMaterial: resolvePrimaryMaterial(sceneGraph, visibleEntries),
    hasMaterialConflict: materialSignatures.size > 1,
    visibleEntries,
    pickRanges,
    volumeData: activeVolume,
    volumeDisplay: activeVolumeDisplay,
    materials: materialAssignments.materials,
    triMaterialIndices: Float32Array.from(materialAssignments.triMaterialIndices),
    sphereMaterialIndices: Float32Array.from(materialAssignments.sphereMaterialIndices),
    cylinderMaterialIndices: Float32Array.from(materialAssignments.cylinderMaterialIndices)
  };
}
