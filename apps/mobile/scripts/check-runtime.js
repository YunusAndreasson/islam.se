#!/usr/bin/env node
// Keep appVersion runtimes immutable once their native source has been recorded.
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const { createFingerprintAsync, DEFAULT_IGNORE_PATHS } = require('@expo/fingerprint');

const root = path.resolve(__dirname, '..');
const manifestPath = path.join(root, 'native-runtimes.json');

async function main() {
  const args = process.argv.slice(2);
  if (args.some((arg) => arg !== '--record')) throw new Error('Usage: check-runtime.js [--record]');
  const record = args.includes('--record');
  const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'))).expo;
  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
  if (app.runtimeVersion?.policy !== 'appVersion' || app.version !== pkg.version) {
    throw new Error('Expected matching app/package versions and the appVersion runtime policy.');
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  // These old binaries already share an incompatible runtime. Never reuse it.
  if (manifest.blocked.includes(app.version)) throw new Error(`Runtime ${app.version} is retired; bump the app version.`);
  const hashes = {};
  for (const platform of ['ios', 'android']) {
    // Resolve explicitly too: fingerprint 0.21 cannot consume expo-widgets' Android
    // Maven-only Gradle plugin (it expects every plugin to have a sourceDir).
    // Hash the complete resolved data so those native dependencies are still covered.
    const autolinkCli = path.join(path.dirname(require.resolve('expo-modules-autolinking/package.json')), 'bin/expo-modules-autolinking.js');
    const resolved = JSON.parse(execFileSync(process.execPath, [autolinkCli, 'resolve', '-p', platform === 'ios' ? 'apple' : 'android', '--json'], { cwd: root, encoding: 'utf8', timeout: 60_000 }));
    if (!Array.isArray(resolved.modules) || resolved.modules.length === 0) {
      throw new Error(`Incomplete ${platform} Expo native module discovery.`);
    }
    const resolvedContents = JSON.stringify(resolved).split(root).join('<project>');
    const fingerprint = await createFingerprintAsync(root, {
      platforms: [platform],
      // CNG output exists by eas-build-post-install. Its source is already
      // covered by app config, plugins, patches, and native dependency identities.
      // A plugin's unit test is not native source: counted, editing one would retire a
      // runtime that no binary ever changed for.
      ignorePaths: [...DEFAULT_IGNORE_PATHS, 'ios', 'ios/**', 'android', 'android/**', 'plugins/**/*.test.js'],
      // Include native patches and local plugin resources, plus all production
      // dependencies as a conservative guard on newly added native modules.
      extraSources: [
        { type: 'contents', id: 'resolvedExpoModules', contents: resolvedContents, reasons: ['resolved native module versions and configuration'] },
        { type: 'dir', filePath: 'patches', reasons: ['native patches'] },
        { type: 'dir', filePath: 'plugins', reasons: ['local native plugins'] },
        ...fs.readdirSync(path.join(root, 'src/widgets')).filter((name) => name.endsWith('.tsx') && !name.includes('.test.')).map((name) => ({ type: 'file', filePath: `src/widgets/${name}`, reasons: ['embedded widget layouts'] })),
        { type: 'contents', id: 'runtimeDependencies', contents: JSON.stringify(pkg.dependencies), reasons: ['runtime dependencies'] },
      ],
    });
    if (!fingerprint.sources.some((source) => source.id === `rncoreAutolinkingConfig:${platform}`)) {
      throw new Error(`Incomplete ${platform} native discovery; check the local Node/autolinking tools before recording or publishing.`);
    }
    hashes[platform] = fingerprint.hash;
  }
  const previous = manifest.runtimes[app.version];
  if (previous && (previous.ios !== hashes.ios || previous.android !== hashes.android)) {
    throw new Error(`Native source changed within runtime ${app.version}. Bump app.json and package.json to a NEW version, then run pnpm runtime:record. Never replace an existing runtime record.`);
  }
  if (!previous) {
    if (!record) throw new Error(`Unrecorded runtime ${app.version}. Run pnpm runtime:record and commit native-runtimes.json before building or publishing.`);
    manifest.runtimes[app.version] = hashes;
    fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  }
  console.log(`Native compatibility verified for runtime ${app.version} (iOS and Android).`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
