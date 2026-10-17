// Replace react-native-safe-area-context with a tiny shim so screens that use
// SafeAreaView render in jsdom/node without the native module (which has no
// JS implementation under test). Covers only what the placeholder screens use.
jest.mock('react-native-safe-area-context', () => {
  const React = require('react');
  const { View } = require('react-native');
  const insets = { top: 0, bottom: 0, left: 0, right: 0 };
  return {
    SafeAreaProvider: ({ children }) => React.createElement(React.Fragment, null, children),
    SafeAreaView: View,
    useSafeAreaInsets: () => insets,
    SafeAreaInsetsContext: React.createContext(insets),
  };
});

// expo-router: the map screen reads useIsFocused() to pause its clock off-screen, and
// the nav controls (MapNav / CompassButton) import `router` to open sheets on press.
// The screen tests render without a navigator, so report focused and stub router's
// navigation methods. useFocusEffect runs as a normal React effect so focused-screen
// behavior (Qibla heading setup/cleanup) is still exercised under test.
// useLocalSearchParams returns {} by default — the correction screen reads ?id= from it,
// so its tests override the mock to name a mosque.
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  useFocusEffect: (callback) => {
    const React = require('react');
    React.useEffect(callback, [callback]);
  },
  useLocalSearchParams: jest.fn(() => ({})),
  // Returns the disablePrevention function, as the real hook does.
  usePreventRemove: jest.fn(() => jest.fn()),
  router: { dismissTo: jest.fn(), setParams: jest.fn(), navigate: jest.fn(), push: jest.fn(), back: jest.fn(), replace: jest.fn(), canGoBack: jest.fn(() => true) },
}));

// MapLibre is a native module with no JS implementation under test. Render its
// components as host elements so the Bönetider map screen (and its solar-field
// overlay: sources, layers, annotations) mounts in jsdom/node.
jest.mock('@maplibre/maplibre-react-native', () => ({
  Map: 'Map',
  // Still a host 'Camera' element (screens.test finds it by that type), but with the
  // imperative API behind its ref, so a test can see what the screen asked the camera to
  // do. Each mounted Camera gets fresh spies; the latest is `Camera.__last`.
  Camera: (() => {
    const React = require('react');
    const Camera = React.forwardRef(function MockCamera(props, ref) {
      const api = React.useMemo(
        () => ({
          easeTo: jest.fn(),
          jumpTo: jest.fn(),
          flyTo: jest.fn(),
          fitBounds: jest.fn(),
          zoomTo: jest.fn(),
          setStop: jest.fn(),
        }),
        [],
      );
      React.useImperativeHandle(ref, () => api, [api]);
      Camera.__last = api;
      return React.createElement('Camera', props);
    });
    return Camera;
  })(),
  GeoJSONSource: (() => {
    const React = require('react');
    return React.forwardRef(function MockGeoJSONSource(props, ref) {
      const api = React.useMemo(() => ({
        setFeatureState: jest.fn(async () => {}),
        removeFeatureState: jest.fn(async () => {}),
      }), []);
      React.useImperativeHandle(ref, () => api, [api]);
      return React.createElement('GeoJSONSource', props);
    });
  })(),
  Layer: 'Layer',
  Images: 'Images',
  ViewAnnotation: 'ViewAnnotation',
  Marker: 'Marker',
  // The basemap cache cap (lib/map/offline) — the map screen sets it on mount.
  OfflineManager: {
    setMaximumAmbientCacheSize: jest.fn(async () => {}),
  },
  // The native log stream (lib/map/map-diagnostics watches it for failed tiles, which is the
  // only channel that sees a basemap whose tiles are not arriving). `onLog` stores the
  // handler so a test can drive it: `LogManager.__emit({ level, tag, message })`.
  LogManager: {
    __handler: () => false,
    onLog(handler) {
      this.__handler = handler;
    },
    __emit(log) {
      this.__handler(log);
    },
    setLogLevel: jest.fn(),
    start: jest.fn(),
    stop: jest.fn(),
  },
}));

// AsyncStorage's official in-memory jest mock — lets the settings store/context
// round-trip without the native module.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

