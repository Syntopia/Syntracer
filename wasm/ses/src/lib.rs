mod tables;

use js_sys::{Float32Array, Object, Reflect, Uint32Array};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

use tables::{EDGE_TABLE, TRI_TABLE};

#[derive(Clone, Copy)]
struct Atom {
    center: [f32; 3],
    radius: f32,
}

struct DistanceGrid {
    resolution: f32,
    max_dist: f32,
    default_value: f32,
    min: [f32; 3],
    nx: usize,
    ny: usize,
    nz: usize,
    data: Vec<f32>,
}

impl DistanceGrid {
    fn new(bounds_min: [f32; 3], bounds_max: [f32; 3], resolution: f32, padding: f32, max_index_range: f32) -> Result<Self, String> {
        let max_dist = max_index_range * resolution;
        let default_value = max_dist;
        let min = [
            bounds_min[0] - padding,
            bounds_min[1] - padding,
            bounds_min[2] - padding,
        ];
        let _max = [
            bounds_max[0] + padding,
            bounds_max[1] + padding,
            bounds_max[2] + padding,
        ];
        let size = [
            _max[0] - min[0],
            _max[1] - min[1],
            _max[2] - min[2],
        ];
        let nx = (size[0] / resolution).ceil() as usize + 1;
        let ny = (size[1] / resolution).ceil() as usize + 1;
        let nz = (size[2] / resolution).ceil() as usize + 1;
        let total = nx
            .checked_mul(ny)
            .and_then(|v| v.checked_mul(nz))
            .ok_or_else(|| "Grid dimensions too large".to_string())?;
        let data = vec![default_value; total];
        Ok(Self {
            resolution,
            max_dist,
            default_value,
            min,
            nx,
            ny,
            nz,
            data,
        })
    }

    #[inline]
    fn index(&self, ix: usize, iy: usize, iz: usize) -> usize {
        ix + iy * self.nx + iz * self.nx * self.ny
    }

    #[inline]
    fn get(&self, ix: i32, iy: i32, iz: i32) -> f32 {
        if ix < 0 || iy < 0 || iz < 0 {
            return self.default_value;
        }
        let (ix, iy, iz) = (ix as usize, iy as usize, iz as usize);
        if ix >= self.nx || iy >= self.ny || iz >= self.nz {
            return self.default_value;
        }
        self.data[self.index(ix, iy, iz)]
    }

    #[inline]
    fn world_pos(&self, ix: i32, iy: i32, iz: i32) -> [f32; 3] {
        [
            self.min[0] + ix as f32 * self.resolution,
            self.min[1] + iy as f32 * self.resolution,
            self.min[2] + iz as f32 * self.resolution,
        ]
    }

    #[inline]
    fn grid_indices(&self, x: f32, y: f32, z: f32) -> (i32, i32, i32) {
        (
            ((x - self.min[0]) / self.resolution).floor() as i32,
            ((y - self.min[1]) / self.resolution).floor() as i32,
            ((z - self.min[2]) / self.resolution).floor() as i32,
        )
    }

    fn add_sphere(&mut self, center: [f32; 3], radius: f32) {
        let margin = radius + self.max_dist;
        let (gx0, gy0, gz0) = self.grid_indices(center[0] - margin, center[1] - margin, center[2] - margin);
        let (gx1, gy1, gz1) = self.grid_indices(center[0] + margin, center[1] + margin, center[2] + margin);

        let ix0 = gx0.max(0) as usize;
        let iy0 = gy0.max(0) as usize;
        let iz0 = gz0.max(0) as usize;
        let ix1 = gx1.min(self.nx as i32 - 1).max(0) as usize;
        let iy1 = gy1.min(self.ny as i32 - 1).max(0) as usize;
        let iz1 = gz1.min(self.nz as i32 - 1).max(0) as usize;

        for iz in iz0..=iz1 {
            let wz = self.min[2] + iz as f32 * self.resolution;
            let dz = wz - center[2];
            let dz2 = dz * dz;
            for iy in iy0..=iy1 {
                let wy = self.min[1] + iy as f32 * self.resolution;
                let dy = wy - center[1];
                let dy2 = dy * dy;
                for ix in ix0..=ix1 {
                    let wx = self.min[0] + ix as f32 * self.resolution;
                    let dx = wx - center[0];
                    let mut dist = (dx * dx + dy2 + dz2).sqrt() - radius;
                    if dist > self.max_dist {
                        dist = self.max_dist;
                    } else if dist < -self.max_dist {
                        dist = -self.max_dist;
                    }
                    let idx = self.index(ix, iy, iz);
                    if dist < self.data[idx] {
                        self.data[idx] = dist;
                    }
                }
            }
        }
    }

