const VDW_RADII = {
  N: 1.55
};

const DEFAULT_OPTIONS = {
  spacing: 0.5,
  gaussianScale: 3.0,
  cutoffSigma: 3.0,
  maxVoxels: 256 * 256 * 256
};

function requireNumber(value, label) {
  if (!Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number.`);
  }
  return value;
}

export function buildNitrogenDensityVolume(molData, options = {}) {
  if (!molData || !Array.isArray(molData.atoms)) {
    throw new Error("Expected molData with an atoms array.");
  }

  const spacing = requireNumber(
    Number(options.spacing ?? DEFAULT_OPTIONS.spacing),
    "Volume spacing"
  );
  const gaussianScale = requireNumber(
    Number(options.gaussianScale ?? DEFAULT_OPTIONS.gaussianScale),
    "Gaussian scale"
  );
  const cutoffSigma = requireNumber(
    Number(options.cutoffSigma ?? DEFAULT_OPTIONS.cutoffSigma),
    "Gaussian cutoff"
  );
  const maxVoxels = Number(options.maxVoxels ?? DEFAULT_OPTIONS.maxVoxels);

  if (spacing <= 0) {
    throw new Error("Volume spacing must be > 0.");
  }
  if (gaussianScale <= 0) {
    throw new Error("Gaussian scale must be > 0.");
  }
  if (cutoffSigma <= 0) {
    throw new Error("Gaussian cutoff must be > 0.");
  }
  if (!Number.isFinite(maxVoxels) || maxVoxels <= 0) {
    throw new Error("Volume max voxels must be > 0.");
  }

  const nitrogenAtoms = molData.atoms.filter(
    (atom) => atom && atom.element && atom.element.toUpperCase() === "N"
  );
  if (nitrogenAtoms.length === 0) {
    throw new Error("No nitrogen atoms found for volumetric density.");
  }

  const vdw = VDW_RADII.N;
  const sigma = vdw * gaussianScale;
  const cutoff = sigma * cutoffSigma;
  const cutoff2 = cutoff * cutoff;
  const sigma2 = sigma * sigma;

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const atom of nitrogenAtoms) {
    const [x, y, z] = atom.position;
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    minZ = Math.min(minZ, z);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
    maxZ = Math.max(maxZ, z);
  }

  minX -= cutoff;
  minY -= cutoff;
  minZ -= cutoff;
  maxX += cutoff;
  maxY += cutoff;
  maxZ += cutoff;

  const nx = Math.max(1, Math.floor((maxX - minX) / spacing) + 1);
  const ny = Math.max(1, Math.floor((maxY - minY) / spacing) + 1);
  const nz = Math.max(1, Math.floor((maxZ - minZ) / spacing) + 1);
  const voxelCount = nx * ny * nz;

  if (voxelCount > maxVoxels) {
    throw new Error(
      `Volume grid too large (${nx}x${ny}x${nz} = ${voxelCount} voxels). ` +
      `Increase spacing or raise maxVoxels.`
    );
  }

  const data = new Float32Array(voxelCount);
  let maxValue = 0.0;
  let minValue = Infinity;

  const invSpacing = 1.0 / spacing;
  const sliceStride = nx * ny;

  for (const atom of nitrogenAtoms) {
    const [ax, ay, az] = atom.position;
    const cx = (ax - minX) * invSpacing;
    const cy = (ay - minY) * invSpacing;
    const cz = (az - minZ) * invSpacing;
    const rGrid = cutoff * invSpacing;

    const ix0 = Math.max(0, Math.floor(cx - rGrid));
    const ix1 = Math.min(nx - 1, Math.ceil(cx + rGrid));
    const iy0 = Math.max(0, Math.floor(cy - rGrid));
    const iy1 = Math.min(ny - 1, Math.ceil(cy + rGrid));
    const iz0 = Math.max(0, Math.floor(cz - rGrid));
    const iz1 = Math.min(nz - 1, Math.ceil(cz + rGrid));

    for (let z = iz0; z <= iz1; z += 1) {
      const dz = (z - cz) * spacing;
      const dz2 = dz * dz;
      const zOffset = z * sliceStride;

      for (let y = iy0; y <= iy1; y += 1) {
        const dy = (y - cy) * spacing;
        const dy2 = dy * dy;
        const yOffset = y * nx + zOffset;

        for (let x = ix0; x <= ix1; x += 1) {
          const dx = (x - cx) * spacing;
          const r2 = dx * dx + dy2 + dz2;
          if (r2 > cutoff2) continue;

          const value = Math.exp(-0.5 * r2 / sigma2);
          const idx = x + yOffset;
          const next = data[idx] + value;
          data[idx] = next;
          if (next > maxValue) {
            maxValue = next;
          }
        }
      }
    }
  }

  if (maxValue <= 0) {
    throw new Error("Generated volume has no density values.");
  }

  let absMax = 0.0;
  let minAbsNonZero = Infinity;
  for (let i = 0; i < data.length; i += 1) {
    const v = data[i];
    if (v < minValue) minValue = v;
    const av = Math.abs(v);
    if (av > absMax) absMax = av;
    if (av > 0 && av < minAbsNonZero) minAbsNonZero = av;
  }
  if (!Number.isFinite(minValue)) {
    minValue = 0.0;
  }
  if (!Number.isFinite(minAbsNonZero)) {
    minAbsNonZero = 0.0;
  }

  const maxGridX = minX + spacing * (nx - 1);
  const maxGridY = minY + spacing * (ny - 1);
  const maxGridZ = minZ + spacing * (nz - 1);

  return {
    data,
    dims: [nx, ny, nz],
    origin: [minX, minY, minZ],
    spacing: [spacing, spacing, spacing],
    maxValue,
    minValue,
    absMax,
    minAbsNonZero,
    nitrogenCount: nitrogenAtoms.length,
    sigma,
    cutoff,
    bounds: {
      minX,
      minY,
      minZ,
      maxX: maxGridX,
      maxY: maxGridY,
      maxZ: maxGridZ
    },
    version: Date.now() + Math.random()
  };
}

export const VOLUME_DEFAULTS = { ...DEFAULT_OPTIONS };
