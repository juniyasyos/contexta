import fs from "fs";
import path from "path";
import { INPUT_DIR, DOCS_DIR } from "./paths";

const TEMPLATE_NAMES = new Set(["template.md"]);

function isTemplate(filepath: string): boolean {
  return TEMPLATE_NAMES.has(path.basename(filepath));
}

function cleanInputDir() {
  if (fs.existsSync(INPUT_DIR)) {
    let count = 0;
    const files = fs.readdirSync(INPUT_DIR);
    for (const file of files) {
      const fullPath = path.join(INPUT_DIR, file);
      if (fs.statSync(fullPath).isFile()) {
        fs.unlinkSync(fullPath);
        count++;
      }
    }
    console.log(`  🧹  Cleaned ${count} existing file(s) from ${INPUT_DIR}`);
  } else {
    fs.mkdirSync(INPUT_DIR, { recursive: true });
    console.log(`  📁  Created ${INPUT_DIR}`);
  }
}

function collectMarkdownFiles(): string[] {
  const files: string[] = [];
  if (fs.existsSync(DOCS_DIR)) {
    const docs = fs.readdirSync(DOCS_DIR);
    for (const file of docs) {
      const fullPath = path.join(DOCS_DIR, file);
      if (file.endsWith(".md") && !isTemplate(fullPath) && fs.statSync(fullPath).isFile()) {
        files.push(fullPath);
      }
    }

    const releasesDir = path.join(DOCS_DIR, "releases");
    if (fs.existsSync(releasesDir)) {
      const releases = fs.readdirSync(releasesDir);
      for (const file of releases) {
        const fullPath = path.join(releasesDir, file);
        if (file.endsWith(".md") && !isTemplate(fullPath) && fs.statSync(fullPath).isFile()) {
          files.push(fullPath);
        }
      }
    }
  }
  return files.sort();
}

function copyFiles(files: string[]): string[] {
  const copied: string[] = [];
  for (const src of files) {
    const dest = path.join(INPUT_DIR, path.basename(src));
    fs.copyFileSync(src, dest);
    copied.push(dest);
  }
  return copied;
}

export function syncDocs() {
  console.log("==================================================");
  console.log("  Sync Docs → contexta/input/");
  console.log("==================================================");
  cleanInputDir();
  const mdFiles = collectMarkdownFiles();
  if (mdFiles.length === 0) {
    console.log("  ⚠️  No markdown files found in docs/ or docs/releases/.");
    return;
  }
  const copied = copyFiles(mdFiles);
  console.log(`  ✅  Copied ${copied.length} file(s) to ${INPUT_DIR}`);
}
