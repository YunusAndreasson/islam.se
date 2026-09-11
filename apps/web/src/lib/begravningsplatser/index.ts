// Data layer for the Muslim burial grounds on the /moskeer map. The committed JSON
// (src/data/begravningsplatser-sverige.json) is hand-curated and canonical — edit it
// directly — and, like the mosque list, it is the copy the mobile app mirrors
// (`pnpm sync:data` in apps/mobile). Everything here is pure and build-time.
//
// WHAT A RECORD IS. One cemetery with a part set aside for Muslim burial. Nearly always that
// is a kvarter inside a general begravningsplats run by Svenska kyrkan — or, in Stockholm and
// Tranås, by the kommun — because that is how begravningslagen 2 kap. 2 § gets met; separate
// Muslim cemeteries barely exist in Sweden. The pin sits on the Muslim section itself where
// OpenStreetMap maps it, otherwise on the cemetery, or, for a churchyard with no mapped
// outline, on its church.
//
// ⚠️ Every record carries the `source` that confirms the Muslim section exists: the
// huvudman's own page where it has one, local news where it does not. A place with no source
// does not go in — funeral-home lists repeat each other, and one of them names a Muslim
// kvarter at Lidingö kyrkogård that Lidingö församling's own pages never mention. A place
// that is only planned does not go in either: a pin sends a family to a grave that has to
// exist today.
import burialGroundsRaw from "../../data/begravningsplatser-sverige.json";
import { lanDisplay } from "../moskeer";

export interface BurialGround {
	readonly id: string;
	/** The cemetery as its huvudman names it: "Kvibergs kyrkogård". */
	readonly name: string;
	/** The Muslim part, when the huvudman names or numbers it: "Kvarter 18". */
	readonly section?: string;
	readonly lat: number;
	readonly lng: number;
	readonly city: string;
	/** Bönetider place slug for the nearest city, as on the mosque records. */
	readonly citySlug: string;
	readonly kommun: string;
	/** Län, short form matching places.ts `county` (e.g. "Stockholm"). */
	readonly lan: string;
	/** Year the Muslim section was taken into use, when a source states it. */
	readonly opened?: number;
	readonly address?: string;
	/** The page that confirms the Muslim section — also where the reader finds opening
	 *  hours and who to call, so the callout links it. */
	readonly source: string;
}

const BURIAL_GROUNDS = burialGroundsRaw as unknown as readonly BurialGround[];

export function getBurialGrounds(): readonly BurialGround[] {
	return BURIAL_GROUNDS;
}

/** The line under the cemetery's name. Most huvudmän give the section no name of its own,
 *  and a blank line there read as missing data rather than as "the Muslim part of this". */
export function sectionLabel(b: BurialGround): string {
	return b.section ?? "Muslimskt gravkvarter";
}

/** "Göteborg · Västra Götalands län" — the same shape as the mosque callout's line. */
export function burialLocationLabel(b: BurialGround): string {
	return `${b.kommun} · ${lanDisplay(b.lan)}`;
}
