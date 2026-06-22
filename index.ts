#!/usr/bin/env bun
import { syncDocs } from "./src/sync";
import { runIngest } from "./src/ingest";
import { runScan } from "./src/scanner";
import { runQuery, runContext } from "./src/query";
import { getImpact, generateMermaid } from "./src/graph_ops";
import { writeMetadata, checkFreshness } from "./src/freshness";
import { GRAPH_PATH } from "./src/paths";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";

const envPath = path.join(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
}

async function main() {
  const rawArgs = process.argv.slice(2);
  
  if (rawArgs.length === 0) {
    console.log("Usage: contexta <command> [arg] [--intent ...] ...");
    process.exit(1);
  }

  const command = rawArgs[0];
  let arg = "";
  if (rawArgs.length > 1 && !rawArgs[1].startsWith("--")) {
    arg = rawArgs[1];
  }

  const parsedArgs: Record<string, any> = {
    entity: [],
    key: [],
    domain: [],
    top: 3,
    mode: "librarian",
    depth: 3,
    format: "text",
    debug: false,
    intent: "",
    subject: "",
    grep: ""
  };

  for (let i = 1; i < rawArgs.length; i++) {
    const val = rawArgs[i];
    if (val === "--intent") parsedArgs.intent = rawArgs[++i];
    else if (val === "--subject") parsedArgs.subject = rawArgs[++i];
    else if (val === "--entity") parsedArgs.entity.push(rawArgs[++i]);
    else if (val === "--key") parsedArgs.key.push(rawArgs[++i]);
    else if (val === "--domain") parsedArgs.domain.push(rawArgs[++i]);
    else if (val === "--top") parsedArgs.top = parseInt(rawArgs[++i], 10);
    else if (val === "--mode") parsedArgs.mode = rawArgs[++i];
    else if (val === "--depth") parsedArgs.depth = parseInt(rawArgs[++i], 10);
    else if (val === "--format") parsedArgs.format = rawArgs[++i];
    else if (val === "--debug") parsedArgs.debug = true;
    else if (val === "--grep") parsedArgs.grep = rawArgs[++i];
  }

  if (command === "sync") {
    console.log("  Command 'sync' is deprecated. Contexta now reads directly from the docs without copying.");
  } else if (command === "ingest" || command === "scan" || command === "rebuild" || command === "refresh") {
    if (command === "ingest" || command === "rebuild" || command === "refresh") {
      await runIngest();
      writeMetadata();
    }
    if (command === "scan" || command === "rebuild" || command === "refresh") {
      runScan();
      writeMetadata();
    }
  } else if (command === "query" || command === "search") {
    if (!parsedArgs.intent) {
      console.log("Error: --intent is required for query/search.");
      console.log("Examples:");
      console.log("  contexta query --intent project_overview");
      console.log("  contexta query --intent service_lookup --entity LaporanImut --key migrate");
      process.exit(1);
    }
    
    const validIntents = [
      "project_overview", "architecture_analysis", "service_lookup", 
      "data_model_lookup", "command_lookup", "api_reference", 
      "troubleshooting", "contexta_usage", "docs_lookup"
    ];
    if (!validIntents.includes(parsedArgs.intent)) {
      console.log(`Error: Invalid intent '${parsedArgs.intent}'.\nValid intents: ${validIntents.join(", ")}`);
      process.exit(1);
    }
    
    runQuery(
      parsedArgs.intent,
      parsedArgs.subject,
      parsedArgs.entity,
      parsedArgs.key,
      parsedArgs.domain,
      parsedArgs.top,
      parsedArgs.mode,
      parsedArgs.debug
    );
  } else if (command === "context") {
    console.log(runContext(arg, parsedArgs.domain.length > 0 ? [parsedArgs.domain[0]] : []));
  } else if (command === "graph") {
    try {
      const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf-8"));
      if (arg.toLowerCase() === "stats") {
        const nodeTypes: Record<string, number> = {};
        for (const n of Object.values(graph.nodes) as any[]) {
          const ntype = n.type || "unknown";
          nodeTypes[ntype] = (nodeTypes[ntype] || 0) + 1;
        }
        const edgeTypes: Record<string, number> = {};
        for (const e of graph.edges) {
          const etype = e.type || "unknown";
          edgeTypes[etype] = (edgeTypes[etype] || 0) + 1;
        }
        
        console.log("=== GRAPH STATS ===");
        console.log(`Total Nodes: ${Object.keys(graph.nodes).length}`);
        console.log(`Total Edges: ${graph.edges.length}`);
        console.log("\nNode Types:");
        for (const [k, v] of Object.entries(nodeTypes)) console.log(`  - ${k}: ${v}`);
        console.log("\nEdge Types:");
        for (const [k, v] of Object.entries(edgeTypes)) console.log(`  - ${k}: ${v}`);
        return;
      }
      
      for (const n of Object.values(graph.nodes) as any[]) {
        if (n.label.toLowerCase().includes(arg.toLowerCase()) || n.id.toLowerCase().includes(arg.toLowerCase())) {
          console.log(`Node: ${JSON.stringify(n).replace(/"/g, "'")}`);
          for (const e of graph.edges) {
            if (e.from === n.id || e.to === n.id) {
              console.log(`  Edge: ${e.from} --[${e.type}]--> ${e.to}`);
            }
          }
        }
      }
    } catch (e) {
      console.log("Graph not found. Run ingest or scan first.");
    }
  } else if (command === "inspect") {
    try {
      const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf-8"));
      let found = false;
      for (const n of Object.values(graph.nodes) as any[]) {
        if (n.id.toLowerCase() === arg.toLowerCase() || (n.label && n.label.toLowerCase() === arg.toLowerCase())) {
          found = true;
          console.log(`Node: ${JSON.stringify(n, null, 2)}`);
          console.log("Edges:");
          for (const e of graph.edges) {
            if (e.from === n.id || e.to === n.id) {
              console.log(`  ${e.from} --[${e.type}]--> ${e.to}`);
            }
          }
        }
      }
      if (!found) console.log(`Node '${arg}' not found.`);
    } catch (e) {
      console.log("Graph not found. Run ingest or scan first.");
    }
  } else if (command === "impact") {
    try {
      const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf-8"));
      if (!arg) {
        console.log("Error: Provide a node_id for impact analysis. E.g. contexta impact model-user");
        return;
      }
      let targetId = arg;
      for (const n of Object.values(graph.nodes) as any[]) {
        if (n.id.toLowerCase() === arg.toLowerCase() || (n.label && n.label.toLowerCase() === arg.toLowerCase())) {
          targetId = n.id;
          break;
        }
      }
      let impacts = getImpact(graph, targetId, parsedArgs.depth);

      if (parsedArgs.grep) {
        const grepTarget = parsedArgs.grep.toLowerCase();
        const filteredImpacts = [];
        
        for (const imp of impacts) {
           const targetNode = graph.nodes[imp.to] || {};
           const filesToCheck: string[] = [];
           if (targetNode.path) filesToCheck.push(targetNode.path);
           if (targetNode.discovered_from) filesToCheck.push(...targetNode.discovered_from);
           
           let matched = false;
           for (const file of Array.from(new Set(filesToCheck))) {
              const fullPath = path.join(process.cwd(), file);
              try {
                if (fs.existsSync(fullPath)) {
                  const content = fs.readFileSync(fullPath, "utf-8").toLowerCase();
                  if (content.includes(grepTarget)) {
                    matched = true;
                    break;
                  }
                }
              } catch(e) {}
           }
           
           if (matched) {
             filteredImpacts.push(imp);
           }
        }
        impacts = filteredImpacts;
      }
      
      if (parsedArgs.format === "json") {
        console.log(JSON.stringify(impacts, null, 2));
      } else {
        const grepInfo = parsedArgs.grep ? ` (Filtered by keyword: "${parsedArgs.grep}")` : "";
        console.log(`=== IMPACT ANALYSIS FOR '${arg}' (Depth ${parsedArgs.depth})${grepInfo} ===`);
        if (!impacts || impacts.length === 0) console.log("No impacted nodes found.");
        for (const imp of impacts) {
           const prefix = "  ".repeat(imp.depth);
           const arrow = imp.dir === "impacted_by" ? "<--" : "-->";
           console.log(`${prefix} [${imp.depth}] ${imp.from} ${arrow} [${imp.type}] ${arrow} ${imp.to}`);
        }
      }
    } catch (e) {
      console.log("Graph not found. Run scan first.");
    }
  } else if (command === "visualize") {
    try {
      const graph = JSON.parse(fs.readFileSync(GRAPH_PATH, "utf-8"));
      if (!arg) {
        console.log("Error: Provide a node_id for visualization.");
        return;
      }
      let targetId = arg;
      for (const n of Object.values(graph.nodes) as any[]) {
        if (n.id.toLowerCase() === arg.toLowerCase() || (n.label && n.label.toLowerCase() === arg.toLowerCase())) {
          targetId = n.id;
          break;
        }
      }
      console.log(generateMermaid(graph, targetId));
    } catch (e) {
      console.log("Graph not found. Run scan first.");
    }
  } else if (command === "check") {
    checkFreshness();
  }
}

main().catch(err => {
  console.error("An error occurred:", err);
  process.exit(1);
});