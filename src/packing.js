function computeTextureLayout(texelCount, maxSize, preferredWidth = 1024) {
  const width = Math.min(maxSize, Math.max(1, Math.min(preferredWidth, texelCount)));
  const height = Math.ceil(texelCount / width);
  if (height > maxSize) {
    throw new Error(`Texture size ${width}x${height} exceeds MAX_TEXTURE_SIZE ${maxSize}.`);
  }
  return { width, height };
}

function writeTexel(data, texelIndex, rgba) {
  const base = texelIndex * 4;
  data[base + 0] = rgba[0];
  data[base + 1] = rgba[1];
  data[base + 2] = rgba[2];
  data[base + 3] = rgba[3];
}

export function packBvhNodes(nodes, maxTextureSize) {
  const texelsPerNode = 3;
  const texelCount = nodes.length * texelsPerNode;
  const layout = computeTextureLayout(texelCount, maxTextureSize);
  const data = new Float32Array(layout.width * layout.height * 4);

  // First pass: compute leftFirst for leaf nodes (index into triIndexList)
  let triIndexOffset = 0;
  const leafFirstIndices = new Array(nodes.length);
  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    if (node.primCount > 0) {
      leafFirstIndices[i] = triIndexOffset;
      triIndexOffset += node.triIndices.length;
    }
  }

  for (let i = 0; i < nodes.length; i += 1) {
    const node = nodes[i];
    const base = i * texelsPerNode;
    const primCount = node.primCount;
    const rightChild = node.rightChild;

    // For leaf nodes, leftFirst is the starting index in the triangle index list
    // For internal nodes, leftFirst is the left child node index
    const leftFirst = primCount > 0 ? leafFirstIndices[i] : node.leftFirst;

    writeTexel(data, base + 0, [node.bounds.minX, node.bounds.minY, node.bounds.minZ, leftFirst]);
    writeTexel(data, base + 1, [node.bounds.maxX, node.bounds.maxY, node.bounds.maxZ, primCount]);
    writeTexel(data, base + 2, [rightChild, 0, 0, 0]);
  }

  return {
    data,
    width: layout.width,
    height: layout.height,
    texelsPerNode
  };
}

export function packTriangles(tris, positions, maxTextureSize) {
  const texelsPerTri = 3;
  const triCount = tris.length;
  const texelCount = triCount * texelsPerTri;
  const layout = computeTextureLayout(texelCount, maxTextureSize);
  const data = new Float32Array(layout.width * layout.height * 4);

  for (let i = 0; i < triCount; i += 1) {
    const tri = tris[i];
    const i0 = tri[0] * 3;
    const i1 = tri[1] * 3;
    const i2 = tri[2] * 3;

    const v0 = [positions[i0], positions[i0 + 1], positions[i0 + 2], 0];
    const v1 = [positions[i1], positions[i1 + 1], positions[i1 + 2], 0];
    const v2 = [positions[i2], positions[i2 + 1], positions[i2 + 2], 0];

    const base = i * texelsPerTri;
    writeTexel(data, base + 0, v0);
    writeTexel(data, base + 1, v1);
    writeTexel(data, base + 2, v2);
  }

  return {
    data,
    width: layout.width,
    height: layout.height,
    texelsPerTri
  };
}

export function packTriNormals(tris, normals, maxTextureSize) {
  const texelsPerTri = 3;
  const triCount = tris.length;
  const texelCount = triCount * texelsPerTri;
  const layout = computeTextureLayout(texelCount, maxTextureSize);
  const data = new Float32Array(layout.width * layout.height * 4);

  for (let i = 0; i < triCount; i += 1) {
    const tri = tris[i];
    const i0 = tri[0] * 3;
    const i1 = tri[1] * 3;
    const i2 = tri[2] * 3;

    const n0 = [normals[i0], normals[i0 + 1], normals[i0 + 2], 0];
    const n1 = [normals[i1], normals[i1 + 1], normals[i1 + 2], 0];
    const n2 = [normals[i2], normals[i2 + 1], normals[i2 + 2], 0];

    const base = i * texelsPerTri;
    writeTexel(data, base + 0, n0);
    writeTexel(data, base + 1, n1);
    writeTexel(data, base + 2, n2);
  }

  return {
    data,
    width: layout.width,
    height: layout.height,
    texelsPerTri
  };
}

export function packTriColors(triColors, maxTextureSize) {
  const triCount = triColors.length / 3;
  const texelCount = triCount;
  const layout = computeTextureLayout(texelCount, maxTextureSize);
  const data = new Float32Array(layout.width * layout.height * 4);
  for (let i = 0; i < triCount; i += 1) {
    const base = i * 3;
    writeTexel(data, i, [triColors[base], triColors[base + 1], triColors[base + 2], 1]);
  }
  return {
    data,
    width: layout.width,
    height: layout.height,
    texelsPerTri: 1
  };
}

export function packTriIndices(triIndexBuffer, maxTextureSize) {
  const texelCount = triIndexBuffer.length;
  const layout = computeTextureLayout(texelCount, maxTextureSize);
  const data = new Float32Array(layout.width * layout.height * 4);
  for (let i = 0; i < triIndexBuffer.length; i += 1) {
    writeTexel(data, i, [triIndexBuffer[i], 0, 0, 0]);
  }
  return {
    data,
    width: layout.width,
    height: layout.height,
    texelsPerIndex: 1
  };
}

export function computeLayoutForTests(texelCount, maxSize, preferredWidth) {
  return computeTextureLayout(texelCount, maxSize, preferredWidth);
}
