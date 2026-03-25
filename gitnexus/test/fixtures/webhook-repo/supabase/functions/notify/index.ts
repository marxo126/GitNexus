Deno.serve(async (req) => {
  const { user_id, message } = await req.json();
  return new Response(JSON.stringify({ ok: true }));
});
