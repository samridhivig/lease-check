# LeaseCheck - Client Side Feature Passport

## 1. Overview
LeaseCheck is a web-based application designed to help prospective tenants verify their residential lease agreements before signing. It specifically targets the strict tenancy laws that apply to **Flanders, Belgium** (for contracts signed from 1 January 2019 onward). The tool automates the extraction and analysis of clauses from a user's PDF lease, pointing out potentially illegal or unfavorable terms.

## 2. Key Features
* **PDF Upload & Processing**: Users can easily upload their rental contracts in `.pdf` format.
* **Automated Legal Analysis**: The system analyzes the uploaded document for key clauses such as:
  * Security deposit amounts and conditions.
  * Notice periods and break fees for early termination (for both short-term and long-term agreements).
  * Rent indexation rules and frequencies.
  * Property tax assignment to the tenant (which is illegal in Flanders).
  * Requirement of an entry inventory and registration rules.
* **Smart Issue Flagging**: Findings are categorized into actionable flags with severe issues marked prominently. Each flag contains:
  * **Severity Rating**: High (red), Medium (yellow), Low (blue).
  * **Explanation**: User-friendly advice explaining why the clause is problematic.
  * **Official Sources**: Direct links to the official Flemish government website (`vlaanderen.be`) verifying the claim.
* **Language Detection & Translation**: The application automatically detects the language of the uploaded document. If it is in Dutch, users can opt to translate the document into English. This is extremely beneficial for expats who want a readable reference of what they are signing.
* **Manual Verification Alerts**: Clauses that are ambiguous or overly complex are flagged with "manual check" caution, advising the tenant to consult a legal professional to be safe.

## 3. User Journey
1. **Upload**: User arrives at the homepage and uploads their `.pdf` lease agreement.
2. **Preference Setup**: User chooses whether they also want the document translated to English (if it's in Dutch).
3. **Processing**: The user clicks "Analyze Contract". The application parses the text, extracts the signals, evaluates them against the rules, and runs the translator in the background.
4. **Review Results**: 
   * A summary of the translation is shown on screen along with an English preview.
   * Actionable "Flags" appear, dissecting specific clauses and providing legal context.
   * "Explanations" are presented detailing what specific clauses mean and linking to external verification.

## 4. Limitations
* Translation only works from Dutch to English.
* The analysis tool is not a replacement for qualified legal advice.
* The system expects standard, readable PDF formats—highly stylized or scanned documents without OCR might fail parsing.
* Tailored exclusively to the **Flanders** regulation scheme (post-2019 residential leases). Other Belgian regions (Brussels or Wallonia) or commercial leases are not supported.
