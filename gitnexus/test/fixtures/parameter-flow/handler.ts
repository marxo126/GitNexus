// Mimics fluentiagrant data flow: request -> sanitize -> validate -> db
async function handlePOST(request: NextRequest, context: { params: { slug: string } }) {
  const rawBody = await request.json();
  const sanitized = pickAllowedFields(rawBody, 'grant');
  const parsed = grantSchema.safeParse(sanitized);
  const grant = await createGrant(parsed.data, context.params.slug);
  return NextResponse.json(grant);
}

function pickAllowedFields(data: any, entity: string) {
  return data;
}

async function createGrant(data: any, slug: string) {
  return prisma.grant.create({ data });
}

function mergeAll(first: any, ...rest: any[]) {
  return Object.assign(first, ...rest);
}
