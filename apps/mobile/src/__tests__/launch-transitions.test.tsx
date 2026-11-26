import { expect, it, jest } from '@jest/globals';
import { act, render } from '@testing-library/react-native';
import { Stack } from 'expo-router';
import type { ComponentProps, ReactElement } from 'react';

import RootLayout from '@/app/_layout';

jest.mock('expo-router', () => ({
  Stack: Object.assign(jest.fn(() => null), { Screen: () => null }),
  usePathname: () => '/qibla',
  useSegments: () => ['qibla'],
}));

type StackProps = ComponentProps<typeof Stack>;
type ScreenProps = ComponentProps<typeof Stack.Screen>;

function stackProps() {
  const call = jest.mocked(Stack).mock.lastCall;
  if (!call) throw new Error('The root stack did not render');
  return call[0];
}

function animationFor(name: string) {
  const { children, screenOptions } = stackProps();
  const options = (children as ReactElement<ScreenProps>[]).find((child) => child.props.name === name)?.props.options;
  if (typeof options === 'function' || typeof screenOptions === 'function') {
    throw new Error('Expected static screen options');
  }
  return options?.animation ?? screenOptions?.animation;
}

it('suppresses cold entrances and restores in-app animations after the focused screen appears', async () => {
  await render(<RootLayout />);
  const { screenListeners } = stackProps();
  if (typeof screenListeners !== 'function') throw new Error('Missing launch transition listener');

  // Native Stack reports appearance for the anchor as well as the linked route.
  type ListenerArgs = Parameters<Extract<NonNullable<StackProps['screenListeners']>, (...args: never[]) => unknown>>[0];
  const transitionEnd = (focused: boolean, closing: boolean) => {
    const listeners = screenListeners({ navigation: { isFocused: () => focused } } as ListenerArgs);
    listeners.transitionEnd?.({ type: 'transitionEnd', target: 'screen', data: { closing } });
  };

  expect(animationFor('qibla')).toBe('none');
  expect(animationFor('(settings)')).toBe('none');
  expect(animationFor('valkommen')).toBe('none');

  await act(() => {
    transitionEnd(false, false);
    transitionEnd(true, true);
  });
  expect(animationFor('qibla')).toBe('none');

  await act(() => transitionEnd(true, false));

  expect(animationFor('qibla')).toBe('default');
  expect(animationFor('(settings)')).toBe('default');
  expect(animationFor('valkommen')).toBe('fade');
  expect(animationFor('index')).toBe('none');
  expect(animationFor('bonetider')).toBe('none');
});
