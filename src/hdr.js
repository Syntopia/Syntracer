function readLine(bytes, start) {
  let end = start;
  while (end < bytes.length && bytes[end] !== 0x0a) {
    end += 1;
  }
  const line = new TextDecoder("ascii").decode(bytes.slice(start, end));
  return { line, next: end + 1 };
}

function parseHeader(bytes) {
  let offset = 0;
  let lineInfo = readLine(bytes, offset);
  let line = lineInfo.line;
  offset = lineInfo.next;
  if (!line.startsWith("#?RADIANCE") && !line.startsWith("#?RGBE")) {
    throw new Error("Unsupported HDR header.");
  }

  while (offset < bytes.length) {
    lineInfo = readLine(bytes, offset);
    line = lineInfo.line;
    offset = lineInfo.next;
    if (line.trim() === "") {
      break;
    }
  }

  lineInfo = readLine(bytes, offset);
  line = lineInfo.line;
  offset = lineInfo.next;
  const match = line.match(/-Y\s+(\d+)\s+\+X\s+(\d+)/);
  if (!match) {
    throw new Error("Failed to parse HDR resolution.");
  }
  const height = Number(match[1]);
  const width = Number(match[2]);
  if (!Number.isFinite(width) || !Number.isFinite(height)) {
    throw new Error("Invalid HDR dimensions.");
  }
  return { width, height, offset };
}

function decodeRLE(bytes, width, height, offset) {
  const rgbe = new Uint8Array(width * height * 4);
  let pos = offset;
  const scanline = new Uint8Array(width * 4);

  for (let y = 0; y < height; y += 1) {
    if (pos + 4 > bytes.length) {
      throw new Error("Unexpected end of HDR data.");
    }
    if (bytes[pos] !== 2 || bytes[pos + 1] !== 2) {
      throw new Error("Unsupported HDR encoding (non-RLE).");
    }
    const hi = bytes[pos + 2];
    const lo = bytes[pos + 3];
    const scanlineWidth = (hi << 8) | lo;
    if (scanlineWidth !== width) {
      throw new Error("HDR scanline width mismatch.");
    }
    pos += 4;

    for (let c = 0; c < 4; c += 1) {
      let x = 0;
      while (x < width) {
        if (pos >= bytes.length) {
          throw new Error("Unexpected end of HDR data.");
        }
        const count = bytes[pos++];
        if (count > 128) {
          const run = count - 128;
          if (pos >= bytes.length) {
            throw new Error("Unexpected end of HDR data.");
          }
          const value = bytes[pos++];
          for (let i = 0; i < run; i += 1) {
            scanline[c * width + x] = value;
            x += 1;
          }
        } else {
          const run = count;
          for (let i = 0; i < run; i += 1) {
            if (pos >= bytes.length) {
              throw new Error("Unexpected end of HDR data.");
            }
            scanline[c * width + x] = bytes[pos++];
            x += 1;
          }
        }
      }
    }

    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      rgbe[idx] = scanline[x];
      rgbe[idx + 1] = scanline[width + x];
      rgbe[idx + 2] = scanline[2 * width + x];
      rgbe[idx + 3] = scanline[3 * width + x];
    }
  }

  return rgbe;
}

function rgbeToFloat(rgbe, width, height) {
  const out = new Float32Array(width * height * 4);
  for (let i = 0; i < width * height; i += 1) {
    const r = rgbe[i * 4];
    const g = rgbe[i * 4 + 1];
    const b = rgbe[i * 4 + 2];
    const e = rgbe[i * 4 + 3];
    if (e === 0) {
      out[i * 4] = 0;
      out[i * 4 + 1] = 0;
      out[i * 4 + 2] = 0;
      out[i * 4 + 3] = 1;
      continue;
    }
    const scale = Math.pow(2, e - 128 - 8);
    out[i * 4] = r * scale;
    out[i * 4 + 1] = g * scale;
    out[i * 4 + 2] = b * scale;
    out[i * 4 + 3] = 1;
  }
  return out;
}

export async function loadHDR(url, logger) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to fetch HDR: ${url}`);
  }
  const buffer = await res.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  const header = parseHeader(bytes);
  const rgbe = decodeRLE(bytes, header.width, header.height, header.offset);
  const data = rgbeToFloat(rgbe, header.width, header.height);
  if (logger) {
    logger.info(`Environment map size ${header.width}x${header.height}`);
  }
  return { width: header.width, height: header.height, data };
}
