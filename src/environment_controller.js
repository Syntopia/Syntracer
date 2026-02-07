import {
  ANALYTIC_SKY_ID,
  analyticSkyCacheKey,
  generateAnalyticSkyEnvironment,
  normalizeAnalyticSkySettings
} from "./analytic_sky.js";
import { loadHDR, buildEnvSamplingData } from "./hdr.js";

export function createEnvironmentController(deps) {
  const {
    envSelect,
    envIntensityInput,
    envMaxLumInput,
    analyticSkyResolutionSelect,
    analyticSkyTurbidityInput,
    analyticSkySunAzimuthInput,
    analyticSkySunElevationInput,
    analyticSkyIntensityInput,
    analyticSkySunIntensityInput,
    analyticSkySunRadiusInput,
    analyticSkyGroundAlbedoInput,
    analyticSkyHorizonSoftnessInput,
    renderState,
    envCache,
    logger,
    clamp,
    requireNumberInput,
    setLoadingOverlay,
    resetAccumulation,
    createEnvTexture,
    createCdfTexture,
    getGlState
  } = deps;

  function parseAnalyticResolution(value) {
    if (!value || typeof value !== "string") {
      throw new Error("Analytic sky resolution is missing.");
    }
    const parts = value.toLowerCase().split("x").map((v) => Number(v));
    if (parts.length !== 2 || !Number.isInteger(parts[0]) || !Number.isInteger(parts[1])) {
      throw new Error(`Invalid analytic sky resolution: ${value}`);
    }
    return { width: parts[0], height: parts[1] };
  }

  function getAnalyticSkySettingsFromUi() {
    const { width, height } = parseAnalyticResolution(analyticSkyResolutionSelect?.value || "");
    return normalizeAnalyticSkySettings({
      width,
      height,
      turbidity: requireNumberInput(analyticSkyTurbidityInput, "Analytic sky turbidity"),
      sunAzimuthDeg: requireNumberInput(analyticSkySunAzimuthInput, "Analytic sky sun azimuth"),
      sunElevationDeg: requireNumberInput(analyticSkySunElevationInput, "Analytic sky sun elevation"),
      skyIntensity: requireNumberInput(analyticSkyIntensityInput, "Analytic sky intensity"),
      sunIntensity: requireNumberInput(analyticSkySunIntensityInput, "Analytic sky sun intensity"),
      sunAngularRadiusDeg: requireNumberInput(analyticSkySunRadiusInput, "Analytic sky sun radius"),
      groundAlbedo: requireNumberInput(analyticSkyGroundAlbedoInput, "Analytic sky ground albedo"),
      horizonSoftness: requireNumberInput(analyticSkyHorizonSoftnessInput, "Analytic sky horizon softness")
    });
  }

  function updateEnvironmentVisibility() {
    const analyticControls = document.querySelector(".analytic-sky-controls");
    if (!analyticControls) return;
    const selected = envSelect?.value || "";
    analyticControls.style.display = selected === ANALYTIC_SKY_ID ? "block" : "none";
  }

  function uploadEnvironmentToGl(env) {
    const glState = getGlState();
    if (!glState || !env) return;
    const gl = glState.gl;
    if (glState.envTex && glState.envTex !== glState.blackEnvTex) {
      gl.deleteTexture(glState.envTex);
    }
    if (glState.envMarginalCdfTex && glState.envMarginalCdfTex !== glState.dummyCdfTex) {
      gl.deleteTexture(glState.envMarginalCdfTex);
    }
    if (
      glState.envConditionalCdfTex
      && glState.envConditionalCdfTex !== glState.dummyCdfTex
      && glState.envConditionalCdfTex !== glState.envMarginalCdfTex
    ) {
      gl.deleteTexture(glState.envConditionalCdfTex);
    }

    glState.envTex = createEnvTexture(gl, env.width, env.height, env.data);
    glState.envMarginalCdfTex = createCdfTexture(
      gl,
      env.samplingData.marginalCdf,
      env.samplingData.height + 1,
      1
    );
    glState.envConditionalCdfTex = createCdfTexture(
      gl,
      env.samplingData.conditionalCdf,
      env.samplingData.width + 1,
      env.samplingData.height
    );
    glState.envSize = [env.width, env.height];
    glState.envUrl = renderState.envUrl;
    glState.envCacheKey = env.version || renderState.envCacheKey;
  }

  async function loadEnvironment(url, analyticSettings = null) {
    const glState = getGlState();
    if (!url) {
      renderState.envUrl = null;
      renderState.envCacheKey = null;
      renderState.envData = null;
      if (glState) {
        const gl = glState.gl;
        if (glState.envTex && glState.envTex !== glState.blackEnvTex) {
          gl.deleteTexture(glState.envTex);
        }
        if (glState.envMarginalCdfTex && glState.envMarginalCdfTex !== glState.dummyCdfTex) {
          gl.deleteTexture(glState.envMarginalCdfTex);
        }
        if (glState.envConditionalCdfTex && glState.envConditionalCdfTex !== glState.dummyCdfTex) {
          gl.deleteTexture(glState.envConditionalCdfTex);
        }
        glState.envTex = glState.blackEnvTex;
        glState.envMarginalCdfTex = glState.dummyCdfTex;
        glState.envConditionalCdfTex = glState.dummyCdfTex;
        glState.envSize = [1, 1];
        glState.envUrl = null;
        glState.envCacheKey = null;
      }
      return;
    }

    let env = null;
    if (url === ANALYTIC_SKY_ID) {
      if (!analyticSettings) {
        throw new Error("Analytic sky settings are required.");
      }
      const settings = normalizeAnalyticSkySettings(analyticSettings);
      const key = `${ANALYTIC_SKY_ID}:${analyticSkyCacheKey(settings)}`;
      if (envCache.has(key)) {
        env = envCache.get(key);
      } else {
        logger.info("Generating analytic sky (Preetham/Perez) with WebGPU...");
        env = await generateAnalyticSkyEnvironment(settings, logger);
        env.samplingData = buildEnvSamplingData(env.data, env.width, env.height);
        env.version = key;
        envCache.set(key, env);
      }
    } else if (envCache.has(url)) {
      env = envCache.get(url);
    } else {
      logger.info(`Loading environment: ${url}`);
      env = await loadHDR(url, logger);
      env.samplingData = buildEnvSamplingData(env.data, env.width, env.height);
      env.version = url;
      envCache.set(url, env);
    }

    renderState.envData = env;
    renderState.envUrl = url;
    renderState.envCacheKey = env.version || url;

    if (getGlState() && renderState.envData) {
      uploadEnvironmentToGl(renderState.envData);
    }
  }

  async function updateEnvironmentState() {
    setLoadingOverlay(true, "Loading environment...");
    renderState.envIntensity = clamp(Number(envIntensityInput.value), 0, 1.0);
    renderState.envMaxLuminance = clamp(Number(envMaxLumInput?.value ?? 50), 0, 500);
    const url = envSelect.value || null;
    let envChanged = false;

    try {
      if (url === ANALYTIC_SKY_ID) {
        const analyticSettings = getAnalyticSkySettingsFromUi();
        const analyticKey = `${ANALYTIC_SKY_ID}:${analyticSkyCacheKey(analyticSettings)}`;
        if (url !== renderState.envUrl || analyticKey !== renderState.envCacheKey) {
          await loadEnvironment(url, analyticSettings);
          envChanged = true;
        }
      } else if (url !== renderState.envUrl) {
        await loadEnvironment(url);
        envChanged = true;
      }
      resetAccumulation(envChanged ? "Environment updated." : "Environment intensity updated.");
    } catch (err) {
      logger.error(err.message || String(err));
    }

    setLoadingOverlay(false);
  }

  async function loadEnvManifest() {
    try {
      const res = await fetch("assets/env/manifest.json");
      if (!res.ok) return;
      const manifest = await res.json();

      for (const entry of manifest) {
        const option = document.createElement("option");
        option.value = `assets/env/${entry.file}`;
        option.textContent = entry.name;
        envSelect.appendChild(option);
      }
    } catch (err) {
      console.warn("Could not load HDR manifest:", err);
    }
  }

  return {
    updateEnvironmentVisibility,
    uploadEnvironmentToGl,
    updateEnvironmentState,
    loadEnvManifest
  };
}

