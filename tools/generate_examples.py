import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ASSETS = ROOT / "assets"


def _encode_buffer(positions, indices):
    pos_bytes = positions.tobytes()
    idx_bytes = indices.tobytes()
    pad_len = (4 - (len(pos_bytes) + len(idx_bytes)) % 4) % 4
    blob = pos_bytes + idx_bytes + b"\x00" * pad_len
    encoded = base64.b64encode(blob).decode("ascii")
    return blob, encoded


def _write_gltf(name, positions, indices, index_component_type):
    blob, encoded = _encode_buffer(positions, indices)
    buffer_len = len(blob)
    pos_len = len(positions.tobytes())
    idx_len = len(indices.tobytes())

    gltf = {
        "asset": {"version": "2.0"},
        "buffers": [
            {
                "byteLength": buffer_len,
                "uri": f"data:application/octet-stream;base64,{encoded}",
            }
        ],
        "bufferViews": [
            {"buffer": 0, "byteOffset": 0, "byteLength": pos_len},
            {"buffer": 0, "byteOffset": pos_len, "byteLength": idx_len},
        ],
        "accessors": [
            {"bufferView": 0, "componentType": 5126, "count": len(positions) // 3, "type": "VEC3"},
            {"bufferView": 1, "componentType": index_component_type, "count": len(indices), "type": "SCALAR"},
        ],
        "meshes": [
            {"primitives": [{"attributes": {"POSITION": 0}, "indices": 1}]}
        ],
        "nodes": [{"mesh": 0}],
        "scenes": [{"nodes": [0]}],
        "scene": 0,
    }

    ASSETS.mkdir(exist_ok=True)
    (ASSETS / f"{name}.gltf").write_text(json.dumps(gltf, indent=2))


def main():
    from array import array

    def add_cube(positions, indices, center, scale, index_offset):
        cx, cy, cz = center
        s = scale
        verts = [
            -1.0, -1.0, -1.0,
            1.0, -1.0, -1.0,
            1.0, 1.0, -1.0,
            -1.0, 1.0, -1.0,
            -1.0, -1.0, 1.0,
            1.0, -1.0, 1.0,
            1.0, 1.0, 1.0,
            -1.0, 1.0, 1.0,
        ]
        for i in range(0, len(verts), 3):
            positions.extend([
                cx + verts[i] * s,
                cy + verts[i + 1] * s,
                cz + verts[i + 2] * s,
            ])
        base = [
            0, 1, 2, 0, 2, 3,
            4, 6, 5, 4, 7, 6,
            0, 4, 5, 0, 5, 1,
            1, 5, 6, 1, 6, 2,
            2, 6, 7, 2, 7, 3,
            3, 7, 4, 3, 4, 0,
        ]
        for idx in base:
            indices.append(index_offset + idx)

    tri_positions = array("f", [
        0.0, 0.0, 0.0,
        1.0, 0.0, 0.0,
        0.0, 1.0, 0.0,
    ])
    tri_indices = array("H", [0, 1, 2])
    _write_gltf("triangle", tri_positions, tri_indices, 5123)

    cube_positions = array("f", [
        -1.0, -1.0, -1.0,
        1.0, -1.0, -1.0,
        1.0, 1.0, -1.0,
        -1.0, 1.0, -1.0,
        -1.0, -1.0, 1.0,
        1.0, -1.0, 1.0,
        1.0, 1.0, 1.0,
        -1.0, 1.0, 1.0,
    ])
    cube_indices = array("H", [
        0, 1, 2, 0, 2, 3,
        4, 6, 5, 4, 7, 6,
        0, 4, 5, 0, 5, 1,
        1, 5, 6, 1, 6, 2,
        2, 6, 7, 2, 7, 3,
        3, 7, 4, 3, 4, 0,
    ])
    _write_gltf("cube", cube_positions, cube_indices, 5123)

    boxes_positions = array("f")
    boxes_indices = array("H")
    add_cube(boxes_positions, boxes_indices, center=(0.0, 0.0, 0.0), scale=0.9, index_offset=0)
    add_cube(boxes_positions, boxes_indices, center=(0.6, 0.3, 0.0), scale=0.75, index_offset=8)
    add_cube(boxes_positions, boxes_indices, center=(-0.5, 0.2, 0.4), scale=0.7, index_offset=16)
    _write_gltf("overlap_boxes", boxes_positions, boxes_indices, 5123)


if __name__ == "__main__":
    main()
