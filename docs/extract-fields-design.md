# `extractFields` API Design

## Goal

Extract structured, reviewable facts from rental documents, starting with residential rental contracts in Belgium, limited to the Flemish Region.

This is not just "parse a PDF into text". The API should return:

- normalized field values
- confidence per field
- evidence snippets for auditability
- missing/ambiguous fields
- document classification metadata

That structure matches what recent document-AI and contract-review research emphasizes: layout matters, evidence localization matters, and domain-specific schemas outperform generic extraction.

## Why Flanders-first Is Easier

Scoping to Flemish residential leases makes extraction meaningfully easier because the legal regime and contract contents are narrower than "any rental agreement anywhere".

Official Flemish guidance for private residential leases says the contract must include at least:

- landlord and tenant identity
- start date
- rented premises / parts of the building
- rent price
- exact duration
- costs and charges
- a reference to the explanatory brochure

Other high-signal facts are also governed by fairly stable regional rules:

- registration by the landlord within 2 months
- detailed move-in inventory / `plaatsbeschrijving` within the first month
- rental guarantee cap of up to 3 months for contracts after 1 January 2019
- default treatment as a 9-year contract when no duration is stated, or when the stated duration is between 3 and 9 years
- fire insurance requirement for both landlord and tenant since 1 January 2019

This helps because:

- we can define a smaller schema
- we can write stronger validators
- we can normalize common Dutch legal phrasing
- social-housing contracts are even more regular because Vlaanderen provides mandatory model contracts

It is still not "easy" because formatting, scan quality, annexes, and OCR errors remain hard.

## Recommended Method Shape

```ts
type LeaseExtractionSchema =
  | 'be-flanders-residential-v1'
  | 'be-flanders-social-v1'
  | 'be-flanders-student-v1';

type LeaseFieldId =
  | 'document.kind'
  | 'document.language'
  | 'property.address'
  | 'parties.landlord.names'
  | 'parties.tenant.names'
  | 'lease.startDate'
  | 'lease.endDate'
  | 'lease.duration'
  | 'lease.type'
  | 'rent.baseAmount'
  | 'rent.currency'
  | 'charges.amount'
  | 'charges.mode'
  | 'deposit.amount'
  | 'deposit.method'
  | 'registration.required'
  | 'registration.mentioned'
  | 'inventory.mentioned'
  | 'insurance.fireMentioned'
  | 'epc.label'
  | 'epc.score'
  | 'notice.tenantMonths'
  | 'notice.landlordMonths'
  | 'renewal.auto'
  | 'annexes.detected';

interface ExtractFieldsInput {
  text?: string;
  pages?: Array<{
    page: number;
    text?: string;
    tokens?: Array<{
      text: string;
      bbox: [number, number, number, number];
    }>;
  }>;
  fileName?: string;
  mimeType?: string;
}

interface ExtractFieldsOptions {
  schema: LeaseExtractionSchema;
  requestedFields?: LeaseFieldId[];
  country?: 'BE';
  region?: 'FLANDERS';
  languageHints?: Array<'nl' | 'fr' | 'en'>;
  preferLayoutSignals?: boolean;
  returnEvidence?: boolean;
  strictness?: 'strict' | 'balanced' | 'lenient';
}

interface ExtractedValue<T> {
  value: T | null;
  confidence: number;
  status: 'found' | 'missing' | 'ambiguous' | 'derived';
  evidence?: Array<{
    page?: number;
    snippet: string;
    start?: number;
    end?: number;
    bbox?: [number, number, number, number];
  }>;
  notes?: string[];
}

interface ExtractFieldsResult {
  schema: LeaseExtractionSchema;
  documentTypeConfidence: number;
  detectedLanguage: 'nl' | 'fr' | 'en' | 'unknown';
  fields: Partial<Record<LeaseFieldId, ExtractedValue<unknown>>>;
  missingFields: LeaseFieldId[];
  warnings: string[];
}

declare function extractFields(
  input: ExtractFieldsInput,
  options: ExtractFieldsOptions,
): ExtractFieldsResult;
```

