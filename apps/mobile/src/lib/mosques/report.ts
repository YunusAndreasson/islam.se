// Reporting stale mosque data from the app.
//
// The vendored dataset (./data.json) is a snapshot: mosques close, move and get renamed,
// and the person standing outside one is the first to know. This module is everything the
// report needs EXCEPT the screen — the reason enum, the payload builder, validation, and
// the one network call — so all of it is testable without rendering anything.
//
// House style follows ../about/index.ts: data plus thin wrappers that never throw. A
// failed report must surface as a message on the form, never as a red screen.
//
// ⚠️ PRIVACY. The payload deliberately carries NO user coordinates. The Om screen promises
// "Din plats lämnar aldrig enheten", and MosqueCard — which owns the entry point — has
// `userCoords` right there in scope, so passing them along would be a one-word change that
// quietly breaks that promise. buildReportPayload takes a Mosque and nothing positional;
// report.test.ts asserts the absence.
import Constants from 'expo-constants';

import type { Mosque } from './index';

/** The Pages Function backing this form. Same D1 table and mailer as the web's /ratta. */
export const REPORT_ENDPOINT = 'https://islam.se/api/moske-rattelse';

/** Give up rather than leave the user watching a spinner on a dead network. */
const TIMEOUT_MS = 15_000;

/** Mirrors LIMITS.description in apps/web/functions/api/moske-rattelse.js. */
export const MAX_DESCRIPTION = 4000;

/**
 * Minimum free-text length when the reason requires text.
 *
 * Three, not the web form's ten: there the description is the entire report, here the
 * REASON already says what is wrong and the text only supplies the correct value.
 * "Al-Huda" is a complete answer to "what is the right name?" — a ten-character floor
 * would reject it.
 */
export const MIN_DESCRIPTION = 3;

export type ReportReason = 'stangd' | 'adress' | 'namn' | 'plats' | 'annat';

export interface ReasonSpec {
  value: ReportReason;
  /** The radio row in the form. */
  label: string;
  /**
   * The free-text prompt, which CHANGES with the reason. Asking "what is the right
   * address?" instead of a generic "describe the problem" is what makes a report land
   * actionable rather than as "the address is wrong" with no address in it.
   */
  prompt: string;
  /** Placeholder for the text field — a concrete example beats an abstract instruction. */
  placeholder: string;
  /** Whether the report is useless without text. Closing needs no explanation; a wrong
   *  name is unfixable unless we learn the right one. */
  requiresText: boolean;
}

export const REASONS: readonly ReasonSpec[] = [
  {
    value: 'stangd',
    label: 'Moskén har stängt',
    prompt: 'Vet du när den stängde?',
    placeholder: 'Till exempel: stängde under 2025',
    requiresText: false,
  },
  {
    value: 'adress',
    label: 'Adressen stämmer inte',
    prompt: 'Vad är rätt adress?',
    placeholder: 'Gatuadress och ort',
    requiresText: true,
  },
  {
    value: 'namn',
    label: 'Namnet stämmer inte',
    prompt: 'Vad är rätt namn?',
    placeholder: 'Moskéns namn',
    requiresText: true,
  },
  {
    value: 'plats',
    label: 'Kartnålen sitter fel',
    prompt: 'Var ligger den egentligen?',
    placeholder: 'Beskriv var nålen borde sitta',
    requiresText: true,
  },
  {
    value: 'annat',
    label: 'Något annat',
    prompt: 'Beskriv vad som är fel',
    placeholder: 'Vad stämmer inte?',
    requiresText: true,
  },
];

export function reasonSpec(reason: ReportReason): ReasonSpec {
  // Every ReportReason has a spec, so the fallback is unreachable through the type — it
  // exists so a hand-written string from a deep link can never crash the screen.
  return REASONS.find((r) => r.value === reason) ?? REASONS[REASONS.length - 1];
}

/** Exactly what goes over the wire. No user location — see the privacy note above. */
export interface ReportPayload {
  mosque_id: string;
  mosque_name: string;
  city_slug: string;
  kommun: string;
  lan: string;
  current_address: string;
  reason: ReportReason;
  description: string;
  reporter_email: string;
  app_version: string;
}

