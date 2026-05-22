import { sql } from "drizzle-orm";
import {
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
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

export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id"),
    channel: text("channel").notNull(), // 'web_widget' | 'whatsapp'
    channelThreadId: text("channel_thread_id").notNull(),
    status: text("status").notNull(), // 'bot' | 'human_handoff' | 'closed'
    language: text("language").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("conversations_tenant_created_idx").on(t.tenantId, t.createdAt),
    uniqueIndex("conversations_tenant_channel_thread_unique").on(
      t.tenantId,
      t.channelThreadId,
      t.channel,
    ),
  ],
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // 'user' | 'assistant' | 'system'
    content: text("content").notNull(),
    toolCalls: jsonb("tool_calls").$type<Record<string, unknown>[]>(),
    toolResults: jsonb("tool_results").$type<Record<string, unknown>[]>(),
    model: text("model"),
    tokensIn: integer("tokens_in"),
    tokensOut: integer("tokens_out"),
    costUsd: numeric("cost_usd"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("messages_conversation_created_idx").on(t.conversationId, t.createdAt)],
);

export const customers = pgTable(
  "customers",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    phone: text("phone").notNull(),
    name: text("name"),
    email: text("email"),
    languagePref: text("language_pref").notNull().default("he"),
    profile: jsonb("profile").$type<Record<string, unknown>>(),
    externalId: text("external_id"),
    source: text("source"), // 'whatsapp', 'web_widget', 'booksy', etc.
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("customers_tenant_phone_unique").on(t.tenantId, t.phone),
    index("customers_tenant_created_idx").on(t.tenantId, t.createdAt),
  ],
);

export const services = pgTable(
  "services",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    nameTranslations: jsonb("name_translations").$type<Record<string, string>>(),
    durationMinutes: integer("duration_minutes").notNull(),
    bufferMinutes: integer("buffer_minutes").notNull().default(0),
    priceCents: integer("price_cents"),
    category: text("category"),
    staffQualifications: text("staff_qualifications").array(),
    contraindications: text("contraindications").array(),
    prepInstructions: text("prep_instructions"),
    aftercareInstructions: text("aftercare_instructions"),
    active: text("active").notNull().default("true"), // 'true' | 'false' for compatibility
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("services_tenant_slug_unique").on(t.tenantId, t.slug),
    index("services_tenant_active_idx").on(t.tenantId, t.active),
  ],
);

export const staff = pgTable(
  "staff",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    qualifications: text("qualifications").array(),
    googleCalendarId: text("google_calendar_id"),
    externalId: text("external_id"),
    source: text("source"), // 'google_calendar', 'booksy', etc.
    active: text("active").notNull().default("true"), // 'true' | 'false' for compatibility
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("staff_tenant_active_idx").on(t.tenantId, t.active)],
);

export const appointments = pgTable(
  "appointments",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    staffId: uuid("staff_id").references(() => staff.id, { onDelete: "set null" }),
    packageId: uuid("package_id"),
    startsAt: timestamp("starts_at", { withTimezone: true }).notNull(),
    endsAt: timestamp("ends_at", { withTimezone: true }).notNull(),
    status: text("status").notNull(), // 'booked' | 'completed' | 'cancelled' | 'no_show'
    externalId: text("external_id"),
    source: text("source"), // 'google_calendar', 'booksy', etc.
    bookedVia: text("booked_via").notNull(), // 'bot' | 'manual'
    notes: text("notes"),
    conversationId: uuid("conversation_id").references(() => conversations.id, {
      onDelete: "set null",
    }),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("appointments_tenant_starts_idx").on(t.tenantId, t.startsAt),
    index("appointments_tenant_customer_idx").on(t.tenantId, t.customerId),
    uniqueIndex("appointments_tenant_external_source_unique").on(
      t.tenantId,
      t.externalId,
      t.source,
    ),
  ],
);

export const packages = pgTable(
  "packages",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    customerId: uuid("customer_id")
      .notNull()
      .references(() => customers.id, { onDelete: "cascade" }),
    serviceId: uuid("service_id")
      .notNull()
      .references(() => services.id, { onDelete: "cascade" }),
    totalSessions: integer("total_sessions").notNull(),
    sessionsUsed: integer("sessions_used").notNull().default(0),
    pricePaidCents: integer("price_paid_cents").notNull(),
    purchasedAt: timestamp("purchased_at", { withTimezone: true }).notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    status: text("status").notNull(), // 'active' | 'expired' | 'completed'
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("packages_tenant_customer_status_idx").on(t.tenantId, t.customerId, t.status)],
);

export const tenantAdapterConfigs = pgTable(
  "tenant_adapter_configs",
  {
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    category: text("category").notNull(),
    adapter: text("adapter").notNull(),
    credentials: jsonb("credentials").$type<Record<string, unknown>>(),
    config: jsonb("config").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.tenantId, t.category] }),
    index("tenant_adapter_configs_tenant_idx").on(t.tenantId),
  ],
);

export const faqDocuments = pgTable("faq_documents", {
  id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  title: text("title").notNull(), // e.g., "Nail Care FAQ"
  sourceType: text("source_type").notNull(), // 'markdown', 'pdf', 'text'
  sourceUri: text("source_uri"), // path to file or URL
  language: text("language").notNull().default("he"), // 'he' or 'en'
  contentRaw: text("content_raw").notNull(), // raw text of document
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const faqChunks = pgTable(
  "faq_chunks",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    documentId: uuid("document_id")
      .notNull()
      .references(() => faqDocuments.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    chunkText: text("chunk_text").notNull(), // ~500 character chunk
    embedding: vector("embedding", { dimensions: 1024 }).notNull(), // Voyage AI embedding
    metadata: jsonb("metadata").$type<Record<string, unknown>>(), // { pageNumber?, chunkIndex?, documentTitle? }
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Index for vector similarity search
    index("faq_chunks_embedding_idx").using("hnsw", sql`${table.embedding} vector_cosine_ops`),
    // Index for tenant queries
    index("faq_chunks_tenant_idx").on(table.tenantId),
    // Unique constraint: one embedding per chunk
    uniqueIndex("faq_chunks_document_chunk_unique").on(table.documentId, table.chunkText),
  ],
);

export type Tenant = typeof tenants.$inferSelect;
export type NewTenant = typeof tenants.$inferInsert;
export type TenantConfig = typeof tenantConfigs.$inferSelect;
export type NewTenantConfig = typeof tenantConfigs.$inferInsert;
export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;
export type Message = typeof messages.$inferSelect;
export type NewMessage = typeof messages.$inferInsert;
export type Customer = typeof customers.$inferSelect;
export type NewCustomer = typeof customers.$inferInsert;
export type Service = typeof services.$inferSelect;
export type NewService = typeof services.$inferInsert;
export type Staff = typeof staff.$inferSelect;
export type NewStaff = typeof staff.$inferInsert;
export type Appointment = typeof appointments.$inferSelect;
export type NewAppointment = typeof appointments.$inferInsert;
export type Package = typeof packages.$inferSelect;
export type NewPackage = typeof packages.$inferInsert;
export type TenantAdapterConfig = typeof tenantAdapterConfigs.$inferSelect;
export type NewTenantAdapterConfig = typeof tenantAdapterConfigs.$inferInsert;
export type FaqDocument = typeof faqDocuments.$inferSelect;
export type NewFaqDocument = typeof faqDocuments.$inferInsert;
export type FaqChunk = typeof faqChunks.$inferSelect;
export type NewFaqChunk = typeof faqChunks.$inferInsert;
