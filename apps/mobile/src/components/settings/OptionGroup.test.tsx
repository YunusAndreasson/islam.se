import { describe, expect, it, jest } from '@jest/globals';
import { render, screen } from '@testing-library/react-native';

import { OptionGroup } from './OptionGroup';

describe('OptionGroup accessibility state', () => {
  it('exposes the chosen radio as checked and every other radio as unchecked', async () => {
    await render(
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

describe('OptionGroup standard tag', () => {
  it('tags the standard row even when the user has picked another', async () => {
    // The check marks the CURRENT value, so it cannot say which row is the default: an
    // install from before the default moved to Diyanet still has Muslim World League
    // saved, and the check on row two read as "the standard is row two".
    await render(
      <OptionGroup
        options={[
          { value: 'first', label: 'Första' },
          { value: 'second', label: 'Andra' },
        ] as const}
        value="second"
        standard="first"
        onChange={jest.fn()}
      />,
    );

    expect(screen.getAllByText('Standard')).toHaveLength(1);
    expect(screen.getByRole('radio', { name: 'Första (standard)' }).props.accessibilityState).toEqual({
      checked: false,
    });
    expect(screen.getByRole('radio', { name: 'Andra' }).props.accessibilityState).toEqual({
      checked: true,
    });
  });

  it('shows no tag when the caller names no standard', async () => {
    await render(
      <OptionGroup
        options={[{ value: 'only', label: 'Enda' }] as const}
        value="only"
        onChange={jest.fn()}
      />,
    );

    expect(screen.queryByText('Standard')).toBeNull();
  });
});

describe('OptionGroup spoken label', () => {
  it('keeps the tag and description from reading as more items of a comma-list label', async () => {
    // "Shafiʿi, Maliki, Hanbali, standard, Tidigare Asr" was heard as five items. The tag
    // is parenthesised and the description follows a full stop, so the list stays three.
    await render(
      <OptionGroup
        options={[{ value: 'shafi', label: 'Shafiʿi, Maliki, Hanbali', description: 'Tidigare Asr' }] as const}
        value="shafi"
        standard="shafi"
        onChange={jest.fn()}
      />,
    );

    expect(
      screen.getByRole('radio', { name: 'Shafiʿi, Maliki, Hanbali (standard). Tidigare Asr' }),
    ).toBeTruthy();
  });
});