## Reasoning Behind The API Design

This API shape is designed around three realities:

- legal review needs traceability, not just predicted values
- Flemish rental analysis is domain-specific enough to deserve an explicit schema
- the extraction engine will likely evolve from text rules to hybrid layout-aware pipelines

### Why the input is `input + options`

Separating document content from extraction settings keeps the method extensible.

`input` contains the document payload:

- raw text
- page text
- token layout data
- file metadata

`options` contains the extraction intent:

- which schema to apply
- which fields to prioritize
- whether evidence should be returned
- how strict the extractor should be

This avoids repainting the API every time we add a new model, new region, or new output mode.

### Why `schema` is mandatory

The same phrase can mean different things in different legal regimes. Making the caller declare the schema reduces silent misclassification and gives us a stable contract for downstream rule checks.

### Why fields return objects instead of primitive values

For this product, `1500` alone is not enough. We also need to know:

- how sure the extractor is
- where the value came from
- whether the value was directly found or derived
- whether multiple competing values were detected

That is why `ExtractedValue<T>` should be the core unit.

### Why `status` exists in addition to `confidence`

Confidence and status answer different questions.

- `confidence` answers "how sure are we?"
- `status` answers "what happened?"

A field can have low confidence because the scan is messy, or it can be missing because the contract does not state it, or ambiguous because two clauses conflict. Those cases should not be flattened into one score.

### Why evidence is first-class

Evidence is necessary for:

- user trust
- reviewer workflows
- debugging extraction failures
- future supervised learning

If the UI later highlights the exact clause behind an extracted field, this API already supports that.

### Why layout support is present before we fully use it

We should not lock the interface to plain text only. Research and production experience both suggest that layout-aware extraction is useful for heterogeneous contracts, tables, headers, signature blocks, and annexes. Supporting layout at the API boundary now makes future upgrades much less disruptive.

### Why the API should stay document-language-first

Extraction should remain anchored to the original contract language. Translation is useful for the user experience, but the authoritative extraction should come from the source text so evidence and legal meaning remain aligned.

## Why This Shape

### 1. `requestedFields` should be optional, not mandatory

Most callers will want the standard schema. Optional field selection is useful for:

- lightweight UI flows
- partial re-extraction after human correction
- performance tuning later

### 2. `schema` should be explicit

Do not infer the legal regime purely from the document.

Use the schema as a contract between caller and extractor:

- `be-flanders-residential-v1` for private residential leases
- `be-flanders-social-v1` for social-housing documents
- `be-flanders-student-v1` for student housing

This avoids mixing rules and keeps future Wallonia/Brussels expansion clean.

### 3. Evidence must be first-class

For legal documents, a scalar without supporting text is not enough.

Every extracted field should ideally return:

- source snippet
- page number
- character span or bounding box if available
- confidence

This is important for review workflows and for debugging OCR/model failures.

### 4. `status` is as important as `value`

Missing and ambiguous fields should be represented explicitly.

Examples:

- `lease.duration`: ambiguous when both "1 year" and "9 years" appear in different sections
- `charges.amount`: missing when charges are described but no amount is stated
- `lease.type`: derived when duration implies `nine_year`

### 5. Layout-aware inputs should be supported from day 1

Even if the first implementation only uses plain text, the API should already accept page/tokens/bounding boxes.

Research consistently shows that layout and localization improve extraction from heterogeneous documents.

## First Flemish Schema

For `be-flanders-residential-v1`, I would start with three groups of fields.

### A. Core identity and property

- `document.kind`
- `document.language`
- `property.address`
- `parties.landlord.names`
- `parties.tenant.names`

### B. Contract economics

- `rent.baseAmount`
- `rent.currency`
- `charges.amount`
- `charges.mode`
- `deposit.amount`
- `deposit.method`

### C. Legal/compliance signals

