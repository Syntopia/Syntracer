import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SURFACE_JS = ROOT / "src" / "surface.js"
OUT = ROOT / "wasm" / "ses" / "src" / "tables.rs"

text = SURFACE_JS.read_text(encoding="utf-8")

edge_match = re.search(r"const EDGE_TABLE = new Uint16Array\(\[([\s\S]*?)\]\);", text)
if not edge_match:
    raise SystemExit("EDGE_TABLE not found")
edge_text = "[" + edge_match.group(1) + "]"
edge_table = ast.literal_eval(edge_text)
if len(edge_table) != 256:
    raise SystemExit(f"EDGE_TABLE length mismatch: {len(edge_table)}")

tri_match = re.search(r"const TRI_TABLE = \[([\s\S]*?)\n\];", text)
if not tri_match:
    raise SystemExit("TRI_TABLE not found")
tri_text = "[" + tri_match.group(1) + "]"
tri_table = ast.literal_eval(tri_text)
if len(tri_table) != 256:
    raise SystemExit(f"TRI_TABLE length mismatch: {len(tri_table)}")

tri_padded = []
for row in tri_table:
    if len(row) > 16:
        raise SystemExit(f"TRI_TABLE row too long: {len(row)}")
    padded = list(row) + [-1] * (16 - len(row))
    tri_padded.append(padded)

lines = []
lines.append("// Auto-generated from src/surface.js by tools/gen_marching_tables.py")
lines.append("pub const EDGE_TABLE: [u16; 256] = [")
for i in range(0, len(edge_table), 8):
    chunk = ", ".join(f"0x{val:03x}" for val in edge_table[i : i + 8])
    lines.append(f"  {chunk},")
lines.append("];\n")

lines.append("pub const TRI_TABLE: [[i8; 16]; 256] = [")
for row in tri_padded:
    row_vals = ", ".join(str(int(v)) for v in row)
    lines.append(f"  [{row_vals}],")
lines.append("];\n")

OUT.write_text("\n".join(lines), encoding="utf-8")
print(f"Wrote {OUT}")