    fn clear(&mut self) {
        self.data.fill(self.default_value);
    }
}

#[derive(Hash, PartialEq, Eq)]
struct EdgeKey {
    axis: u8,
    ix: i32,
    iy: i32,
    iz: i32,
}

struct Mesh {
    vertices: Vec<f32>,
    normals: Vec<f32>,
    indices: Vec<u32>,
}

fn interpolate_vertex(p1: [f32; 3], p2: [f32; 3], v1: f32, v2: f32, isovalue: f32) -> [f32; 3] {
    if (isovalue - v1).abs() < 1e-5 {
        return p1;
    }
    if (isovalue - v2).abs() < 1e-5 {
        return p2;
    }
    if (v1 - v2).abs() < 1e-5 {
        return p1;
    }
    let t = (isovalue - v1) / (v2 - v1);
    [
        p1[0] + t * (p2[0] - p1[0]),
        p1[1] + t * (p2[1] - p1[1]),
        p1[2] + t * (p2[2] - p1[2]),
    ]
}

fn sample_trilinear(grid: &DistanceGrid, wx: f32, wy: f32, wz: f32) -> f32 {
    let fx = (wx - grid.min[0]) / grid.resolution;
    let fy = (wy - grid.min[1]) / grid.resolution;
    let fz = (wz - grid.min[2]) / grid.resolution;

    let ix = fx.floor() as i32;
    let iy = fy.floor() as i32;
    let iz = fz.floor() as i32;

    let tx = fx - ix as f32;
    let ty = fy - iy as f32;
    let tz = fz - iz as f32;

    let v000 = grid.get(ix, iy, iz);
    let v100 = grid.get(ix + 1, iy, iz);
    let v010 = grid.get(ix, iy + 1, iz);
    let v110 = grid.get(ix + 1, iy + 1, iz);
    let v001 = grid.get(ix, iy, iz + 1);
    let v101 = grid.get(ix + 1, iy, iz + 1);
    let v011 = grid.get(ix, iy + 1, iz + 1);
    let v111 = grid.get(ix + 1, iy + 1, iz + 1);

    let clamp = |v: f32| {
        if v.is_infinite() {
            if v.is_sign_negative() { -grid.max_dist } else { grid.max_dist }
        } else {
            v
        }
    };
    let c000 = clamp(v000);
    let c100 = clamp(v100);
    let c010 = clamp(v010);
    let c110 = clamp(v110);
    let c001 = clamp(v001);
    let c101 = clamp(v101);
    let c011 = clamp(v011);
    let c111 = clamp(v111);

    let c00 = c000 * (1.0 - tx) + c100 * tx;
    let c10 = c010 * (1.0 - tx) + c110 * tx;
    let c01 = c001 * (1.0 - tx) + c101 * tx;
    let c11 = c011 * (1.0 - tx) + c111 * tx;

    let c0 = c00 * (1.0 - ty) + c10 * ty;
    let c1 = c01 * (1.0 - ty) + c11 * ty;

    c0 * (1.0 - tz) + c1 * tz
}

fn compute_normal(grid: &DistanceGrid, pos: [f32; 3]) -> [f32; 3] {
    let h = grid.resolution;
    let gx = sample_trilinear(grid, pos[0] + h, pos[1], pos[2]) - sample_trilinear(grid, pos[0] - h, pos[1], pos[2]);
    let gy = sample_trilinear(grid, pos[0], pos[1] + h, pos[2]) - sample_trilinear(grid, pos[0], pos[1] - h, pos[2]);
    let gz = sample_trilinear(grid, pos[0], pos[1], pos[2] + h) - sample_trilinear(grid, pos[0], pos[1], pos[2] - h);
    let len = (gx * gx + gy * gy + gz * gz).sqrt();
    if len > 1e-4 {
        [gx / len, gy / len, gz / len]
    } else {
        [0.0, 1.0, 0.0]
    }
}

