# Flanders Residential Lease Research

Research date: 12 April 2026

Scope: principal-residence residential leases in the Flemish Region of Belgium, with a strong focus on leases signed on or after 1 January 2019 under the Vlaams Woninghuurdecreet.

Purpose: turn scattered legal and guidance material into a deterministic rule list for `runRules`, with sources, confidence levels, and notes on what is safe or unsafe to automate.

## Method

This note prioritizes official government sources:

- Vlaanderen.be guidance pages for plain-language rules and current administrative explanations.
- Codex Vlaanderen for the underlying decree text.
- FOD Financien / MyRent material for registration mechanics when useful.

Where guidance pages and Codex say the same thing, both are cited. Where guidance is clearer than the decree for operational behavior, the guidance page is cited directly. If a point is legally true but difficult to infer from lease text alone, that is flagged as a manual-review rule instead of a hard deterministic rule.

## Scope assumptions for automation

These rules are safest when all of the following are true:

- The property is in Flanders.
- The lease concerns the tenant's hoofdverblijfplaats / principal residence.
- The lease was signed on or after 1 January 2019.
- The document is a standard private residential lease, not a student lease, social housing lease, tourism stay, or commercial lease.

If those assumptions are not met, some rules below may not apply or may apply differently.

## Recommended deterministic rule set

The table below is the research-backed candidate rulebook. "Confidence" refers to confidence in both the legal proposition and its suitability for deterministic checking.

| ID | Rule | Deterministic interpretation | Confidence | Suggested status |
| --- | --- | --- | --- | --- |
| FL-001 | Lease must be in writing | If the contract is missing core written-lease structure, flag for manual review | Medium | Optional / manual |
| FL-002 | Required lease contents | Contract should state parties, start date, exact term, premises, rent, costs/charges, and reference to official explanatory note | Medium | Optional / manual |
| FL-003 | Entry inventory required | Clauses waiving the place description / inventory should be flagged | High | Hard rule |
| FL-004 | Registration is landlord's duty within 2 months | Clauses shifting registration to tenant or extending the deadline should be flagged | High | Hard rule |
| FL-005 | No term or a term between 3 and 9 years becomes a 9-year lease | A stated term in that range should be treated as long lease logic | High | Hard rule |
| FL-006 | Short lease is max 3 years and can be extended only once within total 3 years | A short lease with longer total duration should be flagged | High | Future hard rule |
| FL-007 | Short lease: tenant may terminate anytime with 3 months notice | Longer tenant notice or a no-break clause should be flagged | High | Hard rule |
| FL-008 | Short lease: tenant break fee capped at 1.5 / 1 / 0.5 months | Fee above that scale should be flagged | High | Hard rule |
| FL-009 | Short lease: landlord has no statutory early termination right | Early landlord termination right in short lease should be flagged | High | Hard rule |
| FL-010 | Long lease: tenant may terminate anytime with 3 months notice | Longer tenant notice should be flagged | High | Hard rule |
| FL-011 | Long lease: tenant break fee capped at 3 / 2 / 1 months in years 1-3 | Fee above that scale should be flagged | High | Hard rule |
| FL-012 | Long lease: landlord early termination rights are limited and conditioned | Broad discretionary landlord break clauses should be flagged | Medium | Manual / future rule |
| FL-013 | Rent cannot be freely changed after signature | Clauses allowing unilateral rent changes outside legal channels should be flagged | High | Future hard rule |
| FL-014 | Indexation only once per rental year, on anniversary, by written request, with max 3 months retroactivity | More frequent or automatic indexation should be flagged | High | Hard rule |
| FL-015 | Property tax cannot be charged to tenant | Any clause passing onroerende voorheffing to tenant should be flagged | High | Hard rule |
| FL-016 | Costs/charges should be separate from rent and evidenced unless a valid forfait is used | Clauses forcing opaque non-itemized extra charges should be flagged | Medium | Manual / future rule |
| FL-017 | Security deposit may not exceed 3 months rent | Deposit above 3 months should be flagged | High | Hard rule |
| FL-018 | Security deposit must use lawful forms; landlord-held deposit triggers interest obligations | Clauses allowing landlord to keep deposit in cash or own account should be flagged | High | Hard rule |
| FL-019 | Fire insurance is mandatory for both tenant and landlord | If only one side is addressed in the contract, mark for manual review | Medium | Soft rule |
| FL-020 | Dwelling must satisfy safety, health, and habitability standards | Clauses waiving conformity or habitability should be flagged | High | Future hard rule |
| FL-021 | Landlord cannot unilaterally dissolve the lease or evict for non-payment | Automatic termination / self-help eviction clauses should be flagged | High | Hard rule |
| FL-022 | Full subletting by main-residence tenant is forbidden; partial subletting needs consent | Broad permission to fully sublet should be flagged | High | Future hard rule |
| FL-023 | Lease assignment requires prior written landlord consent | Free assignment clauses should be flagged | High | Future hard rule |
| FL-024 | Lease listings must disclose rent and costs/charges | Useful for listing checks, not lease-text checks | High | Out of scope for lease parser |

