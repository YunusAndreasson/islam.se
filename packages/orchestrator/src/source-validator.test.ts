import { describe, expect, it, vi } from "vitest";
import { SourceValidator } from "./source-validator.js";

describe("SourceValidator", () => {
	const validator = new SourceValidator();

	describe("validateSource", () => {
		describe("Swedish academic institutions", () => {
			it("returns high credibility for lu.se", () => {
				const result = validator.validateSource("https://www.lu.se/article");

				expect(result.allowed).toBe(true);
				expect(result.credibility).toBe("high");
				expect(result.reason).toContain("academic");
			});

			it("returns high credibility for subdomain of academic site", () => {
				const result = validator.validateSource("https://ctr.lu.se/research");

				expect(result.credibility).toBe("high");
			});

			it("returns high credibility for kth.se", () => {
				const result = validator.validateSource("https://www.kth.se/article");

				expect(result.credibility).toBe("high");
			});
		});

		describe("Swedish government sources", () => {
			it("returns high credibility for scb.se", () => {
				const result = validator.validateSource("https://scb.se/statistics");

				expect(result.allowed).toBe(true);
				expect(result.credibility).toBe("high");
				expect(result.reason).toContain("government");
			});

			it("returns high credibility for regeringen.se", () => {
				const result = validator.validateSource("https://www.regeringen.se/policy");

				expect(result.credibility).toBe("high");
			});
		});

		describe("Swedish media", () => {
			it("returns high credibility for tier 1 media (dn.se)", () => {
				const result = validator.validateSource("https://dn.se/kultur/article");

				expect(result.credibility).toBe("high");
				expect(result.reason).toContain("quality media");
			});

			it("returns medium credibility for tier 2 media (aftonbladet.se)", () => {
				const result = validator.validateSource("https://aftonbladet.se/article");

				expect(result.credibility).toBe("medium");
				expect(result.reason).toContain("verify");
			});
		});

		describe("International academic", () => {
			it("returns high credibility for .edu domains", () => {
				const result = validator.validateSource("https://www.stanford.edu/research");

				expect(result.credibility).toBe("high");
				expect(result.reason).toContain("academic");
			});

			it("returns high credibility for jstor.org", () => {
				const result = validator.validateSource("https://jstor.org/stable/123");

				expect(result.credibility).toBe("high");
			});

			it("returns high credibility for harvard.edu", () => {
				const result = validator.validateSource("https://www.harvard.edu/article");

				expect(result.credibility).toBe("high");
			});

			it("returns high credibility for wikipedia.org", () => {
				const result = validator.validateSource("https://en.wikipedia.org/wiki/Article");

				expect(result.allowed).toBe(true);
				expect(result.credibility).toBe("high");
				expect(result.reason).toContain("Wikipedia");
			});
		});

		describe("Blacklisted sources", () => {
			it("rejects medium.com", () => {
				const result = validator.validateSource("https://medium.com/@user/article");

				expect(result.credibility).toBe("rejected");
			});

			it("rejects twitter.com", () => {
				const result = validator.validateSource("https://twitter.com/user/status/123");

				expect(result.credibility).toBe("rejected");
			});

			it("rejects blog.* wildcard pattern", () => {
				const result = validator.validateSource("https://blog.example.com/post");

				expect(result.credibility).toBe("rejected");
			});
		});

		describe("Unknown sources", () => {
			it("returns low credibility for unknown domains", () => {
				const result = validator.validateSource("https://random-unknown-site.net/article");

				expect(result.allowed).toBe(true);
				expect(result.credibility).toBe("low");
				expect(result.reason).toContain("Unknown");
			});
		});

		describe("URL parsing", () => {
			it("handles URLs with paths", () => {
				const result = validator.validateSource("https://lu.se/path/to/article");

				expect(result.credibility).toBe("high");
			});

			it("handles URLs with query parameters", () => {
				const result = validator.validateSource("https://dn.se/article?id=123&ref=home");

				expect(result.credibility).toBe("high");
			});

			it("handles URLs without protocol gracefully", () => {
				// The validator should still work with bare domains
				const result = validator.validateSource("lu.se");

				// May return low since URL parsing fails, but shouldn't crash
				expect(result).toBeDefined();
				expect(typeof result.credibility).toBe("string");
			});

			it("normalizes domain to lowercase", () => {
				const result = validator.validateSource("https://LU.SE/Article");

				expect(result.credibility).toBe("high");
			});
		});
	});

	describe("validateSources", () => {
		it("validates multiple sources and returns stats", () => {
			const urls = [
				"https://lu.se/article1",
				"https://aftonbladet.se/article2",
				"https://wikipedia.org/wiki/Test",
				"https://random-site.com/page",
			];

			const { validations, stats } = validator.validateSources(urls);

			expect(validations).toHaveLength(4);
			expect(stats.total).toBe(4);
			expect(stats.high).toBe(2); // lu.se, wikipedia.org
			expect(stats.medium).toBe(1); // aftonbladet.se
			expect(stats.rejected).toBe(0);
			expect(stats.low).toBe(1); // random-site.com
		});

		it("returns empty stats for empty input", () => {
			const { validations, stats } = validator.validateSources([]);

			expect(validations).toHaveLength(0);
			expect(stats.total).toBe(0);
			expect(stats.high).toBe(0);
		});
	});

	describe("verifyUrl", () => {
		it("returns exists=true for successful HEAD request", async () => {
			// Mock fetch globally for this test
			const originalFetch = globalThis.fetch;
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: true,
				status: 200,
			});

			try {
				const result = await validator.verifyUrl("https://example.com/page");

				expect(result.exists).toBe(true);
				expect(result.status).toBe(200);
			} finally {
				globalThis.fetch = originalFetch;
			}
		});

		it("returns exists=true for 403 status (some sites block HEAD)", async () => {
			const originalFetch = globalThis.fetch;
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 403,
			});

			try {
				const result = await validator.verifyUrl("https://example.com/page");

				expect(result.exists).toBe(true);
				expect(result.status).toBe(403);
			} finally {
				globalThis.fetch = originalFetch;
			}
		});

		it("returns exists=true for 405 status (method not allowed)", async () => {
			const originalFetch = globalThis.fetch;
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 405,
			});

			try {
				const result = await validator.verifyUrl("https://example.com/page");

				expect(result.exists).toBe(true);
				expect(result.status).toBe(405);
			} finally {
				globalThis.fetch = originalFetch;
			}
		});

		it("returns exists=false for 404 status", async () => {
			const originalFetch = globalThis.fetch;
			globalThis.fetch = vi.fn().mockResolvedValue({
				ok: false,
				status: 404,
			});

			try {
				const result = await validator.verifyUrl("https://example.com/nonexistent");

				expect(result.exists).toBe(false);
				expect(result.status).toBe(404);
			} finally {
				globalThis.fetch = originalFetch;
			}
		});

		it("returns exists=false with DNS error message for ENOTFOUND", async () => {
			const originalFetch = globalThis.fetch;
			const dnsError = new Error("fetch failed");
			(dnsError as Error & { cause?: Error }).cause = new Error(
				"getaddrinfo ENOTFOUND fake.domain.xyz",
			);
			globalThis.fetch = vi.fn().mockRejectedValue(dnsError);

			try {
				const result = await validator.verifyUrl("https://fake.domain.xyz/page");

				expect(result.exists).toBe(false);
				expect(result.error).toContain("DNS");
			} finally {
				globalThis.fetch = originalFetch;
			}
		});

		it("handles timeout correctly", async () => {
			const originalFetch = globalThis.fetch;
			globalThis.fetch = vi.fn().mockImplementation(() => {
				return new Promise((_, reject) => {
					setTimeout(() => reject(new Error("AbortError")), 100);
				});
			});

			try {
				const result = await validator.verifyUrl("https://slow.example.com", 50);

				// Should complete (either timeout or abort)
				expect(result.url).toBe("https://slow.example.com");
			} finally {
				globalThis.fetch = originalFetch;
			}
		});
	});

	describe("verifyUrls", () => {
		it("verifies multiple URLs and returns stats", async () => {
			const originalFetch = globalThis.fetch;
			globalThis.fetch = vi
				.fn()
				.mockResolvedValueOnce({ ok: true, status: 200 })
				.mockResolvedValueOnce({ ok: false, status: 404 })
				.mockResolvedValueOnce({ ok: true, status: 200 });

			try {
				const { results, stats } = await validator.verifyUrls([
					"https://valid1.com",
					"https://invalid.com",
					"https://valid2.com",
				]);

				expect(results).toHaveLength(3);
				expect(stats.total).toBe(3);
				expect(stats.verified).toBe(2);
				expect(stats.failed).toBe(1);
				expect(stats.failedUrls).toContain("https://invalid.com");
			} finally {
				globalThis.fetch = originalFetch;
			}
		});

		it("respects concurrency limit", async () => {
			const originalFetch = globalThis.fetch;
			let concurrentCalls = 0;
			let maxConcurrent = 0;

			globalThis.fetch = vi.fn().mockImplementation(async () => {
				concurrentCalls++;
				maxConcurrent = Math.max(maxConcurrent, concurrentCalls);
				await new Promise((r) => setTimeout(r, 10));
				concurrentCalls--;
				return { ok: true, status: 200 };
			});

			try {
				await validator.verifyUrls(
					["https://1.com", "https://2.com", "https://3.com", "https://4.com", "https://5.com"],
					{ concurrency: 2 },
				);

				expect(maxConcurrent).toBeLessThanOrEqual(2);
			} finally {
				globalThis.fetch = originalFetch;
			}
		});
	});

	describe("domain matching", () => {
		it("matches exact domains", () => {
			const result = validator.validateSource("https://lu.se/page");
			expect(result.credibility).toBe("high");
		});

		it("matches subdomains", () => {
			const result = validator.validateSource("https://subdomain.lu.se/page");
			expect(result.credibility).toBe("high");
		});

		it("handles wildcard patterns (blog.*)", () => {
			const result1 = validator.validateSource("https://blog.example.com");
			const result2 = validator.validateSource("https://blog.any-domain.org");

			expect(result1.credibility).toBe("rejected");
			expect(result2.credibility).toBe("rejected");
		});
	});
});
