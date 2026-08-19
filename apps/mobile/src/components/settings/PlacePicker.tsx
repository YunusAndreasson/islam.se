// Browse / search every Swedish tätort (~2,100 places from the bundled
// GeoNames-derived dataset).
//
// Lifted out of (settings)/byt-plats so the introduction can offer "Välj stad i stället"
// inline, on a step, without a router push — the wizard owns its own navigation and a
// picker that pops a route would escape it. The route is now a thin shell around this
// component; both callers get the same search, the same sorting and the same haptic.
//
// Search is normalised so "alm" finds "Älmhult" and "umea" finds "Umeå": the å/ä/ö →
// a/a/o fold + lower-case happens on both query and place name before comparison. The
// list is sorted by population descending so the recognisable big places sit at the top
// when the user just scrolls.
import { MaterialIcons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import {
  FlatList,
  type ListRenderItemInfo,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useSettingsColors, type SettingsColors } from '@/components/settings/theme';
import { hapticSelection } from '@/lib/haptics';
import { PLACES, type SwedishPlace } from '@/lib/places/data';
import type { NamedLocation } from '@/lib/settings/types';
import { radius, space, type } from '@/theme/tokens';

/** Lower-case + strip combining marks so å/ä/ö match a/a/o for search. */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

const NUMBER_FMT = new Intl.NumberFormat('sv-SE');
const SEARCH_PLACES = PLACES.map((place) => ({
  place,
  searchText: `${fold(place.name)} ${fold(place.county)}`,
}));

// Fixed list-row metric — must be a constant for FlatList getItemLayout below
// (not a spacing token). Holds the row at a comfortable two-line height.
const ROW_HEIGHT = 64;
// The real vertical pitch between rows: each row also renders a `space.xs`
// ItemSeparatorComponent beneath it. getItemLayout must measure from pitch, not
// ROW_HEIGHT, or offsets drift by space.xs·index and the list mis-scrolls / mis-
// positions the selected city deep in the 2,100-place list.
const ROW_PITCH = ROW_HEIGHT + space.xs;

const keyFor = (p: { name: string; latitude: number; longitude: number }): string =>
  `${p.name}|${p.latitude}|${p.longitude}`;

interface Props {
  /** The place currently stored as `manualLocation`, so its row shows a check. */
  selected: NamedLocation | null;
  /** A place was tapped. The selection haptic has already fired. */
  onPick: (place: SwedishPlace) => void;
}

export function PlacePicker({ selected, onPick }: Props) {
  const colors = useSettingsColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [query, setQuery] = useState('');

  const selectedKey = selected ? keyFor(selected) : null;

  // The 2,100 places are sorted by population descending in data.ts. The
  // filter is a linear pass + fold-compare — at this size that's well under
  // a frame even on a low-end device, no virtualised index needed.
  const results = useMemo(() => {
    const q = fold(query.trim());
    if (!q) return PLACES;
    return SEARCH_PLACES.filter((entry) => entry.searchText.includes(q)).map((entry) => entry.place);
  }, [query]);

  // Open on the city that is already chosen. The list is population-sorted, so anyone who
  // did not pick one of the handful of biggest places had their selection rendered — tinted
  // row, check mark — hundreds of rows below the fold, with nothing on screen to say so or
  // to say where. Read only at mount by FlatList, which is the right lifetime: once the
  // user types, the results are theirs to scroll and re-anchoring would fight them.
  // Exact because getItemLayout above gives the list a real pitch to count in.
  const initialIndex = useMemo(() => {
    if (!selectedKey) return undefined;
    const i = PLACES.findIndex(
      (p) => keyFor({ name: p.name, latitude: p.lat, longitude: p.lon }) === selectedKey,
    );
    return i >= 0 ? i : undefined;
  }, [selectedKey]);

  const renderItem = ({ item }: ListRenderItemInfo<SwedishPlace>): React.ReactElement => {
    const isSelected =
      keyFor({ name: item.name, latitude: item.lat, longitude: item.lon }) === selectedKey;
    return (
      <Pressable
        onPress={() => {
          // A discrete selection change (same class as OptionGroup) — buzz on the tap,
          // before the caller navigates or writes.
          hapticSelection();
          onPick(item);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${item.name}, ${item.county}`}
        style={({ pressed }) => [
          styles.row,
          isSelected && styles.rowSelected,
          pressed && styles.rowPressed,
        ]}
      >
        <View style={styles.rowText}>
          <Text style={[styles.rowName, isSelected && styles.rowNameSelected]}>{item.name}</Text>
          <Text style={styles.rowMeta}>
            {item.county ? `${item.county} · ` : ''}
            {/* NBSP keeps the count and its unit together on one line. */}
            {`${NUMBER_FMT.format(item.population)} inv.`}
          </Text>
        </View>
        {isSelected ? <MaterialIcons name="check" size={20} color={colors.highlightText} /> : null}
      </Pressable>
    );
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.searchWrap}>
        <MaterialIcons name="search" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          placeholder="Sök stad eller län"
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          value={query}
          onChangeText={setQuery}
          returnKeyType="search"
          accessibilityLabel="Sök stad"
        />
        {query ? (
          <Pressable
            onPress={() => setQuery('')}
            // 18 pt of glyph: the slop is the whole target. The role was the one missing
            // from any Pressable in the app — an icon-only control announced as plain text.
            hitSlop={14}
            accessibilityRole="button"
            accessibilityLabel="Rensa sökning"
          >
            <MaterialIcons name="close" size={18} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      <Text style={styles.count}>
        {results.length === PLACES.length
          ? `${NUMBER_FMT.format(PLACES.length)} platser i Sverige`
          : `${NUMBER_FMT.format(results.length)} ${results.length === 1 ? 'träff' : 'träffar'}`}
      </Text>
      <FlatList
        data={results}
        keyExtractor={(p) => `${p.name}|${p.lat}|${p.lon}`}
        renderItem={renderItem}
        getItemLayout={(_, index) => ({ length: ROW_PITCH, offset: ROW_PITCH * index, index })}
        initialScrollIndex={initialIndex}
        initialNumToRender={20}
        windowSize={11}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={() => (
          <Text style={styles.empty}>Ingen träff. Försök med en annan stavning.</Text>
        )}
      />
    </View>
  );
}

function makeStyles(colors: SettingsColors) {
  return StyleSheet.create({
    wrap: { flex: 1 },
    searchWrap: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.sm,
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      paddingHorizontal: space.md,
      paddingVertical: space.sm,
      marginBottom: space.sm,
    },
    searchInput: { flex: 1, ...type.body, color: colors.text, padding: 0 },
    count: { ...type.caption, color: colors.textMuted, marginBottom: space.sm, paddingHorizontal: space.xs },
    listContent: { paddingBottom: space.xxl },
    row: {
      height: ROW_HEIGHT,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
      paddingHorizontal: space.lg,
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    rowSelected: { backgroundColor: colors.highlightSoft, borderColor: colors.highlightText },
    rowPressed: { backgroundColor: colors.accentSoft },
    rowText: { flex: 1 },
    rowName: { ...type.body, color: colors.text },
    rowNameSelected: { color: colors.highlightText, fontWeight: '600' },
    rowMeta: { ...type.caption, color: colors.textMuted, marginTop: 2 }, // optical nudge
    separator: { height: space.xs },
    empty: { color: colors.textMuted, textAlign: 'center', paddingVertical: space.xl },
  });
}
