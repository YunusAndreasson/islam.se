// Notification mailer for reader corrections.
//
// Pages Functions cannot hold a `send_email` binding, so /api/rattelse and
// /api/moske-rattelse reach this Worker over a service binding. It has no route and no
// workers.dev host: the service binding is the only way in.
//
// Two shapes arrive here, told apart by `kind`:
//   • 'article' (default) — a reader flagged a sentence on a page. Links to the page.
//   • 'mosque'            — the app reported stale mosque data. Leads with the record id
//                           (the thing you edit) and links the city page it appears on.

const MAX_FIELD = 4000;

// Human-readable Swedish for the reason enum the app sends. Kept in sync with REASONS in
// apps/mobile/src/lib/mosques/report.ts and the allowlist in functions/api/moske-rattelse.js.
const REASON_LABELS = {
	stangd: "Moskén har stängt",
	adress: "Adressen stämmer inte",
	namn: "Namnet stämmer inte",
	plats: "Kartnålen sitter fel",
	annat: "Något annat",
};

function clip(value) {
	if (typeof value !== "string") return "";
	// Strips CR/LF so no field can smuggle a header into the message.
	return value
		.replace(/[\r\n]+/g, " ")
		.slice(0, MAX_FIELD)
		.trim();
}

function block(label, value) {
	return value ? `${label}:\n${value}\n\n` : "";
}

function escapeHtml(value) {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;");
}

// A reader flagged something on a page. Unchanged from the original single-shape mailer.
function articleMessage(payload, id, reporter) {
	const page = clip(payload.page);
	const passage = clip(payload.passage);
	const description = clip(payload.description);
	const source = clip(payload.source);

	const text =
		"En läsare har föreslagit en rättelse.\n\n" +
		`Sida: https://islam.se${page}\n\n` +
		block("Stycket", passage) +
		block("Vad som är fel", description) +
		block("Källa", source) +
		block("Avsändare", reporter || "(ingen adress lämnad)") +
		`Ärende #${id}. Hantera med: pnpm rattelser\n`;

	const html =
		"<p>En läsare har föreslagit en rättelse.</p>" +
		`<p><strong>Sida:</strong> <a href="https://islam.se${escapeHtml(page)}">islam.se${escapeHtml(page)}</a></p>` +
		(passage ? `<p><strong>Stycket:</strong><br><em>${escapeHtml(passage)}</em></p>` : "") +
		`<p><strong>Vad som är fel:</strong><br>${escapeHtml(description)}</p>` +
		(source ? `<p><strong>Källa:</strong><br>${escapeHtml(source)}</p>` : "") +
		`<p><strong>Avsändare:</strong> ${escapeHtml(reporter || "(ingen adress lämnad)")}</p>` +
		`<p>Ärende #${id}. Hantera med <code>pnpm rattelser</code>.</p>`;

	return { subject: `Rättelse: ${page || "okänd sida"}`, text, html };
}

