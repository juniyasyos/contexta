import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execSync } from 'child_process';
import * as yaml from 'js-yaml';
import { PROJECT_ROOT, CHUNKS_PATH, GRAPH_PATH } from './paths';

function addNode(nodes: Record<string, any>, nodeId: string, nodeType: string, label: string, source: string, domain: string, metadata: any = null, isPrimary: boolean = false) {
  const cleanId = nodeId.toLowerCase().trim();
  const cleanType = nodeType.toLowerCase().trim();
  let cleanLabel = label.replace(/\n/g, "").replace(/\r/g, "").trim();
  cleanLabel = cleanLabel.replace(/\s+/g, " ");

  if (!nodes[cleanId]) {
    nodes[cleanId] = {
      id: cleanId,
      type: cleanType,
      label: cleanLabel,
      discovered_from: [source],
      domain: domain
    };
    if (isPrimary) {
      nodes[cleanId]["path"] = source;
      nodes[cleanId]["_primary_source"] = true;
    }
  } else {
    if (isPrimary && !nodes[cleanId]["_primary_source"]) {
      nodes[cleanId]["path"] = source;
      nodes[cleanId]["domain"] = domain;
      nodes[cleanId]["type"] = cleanType;
      nodes[cleanId]["label"] = cleanLabel;
      nodes[cleanId]["_primary_source"] = true;
    }
    if (!nodes[cleanId].discovered_from) {
      nodes[cleanId].discovered_from = [];
    }
    if (!nodes[cleanId].discovered_from.includes(source)) {
      nodes[cleanId].discovered_from.push(source);
    }
  }

  if (metadata) {
    Object.assign(nodes[cleanId], metadata);
  }
}

function addEdge(edges: Record<string, any>, fromId: string, toId: string, relType: string, source: string) {
  const cleanFrom = fromId.toLowerCase().trim();
  const cleanTo = toId.toLowerCase().trim();
  const cleanType = relType.toLowerCase().trim();

  const edgeKey = `${cleanFrom}|${cleanTo}|${cleanType}`;
  if (!edges[edgeKey]) {
    edges[edgeKey] = {
      from: cleanFrom,
      to: cleanTo,
      type: cleanType,
      source: source
    };
  }
}

