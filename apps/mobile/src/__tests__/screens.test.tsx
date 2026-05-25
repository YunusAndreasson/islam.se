import { describe, expect, it } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import Bonetider from '../app/(tabs)/bonetider';
import Installningar from '../app/(tabs)/installningar';
import Om from '../app/(tabs)/om';

// Smoke tests: each tab screen mounts and shows its title. Cheap regression
// guard that the placeholder screens stay renderable as the app grows.
describe('tab placeholder screens', () => {
  it('renders the Bönetider map', () => {
    render(<Bonetider />);
    expect(screen.getByTestId('sweden-map')).toBeTruthy();
  });

  it('renders the Inställningar title', () => {
    render(<Installningar />);
    expect(screen.getByText('Inställningar')).toBeTruthy();
  });

  it('renders the Om title', () => {
    render(<Om />);
    expect(screen.getByText('Om')).toBeTruthy();
  });
});
