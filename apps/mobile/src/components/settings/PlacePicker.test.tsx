// The picker's one non-obvious behaviour: it opens on the city you already chose.
//
// PLACES is sorted by population, so a user who picked anything outside the handful of
// biggest places had their selection — tinted row, check mark — rendered hundreds of rows
// below the fold. The state was drawn correctly and was simply unreachable: nothing on
// screen said where it was, and the list always opened on Stockholm. `initialScrollIndex`
// is what closes that, and it is only exact because getItemLayout gives the list a real
// row pitch to count in, so both belong to this one behaviour.
import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { PlacePicker } from './PlacePicker';
import { PLACES } from '@/lib/places/data';

// Deep enough into the population-sorted list that it can only be on screen because the
// list opened there — not because it happened to fall in the first window.
const DEEP = PLACES[300];

describe('PlacePicker', () => {
  it('opens on the already-chosen city instead of the top of the list', () => {
    render(
      <PlacePicker
        selected={{ name: DEEP.name, latitude: DEEP.lat, longitude: DEEP.lon }}
        onPick={jest.fn()}
      />,
    );

    expect(screen.getByText(DEEP.name)).toBeTruthy();
    // The tell that it really scrolled rather than merely rendering more rows: the top of
    // the list is outside the mounted window. If this ever starts passing with the chosen
    // city also absent, the assertion above is the one that still means something.
    expect(screen.queryByText(PLACES[0].name)).toBeNull();
  });

  it('opens at the top when nothing has been chosen yet', () => {
    render(<PlacePicker selected={null} onPick={jest.fn()} />);

    // The introduction renders this picker with no prior selection, so "no selection" must
    // stay the plain first-run list rather than an arbitrary scroll position.
    expect(screen.getByText(PLACES[0].name)).toBeTruthy();
  });
});
