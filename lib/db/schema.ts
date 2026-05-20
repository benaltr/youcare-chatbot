import { sql } from "drizzle-orm";
import {
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const tenants = pgTable(
  "tenants",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    domain: text("domain"),
    whatsappNumber: text("whatsapp_number"),
    languageDefault: text("language_default").notNull().default("he"),
    status: text("status").notNull().default("active"), // 'active' | 'paused' | 'demo'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tenants_slug_unique").on(t.slug),
    uniqueIndex("tenants_domain_unique").on(t.domain),
    uniqueIndex("tenants_whatsapp_unique").on(t.whatsappNumber),
  ],
);

export const tenantConfigs = pgTable("tenant_configs", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  personaName: text("persona_name").notNull(),
  personaSystemPrompt: text("persona_system_prompt").notNull(),
  brandColors: jsonb("brand_colors").$type<{
    primary?: string;
    secondary?: string;
    accent?: string;
  }>(),
  businessHours: jsonb("business_hours").$type<Record<string, { open: string; close: string }>>(),
  handoffMessage: text("handoff_message"),
  emojiPalette: jsonb("emoji_palette").$type<string[]>(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type TenantConfig = typeof tenantConfigs.$inferSelect;
export type NewTenantConfig = typeof tenantConfigs.$inferInsert;
