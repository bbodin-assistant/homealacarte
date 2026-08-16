import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repository = fileURLToPath(new URL("../", import.meta.url));
const implementationRoots = ["src", "www"];

async function sourceFiles(root) {
  const directory = join(repository, root);
  const found = [];
  async function walk(path, relativePath = root) {
    for (const entry of await readdir(path, { withFileTypes: true })) {
      const child = join(path, entry.name);
      const childRelative = `${relativePath}/${entry.name}`;
      if (entry.isDirectory()) {
        await walk(child, childRelative);
      } else if ([".rs", ".js"].includes(extname(entry.name))) {
        found.push({ path: child, relativePath: childRelative });
      }
    }
  }
  await walk(directory);
  return found;
}

const files = (await Promise.all(implementationRoots.map(sourceFiles))).flat();
const forbiddenControlFlow = [
  /\btranslations\.(?:en|fr)\b/g,
  /\b(?:DAYS|MEALS)_(?:EN|FR)\b/g,
  /\bis_(?:english|french)\b/gi,
  /eq_ignore_ascii_case\(\s*["'](?:en|fr)["']\s*\)/gi,
  /\b(?:language|locale|activeLanguage|defaultLanguage)\s*(?:===|==|!==|!=)\s*["'][A-Za-z]{2}(?:-[A-Za-z0-9-]+)?["']/g,
  /\b(?:language|activeLanguage|defaultLanguage)\s*=\s*["'][A-Za-z]{2}(?:-[A-Za-z0-9-]+)?["']/g,
  /\b(?:language|locale|activeLanguage|defaultLanguage)\s*(?:\|\||\?\?)\s*["'][A-Za-z]{2}(?:-[A-Za-z0-9-]+)?["']/g,
];

const violations = [];
for (const file of files) {
  const source = await readFile(file.path, "utf8");
  for (const pattern of forbiddenControlFlow) {
    pattern.lastIndex = 0;
    if (pattern.test(source)) violations.push(`${file.relativePath}: ${pattern}`);
  }
}

assert.deepEqual(
  violations,
  [],
  `Locale-specific implementation logic found:\n${violations.join("\n")}`,
);

console.log("Implementation code contains no hardcoded EN/FR locale branches or defaults.");
