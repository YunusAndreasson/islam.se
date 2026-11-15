import { beforeEach, describe, expect, it, jest } from '@jest/globals';

// Plain objects and a class rather than jest.fn, so each test reads exactly what the service
// asked of the SDK, whatever the mock-reset settings are.
const mockSdk = {
  constructed: [] as unknown[][],
  inits: 0,
  initArgs: [] as unknown[][],
  failNextInit: false,
  throwOnTrack: false,
  tracked: [] as { event: string; properties: unknown }[],
  otherCalls: [] as string[],
};

jest.mock('mixpanel-react-native', () => ({
  Mixpanel: class {
    constructor(...args: unknown[]) {
      mockSdk.constructed.push(args);
    }
    async init(...args: unknown[]) {
      mockSdk.initArgs.push(args);
      mockSdk.inits++;
      await Promise.resolve();
      if (mockSdk.failNextInit) {
        mockSdk.failNextInit = false;
        throw new Error('init failed');
      }
    }
    track(event: string, properties: unknown) {
      if (mockSdk.throwOnTrack) throw new Error('track failed');
      mockSdk.tracked.push({ event, properties });
    }
    // Anything below being called is a privacy regression: see the tests at the bottom.
    identify() {
      mockSdk.otherCalls.push('identify');
    }
    getPeople() {
      mockSdk.otherCalls.push('getPeople');
      return { set: () => undefined };
    }
    setUseIpAddressForGeolocation() {
      mockSdk.otherCalls.push('setUseIpAddressForGeolocation');
    }
  },
}));

let mockToken: string | undefined = 'test-token';
jest.mock('./events', () => ({
  ...jest.requireActual<Record<string, unknown>>('./events'),
  get MIXPANEL_TOKEN() {
    return mockToken;
  },
}));

type Module = typeof import('./index');

/** A fresh copy of the service, so each test starts uninitialised. */
function load(): Module {
  let loaded: Module | undefined;
  jest.isolateModules(() => {
    loaded = require('./index') as Module;
  });
  return loaded!;
}

beforeEach(() => {
  mockToken = 'test-token';
  mockSdk.constructed = [];
  mockSdk.inits = 0;
  mockSdk.initArgs = [];
  mockSdk.failNextInit = false;
  mockSdk.throwOnTrack = false;
  mockSdk.tracked = [];
  mockSdk.otherCalls = [];
});

describe('analytics.track', () => {
  it('sends the event with automatic events off, so only the events in events.ts leave the device', async () => {
    const { analytics, ANALYTICS_EVENTS } = load();
    await analytics.track(ANALYTICS_EVENTS.MOSQUE_REPORT_SENT, { reason: 'stangd' });

    expect(mockSdk.constructed).toEqual([['test-token', false]]);
    expect(mockSdk.tracked).toEqual([{ event: 'Mosque Report Sent', properties: { reason: 'stangd' } }]);
  });

  it('sends to the EU endpoint, the only one the project\'s EU data residency accepts', async () => {
    // The SDK defaults to api.mixpanel.com (US). An EU-resident project drops those events,
    // and nothing on the device says so.
    const { analytics, ANALYTICS_EVENTS } = load();
    await analytics.track(ANALYTICS_EVENTS.INTRO_COMPLETED);
    expect(mockSdk.initArgs).toEqual([[false, {}, 'https://api-eu.mixpanel.com']]);
  });

  it('is a silent no-op without a token: a dev run never touches the native module', async () => {
    mockToken = undefined;
    const { analytics, ANALYTICS_EVENTS } = load();
    await expect(analytics.track(ANALYTICS_EVENTS.INTRO_COMPLETED)).resolves.toBeUndefined();
    expect(mockSdk.constructed).toEqual([]);
  });

  it('never rejects, whether init or track fails: analytics may not reach an error boundary', async () => {
    const { analytics, ANALYTICS_EVENTS } = load();
    mockSdk.failNextInit = true;
    await expect(analytics.track(ANALYTICS_EVENTS.INTRO_SKIPPED)).resolves.toBeUndefined();
    mockSdk.throwOnTrack = true;
    await expect(analytics.track(ANALYTICS_EVENTS.INTRO_SKIPPED)).resolves.toBeUndefined();
  });

  it('initialises once however many first events arrive together', async () => {
    // Regression: a flag set only after init() resolved let concurrent first calls each
    // construct and initialise their own client.
    const { analytics, ANALYTICS_EVENTS } = load();
    await Promise.all([
      analytics.track(ANALYTICS_EVENTS.SCREEN_VIEWED, { screen: 'bonetider' }),
      analytics.track(ANALYTICS_EVENTS.INTRO_COMPLETED),
      analytics.track(ANALYTICS_EVENTS.INTRO_SKIPPED),
    ]);
    expect(mockSdk.constructed).toHaveLength(1);
    expect(mockSdk.inits).toBe(1);
    expect(mockSdk.tracked).toHaveLength(3);
  });

  it('tries a failed initialisation again on the next event', async () => {
    const { analytics, ANALYTICS_EVENTS } = load();
    mockSdk.failNextInit = true;
    await analytics.track(ANALYTICS_EVENTS.INTRO_COMPLETED);
    await analytics.track(ANALYTICS_EVENTS.INTRO_COMPLETED);
    expect(mockSdk.inits).toBe(2);
    expect(mockSdk.tracked).toHaveLength(1);
  });

  it('identifies nobody and leaves geography to Mixpanel: no identify, no people profile, IP geolocation untouched', async () => {
    // The owner's decision: anonymous device ids only, and city-level geo derived by Mixpanel
    // from the IP. Calling identify/getPeople would attach a person; turning IP geolocation
    // off is a separate decision that belongs to the owner, not to a tidy-up.
    const { analytics, ANALYTICS_EVENTS } = load();
    await analytics.track(ANALYTICS_EVENTS.SCREEN_VIEWED, { screen: 'qibla' });
    expect(mockSdk.otherCalls).toEqual([]);
    expect(Object.keys(analytics)).toEqual(['track']);
  });
});

describe('screenName — the only screen identity Mixpanel receives', () => {
  it('is the route file path, from segments rather than the URL', () => {
    // Segments name route files. A URL or pathname can carry the values a route was opened
    // with, and on this app those can be coordinates, which must never leave the device.
    const { screenName } = load();
    expect(screenName(['bonetider'])).toBe('bonetider');
    expect(screenName(['(settings)', 'om'])).toBe('(settings)/om');
    expect(screenName([])).toBe('index');
  });
});
