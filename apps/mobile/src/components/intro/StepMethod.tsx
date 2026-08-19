// Step 4 — how the times are worked out.
//
// The riskiest step: to a beginner "Fajr 18°, Isha 17°" is noise, and a wizard that
// demands a choice between six of those has taught nothing and cost trust. So the default
// is already selected when the step opens, the copy says out loud that leaving it alone
// is fine, and the live line underneath turns the abstraction into two numbers that
// visibly move when a row is tapped. A setting you can watch land is a setting you can
// judge.
//
// Zero new logic: METHOD_OPTIONS / MADHAB_OPTIONS and OptionGroup are the settings
// screen's, and the preview is the same usePrayerPreview the settings screen renders.
import { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { OptionGroup } from '@/components/settings/OptionGroup';
import { SettingSection } from '@/components/settings/SettingSection';
import { useLocation } from '@/lib/location/context';
import { useSettings } from '@/lib/settings/context';
import { MADHAB_OPTIONS, METHOD_OPTIONS } from '@/lib/settings/options';
import { usePrayerPreview } from '@/lib/settings/usePrayerPreview';
import { type Palette, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';

export function StepMethod() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { settings, update } = useSettings();
  const { coords, label } = useLocation();

  // The intro is a short-lived flow, so unlike the settings screen it has no reason to
  // tick — one timestamp, captured on mount, is enough for "i dag".
  const [now] = useState(() => new Date());
  const preview = usePrayerPreview(coords, label, settings, now);
  const fajr = preview.times.find((t) => t.key === 'fajr');
  const maghrib = preview.times.find((t) => t.key === 'maghrib');
  // Drop the status qualifier ("(GPS)", "(standard)") that belongs on the settings
  // screen — here the place is prose, not a diagnostic.
  const place = label.replace(/\s*\([^)]*\)\s*$/, '');

  return (
    <View style={styles.wrap}>
      {/* The consequence of the two pickers, ABOVE them rather than under them. It used to
          sit at the bottom, which on every phone we tried put it below the fold — the one
          element on the riskiest step that turns "Fajr 18°, Isha 17°" from noise into two
          numbers the reader recognises, and it was the one element nobody ever saw. It is
          also the step's only feedback: with the line underneath, tapping a method changed
          numbers that were off-screen, so the lists answered nothing. Here the first thing
          under the question is what the current answer produces, and it visibly moves on
          the very next tap.

          Left-aligned on the same gutter as the title and lead, not centred as it was in
          the old position: up here it continues the message column, and a centred line
          directly beneath left-aligned prose reads as a stray. Tabular figures so the times
          don't jitter sideways as the user tries different methods. */}
      <Text style={styles.preview}>
        I dag i {place}: Fajr {fajr?.time ?? '—'} · Maghrib {maghrib?.time ?? '—'}
      </Text>

      <SettingSection title="Beräkningsmetod">
        <OptionGroup
          options={METHOD_OPTIONS}
          value={settings.calculationMethod}
          onChange={(calculationMethod) => update({ calculationMethod })}
        />
      </SettingSection>

      <SettingSection
        title="Asr-metod"
        footnote="Hanafi ger en senare Asr. Alla andra rättsskolor ger samma, tidigare tid."
      >
        <OptionGroup
          options={MADHAB_OPTIONS}
          value={settings.madhab}
          onChange={(madhab) => update({ madhab })}
        />
      </SettingSection>

    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    wrap: { gap: space.xs },
    preview: {
      ...type.callout,
      color: c.ink,
      fontVariant: ['tabular-nums'],
      marginBottom: space.md,
    },
  });
}
