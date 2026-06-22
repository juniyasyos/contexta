import fs from "fs";
import path from "path";
import * as yaml from "js-yaml";

export const PROJECT_ROOT = process.cwd();
export const CONFIG_DIR = path.join(PROJECT_ROOT, "docs", "ai-agent", "contexta");
export const CONFIG_FILE = path.join(CONFIG_DIR, "config.yml");

export const defaultConfig = {
  docs_dir: "docs",
  input_dir: "docs/ai-agent/contexta/input",
  output_dir: "docs/ai-agent/contexta/output",
  graph_file: "docs/ai-agent/contexta/output/graph.json",
  chunks_file: "docs/ai-agent/contexta/output/chunks.json",
  metadata_file: "docs/ai-agent/contexta/output/metadata.json",
};

export function loadOrCreateConfig(): Record<string, any> {
  if (!fs.existsSync(CONFIG_FILE)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
    fs.writeFileSync(CONFIG_FILE, yaml.dump(defaultConfig), "utf-8");
    return defaultConfig;
  } else {
    try {
      const fileContents = fs.readFileSync(CONFIG_FILE, "utf-8");
      return yaml.load(fileContents) as Record<string, any>;
    } catch (e) {
      console.error("Error loading config:", e);
      return defaultConfig;
    }
  }
}

export const configData = loadOrCreateConfig();

export const DOCS_DIR = path.join(PROJECT_ROOT, configData.docs_dir || defaultConfig.docs_dir);
export const INPUT_DIR = path.join(PROJECT_ROOT, configData.input_dir || defaultConfig.input_dir);
export const OUTPUT_DIR = path.join(PROJECT_ROOT, configData.output_dir || defaultConfig.output_dir);
export const CHUNKS_PATH = path.join(PROJECT_ROOT, configData.chunks_file || defaultConfig.chunks_file);
export const GRAPH_PATH = path.join(PROJECT_ROOT, configData.graph_file || defaultConfig.graph_file);
export const METADATA_PATH = path.join(PROJECT_ROOT, configData.metadata_file || defaultConfig.metadata_file);
