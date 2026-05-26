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
    },
  },
]);
