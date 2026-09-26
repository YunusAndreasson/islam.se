import { ogEndpoint } from "../../lib/og-endpoints";

// Shared share card for every /ai-barometern/ page. It names no figure, so it never goes
// stale between measurements.
export const GET = ogEndpoint(
	() => ({
		kicker: "Barometer",
		title: "Vad svarar AI-modellerna?",
		framing: "ChatGPT, Claude, Gemini, Grok och DeepSeek om klimatet, AI, krig och tro.",
	}),
	() => "ai-barometern-hub",
);
