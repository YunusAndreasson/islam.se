// Rapportera fel — the mosque correction form, opened from MosqueCard.
//
// The dataset is a snapshot and the person standing outside a closed mosque is the only
// one who knows it. This screen is the shortest honest path from "that's wrong" to a
// triageable report, and it is built out of the app's existing parts rather than a new
// visual language: the settings card (SettingSection), the settings radio list
// (OptionGroup), the sheet's own top bar (ModalBar) and the tokens. Familiar beats novel
// — the user has filled this exact shape in a hundred other apps.
//
// The composition, and why each piece earns its place:
//
//   1. CONTEXT CARD   The mosque, read-only. The form is reached from a map tap, so
//                     naming the subject removes any doubt about what is being corrected.
//   2. REASON         A radio list, not a text box. Recognition over recall, and it makes
//                     every report machine-sortable at the far end.
//   3. FREE TEXT      Its label and placeholder come FROM the chosen reason: "Vad är rätt
//                     adress?" rather than a generic "describe the problem". This is the
//                     whole difference between a report that can be applied and one that
//                     says "the address is wrong" without containing an address.
//   4. E-POST         Optional, and says plainly why it is being asked for.
//   5. "Det här skickas"  The exact payload, spelled out. The user never has to trust a
//                     claim about what leaves the device — they can read it.
//   6. SKICKA         One primary action, disabled until the form is valid, with a
//                     visible in-flight state and a real success screen.
//
// Failure never loses work: an error keeps everything typed and offers the button again.
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { OptionGroup } from '@/components/settings/OptionGroup';
import { Icon } from '@/components/ui/Icon';
import { SettingSection } from '@/components/settings/SettingSection';
import { ModalBar } from '@/components/ui/ModalBar';
import { hapticSuccess, hapticWarning } from '@/lib/haptics';
import { locationLabel, mosqueById } from '@/lib/mosques';
import {
  buildReportPayload,
  MAX_DESCRIPTION,
  REASONS,
  reasonSpec,
  submitMosqueReport,
  validateReport,
  type ReportReason,
} from '@/lib/mosques/report';
import { type Palette, radius, space, type } from '@/theme/tokens';
import { useColors } from '@/theme/useColors';

// The counter is noise until the limit is actually in reach; 4000 characters is far more
// than anyone writes here, so it stays hidden for every realistic report.
const COUNTER_FROM = MAX_DESCRIPTION - 400;

// What happens to an address the reader gives us. Stated wherever the field is, in every
// state the field can be in — a retention promise that blinks out while the value is being
// typed is not a promise.
const EMAIL_DISCLOSURE =
  'Frivilligt. Vi använder den bara om vi behöver fråga om något är oklart, och raderar den när ärendet är hanterat.';

type Phase = { state: 'editing'; error?: string } | { state: 'sending' } | { state: 'sent' };

