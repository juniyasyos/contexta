import fs from "fs";
import { CHUNKS_PATH, GRAPH_PATH } from "./paths";

function tokenize(text: string): Set<string> {
  if (!text) return new Set();
  const words = text.toLowerCase().match(/[a-z0-9-]+/g) || [];
  return new Set(words.filter(w => w.length > 2));
}

function scoreChunks(intent: string, subject: string, entities: string[], keys: string[], preferred_sources: string[], avoid_sources: string[], chunks: any[], domains: string[] = [], top_k: number = 3): [number, any][] {
  const scored: [number, any][] = [];

  for (const chunk of chunks) {
    const source_file = (chunk.source_file || "").toLowerCase();
    if (domains && domains.length > 0) {
      if (!domains.some(d => (chunk.domain || source_file).toLowerCase().includes(d.toLowerCase()))) {
        continue;
      }
    }

    const content_lower = (chunk.content || "").toLowerCase();
    const heading_lower = (chunk.heading || "").toLowerCase();
    const full_text = heading_lower + "\n" + content_lower;

    let score = 0;

    if (subject && full_text.includes(subject.toLowerCase())) {
      score += 10;
    }

    for (const e of entities) {
      if (full_text.includes(e.toLowerCase())) score += 5;
    }

    for (const k of keys) {
      if (full_text.includes(k.toLowerCase())) score += 3;
    }

    if (preferred_sources.some(ps => source_file.includes(ps.toLowerCase()))) {
      score += 5;
    }

    if (avoid_sources.some(av => source_file.includes(av.toLowerCase()))) {
      score -= 5;
    }

    if (score > 0) {
      scored.push([score, chunk]);
    }
  }

  scored.sort((a, b) => b[0] - a[0]);
  return scored.slice(0, top_k);
}

function scoreGraph(subject: string, entities: string[], keys: string[], graph: any, domains: string[] = []): [any[], any[]] {
  const q_tokens = new Set<string>();
  if (subject) tokenize(subject).forEach(t => q_tokens.add(t));
  for (const e of entities) tokenize(e).forEach(t => q_tokens.add(t));
  for (const k of keys) tokenize(k).forEach(t => q_tokens.add(t));

  const scored: [number, any][] = [];
  for (const node of graph.nodes || []) {
    if (domains && domains.length > 0) {
      if (!domains.some(d => (node.domain || node.source || "").toLowerCase().includes(d.toLowerCase()))) {
        continue;
      }
    }

    const n_id = (node.id || "").toLowerCase();
    const n_label = (node.label || "").toLowerCase();
    const n_type = (node.type || "").toLowerCase();

    const id_tokens = tokenize(n_id);
    const label_tokens = tokenize(n_label);
    const type_tokens = tokenize(n_type);

    let overlap_id = 0;
    for (const t of q_tokens) if (id_tokens.has(t)) overlap_id++;
    
    let overlap_label = 0;
    for (const t of q_tokens) if (label_tokens.has(t)) overlap_label++;

    let type_match = 0;
    for (const t of q_tokens) {
      if (type_tokens.has(t)) {
        type_match = 1;
        break;
      }
    }

    let score = (overlap_label * 5) + (overlap_id * 3);
    if (score > 0) {
      score += type_match;
      scored.push([score, node]);
    }
  }

  scored.sort((a, b) => b[0] - a[0]);
  const relevant_nodes = scored.slice(0, 5).map(x => x[1]);

  const relevant_node_ids = new Set(relevant_nodes.map(n => n.id));
  const node_lookup: Record<string, any> = {};
  for (const n of graph.nodes || []) {
    node_lookup[n.id] = n;
  }
  
  const relevant_edges: any[] = [];
  for (const edge of graph.edges || []) {
    if (["has_column", "contains", "has_topic"].includes(edge.type)) continue;

    if (relevant_node_ids.has(edge.from) || relevant_node_ids.has(edge.to)) {
      const from_node = node_lookup[edge.from];
      const to_node = node_lookup[edge.to];
      if (from_node && to_node) {
        relevant_edges.push({
          from_label: from_node.label,
          to_label: to_node.label,
          type: edge.type
        });
      }
    }
  }

  return [relevant_nodes, relevant_edges.slice(0, 15)];
}

