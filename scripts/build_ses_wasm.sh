#!/usr/bin/env bash
set -euo pipefail

mamba run -n wave wasm-pack build wasm/ses --target web --out-dir ../../src/wasm/ses --release
