# Deployment Notes — Chat Endpoint Fixed

## Summary
Fixed the 500 error on the `/api/chat` endpoint. The bot now responds correctly with streaming messages, tool calling, and conversation persistence.

## Root Cause
**TypeScript Build Error + Missing Database Migrations**

1. **Build Error**: Zod schema validation failed
   - Issue: `z.record(z.any())` requires 2 arguments in newer Zod versions
   - Fix: Changed to `z.record(z.string(), z.any())`

2. **Missing Database Migrations**: Only the first migration was applied
   - Tenants and tenant_configs tables existed
   - Missing: customers, conversations, messages, services, staff, packages, faq_documents, faq_chunks
   - Fix: Applied remaining migrations 0001 and 0002, enabled pgvector extension

## Changes Made

### Code Fixes
- **app/api/chat/route.ts**:
  - Fixed Zod schema for messages array parameter
  - Improved error handling to include error codes in responses
  - Verified message mapping and streaming logic

- **lib/env.ts**: No changes needed, config was correct

### Database Fixes
- **Enable pgvector**: Required for FAQ embeddings (faq_chunks table with vector(1024) type)
- **Apply migrations**: 
  - 0000_motionless_ronan.sql: tenants, tenant_configs (already applied)
  - 0001_cute_firebrand.sql: customers, conversations, messages, services, staff, packages, tenant_adapter_configs
  - 0002_familiar_tigra.sql: faq_documents, faq_chunks with pgvector index

- **New script**: `scripts/apply-migrations.ts`
  - Helper to apply all Drizzle migrations programmatically
  - Handles already-applied statements gracefully
  - Useful for future deployments or recovery

### Testing Endpoints
- **app/api/test/route.ts**: Enhanced to show which tables exist in database
- Verified all core tables created and queryable

## Deployment Status

### Local Testing (✅ Working)
```bash
# Single message
curl -X POST http://localhost:3000/api/chat \
  -d '{"tenantSlug":"studio-lume","messages":[{"role":"user","content":"Hello"}],"phone":"+972501234567"}'
# Result: Bot responds with "Welcome to Studio Lume ✨"

# Multi-turn conversation
# Result: Bot calls get_clinic_info tool, shows available laser treatments
```

### Database Persistence (✅ Verified)
- ✅ 1 customer created
- ✅ 1 conversation tracking
- ✅ 12 messages persisted
- ✅ Language detection working (English detected for test messages)

### Vercel Deployment (⏳ In Progress)
- Pushed commits 2b5ee45, d487128
- Waiting for Vercel to build and deploy
- Once deployed, test at https://demo.youcare-ai.com/api/chat

## Next Steps

1. **Verify Production**: Once Vercel deployment completes, test live demo
2. **Seed Service Data**: Services table is empty - either:
   - Add services to database via seed script, or
   - Configure get_clinic_info to load from tenant config instead of DB
3. **Test Booking Flow**: Full end-to-end booking sequence:
   - User requests appointment
   - Bot shows available services
   - Bot finds available slots
   - Bot books appointment
   - Confirmation saved to DB

## Database Schema Status

| Table | Status | Notes |
|-------|--------|-------|
| tenants | ✅ | 2 demo tenants (studio-lume, nail-business) |
| tenant_configs | ✅ | Persona prompts configured |
| conversations | ✅ | Tracking web_widget and whatsapp channels |
| customers | ✅ | Phone-based customer lookup |
| messages | ✅ | All conversation turns persisted with tokens/cost |
| services | ⚠️ | Schema created but empty - needs seeding |
| staff | ⚠️ | Schema created but empty |
| appointments | ✅ | Schema created, ready for bookings |
| packages | ✅ | Schema created for session packages |
| faq_documents | ✅ | Schema created, ready for FAQ ingestion |
| faq_chunks | ✅ | Schema created with pgvector index |
| tenant_adapter_configs | ✅ | Schema created for per-client integrations |

## Commits
- `cd3bf7b`: Fix zod schema
- `2b5ee45`: Apply migrations + create helper script
- `d487128`: Remove extraneous root files
