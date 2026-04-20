# LeaseCheck - Developer Guide & Architecture

## 1. Introduction
This document serves as an exhaustive technical guide for developers working on the `LeaseCheck` application. It details the steps the application takes under the hood to process, analyze, and translate a lease agreement, alongside the technical decisions and constraints modeled into the codebase.

## 2. Tech Stack Setup
* **Framework**: Next.js (App Router setup).
* **Language**: TypeScript for strict type-checking and robust models.
* **Styling**: Tailwind CSS for rapid atomic class design.
* **Parsers**: `pdf-parse` running in a Node.js environment to extract text from user-uploaded PDFs.
* **Translation / ML**: `@huggingface/transformers` running locally on the server (Node runtime) utilizing the `Xenova/opus-mt-nl-en` translation model. `franc-min` is used for text language detection.

## 3. Application Flow & API Architecture

The application defines a clear boundary between the React frontend UI and the specialized Node.js API handlers doing the heavy lifting.

### A. The Client Side (`app/page.tsx`)
The frontend is a single-page upload interface interacting with two distinct server API routes.
* The user states intention by providing a file and checking the translate toggle.
* Two concurrent asynchronous fetches to `/api/analyze` and `/api/translate` are fired.
* It gracefully handles processing states and uses conditionally rendering logic to display translation previews, flagged issues with severities, and source links. 

### B. The Analysis Pipeline (`app/api/analyze/route.ts`)
This API endpoint defines the following flow upon receiving a PDF:
1. **PDF Parsing:** The buffer is sent to `pdf-parse` to convert the binary PDF into plaintext.
2. **Extraction Engine (`lib/extract.ts`)**: 
   * **Normalization:** Compresses whitespace and forces uniform encoding patterns.
   * **Signal Catching:** The plaintext is aggressively parsed using a large array of Regular Expressions. These regexes target amounts, duration phrases, tenant/landlord roles, and specific legal jargon in Dutch, English, and French.
   * **Document Classification:** In addition to field extraction, the parser now infers a `document.kind` such as residential lease, commercial lease, student lease, sublease, or regulated/social variants.
   * **Field Building:** Based on the gathered signals (like finding `1.5 months` under a `break fee` clause), it returns structured JSON representing standardized contract fields with dynamically calculated confidence scores.
3. **The Rules Engine (`lib/rules.ts`)**:
   * Evaluates the extracted fields against hard-coded logic defining Flemish law.
   * Rule evaluation now runs only when the classified document kind is `residential_lease`. Out-of-scope contracts are still parsed and surfaced in the UI, but they do not produce Flemish residential rule flags.
   * For example, the `isShortLease` helper function checks if the term is <=36 months to apply strict termination regulations distinct from 9-year contracts.
   * Rules that trigger output a flag containing a rule ID, severity (`high`, `medium`, `low`), and explanation message.
4. **Response Summary & Explanations**:
   * The API summary reflects this scope decision. If the uploaded PDF looks like a commercial lease, student lease, sublease, or another non-supported category, the summary explicitly says that legal rule checks were not applied.
   * `lib/explanations.ts` appends direct URL citations to the official `vlaanderen.be` domain to back up the flag statements.

### C. The Translation Pipeline (`app/api/translate/route.ts`)
This endpoint defines the parsing for language handling:
1. **Language Detection**: The text is passed to `franc-min` with a 4000-character sample chunk to infer the language code.
2. **Constraint Check**: Only handles detection. If not Dutch (`nld`), it politely skips translation to conserve memory and return early.
3. **Chunking mechanism (`lib/translation.ts`)**: 
   * Models have a max token limit. The application safely splits large texts at sentence boundaries via regex (`/(?<=[.!?])\s+/`), wrapping them into segments up to 900 characters each.
4. **Local ML Translation**: The `@huggingface/transformers` library pulls the `Xenova/opus-mt-nl-en` ONNX model into memory (cached locally in `.cache/transformers`) and translates the chunks iteratively.

## 4. Key Engineering Decisions
* **Regex / Heuristic Parsing over LLMs**: The system relies on string-matching and heuristics rather than sending texts to proprietary LLM endpoints (like OpenAI). 
  * **Pros**: It is incredibly fast, cheap to run, fully deterministic, and enhances data privacy since the legal contract never leaves the local server to a third party.
  * **Cons**: Regexes are brittle across language nuances and unstructured inputs. The app currently requires rigid lease phrasing typical in Belgium to extract accurately.
* **Scope Gating via Classification**: The extractor is allowed to be broad, but the legal rule engine is intentionally narrower. That lets the app surface useful extracted data for many lease-like documents while avoiding misleading residential-law flags on contracts that fall outside the supported rulebook.
* **On-the-fly Model Loading**: The NLP translation framework loads into server memory upon the first invocation using a Singleton pattern (`globalForTranslation`). This makes the very first request slow (model download), but subsequent requests fast.
* **Separation of Extractor and Rules**: The extraction separates "what the contract says" from "is this legal". `extract.ts` only discovers signals; `rules.ts` evaluates them. This is an excellent domain-driven design decision allowing rapid future updates if the government changes the legal requirements.
