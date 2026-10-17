import { afterEach, beforeEach, expect, it } from '@jest/globals';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let root: string;
const version = '1.2.1';
const hashes = { ios: 'native-ios', android: 'native-android' };
function json(path: string, value: unknown) {
  writeFileSync(join(root, path), JSON.stringify(value));
}
function record(runtimes: Record<string, typeof hashes>, blocked: string[] = []) {
  json('native-runtimes.json', { blocked, runtimes });
}
function run(...args: string[]) {
  return spawnSync(process.execPath, [join(root, 'scripts/check-runtime.js'), ...args], { encoding: 'utf8' });
}
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'runtime-gate-'));
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'src/widgets'), { recursive: true });
  copyFileSync(join(__dirname, '../../scripts/check-runtime.js'), join(root, 'scripts/check-runtime.js'));
  mkdirSync(join(root, 'node_modules/@expo/fingerprint'), { recursive: true });
  writeFileSync(join(root, 'node_modules/@expo/fingerprint/index.js'),
    `exports.DEFAULT_IGNORE_PATHS = [];
    exports.createFingerprintAsync = async (_, options) => ({
      hash: 'native-' + options.platforms[0],
      sources: [
        { id: 'rncoreAutolinkingConfig:' + options.platforms[0], reasons: [] },
        { reasons: [options.platforms[0] === 'ios' ? 'expoAutolinkingIos' : 'expoAutolinkingAndroid'] }
      ]
    });`);
  mkdirSync(join(root, 'node_modules/expo-modules-autolinking/bin'), { recursive: true });
  json('node_modules/expo-modules-autolinking/package.json', { name: 'expo-modules-autolinking' });
  writeFileSync(join(root, 'node_modules/expo-modules-autolinking/bin/expo-modules-autolinking.js'), 'console.log(JSON.stringify({ modules: [{ packageName: "expo", packageVersion: "58" }] }));');
  json('app.json', { expo: { version, runtimeVersion: { policy: 'appVersion' } } });
  json('package.json', { version, dependencies: {} });
  record({ [version]: hashes });
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

it('accepts unchanged native source', () => expect(run().status).toBe(0));
it('refuses a native change on either platform, even when recording', () => {
  for (const platform of ['ios', 'android'] as const) {
    record({ [version]: { ...hashes, [platform]: 'old-native-code' } });
    for (const args of [[], ['--record']]) {
      const result = run(...args);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain('NEW version');
    }
  }
});
it('requires deliberate recording of a new runtime', () => {
  record({});
  expect(run().status).toBe(1);
  expect(run('--record').status).toBe(0);
  expect(run().status).toBe(0);
});
it('refuses retired runtimes even if their hashes match', () => {
  record({ [version]: hashes }, [version]);
  expect(run('--record').stderr).toContain('retired');
});
it('rejects inconsistent app versions and runtime policies', () => {
  json('package.json', { version: '1.2.0', dependencies: {} });
  expect(run().status).toBe(1);
  json('package.json', { version, dependencies: {} });
  json('app.json', { expo: { version, runtimeVersion: { policy: 'fingerprint' } } });
  expect(run().status).toBe(1);
});

it('refuses an incomplete fingerprint instead of recording missing native modules', () => {
  writeFileSync(join(root, 'node_modules/@expo/fingerprint/index.js'),
    'exports.DEFAULT_IGNORE_PATHS = []; exports.createFingerprintAsync = async () => ({ hash: "partial", sources: [] });');
  record({});
  expect(run('--record').stderr).toContain('Incomplete');
});
