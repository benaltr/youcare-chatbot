import { and, eq } from "drizzle-orm";
import { db, schema } from "@/lib/db";
import { getEnv } from "@/lib/env";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");

    if (error) {
      return new Response(`Authorization failed: ${error}`, { status: 400 });
    }

    if (!code || !state) {
      return new Response("Missing code or state parameter", { status: 400 });
    }

    // Decode state to get tenantSlug
    const tenantSlug = Buffer.from(state, "base64").toString("utf-8");

    const env = getEnv();

    if (!env.GOOGLE_OAUTH_CLIENT_ID || !env.GOOGLE_OAUTH_CLIENT_SECRET) {
      return new Response(
        "Google OAuth credentials not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.",
        { status: 400 }
      );
    }

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: env.GOOGLE_OAUTH_CLIENT_ID,
        client_secret: env.GOOGLE_OAUTH_CLIENT_SECRET,
        code,
        grant_type: "authorization_code",
        redirect_uri: `${new URL(req.url).origin}/api/auth/google/callback`,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const error = await tokenResponse.json();
      return new Response(`Token exchange failed: ${error.error_description}`, {
        status: 400,
      });
    }

    const tokens = await tokenResponse.json();

    // Get user's primary calendar ID
    const calendarResponse = await fetch(
      "https://www.googleapis.com/calendar/v3/calendars/primary?fields=id",
      {
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      }
    );

    if (!calendarResponse.ok) {
      return new Response("Failed to get calendar info", { status: 400 });
    }

    const calendarData = await calendarResponse.json();

    // Get tenant
    const tenant = await db.query.tenants.findFirst({
      where: eq(schema.tenants.slug, tenantSlug),
    });

    if (!tenant) {
      return new Response(`Tenant not found: ${tenantSlug}`, { status: 404 });
    }

    // Store or update Google Calendar credentials
    const expiresAt = Date.now() + tokens.expires_in * 1000;

    const credentials = {
      googleAccessToken: tokens.access_token,
      googleRefreshToken: tokens.refresh_token,
      googleAccessTokenExpiresAt: expiresAt,
      googleCalendarId: calendarData.id,
    };

    // Check if config exists
    const existing = await db.query.tenantAdapterConfigs.findFirst({
      where: and(
        eq(schema.tenantAdapterConfigs.tenantId, tenant.id),
        eq(schema.tenantAdapterConfigs.category, "calendar")
      ),
    });

    if (existing) {
      await db
        .update(schema.tenantAdapterConfigs)
        .set({ credentials: credentials as unknown as Record<string, unknown> })
        .where(
          and(
            eq(schema.tenantAdapterConfigs.tenantId, tenant.id),
            eq(schema.tenantAdapterConfigs.category, "calendar")
          )
        );
    } else {
      await db.insert(schema.tenantAdapterConfigs).values({
        tenantId: tenant.id,
        category: "calendar",
        adapter: "google_calendar",
        credentials: credentials as unknown as Record<string, unknown>,
        config: {},
      });
    }

    return new Response(
      `<html>
        <head><title>Authorization Successful</title></head>
        <body>
          <h1>✅ Google Calendar Connected!</h1>
          <p>Your calendar has been successfully connected to ${tenantSlug}.</p>
          <p>Bookings will now sync to: <strong>${calendarData.id}</strong></p>
          <p><a href="/">Return to home</a></p>
        </body>
      </html>`,
      { headers: { "Content-Type": "text/html" } }
    );
  } catch (error: any) {
    console.error("OAuth callback error:", error);
    return new Response(`Authorization failed: ${error.message}`, {
      status: 500,
    });
  }
}
