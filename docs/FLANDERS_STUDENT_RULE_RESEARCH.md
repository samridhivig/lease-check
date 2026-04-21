# Flanders Student Lease Rule Research

This note documents the first student-lease rule slice used by the baseline and
RAG analyzers. It is intentionally narrow: the extractor records lease facts,
and `runRules()` applies the student rulebook only when
`document.kind === "student_lease"`.

## Sources

- Vlaanderen.be, Studentenhuurovereenkomsten:
  https://www.vlaanderen.be/studentenhuurovereenkomsten
- Codex Vlaanderen, Vlaams Woninghuurdecreet, Title III:
  https://codex.vlaanderen.be/PrintDocument.ashx?id=1029963

## Implemented Checks

- `student-inventory-required`: flags explicit waiver or "as is" language that
  undermines the required entry inventory.
- `student-deposit-max-two-months-and-no-cash`: flags a deposit above two months
  of rent or a cash deposit. A landlord account is not flagged by itself because
  the student regime allows a landlord-designated account.
- `student-no-silent-renewal`: flags tacit or automatic renewal language.
- `student-prestart-cancel-fee-max-two-months`: flags a pre-start cancellation
  fee above two months of rent.
- `student-poststart-tenant-notice-max-two-months`: flags a post-start student
  notice period above two months for the statutory student termination grounds.
- `student-landlord-no-early-termination`: flags clauses that give the landlord
  an early termination right in the student regime.

## Fixture Expectation

The current student fixtures are model/template leases and should produce no
student flags. They are useful smoke fixtures because they contain compliant
language for no tacit renewal, two-month student notice, a two-month pre-start
cancellation fee, and mandatory inventory language.