- `lease.startDate`
- `lease.endDate`
- `lease.duration`
- `lease.type`
- `registration.required`
- `registration.mentioned`
- `inventory.mentioned`
- `insurance.fireMentioned`
- `epc.label`
- `epc.score`
- `notice.tenantMonths`
- `notice.landlordMonths`
- `renewal.auto`
- `annexes.detected`

## Suggested Normalized Enums

```ts
type LeaseType =
  | 'short_term'
  | 'nine_year'
  | 'long_term'
  | 'lifetime'
  | 'student'
  | 'social'
  | 'unknown';

type ChargesMode =
  | 'fixed'
  | 'advance_payment'
  | 'mixed'
  | 'not_stated';

type DepositMethod =
  | 'blocked_account'
  | 'financial_guarantee'
  | 'ocmw_advance'
  | 'personal_surety'
  | 'unknown';
```

## Implementation Strategy

The design should support a hybrid pipeline instead of a regex-only approach.

### Phase 1: deterministic extraction and validation

- OCR / PDF text extraction
- section detection
- field-specific rules for dates, amounts, parties, EPC labels, deposit wording
- validators derived from Flemish rules

This is the fastest path to a trustworthy MVP.

### Phase 2: layout-aware extraction

- pass page tokens and bounding boxes
- use layout-aware or OCR-free models for difficult scans and varied templates
- keep rule-based validators after model extraction

### Phase 3: human-in-the-loop correction

- surface low-confidence or ambiguous fields
- store accepted corrections
- use those corrections as labeled data for retraining or prompt refinement

## What Research Suggests We Should Copy

### Layout is not optional

LayoutLM / LayoutLMv3 show that combining text with document layout improves visually rich document understanding, including form and receipt extraction.

### End-to-end OCR-free approaches are useful when OCR quality is unstable

Donut highlights a common failure mode for document pipelines: OCR errors propagate into downstream extraction. That is relevant for noisy scans, photos, and mixed-language contracts.

### Evaluate extraction as localization + extraction, not just text matching

DocILE distinguishes key information extraction from key information localization and extraction. That is a good mental model for a legal review product because humans need to see where the value came from.

### Domain-specific supervision matters

CUAD shows that legal contract review benefits from expert-defined labels and that generic transformer performance still leaves room for improvement. In practice, that argues for a Flemish-lease-specific schema and an internal labeled set, even if small at first.

## Recommendation for the Current Codebase

The current `extractFields(text)` implementation is a good placeholder, but its field set is US-centric and too narrow for the Flemish product.

I would replace it in two steps:

1. Keep a synchronous `extractFields` function, but change the signature to accept `input + options`.
2. Change the return type from raw scalars to `ExtractedValue<T>` objects with confidence and evidence.

If the rest of the API still expects simple scalars, add a small adapter layer:

```ts
const extraction = extractFields(input, {
  schema: 'be-flanders-residential-v1',
  returnEvidence: true,
  strictness: 'balanced',
});

const rentAmount = extraction.fields['rent.baseAmount']?.value ?? null;
```

## Sources

- Vlaanderen private residential lease guidance: https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/woninghuurovereenkomst-sluiten
- Vlaanderen rental guarantee guidance: https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/huurprijs-en-huurwaarborg/huurwaarborg
- Vlaanderen contract termination guidance: https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/einde-en-opzegging-van-het-huurcontract
- Vlaanderen costs and charges guidance: https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/huurprijs-en-huurwaarborg/kosten-en-lasten
- Vlaanderen EPC/indexation guidance: https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/huurprijs-en-huurwaarborg/huurprijsindexatie-met-correctiefactoren
- Vlaanderen social-housing contract guidance: https://www.vlaanderen.be/sociaal-woonbeleid/verhuren/huurovereenkomst
- CUAD: https://arxiv.org/abs/2103.06268
- LayoutLMv3: https://arxiv.org/abs/2204.08387
- Donut: https://arxiv.org/abs/2111.15664
- DocILE: https://arxiv.org/abs/2302.05658
