import { describe, it, expect, beforeEach, vi } from "vitest";
import { proposeFullMapping } from "../../src/services/autoMapping.service.js";
import * as llmMatcher from "../../src/services/llmColumnMatcher.service.js";

describe("autoMapping.service — LLM fallback", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("uses LLM for unmapped columns", async () => {
    const headers = ["Company", "Employees", "Headcount"];
    const sampleValues = {
      Company: ["Acme", "Beta"],
      Employees: ["50", "100"],
      Headcount: ["30", "60"],
    };

    vi.spyOn(llmMatcher, "mapUnmappedColumns").mockResolvedValue([
      { source: "Employees", field: null, transform: null, confidence: 0.1, reasoning: "no field" },
      { source: "Headcount", field: null, transform: null, confidence: 0.1, reasoning: "no field" },
    ]);

    const result = await proposeFullMapping(headers, sampleValues, { useLLM: true });

    expect(result.llmUsed).toBe(true);
    expect(result.llmProcessed).toBe(2);
  });

  it("merges LLM results into proposal", async () => {
  const headers = ["Company", "Cohort_Size"];
  const sampleValues = {
    Company: ["Acme"],
    Cohort_Size: ["2018", "2019"],
  };

  vi.spyOn(llmMatcher, "mapUnmappedColumns").mockResolvedValue([
    {
      source: "Cohort_Size",
      field: "yearsOperating",
      transform: "toOperatingYears",
      confidence: 0.92,
      reasoning: "inferred as founding year",
    },
  ]);

  const result = await proposeFullMapping(headers, sampleValues, { useLLM: true });
  const mapped = result.mappings.find((m) => m.source === "Cohort_Size");

  expect(mapped.field).toBe("yearsOperating");
  expect(mapped.transform).toBe("toOperatingYears");
  expect(mapped.source_type).toBe("llm");
  expect(mapped.confidence).toBe("llm-high");
  expect(result.llmMatched).toBe(1);
});

  it("drops LLM results with low confidence", async () => {
    const headers = ["Mysterious_Column"];
    const sampleValues = { Mysterious_Column: ["abc", "def"] };

    vi.spyOn(llmMatcher, "mapUnmappedColumns").mockResolvedValue([
      {
        source: "Mysterious_Column",
        field: "companyName",
        transform: "trim",
        confidence: 0.35,
        reasoning: "guess",
      },
    ]);

    const result = await proposeFullMapping(headers, sampleValues, { useLLM: true });
    const mapped = result.mappings.find((m) => m.source === "Mysterious_Column");

    expect(mapped.field).toBeNull();
    expect(result.llmMatched).toBe(0);
  });

  it("falls back gracefully when LLM throws", async () => {
  const headers = ["Unmappable_Field"];
  const sampleValues = { Unmappable_Field: ["x", "y"] };

  vi.spyOn(llmMatcher, "mapUnmappedColumns").mockRejectedValue(
    new Error("Gemini unavailable")
  );

  const result = await proposeFullMapping(headers, sampleValues, { useLLM: true });
  expect(result.llmError).toBe("Gemini unavailable");
  expect(result.llmUsed).toBe(false);
});

  it("skips LLM when all columns are fuzzy-matched", async () => {
    const headers = ["Startup Name", "Industry"];
    const sampleValues = {
      "Startup Name": ["Acme"],
      Industry: ["SaaS"],
    };

    const spy = vi.spyOn(llmMatcher, "mapUnmappedColumns");
    await proposeFullMapping(headers, sampleValues, { useLLM: true });

    expect(spy).not.toHaveBeenCalled();
  });

  it("skips LLM when useLLM is false", async () => {
    const headers = ["Weird_Column"];
    const sampleValues = { Weird_Column: ["x"] };

    const spy = vi.spyOn(llmMatcher, "mapUnmappedColumns");
    const result = await proposeFullMapping(headers, sampleValues, { useLLM: false });

    expect(spy).not.toHaveBeenCalled();
    expect(result.llmUsed).toBe(false);
  });

  it("never sends already-matched columns to LLM", async () => {
    const headers = ["Startup Name", "Weird_Column"];
    const sampleValues = {
      "Startup Name": ["Acme"],
      Weird_Column: ["x"],
    };

    const spy = vi
      .spyOn(llmMatcher, "mapUnmappedColumns")
      .mockResolvedValue([]);

    await proposeFullMapping(headers, sampleValues, { useLLM: true });

    const calledWith = spy.mock.calls[0][0];
    expect(calledWith.find((c) => c.source === "Startup Name")).toBeUndefined();
    expect(calledWith.find((c) => c.source === "Weird_Column")).toBeDefined();
  });

  it("preserves fuzzy transforms for fuzzy-matched fields", async () => {
    const headers = ["Original Ask Amount"];
    const sampleValues = { "Original Ask Amount": ["50", "100"] };

    vi.spyOn(llmMatcher, "mapUnmappedColumns").mockResolvedValue([]);

    const result = await proposeFullMapping(headers, sampleValues, { useLLM: true });
    const mapped = result.mappings[0];

    expect(mapped.source_type).toBe("fuzzy");
    expect(mapped.transform).toBe("lakhsToINR");
  });
});