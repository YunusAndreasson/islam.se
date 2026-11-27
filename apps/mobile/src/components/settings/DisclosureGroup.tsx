import { type ReactNode, useContext, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated from 'react-native-reanimated';

import { radius, space, type } from '@/theme/tokens';
import { AppSwitch } from '@/components/ui/AppSwitch';
import { Icon } from '@/components/ui/Icon';
import { useReveal } from '@/components/ui/useReveal';
import { InsideCard } from './SettingSection';
import { type SettingsColors, useSettingsColors } from './theme';
import { useCompactLayout } from './useCompactLayout';

// A collapsible card for advanced settings. Collapsed, it shows its category title
// plus a one-line SUMMARY of the current value (recognition over recall) — so the
// user reads the state at a glance and only opens what they need. This is the
// progressive-disclosure primitive that keeps the settings screen welcoming:
// essentials stay visible above, everything technical folds away in here.
//
// The reveal is state-driven, so it runs on CSS transitions (ui/useReveal, which also says
// why the first measurement must not animate). Height is MEASURED from the children rather
// than a fixed constant: the body content is laid out absolutely so it never forces the
// card open, reports its natural height via onLayout, and the visible body transitions
// between 0 and that height. Keeping children mounted (just clipped) means a collapsed
// group is still hidden from the screen reader but its rows exist — no re-measure flash on
// first open.
//
// ⚠️ INSIDE A SettingSection IT IS A ROW, NOT A CARD. Every group on Påminnelser sits in a
// section's card ("Varje bön", "Inte bönetider"), and each used to draw its own bordered,
// rounded card in there too, with a section's worth of margin under it: five cards in a
// card, their edges doubling the outer one's a pixel apart, and 24 dp stripes of the outer
// card showing between them. In a card it now drops its own chrome and separates from the
// group above by the same hairline every other row in the app uses (`divider`).
export function DisclosureGroup({
  title,
  summary,
  defaultExpanded = false,
  divider = false,
  toggle,
  children,
}: {
  title: string;
  summary: string;
  defaultExpanded?: boolean;
  /** A hairline above — for every group but the first in a card, as on Toggle and NavRow. */
  divider?: boolean;
  /**
   * Puts the thing's ON/OFF on the HEADER, beside the reveal.
   *
   * ⚠️ THE FIX THIS EXISTS FOR. Every alert on Påminnelser used to keep its switch
   * INSIDE the fold: the collapsed row said "Av", and turning a prayer back on meant
   * expanding the group and finding a switch labelled "Påminnelse" — two taps and a
   * hidden control for the most common action on the screen. The row reported a state
   * it would not let you change.
   *
   * The switch is a SIBLING of the header's Pressable, never a child of it: a Pressable
   * is `accessible` by default and would swallow the switch into its own node, leaving a
   * screen reader no way to reach it. Two controls, two nodes, two labels.
   *
   * When it is off there is no chevron and the header does not expand — a fold whose
   * body renders nothing for an off alert is a dead affordance. Switch it on and the
   * chevron appears with the detail behind it.
   */
  toggle?: {
    disabled?: boolean;
    value: boolean;
    onValueChange: (value: boolean) => void;
    /** Spoken name for the switch alone, e.g. "Påminnelse för Fajr. Gryningsbönen". */
    label: string;
  };
  children: ReactNode;
}) {
  const compact = useCompactLayout();
  const colors = useSettingsColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const inCard = useContext(InsideCard);

  // An alert that is off has nothing behind its fold, so it gets no fold — and switching
  // one off takes its detail away with it: `isExpanded` goes false, so the body closes
  // rather than being left open over nothing.
  const expandable = !toggle || (!toggle.disabled && toggle.value);
  const [expanded, setExpanded] = useState(defaultExpanded);
  const isExpanded = expanded && expandable;
  const reveal = useReveal(isExpanded);
  // Seed with a one-line estimate (paddingTop 3 + callout lineHeight 21) so the value
  // shows immediately on mount; onLayout then snaps it to the true height (e.g. two lines).
  const [summaryHeight, setSummaryHeight] = useState(24);

  const chevronStyle = {
    transform: [{ rotate: isExpanded ? '180deg' : '0deg' }],
    transitionProperty: 'transform',
    ...reveal.timing,
  } as const;
  // The collapsed value sits BELOW the title (a subtitle), so it has the full card
  // width and never truncates to "…" the way a right-aligned same-row value did when
  // the title and a long value (e.g. "Söndag 31 maj · Karesuando") competed for one
  // line. On open it cross-fades AND collapses its height (so it never duplicates the
  // controls below and leaves no gap under the title once expanded).
  //
  // With NOTHING to say — an alert that is switched off passes an empty summary — it takes
  // no room either. It used to keep its line: the measured height of an empty Text is still
  // a line, so an off row stood its label at the top with a blank line under it, and read
  // as a heading with something missing rather than as a row. Now the label centres in the
  // row, and the value grows in beneath it when the alert is switched on.
  const showSummary = !isExpanded && summary !== '';
  const summaryStyle = {
    height: showSummary ? summaryHeight : 0,
    opacity: showSummary ? 1 : 0,
    transitionProperty: ['height', 'opacity'],
    ...reveal.timing,
  };

  return (
    <View style={inCard ? null : styles.wrap}>
      <View style={[inCard ? styles.rowGroup : styles.card, inCard && divider && styles.divider]}>
        <View style={styles.headerRow}>
        <Pressable
          // No haptic: expanding a section is a content reveal, treated like navigation —
          // the animated open/close is the feedback. See the lib/haptics policy.
          onPress={() => setExpanded((v) => !v)}
          disabled={!expandable}
          accessibilityRole="button"
          accessibilityState={{ expanded: isExpanded }}
          accessibilityLabel={summary ? `${title}, ${summary}` : title}
          style={({ pressed }) => [
            styles.header,
            styles.headerGrow,
            pressed && expandable && styles.headerPressed,
          ]}
        >
          <View style={styles.headerText}>
            <Text style={styles.title}>{title}</Text>
            {/* overflow:hidden wrap whose animated height clips the value cleanly on open.
                The summary Text inside is absolutely positioned (like the body's measure
                view below) so it always lays out at its natural height and reports it via
                onLayout — even while the group is EXPANDED and the wrap is clipped to
                height 0. Measuring from a normal-flow child instead let onLayout fire with
                height 0 while expanded; that zeroed summaryHeight, and since a 0
                summaryHeight keeps the wrap at height 0 even when collapsed ((1-open)*0),
                the clipped Text could never re-measure — the summary vanished for good
                after a single expand→collapse. Absolute positioning breaks that deadlock. */}
            <Animated.View style={[styles.summaryWrap, summaryStyle]}>
              <Text
                style={styles.summary}
                numberOfLines={compact ? undefined : 2}
                onLayout={(e) => setSummaryHeight(e.nativeEvent.layout.height)}
              >
                {summary}
              </Text>
            </Animated.View>
          </View>
          {/* A DOWN chevron (rotating to up), not the right-pointing one: › is the
              app-wide "pushes a screen" glyph (muted, 22), so an inline reveal needs
              its own form — same accent colour still marks it interactive. One glyph
              family per behaviour keeps the affordances predictable. */}
          {expandable ? (
            <Animated.View style={chevronStyle}>
              <Icon name="chevronDown" size={22} color={colors.accent} />
            </Animated.View>
          ) : null}
        </Pressable>
        {toggle ? (
          <View style={styles.headerSwitch}>
            <AppSwitch
              disabled={toggle.disabled}
              accessibilityState={{ checked: toggle.value, disabled: !!toggle.disabled }}
              value={toggle.value}
              onValueChange={toggle.onValueChange}
              accessibilityLabel={toggle.label}
            />
          </View>
        ) : null}
        </View>

        <Animated.View
          style={[styles.body, reveal.body]}
          accessibilityElementsHidden={!isExpanded}
          importantForAccessibility={isExpanded ? 'auto' : 'no-hide-descendants'}
          pointerEvents={isExpanded ? 'auto' : 'none'}
        >
          <View
            style={styles.measure}
            onLayout={reveal.onLayout}
          >
            {children}
          </View>
        </Animated.View>
      </View>
    </View>
  );
}

function makeStyles(colors: SettingsColors) {
  return StyleSheet.create({
    wrap: { marginBottom: space.xxl },
    card: {
      backgroundColor: colors.card,
      borderRadius: radius.md,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    // In a card: no chrome of its own, only the clip the reveal needs.
    rowGroup: { overflow: 'hidden' },
    divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.separator },
    headerRow: { flexDirection: 'row', alignItems: 'center' },
    headerGrow: { flex: 1 },
    // Holds the switch off the card's right edge by the same inset the header uses, and
    // keeps the 56 dp row height when the switch is the tallest thing in it.
    headerSwitch: { paddingRight: space.lg, paddingLeft: space.sm, justifyContent: 'center' },
    header: {
      minHeight: 56, // touch target — paddingVertical 14 is the 56-min-height math, kept
      paddingVertical: 14,
      paddingHorizontal: space.lg,
      flexDirection: 'row',
      alignItems: 'center',
      gap: space.md,
    },
    headerPressed: { backgroundColor: colors.accentSoft },
    // The title + its value subtitle, stacked; takes the row's flexible width so the
    // chevron stays pinned right and the value can run the full card width.
    headerText: { flex: 1 },
    // Mirrors SettingSection's title (type.label) — same design token across both
    // header types so titled cards visually rhyme.
    title: { ...type.label, color: colors.textMuted },
    summaryWrap: { overflow: 'hidden' },
    // The value preview, left-aligned beneath the title (a subtitle). paddingTop is the
    // title→value gap and rides inside the measured height, so collapsing on open leaves
    // no orphan space. lineHeight keeps a wrapped two-line value tidy.
    // Absolutely positioned so its onLayout reports the true natural height regardless of
    // the wrap's animated clip (see the comment at the call-site). paddingTop is the
    // title→value gap (kept literal so the seeded summaryHeight estimate above stays
    // valid); the rest is type.callout.
    summary: { ...type.callout, position: 'absolute', left: 0, right: 0, top: 0, paddingTop: 3, color: colors.text },
    body: { overflow: 'hidden' },
    // Absolute so the children's natural height is reported via onLayout without
    // forcing the (transitioning) body open. A hairline divides header from content.
    measure: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.separator,
    },
  });
}
