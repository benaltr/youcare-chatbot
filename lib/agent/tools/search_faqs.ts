/**
 * Tool: Search FAQ documents using AI semantic search
 * Used by agent to answer customer questions from uploaded FAQ documents
 */

import { searchFaqs } from "@/lib/rag/search";

export interface SearchFaqsInput {
  tenantId: string;
  query: string; // User's question, e.g., "How do I prepare for my appointment?"
}

export interface SearchFaqsResult {
  success: boolean;
  message: string;
  data?: {
    query: string;
    results: Array<{
      documentTitle: string;
      chunkText: string;
      similarity: number; // 0-100, percentage
    }>;
  };
}

export async function searchFaqsTool(input: SearchFaqsInput): Promise<SearchFaqsResult> {
  try {
    if (!input.query || input.query.trim().length === 0) {
      return {
        success: false,
        message: "Please provide a search query",
      };
    }

    // Search FAQ documents (top 3 results)
    const results = await searchFaqs(input.tenantId, input.query, 3);

    if (results.length === 0) {
      return {
        success: true,
        message: "No matching FAQ articles found. Would you like to speak with someone?",
        data: { query: input.query, results: [] },
      };
    }

    // Format results for agent to use
    const formattedResults = results.map((result) => ({
      documentTitle: result.documentTitle,
      chunkText: result.chunkText,
      similarity: Math.round(result.similarity * 100), // Show as percentage
    }));

    return {
      success: true,
      message: `Found ${results.length} matching FAQ articles`,
      data: {
        query: input.query,
        results: formattedResults,
      },
    };
  } catch (error) {
    console.error("FAQ search error:", error);
    return {
      success: false,
      message: `Unable to search FAQs: ${error instanceof Error ? error.message : "Unknown error"}`,
    };
  }
}
