import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	type DomainTrackerData,
	formatBlockedDomainsPrompt,
	formatDomainReputation,
	getBlockedDomains,
	loadDomainTracker,
	recordPublishedArticle,
	saveDomainTracker,
	updateDomainTracker,
} from "./domain-tracker.js";

describe("DomainTracker", () => {
	let tmpDir: string;
	let tmpPath: string;

	beforeEach(() => {
		tmpDir = mkdtempSync(join(tmpdir(), "domain-tracker-"));
		tmpPath = join(tmpDir, "web-domains.json");
	});

	afterEach(() => {
		rmSync(tmpDir, { recursive: true, force: true });
	});

	it("returns empty state when file does not exist", () => {
		const data = loadDomainTracker(tmpPath);
		expect(data).toEqual({ version: 1, domains: {} });
	});

	it("round-trips save and load", () => {
		const data: DomainTrackerData = {
			version: 1,
			domains: {
				"example.com": { total: 3, ok: 2, failed: 1, lastChecked: "2026-01-01T00:00:00Z" },
			},
		};
		saveDomainTracker(data, tmpPath);
		const loaded = loadDomainTracker(tmpPath);
		expect(loaded).toEqual(data);
	});

	it("updates stats from verification results", () => {
		let data: DomainTrackerData = { version: 1, domains: {} };
		data = updateDomainTracker(data, [
			{ url: "https://example.com/page1", exists: true, status: 200 },
			{ url: "https://example.com/page2", exists: false, error: "404 Not Found" },
			{ url: "https://other.org/article", exists: true, status: 200 },
		]);

		const ex = data.domains["example.com"];
		expect(ex?.total).toBe(2);
		expect(ex?.ok).toBe(1);
		expect(ex?.failed).toBe(1);
		expect(ex?.lastError).toBe("404 Not Found");
		const ot = data.domains["other.org"];
		expect(ot?.total).toBe(1);
		expect(ot?.ok).toBe(1);
	});

	it("accumulates stats across multiple updates", () => {
		let data: DomainTrackerData = { version: 1, domains: {} };
		data = updateDomainTracker(data, [
			{ url: "https://bad.example/a", exists: false, error: "DNS fail" },
		]);
		data = updateDomainTracker(data, [
			{ url: "https://bad.example/b", exists: false, error: "DNS fail" },
		]);
		const bad = data.domains["bad.example"];
		expect(bad?.total).toBe(2);
		expect(bad?.failed).toBe(2);
	});

	it("getBlockedDomains blocks high-failure domains", () => {
		const data: DomainTrackerData = {
			version: 1,
			domains: {
				"good.com": { total: 10, ok: 9, failed: 1, lastChecked: "" },
				"bad.com": { total: 5, ok: 1, failed: 4, lastChecked: "" },
				"new.com": { total: 1, ok: 0, failed: 1, lastChecked: "" }, // below minSamples
			},
		};
		const blocked = getBlockedDomains(data);
		expect(blocked).toEqual(["bad.com"]);
	});

	it("formatBlockedDomainsPrompt returns empty string when no blocked domains", () => {
		expect(formatBlockedDomainsPrompt([])).toBe("");
	});

	it("formatBlockedDomainsPrompt formats domain list", () => {
		const result = formatBlockedDomainsPrompt(["bad.com", "fake.org"]);
		expect(result).toContain("<blocked_domains>");
		expect(result).toContain("- bad.com");
		expect(result).toContain("- fake.org");
		expect(result).toContain("</blocked_domains>");
	});

	it("recordPublishedArticle updates publishedIn and avgScore", () => {
		const data: DomainTrackerData = {
			version: 1,
			domains: {
				"good.com": { total: 3, ok: 3, failed: 0, lastChecked: "" },
				"other.com": { total: 1, ok: 1, failed: 0, lastChecked: "" },
			},
		};
		recordPublishedArticle(data, ["https://good.com/page1", "https://other.com/x"], 8.5);
		expect(data.domains["good.com"]?.publishedIn).toBe(1);
		expect(data.domains["good.com"]?.avgScore).toBe(8.5);

		// Second article with different score
		recordPublishedArticle(data, ["https://good.com/page2"], 9.0);
		expect(data.domains["good.com"]?.publishedIn).toBe(2);
		expect(data.domains["good.com"]?.avgScore).toBeCloseTo(8.75);
	});

	it("recordPublishedArticle ignores unknown domains", () => {
		const data: DomainTrackerData = { version: 1, domains: {} };
		recordPublishedArticle(data, ["https://unknown.com/page"], 8.0);
		expect(data.domains["unknown.com"]).toBeUndefined();
	});

	it("formatDomainReputation returns empty when no reputation data", () => {
		const data: DomainTrackerData = {
			version: 1,
			domains: {
				"new.com": { total: 1, ok: 1, failed: 0, lastChecked: "" },
			},
		};
		expect(formatDomainReputation(data, ["https://new.com/page"])).toBe("");
	});

	it("INVARIANT: total always equals ok + failed", () => {
		let data: DomainTrackerData = { version: 1, domains: {} };
		// Apply a sequence of mixed updates
		data = updateDomainTracker(data, [
			{ url: "https://a.com/1", exists: true, status: 200 },
			{ url: "https://a.com/2", exists: false, error: "404" },
			{ url: "https://a.com/3", exists: true, status: 200 },
			{ url: "https://b.com/1", exists: false, error: "DNS" },
		]);
		data = updateDomainTracker(data, [
			{ url: "https://a.com/4", exists: false, error: "timeout" },
			{ url: "https://b.com/2", exists: true, status: 200 },
		]);
		for (const [domain, stats] of Object.entries(data.domains)) {
			expect(
				stats.total,
				`INVARIANT violated for ${domain}: total (${stats.total}) !== ok (${stats.ok}) + failed (${stats.failed})`,
			).toBe(stats.ok + stats.failed);
		}
	});

	it("INVARIANT: getBlockedDomains is stable (idempotent)", () => {
		const data: DomainTrackerData = {
			version: 1,
			domains: {
				"good.com": { total: 10, ok: 9, failed: 1, lastChecked: "" },
				"bad.com": { total: 5, ok: 1, failed: 4, lastChecked: "" },
			},
		};
		const first = getBlockedDomains(data);
		const second = getBlockedDomains(data);
		expect(first, "getBlockedDomains should return same result on repeated calls").toEqual(second);
	});

	it("formatDomainReputation formats known domains", () => {
		const data: DomainTrackerData = {
			version: 1,
			domains: {
				"trusted.com": {
					total: 5,
					ok: 5,
					failed: 0,
					lastChecked: "",
					publishedIn: 3,
					avgScore: 8.6,
				},
			},
		};
		const result = formatDomainReputation(data, ["https://trusted.com/article"]);
		expect(result).toContain("<domain_reputation>");
		expect(result).toContain("trusted.com: used in 3 published articles, avg score 8.6/10");
		expect(result).toContain("Sources without track record");
	});
});
