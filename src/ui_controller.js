export function createUiController(deps) {
  const {
    tabButtons,
    tabPanels,
    materialSelect,
    dofEnableToggle,
    maxFramesInput,
    clipDistanceInput,
    renderState,
    clamp,
    getSceneData
  } = deps;

  function setActiveTab(name) {
    tabButtons.forEach((button) => {
      button.classList.toggle("active", button.dataset.tabButton === name);
    });
    tabPanels.forEach((panel) => {
      panel.classList.toggle("active", panel.dataset.tabPanel === name);
    });
  }

  function updateMaterialVisibility() {
    const mode = materialSelect?.value || "metallic";
    const metallicGroup = document.querySelector(".material-metallic");
    const matteGroup = document.querySelector(".material-matte");
    const surfaceGroup = document.querySelector(".material-surface");
    if (metallicGroup) metallicGroup.style.display = mode === "metallic" ? "block" : "none";
    if (matteGroup) matteGroup.style.display = mode === "matte" ? "block" : "none";
    if (surfaceGroup) {
      surfaceGroup.style.display = (mode === "surface-glass" || mode === "translucent-plastic") ? "block" : "none";
    }
  }

  function updateDofVisibility() {
    const controls = document.querySelector(".dof-controls");
    if (!controls) return;
    controls.style.display = dofEnableToggle?.checked ? "block" : "none";
  }

  function setSliderValue(input, value) {
    if (!input) return;
    input.value = String(value);
    const valueInput = document.querySelector(`.value-input[data-for="${input.id}"]`);
    if (valueInput) {
      const step = parseFloat(input.step) || 1;
      const decimals = step < 1 ? Math.max(0, -Math.floor(Math.log10(step))) : 0;
      valueInput.value = Number(value).toFixed(decimals);
    }
  }

  function updateRenderLimits() {
    const raw = Number(maxFramesInput?.value);
    const maxFrames = clamp(Number.isFinite(raw) ? Math.floor(raw) : 0, 0, 2000);
    renderState.maxFrames = maxFrames;
  }

  function updateClipRange() {
    const sceneData = getSceneData();
    if (!clipDistanceInput || !sceneData) return;
    const max = Math.max(1, sceneData.sceneScale * 4);
    clipDistanceInput.max = max.toFixed(2);
    const current = Number(clipDistanceInput.value) || 0;
    if (current > max) {
      clipDistanceInput.value = max.toFixed(2);
      clipDistanceInput.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  return {
    setActiveTab,
    updateMaterialVisibility,
    updateDofVisibility,
    setSliderValue,
    updateRenderLimits,
    updateClipRange
  };
}

