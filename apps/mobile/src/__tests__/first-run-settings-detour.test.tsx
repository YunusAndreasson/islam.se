import { expect, it, jest } from '@jest/globals';
import { fireEvent, render, screen } from '@testing-library/react-native';
import { router } from 'expo-router';
import type { ReactNode } from 'react';

import Berakning from '@/app/(settings)/berakning';
import Installningar from '@/app/(settings)/installningar';
import Bonetider from '@/app/bonetider';
import { loadIntro } from '@/lib/intro';
import { IntroProvider } from '@/lib/intro-context';
import { LocationProvider } from '@/lib/location/context';
import { SettingsProvider } from '@/lib/settings/context';
import { storage } from '@/lib/storage';

// The cog used to bypass a failed progress write. The method change alone then looked like a store upgrade.
it('still offers the first reading after using the timetable settings cog during a failed progress write', async () => {
  const tree = (page: ReactNode) => (
    <SettingsProvider><IntroProvider><LocationProvider>{page}</LocationProvider></IntroProvider></SettingsProvider>
  );
  const app = await render(tree(<Bonetider />));
  const save = storage.setItem;
  const failed = jest.spyOn(storage, 'setItem').mockImplementation((key, value) =>
    key === 'introStep:v1' ? Promise.reject(new Error('disk busy')) : save(key, value));
  try {
    await fireEvent.press(screen.getByLabelText('Visa bönetiderna'));
    expect(screen.getByText('Det gick inte att spara. Försök igen.')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Inställningar'));
    expect(router.navigate).not.toHaveBeenCalled();
  } finally { failed.mockRestore(); }

  await fireEvent.press(screen.getByLabelText('Inställningar'));
  expect(router.navigate).toHaveBeenCalledWith('/installningar');
  await app.rerender(tree(<Installningar />));
  await fireEvent.press(screen.getByLabelText(/^Beräkning:/));
  expect(router.push).toHaveBeenCalledWith('/(settings)/berakning');
  await app.rerender(tree(<Berakning />));
  await fireEvent.press(screen.getByRole('radio', { name: /^Egyptiska myndigheten/ }));
  await app.unmount();
  expect(JSON.parse((await storage.getItem('prayerSettings:v1'))!).calculationMethod).toBe('Egyptian');
  expect(await loadIntro()).toMatchObject({ status: 'pending', history: null });
}, 30_000);
