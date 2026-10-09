import { proposeMapping } from "./columnMatcher.service.js";
import { inferTransform } from "./transformInferrer.service.js";
import { mapUnmappedColumns } from "./llmColumnMatcher.service.js";

/**
 * Full proposal: fuzzy match first, LLM for the rest.
 */
export const proposeFullMapping = async (
  headers,
  sampleValues,
  { useLLM = true } = {}
) => {
  const fuzzy = proposeMapping(headers);

  // Enrich fuzzy-matched fields with transform inference
  let mappings = fuzzy.mappings.map((m) => {
    if (!m.field) return m;
    const inferred = inferTransform(
      sampleValues[m.source] || [],
      m.field,
      m.source
    );
    return {
      ...m,
      transform: inferred.transform,
      transformConfidence: inferred.confidence,
      transformReason: inferred.reason,
      source_type: "fuzzy",
    };
  });

  const stats = {
    fuzzyMatched: mappings.filter((m) => m.field).length,
    llmProcessed: 0,
    llmMatched: 0,
    llmError: null,
    llmUsed: false,
  };

  if (!useLLM) {
    return {
      mappings,
      mapped: stats.fuzzyMatched,
      unmapped: mappings.filter((m) => !m.field).length,
      ...stats,
    };
  }

 const unmappedCols = mappings
  .filter((m) => !m.field && m.score >= 0.3)
  .map((m) => ({
    source: m.source,
    sampleValues: sampleValues[m.source] || [],
  }));

  if (unmappedCols.length === 0) {
    return {
      mappings,
      mapped: stats.fuzzyMatched,
      unmapped: 0,
      ...stats,
    };
  }

  let llmResults = [];
  try {
    llmResults = await mapUnmappedColumns(unmappedCols);
    stats.llmUsed = true;
    stats.llmProcessed = unmappedCols.length;
  } catch (err) {
    console.error("[autoMapping] LLM fallback failed:", err.message);
    stats.llmError = err.message;
    return {
      mappings,
      mapped: stats.fuzzyMatched,
      unmapped: mappings.filter((m) => !m.field).length,
      ...stats,
    };
  }

  const bySource = new Map(llmResults.map((r) => [r.source, r]));

  mappings = mappings.map((m) => {
    if (m.field) return m;

    const llm = bySource.get(m.source);
    if (!llm || !llm.field || llm.confidence < 0.5) return m;

    const finalTransform =
      llm.transform ||
      inferTransform(sampleValues[m.source] || [], llm.field, m.source)
        .transform;

    stats.llmMatched++;

    return {
      ...m,
      field: llm.field,
      transform: finalTransform,
      score: llm.confidence,
      confidence: llm.confidence >= 0.8 ? "llm-high" : "llm-low",
      matchedSynonym: "LLM inference",
      reasoning: llm.reasoning,
      source_type: "llm",
      needsReview: true,
    };
  });

  return {
    mappings,
    mapped: mappings.filter((m) => m.field).length,
    unmapped: mappings.filter((m) => !m.field).length,
    ...stats,
  };
};