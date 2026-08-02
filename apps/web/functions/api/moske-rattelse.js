// Mosque corrections submitted from the mobile app: validate, store in D1, notify.
//
// The vendored mosque dataset goes stale in the real world — mosques close, move and get
// renamed — and the app is where a user notices. This is the endpoint its "Rapportera fel"
// form posts to. Rows land in the same `corrections` table as the web's article
// corrections (kind = 'mosque') so `pnpm rattelser` triages one queue, not two.
//
// WHY NO TURNSTILE, WHY NO HONEYPOT
//
// Turnstile is a browser widget; a native form would need a WebView to render one. The
// honeypot is worse than useless here — a native form has no hidden input for a bot to
// trip over, so the field would only be a lie in the payload.
//
// Neither is load-bearing for this endpoint's actual threat model. The URL is unlinked and
// undocumented, and the payload space is bounded: a slug-shaped id plus one of five reason
// values. Only `description` is free text, and it is never rendered publicly — it goes to a
// private inbox and a D1 row. Spamming that pays nothing.
//
// ⚠️ What is NOT a control: "the request came from an App Store build". This is a public
// HTTPS endpoint and the app's JS bundle is readable, so curl works regardless. Do not add
// a shared secret and call it authentication. What actually keeps this safe is that
// nothing auto-applies — every row is read by a human before the dataset changes.
//
// What IS kept, because it costs nothing: the shared hashed-IP rate limit, the reason
// enum, the slug shape check, per-field clamps, and CRLF stripping in the mailer. If real
// abuse ever appears, App Attest / Play Integrity is the escalation — not a captcha.

import {
	clampField,
	EMAIL_PATTERN,
	fail,
	hashIp,
	isRateLimited,
	notifyMailer,
} from "./_corrections.js";

const LIMITS = {
	mosque_id: 80,
	mosque_name: 200,
	city_slug: 60,
	kommun: 100,
	lan: 100,
	current_address: 200,
	description: 4000,
	reporter_email: 200,
	app_version: 20,
};

// The reason carries WHAT is wrong, so the free text only has to supply the correct value.
// That is why the floor is 3 and not the article form's 10: "Al-Huda" is a complete answer
// to "what is the right name?". `stangd` needs no text at all — the reason IS the report.
const MIN_DESCRIPTION = 3;
const REASONS_REQUIRING_TEXT = new Set(["adress", "namn", "plats", "annat"]);
const REASONS = new Set(["stangd", ...REASONS_REQUIRING_TEXT]);

// Slug shapes, matching how ids and city slugs are generated upstream in
// apps/web/scripts/build-moskeer.ts. Shape only — see the header note on why this is not
// an allowlist against the web dataset.
const MOSQUE_ID_PATTERN = /^[a-z0-9-]{3,80}$/;
const CITY_SLUG_PATTERN = /^[a-z0-9-]{2,60}$/;

function field(body, name) {
	return clampField(body, name, LIMITS[name]);
}

export async function onRequestPost(context) {
	const { request, env } = context;

	// ⚠️ Not defaultable: an unset IP_SALT would hash the literal "undefined:<ip>", which is
	// brute-forceable over the whole IPv4 space and breaks the promise in
	// integritetspolicy.astro. Unlike /api/rattelse this route needs no TURNSTILE_SECRET.
	if (!env.IP_SALT) {
		console.error("moske-rattelse: missing secret", { ip_salt: false });
		return fail("server_misconfigured", 500);
	}

	let body;
	try {
		body = await request.json();
	} catch {
		return fail("bad_json", 400);
	}

	const mosqueId = field(body, "mosque_id");
	const mosqueName = field(body, "mosque_name");
	const citySlug = field(body, "city_slug");
	const kommun = field(body, "kommun");
	const lan = field(body, "lan");
	const currentAddress = field(body, "current_address");
	const description = field(body, "description");
	const reporterEmail = field(body, "reporter_email");
	const appVersion = field(body, "app_version");
	const reason = field(body, "reason");

	if (!(MOSQUE_ID_PATTERN.test(mosqueId) && mosqueName)) return fail("bad_mosque", 400);
	if (!CITY_SLUG_PATTERN.test(citySlug)) return fail("bad_mosque", 400);
	if (!REASONS.has(reason)) return fail("bad_reason", 400);
	if (REASONS_REQUIRING_TEXT.has(reason) && description.length < MIN_DESCRIPTION) {
		return fail("description_required", 400);
	}
	if (reporterEmail && !EMAIL_PATTERN.test(reporterEmail)) return fail("bad_email", 400);

	const ip = request.headers.get("cf-connecting-ip") || "";
	const ipHash = await hashIp(ip, env.IP_SALT);

	if (await isRateLimited(env.RATTELSER, ipHash)) return fail("rate_limited", 429);

	// What the app was showing when the user hit report. Worth storing verbatim: the web
	// dataset and the vendored mobile copy have drifted, so triage needs to know which
	// version of the record the reporter was actually looking at.
	const snapshot = [
		mosqueName,
		[kommun, lan].filter(Boolean).join(", "),
		currentAddress,
		appVersion && `app ${appVersion}`,
	]
		.filter(Boolean)
		.join(" · ");

	// `page` is NOT NULL and holds the canonical mosque URL — the city page that lists
	// this mosque, which the triage tool links with the record id as the fragment.
	const page = `/moskeer/${citySlug}/`;

	const inserted = await env.RATTELSER.prepare(
		`INSERT INTO corrections (kind, page, mosque_id, reason, passage, description, reporter_email, ip_hash)
		 VALUES ('mosque', ?1, ?2, ?3, ?4, ?5, ?6, ?7)
		 RETURNING id`,
	)
		.bind(
			page,
			mosqueId,
			reason,
			snapshot,
			description || "(ingen beskrivning)",
			reporterEmail || null,
			ipHash,
		)
		.first();

	const id = inserted?.id ?? 0;

	await notifyMailer(
		env,
		{
			kind: "mosque",
			id,
			page,
			mosque_id: mosqueId,
			mosque_name: mosqueName,
			kommun,
			lan,
			current_address: currentAddress,
			reason,
			description,
			reporter_email: reporterEmail,
			app_version: appVersion,
		},
		"moske-rattelse",
	);

	return Response.json({ ok: true, id });
}

export async function onRequest() {
	return new Response("Method not allowed", { status: 405, headers: { allow: "POST" } });
}
