// Properties of the breadcrumb allow-list: whatever a producer hands it, what comes out can
// name a screen or a foreground/background move and nothing else. The examples in
// sentry-breadcrumbs.test.ts pin the real leaks; these pin the shape of everything else.
import { describe, expect, it } from '@jest/globals';
import type { Breadcrumb } from '@sentry/react-native';
import * as fc from 'fast-check';

import { allowBreadcrumb } from './sentry-breadcrumbs';

// Real categories (the two allowed ones and the ones the SDKs record) plus arbitrary ones.
const category = fc.oneof(
  fc.constantFrom('navigation', 'app.lifecycle', 'console', 'http', 'xhr', 'fetch', 'ui.click', 'touch', 'sentry.event'),
  fc.string(),
);
// Values a producer could put in data: route-like names, coordinates, URLs, anything.
const value = fc.oneof(
  fc.constantFrom('bonetider', '(settings)/om', 'foreground', 'background', '59.3293,18.0686', 'https://x.se/1/2/3'),
  fc.string(),
  fc.double(),
  fc.dictionary(fc.string(), fc.string()),
);
const breadcrumb: fc.Arbitrary<Breadcrumb> = fc.record(
  {
    type: fc.string(),
    category,
    level: fc.constantFrom('info' as const, 'warning' as const, 'error' as const),
    message: fc.string(),
    timestamp: fc.double({ min: 0, max: 2e9, noNaN: true }),
    data: fc.dictionary(fc.constantFrom('from', 'to', 'state', 'url', 'params', 'arguments', 'view.id'), value),
  },
  { requiredKeys: [] },
);

describe('allowBreadcrumb — properties', () => {
  it('lets through only the two categories, with only their own data keys', () => {
    fc.assert(
      fc.property(breadcrumb, (crumb) => {
        const kept = allowBreadcrumb(crumb);
        if (kept === null) return;
        expect(['navigation', 'app.lifecycle']).toContain(kept.category);
        expect(['type', 'category', 'level', 'message', 'data', 'timestamp']).toEqual(
          expect.arrayContaining(Object.keys(kept)),
        );
        const allowedKeys = kept.category === 'navigation' ? ['from', 'to'] : ['state'];
        expect(allowedKeys).toEqual(expect.arrayContaining(Object.keys(kept.data ?? {})));
      }),
    );
  });

  it('never lets a digit, a URL or a query through in what it keeps', () => {
    // Every coordinate has digits, and every URL or query string a colon, dot, ? or =. The
    // timestamp is the SDK's own and is the one number a kept breadcrumb may hold.
    fc.assert(
      fc.property(breadcrumb, (crumb) => {
        const kept = allowBreadcrumb(crumb);
        if (kept === null) return;
        for (const text of [kept.message, ...Object.values(kept.data ?? {})]) {
          expect(typeof text).toBe('string');
          expect(text).not.toMatch(/[0-9?=.,:]/);
        }
      }),
    );
  });
});
