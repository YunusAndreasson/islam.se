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
	/**
	 * Optional hero photo, pre-resized to 1200×630 (jpeg/png/webp bytes). When
	 * present the card becomes the photo with the title laid over a dark scrim —
	 * the essay's own image, on-brand and correctly 1200×630. Without it (tänkare,
	 * trådar) the card falls back to the warm text layout.
	 */
	bgImage?: Buffer;
}

// Satori accepts a lightweight VDOM object at runtime, but its published types
// expect React's ReactNode. Build the tree as plain objects and cast on call.
type SatoriNode = Parameters<typeof satori>[0];

// biome-ignore lint/suspicious/noExplicitAny: satori's plain-object VDOM
function el(type: string, style: Record<string, unknown>, children: any): any {
	return { type, props: { style, children } };
}

const titleSize = (title: string) => (title.length > 22 ? 78 : 96);

// The text-only card (tänkare / trådar): warm surface, kicker + title + framing.
function textCard({ kicker, title, framing }: OgInput) {
	return el(
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
						fontSize: titleSize(title),
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
}

// The photo card (essays with a hero): full-bleed image, a bottom-weighted dark
// scrim for legibility, kicker + title in white, wordmark top-right.
function photoCard({ kicker, title, bgImage }: OgInput) {
	const dataUri = `data:image/jpeg;base64,${(bgImage as Buffer).toString("base64")}`;
	return el(
		"div",
		{
			width: "100%",
			height: "100%",
			display: "flex",
			position: "relative",
			fontFamily: "Source Sans 3",
		},
		[
			{
				type: "img",
				props: {
					src: dataUri,
					width: 1200,
					height: 630,
					style: {
						position: "absolute",
						top: 0,
						left: 0,
						width: 1200,
						height: 630,
						objectFit: "cover",
					},
				},
			},
			el(
				"div",
				{
					position: "absolute",
					top: 0,
					left: 0,
					width: 1200,
					height: 630,
					display: "flex",
					backgroundImage:
						"linear-gradient(180deg, rgba(20,18,16,0.15) 0%, rgba(20,18,16,0.30) 45%, rgba(20,18,16,0.86) 100%)",
				},
				[],
			),
			el(
				"div",
				{
					position: "absolute",
					left: 0,
					bottom: 0,
					width: 1200,
					display: "flex",
					flexDirection: "column",
					padding: "0 88px 80px",
				},
				[
					el(
						"div",
						{
							fontSize: 26,
							fontWeight: 600,
							letterSpacing: 4,
							color: "rgba(255,255,255,0.82)",
							marginBottom: 22,
						},
						kicker.toUpperCase(),
					),
					el(
						"div",
						{
							fontSize: titleSize(title),
							fontWeight: 600,
							letterSpacing: -2,
							lineHeight: 1.05,
							color: "#ffffff",
							maxWidth: 1024,
						},
						title,
					),
				],
			),
			el(
				"div",
				{
					position: "absolute",
					top: 64,
					right: 88,
					display: "flex",
					fontSize: 28,
					fontWeight: 600,
					letterSpacing: 2,
					color: "rgba(255,255,255,0.82)",
				},
				"islam.se",
			),
		],
	);
}

export async function renderOg(input: OgInput): Promise<Buffer> {
	const tree = input.bgImage ? photoCard(input) : textCard(input);

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
