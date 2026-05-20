# YouCare AI Chatbot — Agent Instructions

This directory contains the YouCare AI Chatbot product — a multi-tenant Hebrew-primary AI chatbot platform for Israeli wellness clinics (laser/aesthetic, dental, physio, med spa, beauty).

**Note:** This project is separate from the YouCare agency's internal "WAT framework" (Python tools for agency operations). That framework lives elsewhere; do not look for `tools/` or `workflows/` directories here.

## Project Overview

- **Product:** Premium AI chatbot platform sold to Israeli wellness clinics
- **Showcase MVP:** Fictional laser/aesthetic clinic "Studio Lume"
- **Channels:** WhatsApp + embeddable web widget
- **Architecture principle:** Multi-tenant via config + adapter pattern. Clinic-domain data (calendars, customers, services) lives in clients' existing stacks via per-tenant adapters; bot-operational data (conversations, vectors, intake state) lives in our Postgres.

## Stack

- Next.js 15 (App Router) + TypeScript strict
- Postgres (local: Docker; prod: Neon)
- Drizzle ORM
- Vercel AI SDK (`ai` + `@ai-sdk/anthropic`)
- Claude Sonnet 4.6 (main), Haiku 4.5 (summarization)
- Voyage AI embeddings (Week 3+)
- Trigger.dev for scheduled jobs (Week 4+)
- Chatwoot for human handoff (Week 4+)
- Hosted on Vercel; Chatwoot self-hosted on Hetzner

## Design Documents

- **Master design:** `C:\Users\Owner\.claude\plans\hey-claude-so-i-goofy-lemur.md` — read before any architectural work
- **Implementation plans:** `docs/superpowers/plans/` — current plan is Week 1

## Conventions

- Package manager: **pnpm** (never npm or yarn)
- Tests: Vitest, in `tests/` mirroring `lib/` structure
- Lint/format: Biome (`pnpm lint` / `pnpm format`)
- Commits: Conventional Commits (`feat:`, `fix:`, `chore:`, `test:`, `docs:`)
- One commit per logical change; small commits preferred
- TDD when adding functional code (tenant logic, agent code, adapters); skip TDD for pure scaffolding/config

## Hebrew & RTL

The bot speaks Hebrew primarily. When writing user-facing copy, use natural Israeli idioms (not formal academic Hebrew). All widget UI must support RTL. Use `dir="rtl"` where appropriate; Tailwind has `rtl:` variants.

## Multi-tenancy

Every database query goes through tenant scoping. There is no "global" query in this codebase — if you find yourself writing `SELECT * FROM customers` without a tenant filter, stop and add one. Application-layer scoping is the rule until 100+ clinics, then revisit RLS.
