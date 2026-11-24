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
  // Super properties as the SDK received them, in order: ['always' | 'once', properties].
  registered: [] as ['always' | 'once', Record<string, unknown>][],
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
    async hasOptedOutTracking() { return false; }
    async getDistinctId() { return 'anonymous'; }
    track(event: string, properties: unknown) {
      if (mockSdk.throwOnTrack) throw new Error('track failed');
      mockSdk.tracked.push({ event, properties });
    }
    registerSuperProperties(properties: Record<string, unknown>) {
      mockSdk.registered.push(['always', properties]);
    }
    registerSuperPropertiesOnce(properties: Record<string, unknown>) {
      mockSdk.registered.push(['once', properties]);
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
  mockSdk.registered = [];
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
    await analytics.track(ANALYTICS_EVENTS.APP_OPENED, { launch: 'cold' });
    expect(mockSdk.initArgs).toEqual([[false, {}, 'https://api-eu.mixpanel.com']]);
  });

  it('is a silent no-op without a token: a dev run never touches the native module', async () => {
    mockToken = undefined;
    const { analytics, ANALYTICS_EVENTS } = load();
    await expect(analytics.track(ANALYTICS_EVENTS.APP_OPENED, { launch: 'cold' })).resolves.toBeUndefined();
    expect(mockSdk.constructed).toEqual([]);
  });

  it('never rejects, whether init or track fails: analytics may not reach an error boundary', async () => {
    const { analytics, ANALYTICS_EVENTS } = load();
    mockSdk.failNextInit = true;
    await expect(analytics.track(ANALYTICS_EVENTS.QIBLA_ALIGNED)).resolves.toBeUndefined();
    mockSdk.throwOnTrack = true;
    await expect(analytics.track(ANALYTICS_EVENTS.QIBLA_ALIGNED)).resolves.toBeUndefined();
  });

  it('initialises once however many first events arrive together', async () => {
    // Regression: a flag set only after init() resolved let concurrent first calls each
    // construct and initialise their own client.
    const { analytics, ANALYTICS_EVENTS } = load();
    await Promise.all([
      analytics.track(ANALYTICS_EVENTS.SCREEN_VIEWED, { screen: 'bonetider' }),
      analytics.track(ANALYTICS_EVENTS.APP_OPENED, { launch: 'cold' }),
      analytics.track(ANALYTICS_EVENTS.QIBLA_ALIGNED),
    ]);
    expect(mockSdk.constructed).toHaveLength(1);
    expect(mockSdk.inits).toBe(1);
    expect(mockSdk.tracked).toHaveLength(3);
  });

  it('tries a failed initialisation again on the next event', async () => {
    const { analytics, ANALYTICS_EVENTS } = load();
    mockSdk.failNextInit = true;
    await analytics.track(ANALYTICS_EVENTS.APP_OPENED, { launch: 'cold' });
    await analytics.track(ANALYTICS_EVENTS.APP_OPENED, { launch: 'cold' });
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
    // The whole surface. register/registerOnce set super properties, which are typed to the
    // coarse states in events.ts; anything else added here is a new kind of thing leaving
    // the device, and belongs to the owner and the privacy policy first.
    expect(Object.keys(analytics)).toEqual(['track', 'register', 'registerOnce']);
  });
});

describe('super properties', () => {
  it('never constructs the client on their own: a background wake-up that only registers sends nothing', async () => {
    // The app registers state on launch, and an iOS background launch mounts the root. A
    // register that initialised Mixpanel would wake the SDK (and its network flush) for a
    // launch nobody saw.
    const { analytics } = load();
    analytics.register({ notifications_enabled: true });
    analytics.registerOnce({ install_date: '2026-05-28' });
    await Promise.resolve();
    expect(mockSdk.constructed).toEqual([]);
  });

  it('hands what was registered before the first event to the client before that event is sent', async () => {
    const { analytics, ANALYTICS_EVENTS } = load();
    analytics.registerOnce({ install_date: '2026-05-28', install_kind: 'existing' });
    analytics.register({ notifications_enabled: false, location_source: 'default' });
    await analytics.track(ANALYTICS_EVENTS.APP_OPENED, { launch: 'cold' });
    expect(mockSdk.registered).toEqual([
      ['once', { install_date: '2026-05-28', install_kind: 'existing' }],
      ['always', { notifications_enabled: false, location_source: 'default' }],
    ]);
    expect(mockSdk.tracked).toHaveLength(1);
  });

  it('passes later registrations straight through, and drops values that are not known yet', async () => {
    const { analytics, ANALYTICS_EVENTS } = load();
    await analytics.track(ANALYTICS_EVENTS.APP_OPENED, { launch: 'cold' });
    // An undefined value means "not known yet" (install_kind before First Open has decided),
    // never "clear it": registering it would overwrite a value Mixpanel already holds.
    analytics.register({ reminders_per_day: 5, intro_status: undefined });
    analytics.registerOnce({ install_kind: undefined });
    expect(mockSdk.registered).toEqual([['always', { reminders_per_day: 5 }]]);
  });

  it('keeps register-once meaning before the client exists: the first value is the one applied', async () => {
    const { analytics, ANALYTICS_EVENTS } = load();
    analytics.registerOnce({ install_kind: 'new' });
    analytics.registerOnce({ install_kind: 'existing' });
    await analytics.track(ANALYTICS_EVENTS.APP_OPENED, { launch: 'cold' });
    expect(mockSdk.registered).toEqual([['once', { install_kind: 'new' }]]);
  });

  it('never throws, even when the SDK does', async () => {
    const { analytics, ANALYTICS_EVENTS } = load();
    await analytics.track(ANALYTICS_EVENTS.APP_OPENED, { launch: 'cold' });
    mockSdk.registered = null as never;
    expect(() => analytics.register({ adhan_sound: true })).not.toThrow();
    expect(() => analytics.registerOnce({ install_date: '2026-05-28' })).not.toThrow();
  });
});

