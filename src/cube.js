const BOHR_TO_ANGSTROM = 0.529177210903;

const ATOMIC_SYMBOLS = Object.freeze({
  1: "H",
  2: "He",
  3: "Li",
  4: "Be",
  5: "B",
  6: "C",
  7: "N",
  8: "O",
  9: "F",
  10: "Ne",
  11: "Na",
  12: "Mg",
  13: "Al",
  14: "Si",
  15: "P",
  16: "S",
  17: "Cl",
  18: "Ar",
  19: "K",
  20: "Ca",
  26: "Fe",
  29: "Cu",
  30: "Zn",
  35: "Br",
  53: "I"
});

const COVALENT_RADII = Object.freeze({
  H: 0.31, C: 0.76, N: 0.71, O: 0.66, S: 1.05, P: 1.07,
  F: 0.57, Cl: 1.02, Br: 1.20, I: 1.39, Fe: 1.32, Zn: 1.22,
  Ca: 1.76, Mg: 1.41, Na: 1.66, K: 2.03, Li: 1.28, B: 0.84,
  Si: 1.11, Cu: 1.32, DEFAULT: 0.80
});

function parseTokens(line, label) {
  const tokens = String(line || "").trim().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) {
    throw new Error(`Cube parser: ${label} line is empty.`);
  }
  return tokens;
}

function parseFiniteNumber(value, label) {
  const num = Number(value);
  if (!Number.isFinite(num)) {
    throw new Error(`Cube parser: ${label} must be a finite number, got "${value}".`);
  }
  return num;
}

function parseInteger(value, label) {
  const num = Number.parseInt(String(value), 10);
  if (!Number.isFinite(num)) {
    throw new Error(`Cube parser: ${label} must be an integer, got "${value}".`);
  }
  return num;
}

function normalizeSymbol(symbol, atomicNumber) {
  if (symbol) {
    if (symbol.length === 1) return symbol.toUpperCase();
    return symbol[0].toUpperCase() + symbol.slice(1).toLowerCase();
  }
  // Unknown atomic number is still allowed; downstream uses default radius/color.
  return `X${atomicNumber}`;
}

function checkAxisAligned(axisVectors) {
  const eps = 1e-8;
  const x = axisVectors[0];
  const y = axisVectors[1];
  const z = axisVectors[2];

  const xAligned = Math.abs(x[1]) <= eps && Math.abs(x[2]) <= eps && Math.abs(x[0]) > eps;
  const yAligned = Math.abs(y[0]) <= eps && Math.abs(y[2]) <= eps && Math.abs(y[1]) > eps;
  const zAligned = Math.abs(z[0]) <= eps && Math.abs(z[1]) <= eps && Math.abs(z[2]) > eps;
  if (!xAligned || !yAligned || !zAligned) {
    throw new Error(
      "Cube parser: only axis-aligned cube grids are supported (no rotated/sheared axes)."
    );
  }
  if (x[0] <= 0 || y[1] <= 0 || z[2] <= 0) {
    throw new Error(
      "Cube parser: only positive axis directions are supported for cube grids."
    );
  }
}

