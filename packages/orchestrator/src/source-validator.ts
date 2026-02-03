import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export interface SourceValidation {
	allowed: boolean;
	credibility: "high" | "medium" | "low" | "rejected";
	reason: string;
}

export interface UrlVerification {
	url: string;
	exists: boolean;
	status?: number;
	error?: string;
}

interface CredibleSourcesConfig {
	swedish_academic: string[];
	swedish_open_access: string[];
	swedish_academic_journals: string[];
	swedish_museums: string[];
	swedish_archives_libraries: string[];
	swedish_science: string[];
	swedish_media_tier1: string[];
	swedish_media_tier2: string[];
	swedish_government: string[];
	swedish_research_institutes: string[];
	swedish_law: string[];
	swedish_statistics: string[];
	swedish_islamic: string[];
	nordic_scandinavian: string[];
	international_academic: string[];
	open_access_research: string[];
	islamic_sources: string[];
	international_media_tier1: string[];
	international_media_tier2: string[];
	wikipedia: string[];
	reference_encyclopedias: string[];
	digital_archives: string[];
	international_organizations: string[];
	fact_checking: string[];
	blacklist: string[];
	edu_domain_suffix: string;
}

export class SourceValidator {
	private config: CredibleSourcesConfig;

	constructor() {
		const configPath = join(__dirname, "../config/credible-sources.json");
		this.config = JSON.parse(readFileSync(configPath, "utf-8"));
	}

	/**
	 * Extract domain from URL
	 */
	private extractDomain(url: string): string {
		try {
			const urlObj = new URL(url);
			return urlObj.hostname.toLowerCase();
		} catch {
			return url.toLowerCase();
		}
	}

