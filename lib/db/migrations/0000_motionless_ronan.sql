CREATE TABLE "tenant_configs" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"persona_name" text NOT NULL,
	"persona_system_prompt" text NOT NULL,
	"brand_colors" jsonb,
	"business_hours" jsonb,
	"handoff_message" text,
	"emoji_palette" jsonb,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tenants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"domain" text,
	"whatsapp_number" text,
	"language_default" text DEFAULT 'he' NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_configs" ADD CONSTRAINT "tenant_configs_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_slug_unique" ON "tenants" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_domain_unique" ON "tenants" USING btree ("domain");--> statement-breakpoint
CREATE UNIQUE INDEX "tenants_whatsapp_unique" ON "tenants" USING btree ("whatsapp_number");