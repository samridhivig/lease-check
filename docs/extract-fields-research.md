# `extractFields` Research Notes

## Research Question

How should we design field extraction for rental contracts when document formatting varies, and does restricting the scope to Belgian residential leases in Flanders make extraction easier?

## Short Answer

Yes. Focusing on Belgian residential leases in the Flemish Region makes extraction materially easier because:

- the governing legal framework is narrower
- the required contract content is more standardized
- Dutch legal phrasing repeats across many contracts
- some subdomains, especially social housing, use mandatory model agreements

That does not remove document-AI challenges such as:

- OCR noise
- scans and photos instead of digital PDFs
- annexes and appendices
- mixed Dutch / French / English wording
- loosely structured custom clauses

## What Official Flemish Sources Suggest

### Private residential leases

Vlaanderen states that a written residential lease should at least include:

- identity of landlord and tenant
- start date
- the rented parts of the building
- rent price
- exact duration
- costs and charges
- a reference to the explanatory brochure

This gives us a stable core extraction schema.

### Contract duration and termination are structured enough to model

Vlaanderen states that residential lease contracts in principle last 9 years, with separate rules for short-duration and longer contracts. That means:

- duration is a first-class field
- we can derive a normalized lease type from duration wording
- notice and renewal clauses are worth extracting separately from raw duration

### Costs, charges, and deposit handling have recurring patterns

Official guidance separates:

- rent
- costs and charges
- rental guarantee / `huurwaarborg`

This argues against one generic "money amount" field. We should extract multiple monetary fields with distinct semantics.

### Social housing is more standardized

Wonen in Vlaanderen says social housing lessors must use type lease agreements. That means social rental contracts are a good candidate for a separate schema because the layouts and clauses are more predictable than in private-market contracts.

## What Document-AI Research Suggests

### 1. Layout matters

LayoutLM and LayoutLMv3 show that document extraction improves when text is combined with layout and visual cues, not just raw OCR text.

Practical takeaway:

- the extractor API should support page-aware evidence
- token bounding boxes should be allowed in the input even if the first implementation only uses text

### 2. OCR errors are a real failure mode

Donut argues that OCR can become the weakest link in document understanding because OCR mistakes propagate to downstream extraction.

Practical takeaway:

- keep extraction tied to the original document representation
- do not depend only on translated text for legal analysis
- leave room for OCR-free or image-aware models later

### 3. Extraction should include localization

DocILE frames the task as localization plus extraction, not just value prediction.

Practical takeaway:

- every extracted field should include evidence
- page number, snippet, and eventually bounding box should be part of the result
- this is especially important for legal review because users need traceability

### 4. Domain-specific supervision matters

CUAD shows that contract analysis benefits from expert-defined labels and that legal extraction is not solved by generic NLP alone.

Practical takeaway:

- define a Flemish-lease-specific schema
- collect a labeled set of real Flemish contracts over time
- use rules and validators even if a model is added later

## Original Language vs Translation

The analysis should run on the original contract language, not on the translated output.

Recommended rule:

- Dutch contract: extract from Dutch original
- English contract: extract from English original
- translated English or Dutch version: use for UI display, explanation, and optional cross-checking

Reasoning:

- legal meaning lives in the source text
- evidence snippets must point back to the signed contract
- translation can distort clause semantics even when amounts and dates remain intact

## Implications for API Design

The research points to a few design requirements:

- explicit schema selection, such as `be-flanders-residential-v1`
- field-level confidence
- field-level evidence
- explicit missing vs ambiguous status
- support for layout-aware inputs
- separate fields for different monetary concepts
- domain-specific normalized enums for lease type, charges mode, and deposit method

## Recommended First Extraction Schema

Start with:

- document kind and language
- property address
- landlord and tenant names
- lease start date, end date, duration, normalized lease type
- base rent
- costs and charges
- deposit amount and method
- registration mention
- move-in inventory mention
- fire insurance mention
- EPC label and score if present
- tenant and landlord notice periods
- renewal / extension wording

## What This Means for the MVP

The best MVP is not a generic AI parser. It is a hybrid extractor for Flemish leases:

1. PDF text extraction
2. deterministic section and pattern extraction
3. Flemish rule-based normalization and validation
4. evidence capture
5. low-confidence / ambiguous flags for review

That approach is more realistic and more trustworthy than jumping straight to a general model.

## Sources

- Vlaanderen, `Woninghuurovereenkomst sluiten`: https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/woninghuurovereenkomst-sluiten
- Vlaanderen, `Einde en opzegging van het huurcontract`: https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/einde-en-opzegging-van-het-huurcontract
- Vlaanderen, `Kosten en lasten`: https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/huurprijs-en-huurwaarborg/kosten-en-lasten
- Vlaanderen, `Huurprijsindexatie met correctiefactoren`: https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/huurprijs-en-huurwaarborg/huurprijsindexatie-met-correctiefactoren
- Wonen in Vlaanderen, `Huurovereenkomst` for social housing: https://www.vlaanderen.be/sociaal-woonbeleid/verhuren/huurovereenkomst
- CUAD: https://arxiv.org/abs/2103.06268
- LayoutLMv3: https://arxiv.org/abs/2204.08387
- Donut: https://arxiv.org/abs/2111.15664
- DocILE: https://arxiv.org/abs/2302.05658
