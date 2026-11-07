import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_PER_HOUR, storeCorrection } from "./_corrections.js";
import type { CorrectionDatabase } from "./_types";
import { onRequestPost as mosque } from "./moske-rattelse.js";
import { onRequestPost as article } from "./rattelse.js";

let sqlite: DatabaseSync;
let database: CorrectionDatabase;
beforeEach(() => {
	sqlite = new DatabaseSync(":memory:");
	for (const migration of ["0001_corrections.sql", "0002_mosque_corrections.sql"]) {
		sqlite.exec(readFileSync(new URL(`../../migrations/${migration}`, import.meta.url), "utf8"));
	}
	database = {
		prepare: (sql) => ({
			bind: (...values) => ({
				first: async () => {
					const row = sqlite.prepare(sql).get(...values);
					return row ? { id: Number(row.id) } : null;
				},
			}),
		}),
	};
});
afterEach(() => {
	sqlite.close();
	vi.unstubAllGlobals();
});

const input = {
	kind: "article" as const,
	page: "/svar/test/",
	passage: "",
	description: "En rättelse",
	reporterEmail: "",
	ipHash: "test-hash",
};

describe("atomic correction storage", () => {
	// Separate SELECT and INSERT calls let simultaneous handlers all see spare quota.
	// Exercise the real SQL and both public handlers sharing one migrated database.
	it("enforces one shared cap across simultaneous article and mosque submissions", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => Response.json({ success: true })),
		);
		const mail = vi.fn(async () => ({ ok: true, status: 200 }));
		const env = {
			IP_SALT: "test",
			TURNSTILE_SECRET: "test",
			RATTELSER: database,
			MAILER: { fetch: mail },
		};
		const responses = await Promise.all(
			Array.from({ length: 12 }, (_, index) => {
				const isMosque = index % 2 === 0;
				const body = isMosque
					? {
							mosque_id: "test-mosque",
							mosque_name: "Test",
							city_slug: "stockholm",
							reason: "stangd",
						}
					: {
							page: "/svar/test/",
							description: "En tillräckligt lång rättelse",
							turnstile_token: "test",
						};
				const request = new Request("https://islam.se/api/correction", {
					method: "POST",
					headers: { "cf-connecting-ip": "203.0.113.4" },
					body: JSON.stringify(body),
				});
				return (isMosque ? mosque : article)({ request, env });
			}),
		);
		expect(responses.filter((response) => response.status === 200)).toHaveLength(MAX_PER_HOUR);
		expect(responses.filter((response) => response.status === 429)).toHaveLength(12 - MAX_PER_HOUR);
		expect(sqlite.prepare("SELECT count(*) AS n FROM corrections").get()?.n).toBe(MAX_PER_HOUR);
		expect(mail).toHaveBeenCalledTimes(MAX_PER_HOUR);
	});

	it("allows another IP and ignores expired reports", async () => {
		for (let i = 0; i < MAX_PER_HOUR; i++)
			expect(await storeCorrection(database, input)).not.toBeNull();
		expect(await storeCorrection(database, input)).toBeNull();
		expect(await storeCorrection(database, { ...input, ipHash: "other" })).not.toBeNull();
		sqlite.exec(
			"UPDATE corrections SET created_at = strftime('%Y-%m-%dT%H:%M:%SZ', 'now', '-2 hours')",
		);
		expect(await storeCorrection(database, input)).not.toBeNull();
	});

	it("stores reader text as data and retains the article defaults", async () => {
		const description = "'); DROP TABLE corrections; --";
		const id = await storeCorrection(database, { ...input, description });
		expect(
			sqlite
				.prepare(
					"SELECT kind, description, source, mosque_id, reason FROM corrections WHERE id = ?",
				)
				.get(id),
		).toEqual({
			kind: "article",
			description,
			source: null,
			mosque_id: null,
			reason: null,
		});
	});
});
