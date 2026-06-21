export interface NodeData {
  id: string;
  type: string;
  label: string;
  source: string;
  [key: string]: any;
}

export interface EdgeData {
  from: string;
  to: string;
  type: string;
  source: string;
}

export interface Graph {
  nodes: NodeData[];
  edges: EdgeData[];
}

function addNode(
  nodes: Record<string, NodeData>,
  id: string,
  type: string,
  label: string,
  source: string,
  metadata?: Record<string, any>
) {
  if (!nodes[id]) {
    nodes[id] = { id, type, label, source };
  }
  if (metadata) {
    Object.assign(nodes[id], metadata);
  }
}

function addEdge(
  edges: EdgeData[],
  from: string,
  to: string,
  type: string,
  source: string,
  nodes: Record<string, NodeData>
) {
  if (nodes[from] && nodes[to]) {
    edges.push({ from, to, type, source });
  }
}

function extractEntities(filename: string, content: string, nodes: Record<string, NodeData>) {
  const lower = content.toLowerCase();

  if (/project.*siimut|siimut.*adalah|sistem indikator mutu/.test(lower)) {
    addNode(nodes, "siimut", "Project", "SIIMUT", filename);
  }
  if (lower.includes("filament")) {
    addNode(nodes, "filament", "App", "Filament", filename);
  }

  const modules = [
    ["authorization", "Authorization"],
    ["benchmarking", "Benchmarking"],
    ["daily-report", "DailyReport"],
    ["form-engine", "FormEngine"],
    ["imut-master", "ImutMaster"],
    ["laporan", "Laporan"],
    ["reporting", "Reporting"],
  ];

  for (const document of modules) {
    const [modId, modLabel] = document;
    if (lower.includes(modId.replace(/-/g, " ")) || lower.includes(modId.replace(/-/g, ""))) {
      addNode(nodes, modId, "Module", modLabel, filename);
    }
  }

  if (lower.includes("iam") || lower.includes("sso") || lower.includes("nexaid")) {
    addNode(nodes, "iam-service", "Service", "IAM/SSO Service", filename);
  }
  if (lower.includes("nginx")) addNode(nodes, "nginx", "Service", "Nginx", filename);
  if (lower.includes("mysql") || lower.includes("mariadb")) addNode(nodes, "mysql", "Service", "MySQL", filename);
  if (lower.includes("redis")) addNode(nodes, "redis", "Service", "Redis", filename);
  if (lower.includes("queue")) addNode(nodes, "queue-worker", "Service", "Queue Worker", filename);
  if (lower.includes("backup")) addNode(nodes, "backup-service", "Service", "Backup Service", filename);

  if (/port\s+8000|:8000/.test(lower)) addNode(nodes, "port-8000", "Port", "Port 8000", filename);
  if (/port\s+8088|:8088/.test(lower)) addNode(nodes, "port-8088", "Port", "Port 8088", filename);
  if (/port\s+3306|:3306/.test(lower)) addNode(nodes, "port-3306", "Port", "Port 3306", filename);

  if (lower.includes("volume")) addNode(nodes, "storage-volume", "Volume", "Storage Volume", filename);
  if (/session_driver|queue_connection|app_env|db_host|app_key/.test(lower)) {
    addNode(nodes, "env-config", "Env", "Environment Config", filename);
  }

  if (lower.includes("php artisan serve")) addNode(nodes, "cmd-serve", "Command", "php artisan serve", filename);
  if (lower.includes("php artisan migrate")) addNode(nodes, "cmd-migrate", "Command", "php artisan migrate", filename);
  if (lower.includes("composer") && !lower.split(/\s+/).slice(0, 3).includes("dev")) {
    addNode(nodes, "cmd-composer", "Command", "Composer", filename);
  }

  if (/needs review|needs verification|bug|issue|masalah|bottleneck/.test(lower)) {
    addNode(nodes, "known-issue-kernel", "KnownIssue", "Kernel Duplication Issue", filename);
  }

  if (filename === "KNOWN_ISSUES.md") {
    const issueMatches = [...content.matchAll(/\*\*ID\*\*:\s*(KI-\d+)/g)];
    for (const match of issueMatches) {
      const issueId = match[1];
      const regex = new RegExp(`##\\s+${issueId.replace(/-/g, "\\-")}:\\s*(.+?)(?:\\n|$)`);
      const labelMatch = content.match(regex);
      const label = labelMatch ? labelMatch[1].trim() : issueId;
      addNode(nodes, issueId.toLowerCase(), "KnownIssue", label, filename);
    }
  }

  if (filename === "DECISIONS.md") {
    const decMatches = [...content.matchAll(/\*\*ID\*\*:\s*(DEC-\d+)/g)];
    for (const match of decMatches) {
      const decId = match[1];
      const regex = new RegExp(`##\\s+${decId.replace(/-/g, "\\-")}:\\s*(.+?)(?:\\n|$)`);
      const labelMatch = content.match(regex);
      const label = labelMatch ? labelMatch[1].trim() : decId;
      addNode(nodes, decId.toLowerCase(), "Decision", label, filename);
    }
  }

  if (lower.includes("refactor") || lower.includes("migrasi")) {
    addNode(nodes, "decision-refactor", "Decision", "Refactor Decision", filename);
  }
  if (lower.includes("docker")) {
    addNode(nodes, "docker", "Container", "Docker", filename);
  }

  const versions = [...content.matchAll(/v(\d+\.\d+\.\d+)/g)];
  for (const vMatch of versions) {
    const v = vMatch[1];
    const safe = `release-v${v.replace(/\./g, "-")}`;
    addNode(nodes, safe, "Release", `Release v${v}`, filename);
  }

  const blocks = ("\n" + content).split(/\n##\s+([A-Z]+-\d+)\s+-\s+([^\n]+)\n/);
  for (let i = 1; i < blocks.length - 2; i += 3) {
    const nodeId = blocks[i].toLowerCase().trim();
    const label = blocks[i + 1].trim();
    const body = blocks[i + 2];
    const metadata: Record<string, any> = {};

    for (const key of ["Type", "Status", "Area"]) {
      const m = new RegExp(`^${key}:\\s*(.+)`, "m").exec(body);
      if (m) metadata[key.toLowerCase()] = m[1].trim();
    }
    for (const listKey of ["Related Services", "Related Commands", "Related Issues", "Related Decisions", "Related Modules", "Source"]) {
      const m = new RegExp(`^${listKey}:\\n((?:-\\s+.*\\n?)+)`, "m").exec(body);
      if (m) {
        const items = m[1].split("\n").map(x => x.replace(/^- /, "").trim()).filter(x => x);
        metadata[listKey.toLowerCase().replace(/ /g, "_")] = items;
      }
    }
    const commitM = /-\s+commit:\s*(.+)/m.exec(body);
    if (commitM) metadata["commit"] = commitM[1].trim();

    const nodeType = metadata["type"] || "Unknown";
    addNode(nodes, nodeId, nodeType, label, filename, metadata);
  }
}

function extractEdges(filename: string, content: string, nodes: Record<string, NodeData>, edges: EdgeData[]) {
  const lower = content.toLowerCase();

  if (lower.includes("filament") && (lower.includes("service") || lower.includes("layer"))) {
    addEdge(edges, "filament", "iam-service", "uses", filename, nodes);
    addEdge(edges, "filament", "backup-service", "uses", filename, nodes);
  }
  if ((lower.includes("nginx") && lower.includes("filament")) || (lower.includes("nginx") && lower.includes("aplikasi"))) {
    addEdge(edges, "filament", "nginx", "exposed_by", filename, nodes);
  }
  if (lower.includes(":8000")) addEdge(edges, "filament", "port-8000", "has_port", filename, nodes);

  const modules = ["authorization", "benchmarking", "daily-report", "form-engine", "imut-master", "laporan", "reporting"];
  for (const modId of modules) {
    const modLabel = modId.replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase()).replace(/ /g, "");
    if (lower.includes(modLabel.toLowerCase())) {
      addEdge(edges, modId, "iam-service", "uses", filename, nodes);
    }
  }

  if (lower.includes("refactor")) addEdge(edges, "decision-refactor", "siimut", "affects", filename, nodes);

  const issues = [...content.matchAll(/\*\*ID\*\*:\s*(KI-\d+)/g)];
  for (const match of issues) {
    const safeIssue = match[1].toLowerCase();
    const areaMatch = /\*\*Area\*\*:\s*(.+?)(?:\n|$)/.exec(content);
    if (areaMatch) {
      const area = areaMatch[1].trim().toLowerCase();
      const areaNodeMap: Record<string, string> = {
        performa: "daily-report", performance: "daily-report", arsitektur: "siimut",
        architecture: "siimut", security: "siimut", konfigurasi: "env-config",
        configuration: "env-config", dependency: "cmd-composer", ui: "filament",
      };
      const target = areaNodeMap[area] || "siimut";
      addEdge(edges, safeIssue, target, "related_to", filename, nodes);
    }
  }

  const decs = [...content.matchAll(/\*\*ID\*\*:\s*(DEC-\d+)/g)];
  for (const match of decs) {
    const safeDec = match[1].toLowerCase();
    if (lower.includes("modular") || lower.includes("arsitektur")) addEdge(edges, safeDec, "siimut", "affects", filename, nodes);
    if (lower.includes("query") || lower.includes("performa")) addEdge(edges, safeDec, "daily-report", "affects", filename, nodes);
    if (lower.includes("dokumentasi") || lower.includes("graphrag")) addEdge(edges, safeDec, "siimut", "affects", filename, nodes);
  }

  if (/##\s+added|##\s+changed|##\s+fixed/.test(content)) {
    const versions = [...content.matchAll(/v(\d+\.\d+\.\d+)/g)];
    for (const vMatch of versions) {
      const v = vMatch[1];
      const safe = `release-v${v.replace(/\./g, "-")}`;
      const safeChange = `change-${v.replace(/\./g, "-")}`;
      addNode(nodes, safeChange, "Change", `Changes in v${v}`, filename);
      addEdge(edges, safe, safeChange, "includes", filename, nodes);
    }
  }

  if (/bottleneck|30.sec|n.1.query/.test(lower)) {
    addEdge(edges, "known-issue-kernel", "daily-report", "related_to", filename, nodes);
  }

  if (lower.includes("docker-compose")) {
    addNode(nodes, "docker-compose", "Container", "Docker Compose", filename);
    addEdge(edges, "docker", "docker-compose", "depends_on", filename, nodes);
  }

  for (const [nodeId, nodeData] of Object.entries(nodes)) {
    if (nodeData.source !== filename) continue;
    
    const relations: [string, string][] = [
      ["related_services", "uses"], ["related_commands", "has_command"],
      ["related_issues", "has_issue"], ["related_decisions", "decided_by"],
      ["related_modules", "related_to"]
    ];

    for (const [key, relType] of relations) {
      if (nodeData[key]) {
        for (const item of nodeData[key]) {
          if (item.toLowerCase() !== "none" && !item.toLowerCase().includes("needs verification")) {
            addEdge(edges, nodeId, item.toLowerCase(), relType, filename, nodes);
          }
        }
      }
    }
  }
}

export function buildGraph(allFiles: { filename: string; content: string }[]): Graph {
  const nodes: Record<string, NodeData> = {};
  const edges: EdgeData[] = [];
  const seenEdges = new Set<string>();

  for (const file of allFiles) {
    extractEntities(file.filename, file.content, nodes);
  }

  for (const file of allFiles) {
    const eBefore = edges.length;
    extractEdges(file.filename, file.content, nodes, edges);
    
    // Deduplicate new edges
    const newEdges = edges.splice(eBefore);
    for (const e of newEdges) {
      const key = `${e.from}|${e.to}|${e.type}`;
      if (!seenEdges.has(key)) {
        seenEdges.add(key);
        edges.push(e);
      }
    }
  }

  return { nodes: Object.values(nodes), edges };
}
