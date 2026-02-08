# Syntracer

A real-time, progressive path tracer for molecular visualization running entirely in the browser. Built on WebGL2 with CPU-side SAH BVH construction and GPU fragment-shader traversal.

**[Live Demo](https://syntopia.github.io/webgl_raytracer/)**

Created by Mikael Hvidtfeldt Christensen, together with Claude Code and OpenAI Codex.

---

## Features at a Glance

- Path tracing with importance-sampled environment and direct lighting
- PDB, SDF/MOL, and Gaussian CUBE file import
- Seven molecular display styles including cartoon ribbons and solvent-excluded surfaces
- Four physically-based material models
- Analytic Preetham-Perez sky, uniform, and HDR environment lighting
- Volumetric rendering and isosurface extraction
- Progressive accumulation with configurable quality and tone mapping
- Real-time camera navigation with PCA-based molecular alignment

---

## Supported File Formats

| Format | Description |
|--------|-------------|
| **PDB** | Protein Data Bank — full residue/chain/secondary-structure support (HELIX, SHEET records). Automatically partitions into protein, ligand, water, and metal ion objects. |
| **SDF / MOL** | Structure Data Format — small-molecule import with 3D coordinates and bond tables. |
| **CUBE** | Gaussian cube files — molecular geometry plus volumetric grid data (electron density, orbitals). Voxel data is reordered from z-fastest to internal x-fastest layout. |
| **HDR** | Radiance RGBE environment maps for image-based lighting. |

Auto-detection selects the correct parser based on file extension. Multiple files can be loaded simultaneously; each appends to the scene graph.

A built-in library provides quick access to common molecules (caffeine, aspirin, ibuprofen, benzene, ethanol, glucose) and several proteins (crambin, HIV protease, streptavidin, porin, B-DNA, hemoglobin). PDB files can also be fetched by ID directly from the RCSB.

---

## Display Styles

Each scene-graph object can carry multiple representations with independent display styles and visibility. The available styles depend on the object type:

### Ball-and-Stick
Atoms rendered as spheres scaled by element radius, bonds as cylinders connecting bonded atom pairs. Configurable atom radius scale and bond radius.

### Van der Waals (Space-filling)
Each atom drawn as a sphere at its full Van der Waals radius. No bonds shown.

### Stick
Bonds only — cylinders between bonded atoms with no atom spheres.

### Cartoon (Backbone Ribbon)
Secondary-structure visualization for proteins. Alpha helices are drawn as 3D ribbons with circular cross-sections. Beta sheets use flat polygonal strands with arrowhead caps at C-termini. Coil regions connect with smooth spline tubes. H-bond detection drives sheet-strand orientation and can optionally be visualized for debugging. Requires at least 4 backbone residues (N, CA, C, O atoms per residue).

### Solvent-Excluded Surface (SES)
Molecular surface computed via GPU-accelerated distance-field evaluation (WebGL2 fragment shaders with MIN blending) followed by CPU marching-cubes triangulation. Probe radius (default 1.4 A) and grid resolution are adjustable.

### Isosurface
For objects with volumetric grid data (e.g. cube files). Extracts a triangulated surface at a configurable iso-level (log scale). Positive and negative lobes are colored independently — useful for visualizing molecular orbitals.

### Volumetric
Ray-marched volume rendering with no intermediate triangle geometry. Configurable value window, opacity scale, step size, and transfer function presets (orbital, grayscale, heatmap). Positive and negative regions are colored separately.

---

## Material System

Each representation references a material model. Four physically-based models are available:

### Metallic (PBR)
Cook-Torrance microfacet BRDF with GGX distribution.
- **Metallic** (0 -- 1) — interpolates between dielectric and metallic response
- **Roughness** (0.04 -- 1) — surface micro-roughness
- **Rim boost** (0 -- 1) — edge-lighting enhancement for scientific illustration
- **Opacity** (0 -- 1) — alpha blending

### Matte Protein
Oren-Nayar diffuse model with a low-intensity specular lobe, tuned for soft protein rendering.
- **Specular F0** (0 -- 0.08) — Fresnel reflectance at normal incidence
- **Specular roughness** (0.1 -- 1)
- **Diffuse roughness** (0 -- 1) — Oren-Nayar sigma
- **Wrap diffuse** (0 -- 0.5) — light wrap-around for softer shading

### Surface Glass
Dielectric Fresnel model with transmission tint for transparent molecular surfaces.
- **IOR** (1.0 -- 2.5) — index of refraction
- **Transmission tint** (0 -- 1) — color absorption through the surface
- **Opacity** (0 -- 1)

### Translucent Plastic
Similar to surface glass with subsurface-style translucency.
- **IOR** (1.0 -- 2.5)
- **Transmission tint** (0 -- 1)
- **Opacity** (0 -- 1)

Atom colors follow CPK/Jmol element coloring by default.

---

## Environment & Lighting

### Analytic Sky (Preetham-Perez)
Physically-based atmospheric scattering model. Controls:
- Turbidity (1 -- 10) — atmosphere clarity
- Sun azimuth and elevation
- Sky and sun intensity
- Sun angular radius
- Ground albedo and horizon softness
- Rendered to texture at selectable resolutions (512x256, 1024x512, 2048x1024)

### Uniform Environment
Single-color constant illumination with a color picker.

### HDR Environment Maps
Radiance `.hdr` files with importance sampling via precomputed marginal and conditional CDFs. Environment rotation (horizontal and vertical) and intensity are adjustable. A max-luminance clamp reduces fireflies from bright sun pixels.

### Direct Lights
Two camera-relative directional cone lights:
- **Key light** — default on, azimuth -40 deg, elevation -30 deg, intensity 5.0, 22 deg angular extent
- **Fill light** — default on, azimuth +40 deg, elevation 0 deg, intensity 0.6, 50 deg extent

Each light has configurable azimuth, elevation, intensity, cone extent angle, color, and an enable toggle. Soft shadows are produced by sampling within the cone extent. A global shadow toggle and ambient light (intensity + color) are also provided.

---

## Camera Controls

### Mouse

| Action | Effect |
|--------|--------|
| Left drag | Orbit — rotate around target. Yaw rotates around the camera's local up axis; pitch around the local right axis. |
| Right drag / Shift + left drag | Pan camera target in the image plane |
| Ctrl + left drag | Dolly zoom |
| Scroll wheel | Zoom (distance clamped to 0.1x -- 20x scene scale) |

### Keyboard

| Key | Action |
|-----|--------|
| **W / A / S / D** | Move camera target forward / left / backward / right in camera space |
| **Q / E** | Roll camera counter-clockwise / clockwise around the view direction |
| **Z** | Level the camera so the z = 0 ground plane appears horizontal |
| **F** | Set depth-of-field focus distance to the surface under the mouse cursor |
| **C** | Center the orbit target on the object under the mouse cursor |
| **1** | Align camera to PCA axis 3 of the hovered object (view along the axis of smallest variance — the "flat" face) |
| **2** | Align camera to PCA axis 2 (medium variance) |
| **3** | Align camera to PCA axis 1 (largest variance — the "thin" edge) |

PCA alignment gathers all atom positions from the hovered scene-graph object, computes the covariance matrix, extracts eigenvectors via power iteration with deflation, and orients the camera so the chosen principal axis points along the view direction.

---

## Rendering Pipeline

### Path Tracing
Monte Carlo path tracing runs in a WebGL2 fragment shader. Each frame traces one or more samples per pixel (configurable 1 -- 8) and accumulates into a floating-point texture. The display pass reads the accumulation buffer and applies tone mapping and exposure.

- **Max bounces**: 0 -- 6
- **Russian roulette**: starts at bounce 1 to limit path length without bias
- **Multiple importance sampling**: combines environment-map sampling with BSDF sampling using balance heuristic weights

### Acceleration Structure
A **Surface-Area-Heuristic (SAH) BVH** is built on the CPU over a unified primitive set (spheres, cylinders, triangles). The flattened BVH is packed into a 2D texture (4 vec4 per node) for GPU traversal with stackless early-termination.

### Progressive Accumulation
Frames accumulate until the configurable limit (0 = unlimited, default 100). Camera interaction instantly resets accumulation and switches to a fast render scale for responsive feedback.

### Quality Controls
- **Render scale**: 0.25x -- 1.0x resolution
- **Fast scale**: separate lower resolution used during camera interaction (default 0.25x)
- **Max frames**: accumulation budget
- **Exposure**: 0 -- 5

### Tone Mapping
- **ACES Filmic** (default) — Academy Color Encoding System
- **Reinhard** — simple luminance mapping
- **Linear** — no mapping (HDR passthrough)

---

## Volume Rendering

When volumetric grid data is present (from cube files or nitrogen-density generation from PDB), two visualization modes are available:

### Isosurface Representation
Marching-cubes extraction at a configurable iso-level. Positive and negative lobes receive independent colors — ideal for orbital visualization.

### Volumetric Representation
Direct ray marching through the volume grid in the fragment shader.
- Value window min/max (normalized)
- Opacity scale
- Step size (A)
- Transfer function presets: orbital (green/red), grayscale, heatmap

### Volume Render Settings (global)
- Volume color, density scale, opacity scale
- Ray step size and max steps per ray
- Density threshold

---

## Clipping / Slice Planes

An optional slice plane culls geometry on one side of a plane.
- **Slice distance** (0 -- 100 A) — offset from the scene center along the plane normal
- **Lock plane direction** — when enabled, the plane normal is fixed in world space; when unlocked, it follows the camera forward direction

---

## Depth of Field

Physical thin-lens depth-of-field with disk sampling.
- **Aperture radius** (0 -- 1 A) — larger values produce stronger bokeh
- **Focus distance** (0.1 -- 200 A) — set manually or picked interactively with the **F** key

---

## Debug Visualization

A visualization-mode selector offers four modes:
1. **Normal (Path Tracing)** — standard rendering
2. **Surface Normals** — RGB-encoded normal vectors
3. **BVH Traversal Cost** — heatmap showing ray-BVH intersection cost per pixel
4. **Depth** — grayscale distance from camera

---

## Scene Graph

The scene graph organizes loaded data into a tree of objects and representations:

- **Object types**: Protein, Ligand, Water, Metal ions, Volume
- PDB files are automatically partitioned into these categories
- Each object can have multiple representations with independent display styles and materials
- Per-object and per-representation visibility toggles
- Selection drives the Representation tab controls
- Adding a new file appends objects to the existing scene rather than replacing it

---

## Hover & Picking

Moving the mouse over the rendered scene performs real-time ray picking:
- A bounding-box overlay highlights the object under the cursor
- An info overlay shows the atom name, element, residue, and chain — or bond endpoint atoms
- Picking respects the active clipping plane
- The **F**, **C**, and **1/2/3** keys all operate on the object or primitive under the cursor

---

## Running Locally

Serve the project with any static file server. For example, with uvicorn:

```bash
mamba run -n wave uvicorn server:app --reload
```

Then open `http://localhost:8000`.

### Downloading HDR Environment Maps

```bash
python tools/download_envs.py
```

This fetches 1k-resolution HDRI files from Polyhaven into `assets/env/`.

### Running Tests

```bash
npm test
```

or

```bash
mamba run -n wave node --test
```

---

## Architecture

```
src/
  main.js                  Application entry, UI, camera, render loop
  webgl.js                 WebGL2 init, shader compilation, uniforms, fragment shader
  molecular.js             PDB / SDF / CUBE parsers, bond generation
  scene_graph.js           Scene graph data model
  scene_graph_compile.js   Scene graph to geometry compilation
  representation_builder.js  Geometry builders for each display style
  bvh.js                   SAH BVH construction and flattening
  ray_pick.js              CPU ray-primitive intersection for picking
  camera_orbit.js          Quaternion orbit camera math
  surface_webgl.js         GPU distance-field SES computation + marching cubes
  cartoon.js               Cartoon ribbon geometry, H-bond detection
  volume.js                Volume grid processing, isosurface extraction
  analytic_sky.js          Preetham-Perez sky model
  hdr.js                   HDR / RGBE parsing, importance-sampling CDF
  input_controller.js      Pointer state, canvas-to-ray conversion
index.html                 UI layout, slider components, tab system
tools/
  download_envs.py         HDR environment map downloader
```
