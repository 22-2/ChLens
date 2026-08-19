import fs from "node:fs/promises";
import path from "node:path";
import JSZip from "jszip";

const root = process.cwd();
const releaseDir = path.join(root, "release");
const packageJson = JSON.parse(await fs.readFile(path.join(root, "package.json"), "utf8"));

await fs.rm(releaseDir, { recursive: true, force: true });
await fs.mkdir(releaseDir, { recursive: true });

async function addDirectory(zip, directory, relativeDirectory = "") {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const absolutePath = path.join(directory, entry.name);
    const relativePath = path.join(relativeDirectory, entry.name).replaceAll(path.sep, "/");
    if (entry.isDirectory()) {
      await addDirectory(zip, absolutePath, relativePath);
    } else {
      zip.file(relativePath, await fs.readFile(absolutePath));
    }
  }
}

for (const platform of ["chrome", "firefox"]) {
  const sourceDirectory = path.join(root, "debug", platform);
  const zip = new JSZip();
  await addDirectory(zip, sourceDirectory);
  const outputPath = path.join(releaseDir, `chlens-${platform}-v${packageJson.version}.zip`);
  await fs.writeFile(outputPath, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));
  console.log(`Created ${path.relative(root, outputPath)}`);
}