## Rule-by-rule research

### FL-001: Lease must be in writing

Summary:
For main-residence housing leases covered by Title II of the decree, a written document is required.

Why it matters:
This is a legal baseline and supports downstream checks for term, rent, charges, and registration.

Deterministic use:
This is difficult to use as a pure contract-text rule because the parser normally receives an already written PDF. It is better used as a scope assumption than as a runtime flag.

Confidence:
Medium for automation, high for the underlying legal rule.

Sources:
- Codex Vlaanderen, Vlaams Woninghuurdecreet, article 8: [PrintDocument](https://codex.vlaanderen.be/PrintDocument.ashx?id=1029963)
- Vlaanderen.be: [Woninghuurovereenkomst sluiten](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/woninghuurovereenkomst-sluiten)

### FL-002: Required lease contents

Summary:
The written lease must contain the identity of the parties, start date, exact duration, rented premises, rent amount, costs/charges arrangement, and a reference to the official explanatory note.

Deterministic use:
Useful as a completeness checklist. Some of these fields are readily extractable; the reference to the official explanatory note is harder to detect reliably and may be absent in OCR text.

Confidence:
Medium.

Sources:
- Codex Vlaanderen, article 8 and article 10: [PrintDocument](https://codex.vlaanderen.be/PrintDocument.ashx?id=1029963)

### FL-003: Entry inventory required

Summary:
The parties must draw up a detailed place description / inventory on an adversarial basis and for joint account, either while the premises are vacant or during the first month in which the tenant can use the property. It must be attached to and registered with the lease.

Deterministic use:
Flag clauses that say there is no inventory, that the tenant accepts the property "as is", or that try to waive the inventory entirely.

Confidence:
High.

Sources:
- Codex Vlaanderen, article 9: [PrintDocument](https://codex.vlaanderen.be/PrintDocument.ashx?id=1029963)
- Vlaanderen.be: [Woninghuurovereenkomst sluiten](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/woninghuurovereenkomst-sluiten)

### FL-004: Registration is the landlord's duty within 2 months

Summary:
For a housing lease used as principal residence, the landlord must register the lease within 2 months after signature. The inventory must also be registered. If the lease is not registered, the tenant may terminate without notice period or compensation while the lease remains unregistered.

Deterministic use:
Flag clauses that shift the registration duty to the tenant, require the tenant to pay late-registration costs, or allow a longer registration deadline.

Confidence:
High.

Sources:
- Codex Vlaanderen, article 11: [PrintDocument](https://codex.vlaanderen.be/PrintDocument.ashx?id=1029963)
- Vlaanderen.be: [Woninghuurovereenkomst sluiten](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/woninghuurovereenkomst-sluiten)
- Vlaanderen.be: [Einde en opzegging van het huurcontract](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/einde-en-opzegging-van-het-huurcontract)
- FOD Financien / MyRent PDF: [MyRent infofiche](https://financien.belgium.be/sites/default/files/GAPD/20230620-MyRent-nl.pdf)

### FL-005: No term or a term between 3 and 9 years becomes a 9-year lease

Summary:
If no duration is stated, or if the stated term falls between 3 and 9 years, the lease is treated as a 9-year lease.

Deterministic use:
If extracted term is greater than 3 years and less than 9 years, treat the lease as long-duration logic and optionally flag the mismatch between stated and legal duration.

Confidence:
High.

Sources:
- Codex Vlaanderen, article 16: [PrintDocument](https://codex.vlaanderen.be/PrintDocument.ashx?id=1029963)
- Vlaanderen.be: [Woninghuurovereenkomst sluiten](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/woninghuurovereenkomst-sluiten)

### FL-006: Short lease is max 3 years and only one extension is allowed within total 3 years

Summary:
A short lease may be concluded only for 3 years or less. It may be renewed once in writing, under the same conditions, and the combined total may not exceed 3 years.

Deterministic use:
Flag short-lease wording plus a total duration above 36 months, or wording allowing repeated renewals.

Confidence:
High.

Sources:
- Codex Vlaanderen, article 21, paragraph 1: [PrintDocument](https://codex.vlaanderen.be/PrintDocument.ashx?id=1029963)
- Vlaanderen.be: [Einde en opzegging van het huurcontract](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/einde-en-opzegging-van-het-huurcontract)

### FL-007: Short lease tenant notice max 3 months

Summary:
For leases signed since 1 January 2019 and lasting 3 years or less, the tenant may terminate at any time with 3 months notice.

Deterministic use:
Flag clauses that deny early termination by the tenant or require more than 3 months notice.

Confidence:
High.

Sources:
- Codex Vlaanderen, article 21, paragraph 2: [PrintDocument](https://codex.vlaanderen.be/PrintDocument.ashx?id=1029963)
- Vlaanderen.be: [Einde en opzegging van het huurcontract](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/einde-en-opzegging-van-het-huurcontract)

### FL-008: Short lease tenant break fee capped at 1.5 / 1 / 0.5 months

Summary:
For a short lease, the tenant break fee is capped at 1.5 months if the lease ends in year 1, 1 month in year 2, and 0.5 month in year 3.

Deterministic use:
Flag any tenant break fee above 1.5 months.

Why the implementation uses 1.5 months:
The exact lawful fee depends on when the lease ends. If the parser only sees a single generic penalty clause, 1.5 months is the safe maximum ceiling.

Confidence:
High.

Sources:
- Codex Vlaanderen, article 21, paragraph 2: [PrintDocument](https://codex.vlaanderen.be/PrintDocument.ashx?id=1029963)
- Vlaanderen.be: [Einde en opzegging van het huurcontract](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/einde-en-opzegging-van-het-huurcontract)

### FL-009: Short lease landlord has no statutory early termination right

Summary:
For short leases, the normal long-lease landlord termination rights do not apply. Vlaanderen.be states this plainly: the landlord has no wettelijke opzegmogelijkheden for these post-2019 short leases.

Deterministic use:
Flag clauses that give the landlord a broad early termination right in a short lease.

Confidence:
High.

Sources:
- Codex Vlaanderen, article 21, paragraph 1, which excludes articles 17 to 20 for short leases: [PrintDocument](https://codex.vlaanderen.be/PrintDocument.ashx?id=1029963)
- Vlaanderen.be: [Einde en opzegging van het huurcontract](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/einde-en-opzegging-van-het-huurcontract)
- Vlaanderen.be: [Woninghuurovereenkomst sluiten](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/woninghuurovereenkomst-sluiten)

### FL-010: Long lease tenant notice max 3 months

Summary:
For 9-year leases and longer residential leases, the tenant may terminate at any time with 3 months notice.

Deterministic use:
Flag clauses imposing longer notice on the tenant.

Confidence:
High.

Sources:
- Codex Vlaanderen, article 20, paragraph 1: [PrintDocument](https://codex.vlaanderen.be/PrintDocument.ashx?id=1029963)
- Vlaanderen.be: [Einde en opzegging van het huurcontract](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/einde-en-opzegging-van-het-huurcontract)

### FL-011: Long lease tenant break fee capped at 3 / 2 / 1 months in years 1-3

Summary:
If the tenant terminates during the first three years of a 9-year lease, the landlord is entitled to 3 months, 2 months, or 1 month of rent depending on whether the lease ends in year 1, 2, or 3.

Deterministic use:
Flag clauses above 3 months.

Confidence:
High.

Sources:
- Codex Vlaanderen, article 20, paragraph 1: [PrintDocument](https://codex.vlaanderen.be/PrintDocument.ashx?id=1029963)
- Vlaanderen.be: [Einde en opzegging van het huurcontract](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/einde-en-opzegging-van-het-huurcontract)

### FL-012: Long lease landlord early termination rights are limited and conditioned

Summary:
For long leases, the landlord's early termination rights are limited to:

- personal use, subject to a 6-month notice and occupancy conditions;
- major renovation, subject to strict documentary and timing conditions;
- no-cause termination only at the end of the first or second 3-year period, with compensation.

Deterministic use:
Broad clauses saying the landlord may terminate at any time for any reason should be flagged. Exact validation is harder because some lawful grounds are conditional and depend on timing.

Confidence:
Medium for automation, high for the legal proposition.

Sources:
- Codex Vlaanderen, articles 17 to 19: [PrintDocument](https://codex.vlaanderen.be/PrintDocument.ashx?id=1029963)
- Vlaanderen.be: [Einde en opzegging van het huurcontract](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/einde-en-opzegging-van-het-huurcontract)

### FL-013: Rent cannot be freely changed after signature

Summary:
Once the rent is fixed, it cannot simply be changed at will. Outside indexation and the specific statutory revision channels, the rent remains fixed.

Deterministic use:
Flag clauses allowing unilateral rent increases not tied to lawful indexation or judicial / statutory revision.

Confidence:
High.

Sources:
- Vlaanderen.be: [De huurprijs](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/huurprijs-en-huurwaarborg/de-huurprijs)
- Codex Vlaanderen, articles 34 and 35: [PrintDocument](https://codex.vlaanderen.be/PrintDocument.ashx?id=1029963)

### FL-014: Indexation only once per rental year, on anniversary, by written request, with maximum 3 months retroactivity

Summary:
Indexation is allowed once per rental year if the lease is written, on the anniversary date, unless excluded. It is not automatic. The interested party must request it in writing, and retroactive effect is limited to 3 months before the request.

Deterministic use:
Flag clauses allowing monthly, quarterly, or other sub-annual indexation, and clauses stating that indexation happens automatically.

Confidence:
High.

Sources:
- Codex Vlaanderen, article 34: [PrintDocument](https://codex.vlaanderen.be/PrintDocument.ashx?id=1029963)
- Vlaanderen.be: [De huurprijs](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/huurprijs-en-huurwaarborg/de-huurprijs)

### FL-015: Property tax cannot be charged to tenant

Summary:
The onroerende voorheffing for the rented property cannot be passed on to the tenant.

Deterministic use:
Flag any clause charging property tax or onroerende voorheffing to the tenant.

Confidence:
High.

Sources:
- Codex Vlaanderen, article 36, paragraph 1: [PrintDocument](https://codex.vlaanderen.be/PrintDocument.ashx?id=1029963)
- Vlaanderen.be: [Kosten en lasten](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/huurprijs-en-huurwaarborg/kosten-en-lasten)

### FL-016: Costs/charges should be separate from rent and evidenced unless a valid forfait is used

Summary:
Costs and charges must be set out separately from rent. Unless the parties expressly agree on a forfait, charges should correspond to actual costs and the supporting documents should be inspectable.

Deterministic use:
This is only partly extractable. Flagging is appropriate if the contract explicitly imposes vague or non-auditable extra charges, but not all valid leases explain the audit mechanics in detail.

Confidence:
Medium.

Sources:
- Codex Vlaanderen, article 36, paragraphs 1 to 3: [PrintDocument](https://codex.vlaanderen.be/PrintDocument.ashx?id=1029963)
- Vlaanderen.be: [Kosten en lasten](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/huurprijs-en-huurwaarborg/kosten-en-lasten)

### FL-017: Security deposit max 3 months rent

Summary:
For post-1 January 2019 housing leases, the landlord may ask for a deposit of at most 3 months rent.

Deterministic use:
Flag deposits above 3 months or above 3 times the extracted monthly rent.

Confidence:
High.

Sources:
- Codex Vlaanderen, article 37, paragraph 1: [PrintDocument](https://codex.vlaanderen.be/PrintDocument.ashx?id=1029963)
- Vlaanderen.be: [Huurwaarborg](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/huurprijs-en-huurwaarborg/huurwaarborg)

### FL-018: Security deposit must use lawful forms; landlord-held deposit is risky and triggers interest rules

Summary:
The tenant chooses one lawful deposit form. For cash kept by the landlord or funds held on the landlord's own account, the decree imposes interest consequences. Vlaanderen.be also warns that a landlord who keeps the deposit in cash or in a personal account must return the deposit plus interest.

Deterministic use:
Flag clauses saying the deposit is paid in cash to the landlord, remains on the landlord's account, or is generally held by the landlord outside the lawful structures.

Confidence:
High.

Sources:
- Codex Vlaanderen, article 37, paragraphs 1 to 3: [PrintDocument](https://codex.vlaanderen.be/PrintDocument.ashx?id=1029963)
- Vlaanderen.be: [Huurwaarborg](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/huurprijs-en-huurwaarborg/huurwaarborg)
- Vlaanderen.be: [Einde en opzegging van het huurcontract](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/einde-en-opzegging-van-het-huurcontract)

### FL-019: Fire insurance is mandatory for both parties

Summary:
Since 1 January 2019, both tenant and landlord must have fire insurance covering their liability for fire and water damage.

Deterministic use:
This is legally solid, but contract-level detection is noisy. Some leases omit the clause even though the law still applies. The safest automated use is a soft flag when the lease mentions only one party's insurance obligation.

Confidence:
Medium for automation, high for the legal rule.

Sources:
- Codex Vlaanderen, article 29: [PrintDocument](https://codex.vlaanderen.be/PrintDocument.ashx?id=1029963)
- Vlaanderen.be: [Woninghuurovereenkomst sluiten](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/woninghuurovereenkomst-sluiten)

### FL-020: Dwelling must satisfy safety, health, and habitability standards

Summary:
The landlord must deliver the property in good condition and the property must meet the conformity requirements under the Vlaamse Codex Wonen. A lease for a non-conforming dwelling is void, with nullity to be declared by the judge.

Deterministic use:
Flag clauses that try to waive habitability, disclaim conformity entirely, or force the tenant to accept severe defects that legally remain the landlord's problem.

Confidence:
High.

Sources:
- Codex Vlaanderen, article 12: [PrintDocument](https://codex.vlaanderen.be/PrintDocument.ashx?id=1029963)
- Vlaanderen.be: [Onderhoud en herstellingen aan huurwoningen](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/onderhoud-en-herstellingen-aan-huurwoningen)

### FL-021: Landlord cannot unilaterally dissolve the lease or evict for non-payment

Summary:
The official guidance states that where rent is unpaid, the landlord cannot put the tenant out himself and cannot dissolve the contract himself. Dissolution follows from breach but must be established through lawful process.

Deterministic use:
Flag clauses stating that non-payment automatically terminates the lease, that the tenant loses occupancy rights without judicial process, or that the landlord may evict directly.

Confidence:
High.

Sources:
- Vlaanderen.be: [De huurprijs](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/huurprijs-en-huurwaarborg/de-huurprijs)
- Codex Vlaanderen, article 40: [PrintDocument](https://codex.vlaanderen.be/PrintDocument.ashx?id=1029963)

### FL-022: Full subletting is forbidden; partial subletting requires consent

Summary:
A tenant who rents the property as principal residence may not fully sublet it. Partial subletting is allowed only with the landlord's consent and only if the remaining part remains the tenant's principal residence.

Deterministic use:
Flag clauses allowing unrestricted full subletting by the tenant.

Confidence:
High.

Sources:
- Codex Vlaanderen, article 32: [PrintDocument](https://codex.vlaanderen.be/PrintDocument.ashx?id=1029963)

### FL-023: Lease assignment requires prior written landlord consent

Summary:
Assignment of the lease is prohibited except with prior written landlord consent.

Deterministic use:
Flag clauses allowing free assignment without consent.

Confidence:
High.

Sources:
- Codex Vlaanderen, article 31: [PrintDocument](https://codex.vlaanderen.be/PrintDocument.ashx?id=1029963)

### FL-024: Listings must disclose rent and costs/charges

Summary:
Public or official rental advertisements must state at least the asked rent and the costs/charges.

Deterministic use:
This is useful for listing analysis, not lease-PDF analysis.

Confidence:
High.

Sources:
- Codex Vlaanderen, article 4: [PrintDocument](https://codex.vlaanderen.be/PrintDocument.ashx?id=1029963)

## Rules currently safest for hard automation

These are the rules I would trust most in a deterministic lease parser today:

- Entry inventory cannot be waived.
- Registration duty stays with the landlord and the deadline is 2 months.
- A stated term between 3 and 9 years should be treated as a 9-year lease.
- Short lease tenant notice cannot exceed 3 months.
- Short lease tenant fee cannot exceed 1.5 months as a general ceiling.
- Short lease should not grant the landlord a broad statutory early-termination right.
- Long lease tenant notice cannot exceed 3 months.
- Long lease tenant fee cannot exceed 3 months as a general ceiling.
- Indexation cannot be more frequent than yearly.
- Indexation is not automatic.
- Property tax cannot be shifted to the tenant.
- Security deposit cannot exceed 3 months.
- Security deposit should not be retained by the landlord in cash or on the landlord's own account.
- Automatic termination / self-help eviction for non-payment should be flagged.

## Rules that should stay soft or manual for now

- Missing explicit reference to the official explanatory note.
- Fire insurance clauses that mention only one side.
- Detailed validation of long-lease landlord break rights.
- Opaque service-charge clauses unless they are very explicit.
- Habitability/conformity issues unless the lease text clearly tries to waive them.

These rules are legally meaningful, but lease text is often too messy or incomplete for a strict parser to be reliable without more context.

## Notes on sources and hierarchy

Best primary legal source:
- Codex Vlaanderen consolidated decree text: [Vlaams Woninghuurdecreet](https://codex.vlaanderen.be/PrintDocument.ashx?id=1029963)

Best operational guidance:
- [Woninghuurovereenkomst sluiten](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/woninghuurovereenkomst-sluiten)
- [Einde en opzegging van het huurcontract](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/einde-en-opzegging-van-het-huurcontract)
- [De huurprijs](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/huurprijs-en-huurwaarborg/de-huurprijs)
- [Kosten en lasten](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/huurprijs-en-huurwaarborg/kosten-en-lasten)
- [Huurwaarborg](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/huurprijs-en-huurwaarborg/huurwaarborg)
- [Onderhoud en herstellingen aan huurwoningen](https://www.vlaanderen.be/bouwen-wonen-en-energie/huren-en-verhuren/onderhoud-en-herstellingen-aan-huurwoningen)

Useful federal registration source:
- [MyRent infofiche PDF](https://financien.belgium.be/sites/default/files/GAPD/20230620-MyRent-nl.pdf)

Useful official brochure:
- [Het Vlaams Woninghuurdecreet voor woninghuurovereenkomsten gesloten vanaf 1 januari 2019](https://www.vlaanderen.be/publicaties/het-vlaams-woninghuurdecreet-voor-woninghuurovereenkomsten-gesloten-vanaf-1-januari-2019)

## Suggested next steps

1. Keep the current hard rules in `runRules`.
2. Add a second layer called "manual review rules" for medium-confidence checks.
3. Add explicit scope detection for Flanders, main residence, and post-1 January 2019 contracts.
4. Add fixtures with Dutch, French, and English clause variants for each hard rule.
5. Keep student leases in the separate student rulebook documented in `docs/FLANDERS_STUDENT_RULE_RESEARCH.md`, because their termination and deposit logic differ.
