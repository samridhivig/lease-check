# RAG Clause Analyzer

This folder contains the production `/api/analyze-rag` pipeline. It stays
separate from the regex-first fallback analyzer so both approaches can be
compared on the same fixtures, and so production can switch back quickly if
needed.

## Current flow

1. The existing extractor still owns scalar fields such as rent, deposit
   amounts, dates, and lease term.
2. The RAG path extracts clause-aware lease chunks from the uploaded document.
3. For each selected lease clause, the RAG path retrieves a reference bundle:
   - one or more Flemish law article chunks
   - one or more Vlaanderen guidance chunks
   - one or more supporting explanation chunks
4. A RAG-specific deterministic extractor reads the selected lease clause and
   produces clause-derived fields with lease evidence and retrieved reference
   ids in the notes.
5. The merged extraction result is passed into the existing shared `runRules()`
   logic.

The fallback `/api/analyze` route does not use this folder. That route remains
the non-RAG analyzer: current extractor first, then the same shared rules.
`runRules()` now routes by `document.kind`, so residential and student leases
share the final decision layer while keeping their rulebooks separate.

## Main files

- `chunk.ts`: clause-aware chunking for leases
- `field-sets.ts`: split between scalar regex-owned fields and clause-derived
  RAG fields
- `scalar.ts`: reuse of the current extractor for the scalar subset
- `embed.ts`: local embedding helpers using `@huggingface/transformers`
- `law-corpus.ts`: load and register the precomputed reference index
- `retrieve.ts`: bundle retrieval for law articles, guidance pages, and
  explanations
- `deterministic-extractor.ts`: RAG-specific clause-field extraction patterns
- `clause-extract.ts`: lease clause selection, bundle assembly, deterministic
  clause-field extraction, and field merging

## Reference corpus

The reference corpus lives in:

- `data/rag/law-clauses.seed.json`
- `data/rag/law-index.json`

Build or rebuild the precomputed reference index with:

```bash
npm run rag:build-law-index
```

## Privacy Boundary

The RAG analyzer does not send lease text to an external LLM. Runtime lease
clauses are embedded locally with `@huggingface/transformers`, compared with the
precomputed law index in memory, and interpreted by local deterministic
patterns.

The only model download involved in this flow is the embedding model cache. Once
available locally, the uploaded lease text is not sent to Hugging Face for
embedding.

Environment overrides:

- `RAG_EMBEDDING_MODEL_ID`

## Student Lease Support

Student leases use the same RAG shape, but retrieve student-specific references
for deposit handling, renewal, tenant termination, landlord termination, and
inventory clauses. The RAG path still does not make legal decisions itself. It
extracts fields such as `termination.tenantPreStartFeeMonths`,
`notice.tenantMonths`, `deposit.method`, and `renewal.auto`; then the shared
student rulebook decides whether those facts are flags.

The key safety boundary is that student deposits may lawfully use a landlord
account. The student rulebook flags cash deposits or deposits over two months,
not every `deposit.heldByLandlord` signal.

## Current caveat

The RAG extractor is deliberately narrower than the fallback full-document
extractor. It only emits clause-derived fields for the topics represented in
`field-sets.ts`, then relies on the shared `runRules()` layer for legal
decisions. This keeps comparison clean: differences between `/api/analyze` and
`/api/analyze-rag` come from extraction, not from separate rulebooks.
