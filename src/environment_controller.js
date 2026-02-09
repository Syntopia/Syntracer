import {
  ANALYTIC_SKY_ID,
  analyticSkyCacheKey,
  generateAnalyticSkyEnvironment,
  normalizeAnalyticSkySettings,
  UNIFORM_ENV_ID,
  uniformEnvCacheKey,
  normalizeUniformEnvSettings,
  generateUniformEnvironment
} from "./analytic_sky.js";
import { loadHDR, buildEnvSamplingData } from "./hdr.js";

export function createEnvironmentController(deps) {
  const {
    envSelect,
    envIntensityInput,
    envBgIntensityInput,
    envUniformColorInput,
    envRotationInput,
    envRotationVerticalInput,
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

  function hexToRgb01(hex, label) {
    const value = String(hex || "");
    const match = value.match(/^#([0-9a-fA-F]{6})$/);
    if (!match) {
      throw new Error(`${label} must be a #RRGGBB color.`);
    }
    const raw = match[1];
    return [
      Number.parseInt(raw.slice(0, 2), 16) / 255,
      Number.parseInt(raw.slice(2, 4), 16) / 255,
      Number.parseInt(raw.slice(4, 6), 16) / 255
    ];
  }

  function getUniformEnvSettingsFromUi() {
    const color = hexToRgb01(envUniformColorInput?.value, "Uniform environment color");
    return normalizeUniformEnvSettings({ color });
  }

  function updateEnvironmentVisibility() {
    const analyticControls = document.querySelector(".analytic-sky-controls");
    const uniformControls = document.querySelector(".uniform-env-controls");
    const selected = envSelect?.value || "";
    if (analyticControls) {
      analyticControls.style.display = selected === ANALYTIC_SKY_ID ? "block" : "none";
    }
    if (uniformControls) {
      uniformControls.style.display = selected === UNIFORM_ENV_ID ? "block" : "none";
    }
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

  async function loadEnvironment(url, options = {}) {
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
      const analyticSettings = options.analyticSettings ?? null;
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
    } else if (url === UNIFORM_ENV_ID) {
      const uniformSettings = options.uniformSettings ?? null;
      if (!uniformSettings) {
        throw new Error("Uniform environment settings are required.");
      }
      const settings = normalizeUniformEnvSettings(uniformSettings);
      const key = `${UNIFORM_ENV_ID}:${uniformEnvCacheKey(settings)}`;
      if (envCache.has(key)) {
        env = envCache.get(key);
      } else {
        env = await generateUniformEnvironment(settings, logger);
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
    renderState.envBgIntensity = clamp(Number(envBgIntensityInput?.value ?? 1.0), 0, 2.0);
    renderState.envRotationDeg = clamp(Number(envRotationInput?.value ?? 0), -180, 180);
    renderState.envRotationVerticalDeg = clamp(Number(envRotationVerticalInput?.value ?? 0), -180, 180);
    renderState.envMaxLuminance = clamp(Number(envMaxLumInput?.value ?? 50), 0, 500);
    const url = envSelect.value || null;
    let envChanged = false;

    try {
      if (url === ANALYTIC_SKY_ID) {
        const analyticSettings = getAnalyticSkySettingsFromUi();
        const analyticKey = `${ANALYTIC_SKY_ID}:${analyticSkyCacheKey(analyticSettings)}`;
        if (url !== renderState.envUrl || analyticKey !== renderState.envCacheKey) {
          await loadEnvironment(url, { analyticSettings });
          envChanged = true;
        }
      } else if (url === UNIFORM_ENV_ID) {
        const uniformSettings = getUniformEnvSettingsFromUi();
        const uniformKey = `${UNIFORM_ENV_ID}:${uniformEnvCacheKey(uniformSettings)}`;
        if (url !== renderState.envUrl || uniformKey !== renderState.envCacheKey) {
          await loadEnvironment(url, { uniformSettings });
          envChanged = true;
        }
      } else if (url !== renderState.envUrl) {
        await loadEnvironment(url);
        envChanged = true;
      }
      resetAccumulation(envChanged ? "Environment updated." : "Environment settings updated.");
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
        const file = String(entry?.file || "").toLowerCase();
        const name = String(entry?.name || "").toLowerCase();
        if (file === "white.hdr" || name === "white") {
          continue;
        }
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