// The app reported stale mosque data. Applying one of these is a manual edit, so the mail
// carries the recipe — including the trap that build-moskeer.ts regenerates from the CSV
// and would silently discard every hand-edit made since the last import.
function mosqueMessage(payload, id, reporter) {
	const mosqueId = clip(payload.mosque_id);
	const name = clip(payload.mosque_name);
	const kommun = clip(payload.kommun);
	const lan = clip(payload.lan);
	const address = clip(payload.current_address);
	const reasonKey = clip(payload.reason);
	const reason = REASON_LABELS[reasonKey] || reasonKey || "(okänd anledning)";
	const description = clip(payload.description);
	const appVersion = clip(payload.app_version);
	// The city page that lists this mosque; the record is the anchor on it.
	const page = clip(payload.page);
	const pageUrl = page ? `https://islam.se${page}${mosqueId ? `#${mosqueId}` : ""}` : "";

	const where = [kommun, lan].filter(Boolean).join(", ");
	const recipe =
		"Applicera i apps/web/src/data/moskeer-sverige.json, bumpa MOSKEER_DATA_DATE i " +
		"src/lib/moskeer/meta.ts, kör sedan pnpm --filter @islam-se/mobile sync:mosques.\n" +
		"Kör INTE build-moskeer.ts — den regenererar från CSV:n och skriver över handredigeringar.";

	const text =
		"En användare i appen har rapporterat fel i moskédatan.\n\n" +
		`Moské: ${name || "(namnlös)"}\n` +
		`Id: ${mosqueId}\n` +
		(where ? `Plats: ${where}\n` : "") +
		(address ? `Adress i datan: ${address}\n` : "") +
		(pageUrl ? `Sida: ${pageUrl}\n` : "") +
		"\n" +
		block("Anledning", reason) +
		block("Beskrivning", description || "(ingen beskrivning lämnad)") +
		block("Avsändare", reporter || "(ingen adress lämnad)") +
		(appVersion ? `Appversion: ${appVersion}\n\n` : "") +
		`${recipe}\n\n` +
		`Ärende #${id}. Hantera med: pnpm rattelser\n`;

	const html =
		"<p>En användare i appen har rapporterat fel i moskédatan.</p>" +
		`<p><strong>Moské:</strong> ${escapeHtml(name || "(namnlös)")}<br>` +
		`<strong>Id:</strong> <code>${escapeHtml(mosqueId)}</code>` +
		(where ? `<br><strong>Plats:</strong> ${escapeHtml(where)}` : "") +
		(address ? `<br><strong>Adress i datan:</strong> ${escapeHtml(address)}` : "") +
		(pageUrl
			? `<br><strong>Sida:</strong> <a href="${escapeHtml(pageUrl)}">${escapeHtml(pageUrl.replace("https://", ""))}</a>`
			: "") +
		"</p>" +
		`<p><strong>Anledning:</strong> ${escapeHtml(reason)}</p>` +
		`<p><strong>Beskrivning:</strong><br>${escapeHtml(description || "(ingen beskrivning lämnad)")}</p>` +
		`<p><strong>Avsändare:</strong> ${escapeHtml(reporter || "(ingen adress lämnad)")}</p>` +
		(appVersion ? `<p><strong>Appversion:</strong> ${escapeHtml(appVersion)}</p>` : "") +
		`<p style="white-space:pre-line">${escapeHtml(recipe)}</p>` +
		`<p>Ärende #${id}. Hantera med <code>pnpm rattelser</code>.</p>`;

	return { subject: `Rättelse (moské): ${name || mosqueId || "okänd moské"}`, text, html };
}

export default {
	async fetch(request, env) {
		if (request.method !== "POST") {
			return new Response("Method not allowed", { status: 405 });
		}

		let payload;
		try {
			payload = await request.json();
		} catch {
			return Response.json({ ok: false, error: "bad_json" }, { status: 400 });
		}

		const id = Number(payload.id) || 0;
		const reporter = clip(payload.reporter_email);
		// Absent `kind` means a payload from before the mosque branch existed — an article.
		const built =
			payload.kind === "mosque"
				? mosqueMessage(payload, id, reporter)
				: articleMessage(payload, id, reporter);

		const message = {
			// The binding is additionally pinned to this one destination_address, so the
			// Worker cannot mail anywhere else even if its input is hostile.
			to: env.NOTIFY_TO,
			from: { email: env.NOTIFY_FROM, name: "islam.se rättelser" },
			subject: built.subject,
			text: built.text,
			html: built.html,
		};

		// Only a syntactically clean address becomes a reply-to header.
		if (reporter && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(reporter)) {
			message.replyTo = reporter;
		}

		try {
			await env.EMAIL.send(message);
		} catch (error) {
			console.error("rattelse-mailer send failed", { id, message: String(error) });
			return Response.json({ ok: false, error: "send_failed" }, { status: 502 });
		}

		return Response.json({ ok: true });
	},
};
