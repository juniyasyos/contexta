# Contoh Output & Eksperimen Query Contexta

Halaman ini mendemonstrasikan bagaimana Contexta memproses *query* menggunakan pendekatan pencarian ketat berorientasi *identifier* (*Strict Identifier Search*) dan sistem *Semantic Chunking*.

Eksperimen ini dijalankan pada proyek **Sistem E-Commerce** (sebuah monolit Laravel). Setelah menjalankan perintah `bun run contexta scan`, Contexta memetakan **1766 file**, menemukan **1501 entitas (nodes)**, dan **1756 relasi (edges)**.

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
    "\\App\\Models\\Invoice",
    "\\App\\Http\\Controllers\\InvoiceController",
    "\\App\\Http\\Controllers\\InvoicePdfController",
    "order_has_items",
    "database/migrations/2024_10_03_171809_create_order_has_items_table.php --[creates_table]--> order_has_items",
    "GET invoice --[handled_by]--> \\App\\Http\\Controllers\\InvoiceController",
    "GET invoice/pdf --[handled_by]--> \\App\\Http\\Controllers\\InvoicePdfController",
    "Customer --[hasmany]--> \\App\\Models\\Invoice",
    "Role --[belongsto]--> \\App\\Models\\User"
  ],
  "context_pack": "Nodes/Relations: \\App\\Models\\User | \\App\\Models\\Invoice | \\App\\Http\\Controllers\\InvoiceController | \\App\\Http\\Controllers\\InvoicePdfController | order_has_items | database/migrations/2024_10_03_171809_create_order_has_items_table.php --[creates_table]--> order_has_items | GET invoice --[handled_by]--> \\App\\Http\\Controllers\\InvoiceController | GET invoice/pdf --[handled_by]--> \\App\\Http\\Controllers\\InvoicePdfController | Customer --[hasmany]--> \\App\\Models\\Invoice | Role --[belongsto]--> \\App\\Models\\User"
}
```

**Penjelasan Sistem:**
- Karena menggunakan *identifier* spesifik (`\App\Models\User`), mesin pencari langsung tepat sasaran ke objek arsitektur utama tersebut tanpa risiko *false-positive*.
- `relevant_topics` sukses mengekstrak semua relasi struktural yang terikat pada *identifier* tersebut. Misalnya `Role --[belongsto]--> \App\Models\User`.
- AI agent kemudian dapat membaca output JSON ini untuk memberikan analisis tingkat tinggi kepada pengguna berdasarkan data arsitektur yang pasti.

---

## 2. Eksplorasi Arsitektur Lanjutan (Graph Impact & Hybrid Search)

Fitur impact di Contexta memungkinkan kita melacak efek berantai jika sebuah komponen diubah.

**Perintah (CLI Graph Dasar):**
```bash
bun run contexta inspect "User"
```

Jika Anda ingin tahu "Controller mana saja yang bergantung pada Model User?", Contexta akan menelusuri `graph.json` dan membalikkan relasi, alih-alih melakukan *grep/text-search* yang memakan banyak token. Ini sangat ideal untuk *impact analysis* makro.

**Namun, ini bisa menimbulkan terlalu banyak hasil jika model sering digunakan!**

Oleh karena itu, Contexta dilengkapi fitur **Hybrid Search (Macro Graph + Micro Grep)**. Fitur ini memungkinkan AI Agent untuk menyaring *impact tree* HANYA pada file-file yang secara literal memanggil nama fungsi yang sedang dianalisis.

**Perintah Hybrid Search:**
```bash
# Skenario: Anda mengubah fungsi `hasActiveSubscription()` di model User.
# Siapa saja yang terdampak?
bun run contexta impact "model-user" --grep "hasActiveSubscription"
```

**Output:**
```text
=== IMPACT ANALYSIS FOR 'model-user' (Depth 3) (Filtered by keyword: "hasActiveSubscription") ===
   [1] model-user <-- [belongsto] <-- model-invoice
   [1] model-user <-- [belongstomany] <-- model-customer
     [2] model-invoice <-- [uses_model] <-- filament-widget-salesanalysiswidget
     [2] model-invoice <-- [uses_model] <-- filament-widget-recentinvoiceswidget
     [2] model-payment <-- [manages_model] <-- filament-resource-paymentresource
```

**Penjelasan Sistem Hybrid:**
- Secara otomatis Contexta mengumpulkan semua file yang bergantung pada `model-user` (bisa ratusan file).
- Lalu, Contexta mengeksekusi pemindaian *teks internal (grep)* HANYA di dalam sekumpulan file tersebut untuk mencari eksistensi kata `"hasActiveSubscription"`.
- Contexta hanya menampilkan jalur dependensi (*edges*) ke file-file yang secara pasti memanggil fungsi tersebut, mengerucutkan ratusan baris menjadi hanya belasan baris paling relevan.
- Sangat direkomendasikan bagi AI Agent yang ingin melakukan perombakan level fungsi (*micro refactoring*)!

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
