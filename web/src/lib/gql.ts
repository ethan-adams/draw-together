// A tiny GraphQL-over-HTTP client, no framework, so the request is legible:
// POST a { query, variables } body to /graphql, unwrap { data } or throw on errors.
// (The live drawing does NOT use this; it's the cold path only.)
export async function gql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const res = await fetch('/graphql', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message as string);
  return json.data as T;
}