fn marching_cubes(grid: &DistanceGrid, isovalue: f32, smooth_normals: bool) -> Mesh {
    let mut vertices: Vec<f32> = Vec::new();
    let mut normals: Vec<f32> = Vec::new();
    let mut indices: Vec<u32> = Vec::new();

    let mut edge_cache: HashMap<EdgeKey, u32> = HashMap::new();

    let edge_corners: [[usize; 2]; 12] = [
        [0, 1], [1, 2], [2, 3], [3, 0],
        [4, 5], [5, 6], [6, 7], [7, 4],
        [0, 4], [1, 5], [2, 6], [3, 7],
    ];
    let corner_offsets: [[i32; 3]; 8] = [
        [0, 0, 0], [1, 0, 0], [1, 1, 0], [0, 1, 0],
        [0, 0, 1], [1, 0, 1], [1, 1, 1], [0, 1, 1],
    ];

    let mut add_vertex = |pos: [f32; 3]| -> u32 {
        let idx = (vertices.len() / 3) as u32;
        vertices.extend_from_slice(&pos);
        let n = compute_normal(grid, pos);
        normals.extend_from_slice(&n);
        idx
    };

    for iz in 0..(grid.nz.saturating_sub(1)) as i32 {
        for iy in 0..(grid.ny.saturating_sub(1)) as i32 {
            for ix in 0..(grid.nx.saturating_sub(1)) as i32 {
                let mut v = [0.0f32; 8];
                let mut corners = [[0.0f32; 3]; 8];
                for i in 0..8 {
                    let o = corner_offsets[i];
                    v[i] = grid.get(ix + o[0], iy + o[1], iz + o[2]);
                    corners[i] = grid.world_pos(ix + o[0], iy + o[1], iz + o[2]);
                }

                let mut cube_index = 0u16;
                for i in 0..8 {
                    if v[i] < isovalue {
                        cube_index |= 1 << i;
                    }
                }
                if EDGE_TABLE[cube_index as usize] == 0 {
                    continue;
                }

                let mut edge_verts: [i32; 12] = [-1; 12];
                for e in 0..12 {
                    if (EDGE_TABLE[cube_index as usize] & (1 << e)) != 0 {
                        let c0 = edge_corners[e][0];
                        let c1 = edge_corners[e][1];
                        let o0 = corner_offsets[c0];
                        let o1 = corner_offsets[c1];
                        let (axis, kx, ky, kz) = if o0[0] != o1[0] {
                            (0u8, ix + o0[0].min(o1[0]), iy + o0[1], iz + o0[2])
                        } else if o0[1] != o1[1] {
                            (1u8, ix + o0[0], iy + o0[1].min(o1[1]), iz + o0[2])
                        } else {
                            (2u8, ix + o0[0], iy + o0[1], iz + o0[2].min(o1[2]))
                        };
                        let key = EdgeKey { axis, ix: kx, iy: ky, iz: kz };
                        if let Some(idx) = edge_cache.get(&key) {
                            edge_verts[e] = *idx as i32;
                        } else {
                            let pos = interpolate_vertex(corners[c0], corners[c1], v[c0], v[c1], isovalue);
                            let idx = add_vertex(pos);
                            edge_cache.insert(key, idx);
                            edge_verts[e] = idx as i32;
                        }
                    }
                }

                let tri_row = &TRI_TABLE[cube_index as usize];
                let mut t = 0usize;
                while t + 2 < tri_row.len() && tri_row[t] != -1 {
                    let i0 = edge_verts[tri_row[t] as usize];
                    let i1 = edge_verts[tri_row[t + 1] as usize];
                    let i2 = edge_verts[tri_row[t + 2] as usize];
                    if i0 >= 0 && i1 >= 0 && i2 >= 0 {
                        indices.push(i0 as u32);
                        indices.push(i1 as u32);
                        indices.push(i2 as u32);
                    }
                    t += 3;
                }
            }
        }
    }

    let normals_out = if smooth_normals {
        smooth_normals_fn(&vertices, &normals, &indices)
    } else {
        normals.clone()
    };

    Mesh {
        vertices,
        normals: normals_out,
        indices,
    }
}

