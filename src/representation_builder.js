import { moleculeToGeometry } from "./molecular.js";
import { buildBackboneCartoon, buildSheetHbondCylinders } from "./cartoon.js";
import { computeSESWebGL, sesToTriangles } from "./surface_webgl.js";

const ELEMENT_RADII = {
  H: 1.20,
  C: 1.70,
  N: 1.55,
  O: 1.52,
  S: 1.80,
  P: 1.80,
  F: 1.47,
  Cl: 1.75,
  Br: 1.85,
  I: 1.98,
  DEFAULT: 1.70
};

function emptyTriangleMesh() {
  return {
    positions: new Float32Array(0),
    indices: new Uint32Array(0),
    normals: new Float32Array(0),
    triColors: new Float32Array(0),
    triFlags: new Float32Array(0)
  };
}

function sesColorFromMaterial(material) {
  if (!material?.useImportedColor && Array.isArray(material?.baseColor) && material.baseColor.length === 3) {
    return [
      Number(material.baseColor[0]),
      Number(material.baseColor[1]),
      Number(material.baseColor[2])
    ];
  }
  return [0.7, 0.75, 0.9];
}

function buildAtomBondGeometry(molData, display) {
  const style = display.style;
  if (style === "ball-and-stick") {
    return moleculeToGeometry(molData, {
      radiusScale: display.atomScale,
      bondRadius: display.bondRadius,
      showBonds: true
    });
  }
  if (style === "stick") {
    return moleculeToGeometry(molData, {
      radiusScale: 0.15,
      bondRadius: display.bondRadius,
      showBonds: true
    });
  }
  if (style === "vdw") {
    return moleculeToGeometry(molData, {
      radiusScale: 1.0,
      bondRadius: 0.0,
      showBonds: false
    });
  }
  throw new Error(`Unsupported atom/bond style: ${style}`);
}

function buildSphereAtomIndices(molData, sphereCount) {
  if (!Array.isArray(molData?.atoms)) {
    throw new Error("Molecule atom metadata is missing.");
  }
  if (sphereCount !== molData.atoms.length) {
    throw new Error(`Sphere count (${sphereCount}) does not match atom count (${molData.atoms.length}).`);
  }
  return Array.from({ length: sphereCount }, (_, idx) => idx);
}

function buildCylinderBondAtomPairs(molData, cylinderCount) {
  if (!Array.isArray(molData?.bonds)) {
    throw new Error("Molecule bond metadata is missing.");
  }
  if (cylinderCount === 0) {
    return [];
  }
  if (cylinderCount !== molData.bonds.length) {
    throw new Error(`Cylinder count (${cylinderCount}) does not match bond count (${molData.bonds.length}).`);
  }
  return molData.bonds.map((bond, idx) => {
    if (!Array.isArray(bond) || bond.length !== 2) {
      throw new Error(`Bond ${idx} is invalid; expected [atomA, atomB].`);
    }
    const a = Number(bond[0]);
    const b = Number(bond[1]);
    if (!Number.isInteger(a) || !Number.isInteger(b) || a < 0 || b < 0) {
      throw new Error(`Bond ${idx} contains invalid atom indices.`);
    }
    return [a, b];
  });
}

function buildSesTriangles(molData, display, material) {
  if (!molData?.atoms?.length) {
    throw new Error("SES representation requires atoms.");
  }

  const atoms = molData.atoms.map((a) => {
    const radius = ELEMENT_RADII[a.element] || ELEMENT_RADII.DEFAULT;
    return {
      center: a.position,
      radius
    };
  });

  const sesMesh = computeSESWebGL(atoms, {
    probeRadius: display.probeRadius,
    resolution: display.surfaceResolution,
    smoothNormals: display.smoothNormals
  });

  if (!sesMesh || !sesMesh.vertices || sesMesh.vertices.length === 0) {
    throw new Error("SES computation produced no triangles.");
  }

  const tri = sesToTriangles(sesMesh, sesColorFromMaterial(material));
  const triFlags = new Float32Array(tri.indices.length / 3);
  triFlags.fill(1);
  return {
    positions: tri.positions,
    indices: tri.indices,
    normals: tri.normals,
    triColors: tri.triColors,
    triFlags
  };
}

export function buildRepresentationGeometry(input) {
  const { object, representation, logger } = input || {};
  if (!object || !representation) {
    throw new Error("Representation build requires object and representation.");
  }

  const molData = object.molData;
  const display = representation.display;
  const material = representation.material;

  if (!display || !display.style) {
    throw new Error("Representation display settings are missing.");
  }

  let triangles = emptyTriangleMesh();
  let spheres = [];
  let cylinders = [];
  let sphereAtomIndices = null;
  let cylinderBondAtomPairs = null;

  if (display.style === "cartoon") {
    if (!molData?.atoms?.length) {
      throw new Error("Cartoon representation requires atoms.");
    }
    const mesh = buildBackboneCartoon(molData, {
      debugSheetOrientation: true,
      debugLog: (msg) => logger?.info?.(msg)
    });
    triangles = {
      positions: mesh.positions,
      indices: mesh.indices,
      normals: mesh.normals,
      triColors: mesh.triColors,
      triFlags: new Float32Array(mesh.indices.length / 3)
    };

    if (display.showSheetHbonds) {
      cylinders = cylinders.concat(buildSheetHbondCylinders(molData));
    }
  } else if (display.style === "ses") {
    triangles = buildSesTriangles(molData, display, material);
  } else {
    const atomBond = buildAtomBondGeometry(molData, display);
    spheres = atomBond.spheres;
    cylinders = atomBond.cylinders;
    sphereAtomIndices = buildSphereAtomIndices(molData, spheres.length);
    cylinderBondAtomPairs = buildCylinderBondAtomPairs(molData, cylinders.length);
  }

  return {
    positions: triangles.positions,
    indices: triangles.indices,
    normals: triangles.normals,
    triColors: triangles.triColors,
    triFlags: triangles.triFlags,
    spheres,
    cylinders,
    sphereAtomIndices,
    cylinderBondAtomPairs
  };
}

export function representationGeometryCacheKey(object, representation) {
  if (!object || !representation) {
    throw new Error("Cache key requires object and representation.");
  }
  return JSON.stringify({
    objectType: object.type,
    atomCount: object.atomCount,
    bondCount: object.molData?.bonds?.length || 0,
    display: representation.display,
    material: representation.material,
    visible: representation.visible
  });
}
