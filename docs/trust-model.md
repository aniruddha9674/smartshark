
# The Four-Signal Trust Model

**Internal specification. Not for external distribution.**

**Version:** 0.1
**Status:** Design
**Owner:** Aniruddha
**Last updated:** 2026-10-09

---

## 1. Purpose

This document defines the core research contribution of SmartShark: a field-level trust scoring system for self-reported business data.

It exists to keep every future decision aligned. When deciding whether to add a feature, build a signal, or change a schema, read this document first. If the change advances the four-signal model, build it. If it doesn't, defer it.

This document is the seed of two artifacts:
- A research paper on multi-signal trust scoring
- A patent filing on the method (if the evaluation supports it)

Both require the same underlying system. This document describes what that system is.

---

## 2. The problem

**Statement:** When a business reports numbers about itself with no audited source, how do you estimate how much of what it said is true?

**Why it matters:**

- Every investment platform, lender, and insurer faces this
- Public companies have mandatory disclosure (SEC, SEBI). Private startups have none.
- Existing verification systems produce binary answers ("this document is real / fake")
- Binary answers don't help when a document is real but a specific field on it is suspicious

**The gap:** No system produces a *probabilistic, per-field* trust score for self-reported business data. This is the contribution.

---

## 3. The output

**Field-level trust scores.** Not "this business is verified." Instead:

```json
{
  "businessId": "96e9e215-...",
  "computedAt": "2026-10-09T...",
  "fieldScores": {
    "companyName": { "trust": 0.94, "sources": ["udyam", "gst"], "agreement": "full" },
    "foundingYear": { "trust": 0.61, "sources": ["udyam", "gst"], "agreement": "conflict" },
    "udyamNumber": { "trust": 0.97, "sources": ["udyam"], "agreement": "single" },
    "fundingAsk": { "trust": 0.34, "sources": [], "agreement": "self_reported" },
    "yearsOperating": { "trust": 0.72, "sources": ["udyam"], "agreement": "partial" },
    "sector": { "trust": 0.80, "sources": ["gst"], "agreement": "single" }
  },
  "overallTrust": 0.73,
  "modelVersion": "trust-v1"
}
```

Every field is scored independently. Every score is traceable to its sources. Disagreements between sources are explicit, not hidden.

---

## 4. The four signals

Each signal produces a numeric contribution to the trust score of each field it can observe. Signals are independent — one can fail while others succeed.

### Signal 1: Document authenticity

**What it measures:** Is this document genuine, and is the value we extracted from it accurate?

**Components:**

| Component | What it checks | Data source |
|---|---|---|
| OCR confidence | How sure is the extraction model about this field? | Gemini per-field confidence (already captured) |
| Format validity | Does the value match its expected pattern? Udyam: `UDYAM-XX-00-0000000`. GSTIN: 15 chars, checksum valid. PAN: `AAAAA0000A` | Regex + checksum algorithms |
| Registry check | Does this number actually exist and belong to this company? | Udyam portal, GST portal, MCA (external APIs, some free) |
| Image integrity | Is the image a screenshot of a real document, or a forged/tampered one? | EXIF data, font consistency, alignment anomalies (future — vision model) |

**Score per field:**

```
authenticity_score(field) =
  0.5 × ocr_confidence
+ 0.3 × format_validity (0 or 1)
+ 0.2 × registry_match (0, 0.5 for partial, or 1)
```

Range: 0 to 1 per document.

**Status:**
- OCR confidence: ✅ captured
- Format validity: ⚠️ partially (regex not built)
- Registry check: ❌ not built
- Image integrity: ❌ not built

**What to build next:** Format validation as a pure function. It's 30 lines and applies to every document type.

### Signal 2: Cross-document consistency

**What it measures:** Do multiple documents, from different sources, agree on the same fact?

**Why it's the strongest signal:** A single document can be forged. Two documents from independent authorities (Udyam + GST) that agree on the company name are much harder to fabricate.

