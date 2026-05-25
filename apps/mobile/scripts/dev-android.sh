#!/usr/bin/env bash
#
# Expo Android dev flow (`expo run:android`): boots the emulator, builds the dev
# client, installs it, and starts Metro — all from `pnpm android`.
#
# Two machine-specific fixes are baked in:
#   1. JDK is pinned to 17. The `java` on PATH here is newer (26) and breaks AGP.
#   2. The AVD is auto-selected by name. `expo run:android --device` wants an
#      *AVD name* (e.g. "pixel"), not an adb serial.
set -euo pipefail

# 1. Pin JDK 17 for the Gradle/AGP build.
java_is_17() { [ -n "${1:-}" ] && [ -x "$1/bin/java" ] && "$1/bin/java" -version 2>&1 | grep -q 'version "17'; }
if ! java_is_17 "${JAVA_HOME:-}"; then
  for cand in \
    /usr/lib/jvm/java-17-openjdk \
    /usr/lib/jvm/java-17-openjdk-amd64 \
    /usr/lib/jvm/temurin-17-jdk \
    "${HOME}/.sdkman/candidates/java/17"*; do
    if java_is_17 "$cand"; then export JAVA_HOME="$cand"; break; fi
  done
fi
if ! java_is_17 "${JAVA_HOME:-}"; then
  echo "error: JDK 17 not found. Install it or set JAVA_HOME to a JDK 17 path." >&2
  exit 1
fi
echo "▸ JAVA_HOME=${JAVA_HOME}"

SDK="${ANDROID_HOME:-${ANDROID_SDK_ROOT:-$HOME/Android/Sdk}}"
ADB="${SDK}/platform-tools/adb"
EMULATOR="${SDK}/emulator/emulator"

# 2. If no device is connected, hand expo an AVD name so it boots one.
device_args=()
if "$ADB" devices | awk 'NR>1 && $2=="device"{found=1} END{exit !found}'; then
  echo "▸ using already-connected device"
else
  avd="$("$EMULATOR" -list-avds | head -n1)"
  if [ -z "$avd" ]; then
    echo "error: no running device and no AVD to boot. Create one in Android Studio." >&2
    exit 1
  fi
  echo "▸ no device connected — booting AVD: ${avd}"
  device_args=(--device "$avd")
fi

# 3. Hand off to Expo. --no-install: dependencies are managed by pnpm.
exec npx expo run:android --no-install "${device_args[@]}" "$@"
