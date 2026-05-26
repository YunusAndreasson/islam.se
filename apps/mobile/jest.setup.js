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

// MapLibre is a native module with no JS implementation under test. Render its
// components as host elements so the Bönetider map screen (and its solar-field
// overlay: sources, layers, annotations) mounts in jsdom/node.
jest.mock('@maplibre/maplibre-react-native', () => ({
  Map: 'Map',
  Camera: 'Camera',
  GeoJSONSource: 'GeoJSONSource',
  Layer: 'Layer',
  ViewAnnotation: 'ViewAnnotation',
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
  getLastKnownPositionAsync: jest.fn(async () => null),
  getCurrentPositionAsync: jest.fn(async () => ({
    coords: { latitude: 59.3293, longitude: 18.0686 },
  })),
}));

// expo-glass-effect is iOS-only native (Liquid Glass). Under test, report it
// unavailable so GlassSurface takes its plain-View fallback path.
jest.mock('expo-glass-effect', () => {
  const { View } = require('react-native');
  return {
    GlassView: View,
    GlassContainer: View,
    isLiquidGlassAvailable: () => false,
    isGlassEffectAPIAvailable: () => false,
  };
});

// react-native-reanimated has no JS-thread implementation under test. Provide a
// minimal shim covering what the dock/menu use (Animated.View, shared values,
// animated styles, the with* helpers, runOnJS) so they render as host views.
jest.mock('react-native-reanimated', () => {
  const { View } = require('react-native');
  return {
    __esModule: true,
    default: { View, createAnimatedComponent: (Component) => Component },
    useSharedValue: (value) => ({ value }),
    useAnimatedStyle: () => ({}),
    withSpring: (value) => value,
    withTiming: (value) => value,
    runOnJS: (fn) => fn,
  };
});

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
