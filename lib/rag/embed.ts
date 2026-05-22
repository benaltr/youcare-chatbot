import { getEnv } from "@/lib/env";

export interface EmbedResult {
  text: string;
  embedding: number[]; // 1024-dimensional vector
}

export async function embedText(text: string): Promise<number[]> {
  const env = getEnv();

  if (!env.VOYAGE_API_KEY) {
    throw new Error("VOYAGE_API_KEY environment variable not set");
  }

  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "voyage-3-large", // Best for multilingual (Hebrew + English)
      input: text,
      input_type: "document", // 'document' vs 'query'
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Voyage API error: ${response.status} ${error}`);
  }

  const data = await response.json();

  if (!data.data || !data.data[0] || !data.data[0].embedding) {
    throw new Error("Invalid response from Voyage API");
  }

  return data.data[0].embedding;
}

export async function embedQuery(query: string): Promise<number[]> {
  // Same as embedText but with input_type: 'query' for search queries
  const env = getEnv();

  if (!env.VOYAGE_API_KEY) {
    throw new Error("VOYAGE_API_KEY environment variable not set");
  }

  const response = await fetch("https://api.voyageai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.VOYAGE_API_KEY}`,
    },
    body: JSON.stringify({
      model: "voyage-3-large",
      input: query,
      input_type: "query", // Different type for search queries
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Voyage API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.data[0].embedding;
}
