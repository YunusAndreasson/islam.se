/**
 * MOSKÉFOTON — the photographs on /moskeer/ and /moskeer/[stad]/.
 *
 * These are real photographs of real Swedish mosques, not illustrations. That
 * distinction is the whole point of the module, so it is worth saying why.
 *
 * The obvious licence worry — that a photograph of a building belongs to
 * whoever took it — is real but small. Sweden's panoramafrihet (URL 24 §) puts
 * the buildings themselves in the clear, and Wikimedia Commons carries
 * high-resolution photographs of the mosques released under CC BY, CC BY-SA and
 * CC0. Those licences ask for two things: name the photographer, and say if the
 * picture was changed. Both are cheap, and a byline under a photograph adds
 * credibility rather than costing it. Generated pictures were tried here first
 * and thrown out: an invented building is duller than the real one and reads as
 * a fake on a page that is otherwise strictly factual.
 *
 * WHAT IS DELIBERATELY NOT HERE. Commons' best-lit, highest-resolution Swedish
 * mosque photographs include the Ahmadiyya mosques (Nasirmoskén in Göteborg,
 * Mahmoodmoskén in Malmö) and the shia Imam Ali mosque in Järfälla. They are
 * excluded on purpose and must stay excluded: this site states the position of
 * ahl as-sunna, and a gallery captioned "moskéer i Sverige" is a claim about
 * what a Swedish mosque is. The exclusion is easy to undo by accident — those
 * files sort to the top of any search on looks alone — so check the congregation
 * before adding anything here, not just the picture.
 *
 * And check it against the ARTICLE, not the file name. Commons carries
 * `Trollhättans moské.jpg`, which reads as neutral as a name can; the Wikipedia
 * article it illustrates is titled "Trollhättans Shia Moské". A filename filter
 * would have let that one straight through. Every candidate was cleared by
 * reading who runs the congregation.
 *
 * PROCESSING. Each file is cropped to 1536×1024 and resaved as webp; the crop
 * favours the top of the frame because a centred 3:2 cut takes the tip off a
 * minaret. Colour is left close to the original — EssayImage's CSS tonal wash
 * is what pulls the set together, and it was written for exactly this problem
 * (photographs from many cameras and many days, made to read as one set).
 * `changed: true` on an entry is what prints "beskuren" in the credit.
 *
 * ADDING ONE. Drop `<citySlug>.webp` into src/assets/images/moskeer/ and add
 * the matching entry below. No entry, no image — a photograph with no
 * photographer named is the one failure mode this module must not have.
 */

import type { ImageMetadata } from "astro";
import { basename } from "../path";

const artEntries = Object.entries(
	import.meta.glob<{ default: ImageMetadata }>(
		"../../assets/images/moskeer/*.{jpg,jpeg,png,webp}",
		{
			eager: true,
		},
	),
);

const FILES: ReadonlyMap<string, ImageMetadata> = new Map(
	artEntries.map(([path, mod]) => [basename(path, /\.[^.]+$/), mod.default]),
);

interface PhotoEntry {
	/** The mosque as it is named on its own page and in the caption. */
	readonly mosque: string;
	/** Town shown under the name, and the /moskeer/<slug>/ page it links to. */
	readonly city: string;
	readonly citySlug: string;
	readonly alt: string;
	readonly photographer: string;
	readonly licence: string;
	readonly licenceUrl: string;
	/** The Commons file page — the licence's "link to the source" requirement. */
	readonly source: string;
	/** True when we cropped or graded it, which CC BY/BY-SA asks us to state. */
	readonly changed: boolean;
	/** Swedish Wikipedia article. All six have one, and it is the right onward
	    link: it carries the building's history, architect and disputes, none of
	    which belongs in a directory entry. */
	readonly wikipedia: string;
}

/** Gallery order: the two oldest big congregation mosques, then the newest of
 *  the landmark builds, then two that show the ordinary end of the range. A
 *  reader should come away knowing that Swedish mosques are mostly modest. */
