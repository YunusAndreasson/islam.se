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

      {/* The consequence of the two pickers above, in one line. Tabular figures so the
          times don't jitter sideways as the user tries different methods. */}
      <Text style={styles.preview}>
        I dag i {place}: Fajr {fajr?.time ?? '—'} · Maghrib {maghrib?.time ?? '—'}
      </Text>
    </View>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    wrap: { gap: space.xs },
    preview: {
      ...type.callout,
      color: c.ink,
      textAlign: 'center',
      fontVariant: ['tabular-nums'],
      marginTop: space.xs,
    },
  });
}
