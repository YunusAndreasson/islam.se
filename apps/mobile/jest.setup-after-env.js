// Runs once the test framework is installed, which is what Reanimated's test setup needs:
// it registers its matchers (toHaveAnimatedStyle) on `expect` and drives animations off
// Jest's timers. Everything that only mocks modules stays in jest.setup.js.
require('react-native-reanimated').setUpTests();