**Components:**

| Component | What it checks | Data source |
|---|---|---|
| Field agreement | Do extracted values from different docs match? | `Verification.ocrExtractedData` across multiple verifications |
| Confidence-weighted agreement | High-confidence agreement counts more than low-confidence | Per-field confidence |
| Temporal consistency | Is the founding year plausible given the document date? | Document dates vs claimed values |

**Score per field:**

```
For each field that appears in N documents:
  matching_docs = count of docs where value matches the canonical value
  consistency = matching_docs / N
  weighted_consistency = sum(confidence per matching doc) / sum(confidence per doc)
  score = 0.4 × consistency + 0.6 × weighted_consistency
```

If a field appears in only one document, score is neutral (0.5) — not penalized, but not rewarded.

**Status:**
- Partially built in `computeVerificationTier` for `companyName` only
- Full field-by-field consistency: ❌ not built
- Confidence-weighted: ❌ not built

**What to build next:** Generalize `computeVerificationTier` to a `computeCrossDocumentConsistency(verificationId, fieldName)` function that returns per-field agreement scores.

### Signal 3: Statistical plausibility

**What it measures:** Do the *numbers* look like real business numbers, or fabricated ones?

**Components:**

| Component | What it checks | Threshold |
|---|---|---|
| Benford's Law | Fabricated numbers deviate from Benford's distribution | χ² test, p < 0.05 flags |
| Round-number ratio | Real financials have specific values (487293); fabricated ones are round (500000) | >30% round numbers in a field flags |
| Peer cohort deviation | Is this value plausible for this sector and stage? | Value beyond ±2σ from sector mean flags |
| Time-series plausibility | Does the growth rate match peer distribution? | Growth >3× median for stage flags |

**Score per numeric field:**

```
plausibility = 1 - normalized_deviation
```

Where `normalized_deviation` combines the four components, capped at 1.

**Status:**
- None of this is built
- `readiness_scores.sector` is denormalized for cohort queries (helpful foundation)

**What to build next:** Benford's Law check for any numeric field. It's a 20-line function taking an array of digits and returning a p-value. Start there.

**Important note on Benford's Law:** It applies to naturally occurring numbers spanning multiple orders of magnitude — revenue, population, transaction amounts. It does *not* apply to bounded values (percentages, equity stakes 0–100, years 0–20). Apply selectively.

### Signal 4: Behavioral signals

**What it measures:** How the user *interacted* with the verification flow tells you something about their truthfulness.

**Components:**

| Component | What it measures | Why it matters |
|---|---|---|
| Time on field | How long did the user take to enter each value? | Rushed entry (sub-500ms) suggests copy-paste or scripted fill |
| Retry count | How many times did they re-upload a document? | Real documents succeed first try; fakes often fail OCR and retry |
| Upload sequence | Did they upload documents one at a time or all at once? | Real users gather docs over days; fraudsters dump everything |
| Device/IP consistency | Same device across uploads? | Multiple IPs in a short window flags |
| Field correction rate | How many OCR-extracted values did the user change before confirming? | High correction rate suggests OCR failure OR user trying to override truth |

**Score per verification session:**

```
behavioral_score = weighted sum of normalized signals
```

**Status:**
- None of this is built
- The `events` table captures *that* a verification started, but not session-level timing

**What to build next:** Add session-level timing capture to the verification flow. Every POST to `/api/verifications` records `timeOnPageMs` and `fieldsEdited` in the request. Log to Mongo.

---

## 5. Fusion: how the four signals combine

**v1 (rule-weighted):**

```
trust(field) =
  0.40 × authenticity_score
+ 0.35 × cross_document_score
+ 0.15 × plausibility_score
+ 0.10 × behavioral_score
```

Weights reflect the relative reliability of each signal at current data volumes. Document authenticity is the anchor; behavioral signals are informative but noisy.

