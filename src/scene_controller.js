export function hasSurfaceFlags(triFlags) {
  if (!triFlags || triFlags.length === 0) return false;
  for (let i = 0; i < triFlags.length; i += 1) {
    if (triFlags[i] > 0.5) return true;
  }
  return false;
}

export function mergeTriangleMeshes(a, b) {
  if (!a || a.positions.length === 0) return b;
  if (!b || b.positions.length === 0) return a;

  const aTriCount = a.indices.length / 3;
  const bTriCount = b.indices.length / 3;

  const positions = new Float32Array(a.positions.length + b.positions.length);
  positions.set(a.positions, 0);
  positions.set(b.positions, a.positions.length);

  const normals = new Float32Array(a.normals.length + b.normals.length);
  normals.set(a.normals, 0);
  normals.set(b.normals, a.normals.length);

  const indices = new Uint32Array(a.indices.length + b.indices.length);
  indices.set(a.indices, 0);
  const offset = a.positions.length / 3;
  for (let i = 0; i < b.indices.length; i += 1) {
    indices[a.indices.length + i] = b.indices[i] + offset;
  }

  const triColors = new Float32Array(a.triColors.length + b.triColors.length);
  triColors.set(a.triColors, 0);
  triColors.set(b.triColors, a.triColors.length);

  const aFlags = a.triFlags && a.triFlags.length === aTriCount ? a.triFlags : new Float32Array(aTriCount);
  const bFlags = b.triFlags && b.triFlags.length === bTriCount ? b.triFlags : new Float32Array(bTriCount);
  const triFlags = new Float32Array(aFlags.length + bFlags.length);
  triFlags.set(aFlags, 0);
  triFlags.set(bFlags, aFlags.length);

  return { positions, indices, normals, triColors, triFlags };
}

