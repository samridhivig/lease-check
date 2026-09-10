# LeaseCheck - Developer Guide & Architecture

## 1. Introduction
This document serves as an exhaustive technical guide for developers working on the `LeaseCheck` application. It details the steps the application takes under the hood to process, analyze, and translate a lease agreement, alongside the technical decisions and constraints modeled into the codebase.

## 2. Tech Stack Setup
* **Framework**: Next.js (App Router setup).
* **Language**: TypeScript for strict type-checking and robust models.
* **Styling**: Tailwind CSS for rapid atomic class design.
* **Parsers**: `pdfjs-dist` running directly in the browser to extract text locally from user-uploaded PDFs without sending them to any server. (`pdf-parse` is used for server-side fixture scripts).
* **Semantic Embeddings / RAG**: `@huggingface/transformers` running client-side inside a background Web Worker (`lib/rag/rag-worker.ts`), utilizing `Xenova/paraphrase-multilingual-MiniLM-L12-v2` with embeddings cached permanently in browser `IndexedDB` / `CacheStorage`.
* **Translation / ML**: `@huggingface/transformers` running locally on the server (Node runtime) utilizing the `Xenova/opus-mt-nl-en` translation model. `franc-min` is used for text language detection.

## 3. Application Flow & Architecture

The application adopts a **privacy-first, client-side execution model** for contract analysis:

### A. The Client Side (`app/page.tsx`)
The frontend is a single-page upload interface with zero-document-upload analysis:
* The page and UI render immediately (< 200 ms).
* On mount, a background Web Worker silently preloads and caches the multilingual embedding model.
* When the user drops a PDF, text is extracted client-side via `pdfjs-dist` and processed locally. The PDF file is **never uploaded to any server**.
* If translation is requested, `/api/translate` is invoked.
* The older headless API `/api/analyze` remains available on the server for automated fixture checks and developer scripts.

### B. The Client-Side RAG Analysis Pipeline (`lib/rag/analyze.ts` & `lib/rag/rag-worker.ts`)
The production analysis pipeline runs 100% client-side inside a Web Worker:
1. **Client-Side PDF Parsing (`lib/client-pdf.ts`):** `pdfjs-dist` reads the binary PDF directly from the browser `File` object into plaintext.
2. **Scalar Extraction (`lib/rag/scalar.ts` + `lib/extract.ts`)**:
   * Extracts scalar fields such as document kind, language, rent, dates, deposit amount/months, and lease duration via fast pattern matching.
3. **Clause-Aware RAG (`lib/rag/*`)**:
   * The uploaded lease text is split into clause-aware chunks.
   * Runtime lease clauses are embedded locally with `@huggingface/transformers` in the Web Worker.
   * Each lease clause retrieves relevant precomputed legal references from `data/rag/law-index.json` (516 KB precomputed legal index loaded in memory).
   * A deterministic RAG extractor turns those selected clauses into clause-derived fields with legal citations.
4. **The Rules Engine (`lib/rules.ts`)**:
   * The merged scalar + RAG fields are passed through the shared `runRules()` layer.
   * Rule evaluation is routed by `document.kind`: `residential_lease` uses the principal-residence residential rulebook, `student_lease` uses the student rulebook, and unsupported kinds still produce no legal flags.
5. **Response Summary & Explanations**:
   * `lib/explanations.ts` appends direct URL citations to the official `vlaanderen.be` domain to back up the flag statements.
6. **Progressive Fallback**:
   * If a user submits immediately before the background embedding model finishes downloading, `analyzeLeaseFast()` runs instantly with zero wait time.

### C. The Headless Server Analysis Pipeline (`app/api/analyze/route.ts`)
This API endpoint remains available for automated regression scripts and programmatic integration:
1. **PDF Parsing:** The buffer is sent to `pdf-parse` to convert the binary PDF into plaintext.
2. **Extraction Engine (`lib/extract.ts`)**: Plaintext regex extraction and classification.
3. **The Rules Engine (`lib/rules.ts`)**: Evaluates Flemish housing law rules and returns flagged issues.

### D. The Translation Pipeline (`app/api/translate/route.ts`)
This endpoint defines the parsing for language handling:
1. **Language Detection**: The text is passed to `franc-min` with a 4000-character sample chunk to infer the language code.
2. **Constraint Check**: Only handles detection. If not Dutch (`nld`), it politely skips translation to conserve memory and return early.
3. **Chunking mechanism (`lib/translation.ts`)**: 
   * Models have a max token limit. The application safely splits large texts at sentence boundaries via regex (`/(?<=[.!?])\s+/`), wrapping them into segments up to 900 characters each.
4. **Local ML Translation**: The `@huggingface/transformers` library pulls the `Xenova/opus-mt-nl-en` ONNX model into memory (cached locally in `.cache/transformers`) and translates the chunks iteratively.

## 4. Key Engineering Decisions
* **100% Client-Side Privacy**: Lease contracts contain sensitive personal information (tenant/landlord names, addresses, bank accounts, rental amounts). Processing the contract entirely inside the user's browser guarantees that zero contract data is sent over the wire or stored on any server.
* **Vercel Free-Tier Immunity**: Because RAG embedding and PDF parsing run in the browser, the server does zero heavy ML compute. The app avoids serverless package size limits (250 MB), memory ceilings (1024 MB), and execution timeouts (15s).
* **Silent Background Preloading**: Embedding models are downloaded in a dedicated Web Worker on separate threads, keeping page load instant and the UI thread buttery smooth.
* **Deterministic Interpretation**: Both analyzers avoid proprietary LLM interpretation for legal decisions. Uploaded lease text is not sent to an external LLM; RAG embeddings run locally with `@huggingface/transformers`.
* **Scope Gating via Classification**: The extractor is allowed to be broad, but the legal rule engine is intentionally routed by supported document kind. That lets the app surface useful extracted data for many lease-like documents while avoiding misleading residential-law flags on contracts that fall outside the supported rulebooks.
* **Separation of Extractor and Rules**: The extraction separates "what the contract says" from "is this legal". `extract.ts` only discovers signals; `rules.ts` evaluates them. This is an excellent domain-driven design decision allowing rapid future updates if the government changes the legal requirements.