**v2 (learned):**

Once 500+ verifications exist with ground truth labels (admin-approved vs admin-rejected), train a logistic regression or gradient-boosted model on the four signal outputs. Features are the per-signal scores; target is the admin decision.

**Why start rule-weighted:** You need training data to fit a model. You don't have it. Rules-first is not a compromise — it's the honest starting point.

---

## 6. Evaluation plan

**How do you prove the model works?**

### 6.1 Baselines

| Baseline | What it does |
|---|---|
| Single-signal: authenticity only | Trust score = OCR confidence |
| Single-signal: registry only | Trust score = 1 if number exists in registry, else 0 |
| Binary verification (current system) | Trust = 1 if tier = verified, else 0 |

### 6.2 Test set

**Synthetic data (primary):**

Generate 500 business records with known ground truth:
- 250 with all fields accurate (real Udyam/GST numbers)
- 250 with controlled corruption:
  - 50 with fake registration numbers
  - 50 with plausible-looking but wrong founding years
  - 50 with inflated revenue claims
  - 50 with inconsistent addresses across documents
  - 50 with round-number-heavy financials

For each, compute the four signals and the fused trust score. Measure:
- **Precision:** of fields marked high trust, how many are actually true?
- **Recall:** of corrupt fields, how many are flagged low trust?
- **F1:** harmonic mean

**Public data (validation):**

- MCA (Ministry of Corporate Affairs) filings — some companies have known restatements
- Published fraud cases where public documents exist

**Why synthetic is defensible:** The paper's contribution is the *method*, not the dataset. Synthetic evaluation of a trust-scoring method is standard in the field (see: fraud detection literature). You're testing whether the signals correctly identify corrupted fields, not whether your dataset is representative.

### 6.3 Ablation study

This is the paper's money section. Run the model with each signal disabled:

| Configuration | Expected result |
|---|---|
| All 4 signals | Best F1 |
| Without behavioral | Slightly lower F1 |
| Without plausibility | Lower F1 |
| Without cross-document | Significantly lower F1 |
| Without authenticity | Worst F1 |

The ablation shows *why* four signals matter. If removing any signal barely changes F1, that signal doesn't earn its place.

### 6.4 Metrics

- Field-level precision / recall
- Overall accuracy vs baselines
- Per-signal contribution (from ablation)
- Calibration: does a 0.7 trust score mean 70% likely to be true?

Calibration is the hardest and most valuable metric. If trust scores are calibrated, downstream consumers (investors, admins) can act on them with known risk.

---

## 7. Why this is novel

**What exists:**

- Document forgery detection (single signal)
- KYC/AML systems (binary)
- Credit scoring (uses external data, not self-reported verification)
- Fraud detection in transactions (not in self-reported documents)

**What's new:**

1. **Field-level** trust scoring, not document-level
2. **Fusion of four independent signals**, each contributing differently per field
3. **Specifically for self-reported business data** in emerging markets where no audited source exists
4. **Calibrated** trust output usable for decision-making

**Related work to cite:**

- Benford's Law applications in fraud detection (Nigrini)
- Multi-modal verification systems (fintech literature)
- Grounded AI / retrieval-augmented generation (for contrast — those ground in text, this grounds in verified data)
- India Stack / Account Aggregator framework (for context)

---

## 8. What exists vs what's needed

| Component | Status |
|---|---|
| Per-field OCR confidence | ✅ Captured in `Verification.ocrExtractedData` |
| Cross-document comparison | ⚠️ Partial — only `companyName` |
| Registry check | ❌ Not built |
| Format validation | ❌ Not built |
| Benford's Law check | ❌ Not built |
| Peer cohort deviation | ❌ Not built |
| Behavioral capture | ❌ Not built |
| Fusion rule | ❌ Not built |
| Field-level trust storage | ❌ Not built |
| Evaluation harness | ❌ Not built |

