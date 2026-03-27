#!/usr/bin/env bash
# Regenerate all PAPI descriptors from live chains.
# Usage: pnpm generate-descriptors
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Removing old metadata and generated output..."
rm -rf generated .papi/metadata/*.scale

echo "==> Adding well-known chains..."
npx papi add polkadot_asset_hub -n polkadot_asset_hub --skip-codegen
npx papi add kusama_asset_hub   -n ksmcc3_asset_hub   --skip-codegen
npx papi add paseo_asset_hub    -n paseo_asset_hub    --skip-codegen

echo "==> Adding bulletin (Paseo)..."
npx papi add bulletin -w wss://paseo-bulletin-rpc.polkadot.io --skip-codegen

echo "==> Adding individuality (Preview-net)..."
npx papi add individuality -w wss://pop3-testnet.parity-lab.parity.io/people --skip-codegen

echo "==> Generating TypeScript descriptors..."
npx papi

echo "==> Stripping file:generated dep (breaks npm consumers)..."
node -e '
    const pkg = require("./package.json");
    delete pkg.dependencies?.["@polkadot-api/descriptors"];
    require("fs").writeFileSync(
        "package.json",
        JSON.stringify(pkg, null, 4) + "\n"
    );
'

echo "==> Done!"
