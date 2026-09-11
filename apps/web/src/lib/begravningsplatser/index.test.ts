import { describe, expect, it } from "vitest";
import { PLACES } from "../bonetider/places";
import { placeBySlug } from "../bonetider/places-index";
import { haversineKm } from "../geom";
import { getMosques } from "../moskeer";
import { getBurialGrounds } from "./index";

// The burial-ground list is hand-curated, with no importer checking it on the way in, so
// these are the checks an importer would make. They hold whichever way a record arrives.
describe("burial-ground list", () => {
	const grounds = getBurialGrounds();

	it("gives every record an id of its own, shared with no mosque", () => {
		// /moskeer#<id> opens either kind of place, so an id a mosque also uses would open
		// the wrong card from a shared link.
		const ids = grounds.map((b) => b.id);
		const mosqueIds = new Set(getMosques().map((m) => m.id));
		const repeated = ids.filter((id, i) => ids.indexOf(id) !== i);
		const clashing = ids.filter((id) => mosqueIds.has(id));
		expect({ repeated, clashing }).toEqual({ repeated: [], clashing: [] });
	});

	it("cites the page that confirms each Muslim section", () => {
		// The rule the list is built on (see ./index.ts): no source, no pin. A funeral-home
		// list once named a Muslim kvarter at Lidingö kyrkogård that the parish never had.
		const unsourced = grounds.filter((b) => !/^https:\/\/\S+$/.test(b.source)).map((b) => b.id);
		expect(unsourced, "every burial ground needs an https `source`").toEqual([]);
	});

	it("files every record under a real bönetider place close to it", () => {
		// citySlug is the nearest place, as on the mosque records. A record added by hand with
		// its town guessed shows up here as a pin far from its place.
		const wrong = grounds.flatMap((b) => {
			const place = placeBySlug(b.citySlug);
			if (!place) return [`${b.id}: citySlug "${b.citySlug}" is not a bönetider place`];
			const km = haversineKm(b.lat, b.lng, place.lat, place.lon);
			return km > 15 ? [`${b.id}: ${km.toFixed(1)} km from ${place.name}`] : [];
		});
		expect(wrong).toEqual([]);
	});

	it("puts every kommun in its own län, in the short forms the mosque records use", () => {
		// kommun/lan are where the pin IS, not the nearest town's: a cemetery on a kommun
		// border belongs to its own kommun (Görvälns griftegård is Järfälla's, though the
		// nearest bönetider town with a kommun is in Upplands-Bro). PLACES cannot vouch for
		// every kommun — SCB folds the Stockholm suburbs into Stockholm, so Järfälla has no
		// place of its own — but where it knows the kommun, the län has to agree with it.
		const lanOf = new Map(PLACES.filter((p) => p.kommun).map((p) => [p.kommun, p.county]));
		const lans = new Set(PLACES.map((p) => p.county));
		const wrong = grounds
			.filter((b) => !lans.has(b.lan) || (lanOf.has(b.kommun) && lanOf.get(b.kommun) !== b.lan))
			.map((b) => `${b.id}: ${b.kommun} / ${b.lan}`);
		expect(wrong).toEqual([]);
	});
});