fn smooth_normals_fn(vertices: &[f32], per_vertex_normals: &[f32], indices: &[u32]) -> Vec<f32> {
    let vertex_count = vertices.len() / 3;
    let mut accumulated = vec![0.0f32; vertex_count * 3];

    for tri in indices.chunks(3) {
        if tri.len() < 3 {
            continue;
        }
        let i0 = tri[0] as usize;
        let i1 = tri[1] as usize;
        let i2 = tri[2] as usize;

        let v0 = [
            vertices[i0 * 3],
            vertices[i0 * 3 + 1],
            vertices[i0 * 3 + 2],
        ];
        let v1 = [
            vertices[i1 * 3],
            vertices[i1 * 3 + 1],
            vertices[i1 * 3 + 2],
        ];
        let v2 = [
            vertices[i2 * 3],
            vertices[i2 * 3 + 1],
            vertices[i2 * 3 + 2],
        ];

        let e1 = [v1[0] - v0[0], v1[1] - v0[1], v1[2] - v0[2]];
        let e2 = [v2[0] - v0[0], v2[1] - v0[1], v2[2] - v0[2]];
        let nx = e1[1] * e2[2] - e1[2] * e2[1];
        let ny = e1[2] * e2[0] - e1[0] * e2[2];
        let nz = e1[0] * e2[1] - e1[1] * e2[0];

        for &idx in &[i0, i1, i2] {
            accumulated[idx * 3] += nx;
            accumulated[idx * 3 + 1] += ny;
            accumulated[idx * 3 + 2] += nz;
        }
    }

    let mut result = vec![0.0f32; vertex_count * 3];
    for i in 0..vertex_count {
        let ax = accumulated[i * 3];
        let ay = accumulated[i * 3 + 1];
        let az = accumulated[i * 3 + 2];
        let len = (ax * ax + ay * ay + az * az).sqrt();
        if len > 1e-4 {
            result[i * 3] = ax / len;
            result[i * 3 + 1] = ay / len;
            result[i * 3 + 2] = az / len;
        } else {
            result[i * 3] = per_vertex_normals[i * 3];
            result[i * 3 + 1] = per_vertex_normals[i * 3 + 1];
            result[i * 3 + 2] = per_vertex_normals[i * 3 + 2];
        }
    }
    result
}

fn find_connected_components(vertex_count: usize, indices: &[u32]) -> (Vec<usize>, usize) {
    let mut parent: Vec<usize> = (0..vertex_count).collect();

    fn find(parent: &mut [usize], x: usize) -> usize {
        if parent[x] != x {
            let root = find(parent, parent[x]);
            parent[x] = root;
        }
        parent[x]
    }

    fn union(parent: &mut [usize], x: usize, y: usize) {
        let px = find(parent, x);
        let py = find(parent, y);
        if px != py {
            parent[px] = py;
        }
    }

    for tri in indices.chunks(3) {
        if tri.len() < 3 {
            continue;
        }
        let i0 = tri[0] as usize;
        let i1 = tri[1] as usize;
        let i2 = tri[2] as usize;
        union(&mut parent, i0, i1);
        union(&mut parent, i1, i2);
    }

    let mut component_map: HashMap<usize, usize> = HashMap::new();
    let mut components = vec![0usize; vertex_count];
    let mut next_component = 0usize;

    for i in 0..vertex_count {
        let root = find(&mut parent, i);
        let entry = component_map.entry(root).or_insert_with(|| {
            let c = next_component;
            next_component += 1;
            c
        });
        components[i] = *entry;
    }

    (components, next_component)
}