function generateBondsFromDistance(atoms) {
  const bonds = [];
  if (!Array.isArray(atoms) || atoms.length < 2) {
    return bonds;
  }

  const tolerance = 0.45;
  const minDist = 0.4;
  const cellSize = 2.5;
  const cells = new Map();

  for (let i = 0; i < atoms.length; i += 1) {
    const p = atoms[i].position;
    const cx = Math.floor(p[0] / cellSize);
    const cy = Math.floor(p[1] / cellSize);
    const cz = Math.floor(p[2] / cellSize);
    const key = `${cx},${cy},${cz}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(i);
  }

  for (let i = 0; i < atoms.length; i += 1) {
    const a1 = atoms[i];
    const r1 = COVALENT_RADII[a1.element] || COVALENT_RADII.DEFAULT;
    const p1 = a1.position;
    const cx = Math.floor(p1[0] / cellSize);
    const cy = Math.floor(p1[1] / cellSize);
    const cz = Math.floor(p1[2] / cellSize);

    for (let dx = -1; dx <= 1; dx += 1) {
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dz = -1; dz <= 1; dz += 1) {
          const key = `${cx + dx},${cy + dy},${cz + dz}`;
          const cell = cells.get(key);
          if (!cell) continue;

          for (const j of cell) {
            if (j <= i) continue;
            const a2 = atoms[j];
            const r2 = COVALENT_RADII[a2.element] || COVALENT_RADII.DEFAULT;
            const p2 = a2.position;
            const dxp = p1[0] - p2[0];
            const dyp = p1[1] - p2[1];
            const dzp = p1[2] - p2[2];
            const dist = Math.sqrt(dxp * dxp + dyp * dyp + dzp * dzp);
            const maxDist = r1 + r2 + tolerance;
            if (dist >= minDist && dist <= maxDist) {
              bonds.push([i, j]);
            }
          }
        }
      }
    }
  }

  return bonds;
}

export function parseCubeFile(text) {
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  if (lines.length < 6) {
    throw new Error("Cube parser: file is too short.");
  }

  const comment1 = lines[0] || "";
  const comment2 = lines[1] || "";

  const atomLine = parseTokens(lines[2], "atom header");
  if (atomLine.length < 4) {
    throw new Error("Cube parser: atom header must contain natoms and origin.");
  }
  const natomsRaw = parseInteger(atomLine[0], "atom count");
  if (natomsRaw < 0) {
    throw new Error(
      "Cube parser: negative atom count (orbital/multi-field cube) is not supported."
    );
  }
  const atomCount = natomsRaw;
  const nval = atomLine.length >= 5 ? parseInteger(atomLine[4], "NVAL") : 1;
  if (nval !== 1) {
    throw new Error(`Cube parser: multi-value grids are not supported (NVAL=${nval}).`);
  }

  const origin = [
    parseFiniteNumber(atomLine[1], "origin x"),
    parseFiniteNumber(atomLine[2], "origin y"),
    parseFiniteNumber(atomLine[3], "origin z")
  ];

  const axisCounts = [];
  const axisVectors = [];
  const axisSigns = [];
  for (let i = 0; i < 3; i += 1) {
    const axisTokens = parseTokens(lines[3 + i], `axis ${i + 1}`);
    if (axisTokens.length < 4) {
      throw new Error(`Cube parser: axis ${i + 1} line must contain count and 3-vector.`);
    }
    const countRaw = parseInteger(axisTokens[0], `axis ${i + 1} count`);
    if (countRaw === 0) {
      throw new Error(`Cube parser: axis ${i + 1} voxel count must be non-zero.`);
    }
    axisCounts.push(Math.abs(countRaw));
    axisSigns.push(Math.sign(countRaw));
    axisVectors.push([
      parseFiniteNumber(axisTokens[1], `axis ${i + 1} vx`),
      parseFiniteNumber(axisTokens[2], `axis ${i + 1} vy`),
      parseFiniteNumber(axisTokens[3], `axis ${i + 1} vz`)
    ]);
  }

  const firstSign = axisSigns[0];
  if (axisSigns.some((sign) => sign !== firstSign)) {
    throw new Error("Cube parser: mixed axis unit signs are unsupported.");
  }
  const inputInBohr = firstSign > 0;
  const unitScale = inputInBohr ? BOHR_TO_ANGSTROM : 1.0;

  origin[0] *= unitScale;
  origin[1] *= unitScale;
  origin[2] *= unitScale;
  for (const vec of axisVectors) {
    vec[0] *= unitScale;
    vec[1] *= unitScale;
    vec[2] *= unitScale;
  }

  checkAxisAligned(axisVectors);

  const atoms = [];
  let cursor = 6;
  for (let i = 0; i < atomCount; i += 1) {
    const atomTokens = parseTokens(lines[cursor + i], `atom ${i + 1}`);
    if (atomTokens.length < 5) {
      throw new Error(`Cube parser: atom ${i + 1} line must have at least 5 fields.`);
    }
    const atomicNumber = parseInteger(atomTokens[0], `atom ${i + 1} atomic number`);
    const symbol = normalizeSymbol(ATOMIC_SYMBOLS[atomicNumber], atomicNumber);
    const position = [
      parseFiniteNumber(atomTokens[2], `atom ${i + 1} x`) * unitScale,
      parseFiniteNumber(atomTokens[3], `atom ${i + 1} y`) * unitScale,
      parseFiniteNumber(atomTokens[4], `atom ${i + 1} z`) * unitScale
    ];
    atoms.push({
      serial: i + 1,
      name: `${symbol}${i + 1}`,
      element: symbol,
      position,
      isHet: true,
      resName: "LIG",
      chainId: "A",
      resSeq: 1,
      iCode: ""
    });
  }
  cursor += atomCount;

  const nx = axisCounts[0];
  const ny = axisCounts[1];
  const nz = axisCounts[2];
  const voxelCount = nx * ny * nz;
  const fileOrderedValues = [];
  for (let i = cursor; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) continue;
    const tokens = line.split(/\s+/);
    for (const token of tokens) {
      fileOrderedValues.push(parseFiniteNumber(token, "grid value"));
    }
  }
  if (fileOrderedValues.length !== voxelCount) {
    throw new Error(
      `Cube parser: expected ${voxelCount} scalar values, got ${fileOrderedValues.length}.`
    );
  }

  // Cube files are written with x as outer loop, y as middle, z as inner (fastest).
  // Internally we store x-fastest layout: idx = x + y*nx + z*nx*ny.
  const data = new Float32Array(voxelCount);
  let src = 0;
  for (let ix = 0; ix < nx; ix += 1) {
    for (let iy = 0; iy < ny; iy += 1) {
      for (let iz = 0; iz < nz; iz += 1) {
        const dst = ix + iy * nx + iz * nx * ny;
        data[dst] = fileOrderedValues[src];
        src += 1;
      }
    }
  }

  let maxValue = -Infinity;
  let minValue = Infinity;
  let absMax = 0.0;
  let minAbsNonZero = Infinity;
  for (let i = 0; i < data.length; i += 1) {
    const v = data[i];
    if (v > maxValue) maxValue = v;
    if (v < minValue) minValue = v;
    const av = Math.abs(v);
    if (av > absMax) absMax = av;
    if (av > 0 && av < minAbsNonZero) minAbsNonZero = av;
  }
  if (!Number.isFinite(maxValue) || !Number.isFinite(minValue)) {
    throw new Error("Cube parser: scalar grid contains invalid values.");
  }
  if (!Number.isFinite(minAbsNonZero)) {
    minAbsNonZero = 0;
  }

  const spacing = [axisVectors[0][0], axisVectors[1][1], axisVectors[2][2]];
  const bounds = {
    minX: origin[0],
    minY: origin[1],
    minZ: origin[2],
    maxX: origin[0] + spacing[0] * (nx - 1),
    maxY: origin[1] + spacing[1] * (ny - 1),
    maxZ: origin[2] + spacing[2] * (nz - 1)
  };

  return {
    molData: {
      atoms,
      bonds: generateBondsFromDistance(atoms),
      secondary: { helices: [], sheets: [] }
    },
    volumeData: {
      data,
      dims: [nx, ny, nz],
      origin: [origin[0], origin[1], origin[2]],
      spacing: [spacing[0], spacing[1], spacing[2]],
      axisVectors: [
        [axisVectors[0][0], axisVectors[0][1], axisVectors[0][2]],
        [axisVectors[1][0], axisVectors[1][1], axisVectors[1][2]],
        [axisVectors[2][0], axisVectors[2][1], axisVectors[2][2]]
      ],
      maxValue,
      minValue,
      absMax,
      minAbsNonZero,
      bounds,
      units: "angstrom",
      source: "cube",
      comments: [comment1, comment2],
      version: Date.now() + Math.random()
    }
  };
}
