import { readFileSync } from "node:fs";
import { join } from "node:path";
import satori from "satori";
import sharp from "sharp";

// Reuse the print fonts already vendored for the PDF (scripts/fonts). Satori
// converts text to vector paths using these, so the rasterised PNG carries no
// font dependency. Build-time only — these endpoints are prerendered (§11 OG).
// Resolve from cwd (apps/web during build); import.meta.url would point into
// the bundled dist/ chunk after Vite rewrites it.
const fontDir = join(process.cwd(), "scripts/fonts");
const sourceSemibold = readFileSync(join(fontDir, "SourceSans3-SemiBold.ttf"));
const sourceRegular = readFileSync(join(fontDir, "SourceSans3-Regular.ttf"));
const literataItalic = readFileSync(join(fontDir, "Literata-RegularItalic.ttf"));

// Warm palette, matching the site's light surface (tokens.css).
const BG = "#faf8f5";
const TEXT = "#1a1914";
const MUTED = "#847a6e";
const ACCENT = "#3a3830";

interface OgInput {
	kicker: string;
	title: string;
	framing: string;
}

// Satori accepts a lightweight VDOM object at runtime, but its published types
// expect React's ReactNode. Build the tree as plain objects and cast on call.
type SatoriNode = Parameters<typeof satori>[0];

// biome-ignore lint/suspicious/noExplicitAny: satori's plain-object VDOM
function el(type: string, style: Record<string, unknown>, children: any): any {
	return { type, props: { style, children } };
}

export async function renderOg({ kicker, title, framing }: OgInput): Promise<Buffer> {
	const tree = el(
		"div",
		{
			width: "100%",
			height: "100%",
			display: "flex",
			flexDirection: "column",
			justifyContent: "space-between",
			padding: "84px 88px",
			backgroundColor: BG,
			color: TEXT,
			fontFamily: "Source Sans 3",
		},
		[
			el("div", { display: "flex", flexDirection: "column" }, [
				el(
					"div",
					{ fontSize: 26, fontWeight: 600, letterSpacing: 4, color: MUTED, marginBottom: 28 },
					kicker.toUpperCase(),
				),
				el(
					"div",
					{
						fontSize: title.length > 22 ? 78 : 96,
						fontWeight: 600,
						letterSpacing: -2,
						lineHeight: 1.05,
						color: TEXT,
					},
					title,
				),
				el(
					"div",
					{
						fontFamily: "Literata",
						fontStyle: "italic",
						fontSize: 32,
						lineHeight: 1.4,
						color: ACCENT,
						marginTop: 34,
						maxWidth: 880,
					},
					framing,
				),
			]),
			el(
				"div",
				{ display: "flex", fontSize: 28, fontWeight: 600, letterSpacing: 2, color: MUTED },
				"islam.se",
			),
		],
	);

	const svg = await satori(tree as SatoriNode, {
		width: 1200,
		height: 630,
		fonts: [
			{ name: "Source Sans 3", data: sourceSemibold, weight: 600, style: "normal" },
			{ name: "Source Sans 3", data: sourceRegular, weight: 400, style: "normal" },
			{ name: "Literata", data: literataItalic, weight: 400, style: "italic" },
		],
	});

	return sharp(Buffer.from(svg)).png().toBuffer();
}