export default function MoskeRattelse() {
  const c = useColors();
  const styles = useMemo(() => makeStyles(c), [c]);
  const { id } = useLocalSearchParams<{ id?: string }>();
  const mosque = typeof id === 'string' ? mosqueById(id) : undefined;

  const [reason, setReason] = useState<ReportReason | null>(null);
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [phase, setPhase] = useState<Phase>({ state: 'editing' });

  // A stale deep link, or a mosque dropped from the dataset between OTA updates. A quiet
  // dead end beats a crash, and the bar still gets the user out.
  if (!mosque) {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ModalBar variant="close" fallback="/bonetider" />
        <View style={styles.missing}>
          <Text style={styles.missingText}>Moskén kunde inte hittas.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const spec = reason ? reasonSpec(reason) : null;
  // The submit button is disabled while the form is invalid, which means submit()'s own
  // validation branch — the one that produces the message explaining what is wrong — can
  // never be reached: the control that would surface it is dimmed for exactly as long as
  // the message applies. A reader who picks "Adressen stämmer inte" and types nothing was
  // left with a dead button and no reason at all. validateReport already returns WHICH
  // field is at fault and that answer was being thrown away; keep the whole result so each
  // field can carry its own requirement in the footnote slot it already has. Neither
  // footnote is styled as an error — nothing has failed yet, the form is simply not done.
  const check = reason === null ? null : validateReport(reason, description, email);
  const valid = check?.ok === true;
  const pendingField = check?.ok === false ? check.field : null;
  const sending = phase.state === 'sending';

  const submit = (): void => {
    if (!reason || sending) return;
    const check = validateReport(reason, description, email);
    if (!check.ok) {
      setPhase({ state: 'editing', error: check.message });
      hapticWarning();
      return;
    }
    setPhase({ state: 'sending' });
    void (async () => {
      const result = await submitMosqueReport(
        buildReportPayload(mosque, reason, description, email),
      );
      if (result.ok) {
        // An outcome the user asked for has landed — the one thing the haptics policy
        // reserves a success buzz for.
        setPhase({ state: 'sent' });
        hapticSuccess();
        return;
      }
      // Everything typed survives: the same values are still in state, so the form
      // re-renders exactly as it was with the reason for the failure above the button.
      setPhase({ state: 'editing', error: result.message });
      hapticWarning();
    })();
  };

  if (phase.state === 'sent') {
    return (
      <SafeAreaView style={styles.safe} edges={['top']}>
        <ModalBar variant="close" fallback="/bonetider" />
        <View style={styles.done}>
          <View style={styles.doneMark}>
            <Icon name="check" size={30} color={c.onAccent} />
          </View>
          <Text style={styles.doneTitle}>Tack</Text>
          {/* Honest about what happens next: a person reads it, and the map does not
              change today. Promising an instant fix would be a lie the user could check. */}
          <Text style={styles.doneBody}>
            Vi läser varje rättelse och uppdaterar kartan när uppgiften är bekräftad.
          </Text>
          <Pressable
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/bonetider'))}
            accessibilityRole="button"
            accessibilityLabel="Stäng"
            style={({ pressed }) => [styles.submit, pressed && styles.submitPressed]}
          >
            <Text style={styles.submitText}>Stäng</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ModalBar variant="close" fallback="/bonetider" />
      <KeyboardAvoidingView
        style={styles.flex}
        // iOS lifts the whole view; on Android the OS already resizes the window, and
        // adding padding on top of that double-counts and leaves a gap above the keyboard.
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <Text style={styles.header}>Rapportera fel</Text>

          {/* What is being corrected. Read-only — this screen fixes the dataset, it does
              not let anyone rewrite a record in place. */}
          <SettingSection title="Moskén">
            <View style={styles.subject}>
              <Text style={styles.subjectName}>{mosque.name}</Text>
              <Text style={styles.subjectMeta}>{locationLabel(mosque)}</Text>
              {mosque.address ? <Text style={styles.subjectMeta}>{mosque.address}</Text> : null}
            </View>
          </SettingSection>

          <SettingSection title="Vad stämmer inte?">
            <OptionGroup
              options={REASONS.map((r) => ({ value: r.value, label: r.label }))}
              value={reason}
              onChange={(next) => {
                setReason(next);
                // Clear a stale validation message: it was about the previous reason's
                // requirements, which no longer apply.
                if (phase.state === 'editing' && phase.error) setPhase({ state: 'editing' });
              }}
            />
          </SettingSection>

          {/* The text field appears only once a reason is chosen — until then there is no
              honest question to put above it. */}
          {spec ? (
            <SettingSection
              title={spec.prompt}
              footnote={
                spec.requiresText
                  ? pendingField === 'description'
                    ? 'Behövs för att vi ska kunna rätta uppgiften.'
                    : undefined
                  : 'Frivilligt.'
              }
            >
              <TextInput
                style={styles.textArea}
                value={description}
                onChangeText={setDescription}
                placeholder={spec.placeholder}
                placeholderTextColor={c.inkFaint}
                multiline
                textAlignVertical="top"
                maxLength={MAX_DESCRIPTION}
                editable={!sending}
                accessibilityLabel={spec.prompt}
              />
              {description.length > COUNTER_FROM ? (
                <Text style={styles.counter}>
                  {description.length} / {MAX_DESCRIPTION}
                </Text>
              ) : null}
            </SettingSection>
          ) : null}

          <SettingSection
            title="Din e-post"
            // The correction JOINS the disclosure, it does not replace it. Swapping it out
            // removed the promise about what happens to the address for every keystroke of
            // a half-typed one — that is, for exactly as long as the reader is still
            // deciding whether to hand it over.
            footnote={
              pendingField === 'email'
                ? `Kontrollera e-postadressen, eller lämna fältet tomt. ${EMAIL_DISCLOSURE}`
                : EMAIL_DISCLOSURE
            }
          >
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder="namn@exempel.se"
              placeholderTextColor={c.inkFaint}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              inputMode="email"
              editable={!sending}
              accessibilityLabel="Din e-postadress, frivillig"
            />
          </SettingSection>

          {/* The transparency beat. The app's whole promise is that it keeps to itself, so
              the one screen that sends anything says exactly what — including what it does
              NOT send, which is the part a user cannot otherwise verify. */}
          <SettingSection title="Det här skickas">
            <View style={styles.disclosure}>
              <Text style={styles.disclosureBody}>
                Moskéns namn och id, kommun och län, adressen som visas i appen, vad du valt
                ovan, din text{email.trim() ? ', din e-postadress' : ''} och appens version.
              </Text>
              <Text style={styles.disclosureBody}>
                Din plats skickas inte. Rättelsen går till islam.se och används bara för att
                rätta kartan.
              </Text>
            </View>
          </SettingSection>

          {phase.state === 'editing' && phase.error ? (
            <View style={styles.error} accessibilityLiveRegion="polite">
              <Icon name="errorOutline" size={18} color={c.highlightText} />
              <Text style={styles.errorText}>{phase.error}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={submit}
            disabled={!valid || sending}
            accessibilityRole="button"
            accessibilityLabel="Skicka rättelse"
            accessibilityState={{ disabled: !valid || sending, busy: sending }}
            style={({ pressed }) => [
              styles.submit,
              (!valid || sending) && styles.submitDisabled,
              pressed && styles.submitPressed,
            ]}
          >
            {sending ? (
              <>
                <ActivityIndicator size="small" color={c.onAccent} />
                <Text style={styles.submitText}>Skickar…</Text>
              </>
            ) : (
              <Text style={styles.submitText}>Skicka rättelse</Text>
            )}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function makeStyles(c: Palette) {
  return StyleSheet.create({
    safe: { flex: 1, backgroundColor: c.paper },
    flex: { flex: 1 },
    content: { padding: space.lg, paddingBottom: space.xxxl + space.lg },
    header: { ...type.title, color: c.ink, marginBottom: space.xl, marginTop: space.xs },

    missing: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl },
    missingText: { ...type.body, color: c.inkMuted, textAlign: 'center' },

    // --- Subject card ----------------------------------------------------
    subject: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: 2 },
    subjectName: { ...type.bodyStrong, color: c.ink },
    subjectMeta: { ...type.caption, color: c.inkMuted },

    // --- Inputs ----------------------------------------------------------
    // Borderless inside the card: SettingSection already draws the frame, so a second
    // border would box a box. Matches the row rhythm of the settings controls.
    input: {
      ...type.body,
      color: c.ink,
      minHeight: 48,
      paddingHorizontal: space.lg,
      paddingVertical: space.md,
    },
    textArea: {
      ...type.body,
      color: c.ink,
      minHeight: 108,
      paddingHorizontal: space.lg,
      paddingTop: space.sm,
      paddingBottom: space.md,
    },
    counter: {
      ...type.micro,
      color: c.inkFaint,
      textAlign: 'right',
      paddingHorizontal: space.lg,
      paddingBottom: space.sm,
    },

    // --- Disclosure ------------------------------------------------------
    disclosure: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.sm },
    disclosureBody: { ...type.caption, color: c.inkMuted },

    // --- Error -----------------------------------------------------------
    // Brass, not red: the app has no destructive-red token, and brass is already its
    // "look here" signal. Sits directly above the button that will be pressed again.
    error: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: space.sm,
      backgroundColor: c.highlightSoft,
      borderRadius: radius.md,
      padding: space.md,
      marginBottom: space.lg,
    },
    errorText: { ...type.caption, color: c.highlightText, flex: 1 },

    // --- Submit ----------------------------------------------------------
    // The same filled indigo action as MosqueCard's Vägbeskrivning, so the form's primary
    // control is visibly the same kind of thing as the card's.
    submit: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: space.sm,
      minHeight: 48,
      paddingHorizontal: space.lg,
      borderRadius: radius.round,
      backgroundColor: c.accent,
    },
    submitPressed: { opacity: 0.85 },
    // One dimming step, shared with the settings controls' disabled state.
    submitDisabled: { opacity: 0.5 },
    submitText: { ...type.bodyStrong, color: c.onAccent },

    // --- Success ---------------------------------------------------------
    done: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md },
    doneMark: {
      width: 56,
      height: 56,
      borderRadius: radius.round,
      backgroundColor: c.accent,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: space.xs,
    },
    doneTitle: { ...type.title, color: c.ink },
    doneBody: {
      ...type.callout,
      color: c.inkMuted,
      textAlign: 'center',
      maxWidth: 320,
      marginBottom: space.lg,
    },
  });
}
