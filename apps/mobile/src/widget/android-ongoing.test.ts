import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { CustomNotificationOptions } from 'expo-widgets';

import type { PrayerActivityProps } from '@/widgets/PrayerLiveActivity';
import { applyOngoingPrayerNotification, resetOngoingNotificationForTests } from './android-ongoing';

const NOW = Date.parse('2026-10-17T17:00:00Z');
const props: PrayerActivityProps = {
  nextKey: 'isha', nextArabic: 'ʿIshāʾ', nextSwedish: 'Nattbönen', nextTime: '19:30',
  nextAtMs: NOW + 30 * 60_000, startedAtMs: NOW - 30 * 60_000, isMarker: false,
};
function fakeApi() {
  let active = false;
  const api = {
    get: jest.fn(async () => active ? {} as never : null),
    post: jest.fn(async (_props: PrayerActivityProps, _options?: CustomNotificationOptions) => {
      active = true;
      return {} as never;
    }),
    cancelAll: jest.fn(async () => { active = false; }),
  };
  return api;
}
beforeEach(resetOngoingNotificationForTests);

describe('Android ongoing prayer notification reconciliation', () => {
  it('posts a quiet ongoing notification with a native timeout at the prayer', async () => {
    const api = fakeApi();
    await applyOngoingPrayerNotification(api, props, () => NOW);
    expect(api.post).toHaveBeenCalledWith(props, expect.objectContaining({
      id: 'prayer-upcoming', channelId: 'prayer-upcoming-v1', ongoing: true,
      alertOnlyOnce: true, timeoutAfter: 30 * 60_000,
    }));
  });
  it('does not re-post unchanged content on each foreground tick', async () => {
    const api = fakeApi();
    await applyOngoingPrayerNotification(api, props, () => NOW);
    await applyOngoingPrayerNotification(api, { ...props }, () => NOW + 60_000);
    expect(api.post).toHaveBeenCalledTimes(1);
  });
  it('removes the notification when disabled, outside the window or expired', async () => {
    const api = fakeApi();
    await applyOngoingPrayerNotification(api, props, () => NOW);
    await applyOngoingPrayerNotification(api, null, () => NOW);
    await applyOngoingPrayerNotification(api, props, () => props.nextAtMs);
    expect(api.cancelAll).toHaveBeenCalledTimes(2);
    expect(api.post).toHaveBeenCalledTimes(1);
  });
  it('checks expiry again after the asynchronous native lookup', async () => {
    const api = fakeApi();
    let now = NOW;
    api.get.mockImplementation(async () => { now = props.nextAtMs; return null; });
    await applyOngoingPrayerNotification(api, props, () => now);
    expect(api.post).not.toHaveBeenCalled();
    expect(api.cancelAll).toHaveBeenCalledTimes(1);
  });
  it('serialises an overlapping post and cancellation', async () => {
    const api = fakeApi();
    const posting = applyOngoingPrayerNotification(api, props, () => NOW);
    const canceling = applyOngoingPrayerNotification(api, null, () => NOW);
    await Promise.all([posting, canceling]);
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.cancelAll).toHaveBeenCalledTimes(1);
    expect(await api.get()).toBeNull();
  });
  it('recovers after a failed native post', async () => {
    const api = fakeApi();
    api.post.mockRejectedValueOnce(new Error('temporarily unavailable'));
    await expect(applyOngoingPrayerNotification(api, props, () => NOW)).rejects.toThrow();
    await applyOngoingPrayerNotification(api, props, () => NOW);
    expect(api.post).toHaveBeenCalledTimes(2);
  });
  it('re-posts if the OS has removed the previous notification', async () => {
    const api = fakeApi();
    await applyOngoingPrayerNotification(api, props, () => NOW);
    api.get.mockResolvedValueOnce(null);
    await applyOngoingPrayerNotification(api, props, () => NOW + 60_000);
    expect(api.post).toHaveBeenCalledTimes(2);
  });
});
