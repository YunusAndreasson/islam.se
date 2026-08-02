#!/usr/bin/env tsx
// Read and triage reader-submitted corrections held in the islam-se-rattelser D1
// database. Run from apps/web so wrangler picks up wrangler.jsonc.
//
//   pnpm rattelser              unhandled corrections
//   pnpm rattelser --all        every correction
//   pnpm rattelser fix 12       mark #12 fixed
//   pnpm rattelser reject 12 "dubblett"
//   pnpm rattelser --local      read the local dev database instead

import { execFileSync } from "node:child_process";

const DB = "islam-se-rattelser";

interface Correction {
	id: number;
	created_at: string;
	kind: string;
	page: string;
	mosque_id: string | null;
	reason: string | null;
	passage: string | null;
	description: string;
	source: string | null;
	reporter_email: string | null;
	status: string;
	handled_at: string | null;
	note: string | null;
}

// Every column show() and the fix/reject confirmations read. Kept as one constant so the
// SELECT and the two RETURNING clauses cannot drift apart.
const COLUMNS =
	"id, created_at, kind, page, mosque_id, reason, passage, description, source, reporter_email, status, handled_at, note";

// Mirrors REASON_LABELS in workers/rattelse-mailer/src/index.js.
const REASON_LABELS: Record<string, string> = {
	stangd: "Moskén har stängt",
	adress: "Adressen stämmer inte",
	namn: "Namnet stämmer inte",
	plats: "Kartnålen sitter fel",
	annat: "Något annat",
};

// D1 has no parameter binding over the CLI, so every interpolated value is either
// checked to be an integer or single-quote escaped before it reaches the shell.
function quote(value: string): string {
	return `'${value.replace(/'/g, "''")}'`;
}

function requireId(raw: string | undefined): number {
	const id = Number(raw);
	if (!Number.isInteger(id) || id <= 0) {
		console.error(`Ogiltigt ärendenummer: ${raw ?? "(saknas)"}`);
		process.exit(1);
	}
	return id;
}

function query<T>(sql: string, remote: boolean): T[] {
	const args = [
		"wrangler",
		"d1",
		"execute",
		DB,
		remote ? "--remote" : "--local",
		"--json",
		"--command",
		sql,
	];
	let out: string;
	try {
		out = execFileSync("npx", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
	} catch (error) {
		const err = error as { stderr?: string; stdout?: string };
		console.error(err.stderr || err.stdout || String(error));
		process.exit(1);
	}
	// ⚠️ wrangler prints a banner and log lines to stdout ahead of the payload, and one
	// bracket in any of them ("[wrangler:info] …", an update notice) makes the first "["
	// the wrong one. Try each candidate rather than assuming, so the triage tool cannot
	// die on a SyntaxError over a version notice.
	for (let i = out.indexOf("["); i !== -1; i = out.indexOf("[", i + 1)) {
		try {
			const parsed = JSON.parse(out.slice(i)) as { results?: T[] }[];
			if (Array.isArray(parsed)) return parsed.flatMap((r) => r.results ?? []);
		} catch {
			// Not the start of the payload — keep looking.
		}
	}
	return [];
}

function field(label: string, value: string | null): string {
	return value ? `\n  ${label}: ${value.replace(/\n/g, "\n    ")}` : "";
}

// The identifying line under the header. An article correction points at the page it came
// from; a mosque report leads with the record id and reason — that is the thing you edit —
// and then the city page, where the mosque is one anchor among several.
function subject(row: Correction): string {
	if (row.kind !== "mosque") return `  https://islam.se${row.page}`;
	const reason = row.reason ? (REASON_LABELS[row.reason] ?? row.reason) : "okänd anledning";
	const id = row.mosque_id ?? "(okänt id)";
	return `  🕌 ${id} · ${reason}\n  https://islam.se${row.page}#${id}`;
}

function show(rows: Correction[]): void {
	if (rows.length === 0) {
		console.log("Inga rättelser att hantera.");
		return;
	}
	for (const row of rows) {
		const date = row.created_at.replace("T", " ").replace("Z", "");
		// For a mosque row `passage` holds the snapshot of what the app was displaying, which
		// is what you compare the report against — hence the different label.
		const passageLabel = row.kind === "mosque" ? "I datan" : "Stycket";
		console.log(
			`\n#${row.id}  ${date}  [${row.status}]\n${subject(row)}` +
				field(passageLabel, row.passage) +
				field("Fel", row.description) +
				field("Källa", row.source) +
				field("Avsändare", row.reporter_email) +
				field("Notering", row.note),
		);
	}
	console.log(`\n${rows.length} ärende${rows.length === 1 ? "" : "n"}.`);
}

const argv = process.argv.slice(2);
const local = argv.includes("--local");
const remote = !local;
const all = argv.includes("--all");
const positional = argv.filter((a) => !a.startsWith("--"));
const [command, idArg, ...rest] = positional;

if (command === "fix" || command === "reject") {
	const id = requireId(idArg);
	const status = command === "fix" ? "fixed" : "rejected";
	const note = rest.join(" ").trim();
	const noteSql = note ? `, note = ${quote(note)}` : "";

	// Closing a case drops the reporter's address. The integritetspolicy promises
	// this, so it has to happen here rather than by hand.
	const updated = query<Correction>(
		`UPDATE corrections
		 SET status = ${quote(status)},
		     handled_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now'),
		     reporter_email = NULL${noteSql}
		 WHERE id = ${id}
		 RETURNING ${COLUMNS}`,
		remote,
	);

	if (updated.length === 0) {
		console.error(`Hittade inget ärende #${id}.`);
		process.exit(1);
	}
	console.log(`#${id} är nu ${status}.`);
} else if (command === undefined) {
	const where = all ? "" : "WHERE status = 'new'";
	show(
		query<Correction>(
			`SELECT ${COLUMNS}
			 FROM corrections ${where} ORDER BY created_at DESC LIMIT 200`,
			remote,
		),
	);
} else {
	console.error(
		"Användning:\n  pnpm rattelser [--all] [--local]\n  pnpm rattelser fix <id> [notering]\n  pnpm rattelser reject <id> [notering]",
	);
	process.exit(1);
}
