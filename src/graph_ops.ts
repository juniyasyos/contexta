import { Graph } from "./graph";

export function getImpact(graph: Graph, nodeId: string, maxDepth: number = 3) {
  const id = nodeId.toLowerCase();
  const edges = graph.edges || [];
  
  const adj: Record<string, any[]> = {};
  for (const e of edges) {
    const f = e.from;
    const t = e.to;
    if (!adj[f]) adj[f] = [];
    if (!adj[t]) adj[t] = [];
    
    adj[t].push({ node: f, type: e.type, dir: "impacted_by" });
    adj[f].push({ node: t, type: e.type, dir: "impacts" });
  }

  const visited = new Set<string>([id]);
  const queue: [string, number][] = [[id, 0]];
  const impactResult: any[] = [];

  while (queue.length > 0) {
    const [curr, depth] = queue.shift()!;
    if (depth >= maxDepth) continue;
    
    const neighbors = adj[curr] || [];
    for (const neighbor of neighbors) {
      const nNode = neighbor.node;
      if (!visited.has(nNode)) {
        visited.add(nNode);
        queue.push([nNode, depth + 1]);
        impactResult.push({
          from: curr,
          to: nNode,
          type: neighbor.type,
          dir: neighbor.dir,
          depth: depth + 1
        });
      }
    }
  }
  return impactResult;
}

export function generateMermaid(graph: Graph, nodeId: string) {
  const id = nodeId.toLowerCase();
  const edges = graph.edges || [];
  const nodes: Record<string, any> = {};
  for (const n of graph.nodes || []) {
    nodes[n.id] = n;
  }
  
  if (!nodes[id]) return "Node not found.";
  
  const lines = ["graph TD"];
  const relatedEdges: any[] = [];
  const relatedNodeIds = new Set<string>([id]);
  
  for (const e of edges) {
    if (e.from === id || e.to === id) {
      relatedEdges.push(e);
      relatedNodeIds.add(e.from);
      relatedNodeIds.add(e.to);
    }
  }
  
  for (const nid of relatedNodeIds) {
    const n = nodes[nid];
    if (n) {
      const label = (n.label || nid).replace(/"/g, '');
      lines.push(`    ${nid}["${label}"]`);
    }
  }
  
  for (const e of relatedEdges) {
    lines.push(`    ${e.from} -->|${e.type}| ${e.to}`);
  }
  
  return lines.join("\n");
}
