import { getEnv } from "@/lib/env";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const tenantSlug = searchParams.get("tenant");

    if (!tenantSlug) {
      return new Response("Missing tenant parameter", { status: 400 });
    }

    const env = getEnv();

    if (!env.GOOGLE_OAUTH_CLIENT_ID) {
      return new Response(
        "Google OAuth not configured. Set GOOGLE_OAUTH_CLIENT_ID in environment variables.",
        { status: 400 }
      );
    }

    const origin = new URL(req.url).origin;
    const redirectUri = `${origin}/api/auth/google/callback`;

    // Encode tenant slug in state for security
    const state = Buffer.from(tenantSlug).toString("base64");

    const googleAuthUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    googleAuthUrl.searchParams.set("client_id", env.GOOGLE_OAUTH_CLIENT_ID);
    googleAuthUrl.searchParams.set("redirect_uri", redirectUri);
    googleAuthUrl.searchParams.set("response_type", "code");
    googleAuthUrl.searchParams.set("scope", [
      "https://www.googleapis.com/auth/calendar",
      "https://www.googleapis.com/auth/userinfo.email",
    ].join(" "));
    googleAuthUrl.searchParams.set("state", state);
    googleAuthUrl.searchParams.set("access_type", "offline"); // Request refresh token
    googleAuthUrl.searchParams.set("prompt", "consent"); // Force re-consent to get refresh token

    return Response.redirect(googleAuthUrl.toString());
  } catch (error: any) {
    console.error("OAuth init error:", error);
    return new Response(`Failed to start authorization: ${error.message}`, {
      status: 500,
    });
  }
}
