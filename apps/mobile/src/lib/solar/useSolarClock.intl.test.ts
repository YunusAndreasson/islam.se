// Hermes can ship without full ICU timezone data, in which case constructing a *zoned*
// Intl.DateTimeFormat throws. useSolarClock leans on that for every day-boundary
// computation — so on such a runtime it would throw inside a useState initializer and take
// the whole Bönetider map screen down with a white-screen crash. This pins that it degrades
// gracefully (to a UTC day) instead.
import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';

import { useSolarClock } from './useSolarClock';

describe('useSolarClock — survives a runtime without Intl timezone data', () => {
  const RealDTF = Intl.DateTimeFormat;

  beforeEach(() => {
    // Simulate missing ICU tz data: any zoned DateTimeFormat construction throws, exactly as
    // Hermes-without-full-ICU does. Un-zoned formatting still works.
    function ThrowingDTF(this: unknown, ...args: ConstructorParameters<typeof Intl.DateTimeFormat>) {
      if (args[1]?.timeZone) throw new RangeError('time zone "Europe/Stockholm" is not supported');
      return new RealDTF(...args);
    }
    (Intl as unknown as { DateTimeFormat: unknown }).DateTimeFormat = ThrowingDTF;
  });

  afterEach(() => {
    (Intl as unknown as { DateTimeFormat: unknown }).DateTimeFormat = RealDTF;
  });

  it('does not crash and returns a usable clock', () => {
    const { result } = renderHook(() => useSolarClock());
    const clock = result.current;
    expect(Number.isFinite(clock.now)).toBe(true);
    expect(Number.isFinite(clock.dayStart)).toBe(true);
    expect(clock.dayLength).toBeGreaterThan(0);
    expect(clock.fraction).toBeGreaterThanOrEqual(0);
    expect(clock.fraction).toBeLessThanOrEqual(1);
    // `now` sits within the day the slider spans — the invariant the scrubber relies on.
    expect(clock.now).toBeGreaterThanOrEqual(clock.dayStart);
    expect(clock.now).toBeLessThanOrEqual(clock.dayStart + clock.dayLength);
  });
});
