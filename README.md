# YouCare AI Chatbot

Multi-tenant AI chatbot for Israeli wellness clinics. Hebrew-primary. Built with Next.js, Drizzle, and Claude.

## Stack

- Next.js 15 (App Router) + TypeScript
- Tailwind CSS v4
- Drizzle ORM (Postgres)
- Vercel AI SDK + `@ai-sdk/anthropic`
- Vitest + Biome
- pnpm + Docker Compose for local dev

## First-time setup

1. Install Node 22 LTS and pnpm 9
2. Install Docker Desktop
3. Clone repo and install:
   ```bash
   pnpm install
   ```
4. Copy env template and fill in your Anthropic API key:
   ```bash
   cp .env.example .env.local
   # then edit .env.local with your ANTHROPIC_API_KEY from https://console.anthropic.com
   ```
5. Bring up local Postgres:
   ```bash
   pnpm db:up
   ```
6. Apply migrations:
   ```bash
   pnpm db:migrate
   ```
7. Seed the demo tenant:
   ```bash
   pnpm db:seed
   ```
8. Start the dev server:
   ```bash
   pnpm dev
   ```
9. Open http://localhost:3000/widget and try the chat.

## Common scripts

| Script | Purpose |
| --- | --- |
| `pnpm dev` | Start Next.js dev server |
| `pnpm build` | Production build |
| `pnpm test` | Run Vitest |
| `pnpm lint` | Run Biome lint |
| `pnpm format` | Auto-format with Biome |
| `pnpm db:up` | Start local Postgres |
| `pnpm db:down` | Stop local Postgres |
| `pnpm db:migrate` | Apply Drizzle migrations |
| `pnpm db:generate` | Generate a new migration from schema changes |
| `pnpm db:seed` | Insert demo tenant |
| `pnpm db:psql` | Open psql in the container |
| `pnpm db:studio` | Drizzle Studio UI |

## Project layout

See `CLAUDE.md` for design context and conventions. Design docs are in `C:\Users\Owner\.claude\plans\`.

## Status

- ✅ **Week 1:** Foundation + echo bot
- ⏳ **Week 2:** Google Calendar adapter + booking tools
- ⏳ **Week 3:** WhatsApp BSP + FAQ/RAG
- ⏳ **Week 4:** Intake screening, packages, Chatwoot handoff, Trigger.dev jobs
- ⏳ **Week 5:** Demo polish + onboarding CLI + production deploy
- ⏳ **Week 6:** Buffer for Hebrew refinement