The pipeline captures the raw data. The model that turns it into trust scores doesn't exist yet.

---

## 9. Build roadmap

**Phase A: Signal 1 completion (1 session)**
- Format validators for Udyam, GSTIN, PAN
- Add to `verification.service.js`
- Store format validity as a new field on `Verification`

**Phase B: Signal 2 generalization (1 session)**
- `computeCrossDocumentConsistency(businessId, fieldName)`
- Returns agreement score + source list
- Store on a new `trust_signals` table

**Phase C: Signal 3 (2 sessions)**
- Benford's Law function
- Round-number ratio function
- Peer cohort lookup using `readiness_scores.sector`

**Phase D: Signal 4 (1 session)**
- Add timing capture to verification POST
- Store `timeOnPageMs`, `fieldsEdited`, `uploadAttempts` on Mongo verification

**Phase E: Fusion + storage (1 session)**
- New `field_trust_scores` table (Postgres) or embedded in Mongo
- Fusion rule
- `computeTrustScores(businessId)` service
- Endpoint: `GET /api/businesses/:id/trust`

**Phase F: Evaluation (2 sessions)**
- Synthetic data generator
- Ablation harness
- Metrics computation

**Total: 8 sessions.** Roughly 2–3 months of focused work alongside other priorities.

---

## 10. Patent considerations

**What could be patentable:**
- "A method for probabilistic trust scoring of self-reported business data using multi-signal fusion"

**What would need to be true:**
- Novelty: no prior art combining these four signals for this use case
- Non-obviousness: the fusion weights and per-field application shouldn't be obvious to a practitioner
- Industrial application: it solves a problem in financial services

**Indian law caveat:** Section 3(k) excludes "computer programs per se." To be patentable, the method must solve a *technical* problem with a *technical* effect. Framing it as "trust scoring" (business method) is weak. Framing it as "detecting fabricated data" (technical problem) is stronger.

**Practical steps:**
1. Register as a startup with DPIIT (free, 1 week)
2. File a provisional patent before any public disclosure of the method
3. Provisional is cheaper and gives 12 months to file complete
4. Consult a patent attorney before publishing the paper

**The trigger to file:** When the evaluation in Phase F produces a strong ablation showing all four signals contribute. Filing before that is premature.

---

## 11. Paper considerations

**Target venues:**

- ACM FAT* (Fairness, Accountability, Transparency)
- IEEE ICDM (Data Mining)
- Applied track at ICML / NeurIPS
- Indian venues: IIT/IISc conferences on data science

**Timeline:**
- Draft: after Phase E
- Submit: after Phase F
- Realistic submission: 6–9 months from now

**The paper's contribution is not "we built a marketplace."** It's "we built and evaluated a trust-scoring method for self-reported data in markets with no audited source." The marketplace is the substrate.

**What to write first:** The method section (Section 4 of the paper). Everything else follows.

---

## 12. Open questions

1. **Calibration.** Can trust scores be calibrated without ground truth labels? (Requires either admin-labeled data or synthetic labels.)
2. **Signal weights.** Are the 0.40/0.35/0.15/0.10 weights defensible? Only ablation will tell.
3. **Generalization.** Does a trust model for Indian SMEs generalize to other emerging markets? Not tested.
4. **Privacy.** Behavioral signals (time on field, device consistency) may raise privacy concerns. Need to disclose capture in terms of service.
5. **Adversarial robustness.** A sophisticated fraudster learns the signals and games them. How do you stay ahead? (Future work: adversarial training.)

---

## 13. Anti-goals

**What this document is NOT:**

- A marketing claim
- A product feature spec
- A commitment to file a patent
- A promise to publish

**What this document IS:**

- The internal compass. When in doubt, this tells you what to build.

**What to do if a decision conflicts with this document:** Update the document. Don't silently drift. If you decide the four-signal model isn't worth it, write that down — with reasoning — and replace it with whatever the new direction is.

---
