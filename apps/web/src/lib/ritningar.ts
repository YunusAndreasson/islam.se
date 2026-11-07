// The site's drawings (src/assets/ritningar; how they are made is in its README): engraved
// vignettes in the type's own ink with one flat brass tint, each a pair — ink on white for
// the light theme, the same vignette as a white-line engraving on black for the dark. Drawn
// by <Ritning>; where one may stand is in DESIGN.md, »The Drawings«. Things, buildings,
// landscape and plants only — no people and no animals, as the classical position the
// site takes holds for drawn images of living beings.
import appenLjus from "../assets/ritningar/appen.webp";
import appenMork from "../assets/ritningar/appen-mork.webp";
import aretLjus from "../assets/ritningar/aret.webp";
import aretMork from "../assets/ritningar/aret-mork.webp";
import barometernLjus from "../assets/ritningar/barometern.webp";
import barometernBredLjus from "../assets/ritningar/barometern-bred.webp";
import barometernBredMork from "../assets/ritningar/barometern-bred-mork.webp";
import barometernMork from "../assets/ritningar/barometern-mork.webp";
import bokenLjus from "../assets/ritningar/boken.webp";
import bokenMork from "../assets/ritningar/boken-mork.webp";
import bonetiderLjus from "../assets/ritningar/bonetider.webp";
import bonetiderMork from "../assets/ritningar/bonetider-mork.webp";
import essaerLjus from "../assets/ritningar/essaer.webp";
import essaerMork from "../assets/ritningar/essaer-mork.webp";
import fordjupningLjus from "../assets/ritningar/fordjupning.webp";
import fordjupningMork from "../assets/ritningar/fordjupning-mork.webp";
import grundenLjus from "../assets/ritningar/grunden.webp";
import grundenMork from "../assets/ritningar/grunden-mork.webp";
import moskeerLjus from "../assets/ritningar/moskeer.webp";
import moskeerMork from "../assets/ritningar/moskeer-mork.webp";
import poddenLjus from "../assets/ritningar/podden.webp";
import poddenMork from "../assets/ritningar/podden-mork.webp";
import skarmenLjus from "../assets/ritningar/skarmen.webp";
import skarmenMork from "../assets/ritningar/skarmen-mork.webp";
import svarLjus from "../assets/ritningar/svar.webp";
import svarMork from "../assets/ritningar/svar-mork.webp";
import tankareLjus from "../assets/ritningar/tankare.webp";
import tankareMork from "../assets/ritningar/tankare-mork.webp";
import temanLjus from "../assets/ritningar/teman.webp";
import temanMork from "../assets/ritningar/teman-mork.webp";
import vilseLjus from "../assets/ritningar/vilse.webp";
import vilseMork from "../assets/ritningar/vilse-mork.webp";

export interface RitningPar {
	ljus: ImageMetadata;
	mork: ImageMetadata;
}

export const RITNINGAR = {
	/** Headphones on an open book on a table's corner, its ribbon in brass — the podcast. */
	podden: { ljus: poddenLjus, mork: poddenMork },
	/** A phone showing the app: the map of Scandinavia with the day's arc in brass, the prayer
	 *  list under it, the screen a calm engraved mid-tone (near-black, it outweighed the band). */
	appen: { ljus: appenLjus, mork: appenMork },
	/** The collected essays: one bound volume lying closed on the loose sheets it gathered,
	 *  one band on its spine in brass — the front page's close (BookPod), in the podcast drawing's
	 *  10rem column, so the page ends on the kind of object it opened with. */
	boken: { ljus: bokenLjus, mork: bokenMork },
	/** A television on the wall of a Swedish mosque's plain entrance hall, a shoe shelf under
	 *  it, a winter coat on its hook beside it; the screen dark, its list of the day's prayers
	 *  suggested by rows, the current row in brass — Moskéskärm, beside the book in the front page's
	 *  closing band (SkarmPromo), in the same 10rem column. */
	skarmen: { ljus: skarmenLjus, mork: skarmenMork },
	/** An old fieldstone arch bridge over a quiet river between birches, a barn seen through
	 *  the arch, the keystone alone in brass — Essäer: two banks and one passage, the two
	 *  traditions the essays read together (2026-10-16). Beside /essaer/'s ingress. */
	essaer: { ljus: essaerLjus, mork: essaerMork },
	/** A farmhouse's plank door standing ajar, a lilac by the wall, the key in the lock
	 *  alone in brass — Frågor och svar: a question is a door, and the answer the key that
	 *  opens it (2026-10-17). Beside /svar/'s ingress. */
	svar: { ljus: svarLjus, mork: svarMork },
	/** A farmyard well of fieldstone under its windlass, a birch and an outbuilding behind,
	 *  the bucket on the rope alone in brass — Fördjupning: what is drawn up from the depth,
	 *  from the source (2026-10-17). Beside /fordjupning/'s ingress. */
	fordjupning: { ljus: fordjupningLjus, mork: fordjupningMork },
	/** A deep window at first light, a prayer rug folded on the sill, the sun's rim at the
	 *  horizon in brass — Bönetider's prose page, /bonetider/metod/. */
	bonetider: { ljus: bonetiderLjus, mork: bonetiderMork },
	/** A modest white mosque, dome and minaret, among a Swedish town's roofs and birches, its
	 *  door in brass. Not placed (DESIGN.md, »The Drawings«). */
	moskeer: { ljus: moskeerLjus, mork: moskeerMork },
	/** The new crescent, in brass, low over a still lake shore — Det islamiska året. */
	aret: { ljus: aretLjus, mork: aretMork },
	/** A writing desk: open books, old volumes, inkwell and quill, an oil lamp, its flame in
	 *  brass — Tänkare. */
	tankare: { ljus: tankareLjus, mork: tankareMork },
	/** A gravel road through Swedish farmland, old milestones along its verge, the nearest
	 *  milestone alone tinted brass under its engraved lines (a flat brass block on it read as a
	 *  sticker, 2026-11-07) — Teman: essays read in order along one line of thought, as
	 *  stops on one road (the front page draws them as routes with stops). Replaced the open
	 *  books joined by a thread (2026-09-27), a pun on »Trådar« that the new name no longer
	 *  makes. The road itself was ochre until 2026-10-04: at the 112px the opening gives it,
	 *  a whole road in colour was all the eye saw (»för mycket gult«). */
	teman: { ljus: temanLjus, mork: temanMork },
	/** A Swedish farmhouse banjo barometer, a thermometer in its neck, its needle in brass —
	 *  upright. Not placed since
	 *  2026-10-10: it stood in the front page's 10rem column beside the AI-barometern's
	 *  introduction until that room took the page's thirds (DESIGN.md, »The Drawings«). */
	barometern: { ljus: barometernLjus, mork: barometernMork },
	/** The same barometer on a plank wall beside a window, rain moving in over a lake — landscape, for the
	 *  hub's opening and, under its words, the front page's room: the space beside or under
	 *  an opening is wider than tall, and upright the barometer stood 140px wide with a
	 *  400px empty field beside it (2026-09-26). */
	barometernBred: { ljus: barometernBredLjus, mork: barometernBredMork },
	/** An open Quran on a carved folding stand (rahle) by a window, its headpiece in brass; the
	 *  pages ruled strokes only, never script — Grunden, »Vad är islam?«, and /vad-ar-islam/. */
	grunden: { ljus: grundenLjus, mork: grundenMork },
	/** An empty bench by a path into a spruce wood, a lantern on it, its flame in brass — the
	 *  404 page. */
	vilse: { ljus: vilseLjus, mork: vilseMork },
} satisfies Record<string, RitningPar>;
