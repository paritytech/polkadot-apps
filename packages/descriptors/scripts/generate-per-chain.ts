/**
 * Post-processes the papi-generated index.mjs to create per-chain entry files
 * and a shared _common.mjs helper.
 *
 * Each per-chain file imports toBinary from _common.mjs and re-exports only
 * one chain's descriptor object, referencing the same shared chunks
 * (descriptors, metadataTypes) but only pulling in the specific chain's
 * metadata file.
 *
 * This enables tree-shaking: consumers importing
 * `@polkadot-apps/descriptors/bulletin` only bundle bulletin's metadata,
 * not all 5 chains.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const distDir = join(__dirname, "..", "generated", "dist");
const indexMjs = readFileSync(join(distDir, "index.mjs"), "utf-8");

// Extract the toBinary helper (common.ts section)
const toBinaryMatch = indexMjs.match(
    /\/\/ generated\/src\/common\.ts\n([\s\S]*?)(?=\n\/\/ generated\/src\/\w+\.ts)/,
);
if (!toBinaryMatch) {
    throw new Error("Could not extract toBinary helper from index.mjs");
}
const toBinaryCode = toBinaryMatch[1].trim();

// Write the shared _common.mjs so per-chain files import from it
// instead of inlining the helper (avoids duplication across chunks).
const commonContent = `// Auto-generated shared helper — do not edit.
// Regenerate with: pnpm generate-descriptors
${toBinaryCode}
export { toBinary };
`;
writeFileSync(join(distDir, "_common.mjs"), commonContent);
console.log("  Generated _common.mjs");

interface ChainConfig {
    id: string;
    srcName: string;
    exportName: string;
}

// Chain configs: name -> { exportName in index.mjs, section marker in generated source }
const chains: ChainConfig[] = [
    { id: "polkadot-asset-hub", srcName: "polkadot_asset_hub", exportName: "polkadot_asset_hub" },
    { id: "kusama-asset-hub", srcName: "kusama_asset_hub", exportName: "kusama_asset_hub" },
    { id: "paseo-asset-hub", srcName: "paseo_asset_hub", exportName: "paseo_asset_hub" },
    { id: "bulletin", srcName: "bulletin", exportName: "bulletin" },
    { id: "individuality", srcName: "individuality", exportName: "individuality" },
];

for (const chain of chains) {
    // Extract the chain's section from index.mjs
    // Each section starts with `// generated/src/<name>.ts`
    const sectionRegex = new RegExp(
        `\\/\\/ generated\\/src\\/${chain.srcName}\\.ts\\n([\\s\\S]*?)(?=\\n\\/\\/ generated\\/src\\/|\\nexport \\{)`,
    );
    const sectionMatch = indexMjs.match(sectionRegex);
    if (!sectionMatch) {
        console.warn(`Warning: Could not extract section for ${chain.srcName}, skipping`);
        continue;
    }

    let chainCode = sectionMatch[1].trim();

    // Deduplicate variable names: papi appends numbers for each chain (e.g., descriptorValues2, metadataTypes3).
    // Normalize them so each per-chain file uses clean names.
    // Only match the exact variable name followed by digits (e.g., asset2, genesis3) — NOT compound
    // names like assetHub or genesisHash. The \d+ pattern requires at least one digit.
    chainCode = chainCode
        .replace(/\bdescriptorValues\d+\b/g, "descriptorValues")
        .replace(/\bmetadataTypes\d+\b/g, "metadataTypes")
        .replace(/\basset\d+\b/g, "asset")
        .replace(/\bextensions\d+\b/g, "extensions")
        .replace(/\bgetMetadata\d+\b/g, "getMetadata")
        .replace(/\bgenesis\d+\b/g, "genesis")
        .replace(/\b_allDescriptors\d+\b/g, "_allDescriptors");

    // Rename the chain's _default export variable. Match only the specific papi pattern:
    // `var <srcName>_default = _allDescriptors` — not arbitrary `_default` suffixes.
    const srcDefaultPattern = new RegExp(`\\b${chain.srcName}_default\\b`, "g");
    chainCode = chainCode.replace(srcDefaultPattern, `${chain.exportName}_default`);

    const fileContent = `// Auto-generated per-chain entry for ${chain.exportName}
// Do not edit — regenerate with: pnpm generate-descriptors
import { toBinary } from "./_common.mjs";

${chainCode}

export default _allDescriptors;
export { ${chain.exportName}_default as ${chain.exportName} };
`;

    const outPath = join(distDir, `${chain.id}.mjs`);
    writeFileSync(outPath, fileContent);
    console.log(`  Generated ${chain.id}.mjs`);
}

console.log("Per-chain entry files generated successfully.");
