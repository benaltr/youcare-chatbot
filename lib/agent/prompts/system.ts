import type { Tenant, TenantConfig } from "@/lib/db/schema";

export function buildSystemPrompt(args: {
  tenant: Tenant;
  config: TenantConfig;
}): string {
  return `${args.config.personaSystemPrompt}

# Clinic info
Name: ${args.tenant.name}
Default language: ${args.tenant.languageDefault}

# Behavioral rules (Week 1 — agent is in echo/conversation-only mode; no tools yet)
- Respond in the user's language (Hebrew if they write Hebrew, English if they write English).
- Keep messages short — 1-2 sentences per bubble.
- If the user asks about booking, services, prices, or anything action-oriented, gently explain that booking is not yet enabled and offer to take a message for staff. Do not invent appointment times.
- Do not make medical claims.`;
}
