import { describe, expect, it } from '@jest/globals';

import { DEFAULT_COORDS } from '../settings/types';
import { resolveLocation } from './resolve';

const GOTHENBURG = { name: 'Göteborg', latitude: 57.7089, longitude: 11.9746 };
const KIRUNA_FIX = { latitude: 67.8558, longitude: 20.2253 };

describe('resolveLocation', () => {
  it('manual mode uses the chosen location verbatim, labelled by its name', () => {
    const r = resolveLocation('manual', GOTHENBURG, null);
    expect(r.source).toBe('manual');
    expect(r.coords).toEqual({ latitude: GOTHENBURG.latitude, longitude: GOTHENBURG.longitude });
    expect(r.label).toBe('Göteborg');
    // The snapped tätort drives the map marker — always a real place from the dataset.
    expect(typeof r.place.name).toBe('string');
    expect(r.place.name.length).toBeGreaterThan(0);
  });

  it('manual mode with no saved city falls back to Stockholm (still manual source)', () => {
    const r = resolveLocation('manual', null, null);
    expect(r.source).toBe('manual');
    expect(r.coords).toEqual({
      latitude: DEFAULT_COORDS.latitude,
      longitude: DEFAULT_COORDS.longitude,
    });
    expect(r.label).toBe('Stockholm');
  });

  it('gps mode uses the raw fix for the maths but labels it by the nearest tätort', () => {
    const r = resolveLocation('gps', null, KIRUNA_FIX);
    expect(r.source).toBe('gps');
    // Raw precision is preserved (prayer times drift seconds per km) — NOT snapped.
    expect(r.coords).toEqual(KIRUNA_FIX);
    // Label is a human place name, not the bare coordinate.
    expect(r.label).toBe(r.place.name);
    expect(r.label.length).toBeGreaterThan(0);
  });

  it('gps mode with no fix yet renders Stockholm, flagged as the default standard', () => {
    const r = resolveLocation('gps', null, null);
    expect(r.source).toBe('default');
    expect(r.coords).toEqual({
      latitude: DEFAULT_COORDS.latitude,
      longitude: DEFAULT_COORDS.longitude,
    });
    // The "(standard)" suffix is what tells the user no real fix is in yet.
    expect(r.label).toBe('Stockholm (standard)');
  });

  it('manual location takes precedence over an available GPS fix', () => {
    // A saved manual city must win even when a GPS coordinate is also present —
    // otherwise switching to manual mode would be silently ignored by the widget.
    const r = resolveLocation('manual', GOTHENBURG, KIRUNA_FIX);
    expect(r.source).toBe('manual');
    expect(r.coords.latitude).toBe(GOTHENBURG.latitude);
  });
});
