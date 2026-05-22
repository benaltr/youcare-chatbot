import { db } from "@/lib/db";
import { faqChunks, faqDocuments } from "@/lib/db/schema";
import { eq, sql } from "drizzle-orm";
import { embedQuery } from "./embed";

export interface FaqSearchResult {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  chunkText: string;
  similarity: number; // 0-1, higher is better
}

export async function searchFaqs(
  tenantId: string,
  query: string,
  limit: number = 3,
): Promise<FaqSearchResult[]> {
  try {
    // 1. Embed the search query
    const queryEmbedding = await embedQuery(query);

    // 2. Search faq_chunks using cosine similarity
    // Cosine similarity: 1 - (distance) where distance is 1 - cosine_similarity
    const results = await db
      .select({
        chunkId: faqChunks.id,
        documentId: faqChunks.documentId,
        documentTitle: faqDocuments.title,
        chunkText: faqChunks.chunkText,
        similarity: sql<number>`1 - (${faqChunks.embedding} <=> ${sql.raw(
          `'[${queryEmbedding.join(",")}]'::vector`,
        )})`, // Cosine distance operator
      })
      .from(faqChunks)
      .innerJoin(faqDocuments, eq(faqChunks.documentId, faqDocuments.id))
      .where(eq(faqChunks.tenantId, tenantId))
      .orderBy((t) => sql`${t.similarity} DESC`)
      .limit(limit);

    return results as FaqSearchResult[];
  } catch (error) {
    console.error("FAQ search error:", error);
    throw error;
  }
}

export async function searchFaqsRaw(
  tenantId: string,
  queryEmbedding: number[],
  limit: number = 3,
): Promise<FaqSearchResult[]> {
  // Lower-level search that accepts pre-computed embedding
  // Useful if you want to control embedding calls
  const results = await db
    .select({
      chunkId: faqChunks.id,
      documentId: faqChunks.documentId,
      documentTitle: faqDocuments.title,
      chunkText: faqChunks.chunkText,
      similarity: sql<number>`1 - (${faqChunks.embedding} <=> ${sql.raw(
        `'[${queryEmbedding.join(",")}]'::vector`,
      )})`,
    })
    .from(faqChunks)
    .innerJoin(faqDocuments, eq(faqChunks.documentId, faqDocuments.id))
    .where(eq(faqChunks.tenantId, tenantId))
    .orderBy((t) => sql`${t.similarity} DESC`)
    .limit(limit);

  return results as FaqSearchResult[];
}
