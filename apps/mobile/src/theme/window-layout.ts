import { useWindowDimensions } from 'react-native';

const COLUMN_WIDTH = 600;

// The map stays edge-to-edge. Its controls and the instrument/settings text
// stop growing when the window can fit a full reading column and its gutters.
export function useReadingColumn() {
  const { width } = useWindowDimensions();
  return width > COLUMN_WIDTH ? column : undefined;
}

const column = { width: '100%', maxWidth: COLUMN_WIDTH, alignSelf: 'center' } as const;

export function useCardInsets(gutter: number) {
  const { width } = useWindowDimensions();
  const inset = Math.max(gutter, (width - COLUMN_WIDTH) / 2);
  return { left: inset, right: inset };
}
