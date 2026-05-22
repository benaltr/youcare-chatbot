import { and, eq } from "drizzle-orm";

import { db, schema } from "@/lib/db";
import { GoogleCalendarAdapter } from "./calendar/google-calendar";
import type { CalendarAdapter, GoogleCalendarCredentials } from "./calendar/types";

/**
 * Resolver factory for adapters
 * Loads tenant-specific adapter configuration from database and instantiates
 */

export async function getCalendarAdapter(tenantId: string): Promise<CalendarAdapter | null> {
  // Load adapter config from database
  const rows = await db
    .select()
    .from(schema.tenantAdapterConfigs)
    .where(
      and(
        eq(schema.tenantAdapterConfigs.tenantId, tenantId),
        eq(schema.tenantAdapterConfigs.category, "calendar"),
      ),
    )
    .limit(1);

  const adapterConfig = rows[0];
  if (!adapterConfig) {
    return null;
  }

  // Load tenant config for timezone and other settings
  const tenantConfigRows = await db
    .select()
    .from(schema.tenantConfigs)
    .where(eq(schema.tenantConfigs.tenantId, tenantId))
    .limit(1);

  const tenantConfig = tenantConfigRows[0] || {};

  // Instantiate adapter based on type
  const credentials = adapterConfig.credentials as GoogleCalendarCredentials;

  switch (adapterConfig.adapter) {
    case "google_calendar":
      return new GoogleCalendarAdapter(
        tenantId,
        credentials,
        tenantConfig as Record<string, unknown>,
      );
    default:
      return null;
  }
}
