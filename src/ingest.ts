import fs from "fs";
import path from "path";
import { INPUT_DIR, OUTPUT_DIR, CHUNKS_PATH, GRAPH_PATH } from "./paths";
import { buildGraph } from "./graph";

const MAX_CHUNK_SIZE = 2000;

interface Chunk {
  id: string;
  source_file: string;
  heading: string;
  chunk_index: number;
  content: string;
}

function headingLevel(line: string): number {
  const m = line.match(/^(#{1,6})\s/);
  return m ? m[1].length : 0;
}

function splitLongText(text: string, filename: string, heading: string, startIndex: number): Chunk[] {
  const paragraphs = text.split(/\n\s*\n/);
  const subChunks: Chunk[] = [];
  let buffer: string[] = [];
  let bufLen = 0;
  let idx = startIndex;

  for (let para of paragraphs) {
    para = para.trim();
    if (!para) continue;
    
    if (bufLen + para.length > MAX_CHUNK_SIZE && buffer.length > 0) {
      idx++;
      subChunks.push({
        id: `chunk-${idx.toString().padStart(4, "0")}`,
        source_file: filename,
        heading,
        chunk_index: idx,
        content: buffer.join("\n\n"),
      });
      buffer = [para];
      bufLen = para.length;
    } else {
      buffer.push(para);
      bufLen += para.length;
    }
  }

  if (buffer.length > 0) {
    idx++;
    subChunks.push({
      id: `chunk-${idx.toString().padStart(4, "0")}`,
      source_file: filename,
      heading,
      chunk_index: idx,
      content: buffer.join("\n\n"),
    });
  }

  return subChunks;
}

function chunkMarkdown(filename: string, content: string): Chunk[] {
  const lines = content.split("\n");
  const chunks: Chunk[] = [];
  let currentHeading = "(root)";
  let currentLines: string[] = [];
  let chunkCounter = 0;
  let headingEncountered = false;

  const flush = () => {
    const text = currentLines.join("\n").trim();
    if (!text) return;
    
    if (text.length > MAX_CHUNK_SIZE) {
      const subChunks = splitLongText(text, filename, currentHeading, chunkCounter);
      chunks.push(...subChunks);
      chunkCounter += subChunks.length;
    } else {
      chunkCounter++;
      chunks.push({
        id: `chunk-${chunkCounter.toString().padStart(4, "0")}`,
        source_file: filename,
        heading: currentHeading,
        chunk_index: chunkCounter,
        content: text,
      });
    }
  };

  for (const line of lines) {
    const h = headingLevel(line);
    if (h > 0) {
      if (headingEncountered) {
        flush();
      } else {
        headingEncountered = true;
      }
      currentHeading = line.replace(/^#+/, "").trim();
      currentLines = [line];
    } else {
      currentLines.push(line);
    }
  }

  if (currentLines.length > 0) {
    flush();
  }

  return chunks;
}

export function runIngest() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }

  const files: { filename: string; content: string }[] = [];
  if (fs.existsSync(INPUT_DIR)) {
    const inputFiles = fs.readdirSync(INPUT_DIR).filter(f => f.endsWith(".md")).sort();
    for (const file of inputFiles) {
      const content = fs.readFileSync(path.join(INPUT_DIR, file), "utf-8");
      files.push({ filename: file, content });
    }
  }

  const allChunks: Chunk[] = [];
  for (const file of files) {
    allChunks.push(...chunkMarkdown(file.filename, file.content));
  }

  fs.writeFileSync(CHUNKS_PATH, JSON.stringify(allChunks, null, 2), "utf-8");

  const graph = buildGraph(files);
  fs.writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2), "utf-8");

  console.log(`  Created ${allChunks.length} chunks, ${graph.nodes.length} nodes, ${graph.edges.length} edges`);
}
