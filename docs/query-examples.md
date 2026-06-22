# Contoh Output & Eksperimen Query Contexta

Halaman ini mendemonstrasikan bagaimana Contexta memproses *query* menggunakan pendekatan pencarian ketat berorientasi *identifier* (*Strict Identifier Search*) dan sistem *Semantic Chunking*.

Eksperimen ini dijalankan pada proyek **siimut** (sebuah monolit Laravel). Setelah menjalankan perintah `bun run contexta scan`, Contexta memetakan **1766 file**, menemukan **1501 entitas (nodes)**, dan **1756 relasi (edges)**.

## 1. Strict Keyword Identifier Query

Contexta **BUKAN** chatbot AI yang menerima bahasa natural (seperti *"model user ini mengarah kemana?"*). Pertanyaan semacam itu rentan menimbulkan ambiguitas atau salah deteksi karena tidak memiliki pengenal (*identifier*) yang kuat.

Oleh karena itu, pencarian di Contexta diwajibkan menggunakan *identifier* komponen secara eksplisit (contoh: `\App\Models\User` atau `UserController`).

**Perintah:**
```bash
bun run contexta query --intent data_model_lookup --subject "\\App\\Models\\User"
```

**Output Mentah (JSON):**
```json
{
  "intent": "data_model_lookup",
  "subject": "\\App\\Models\\User",
  "entities": [],
  "keys": [],
  "domains": [],
  "route": "code_lookup",
  "confidence": 0.4,
  "relevant_docs": [],
  "relevant_topics": [
    "\\App\\Models\\User",
    "\\App\\Models\\LaporanUnitKerja",
    "\\App\\Http\\Controllers\\CategoryReportController",
    "\\App\\Http\\Controllers\\CategoryReportPdfController",
    "folder_has_models",
    "database/migrations/2024_10_03_171809_create_folder_has_models_table.php --[creates_table]--> folder_has_models",
    "GET kategori --[handled_by]--> \\App\\Http\\Controllers\\CategoryReportController",
    "GET kategori/pdf --[handled_by]--> \\App\\Http\\Controllers\\CategoryReportPdfController",
    "UnitKerja --[hasmany]--> \\App\\Models\\LaporanUnitKerja",
    "FormTemplate --[belongsto]--> \\App\\Models\\User"
  ],
  "context_pack": "Nodes/Relations: \\App\\Models\\User | \\App\\Models\\LaporanUnitKerja | \\App\\Http\\Controllers\\CategoryReportController | \\App\\Http\\Controllers\\CategoryReportPdfController | folder_has_models | database/migrations/2024_10_03_171809_create_folder_has_models_table.php --[creates_table]--> folder_has_models | GET kategori --[handled_by]--> \\App\\Http\\Controllers\\CategoryReportController | GET kategori/pdf --[handled_by]--> \\App\\Http\\Controllers\\CategoryReportPdfController | UnitKerja --[hasmany]--> \\App\\Models\\LaporanUnitKerja | FormTemplate --[belongsto]--> \\App\\Models\\User"
}
```

**Penjelasan Sistem:**
- Karena menggunakan *identifier* spesifik (`\App\Models\User`), mesin pencari langsung tepat sasaran ke objek arsitektur utama tersebut tanpa risiko *false-positive*.
- `relevant_topics` sukses mengekstrak semua relasi struktural yang terikat pada *identifier* tersebut. Misalnya `FormTemplate --[belongsto]--> \App\Models\User`.
- AI agent kemudian dapat membaca output JSON ini untuk memberikan analisis tingkat tinggi kepada pengguna berdasarkan data arsitektur yang pasti.

---

## 2. Eksplorasi Arsitektur Lanjutan (Graph Impact)

Fitur impact di Contexta memungkinkan kita melacak efek berantai jika sebuah komponen diubah.

**Perintah (CLI Graph):**
```bash
bun run contexta inspect "\\App\\Models\\User"
```

**Output Konseptual:**
Jika Anda ingin tahu "Controller mana saja yang bergantung pada Model User?", Contexta akan menelusuri `graph.json` dan membalikkan relasi, alih-alih melakukan *grep/text-search* yang memakan banyak token. Ini sangat ideal untuk *impact analysis* di proyek besar.

---

## 3. Contoh Output Chunking Dokumentasi (Breadcrumbs)

Sistem Contexta mendukung pemetaan dokumen Markdown untuk menghasilkan *chunking* berbasis semantik, berguna jika AI perlu mencari panduan teknis yang bukan berbentuk kode.

**Perintah:**
```bash
bun run contexta query --intent docs_lookup --subject "Instalasi"
```

**Output Chunk yang Dikembalikan ke LLM:**
```json
{
  "id": "readme-md-chunk-0005",
  "source_file": "README.md",
  "breadcrumbs": [
    "Contexta (Caveman Librarian)",
    "Instalasi & Setup"
  ],
  "heading": "Instalasi & Setup",
  "chunk_index": 5,
  "content": "1. Install Package (Bun):\n```bash\nbun install\n```"
}
```

**Kelebihan Format Ini:**
Dibandingkan memuat seluruh isi `README.md`, AI hanya akan disuapkan satu paragraf *content* spesifik beserta penanda posisinya (`breadcrumbs`). AI secara akurat memahami bahwa panduan "bun install" ini adalah bagian dari struktur "Instalasi & Setup" di "Contexta (Caveman Librarian)".