const PHOTOS: readonly PhotoEntry[] = [
	{
		mosque: "Stockholms moské",
		city: "Stockholm",
		citySlug: "stockholm",
		alt: "Stockholms moské på Södermalm en höstdag, med kupol och minaret över lövträden.",
		photographer: "Holger.Ellgaard",
		licence: "CC BY-SA 3.0",
		licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
		source: "https://commons.wikimedia.org/wiki/File:Stockholms_moske_okt_2012a.jpg",
		changed: true,
		wikipedia: "https://sv.wikipedia.org/wiki/Stockholms_mosk%C3%A9",
	},
	{
		mosque: "Malmö moské",
		city: "Malmö",
		citySlug: "malmo",
		alt: "Malmö moské vid Jägersro, vit med grön kupol och två minareter, sedd över en gräsyta.",
		photographer: "jorchr",
		licence: "CC BY-SA 3.0",
		licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
		source: "https://commons.wikimedia.org/wiki/File:Malm%C3%B6_Moske.jpg",
		changed: true,
		wikipedia: "https://sv.wikipedia.org/wiki/Malm%C3%B6_mosk%C3%A9",
	},
	{
		mosque: "Fittja moské",
		city: "Fittja",
		citySlug: "fittja",
		alt: "Fittja moské i Botkyrka med sin minaret, framför skogsbacken och bostadshusen på höjden.",
		photographer: "Holger.Ellgaard",
		licence: "CC BY-SA 3.0",
		licenceUrl: "https://creativecommons.org/licenses/by-sa/3.0/",
		source: "https://commons.wikimedia.org/wiki/File:Fittja_moske_2012.jpg",
		changed: true,
		wikipedia: "https://sv.wikipedia.org/wiki/Fittja_mosk%C3%A9",
	},
	{
		mosque: "Göteborgs moské",
		city: "Göteborg",
		citySlug: "goteborg",
		alt: "Göteborgs moské i Brämaregården på Hisingen, vit fasad med låg kupol och ett smalt torn.",
		photographer: "Andrzej Otrębski",
		licence: "CC BY-SA 4.0",
		licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
		source: "https://commons.wikimedia.org/wiki/File:Goteborg_meczet.jpg",
		changed: true,
		wikipedia: "https://sv.wikipedia.org/wiki/G%C3%B6teborgs_mosk%C3%A9",
	},
	{
		mosque: "Uppsala moské",
		city: "Uppsala",
		citySlug: "uppsala",
		alt: "Uppsala moské i hörnet Vattholmavägen–Gamla Uppsalagatan, med grön kupol och minaret, en cyklist på vägen.",
		photographer: "Gunnar Creutz",
		licence: "CC BY-SA 4.0",
		licenceUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
		source: "https://commons.wikimedia.org/wiki/File:Uppsala_Mosk%C3%A9n_3245.jpg",
		changed: true,
		wikipedia: "https://sv.wikipedia.org/wiki/Uppsala_mosk%C3%A9",
	},
	{
		mosque: "Al-Rashideen-moskén",
		city: "Gävle",
		citySlug: "gavle",
		alt: "Al-Rashideen-moskén i Gävle, en tegelbyggnad med en förgylld kupol över entrén.",
		photographer: "AleWi",
		licence: "CC0",
		licenceUrl: "https://creativecommons.org/publicdomain/zero/1.0/",
		source: "https://commons.wikimedia.org/wiki/File:Al-Rashideen-mosk%C3%A9n.jpg",
		changed: true,
		wikipedia: "https://sv.wikipedia.org/wiki/G%C3%A4vle_mosk%C3%A9",
	},
];

export interface MosquePhoto extends PhotoEntry {
	readonly src: ImageMetadata;
}

/** Only entries whose file is actually on disk, in gallery order. */
export const MOSQUE_PHOTOS: readonly MosquePhoto[] = PHOTOS.flatMap((p) => {
	const src = FILES.get(p.citySlug);
	return src ? [{ ...p, src }] : [];
});

const BY_CITY = new Map(MOSQUE_PHOTOS.map((p) => [p.citySlug, p]));

/** The photograph for a town's page, if we have one. */
export function mosquePhoto(citySlug: string): MosquePhoto | undefined {
	return BY_CITY.get(citySlug);
}

/** "Foto: Holger.Ellgaard, beskuren · CC BY-SA 3.0" — the licence conditions in
 *  one line: who took it, that we changed it, and under what terms. */
export function credit(p: PhotoEntry): string {
	return `Foto: ${p.photographer}${p.changed ? ", beskuren" : ""} · ${p.licence}`;
}