// expo-sqlite/kv-store is the store lib/storage.ts actually writes to, and it is mocked
// onto the SAME object as AsyncStorage above — deliberately, not as a shortcut.
//
// On a device the two are separate databases and lib/storage.ts migrates between them.
// Under test there is one store, which is the state the migration produces and the one
// every assertion here is written against: a suite that seeds a key with
// `AsyncStorage.setItem` and then renders a screen must see the screen read it back, and
// a suite that injects a storage failure with `jest.mocked(AsyncStorage.multiGet)` must
// see the code under test hit that failure. Two stores would silently break both, since
// production reads kv-store first.
//
// The migration path itself therefore needs its own test with the two mocked APART —
// see lib/storage.test.ts, which is the only place the fallback is actually exercised.
jest.mock('expo-sqlite/kv-store', () => {
  const shared = require('@react-native-async-storage/async-storage/jest/async-storage-mock');
  return { __esModule: true, default: shared, Storage: shared, AsyncStorage: shared };
});

// expo-localization is native. Report Europe/Stockholm, which is both the app's default
// and what every existing calendar assertion is written against — a suite that wants to be
// somewhere else calls setDisplayZone directly rather than re-mocking this.
jest.mock('expo-localization', () => ({
  getCalendars: jest.fn(() => [{ timeZone: 'Europe/Stockholm' }]),
}));

// expo-location is native; mock the foreground-permission + position calls the
// LocationProvider uses. Default: permission granted, a fixed Stockholm fix.
jest.mock('expo-location', () => ({
  LocationAccuracy: { Balanced: 3 },
  requestForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true })),
  getForegroundPermissionsAsync: jest.fn(async () => ({ status: 'granted', granted: true })),
  // The compass button subscribes to the heading; under test return a no-op
  // subscription that never emits, so the button stays on its static-glyph fallback.
  watchHeadingAsync: jest.fn(async () => ({ remove: jest.fn() })),
  getLastKnownPositionAsync: jest.fn(async () => null),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: 59.3293, longitude: 18.0686 },
  })),
}));

// expo-glass-effect is iOS-only native (Liquid Glass). Under test, report it
// unavailable so GlassSurface takes its BlurView branch (also mocked below).
jest.mock('expo-glass-effect', () => {
  const { View } = require('react-native');
  return {
    GlassView: View,
    GlassContainer: View,
    isLiquidGlassAvailable: () => false,
    isGlassEffectAPIAvailable: () => false,
  };
});

// expo-blur is native too — under test, render BlurView as a plain host View so
// GlassSurface's non-Liquid-Glass branch produces something testable without any
// async native bridge work.
jest.mock('expo-blur', () => {
  const { View } = require('react-native');
  return { BlurView: View, BlurTargetView: View };
});

