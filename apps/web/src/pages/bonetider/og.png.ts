import { ogEndpoint } from "../../lib/og-endpoints";

// Shared Open Graph card for the hub and the long-tail city pages (those below the
// per-city OG threshold) – date-independent, so it never goes stale.
export const GET = ogEndpoint(() => ({
	kicker: "Bönetider",
	title: "Bönetider i Sverige",
	framing: "Solens tider, ort för ort – från Malmö till Kiruna.",
}));