struct AtomHash {
    cells: HashMap<(i32, i32, i32), Vec<usize>>,
    cell_size: f32,
}

fn build_atom_hash(atoms: &[Atom], cell_size: f32) -> Option<AtomHash> {
    if !cell_size.is_finite() || cell_size <= 0.0 {
        return None;
    }
    let mut cells: HashMap<(i32, i32, i32), Vec<usize>> = HashMap::new();
    for (i, atom) in atoms.iter().enumerate() {
        let ix = (atom.center[0] / cell_size).floor() as i32;
        let iy = (atom.center[1] / cell_size).floor() as i32;
        let iz = (atom.center[2] / cell_size).floor() as i32;
        cells.entry((ix, iy, iz)).or_insert_with(Vec::new).push(i);
    }
    Some(AtomHash { cells, cell_size })
}

fn query_atom_hash(atom_hash: &AtomHash, x: f32, y: f32, z: f32) -> Vec<usize> {
    let ix = (x / atom_hash.cell_size).floor() as i32;
    let iy = (y / atom_hash.cell_size).floor() as i32;
    let iz = (z / atom_hash.cell_size).floor() as i32;
    let mut indices = Vec::new();
    for dx in -1..=1 {
        for dy in -1..=1 {
            for dz in -1..=1 {
                if let Some(bucket) = atom_hash.cells.get(&(ix + dx, iy + dy, iz + dz)) {
                    indices.extend_from_slice(bucket);
                }
            }
        }
    }
    indices
}

fn filter_ses_components(mesh: Mesh, atoms: &[Atom], probe_radius: f32, max_atom_radius: f32) -> Mesh {
    let vertex_count = mesh.vertices.len() / 3;
    let (components, count) = find_connected_components(vertex_count, &mesh.indices);
    if count <= 1 {
        return mesh;
    }

    let mut component_valid = vec![false; count];
    let mut checked = vec![false; count];
    let threshold = probe_radius * 1.5;
    let max_center_distance = max_atom_radius + threshold;
    let atom_hash = build_atom_hash(atoms, max_center_distance);

    for i in 0..vertex_count {
        let comp = components[i];
        if checked[comp] {
            continue;
        }
        checked[comp] = true;
        let vx = mesh.vertices[i * 3];
        let vy = mesh.vertices[i * 3 + 1];
        let vz = mesh.vertices[i * 3 + 2];

        if let Some(ref hash) = atom_hash {
            let candidates = query_atom_hash(hash, vx, vy, vz);
            if candidates.is_empty() {
                continue;
            }
            for idx in candidates {
                let atom = atoms[idx];
                let dx = vx - atom.center[0];
                let dy = vy - atom.center[1];
                let dz = vz - atom.center[2];
                let center_dist = (dx * dx + dy * dy + dz * dz).sqrt();
                if center_dist > max_center_distance {
                    continue;
                }
                let dist = center_dist - atom.radius;
                if dist < threshold {
                    component_valid[comp] = true;
                    break;
                }
            }
        } else {
            for atom in atoms {
                let dx = vx - atom.center[0];
                let dy = vy - atom.center[1];
                let dz = vz - atom.center[2];
                let center_dist = (dx * dx + dy * dy + dz * dz).sqrt();
                let dist = center_dist - atom.radius;
                if dist < threshold {
                    component_valid[comp] = true;
                    break;
                }
            }
        }
    }

    let mut new_indices: Vec<usize> = Vec::new();
    for tri in mesh.indices.chunks(3) {
        if tri.len() < 3 {
            continue;
        }
        let comp = components[tri[0] as usize];
        if component_valid[comp] {
            new_indices.push(tri[0] as usize);
            new_indices.push(tri[1] as usize);
            new_indices.push(tri[2] as usize);
        }
    }

    let mut vertex_map: HashMap<usize, usize> = HashMap::new();
    let mut new_vertices: Vec<f32> = Vec::new();
    let mut new_normals: Vec<f32> = Vec::new();
    let mut remapped_indices: Vec<u32> = Vec::with_capacity(new_indices.len());

    for &old_idx in &new_indices {
        let entry = *vertex_map.entry(old_idx).or_insert_with(|| {
            let new_idx = new_vertices.len() / 3;
            new_vertices.push(mesh.vertices[old_idx * 3]);
            new_vertices.push(mesh.vertices[old_idx * 3 + 1]);
            new_vertices.push(mesh.vertices[old_idx * 3 + 2]);
            new_normals.push(mesh.normals[old_idx * 3]);
            new_normals.push(mesh.normals[old_idx * 3 + 1]);
            new_normals.push(mesh.normals[old_idx * 3 + 2]);
            new_idx
        });
        remapped_indices.push(entry as u32);
    }

    Mesh {
        vertices: new_vertices,
        normals: new_normals,
        indices: remapped_indices,
    }
}

