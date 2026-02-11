import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

interface SourceValidation {
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
	 * High credibility source categories
	 */
	private readonly highCredibilitySources: Array<{
		list: keyof CredibleSourcesConfig;
		reason: string;
	}> = [
		{ list: "swedish_academic", reason: "Swedish academic institution" },
		{ list: "swedish_open_access", reason: "Swedish open access research portal" },
		{ list: "swedish_academic_journals", reason: "Swedish peer-reviewed journal" },
		{ list: "swedish_government", reason: "Swedish government source" },
		{ list: "swedish_islamic", reason: "Swedish Islamic organization" },
		{ list: "swedish_research_institutes", reason: "Swedish research institute" },
		{ list: "swedish_law", reason: "Swedish legal source" },
		{ list: "swedish_statistics", reason: "Swedish statistics source" },
		{ list: "nordic_scandinavian", reason: "Nordic/Scandinavian academic or reference source" },
		{ list: "swedish_museums", reason: "Swedish national or regional museum" },
		{ list: "swedish_archives_libraries", reason: "Swedish archive or library" },
		{ list: "swedish_science", reason: "Swedish science publication" },
		{ list: "swedish_media_tier1", reason: "Swedish quality media" },
		{ list: "international_academic", reason: "International academic source" },
		{ list: "open_access_research", reason: "Open access research platform" },
		{ list: "islamic_sources", reason: "Islamic scholarly source" },
		{ list: "international_media_tier1", reason: "International quality media" },
		{ list: "digital_archives", reason: "Digital archive or library" },
		{ list: "international_organizations", reason: "International organization" },
		{ list: "fact_checking", reason: "Fact-checking organization" },
		{ list: "wikipedia", reason: "Wikipedia - comprehensive encyclopedia" },
	];

	/**
	 * Medium credibility source categories
	 */
	private readonly mediumCredibilitySources: Array<{
		list: keyof CredibleSourcesConfig;
		reason: string;
	}> = [
		{ list: "swedish_media_tier2", reason: "Swedish media - verify claims independently" },
		{
			list: "international_media_tier2",
			reason: "International media - verify claims independently",
		},
		{
			list: "reference_encyclopedias",
			reason: "Reference encyclopedia - verify claims with primary sources",
		},
	];

	/**
	 * Check high credibility sources
	 */
	private checkHighCredibility(domain: string): SourceValidation | null {
		// Special case: .edu domains
		if (domain.endsWith(this.config.edu_domain_suffix)) {
			return { allowed: true, credibility: "high", reason: "International academic source" };
		}

		for (const source of this.highCredibilitySources) {
			const list = this.config[source.list];
			if (Array.isArray(list) && this.isInList(domain, list)) {
				return { allowed: true, credibility: "high", reason: source.reason };
			}
		}
		return null;
	}

	/**
	 * Check medium credibility sources
	 */
	private checkMediumCredibility(domain: string): SourceValidation | null {
		for (const source of this.mediumCredibilitySources) {
			const list = this.config[source.list];
			if (Array.isArray(list) && this.isInList(domain, list)) {
				return { allowed: true, credibility: "medium", reason: source.reason };
			}
		}
		return null;
	}

	/**
	 * Validate source credibility
	 */
	public validateSource(url: string): SourceValidation {
		const domain = this.extractDomain(url);

		// 1. Check blacklist first
		if (this.isBlacklisted(domain)) {
			return { allowed: false, credibility: "rejected", reason: "Blacklisted source" };
		}

		// 2. Check high credibility sources
		const highResult = this.checkHighCredibility(domain);
		if (highResult) return highResult;

		// 3. Check medium credibility sources
		const mediumResult = this.checkMediumCredibility(domain);
		if (mediumResult) return mediumResult;

		// 4. Default: unknown source (low credibility, but not rejected)
		return { allowed: true, credibility: "low", reason: "Unknown source - use with caution" };
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
