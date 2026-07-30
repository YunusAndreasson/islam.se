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
	page: string;
	passage: string | null;
	description: string;
	source: string | null;
	reporter_email: string | null;
	status: string;
	handled_at: string | null;
	note: string | null;
}

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
	const start = out.indexOf("[");
	if (start === -1) return [];
	const parsed = JSON.parse(out.slice(start)) as { results?: T[] }[];
	return parsed.flatMap((r) => r.results ?? []);
}

function field(label: string, value: string | null): string {
	return value ? `\n  ${label}: ${value.replace(/\n/g, "\n    ")}` : "";
}

function show(rows: Correction[]): void {
	if (rows.length === 0) {
		console.log("Inga rättelser att hantera.");
		return;
	}
	for (const row of rows) {
		const date = row.created_at.replace("T", " ").replace("Z", "");
		console.log(
			`\n#${row.id}  ${date}  [${row.status}]\n  https://islam.se${row.page}` +
				field("Stycket", row.passage) +
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
		 RETURNING id, created_at, page, passage, description, source, reporter_email, status, handled_at, note`,
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
			`SELECT id, created_at, page, passage, description, source, reporter_email, status, handled_at, note
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
