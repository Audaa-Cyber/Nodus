import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
async function patchPackage(packageName, expectedVersion, files) {
  const packageRoot = join(projectRoot, "node_modules", "@circle-fin", packageName);
  const packageInfo = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8"));
  if (packageInfo.version !== expectedVersion) {
    throw new Error(
      `Arc source-fee compatibility patch expects @circle-fin/${packageName} ${expectedVersion}; found ${packageInfo.version}. Review the installed SDK before updating this patch.`,
    );
  }

  for (const fileName of files) {
    const path = join(packageRoot, fileName);
    const contents = await readFile(path, "utf8");
    const start = contents.indexOf("const SOURCE_FEE_SUPPORTED_ALLOWLIST = new Set([");
    const end = start < 0 ? -1 : contents.indexOf("\n]);", start);
    if (start < 0 || end < 0) throw new Error(`Could not safely locate the source-fee allowlist in ${packageName}/${fileName}.`);
    const allowlist = contents.slice(start, end);
    const chainEnum = packageName === "bridge-kit" && fileName.endsWith(".cjs")
      ? "exports.Blockchain."
      : "Blockchain.";
    const expectedEntry = `    ${chainEnum}Arc_Testnet,`;
    if (allowlist.includes(expectedEntry)) continue;
    const incorrectEntry = packageName === "bridge-kit" && fileName.endsWith(".cjs")
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
      throw new Error(`Could not safely locate the testnet insertion point in ${packageName}/${fileName}.`);
    }
    const patchedAllowlist = allowlist.replace(allowlistMarker, `${allowlistMarker}    ${chainEnum}Arc_Testnet,\n`);
    await writeFile(path, `${contents.slice(0, start)}${patchedAllowlist}${contents.slice(end)}`);
  }
}

await patchPackage("bridge-kit", "1.17.1", ["index.mjs", "index.cjs"]);
await patchPackage("app-kit", "1.21.0", [
  "index.mjs", "index.cjs",
  "bridge.mjs", "bridge.cjs",
  "estimateBridge.mjs", "estimateBridge.cjs",
]);
