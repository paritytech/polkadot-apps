#!/usr/bin/env bash
# Build descriptors: run papi if needed, then generate per-chain entry files.
set -euo pipefail
cd "$(dirname "$0")/.."

# 1. Run papi if generated output doesn't exist
if [ ! -d generated/dist ]; then
    papi

    # papi adds "dependencies": { "@polkadot-api/descriptors": "file:generated" }
    # to package.json which breaks npm consumers — strip it entirely.
    node --input-type=commonjs -e '
        const p = require("./package.json");
        delete p.dependencies;
        require("fs").writeFileSync("package.json", JSON.stringify(p, null, 4) + "\n");
    '
fi

# 2. Generate per-chain entry files if missing
if [ ! -f generated/dist/bulletin.mjs ]; then
    npx tsx scripts/generate-per-chain.ts
fi
