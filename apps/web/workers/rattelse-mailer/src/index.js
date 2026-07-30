// Notification mailer for reader corrections.
//
// Pages Functions cannot hold a `send_email` binding, so /api/rattelse reaches this
// Worker over a service binding. It has no route and no workers.dev host: the service
// binding is the only way in.

const MAX_FIELD = 4000;

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
		const page = clip(payload.page);
		const passage = clip(payload.passage);
		const description = clip(payload.description);
		const source = clip(payload.source);
		const reporter = clip(payload.reporter_email);

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

		const message = {
			// The binding is additionally pinned to this one destination_address, so the
			// Worker cannot mail anywhere else even if its input is hostile.
			to: env.NOTIFY_TO,
			from: { email: env.NOTIFY_FROM, name: "islam.se rättelser" },
			subject: `Rättelse: ${page || "okänd sida"}`,
			text,
			html,
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
