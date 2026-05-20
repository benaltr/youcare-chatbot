import { anthropic } from "@ai-sdk/anthropic";
import { streamText, type ModelMessage } from "ai";
import { eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { buildSystemPrompt } from "./prompts/system";

export interface RunAgentInput {
  tenantSlug: string;
  messages: ModelMessage[];
}

export async function runAgent(input: RunAgentInput) {
  const tenant = (
    await db.select().from(schema.tenants).where(eq(schema.tenants.slug, input.tenantSlug)).limit(1)
  )[0];

  if (!tenant) {
    throw new Error(`Tenant not found: ${input.tenantSlug}`);
  }

  const config = (
    await db
      .select()
      .from(schema.tenantConfigs)
      .where(eq(schema.tenantConfigs.tenantId, tenant.id))
      .limit(1)
  )[0];

  if (!config) {
    throw new Error(`Tenant config not found for tenant: ${tenant.id}`);
  }

  const systemPrompt = buildSystemPrompt({ tenant, config });

  return streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: systemPrompt,
    messages: input.messages,
    maxOutputTokens: 1024,
  });
}