function buildContext(chunks: [number, any][], nodes: any[]): string {
  const parts = ["DOKUMEN RELEVAN:"];
  const seen = new Set<string>();
  for (const [score, chunk] of chunks) {
    const header = `[${chunk.source_file}] ${chunk.heading || ""}`;
    if (!seen.has(header)) {
      seen.add(header);
      parts.push(`${header}: ${(chunk.content || "").substring(0, 500)}`);
    }
  }
  if (nodes && nodes.length > 0) {
    parts.push("TOPIK TERKAIT:");
    for (const n of nodes) {
      parts.push(`${n.label} (${n.type})`);
    }
  }
  return parts.join(" | ").substring(0, 1500);
}

function buildContextPack(chunks: [number, any][]): string {
  const parts: string[] = [];
  const forbidden = ["retrieval-only", "contoh query", "query:", "output:", "tree singka", "=====", "chunk teratas", "[source]", "debug"];
  
  for (const [, chunk] of chunks) {
    const lines = (chunk.content || "").split("\n");
    const clean_lines: string[] = [];
    for (const line of lines) {
      const line_lower = line.toLowerCase();
      if (forbidden.some(f => line_lower.includes(f))) continue;
      clean_lines.push(line.trim());
    }
    
    let clean_content = clean_lines.join(" ");
    clean_content = clean_content.replace(/\s+/g, " ").trim();
    clean_content = clean_content.replace(/#+\s*/g, "");
    
    if (clean_content) {
      parts.push(`${chunk.heading || ""}: ${clean_content.substring(0, 150)}...`);
    }
  }
  
  return parts.join(" | ").substring(0, 500).trim();
}

function loadData() {
  let chunks = [];
  let graph = { nodes: [], edges: [] };
  try {
    chunks = JSON.parse(fs.readFileSync(CHUNKS_PATH, "utf-8"));
  } catch (e) {}
  try {
    graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf-8"));
  } catch (e) {}
  return { chunks, graph };
}

export function runContext(question: string, domains: string[] = []) {
  const { chunks, graph } = loadData();
  const top_chunks = scoreChunks("docs_lookup", question, [], [], [], [], chunks, domains);
  const [rel_nodes] = scoreGraph(question, [], [], graph, domains);
  return buildContext(top_chunks, rel_nodes);
}

export function runQuery(intent: string, subject: string, entities: string[], keys: string[], domains: string[], top_k: number, mode: string, debug: boolean) {
  const { chunks, graph } = loadData();
  if (chunks.length === 0 && (!graph.nodes || graph.nodes.length === 0)) {
    console.log("No data found. Run scan or ingest first.");
    return;
  }

  const route_config: Record<string, any> = {
    "project_overview": { read_first: ["docs"], read_if_needed: ["README", "ARCHITECTURE"], avoid_first: ["services", "models", "routes"] },
    "architecture_analysis": { read_first: ["docs", "services", "modules"], read_if_needed: ["config"], avoid_first: ["migrations"] },
    "service_lookup": { read_first: ["services", "entities", "models"], read_if_needed: ["repositories"], avoid_first: ["routes", "docs"] },
    "data_model_lookup": { read_first: ["models", "migrations"], read_if_needed: ["database", "schema"], avoid_first: ["routes", "services"] },
    "command_lookup": { read_first: ["COMMANDS", "README"], read_if_needed: ["scripts", "package.json"], avoid_first: ["models", "services"] },
    "api_reference": { read_first: ["routes", "controllers"], read_if_needed: ["middlewares", "requests"], avoid_first: ["models", "migrations"] },
    "troubleshooting": { read_first: ["KNOWN_ISSUES", "CHANGELOG"], read_if_needed: ["logs", "exceptions"], avoid_first: ["docs", "README"] },
    "rag_usage": { read_first: ["rag"], read_if_needed: ["config"], avoid_first: ["services", "models"] },
    "docs_lookup": { read_first: ["docs"], read_if_needed: [], avoid_first: [] }
  };

  const mapping = route_config[intent] || { read_first: [], read_if_needed: [], avoid_first: [] };
  const preferred_sources = mapping.read_first;
  const avoid_sources = mapping.avoid_first;

  const top_chunks = scoreChunks(intent, subject, entities, keys, preferred_sources, avoid_sources, chunks, domains, top_k);
  const [rel_nodes, rel_edges] = scoreGraph(subject, entities, keys, graph, domains);
  
  if (debug) {
    console.log("=== DEBUG: TOP CHUNKS ===");
    for (const [score, chunk] of top_chunks) {
      console.log(`[${score}] ${chunk.source_file} - ${chunk.heading || 'NO HEADING'}`);
    }
    console.log("=== DEBUG: RELEVANT NODES ===");
    for (const node of rel_nodes) {
      console.log(`- ${node.id} (${node.label})`);
    }
    console.log("===========================\n");
  }

  let route = "ai_agent";
  if (["project_overview", "docs_lookup", "command_lookup"].includes(intent)) route = "docs_only";
  else if (["service_lookup", "data_model_lookup", "api_reference"].includes(intent)) route = "code_lookup";

  const relevant_docs_set = new Set<string>();
  for (const [, c] of top_chunks) relevant_docs_set.add(c.source_file);

  let relevant_docs = Array.from(relevant_docs_set);

  if (intent === "architecture_analysis" && rel_nodes.length > 0) {
    const primary_node = rel_nodes[0];
    const primary_id = primary_node.id;
    const p_path = primary_node.path || primary_node.source;
    if (p_path && !relevant_docs.includes(p_path)) relevant_docs.push(p_path);

    const controllers: string[] = [];
    for (const e of (graph.edges || [])) {
      if (e.to === primary_id) {
        const f_id = e.from;
        const f_node = (graph.nodes || []).find((n: any) => n.id === f_id);
        if (!f_node) continue;
        const f_path = f_node.path || f_node.source;
        if (!f_path) continue;

        if (f_node.type === "service") {
          relevant_docs.push(f_path);
        } else if (e.type === "observes" || f_node.type === "observer") {
          relevant_docs.push(f_path);
        } else if (f_node.type === "controller") {
          if (!controllers.includes(f_path)) controllers.push(f_path);
        }
      }
    }
    relevant_docs.push(...controllers.slice(0, 3));

    for (const node of rel_nodes.slice(1, 3)) {
      const p = node.path || node.source;
      if (p && !relevant_docs.includes(p)) relevant_docs.push(p);
    }
  } else {
    for (const node of rel_nodes) {
      const p = node.path || node.source;
      if (p && !relevant_docs.includes(p)) relevant_docs.push(p);
    }
  }

  relevant_docs = Array.from(new Set(relevant_docs));

  const relevant_topics_set = new Set<string>();
  for (const n of rel_nodes) relevant_topics_set.add(n.label);
  
  const relevant_topics = Array.from(relevant_topics_set);
  for (const edge of rel_edges) {
    const rel_str = `${edge.from_label} --[${edge.type}]--> ${edge.to_label}`;
    if (!relevant_topics.includes(rel_str)) relevant_topics.push(rel_str);
  }

  let context_pack = buildContextPack(top_chunks);
  if (!context_pack && relevant_topics.length > 0) {
    const clean_topics = relevant_topics.map(t => t.trim().replace(/\n/g, '').replace(/  /g, ' ')).filter(t => t);
    context_pack = "Nodes/Relations: " + clean_topics.slice(0, 10).join(" | ");
  }

  const confidence = relevant_docs.length >= 1 ? 0.85 : 0.4;

  const final_data: any = {
    intent, subject, entities, keys, domains, route, confidence,
    relevant_docs, relevant_topics, context_pack
  };

  if (mode === "handoff") {
    final_data.read_first = mapping.read_first;
    final_data.read_if_needed = mapping.read_if_needed;
    final_data.avoid_first = mapping.avoid_first;
  }

  if (mode === "prompt") {
    const prompt = 
      `Anda adalah AI Agent pembaca kode. Anda diberikan metadata arsitektur proyek ini.\n` +
      `Gunakan peta struktur ini untuk memahami konteks arsitektural sebelum membaca file mentah.\n\n` +
      `=== KONTEKS ===\n${context_pack}\n\n` +
      `=== TOPIK & RELASI ===\n` + relevant_topics.map(t => `- ${t}`).join("\n") + `\n\n` +
      `=== REKOMENDASI FILE UNTUK DIBACA ===\n` + relevant_docs.map(d => `- ${d}`).join("\n") + `\n`;
    console.log(prompt);
  } else {
    console.log(JSON.stringify(final_data));
  }
}