// react-native-reanimated has no JS-thread implementation under test. Provide a
// minimal shim covering what the dock/menu/disclosure-group + Skia overlay use
// (Animated.View & Animated.Text, shared/derived values, animated styles, the with*
// helpers, useReducedMotion) so they render as host views. useDerivedValue runs its
// worklet once so the Skia overlay's projected paths/uniforms compute. The worklet→JS
// bridge (scheduleOnRN) is mocked separately below, from react-native-worklets.
jest.mock('react-native-reanimated', () => {
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: { View, Text, createAnimatedComponent: (Component) => Component },
    // Stable across renders, the way a real shared value is. It used to return a fresh
    // object every render, which quietly broke every hook that lists one in its deps: the
    // Qibla screen's heading callback was recreated on each render, so its focus effect
    // tore down and re-subscribed the magnetometer three times per mount under test, and a
    // state update landed by one subscription was wiped by the next one's cleanup.
    useSharedValue: (value) => {
      const React = require('react');
      const ref = React.useRef(null);
      if (ref.current === null) ref.current = {
        value,
        get() { return this.value; },
        set(next) { this.value = typeof next === 'function' ? next(this.value) : next; },
      };
      return ref.current;
    },
    // get() as well as .value: the app reads every shared value through get() (the React
    // Compiler-safe accessor), and a derived value without it would throw on first read.
    useDerivedValue: (fn) => {
      const value = fn();
      return { value, get: () => value };
    },
    useAnimatedStyle: () => ({}),
    // No UI thread under test, so the reaction never fires — matches reanimated's own
    // jest mock (NOOP). The daybreak line-replay it drives is exercised on-device.
    useAnimatedReaction: () => {},
    useReducedMotion: () => false,
    // The per-animation reduce-motion switch (the map's clock glide and the wash's holes
    // opt OUT of the system setting with it). Values as reanimated spells them.
    ReduceMotion: { System: 'system', Always: 'always', Never: 'never' },
    withSpring: (value) => value,
    withTiming: (value) => value,
    cancelAnimation: () => {},
    withRepeat: (value) => value,
    withDelay: (_delay, value) => value,
    withSequence: (...values) => values[values.length - 1],
    // Easing combinators only need to be callables returning callables under test —
    // the with* shims above ignore easing entirely.
    Easing: (() => {
      const id = (t) => t;
      const wrap = (f) => f ?? id;
      return {
        linear: id,
        ease: id,
        quad: id,
        cubic: id,
        sin: id,
        exp: id,
        in: wrap,
        out: wrap,
        inOut: wrap,
        bezier: () => id,
      };
    })(),
    // The dock drives its reveals through interpolate()/Extrapolation; provide a real
    // piecewise-linear implementation so module eval + render don't throw under test.
    interpolate: (x, input, output) => {
      if (x <= input[0]) return output[0];
      const last = input.length - 1;
      if (x >= input[last]) return output[last];
      for (let i = 1; i <= last; i++) {
        if (x <= input[i]) {
          const t = (x - input[i - 1]) / (input[i] - input[i - 1]);
          return output[i - 1] + t * (output[i] - output[i - 1]);
        }
      }
      return output[last];
    },
    Extrapolation: { CLAMP: 'clamp', EXTEND: 'extend', IDENTITY: 'identity' },
    // Layout-animation builders (MosqueCard's FadeIn/OutDown, NotificationHint's
    // FadeIn/OutUp). Reanimated's real builders are chainable classes; under test the
    // Animated.View shim ignores entering/exiting entirely, so all these need to do is
    // survive the chained .duration()/.delay()/.springify() calls without throwing.
    ...(() => {
      const chainable = () => {
        const builder = {};
        for (const m of ['duration', 'delay', 'springify', 'easing', 'withInitialValues']) {
          builder[m] = () => builder;
        }
        return builder;
      };
      const builders = {};
      for (const dir of ['Up', 'Down', 'Left', 'Right']) {
        builders[`FadeIn${dir}`] = chainable();
        builders[`FadeOut${dir}`] = chainable();
        builders[`SlideIn${dir}`] = chainable();
        builders[`SlideOut${dir}`] = chainable();
      }
      builders.FadeIn = chainable();
      builders.FadeOut = chainable();
      return builders;
    })(),
  };
});

// Reanimated 4 moved the worklet→JS bridge into react-native-worklets: `scheduleOnRN`
// replaces the deprecated `runOnJS`. Under test there's one JS thread, so scheduling
// on "RN" just means invoking the function with its args synchronously — the same shim
// the old `runOnJS: (fn) => fn` provided, updated for the new (fn, ...args) signature.
jest.mock('react-native-worklets', () => ({
  __esModule: true,
  scheduleOnRN: (fn, ...args) => fn(...args),
}));

// react-native-skia is a native graphics module with no JS-thread renderer
// under test. Render the Canvas + container nodes as host views (so the Bönetider
// overlay mounts and its hooks run) and the leaf draw nodes as null; stub the Skia
// factory so path projection / texture upload don't reach native during a render.
jest.mock('react-native-skia', () => {
  const React = require('react');
  const { View } = require('react-native');
  const container = ({ children }) => React.createElement(View, null, children ?? null);
  const none = () => null;
  const stubBuilder = () => {
    const b = { detach: () => ({}), build: () => ({}) };
    for (const m of ['moveTo', 'lineTo', 'quadTo', 'cubicTo', 'close', 'addArc', 'arcToOval', 'addCircle', 'addPath']) {
      b[m] = () => b;
    }
    return b;
  };
  // This object must cover EVERY Skia symbol the overlay imports, including ones only
  // reached on a seasonal branch. `vec` is the cautionary tale: it is CALLED inline in
  // the polar-boundary JSX, so while it was missing here, any date where polarBoundaryFor
  // returns a boundary (every winter, from about mid-November) would have thrown "vec is
  // not a function" — a suite that passes in August and fails in December.
  // SolarSkiaOverlay.test.tsx now renders that branch explicitly. Add the stub when you
  // add the import, not when the test finally reaches it.
  return {
    Canvas: container,
    Group: container,
    Fill: container,
    Shader: container,
    Path: none,
    Circle: none,
    BlurMask: none,
    LinearGradient: none,
    DashPathEffect: none,
    vec: (x, y) => ({ x, y }),
    Skia: {
      RuntimeEffect: { Make: () => null },
      PathBuilder: { Make: stubBuilder },
      Matrix: () => {
        const m = { translate: () => m, scale: () => m };
        return m;
      },
      // Static shape factories (Skia.Path.Circle and friends) are the current API for
      // whole shapes — the builder is for paths assembled segment by segment. The intro's
      // progress mark uses Circle for its base disc and its completed ring.
      Path: { Circle: () => ({}) },
      XYWHRect: (x, y, width, height) => ({ x, y, width, height }),
    },
  };
});

