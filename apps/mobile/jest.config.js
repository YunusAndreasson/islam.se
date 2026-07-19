// Jest configuration for the mobile app. Lifted out of package.json once the coverage
// gate landed (the config outgrew a comfortable inline block) and so Stryker's jest-runner
// has a dedicated config file to point at. Preset + setup are unchanged from before.
/** @type {import('jest').Config} */
module.exports = {
  preset: 'jest-expo',
  setupFiles: ['<rootDir>/jest.setup.js'],
  // Coverage gates ONLY the pure, deterministic correctness core — the same modules
  // Stryker mutates. This is deliberate: these files are where a silent miscalculation
  // hides, and where 100%-meaningful coverage is achievable. IO/native/data glue
  // (useHeading, about link launchers, the giant nordicStyle literal, GPS/settings
  // context providers, generated place data) is intentionally NOT gated here — folding
  // it in would let untested native glue dilute the number and reward shallow coverage.
  // It's an explicit allow-list, not a wildcard, so adding a new pure module is a
  // conscious decision to hold it to this bar.
  collectCoverageFrom: [
    'src/lib/coordinates.ts',
    'src/lib/prayer-times.ts',
    'src/lib/hijri.ts',
    'src/lib/qibla.ts',
    'src/lib/places/nearest.ts',
    'src/lib/location/resolve.ts',
    'src/lib/settings/store.ts',
    'src/lib/settings/compute-signature.ts',
    'src/widget/payload.ts',
    'src/widget/timeline.ts',
    'src/lib/map/projection.ts',
    'src/lib/solar/sun.ts',
    'src/lib/solar/field.ts',
    'src/lib/solar/contour.ts',
    'src/lib/solar/palette.ts',
    'src/lib/solar/useSolarClock.ts',
  ],
  coverageThreshold: {
    // Calibrated just below the current measured coverage so the gate locks in what the
    // suite proves today and fails loudly on a regression — without being red on day one.
    // Raise these as coverage climbs; never lower them to make a red build pass.
    global: { branches: 90, functions: 97, lines: 97, statements: 95 },
  },
};
