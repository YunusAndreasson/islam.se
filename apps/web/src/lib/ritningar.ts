// The site's drawings (src/assets/ritningar; how they are made is in its README): engraved
// vignettes in the type's own ink with one flat brass tint, each a pair — ink on white for
// the light theme, the same vignette as a white-line engraving on black for the dark. Each
// is one thing that is its section, seen whole and standing alone on a short strip of
// hatched ground: the front page's closing band drew them that way first, and on 2026-11-21
// the user kept that band and had every opening's landscape redrawn in its manner. Drawn by
// <Ritning>; where one may stand is in DESIGN.md, »The Drawings«. Things and buildings only
// — no people and no animals, as the classical position the site takes holds for drawn
// images of living beings.
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
	/** An open notebook, a pencil lying across it, a cup of coffee on its saucer beside it,
	 *  the pencil alone in brass — Essäer: writing as it happens today. Beside /essaer/'s
	 *  ingress. Replaced a fieldstone bridge between birches (2026-11-21). */
	essaer: { ljus: essaerLjus, mork: essaerMork },
	/** A library card-catalogue drawer pulled out, one card raised above the rest, its tab
	 *  alone in brass — Frågor och svar: an answer looked up and found. Beside /svar/'s
	 *  ingress. Replaced a farmhouse door with the key in its lock (2026-11-21). */
	svar: { ljus: svarLjus, mork: svarMork },
	/** A magnifying glass lying on an open book, its rim alone in brass — Fördjupning: the
	 *  close reading. Beside /fordjupning/'s ingress. Replaced a farmyard well (2026-11-21). */
	fordjupning: { ljus: fordjupningLjus, mork: fordjupningMork },
	/** A garden sundial on a stone pedestal, the gnomon alone in brass under its engraved
	 *  lines — the prayer times are taken from the sun's real position. Bönetider's prose page,
	 *  /bonetider/metod/. Its plinth came with a row of letter-like marks, removed by an edit
	 *  of the drawing. Replaced a window with a prayer rug on the sill (2026-11-21). */
	bonetider: { ljus: bonetiderLjus, mork: bonetiderMork },
	/** A modest white mosque, dome and minaret, among a Swedish town's roofs and birches, its
	 *  door in brass. In the old landscape manner, and not placed (DESIGN.md, »The Drawings«). */
	moskeer: { ljus: moskeerLjus, mork: moskeerMork },
	/** A small telescope on a wooden tripod turned up to the new crescent, the crescent alone
	 *  in brass — Det islamiska året: the month begins when the moon is sighted. Also the
	 *  Ramadan sheet's picture (aret-tryck.jpg). Replaced the crescent over a lake (2026-11-21). */
	aret: { ljus: aretLjus, mork: aretMork },
	/** Round reading glasses folded on a closed book, the rims alone in brass — Tänkare.
	 *  Replaced a writing desk with books, lamp, inkwell and quill (2026-11-21). */
	tankare: { ljus: tankareLjus, mork: tankareMork },
	/** Five slim volumes standing between two bookends, the ribbon of the first alone in
	 *  brass — Essäserier: a series you start at the beginning. Replaced a gravel road with
	 *  milestones (2026-11-21), which had replaced books joined by a thread (2026-09-27). */
	teman: { ljus: temanLjus, mork: temanMork },
	/** A Swedish farmhouse banjo barometer, a thermometer in its neck, its needle in brass —
	 *  upright, in the old landscape manner. Not placed since 2026-10-10: it stood in the front
	 *  page's 10rem column beside the AI-barometern's introduction until that room took the
	 *  page's thirds (DESIGN.md, »The Drawings«). */
	barometern: { ljus: barometernLjus, mork: barometernMork },
	/** An open laptop with a conversation on its screen, a small round barometer standing
	 *  beside it, the needle alone in brass — AI-barometern: the models' answers, measured.
	 *  Wide, for the hub's opening and, under its words, the front page's room. Replaced the
	 *  banjo barometer on a plank wall beside a rainy window (2026-11-21). */
	barometernBred: { ljus: barometernBredLjus, mork: barometernBredMork },
	/** An open Quran on a carved folding stand (rahle), alone on its shadow, the arabesque
	 *  headpiece alone in brass; the pages ruled strokes only, never script — Grunden,
	 *  »Vad är islam?«, and /vad-ar-islam/. Drawn alone at 1:1, since /vad-ar-islam/ shows it
	 *  about 500px wide. The stand stood on a table by a window until 2026-11-21. */
	grunden: { ljus: grundenLjus, mork: grundenMork },
	/** An open pocket compass, its needle alone in brass — the 404 page. Replaced an empty
	 *  bench by a forest path (2026-11-21). */
	vilse: { ljus: vilseLjus, mork: vilseMork },
} satisfies Record<string, RitningPar>;