fn flip_normals(mesh: &mut Mesh) {
    for n in mesh.normals.iter_mut() {
        *n = -*n;
    }
}

fn mesh_to_js(mesh: Mesh) -> Result<JsValue, JsValue> {
    let obj = Object::new();
    let vertices = Float32Array::from(mesh.vertices.as_slice());
    let normals = Float32Array::from(mesh.normals.as_slice());
    let indices = Uint32Array::from(mesh.indices.as_slice());
    Reflect::set(&obj, &JsValue::from_str("vertices"), &vertices)?;
    Reflect::set(&obj, &JsValue::from_str("normals"), &normals)?;
    Reflect::set(&obj, &JsValue::from_str("indices"), &indices)?;
    Ok(obj.into())
}

#[wasm_bindgen]
pub fn compute_ses(
    centers: &[f32],
    radii: &[f32],
    probe_radius: f32,
    resolution: f32,
    return_sas: bool,
    smooth_normals: bool,
) -> Result<JsValue, JsValue> {
    if centers.len() % 3 != 0 {
        return Err(JsValue::from_str("centers length must be multiple of 3"));
    }
    let atom_count = centers.len() / 3;
    if radii.len() != atom_count {
        return Err(JsValue::from_str("radii length must match centers"));
    }
    if atom_count == 0 {
        return mesh_to_js(Mesh { vertices: Vec::new(), normals: Vec::new(), indices: Vec::new() });
    }

    let mut atoms: Vec<Atom> = Vec::with_capacity(atom_count);
    let mut bounds_min = [f32::INFINITY; 3];
    let mut bounds_max = [f32::NEG_INFINITY; 3];
    let mut max_atom_radius = 0.0f32;

    for i in 0..atom_count {
        let center = [centers[i * 3], centers[i * 3 + 1], centers[i * 3 + 2]];
        let radius = radii[i];
        atoms.push(Atom { center, radius });
        for a in 0..3 {
            bounds_min[a] = bounds_min[a].min(center[a]);
            bounds_max[a] = bounds_max[a].max(center[a]);
        }
        if radius > max_atom_radius {
            max_atom_radius = radius;
        }
    }

    let padding = 2.0 * probe_radius + max_atom_radius + resolution;
    let mut grid = DistanceGrid::new(bounds_min, bounds_max, resolution, padding, 2.0)
        .map_err(|e| JsValue::from_str(&e))?;

    for atom in &atoms {
        grid.add_sphere(atom.center, atom.radius + probe_radius);
    }

    let sas_mesh = marching_cubes(&grid, 0.0, smooth_normals);
    if sas_mesh.vertices.is_empty() {
        return mesh_to_js(sas_mesh);
    }
    if return_sas {
        return mesh_to_js(sas_mesh);
    }

    grid.clear();
    let sas_vertex_count = sas_mesh.vertices.len() / 3;
    for i in 0..sas_vertex_count {
        let center = [
            sas_mesh.vertices[i * 3],
            sas_mesh.vertices[i * 3 + 1],
            sas_mesh.vertices[i * 3 + 2],
        ];
        grid.add_sphere(center, probe_radius);
    }

    let ses_mesh = marching_cubes(&grid, 0.0, smooth_normals);
    let mut filtered = filter_ses_components(ses_mesh, &atoms, probe_radius, max_atom_radius);
    flip_normals(&mut filtered);
    mesh_to_js(filtered)
}