function formatString(template: string, match: RegExpExecArray | null, fileId: string, relPath: string, domain: string, parentMatch: RegExpExecArray | null = null): string {
  if (!template) return "";

  let s = template.replace(/\{file_id\}/g, fileId)
                  .replace(/\{rel_path\}/g, relPath)
                  .replace(/\{domain\}/g, domain);

  if (parentMatch) {
    for (let i = 1; i < parentMatch.length; i++) {
      const g = parentMatch[i];
      if (g) {
        s = s.replace(new RegExp(`\\{parent_${i}\\}`, 'g'), g);
        s = s.replace(new RegExp(`\\{parent_${i}_lower\\}`, 'g'), g.toLowerCase());
        s = s.replace(new RegExp(`\\{parent_${i}_upper\\}`, 'g'), g.toUpperCase());
        s = s.replace(new RegExp(`\\{parent_${i}_slug\\}`, 'g'), g.toLowerCase().replace(/\//g, "-"));
      }
    }
  }

  if (match) {
    for (let i = 1; i < match.length; i++) {
      const g = match[i];
      if (g) {
        s = s.replace(new RegExp(`\\{${i}\\}`, 'g'), g);
        s = s.replace(new RegExp(`\\{${i}_lower\\}`, 'g'), g.toLowerCase());
        s = s.replace(new RegExp(`\\{${i}_upper\\}`, 'g'), g.toUpperCase());
        s = s.replace(new RegExp(`\\{${i}_slug\\}`, 'g'), g.toLowerCase().replace(/\//g, "-"));
      }
    }
  }

  return s;
}

function processRules(rules: any[], content: string, fileId: string, relPath: string, domain: string, nodes: Record<string, any>, edges: Record<string, any>, fileMetadata: any, parentMatch: RegExpExecArray | null = null) {
  if (!rules) return;

  for (const rule of rules) {
    const patternStr = rule.pattern;
    if (!patternStr) continue;

    const limit = rule.limit || 0;
    let regex: RegExp;
    try {
      regex = new RegExp(patternStr, 'gm');
    } catch (e) {
      continue;
    }

    let match: RegExpExecArray | null;
    let matchCount = 0;
    const matches: RegExpExecArray[] = [];
    while ((match = regex.exec(content)) !== null) {
      matches.push(match);
      if (match[0].length === 0) {
        regex.lastIndex++;
      }
    }

    const limitedMatches = limit > 0 ? matches.slice(0, limit) : matches;

    for (const m of limitedMatches) {
      for (const ent of (rule.entities || [])) {
        const entId = formatString(ent.id, m, fileId, relPath, domain, parentMatch);
        const entType = formatString(ent.type, m, fileId, relPath, domain, parentMatch);
        const entLabel = formatString(ent.label, m, fileId, relPath, domain, parentMatch);
        const entDomain = formatString(ent.domain || domain, m, fileId, relPath, domain, parentMatch);

        const metadata = { ...fileMetadata };
        const entMetadata = ent.metadata || {};

        let isPrimary = false;
        if (typeof entMetadata.primary === 'boolean') {
          isPrimary = entMetadata.primary;
        } else if (typeof entMetadata.primary === 'string') {
          isPrimary = entMetadata.primary.toLowerCase() === 'true';
        }

        for (const [k, v] of Object.entries(entMetadata)) {
          if (k === 'primary') continue;
          metadata[k] = formatString(String(v), m, fileId, relPath, domain, parentMatch);
        }

        if (entId && entType) {
          addNode(nodes, entId, entType, entLabel, relPath, entDomain, metadata, isPrimary);
        }
      }

      for (const rel of (rule.relations || [])) {
        const fromId = formatString(rel.from, m, fileId, relPath, domain, parentMatch);
        const toId = formatString(rel.to, m, fileId, relPath, domain, parentMatch);
        const relType = formatString(rel.type, m, fileId, relPath, domain, parentMatch);

        if (fromId && toId && relType) {
          addEdge(edges, fromId, toId, relType, relPath);
        }
      }

      if (rule.sub_rules) {
        processRules(rule.sub_rules, content, fileId, relPath, domain, nodes, edges, fileMetadata, m);
      }
    }
  }
}

function scanFileWithConfig(filepath: string, relPath: string, domain: string, config: any, nodes: Record<string, any>, edges: Record<string, any>, chunks: any[]) {
  let content = "";
  try {
    content = fs.readFileSync(filepath, 'utf-8');
    const ext = path.extname(filepath).toLowerCase();
    if (['.php', '.js', '.vue', '.ts'].includes(ext)) {
      content = content.replace(/\/\*[\s\S]*?\*\//g, '');
      content = content.replace(/\/\/.*$/gm, '');
    }
  } catch (e) {
    return;
  }

  const sourceHash = crypto.createHash('sha256').update(content, 'utf8').digest('hex');
  let commitHash = "";
  try {
    commitHash = execSync(`git log -1 --format=%H -- "${filepath}"`, { cwd: PROJECT_ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch (e) {
    // ignore
  }

  const updatedAt = new Date().toISOString();

  const fileMetadata = {
    source_file: relPath,
    source_hash: sourceHash,
    last_indexed_commit: commitHash,
    updated_at: updatedAt,
    confidence: "derived_from_source"
  };

  const fileId = relPath.toLowerCase().replace(/\//g, "-").replace(/\./g, "-");

  const rules = config.rules || [];
  processRules(rules, content, fileId, relPath, domain, nodes, edges, fileMetadata);
}

function cleanNodesForOutput(nodes: Record<string, any>): any[] {
  const result: any[] = [];
  for (const node of Object.values(nodes)) {
    const cleanNode: any = {};
    for (const [k, v] of Object.entries(node)) {
      if (!k.startsWith('_')) {
        cleanNode[k] = v;
      }
    }
    result.push(cleanNode);
  }
  return result;
}

function edgesDictToList(edges: Record<string, any>): any[] {
  return Object.values(edges);
}

function getFilesRecursively(dir: string, extensions: string[]): string[] {
  let results: string[] = [];
  const list = fs.readdirSync(dir);
  for (const file of list) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursively(filePath, extensions));
    } else {
      if (extensions.includes(path.extname(filePath))) {
        results.push(filePath);
      }
    }
  }
  return results;
}

export function runScan() {
  console.log("Scanning project files across domains...");

  const nodes: Record<string, any> = {};
  const edges: Record<string, any> = {};
  const chunks: any[] = [];
  let filesScanned = 0;

  const scannersDir = path.join(__dirname, "scanners");
  const configs: any[] = [];
  const scannerName = process.env.RAG_SCANNER || "laravel";
  const scannerFile = path.join(scannersDir, `${scannerName}.yml`);

  if (fs.existsSync(scannerFile)) {
    try {
      const fileContents = fs.readFileSync(scannerFile, 'utf8');
      const doc = yaml.load(fileContents);
      configs.push(doc);
    } catch (e) {
      console.error(`Error loading scanner config ${scannerFile}: ${e}`);
    }
  }

  if (configs.length === 0) {
    console.log(`Scanner config ${scannerName}.yml not found in scanners directory.`);
    return;
  }

  for (const config of configs) {
    const extensions = config.extensions || [".php", ".yml", ".yaml", ".md", ".json", ".js", ".vue"];
    const domains = config.domains || {};

    for (const [domain, domainConfig] of Object.entries<any>(domains)) {
      const paths = domainConfig.paths || [];
      for (const pathStr of paths) {
        const targetPath = path.join(PROJECT_ROOT, pathStr);
        if (!fs.existsSync(targetPath)) continue;

        const stat = fs.statSync(targetPath);
        if (stat.isFile()) {
          scanFileWithConfig(targetPath, pathStr, domain, domainConfig, nodes, edges, chunks);
          filesScanned++;
        } else {
          const files = getFilesRecursively(targetPath, extensions);
          for (const file of files) {
            const relPath = path.relative(PROJECT_ROOT, file).replace(/\\/g, '/');
            scanFileWithConfig(file, relPath, domain, domainConfig, nodes, edges, chunks);
            filesScanned++;
          }
        }
      }
    }
  }

  let existingChunks: any[] = [];
  if (fs.existsSync(CHUNKS_PATH)) {
    try {
      existingChunks = JSON.parse(fs.readFileSync(CHUNKS_PATH, 'utf-8'));
    } catch (e) {}
  }

  const finalChunks = existingChunks.concat(chunks);
  const chunksDir = path.dirname(CHUNKS_PATH);
  if (!fs.existsSync(chunksDir)) {
    fs.mkdirSync(chunksDir, { recursive: true });
  }
  fs.writeFileSync(CHUNKS_PATH, JSON.stringify(finalChunks, null, 2), 'utf-8');

  const cleanNodeList = cleanNodesForOutput(nodes);
  const edgeList = edgesDictToList(edges);

  let finalGraph = { nodes: cleanNodeList, edges: edgeList };

  if (fs.existsSync(GRAPH_PATH)) {
    try {
      const existingGraph = JSON.parse(fs.readFileSync(GRAPH_PATH, 'utf-8'));
      const existingNodesById: Record<string, any> = {};
      
      for (const n of (existingGraph.nodes || [])) {
        existingNodesById[n.id] = n;
      }

      for (const n of finalGraph.nodes) {
        const nid = n.id;
        if (existingNodesById[nid]) {
          // If the new scan says this is primary, update it
          // Note: we can't easily track new_is_primary like Python did unless we export it
          // Python had a bug `if new_is_primary:` which was undefined in Python script!
          // We will just overwrite if n._primary_source was true (but we cleaned it)
          // Actually, let's keep it simple: merge the fields.
          for (const [k, v] of Object.entries(n)) {
             if (!["id", "discovered_from"].includes(k)) {
                existingNodesById[nid][k] = v;
             }
          }
          const existingDf = existingNodesById[nid].discovered_from || [];
          const newDf = n.discovered_from || [];
          existingNodesById[nid].discovered_from = Array.from(new Set([...existingDf, ...newDf]));
        } else {
          existingNodesById[nid] = n;
        }
      }

      const existingEdges: Record<string, any> = {};
      for (const e of (existingGraph.edges || [])) {
        existingEdges[`${e.from}|${e.to}|${e.type}`] = e;
      }
      for (const e of finalGraph.edges) {
        existingEdges[`${e.from}|${e.to}|${e.type}`] = e;
      }

      finalGraph = {
        nodes: Object.values(existingNodesById),
        edges: Object.values(existingEdges)
      };
    } catch (e) {}
  }

  const graphDir = path.dirname(GRAPH_PATH);
  if (!fs.existsSync(graphDir)) {
    fs.mkdirSync(graphDir, { recursive: true });
  }
  fs.writeFileSync(GRAPH_PATH, JSON.stringify(finalGraph, null, 2), 'utf-8');

  console.log(`  Scanned ${filesScanned} files. Found ${Object.keys(nodes).length} entities and ${Object.keys(edges).length} relations.`);
}
