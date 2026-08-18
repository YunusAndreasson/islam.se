// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const globals = require('globals');

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ['dist/*', 'android/*', 'ios/*', '.expo/*', 'expo-env.d.ts'],
  },

  // CommonJS config/setup files run in Node — give them `__dirname`, `module`,
  // `require`, `process`, etc. so they don't trip `no-undef`.
  {
    files: ['*.js', 'scripts/**/*.js'],
    languageOptions: {
      globals: { ...globals.node },
    },
  },

  // Jest globals for the setup file and test files — without this, `jest`,
  // `describe`, `expect`, etc. trip `no-undef` and turn the whole lint gate red.
  {
    files: ['jest.setup.js', '**/*.test.ts', '**/*.test.tsx', 'src/__tests__/**'],
    languageOptions: {
      globals: { ...globals.jest },
    },
  },

  // Type-aware bug-catching rules. These need a TypeScript program (a few extra
  // seconds, like `tsc`), so they are scoped to src/ where they earn their keep.
  // The expo config already wires up the @typescript-eslint plugin and parser;
  // we only add the project service + the rules that read type information.
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: __dirname,
      },
    },
    rules: {
      // Stale-closure-from-missing-deps is the #1 silent bug in this effect- and
      // Reanimated-heavy app. Expo ships this as a warning; promote it to an error
      // so a missed dependency blocks the lint gate instead of scrolling past.
      // (Currently clean — the few intentional exceptions carry inline disables.)
      'react-hooks/exhaustive-deps': 'error',
      // The headline win: catch fire-and-forget promises with no rejection path.
      // In this async-heavy app an unhandled rejection silently breaks the UI
      // (e.g. a failed settings hydrate would leave the app stuck loading).
      '@typescript-eslint/no-floating-promises': 'error',
      // Catch promises used where a non-promise is expected — e.g. an async
      // function passed as an onPress handler or used in an `if` condition.
      '@typescript-eslint/no-misused-promises': 'error',
      // `await` on a non-thenable is always a mistake.
      '@typescript-eslint/await-thenable': 'error',
      // Remove dead `as` casts that don't change the type (auto-fixable; can
      // also surface a real type mismatch hiding under the assertion).
      '@typescript-eslint/no-unnecessary-type-assertion': 'error',
      // A new PrayerKey, ThemePreference or NotificationSoundKey must be handled
      // everywhere it is switched on, not silently fall through to a default. The
      // unions here are small and long-lived, which is exactly when a missed arm goes
      // unnoticed — it renders nothing rather than crashing.
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      // `a + b` where one side is not a number: in a codebase where nearly every value
      // is an epoch millisecond, a minute offset or a degree, string concatenation
      // where arithmetic was meant produces a plausible-looking wrong answer.
      '@typescript-eslint/restrict-plus-operands': 'error',
      // `.sort()` with no comparator compares STRINGIFIED elements, so [2, 10] sorts to
      // [10, 2]. This app sorts prayer instants, timeline boundaries and place
      // distances; a lexicographic sort of epoch numbers is a silent reordering.
      '@typescript-eslint/require-array-sort-compare': 'error',
      // Catches an object reaching a template literal as "[object Object]". The strings
      // here are user-facing on a lock screen and in a widget, where a botched
      // interpolation ships to the device and is invisible in a unit test that only
      // checks the string is non-empty.
      '@typescript-eslint/no-base-to-string': 'error',
      // `delete arr[i]` leaves a HOLE rather than shortening the array — every later
      // index shifts nowhere and the read comes back undefined. Nearly always splice()
      // was meant.
      '@typescript-eslint/no-array-delete': 'error',
      // A `.catch(e => …)` parameter is `any` by default, which re-opens the hole
      // `useUnknownInCatchVariables` closes for `try`/`catch`.
      '@typescript-eslint/use-unknown-in-catch-callback-variable': 'error',
      // `string | 'fajr'` collapses to `string`: a union that has silently lost its
      // narrowing usually means a type moved and nobody noticed.
      '@typescript-eslint/no-redundant-type-constituents': 'error',
      '@typescript-eslint/no-duplicate-type-constituents': 'error',

      // DELIBERATELY NOT ENABLED — measured on this tree, and both would cost safety:
      //
      // '@typescript-eslint/no-unnecessary-condition' (21 hits). Nearly all of them are
      // defensive checks at the native boundary, which is exactly where this app's types
      // are known to lie: expo-location types `trueHeading` as a plain number when -1 is
      // a real runtime value (src/app/qibla.tsx), the widget layouts re-validate a
      // payload that arrives from UserDefaults as untyped JSON, and
      // notifications.ts's `ADHAN_SOUND_FILE !== null` is a build-time switch whose
      // `string | null` annotation exists so flipping it stays a one-line change. The
      // rule would have each of those deleted to satisfy a type that is not trustworthy.
      //
      // '@typescript-eslint/prefer-nullish-coalescing' (2 hits). In mosques/report.ts the
      // `||` is load-bearing: with noUncheckedIndexedAccess an unknown error code reads
      // as undefined AND an empty message should fall back to the generic text. `??`
      // would let an empty string through as if it were a message.
    },
  },
]);
