import { describe, expect, it } from "vitest";
import {
	ANDROID_PRAYER_STRIP_URL,
	APP_CAMPAIGNS,
	APP_STORE_URL,
	appStoreUrl,
	PLAY_STORE_URL,
	playStoreUrl,
	SMART_APP_BANNER_CONTENT,
} from "./app";

const campaigns = Object.values(APP_CAMPAIGNS);

describe("store campaign links", () => {
	it("gives every surface its own campaign, short enough for App Store Connect", () => {
		expect(
			new Set(campaigns).size,
			"two surfaces share a campaign: the consoles cannot tell them apart",
		).toBe(campaigns.length);
		for (const campaign of campaigns) {
			expect(
				campaign.length,
				`${campaign}: App Store campaign tokens are at most 40 characters`,
			).toBeLessThanOrEqual(40);
		}
	});

	it("tags an App Store link with the provider and the campaign", () => {
		const url = new URL(appStoreUrl(APP_CAMPAIGNS.city));
		expect(url.origin + url.pathname).toBe(APP_STORE_URL);
		expect(url.searchParams.get("pt"), "without pt App Store Connect drops the campaign").toBe(
			"2189605",
		);
		expect(url.searchParams.get("ct")).toBe("web-city");
	});

	it("tags a Google Play link with an install referrer that names the campaign", () => {
		const url = new URL(playStoreUrl(APP_CAMPAIGNS.home));
		expect(url.searchParams.get("id")).toBe("se.islam.mobile");
		const referrer = new URLSearchParams(url.searchParams.get("referrer") ?? "");
		expect(referrer.get("utm_source")).toBe("islam-se");
		expect(referrer.get("utm_medium")).toBe("referral");
		expect(referrer.get("utm_campaign")).toBe("web-home");
	});

	// The two campaigns that went live on 2026-11-21 are counted in the consoles under
	// these exact tokens; renaming one splits its numbers in two.
	it("keeps the launch campaigns' tokens", () => {
		expect(SMART_APP_BANNER_CONTENT).toBe(
			"app-id=6774383118, affiliate-data=pt=2189605&ct=web-safari-banner",
		);
		expect(ANDROID_PRAYER_STRIP_URL).toBe(
			"https://play.google.com/store/apps/details?id=se.islam.mobile&referrer=utm_source%3Dislam-se%26utm_medium%3Dreferral%26utm_campaign%3Dweb-android-strip",
		);
	});

	// The identity URLs feed structured data (sameAs, installUrl) and the manifest; a
	// campaign there would make every crawler's visit look like an install from that surface.
	it("keeps the identity URLs free of campaign parameters", () => {
		expect(APP_STORE_URL).not.toContain("?");
		expect(new URL(PLAY_STORE_URL).searchParams.has("referrer")).toBe(false);
	});
});
