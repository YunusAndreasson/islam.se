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
jest.mock('expo-router', () => ({
  useIsFocused: () => true,
  useFocusEffect: (callback) => {
    const React = require('react');
    React.useEffect(callback, [callback]);
  },
  router: { navigate: jest.fn(), push: jest.fn(), back: jest.fn() },
}));

// MapLibre is a native module with no JS implementation under test. Render its
// components as host elements so the Bönetider map screen (and its solar-field
// overlay: sources, layers, annotations) mounts in jsdom/node.
jest.mock('@maplibre/maplibre-react-native', () => ({
  Map: 'Map',
  Camera: 'Camera',
  GeoJSONSource: 'GeoJSONSource',
  Layer: 'Layer',
  ViewAnnotation: 'ViewAnnotation',
  Marker: 'Marker',
}));

// AsyncStorage's official in-memory jest mock — lets the settings store/context
// round-trip without the native module.
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

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
  return { BlurView: View };
});

// react-native-reanimated has no JS-thread implementation under test. Provide a
// minimal shim covering what the dock/menu/disclosure-group + Skia overlay use
// (Animated.View & Animated.Text, shared/derived values, animated styles, the with*
// helpers, runOnJS, useReducedMotion) so they render as host views. useDerivedValue
// runs its worklet once so the Skia overlay's projected paths/uniforms compute.
jest.mock('react-native-reanimated', () => {
  const { View, Text } = require('react-native');
  return {
    __esModule: true,
    default: { View, Text, createAnimatedComponent: (Component) => Component },
    useSharedValue: (value) => ({ value }),
    useDerivedValue: (fn) => ({ value: fn() }),
    useAnimatedStyle: () => ({}),
    useReducedMotion: () => false,
    withSpring: (value) => value,
    withTiming: (value) => value,
    runOnJS: (fn) => fn,
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
  };
});

// @shopify/react-native-skia is a native graphics module with no JS-thread renderer
// under test. Render the Canvas + container nodes as host views (so the Bönetider
// overlay mounts and its hooks run) and the leaf draw nodes as null; stub the Skia
// factory so path projection / texture upload don't reach native during a render.
jest.mock('@shopify/react-native-skia', () => {
  const React = require('react');
  const { View } = require('react-native');
  const container = ({ children }) => React.createElement(View, null, children ?? null);
  const none = () => null;
  const stubPath = () => ({ moveTo: () => {}, lineTo: () => {}, close: () => {} });
  const stubBuilder = () => {
    const b = { detach: () => ({}), build: () => ({}) };
    for (const m of ['moveTo', 'lineTo', 'quadTo', 'cubicTo', 'close']) b[m] = () => b;
    return b;
  };
  return {
    Canvas: container,
    Group: container,
    Fill: container,
    Shader: container,
    ImageShader: none,
    Path: none,
    Circle: none,
    BlurMask: none,
    Blur: none,
    Skia: {
      RuntimeEffect: { Make: () => null },
      Data: { fromBytes: () => ({}) },
      Image: { MakeImage: () => null },
      Path: { Make: stubPath },
      PathBuilder: { Make: stubBuilder },
    },
    ColorType: { RGBA_8888: 4 },
    AlphaType: { Unpremul: 3 },
    FilterMode: { Nearest: 0, Linear: 1 },
    MipmapMode: { None: 0 },
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
  ImpactFeedbackStyle: { Light: 'light', Medium: 'medium', Heavy: 'heavy', Rigid: 'rigid', Soft: 'soft' },
  NotificationFeedbackType: { Success: 'success', Warning: 'warning', Error: 'error' },
}));

// expo-notifications is native. Mock the surface src/lib/notifications uses so the
// module (which sets a handler at import time) loads, and screens that pull in its
// constants render. Default: permission granted, scheduling is a resolved no-op.
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true, status: 'granted' })),
  requestPermissionsAsync: jest.fn(async () => ({ granted: true, status: 'granted' })),
  setNotificationChannelAsync: jest.fn(async () => null),
  setNotificationCategoryAsync: jest.fn(async (identifier, actions, options) => ({ identifier, actions, options })),
  scheduleNotificationAsync: jest.fn(async () => 'id'),
  cancelAllScheduledNotificationsAsync: jest.fn(async () => {}),
  SchedulableTriggerInputTypes: { DATE: 'date' },
  AndroidImportance: { HIGH: 4, DEFAULT: 3 },
}));

// react-native-gesture-handler: render the root + detector as pass-throughs and
// give Gesture builders chainable no-op methods so PrayerDock's gestures build.
jest.mock('react-native-gesture-handler', () => {
  const { View } = require('react-native');
  const chainable = () => {
    const gesture = {};
    const methods = [
      'onStart', 'onUpdate', 'onEnd', 'onBegin', 'onFinalize', 'enabled',
      'activeOffsetX', 'activeOffsetY', 'failOffsetX', 'failOffsetY', 'minDistance',
      'shouldCancelWhenOutside', 'hitSlop', 'simultaneousWithExternalGesture',
    ];
    for (const m of methods) gesture[m] = () => gesture;
    return gesture;
  };
  return {
    GestureHandlerRootView: View,
    GestureDetector: ({ children }) => children,
    Gesture: {
      Pan: chainable,
      Tap: chainable,
      LongPress: chainable,
      Native: chainable,
      Exclusive: (...gestures) => gestures[0],
      Race: (...gestures) => gestures[0],
      Simultaneous: (...gestures) => gestures[0],
    },
  };
});

// Pin fast-check to a fixed seed so the *.props.test.ts suites are deterministic across
// runs: a fixed seed still explores `numRuns` inputs, just reproducibly — which keeps the
// branch-coverage gate stable (the property tests contribute real coverage) and makes any
// failure reproducible from the logged seed. Raising numRuns above the default 100 widens
// the sweep without sacrificing that reproducibility.
require('fast-check').configureGlobal({ seed: 0x15_1a_b5, numRuns: 200 });
