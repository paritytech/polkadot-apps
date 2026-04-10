#!/usr/bin/env bash
# Regenerate all PAPI descriptors from live chains.
# Usage: pnpm generate-descriptors
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Removing old metadata and generated output..."
rm -rf chains/*/generated/dist chains/*/generated/src .papi/metadata/*.scale

echo "==> Fetching chain metadata..."
npx papi add polkadot_asset_hub -n polkadot_asset_hub --skip-codegen
npx papi add kusama_asset_hub   -n ksmcc3_asset_hub   --skip-codegen
npx papi add paseo_asset_hub    -n paseo_asset_hub    --skip-codegen
npx papi add bulletin -w wss://paseo-bulletin-rpc.polkadot.io --skip-codegen
npx papi add individuality -w wss://pop3-testnet.parity-lab.parity.io/people --skip-codegen

echo "==> Generating per-chain descriptors..."
bash scripts/build.sh

echo "==> Formatting..."
pnpm format

echo "==> Done!"
