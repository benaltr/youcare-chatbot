import { beforeEach, describe, expect, it, vi } from "vitest";
import { searchFaqsTool } from "@/lib/agent/tools/search_faqs";
import * as ragSearch from "@/lib/rag/search";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchFaqsTool", () => {
  it("returns FAQ results for a valid query", async () => {
    vi.spyOn(ragSearch, "searchFaqs").mockResolvedValue([
      {
        chunkId: "chunk-1",
        documentId: "doc-1",
        documentTitle: "Nail Care FAQ",
        chunkText: "Prepare by keeping hands dry and removing polish",
        similarity: 0.87,
      },
    ]);

    const result = await searchFaqsTool({
      tenantId: "tenant-1",
      query: "How do I prepare for my appointment?",
    });

    expect(result.success).toBe(true);
    expect(result.data?.results).toHaveLength(1);
    expect(result.data?.results[0].similarity).toBe(87);
    expect(result.data?.results[0].documentTitle).toBe("Nail Care FAQ");
    expect(result.data?.results[0].chunkText).toBe(
      "Prepare by keeping hands dry and removing polish",
    );
  });

  it("returns multiple results when available", async () => {
    vi.spyOn(ragSearch, "searchFaqs").mockResolvedValue([
      {
        chunkId: "chunk-1",
        documentId: "doc-1",
        documentTitle: "Preparation Guide",
        chunkText: "Remove all polish before your appointment",
        similarity: 0.92,
      },
      {
        chunkId: "chunk-2",
        documentId: "doc-2",
        documentTitle: "Before Your Visit",
        chunkText: "Arrive 10 minutes early and bring ID",
        similarity: 0.78,
      },
      {
        chunkId: "chunk-3",
        documentId: "doc-3",
        documentTitle: "FAQ",
        chunkText: "Most clients prepare by showering beforehand",
        similarity: 0.65,
      },
    ]);

    const result = await searchFaqsTool({
      tenantId: "tenant-1",
      query: "How do I prepare?",
    });

    expect(result.success).toBe(true);
    expect(result.data?.results).toHaveLength(3);
    expect(result.data?.results[0].similarity).toBe(92);
    expect(result.data?.results[1].similarity).toBe(78);
    expect(result.data?.results[2].similarity).toBe(65);
  });

  it("returns empty results message if no matches", async () => {
    vi.spyOn(ragSearch, "searchFaqs").mockResolvedValue([]);

    const result = await searchFaqsTool({
      tenantId: "tenant-1",
      query: "Something obscure that does not match",
    });

    expect(result.success).toBe(true);
    expect(result.data?.results).toHaveLength(0);
    expect(result.message).toContain("No matching FAQ articles found");
  });

  it("returns error for empty query", async () => {
    const result = await searchFaqsTool({
      tenantId: "tenant-1",
      query: "",
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("Please provide a search query");
  });

  it("returns error for whitespace-only query", async () => {
    const result = await searchFaqsTool({
      tenantId: "tenant-1",
      query: "   ",
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("Please provide a search query");
  });

  it("handles search errors gracefully", async () => {
    vi.spyOn(ragSearch, "searchFaqs").mockRejectedValue(
      new Error("Voyage API error: Rate limit exceeded"),
    );

    const result = await searchFaqsTool({
      tenantId: "tenant-1",
      query: "test query",
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("Unable to search FAQs");
    expect(result.message).toContain("Rate limit exceeded");
  });

  it("handles unknown errors gracefully", async () => {
    vi.spyOn(ragSearch, "searchFaqs").mockRejectedValue(new Error("Connection timeout"));

    const result = await searchFaqsTool({
      tenantId: "tenant-1",
      query: "test",
    });

    expect(result.success).toBe(false);
    expect(result.message).toContain("Unable to search FAQs");
  });

  it("converts similarity scores to percentage", async () => {
    vi.spyOn(ragSearch, "searchFaqs").mockResolvedValue([
      {
        chunkId: "chunk-1",
        documentId: "doc-1",
        documentTitle: "FAQ",
        chunkText: "Sample text",
        similarity: 0.9999,
      },
      {
        chunkId: "chunk-2",
        documentId: "doc-2",
        documentTitle: "FAQ 2",
        chunkText: "Sample text 2",
        similarity: 0.5,
      },
      {
        chunkId: "chunk-3",
        documentId: "doc-3",
        documentTitle: "FAQ 3",
        chunkText: "Sample text 3",
        similarity: 0.0001,
      },
    ]);

    const result = await searchFaqsTool({
      tenantId: "tenant-1",
      query: "test",
    });

    expect(result.success).toBe(true);
    expect(result.data?.results[0].similarity).toBe(100); // 0.9999 * 100 = 99.99, rounded to 100
    expect(result.data?.results[1].similarity).toBe(50); // 0.5 * 100 = 50
    expect(result.data?.results[2].similarity).toBe(0); // 0.0001 * 100 = 0.01, rounded to 0
  });

  it("includes query in response data", async () => {
    vi.spyOn(ragSearch, "searchFaqs").mockResolvedValue([]);

    const query = "What are your hours?";
    const result = await searchFaqsTool({
      tenantId: "tenant-1",
      query,
    });

    expect(result.data?.query).toBe(query);
  });

  it("calls searchFaqs with correct parameters", async () => {
    const spy = vi.spyOn(ragSearch, "searchFaqs").mockResolvedValue([]);

    await searchFaqsTool({
      tenantId: "my-tenant",
      query: "Test question",
    });

    expect(spy).toHaveBeenCalledWith("my-tenant", "Test question", 3);
  });

  it("returns success message with result count", async () => {
    vi.spyOn(ragSearch, "searchFaqs").mockResolvedValue([
      {
        chunkId: "chunk-1",
        documentId: "doc-1",
        documentTitle: "FAQ 1",
        chunkText: "Text 1",
        similarity: 0.9,
      },
      {
        chunkId: "chunk-2",
        documentId: "doc-2",
        documentTitle: "FAQ 2",
        chunkText: "Text 2",
        similarity: 0.8,
      },
    ]);

    const result = await searchFaqsTool({
      tenantId: "tenant-1",
      query: "test",
    });

    expect(result.success).toBe(true);
    expect(result.message).toBe("Found 2 matching FAQ articles");
  });
});