// expo-linear-gradient is a native module; render it as a plain host View so screens
// that use it for a gradient hero/face (Om, Qibla) mount in jsdom/node.
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native');
  return { LinearGradient: View };
});

// @expo/vector-icons loads its glyph font asynchronously and flips an internal "font
// loaded" state after mount. Under test that fires as an update outside act(...) (Om uses
// MaterialIcons), which clutters output and would fail a CI that treats console.error as
// an error. Render every icon set as a static host element so there is no async font load.
jest.mock('@expo/vector-icons', () => {
  const { Text } = require('react-native');
  return new Proxy(
    {},
    { get: () => (props) => require('react').createElement(Text, props, props.name) },
  );
});
jest.mock('@expo/vector-icons/MaterialIcons', () => {
  const { Text } = require('react-native');
  return (props) => require('react').createElement(Text, props, props.name);
});
jest.mock('@expo/vector-icons/MaterialCommunityIcons', () => {
  const { Text } = require('react-native');
  return (props) => require('react').createElement(Text, props, props.name);
});

// expo-web-browser + expo-mail-composer are native (Om's Kontakt actions). Mock the
// surface the screen calls: the in-app browser opens as a resolved no-op, and the
// mail composer reports available so the compose path (not the mailto fallback) runs.
jest.mock('expo-web-browser', () => ({
  openBrowserAsync: jest.fn(async () => ({ type: 'opened' })),
}));
jest.mock('expo-mail-composer', () => ({
  isAvailableAsync: jest.fn(async () => true),
  composeAsync: jest.fn(async () => ({ status: 'sent' })),
}));
// The native splash screen (src/lib/splash). `preventAutoHideAsync` and `setOptions` fire at
// module scope on import — the API's own requirement, since a call from inside a component
// arrives after the splash has already auto-hidden — so they must exist before any tree that
// reaches SplashGate renders. `hide` is what the gate's test asserts on.
jest.mock('expo-splash-screen', () => ({
  preventAutoHideAsync: jest.fn(async () => true),
  setOptions: jest.fn(),
  hide: jest.fn(),
  hideAsync: jest.fn(async () => undefined),
}));
// The mosque correction form (src/app/moske-rattelse) is the app's ONLY outbound request.
// Default it to a successful submission so screens that merely render the form don't hit
// the network; tests that care about a specific response override global.fetch themselves.
//
// ⚠️ Deliberately NOT polyfilling AbortSignal.timeout here. Node has it and React Native
// does not (RN swaps the global for the `abort-controller` package, which ships no static
// timeout()), so a polyfill would make the suite greener than the device — which is
// exactly how the first version of submitMosqueReport shipped a call that would have
// thrown TypeError on every submission and been reported to the user as "no connection".
// If a test ever fails on a missing AbortSignal member, fix the source, not this file.
global.fetch = jest.fn(async () => ({
  ok: true,
  status: 200,
  json: async () => ({ ok: true, id: 1 }),
}));

// expo-store-review is native (Om's "Betygsätt appen" row). Report an in-place
// review action available so the requestReview path runs under test.
jest.mock('expo-store-review', () => ({
  hasAction: jest.fn(async () => true),
  requestReview: jest.fn(async () => {}),
  // storeUrl is synchronous in expo-store-review (returns string | null).
  storeUrl: jest.fn(() => 'https://play.google.com/store/apps/details?id=se.islam.mobile'),
}));

