const { readFileSync } = require('node:fs');
const { dirname, join } = require('node:path');
const { build } = require('../../eas.json');
const { expo } = require('../../app.json');
const { scripts } = require('../../package.json');

// Store workers need the same destination as the Expo plugin. Development
// clients intentionally skip uploads. No credentials are needed to check this.
it.each(['preview', 'production'])('%s attempts symbol uploads without failing the build on upload errors', (profile) => {
  const plugin = expo.plugins.find((entry) => entry[0] === '@sentry/react-native/expo')[1];
  expect(build[profile].env).toMatchObject({
    SENTRY_ORG: plugin.organization, SENTRY_PROJECT: plugin.project, SENTRY_ALLOW_FAILURE: 'true',
  });
  expect(build[profile].env.SENTRY_DISABLE_AUTO_UPLOAD).not.toBe('true');
  expect(build.development.env.SENTRY_DISABLE_AUTO_UPLOAD).toBe('true');
  expect(plugin.experimental_android.enableAndroidGradlePlugin).toBe(true);
});

// Inspect the shipping entry point without running the publisher. Updates used
// to finish after EAS and leave the matching source maps on the publisher's disk.
it('wires the Sentry uploader after a successful OTA publication', () => {
  const [, entry] = scripts['update:ota'].split(' ');
  const wrapper = readFileSync(join(dirname(require.resolve('../../package.json')), entry), 'utf8');
  expect(wrapper).toMatch(/set -euo pipefail[\s\S]*node scripts\/check-runtime\.js[\s\S]*eas update "\$@"[\s\S]*pnpm exec sentry-expo-upload-sourcemaps "\$input_dir"/);
});
