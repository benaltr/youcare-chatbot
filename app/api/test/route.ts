export async function GET() {
  try {
    const dbUrl = process.env.DATABASE_URL;
    const apiKey = process.env.ANTHROPIC_API_KEY;

    return Response.json({
      status: 'ok',
      hasDbUrl: !!dbUrl,
      hasApiKey: !!apiKey,
      dbUrlStart: dbUrl?.substring(0, 30),
    });
  } catch (error) {
    return Response.json({ error: String(error) }, { status: 500 });
  }
}