// expo-haptics is a native taptic module with no JS-thread implementation under
// test. The dock fires haptics through src/lib/haptics; stub the calls as no-op
// resolved promises so those one-liners don't reach native during a render.
jest.mock('expo-haptics', () => ({
  selectionAsync: jest.fn(async () => {}),
  impactAsync: jest.fn(async () => {}),
  notificationAsync: jest.fn(async () => {}),
  // The Android path (src/lib/haptics on Platform.OS === 'android') routes to the semantic
  // haptic engine instead of the Vibrator; stub it and mirror the AndroidHaptics enum values.
  performAndroidHapticsAsync: jest.fn(async () => {}),
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Rigid: 'rigid', Soft: 'soft' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
  AndroidHaptics: {
    Confirm: 'confirm',
    Reject: 'reject',
    Gesture_Start: 'gesture-start',
    Gesture_End: 'gesture-end',
    Toggle_On: 'toggle-on',
    Toggle_Off: 'toggle-off',
    Clock_Tick: 'clock-tick',
    Context_Click: 'context-click',
    Drag_Start: 'drag-start',
    Keyboard_Tap: 'keyboard-tap',
    Keyboard_Press: 'keyboard-press',
    Keyboard_Release: 'keyboard-release',
    Long_Press: 'long-press',
    Virtual_Key: 'virtual-key',
    Virtual_Key_Release: 'virtual-key-release',
    No_Haptics: 'no-haptics',
    Segment_Tick: 'segment-tick',
    Segment_Frequent_Tick: 'segment-frequent-tick',
    Text_Handle_Move: 'text-handle-move',
  },
}));

// expo-audio is native. A player that reports "not playing" and records the calls made to
// it, so the preview's own logic — start from the beginning, stop if already sounding, do
// nothing at all when the build carries no adhan — is testable without an audio device or
// an audio file. lib/adhan-audio.test.ts drives it.
jest.mock('expo-audio', () => {
  const player = {
    playing: false,
    play: jest.fn(),
    pause: jest.fn(),
    seekTo: jest.fn(async () => {}),
    remove: jest.fn(),
  };
  return {
    __player: player,
    useAudioPlayer: jest.fn(() => player),
    useAudioPlayerStatus: jest.fn(() => ({ playing: player.playing, isLoaded: true })),
    createAudioPlayer: jest.fn(() => player),
    setAudioModeAsync: jest.fn(async () => {}),
  };
});

// @expo/ui renders real SwiftUI / Jetpack Compose views, which do not exist under jest.
// The mock keeps the SHAPE — a row of selectable segments, each showing its label, each
// pressable — so a test can still read and drive the control the way a reader does. It
// deliberately does not try to imitate the platform's own look or animation; those are
// exactly the things there is no point asserting off-device.
//
// Only the pieces components/settings/SegmentedChoice uses are mocked. Anything else
// reaching for @expo/ui should fail loudly here rather than silently render nothing —
// the widgets (src/widgets) are never mounted in a test, they are serialised as JSX.
jest.mock('@expo/ui/swift-ui', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  return {
    // The Host forwards `colorScheme` as a testID so a test can assert which scheme the
    // native surface was told to paint in. Not decoration: left unset, real SwiftUI and
    // Compose read the PHONE's appearance rather than the app's Utseende override, and the
    // unselected labels drop to 2.5:1 on the app's own paper. See SegmentedChoice.
    Host: ({ children, style, colorScheme }) =>
      React.createElement(View, { style, testID: `host-${colorScheme ?? 'unset'}` }, children),
    // A SwiftUI Picker's options are its children, each tagged with its value; the mock
    // reads that tag back off the modifier so pressing a segment selects the right thing.
    Picker: ({ children, selection, onSelectionChange }) =>
      React.createElement(
        View,
        { accessibilityRole: 'radiogroup' },
        React.Children.map(children, (child) => {
          const value = child?.props?.modifiers?.find((m) => m?.$type === 'tag')?.value;
          return React.createElement(
            Pressable,
            {
              accessibilityRole: 'radio',
              accessibilityState: { selected: value === selection },
              onPress: () => onSelectionChange?.(value),
            },
            React.createElement(Text, null, child?.props?.children),
          );
        }),
      ),
    Text: ({ children }) => React.createElement(Text, null, children),
  };
});

jest.mock('@expo/ui/swift-ui/modifiers', () => ({
  pickerStyle: (style) => ({ $type: 'pickerStyle', style }),
  tag: (value) => ({ $type: 'tag', value }),
}));

