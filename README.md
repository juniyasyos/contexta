# Contexta (Caveman Librarian)

**Contexta** adalah sebuah *CLI tool* yang dirancang khusus sebagai **"Pustakawan"** untuk memetakan arsitektur proyek (termasuk Laravel) secara lokal. Tool ini mengekstrak entitas dan relasi dari *source code* dan dokumentasi ke dalam *Knowledge Graph* berformat JSON, menghemat **hingga 99%** konsumsi *context window* LLM.

## 🌟 Desain Arsitektur & Filosofi (Mode Pembacaan Knowledge)

Tool ini beroperasi dengan prinsip **"Caveman Librarian"** — murni sebagai mesin *retrieval & indexing* tanpa menggunakan LLM lokal untuk menghasilkan jawaban (NLG di-disable). Semua pemrosesan berbasis *pattern matching* bukan AST parsing berat, sehingga sangat cepat dan ringan.

**Karakteristik Kunci:**
- **Zero Database:** Hanya menggunakan `chunks.json` dan `graph.json` lokal. Tidak ada dependensi Neo4j atau Vector DB. Ini adalah implementasi dari **CacheLock** di mana data yang sudah dibaca dikunci dalam JSON statis.
- **Anti-Fragile Scanner:** Memiliki *in-memory comment stripper* yang otomatis membuang komentar/kode mati sebelum di-*scan*, mencegah *false-positive* relasi hantu.
- **Multi-Domain Scanning (seperti Laravel):** Mendeteksi berbagai domain arsitektur (Models, Services, Controllers, Routes, Migrations, Policies, dll).
- **Cross-Domain Relations:** Mampu mendeteksi injeksi dependensi (`depends_on`) dan pemanggilan lintas domain (`uses_model`, `authorizes`, `seeds`, `renders`).
- **Stateless:** Kode *parser* terpisah dari penyimpanan data (yang default-nya diletakkan di `docs/ai-agent/contexta/output/` pada direktori proyek target).

## 🚀 Performa & Efisiensi Konteks

Dibandingkan dengan pencarian konvensional (Grep) yang memuat seluruh *source code* ke dalam *context window* LLM, tool ini secara ekstrem meringkas muatan dengan berfokus menyuplai **metadata arsitektur dan relasi**:

| Metrik | Pencarian Konvensional (Grep) | Pendekatan Pustakawan (Contexta) |
|--------|------------------|-------------------|
| **Payload ke LLM** | Menyuapkan seluruh isi *file* kode mentah. | Menyuapkan ringkasan relasi (node & *edges*). |
| **Kebutuhan Token** | Sangat besar (bisa > 20.000 token). | Sangat kecil (dibatasi ketat ~150 hingga 500 token). |
| **Fungsi Ideal** | Analisis logika fungsi spesifik & *debugging*. | Pemetaan arsitektur & *impact analysis* tahap awal. |

*Kesimpulan: Tool ini memangkas konsumsi token di fase awal (discovery) dengan membuang logika kode dan berfokus murni pada pemetaan struktur.*

## 🛠️ Instalasi & Setup

1. **Install Package (Bun):**
```bash
bun install
```

2. **Build Knowledge Graph (Ingest / Scan):**
```bash
# Melakukan scanning code & ingest docs secara penuh
bun run index.ts ingest
# atau
bun run index.ts scan
```

## 📁 Struktur Direktori

```text
Contexta/
├── src/
│   ├── index.ts        # Entry point utama aplikasi
│   ├── scanner.ts      # [BARU] Mesin pemindai Regex arsitektur Laravel (Anti-Fragile Scanner)
│   ├── freshness.ts    # [BARU] Logika untuk mencatat dan mengecek status rebuild (Metadata)
│   ├── ingest.ts       # Logika untuk membaca markdown
│   ├── query.ts        # Logika pencarian cerdas berbasis intent
│   ├── graph.ts        # Parser markdown menjadi grafik
│   ├── graph_ops.ts    # Operasi grafik (impact analysis, visualisasi Mermaid)
│   ├── paths.ts        # Konfigurasi lokasi data
│   └── scanners/       # [BARU] Aturan pattern matching (YAML)
│       ├── laravel.yml # Aturan ekstrak node & edge Laravel
│       └── dictionary.yml 
├── docs/ai-agent/contexta/output/ # (Otomatis dibuat) Penyimpanan graph.json, chunks.json, dll.
├── bun.lock            # Lockfile (Dependency Lock)
├── package.json        # Konfigurasi dependensi
└── README.md
```

## 🤖 Perintah CLI (Untuk AI Agent & Developer)

Tool ini berjalan dari *root* direktori proyek target.

### 1. Eksplorasi Arsitektur (Graph)
```bash
# Menampilkan statistik jumlah node/edge di proyek
bun run index.ts graph stats

# Mencari node berdasarkan keyword (contoh: "user")
bun run index.ts graph "user"

# Melihat KESELURUHAN relasi (inbound & outbound) dari satu entitas
bun run index.ts inspect "model-user"

# Deep Impact Analysis (Efek Domino N-Hop)
# Melacak siapa saja yang terdampak jika suatu file diubah (misal kedalaman 3 tingkat)
bun run index.ts impact "model-user" --depth 3

# Visualisasi Arsitektur (Mermaid.js)
# Men-generate kode diagram Mermaid TD untuk dirender secara visual (Markdown/GitHub)
bun run index.ts visualize "controller-usercontroller"
```

### 2. Keyword & Intent-Based Querying
```bash
# Mendapatkan konteks terstruktur untuk AI Agent (menggunakan intent routing & keyword scoring)
bun run index.ts query --intent architecture_analysis --subject "Laporan Imut"

# Intent yang tersedia:
# project_overview, architecture_analysis, service_lookup, data_model_lookup,
# command_lookup, api_reference, troubleshooting, docs_lookup
```

### 3. Pencarian Raw
```bash
# Mencari string spesifik dalam output Contexta
bun run index.ts search --intent docs_lookup --subject "authentication"
```

## 📁 Struktur Data Graph (Cache & Lock)

Output *cache* pengetahuan disimpan di direktori output (default: `docs/ai-agent/contexta/output/`). Ini bertindak sebagai mekanisme "CacheLock" atau penyimpanan statis untuk struktur arsitektur:

- **Nodes (`graph.json`):** Entitas seperti `Table`, `Model`, `Controller`, `Service`, `Route`, `Policy`, `FilamentResource`.
- **Edges (`graph.json`):** Relasi seperti `has_column`, `uses_model`, `depends_on`, `handled_by`, `creates_table`, `authorizes`, `seeds`.
- **Chunks (`chunks.json`):** Pecahan dokumentasi *markdown* yang telah di-index.
- **`bun.lock`:** Digunakan secara internal oleh Bun untuk mengunci dependensi engine Contexta agar konsisten (*Dependency Lock*).

---
*Dikembangkan secara khusus untuk menganalisis arsitektur proyek kompleks (seperti monolit Laravel) dengan prinsip Caveman Librarian.*
