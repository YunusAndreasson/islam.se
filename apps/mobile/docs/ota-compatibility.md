# Native runtime compatibility

The app keeps Expo's `appVersion` policy. `pnpm runtime:check` compares both platforms
against committed native fingerprints in `native-runtimes.json`. Verification, release
preflight, and EAS's post-install hook run this guard. Publish OTA updates with
`pnpm update:ota --channel production --environment production --platform ios --message "…"`
(or the intended platform/channel); the wrapper checks compatibility before invoking EAS.
Direct `eas update` bypasses the local guard and must not be used.

When native dependencies, patches, plugins, or native configuration change:

1. Choose a new, unused app version in both `app.json` and `package.json`.
2. Run `pnpm runtime:record`, review and commit the resulting record with the native changes.
3. Run `pnpm verify`. Build and submit only when explicitly requested.
4. Publish updates for that runtime only after a matching native build exists.

Existing runtime records are immutable. `--record` refuses to replace a different hash
for an existing version. Runtime 1.2.0 is retired because its existing binaries do not
all contain the same native widget code. Pending native changes start at 1.2.1; existing
1.2.0 installations will need a new store/TestFlight build to receive these changes.

Fingerprinting reads source and configuration; it does not compile or launch the app.