jest.mock('@expo/ui/jetpack-compose', () => {
  const React = require('react');
  const { Pressable, Text, View } = require('react-native');
  const SegmentedButton = ({ children, selected, onClick }) =>
    React.createElement(
      Pressable,
      { accessibilityRole: 'radio', accessibilityState: { selected }, onPress: onClick },
      children,
    );
  // ⚠️ Label PASSES ITS CHILDREN THROUGH rather than wrapping them in a <Text>, and that is
  // the whole point of it. Compose's Label is a SLOT: handed a bare string it renders
  // nothing and React Native logs "Text strings must be rendered within a <Text>
  // component", which on a device looks like a segmented control with three blank segments.
  // That shipped once, because the earlier mock helpfully wrapped the string and the test
  // went green. A mock that is kinder than the platform is a mock that hides the bug.
  SegmentedButton.Label = ({ children }) => children;
  return {
    Host: ({ children, style, colorScheme }) =>
      React.createElement(View, { style, testID: `host-${colorScheme ?? 'unset'}` }, children),
    SingleChoiceSegmentedButtonRow: ({ children }) =>
      React.createElement(View, { accessibilityRole: 'radiogroup' }, children),
    SegmentedButton,
    Text: ({ children }) => React.createElement(Text, null, children),
  };
});

// expo-network is native. Default: online — the state every existing test was written in,
// and the one in which the map notice and the report form behave exactly as before. A suite
// that wants the offline path says so by overriding these two.
jest.mock('expo-network', () => ({
  useNetworkState: jest.fn(() => ({ isConnected: true, isInternetReachable: true })),
  getNetworkStateAsync: jest.fn(async () => ({ isConnected: true, isInternetReachable: true })),
  addNetworkStateListener: jest.fn(() => ({ remove: jest.fn() })),
}));

// expo-keep-awake is native; the Qibla screen holds the display on while you align.
jest.mock('expo-keep-awake', () => ({
  useKeepAwake: jest.fn(),
  activateKeepAwakeAsync: jest.fn(async () => {}),
  deactivateKeepAwake: jest.fn(),
}));

// expo-navigation-bar / expo-system-ui are native and mounted by the root layout. The
// navigation bar is a no-op component on iOS in the real library too, so a null render is
// the faithful mock rather than a convenience.
jest.mock('expo-navigation-bar', () => ({
  NavigationBar: () => null,
  setStyle: jest.fn(),
}));

jest.mock('expo-system-ui', () => ({
  setBackgroundColorAsync: jest.fn(async () => {}),
  getBackgroundColorAsync: jest.fn(async () => null),
}));

// expo-application and expo-intent-launcher are native. The first supplies the installed
// binary's version to the Om colophon and the mosque report; the second is how the Android
// notification-channel and battery-optimisation hand-offs leave the app.
jest.mock('expo-application', () => ({
  applicationId: 'se.islam.mobile',
  applicationName: 'islam.se',
  nativeApplicationVersion: '1.0.8',
  nativeBuildVersion: '20',
  getAppleStoreEnvironmentAsync: jest.fn(async () => null),
}));

jest.mock('expo-intent-launcher', () => ({
  startActivityAsync: jest.fn(async () => ({ resultCode: -1 })),
  ActivityAction: {
    APP_NOTIFICATION_SETTINGS: 'android.settings.APP_NOTIFICATION_SETTINGS',
    IGNORE_BATTERY_OPTIMIZATION_SETTINGS: 'android.settings.IGNORE_BATTERY_OPTIMIZATION_SETTINGS',
  },
}));

// expo-task-manager / expo-background-task are native. The refresh task registers itself
// at module scope (see src/lib/notification-refresh), so `defineTask` has to exist as soon
// as anything imports that module — including the root layout, which every screen test
// mounts. Capturing the executor here is also how notification-refresh.test.ts gets hold of
// the function the OS would call.
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(async () => true),
  unregisterTaskAsync: jest.fn(async () => {}),
}));

jest.mock('expo-background-task', () => ({
  getStatusAsync: jest.fn(async () => 2),
  registerTaskAsync: jest.fn(async () => {}),
  unregisterTaskAsync: jest.fn(async () => {}),
  BackgroundTaskStatus: { Restricted: 1, Available: 2 },
  BackgroundTaskResult: { Success: 1, Failed: 2 },
}));

