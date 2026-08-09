import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { OptionGroup } from './OptionGroup';

describe('OptionGroup accessibility state', () => {
  it('exposes the chosen radio as checked and every other radio as unchecked', () => {
    render(
      <OptionGroup
        options={[
          { value: 'first', label: 'Första' },
          { value: 'second', label: 'Andra' },
        ] as const}
        value="second"
        onChange={jest.fn()}
      />,
    );

    expect(screen.getByRole('radio', { name: 'Första' }).props.accessibilityState).toEqual({
      checked: false,
    });
    expect(screen.getByRole('radio', { name: 'Andra' }).props.accessibilityState).toEqual({
      checked: true,
    });
  });
});
