const WASM_MODULE_PATH = "./wasm/ses/ses_wasm.js";
const BUILD_HINT = "Run `mamba run -n wave bash scripts/build_ses_wasm.sh` to build the WASM module.";

let wasmInitPromise = null;
let wasmModule = null;

export function surfaceWasmReady() {
  return Boolean(wasmModule);
}

export function packAtomsForWasm(atoms) {
  const centers = new Float32Array(atoms.length * 3);
  const radii = new Float32Array(atoms.length);
  for (let i = 0; i < atoms.length; i += 1) {
    const atom = atoms[i];
    const base = i * 3;
    centers[base] = atom.center[0];
    centers[base + 1] = atom.center[1];
    centers[base + 2] = atom.center[2];
    radii[i] = atom.radius;
  }
  return { centers, radii };
}

export async function initSurfaceWasm() {
  if (wasmModule) {
    return wasmModule;
  }
  if (!wasmInitPromise) {
    wasmInitPromise = (async () => {
      try {
        const mod = await import(WASM_MODULE_PATH);
        if (typeof mod.default === "function") {
          await mod.default();
        }
        if (typeof mod.compute_ses !== "function") {
          throw new Error("compute_ses export not found in WASM module.");
        }
        wasmModule = mod;
        return mod;
      } catch (err) {
        wasmInitPromise = null;
        const message = err?.message || String(err);
        throw new Error(`WASM surface module not built. ${BUILD_HINT} (${message})`);
      }
    })();
  }
  return wasmInitPromise;
}

export async function computeSESWasm(atoms, options = {}) {
  const mod = await initSurfaceWasm();
  const { centers, radii } = packAtomsForWasm(atoms);
  const probeRadius = options.probeRadius ?? 1.4;
  const resolution = options.resolution ?? 0.25;
  const returnSAS = options.sas ?? false;
  const smoothNormals = options.smoothNormals ?? false;
  const result = mod.compute_ses(
    centers,
    radii,
    probeRadius,
    resolution,
    returnSAS,
    smoothNormals
  );
  return {
    vertices: result.vertices,
    normals: result.normals,
    indices: result.indices
  };
}