describe('afterAppOpen — the open is the first event of a launch', () => {
  it('runs at once when nothing holds it, so a screen tested on its own still reports', () => {
    const { afterAppOpen } = load();
    const ran: string[] = [];
    afterAppOpen(() => ran.push('step'));
    expect(ran).toEqual(['step']);
  });

  it('holds until the open is released, in order, and drops what was cancelled meanwhile', () => {
    // Regression the gate exists for: an intro step's view was sent in the same frame as the
    // launch, before App Opened / First Open, and a funnel starting at First Open lost the
    // user at its first step. A screen left before the open (index → bonetider) must not
    // be sent at all.
    const { afterAppOpen, holdForAppOpen, releaseAppOpen } = load();
    const ran: string[] = [];
    holdForAppOpen();
    const cancelIndex = afterAppOpen(() => ran.push('index'));
    afterAppOpen(() => ran.push('bonetider'));
    afterAppOpen(() => ran.push('welcome'));
    cancelIndex();
    expect(ran).toEqual([]);
    releaseAppOpen();
    expect(ran).toEqual(['bonetider', 'welcome']);
    afterAppOpen(() => ran.push('qibla'));
    expect(ran).toEqual(['bonetider', 'welcome', 'qibla']);
  });

  it('lets one failing callback not stop the others', () => {
    const { afterAppOpen, holdForAppOpen, releaseAppOpen } = load();
    const ran: string[] = [];
    holdForAppOpen();
    afterAppOpen(() => {
      throw new Error('boom');
    });
    afterAppOpen(() => ran.push('after'));
    expect(() => releaseAppOpen()).not.toThrow();
    expect(ran).toEqual(['after']);
  });
});

describe('screenName — the only screen identity Mixpanel receives', () => {
  it('is the route file path, from segments rather than the URL', () => {
    // Segments name route files. A URL or pathname can carry the values a route was opened
    // with, and on this app those can be coordinates, which must never leave the device.
    const { screenName } = load();
    expect(screenName(['bonetider'])).toBe('bonetider');
    expect(screenName(['(settings)', 'om'])).toBe('(settings)/om');
  });

  it('is null for "/", which only redirects and is never a screen anyone saw', () => {
    // Regression: "/" was sent as `index`, so every cold launch reported two screens, index
    // and then bonetider, and the opening screen looked as popular as the map.
    const { screenName } = load();
    expect(screenName([])).toBeNull();
  });
});

it('retains an event until the existing EU tracking endpoint acknowledges its insert ID', async () => {
  const { enqueueSetupEvent, ANALYTICS_EVENTS } = load();
  const args = [ANALYTICS_EVENTS.FIRST_OPEN, { install_kind: 'new' }] as const;
  const transport = jest.spyOn(globalThis, 'fetch');
  try {
    transport.mockRejectedValueOnce(new Error('offline'));
    expect(await enqueueSetupEvent([...args], 'one', 1000)).toBe(false);
    transport.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 0 }) } as Response);
    expect(await enqueueSetupEvent([...args], 'one', 1000)).toBe(false);
    transport.mockResolvedValueOnce({ ok: true, json: async () => ({ status: 1 }) } as Response);
    expect(await enqueueSetupEvent([...args], 'one', 1000)).toBe(true);
    expect(JSON.parse(transport.mock.calls.at(-1)?.[1]?.body as string)[0].properties).toMatchObject({ distinct_id: 'anonymous', $insert_id: 'one', setup_observed_at: 1 });
  } finally { transport.mockRestore(); }
});
