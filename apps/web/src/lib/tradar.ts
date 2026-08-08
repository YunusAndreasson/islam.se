import type { ImageMetadata } from "astro";
import { basename } from "./path";

/**
 * Hero art for the /tradar/ threads.
 *
 * Drop `src/assets/images/tradar/<thread-id>.webp` in and the thread picks it up —
 * that is the whole wiring. A thread without art renders as text, exactly as all five
 * did before, so no thread is ever blocked on a picture.
 *
 * ⚠️ The subfolder is deliberate, and mirrors lib/fordjupning.ts: lib/articles.ts globs
 * `images/*` NON-recursively for essay heroes, so art here can never collide with an
 * essay slug — which it otherwise would the day someone writes an essay called "natten".
 */
const artEntries = Object.entries(
	import.meta.glob<{ default: ImageMetadata }>("../assets/images/tradar/*.{jpg,jpeg,png,webp}", {
		eager: true,
	}),
);

const TRADAR_ART: ReadonlyMap<string, ImageMetadata> = new Map(
	artEntries.map(([path, mod]) => [basename(path, /\.[^.]+$/), mod.default]),
);

export function threadArt(id: string): ImageMetadata | undefined {
	return TRADAR_ART.get(id);
}