const APP_VERSION: string = Constants.expoConfig?.version ?? '';

export function buildReportPayload(
  mosque: Mosque,
  reason: ReportReason,
  description: string,
  reporterEmail: string,
): ReportPayload {
  return {
    mosque_id: mosque.id,
    mosque_name: mosque.name,
    city_slug: mosque.citySlug,
    kommun: mosque.kommun,
    lan: mosque.lan,
    // The address as the app currently shows it, so triage can see WHICH version of the
    // record the reporter was looking at (web and mobile datasets have drifted).
    current_address: mosque.address ?? '',
    reason,
    description: description.trim().slice(0, MAX_DESCRIPTION),
    reporter_email: reporterEmail.trim(),
    app_version: APP_VERSION,
  };
}

// Same shape as the server's check (functions/api/moske-rattelse.js). Deliberately
// permissive: the server is the authority, this only spares the user a round trip.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type ValidationResult =
  | { ok: true }
  | { ok: false; field: 'description' | 'email'; message: string };

export function validateReport(
  reason: ReportReason,
  description: string,
  reporterEmail: string,
): ValidationResult {
  const spec = reasonSpec(reason);
  const text = description.trim();
  if (spec.requiresText && text.length < MIN_DESCRIPTION) {
    return { ok: false, field: 'description', message: spec.prompt };
  }
  const email = reporterEmail.trim();
  if (email && !EMAIL_PATTERN.test(email)) {
    return { ok: false, field: 'email', message: 'Kontrollera e-postadressen.' };
  }
  return { ok: true };
}

// Server error codes → what the user reads. Mirrors the ERRORS record in
// apps/web/src/pages/ratta.astro, so both surfaces speak the same Swedish.
const ERRORS: Record<string, string> = {
  bad_mosque: 'Moskén kunde inte identifieras. Stäng och försök igen.',
  bad_reason: 'Välj vad som är fel.',
  description_required: 'Beskriv gärna vad som är fel.',
  bad_email: 'Kontrollera e-postadressen.',
  rate_limited: 'Du har skickat flera rättelser den senaste timmen. Försök igen senare.',
  server_misconfigured: 'Något gick fel hos oss. Försök igen senare.',
};

const OFFLINE = 'Ingen anslutning. Kontrollera nätet och försök igen.';
const GENERIC = 'Något gick fel. Försök igen.';

export type SubmitResult = { ok: true; id: number } | { ok: false; message: string };

/** What functions/api/moske-rattelse.js answers with, on either path. */
interface ServerReply {
  ok?: boolean;
  id?: number;
  error?: string;
}

/**
 * POST the report. Resolves with a message rather than rejecting — the form has one place
 * to show a failure and no path here should reach an error boundary.
 *
 * This is the app's only outbound request. Everything else (prayer times, qibla, the
 * mosque dataset) is computed or bundled on device.
 */
export async function submitMosqueReport(payload: ReportPayload): Promise<SubmitResult> {
  // ⚠️ NOT AbortSignal.timeout(). React Native replaces the global AbortSignal with the
  // `abort-controller` polyfill (see RN's Libraries/Core/setUpXHR.js), which has no
  // static timeout() — calling it throws TypeError, and since everything here is wrapped
  // in one try/catch that would report EVERY submission as "no connection". An
  // AbortController plus setTimeout is the shape that actually exists on device.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(REPORT_ENDPOINT, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    // A 5xx from the edge can be an HTML error page, so a failed parse is not fatal here —
    // the status already tells us enough to pick a message.
    let parsed: ServerReply | null = null;
    try {
      parsed = (await res.json()) as ServerReply;
    } catch {
      parsed = null;
    }

    if (res.ok && parsed?.ok) return { ok: true, id: Number(parsed.id) || 0 };

    const code = parsed?.error;
    return { ok: false, message: (code && ERRORS[code]) || GENERIC };
  } catch {
    // Thrown for a dead network, a DNS failure, or our own abort — from the user's side
    // these are one situation: it didn't go through, try again.
    return { ok: false, message: OFFLINE };
  } finally {
    // Otherwise a fast response leaves a pending timer that fires into a dead controller.
    clearTimeout(timer);
  }
}