	/**
	 * Check if domain matches pattern (supports wildcards like blog.*)
	 */
	private matchesDomain(domain: string, pattern: string): boolean {
		if (pattern.includes("*")) {
			const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`);
			return regex.test(domain);
		}
		return domain === pattern || domain.endsWith(`.${pattern}`);
	}

	/**
	 * Check if domain is in blacklist
	 */
	private isBlacklisted(domain: string): boolean {
		return this.config.blacklist.some((pattern) => this.matchesDomain(domain, pattern));
	}

	/**
	 * Check if domain is in list
	 */
	private isInList(domain: string, list: string[]): boolean {
		return list.some((item) => this.matchesDomain(domain, item));
	}

	/**
	 * Validate source credibility
	 */
	public validateSource(url: string): SourceValidation {
		const domain = this.extractDomain(url);

		// 1. Check blacklist first
		if (this.isBlacklisted(domain)) {
			return {
				allowed: false,
				credibility: "rejected",
				reason: "Blacklisted source",
			};
		}

		// 2. Check Swedish academic institutions
		if (this.isInList(domain, this.config.swedish_academic)) {
			return {
				allowed: true,
				credibility: "high",
				reason: "Swedish academic institution",
			};
		}

		// 2b. Check Swedish open access portals
		if (this.isInList(domain, this.config.swedish_open_access)) {
			return {
				allowed: true,
				credibility: "high",
				reason: "Swedish open access research portal",
			};
		}

		// 3. Check Swedish academic journals
		if (this.isInList(domain, this.config.swedish_academic_journals)) {
			return {
				allowed: true,
				credibility: "high",
				reason: "Swedish peer-reviewed journal",
			};
		}

		// 4. Check Swedish government sources
		if (this.isInList(domain, this.config.swedish_government)) {
			return {
				allowed: true,
				credibility: "high",
				reason: "Swedish government source",
			};
		}

		// 5. Check Swedish Islamic organizations
		if (this.isInList(domain, this.config.swedish_islamic)) {
			return {
				allowed: true,
				credibility: "high",
				reason: "Swedish Islamic organization",
			};
		}

		// 5a. Check Swedish research institutes
		if (this.isInList(domain, this.config.swedish_research_institutes)) {
			return {
				allowed: true,
				credibility: "high",
				reason: "Swedish research institute",
			};
		}

		// 5b. Check Swedish law sources
		if (this.isInList(domain, this.config.swedish_law)) {
			return {
				allowed: true,
				credibility: "high",
				reason: "Swedish legal source",
			};
		}

		// 5c. Check Swedish statistics
		if (this.isInList(domain, this.config.swedish_statistics)) {
			return {
				allowed: true,
				credibility: "high",
				reason: "Swedish statistics source",
			};
		}

		// 5d. Check Nordic/Scandinavian sources
		if (this.isInList(domain, this.config.nordic_scandinavian)) {
			return {
				allowed: true,
				credibility: "high",
				reason: "Nordic/Scandinavian academic or reference source",
			};
		}

		// 5e. Check Swedish museums
		if (this.isInList(domain, this.config.swedish_museums)) {
			return {
				allowed: true,
				credibility: "high",
				reason: "Swedish national or regional museum",
			};
		}

		// 5c. Check Swedish archives and libraries
		if (this.isInList(domain, this.config.swedish_archives_libraries)) {
			return {
				allowed: true,
				credibility: "high",
				reason: "Swedish archive or library",
			};
		}

		// 5d. Check Swedish science publications
		if (this.isInList(domain, this.config.swedish_science)) {
			return {
				allowed: true,
				credibility: "high",
				reason: "Swedish science publication",
			};
		}

		// 6. Check Swedish media tier 1
		if (this.isInList(domain, this.config.swedish_media_tier1)) {
			return {
				allowed: true,
				credibility: "high",
				reason: "Swedish quality media",
			};
		}

		// 7. Check Swedish media tier 2
		if (this.isInList(domain, this.config.swedish_media_tier2)) {
			return {
				allowed: true,
				credibility: "medium",
				reason: "Swedish media - verify claims independently",
			};
		}

		// 8. Check international academic
		if (
			domain.endsWith(this.config.edu_domain_suffix) ||
			this.isInList(domain, this.config.international_academic)
		) {
			return {
				allowed: true,
				credibility: "high",
				reason: "International academic source",
			};
		}

		// 9. Check open access research platforms
		if (this.isInList(domain, this.config.open_access_research)) {
			return {
				allowed: true,
				credibility: "high",
				reason: "Open access research platform",
			};
		}

		// 10. Check Islamic scholarly sources
		if (this.isInList(domain, this.config.islamic_sources)) {
			return {
				allowed: true,
				credibility: "high",
				reason: "Islamic scholarly source",
			};
		}

		// 11. Check international media tier 1
		if (this.isInList(domain, this.config.international_media_tier1)) {
			return {
				allowed: true,
				credibility: "high",
				reason: "International quality media",
			};
		}

		// 12. Check international media tier 2
		if (this.isInList(domain, this.config.international_media_tier2)) {
			return {
				allowed: true,
				credibility: "medium",
				reason: "International media - verify claims independently",
			};
		}

		// 13. Check digital archives
		if (this.isInList(domain, this.config.digital_archives)) {
			return {
				allowed: true,
				credibility: "high",
				reason: "Digital archive or library",
			};
		}

		// 14. Check international organizations
		if (this.isInList(domain, this.config.international_organizations)) {
			return {
				allowed: true,
				credibility: "high",
				reason: "International organization",
			};
		}

		// 15. Check fact-checking sites
		if (this.isInList(domain, this.config.fact_checking)) {
			return {
				allowed: true,
				credibility: "high",
				reason: "Fact-checking organization",
			};
		}

		// 16. Check Wikipedia (high credibility for research)
		if (this.isInList(domain, this.config.wikipedia)) {
			return {
				allowed: true,
				credibility: "high",
				reason: "Wikipedia - comprehensive encyclopedia",
			};
		}

		// 17. Check other reference encyclopedias
		if (this.isInList(domain, this.config.reference_encyclopedias)) {
			return {
				allowed: true,
				credibility: "medium",
				reason: "Reference encyclopedia - verify claims with primary sources",
			};
		}

		// 17. Default: unknown source (low credibility, but not rejected)
		return {
			allowed: true,
			credibility: "low",
			reason: "Unknown source - use with caution",
		};
	}

	/**
	 * Validate multiple sources and return statistics
	 */
	public validateSources(urls: string[]): {
		validations: Array<SourceValidation & { url: string }>;
		stats: {
			total: number;
			high: number;
			medium: number;
			low: number;
			rejected: number;
		};
	} {
		const validations = urls.map((url) => ({
			url,
			...this.validateSource(url),
		}));

		const stats = {
			total: validations.length,
			high: validations.filter((v) => v.credibility === "high").length,
			medium: validations.filter((v) => v.credibility === "medium").length,
			low: validations.filter((v) => v.credibility === "low").length,
			rejected: validations.filter((v) => v.credibility === "rejected").length,
		};

		return { validations, stats };
	}

	/**
	 * Verify that a URL actually exists via HTTP HEAD request
	 */
	public async verifyUrl(url: string, timeoutMs = 10000): Promise<UrlVerification> {
		try {
			const controller = new AbortController();
			const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

			const response = await fetch(url, {
				method: "HEAD",
				signal: controller.signal,
				redirect: "follow",
				headers: {
					"User-Agent": "Mozilla/5.0 (compatible; IslamSE/1.0; +https://islam.se)",
				},
			});

			clearTimeout(timeoutId);

			// Consider 2xx and 3xx as existing, also 403 (some sites block HEAD but exist)
			const exists = response.ok || response.status === 403 || response.status === 405;

			return {
				url,
				exists,
				status: response.status,
			};
		} catch (error) {
			// Extract the full error chain (Node fetch wraps errors in cause)
			let errorMessage = "Unknown error";
			if (error instanceof Error) {
				errorMessage = error.message;
				// Check nested cause for DNS errors
				const cause = (error as Error & { cause?: Error }).cause;
				if (cause?.message) {
					errorMessage = cause.message;
				}
			}

			// Check if it's a DNS/network error (hallucinated domain)
			const isDnsError =
				errorMessage.includes("ENOTFOUND") ||
				errorMessage.includes("getaddrinfo") ||
				errorMessage.includes("ECONNREFUSED") ||
				errorMessage.includes("ERR_NAME_NOT_RESOLVED");

			return {
				url,
				exists: false,
				error: isDnsError ? "Domain does not exist (DNS lookup failed)" : errorMessage,
			};
		}
	}

	/**
	 * Verify multiple URLs in parallel with concurrency limit
	 */
	public async verifyUrls(
		urls: string[],
		options: { concurrency?: number; timeoutMs?: number } = {},
	): Promise<{
		results: UrlVerification[];
		stats: {
			total: number;
			verified: number;
			failed: number;
			failedUrls: string[];
		};
	}> {
		const { concurrency = 5, timeoutMs = 10000 } = options;
		const results: UrlVerification[] = [];

		// Process in batches to limit concurrency
		for (let i = 0; i < urls.length; i += concurrency) {
			const batch = urls.slice(i, i + concurrency);
			const batchResults = await Promise.all(batch.map((url) => this.verifyUrl(url, timeoutMs)));
			results.push(...batchResults);
		}

		const failed = results.filter((r) => !r.exists);

		return {
			results,
			stats: {
				total: results.length,
				verified: results.filter((r) => r.exists).length,
				failed: failed.length,
				failedUrls: failed.map((r) => r.url),
			},
		};
	}
}
