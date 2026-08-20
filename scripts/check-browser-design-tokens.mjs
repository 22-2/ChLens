import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const stylesDirectory = path.resolve(scriptDirectory, "../src/view/browser/styles");
const ignoredFiles = new Set(["foundation/tokens.css", "foundation/themes.css"]);
const compatibilityFiles = new Set(["layout/BrowserShell.css"]);

function collectCssFiles(directory) {
  const files = [];
  for (const entry of readdirSync(directory)) {
    const absolutePath = path.join(directory, entry);
    if (statSync(absolutePath).isDirectory()) {
      files.push(...collectCssFiles(absolutePath));
    } else if (entry.endsWith(".css")) {
      files.push(absolutePath);
    }
  }
  return files;
}

function relativeStylePath(file) {
  return path.relative(stylesDirectory, file).split(path.sep).join(path.posix.sep);
}

const violations = [];
for (const file of collectCssFiles(stylesDirectory)) {
  const relativePath = relativeStylePath(file);
  if (ignoredFiles.has(relativePath)) continue;

  // Comments describe the migration and are not CSS consumers, so exclude them from the checks.
  const source = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const checks = [
    [/var\(\s*--ref-/g, "component/page CSS must consume --sys-* tokens instead of --ref-* values"],
    [
      compatibilityFiles.has(relativePath) ? /$^/g : /var\(\s*--browser-/g,
      "--browser-* is reserved for the BrowserShell compatibility bridge",
    ],
    [
      /(?:#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?)\s*\()/gi,
      "raw color values must be defined in foundation/tokens.css",
    ],
    [/\bz-index\s*:\s*-?\d/g, "z-index values must use a --sys-z-* token"],
  ];

  for (const [pattern, message] of checks) {
    if (pattern.test(source)) {
      violations.push(`${relativePath}: ${message}`);
    }
  }
}

if (violations.length > 0) {
  console.error("Browser design-token contract violations:");
  for (const violation of violations) console.error(`- ${violation}`);
  process.exitCode = 1;
} else {
  console.log("Browser design-token contract passed.");
}
