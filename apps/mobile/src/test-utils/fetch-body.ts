/**
 * The JSON string a mocked `fetch` was called with.
 *
 * `RequestInit['body']` is `BodyInit`, which admits Blob, FormData, URLSearchParams and
 * ReadableStream — every one of which stringifies to `"[object Object]"`. A test that
 * reaches for `String(init.body)` therefore keeps compiling after the request stops being
 * JSON, and fails somewhere downstream with a `JSON.parse` SyntaxError pointing at a body
 * nobody printed. The reporter always sends a JSON string; anything else means the request
 * shape changed underneath the test, and this says so at the point it changed.
 */
export function jsonBodyOf(init: RequestInit): string {
  const { body } = init;
  if (typeof body !== 'string') {
    throw new Error(
      `fetch was called with a ${body === undefined ? 'missing' : typeof body} body, not a ` +
        `JSON string — the request no longer sends what this test parses.`,
    );
  }
  return body;
}
