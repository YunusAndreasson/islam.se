import { useEffect, useState } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { FirstRunButton } from '@/components/intro/FirstRunButton';
import { ReminderPreview } from '@/components/intro/ReminderPreview';
import { ANALYTICS_EVENTS, analytics } from '@/lib/analytics';
import { recoveryVisit } from '@/lib/analytics/return-setup';
import { useLocation } from '@/lib/location/context';
import { claimReminderRecovery } from '@/lib/notification-hint';
import { useSettings } from '@/lib/settings/context';
import { openNotificationSettings } from '@/lib/system-settings';
import { useColors } from '@/theme/useColors';
import { radius, space, type } from '@/theme/tokens';
import { widgetSnapshot } from '@/widget/placement';

// Mounted only for a deliberate, focused visit to Påminnelser, after hydration.
export function ReminderRecovery({ blocked, now }: { blocked: boolean; now: number }) {
  const router = useRouter();
  const { settings } = useSettings();
  const { source } = useLocation();
  const [offer, setOffer] = useState(false);
  const [askable, setAskable] = useState(false);
  const [preview, setPreview] = useState(false);
  const c = useColors();
  const enabled = settings.notifications.enabled;
  useEffect(() => {
    let current = true;
    const check = async () => {
      const [visit, snapshot, permission] = await Promise.all([
        recoveryVisit(), widgetSnapshot(), Notifications.getPermissionsAsync(),
      ]);
      if (!current) return;
      setAskable(Platform.OS === 'ios' ? permission.ios?.status === Notifications.IosAuthorizationStatus.AUTHORIZED :
        permission.granted || permission.canAskAgain);
      if (enabled || !visit || visit.verified || snapshot.present !== false || source === 'default') {
        setOffer(false);
        return;
      }
      if (await claimReminderRecovery(visit.started, () => current) && current) {
        setOffer(true);
        void analytics.track(ANALYTICS_EVENTS.RETURN_OFFER_VIEWED, { surface: 'settings_recovery', kind: 'reminder', occasion: 'later' });
      }
    };
    void check().catch(() => undefined);
    const sub = AppState.addEventListener('change', state => { if (state === 'active') void check().catch(() => undefined); });
    return () => { current = false; sub.remove(); };
  }, [enabled, source]);
  if (!offer && !blocked) return null;
  return <>
    <View style={{ backgroundColor: c.surface, borderRadius: radius.md, padding: space.lg, gap: space.sm, alignItems: 'flex-start' }}>
      {offer && <Text accessibilityRole="header" style={[type.headline, { color: c.ink }]}>Påminnelser vid bönetiderna</Text>}
      {offer && <Text style={[type.body, { color: c.inkMuted }]}>Vill du ha påminnelser vid dina valda böner?{!askable && ' Tillåt notiser i Inställningar.'}</Text>}
      {offer && askable && <FirstRunButton label="Välj påminnelser" onPress={() => setPreview(true)} />}
      {(blocked || (offer && !askable)) && <FirstRunButton label="Öppna appinställningar" onPress={openNotificationSettings} />}
    </View>
    {preview && <ReminderPreview source="settings_recovery" initial={settings.notifications.prayers} placeKey="" now={now}
      occasion="later" onClose={() => setPreview(false)} onMethod={() => { setPreview(false); router.push('/berakning'); }}
      onAnswer={() => { setOffer(false); setPreview(false); }} />}
  </>;
}
