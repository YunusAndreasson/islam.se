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
