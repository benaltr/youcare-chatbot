export async function POST(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    return Response.json({
      received: {
        tenantSlug: body.tenantSlug,
        messagesType: typeof body.messages,
        messagesLength: body.messages?.length,
        firstMessage: body.messages?.[0],
      },
    });
  } catch (err: any) {
    return Response.json({ error: err.message }, { status: 500 });
  }
}
