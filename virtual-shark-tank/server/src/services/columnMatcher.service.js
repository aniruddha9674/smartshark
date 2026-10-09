import stringSimilarity from "string-similarity";
import { CANONICAL_FIELDS } from "../config/canonical-fields.js";

const normalize = (s) =>
  String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const scoreMatch = (sourceColumn, synonym) => {
  const a = normalize(sourceColumn);
  const b = normalize(synonym);
  if (!a || !b) return 0;

  const bigram = stringSimilarity.compareTwoStrings(a, b);

  const tokensA = new Set(a.split(" "));
  const tokensB = new Set(b.split(" "));
  const intersection = [...tokensA].filter((t) => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  const jaccard = union > 0 ? intersection / union : 0;

  return bigram * 0.6 + jaccard * 0.4;
};

/**
 * Match a CSV column name to a canonical field.
 */
export const matchColumn = (sourceColumn) => {
  let best = { field: null, score: 0, matchedSynonym: null };

  for (const [fieldName, definition] of Object.entries(CANONICAL_FIELDS)) {
    for (const synonym of definition.synonyms) {
      const score = scoreMatch(sourceColumn, synonym);
      if (score > best.score) {
        best = { field: fieldName, score, matchedSynonym: synonym };
      }
    }
  }

  return best;
};

export const classifyMatch = (score) => {
  if (score >= 0.75) return "high";
  if (score >= 0.5) return "medium";
  return "low";
};

/**
 * Propose a full crosswalk mapping from a list of CSV headers.
 * Higher-scored matches get priority for one-to-one assignment.
 */
export const proposeMapping = (headers) => {
  const mappings = [];
  const usedFields = new Set();

  const candidates = headers.map((header) => ({
    source: header,
    match: matchColumn(header),
  }));

  candidates.sort((a, b) => b.match.score - a.match.score);

  for (const { source, match } of candidates) {
    const confidence = classifyMatch(match.score);
    const conflicting = usedFields.has(match.field);

    if (match.field && confidence !== "low" && !conflicting) {
      usedFields.add(match.field);
      mappings.push({
        source,
        field: match.field,
        score: Number(match.score.toFixed(3)),
        confidence,
        matchedSynonym: match.matchedSynonym,
        needsReview: confidence === "medium",
      });
    } else if (match.field && confidence !== "low" && conflicting) {
      mappings.push({
        source,
        field: null,
        score: Number(match.score.toFixed(3)),
        confidence: "low",
        matchedSynonym: match.matchedSynonym,
        needsReview: true,
        reason: `Conflict: ${match.field} already assigned`,
      });
    } else {
      mappings.push({
        source,
        field: null,
        score: Number(match.score.toFixed(3)),
        confidence: "low",
        matchedSynonym: match.matchedSynonym,
        needsReview: true,
        reason: "No confident match",
      });
    }
  }

  return {
    mappings,
    mapped: mappings.filter((m) => m.field !== null).length,
    unmapped: mappings.filter((m) => m.field === null).length,
  };
};