import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import * as fc from 'fast-check';

import type { Mosque } from './index';
import {
  buildReportPayload,
  MAX_DESCRIPTION,
  MIN_DESCRIPTION,
  REASONS,
  reasonSpec,
  REPORT_ENDPOINT,
  submitMosqueReport,
  validateReport,
  type ReportReason,
} from './report';

const MOSQUE: Mosque = {
  id: 'alsalam-moske-karlshamn',
  name: 'Al-Salam moské',
  lat: 56.17,
  lng: 14.86,
  city: 'Karlshamn',
  citySlug: 'karlshamn',
  kommun: 'Karlshamn',
  lan: 'Blekinge',
  address: 'Storgatan 4',
  postalCode: '374 35',
};

function mockFetch(status: number, body: unknown) {
  const fn = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
  (globalThis as { fetch: unknown }).fetch = fn;
  return fn;
}

describe('buildReportPayload', () => {
  // THE PROMISE THIS GUARDS: Om appen tells the user "Din plats lämnar aldrig enheten."
  // The entry point (MosqueCard) already holds `userCoords` for its distance readout, so
  // threading them into the report would be a one-word change that nobody would notice in
  // review. The payload is a closed shape and the user's position is not in it.
  it('never carries the user location', () => {
    const payload = buildReportPayload(MOSQUE, 'adress', 'Rätt adress är Storgatan 9', '');
    const serialized = JSON.stringify(payload);

    expect(Object.keys(payload).sort()).toEqual([
      'app_version',
      'city_slug',
      'current_address',
      'description',
      'kommun',
      'lan',
      'mosque_id',
      'mosque_name',
      'reason',
      'reporter_email',
    ]);
    // Belt and braces: no coordinate-shaped key survived, whatever the shape check says.
    expect(serialized).not.toMatch(/latitude|longitude|"lat"|"lng"|user_/);
  });

  it('identifies the mosque and snapshots the address the app displayed', () => {
    const payload = buildReportPayload(MOSQUE, 'namn', 'Al-Huda', '');
    expect(payload.mosque_id).toBe('alsalam-moske-karlshamn');
    expect(payload.city_slug).toBe('karlshamn');
    // Triage compares the report against what the reporter actually saw — the web and
    // mobile datasets have drifted, so "the address in the data" is version-dependent.
    expect(payload.current_address).toBe('Storgatan 4');
  });

  it('sends an empty address rather than undefined when the record has none', () => {
    const { address: _omitted, ...withoutAddress } = MOSQUE;
    const payload = buildReportPayload(withoutAddress, 'stangd', '', '');
    // The server clamps non-strings to "", but sending undefined would drop the key from
    // the JSON entirely and make the payload shape depend on the record.
    expect(payload.current_address).toBe('');
  });

  it('trims and clamps the description to the server limit', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 6000 }), (text) => {
        const payload = buildReportPayload(MOSQUE, 'annat', text, '');
        expect(payload.description.length).toBeLessThanOrEqual(MAX_DESCRIPTION);
        expect(payload.description).toBe(payload.description.trim());
      }),
    );
  });
});

describe('validateReport', () => {
  // `stangd` is the one reason that is complete on its own: the radio row IS the report.
  // Forcing a sentence there would be busywork with nothing to say.
  it('accepts a closure report with no text at all', () => {
    expect(validateReport('stangd', '', '')).toEqual({ ok: true });
  });

  it.each(REASONS.filter((r) => r.requiresText).map((r) => r.value))(
    'requires text for "%s" and answers with that reason’s own prompt',
    (reason) => {
      const result = validateReport(reason, '  ', '');
      expect(result.ok).toBe(false);
      if (result.ok) return;
      expect(result.field).toBe('description');
      // The error repeats the question rather than saying "field required" — the user is
      // told what to write, not merely that they failed.
      expect(result.message).toBe(reasonSpec(reason).prompt);
    },
  );

  // A correct mosque name can be very short. The article form's 10-character floor would
  // reject "Al-Huda", which is a complete and useful answer.
  it('accepts a name as short as the minimum', () => {
    expect(validateReport('namn', 'Al-Huda', '')).toEqual({ ok: true });
    expect('Al-Huda'.length).toBeGreaterThanOrEqual(MIN_DESCRIPTION);
  });

  it('treats the email as optional but validates it when present', () => {
    expect(validateReport('stangd', '', '')).toEqual({ ok: true });
    expect(validateReport('stangd', '', 'someone@example.com')).toEqual({ ok: true });
    const bad = validateReport('stangd', '', 'not-an-address');
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.field).toBe('email');
  });
});

