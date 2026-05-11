// Self-contained fixture for parameter-flow integration test.
// Exercises positional arg→param matching, multi-step call chain, and a
// rest-param handler. No external imports — keeps the fixture fully local
// so the test pipeline can index it deterministically.

interface RawRequest {
  body: unknown;
  slug: string;
}

interface SanitizedGrant {
  title: string;
  amount: number;
}

export async function handleCreateGrant(request: RawRequest): Promise<SanitizedGrant> {
  const sanitized = sanitize(request.body, 'grant');
  const validated = validateGrant(sanitized, request.slug);
  const stored = await persistGrant(validated, request.slug);
  return stored;
}

export function sanitize(data: unknown, entity: string): unknown {
  return mergeAll({}, data as object, { entity });
}

export function validateGrant(input: unknown, slug: string): SanitizedGrant {
  const draft = input as Partial<SanitizedGrant>;
  return {
    title: draft.title ?? `${slug}-untitled`,
    amount: draft.amount ?? 0,
  };
}

export async function persistGrant(grant: SanitizedGrant, slug: string): Promise<SanitizedGrant> {
  return { ...grant, title: `${slug}:${grant.title}` };
}

export function mergeAll(first: object, ...rest: object[]): object {
  return Object.assign(first, ...rest);
}
