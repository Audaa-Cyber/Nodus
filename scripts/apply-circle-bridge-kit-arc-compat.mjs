import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const packageRoot = join(projectRoot, "node_modules", "@circle-fin", "bridge-kit");
const packageInfo = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));

if (packageInfo.version !== "1.17.1") {
  throw new Error(
    `Arc source-fee compatibility patch expects @circle-fin/bridge-kit 1.17.1; found ${packageInfo.version}. Review the installed SDK before updating this patch.`,
  );
}

for (const fileName of ["index.mjs", "index.cjs"]) {
  const path = join(packageRoot, fileName);
  const contents = await readFile(path, "utf8");
  const start = contents.indexOf("const SOURCE_FEE_SUPPORTED_ALLOWLIST = new Set([");
  const end = start < 0 ? -1 : contents.indexOf("\n]);", start);
  if (start < 0 || end < 0) throw new Error(`Could not safely locate the source-fee allowlist in ${fileName}.`);
  const allowlist = contents.slice(start, end);
  const chainEnum = fileName.endsWith(".cjs") ? "exports.Blockchain." : "Blockchain.";
  const expectedEntry = `    ${chainEnum}Arc_Testnet,`;
  if (allowlist.includes(expectedEntry)) continue;
  const incorrectEntry = fileName.endsWith(".cjs")
    ? "    Blockchain.Arc_Testnet,"
    : "    exports.Blockchain.Arc_Testnet,";
  if (allowlist.includes(incorrectEntry)) {
    const correctedAllowlist = allowlist.replace(incorrectEntry, expectedEntry);
    await writeFile(path, `${contents.slice(0, start)}${correctedAllowlist}${contents.slice(end)}`);
    continue;
  }
  const allowlistMarker = `${chainEnum}Optimism_Sepolia,\n`;
  const markerIndex = allowlist.indexOf(allowlistMarker);
  if (markerIndex < 0 || allowlist.indexOf(allowlistMarker, markerIndex + allowlistMarker.length) >= 0) {
    throw new Error(`Could not safely locate the testnet insertion point in ${fileName}.`);
  }
  const patchedAllowlist = allowlist.replace(allowlistMarker, `${allowlistMarker}    ${chainEnum}Arc_Testnet,\n`);
  await writeFile(path, `${contents.slice(0, start)}${patchedAllowlist}${contents.slice(end)}`);
}