// @sentry/react-native is native, and src/lib/sentry calls `init` at module scope. The mock
// keeps the real SDK and its bridge out of every suite: sentry.test.ts asserts on the options
// object that module hands to `init`, error-boundary.test.tsx on `captureException`.
jest.mock('@sentry/react-native', () => {
  const React = require('react');
  const captureException = jest.fn();
  return {
    init: jest.fn(),
    captureException,
    // The SDK's documented contract, as a stand-in: report the boundary's error once per
    // error object, and render the fallback it wraps.
    wrapExpoRouterErrorBoundary: jest.fn((Fallback) => {
      const reported = new WeakSet();
      return function SentryErrorBoundary(props) {
        React.useEffect(() => {
          if (reported.has(props.error)) return;
          reported.add(props.error);
          captureException(props.error);
        }, [props.error]);
        return React.createElement(Fallback, props);
      };
    }),
    turboModuleContextIntegration: jest.fn(() => ({ name: 'TurboModuleContext' })),
  };
});

// expo-notifications is native. Mock the surface src/lib/notifications uses so the
// module (which sets a handler at import time) loads, and screens that pull in its
// constants render. Default: permission granted, scheduling is a resolved no-op.
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  // Android's exact-alarm permission (expo-notifications 58.1.1). Granted by default, as it
  // is on every Android 13+ install of an app declaring USE_EXACT_ALARM.
  getExactAlarmPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted', canAskAgain: true, expires: 'never' })),
  requestExactAlarmPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted', canAskAgain: true, expires: 'never' })),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true, status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  setNotificationChannelAsync: jest.fn(async () => null),
  // A sound choice is an Android channel (a channel's sound is immutable), so the
  // scheduler creates one channel per available sound inside a group, and deletes the
  // pre-v2 'prayers' channel. Without these two the module throws at first channel
  // setup and every notification test fails opaquely.
  setNotificationChannelGroupAsync: jest.fn(async () => null),
  deleteNotificationChannelAsync: jest.fn(async () => null),
  setNotificationCategoryAsync: jest.fn(async (identifier, actions, options) => ({ identifier, actions, options })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
  cancelScheduledNotificationAsync: jest.fn(async () => {}),
  // The scheduler sweeps the OS's pending list for its own tagged alerts, so a lost
  // id list can't leave orphans that double every prayer. Default: nothing pending.
  getAllScheduledNotificationsAsync: jest.fn(async () => []),
  // Notification taps are routed to Bönetider (src/lib/notification-routing).
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  // expo-notifications' real values (HIGH used to be mocked as 4, the real LOW).
  AndroidImportance: { HIGH: 6, DEFAULT: 5, LOW: 4 },
  // Mirrors expo-notifications' real enum values. src/lib/notifications treats
  // PROVISIONAL as allowed (iOS reports granted:false for the quiet tier), so this
  // must be present or that check reads a property off undefined.
  IosAuthorizationStatus: {
    NOT_DETERMINED: 0,
    DENIED: 1,
    AUTHORIZED: 2,
    PROVISIONAL: 3,
    EPHEMERAL: 4,
  },
}));

// react-native-gesture-handler: render the root + detector as pass-throughs, and have the
// v3 gesture hooks hand back their config, so PrayerDock's gestures build and a test can
// reach a callback through `gesture.config` if it needs one.
jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  const single = (type) => (config) => ({ type, config });
  const composed = (type) => (...gestures) => ({ type, gestures });
  return {
    GestureHandlerRootView: View,
    GestureDetector: ({ children }) => children,
    usePanGesture: single('pan'),
    useTapGesture: single('tap'),
    useLongPressGesture: single('longPress'),
    useNativeGesture: single('native'),
    useExclusiveGestures: composed('exclusive'),
    useCompetingGestures: composed('competing'),
    useSimultaneousGestures: composed('simultaneous'),
  };
});

// Pin fast-check to a fixed seed so the *.props.test.ts suites are deterministic across
// runs: a fixed seed still explores `numRuns` inputs, just reproducibly — which keeps the
// branch-coverage gate stable (the property tests contribute real coverage) and makes any
// failure reproducible from the logged seed. Raising numRuns above the default 100 widens
// the sweep without sacrificing that reproducibility.
require('fast-check').configureGlobal({ seed: 0x15_1a_b5, numRuns: 200 });