describe('reasonSpec', () => {
  it('resolves every reason in the enum', () => {
    for (const spec of REASONS) {
      expect(reasonSpec(spec.value)).toBe(spec);
    }
  });

  // Reached only via a hand-written deep link (/moske-rattelse?reason=…). A screen that
  // renders `undefined.prompt` would crash; falling back to "Något annat" just works.
  it('falls back instead of returning undefined for an unknown reason', () => {
    expect(reasonSpec('inte-en-anledning' as ReportReason).value).toBe('annat');
  });
});

describe('submitMosqueReport', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('posts JSON to the correction endpoint and reports the case number', async () => {
    const fetchMock = mockFetch(200, { ok: true, id: 42 });
    const payload = buildReportPayload(MOSQUE, 'adress', 'Rätt adress är Storgatan 9', '');

    await expect(submitMosqueReport(payload)).resolves.toEqual({ ok: true, id: 42 });

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(REPORT_ENDPOINT);
    expect(init.method).toBe('POST');
    expect(JSON.parse(String(init.body))).toEqual(payload);
  });

  // The rate limit is the endpoint's only real abuse control, so its message has to be
  // legible — a user who sees the generic error will just tap Skicka again and again.
  it('explains a rate limit in the user’s own language', async () => {
    mockFetch(429, { ok: false, error: 'rate_limited' });
    const result = await submitMosqueReport(buildReportPayload(MOSQUE, 'stangd', '', ''));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/senaste timmen/);
  });

  // A 5xx from the edge is often an HTML error page. Parsing it throws, and an unhandled
  // throw here would hit the error boundary and lose everything the user typed.
  it('survives a non-JSON error response', async () => {
    (globalThis as { fetch: unknown }).fetch = jest.fn(async () => ({
      ok: false,
      status: 502,
      json: async () => {
        throw new SyntaxError('Unexpected token <');
      },
    }));
    const result = await submitMosqueReport(buildReportPayload(MOSQUE, 'stangd', '', ''));
    expect(result).toEqual({ ok: false, message: 'Något gick fel. Försök igen.' });
  });

  // THE BUG THIS GUARDS: the first version used AbortSignal.timeout(). Node has that
  // static; React Native does not — it replaces the global AbortSignal with the
  // `abort-controller` package, which ships no timeout(). On device the call threw
  // TypeError before fetch ran, the single catch swallowed it, and EVERY submission came
  // back as "Ingen anslutning". The suite stayed green because jest.setup.js had been
  // given a polyfill, so the tests were greener than the device.
  //
  // Asserting the signal exists is not enough — under Node, AbortSignal.timeout() returns
  // a perfectly good signal, so such a test passes against the broken code. The only
  // honest check is to REPRODUCE the device runtime by taking the static away.
  it('still submits when AbortSignal.timeout does not exist, as on device', async () => {
    const original = AbortSignal.timeout;
    // @ts-expect-error — deleting a standard static to mimic React Native's polyfill.
    delete AbortSignal.timeout;
    try {
      const fetchMock = mockFetch(200, { ok: true, id: 5 });
      const result = await submitMosqueReport(buildReportPayload(MOSQUE, 'stangd', '', ''));

      // Before the fix this threw TypeError before fetch ran, the catch turned it into
      // OFFLINE, and the user was told they had no connection while online.
      expect(fetchMock).toHaveBeenCalled();
      expect(result).toEqual({ ok: true, id: 5 });

      const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
      expect(init.signal?.aborted).toBe(false);
    } finally {
      AbortSignal.timeout = original;
    }
  });

  it('turns a dead network into a retry message, never a rejection', async () => {
    (globalThis as { fetch: unknown }).fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    const result = await submitMosqueReport(buildReportPayload(MOSQUE, 'stangd', '', ''));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.message).toMatch(/Ingen anslutning/);
  });
});
