// The site's drawings (src/assets/ritningar; how they are made is in its README), each a
// pair: graphite on white for the light theme, white chalk on black for the dark. Drawn
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
import grundenLjus from "../assets/ritningar/grunden.webp";
import grundenMork from "../assets/ritningar/grunden-mork.webp";
import moskeerLjus from "../assets/ritningar/moskeer.webp";
import moskeerMork from "../assets/ritningar/moskeer-mork.webp";
import poddenLjus from "../assets/ritningar/podden.webp";
import poddenMork from "../assets/ritningar/podden-mork.webp";
import skarmenLjus from "../assets/ritningar/skarmen.webp";
import skarmenMork from "../assets/ritningar/skarmen-mork.webp";
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
	/** Headphones on an open book — the podcast. */
	podden: { ljus: poddenLjus, mork: poddenMork },
	/** A phone showing the app: the map with the day's arc, the prayer list. */
	appen: { ljus: appenLjus, mork: appenMork },
	/** The collected essays: one bound volume lying closed on the loose sheets it gathered,
	 *  gilt bands on its spine — the front page's close (BookPod), in the podcast drawing's
	 *  10rem column, so the page ends on the kind of object it opened with. */
	boken: { ljus: bokenLjus, mork: bokenMork },
	/** A television on the wall of a mosque's entrance hall, a shoe shelf under it and a
	 *  coat on its hook beside it; the screen dark, its list of the day's prayers suggested by
	 *  marks, the current row in ochre — Moskéskärm, beside the book in the front page's
	 *  closing band (SkarmPromo), in the same 10rem column. */
	skarmen: { ljus: skarmenLjus, mork: skarmenMork },
	/** A window at first light, a prayer rug on the sill — Bönetider's prose page, /bonetider/metod/. */
	bonetider: { ljus: bonetiderLjus, mork: bonetiderMork },
	/** A modest mosque among a Swedish town's roofs and birches. Not placed (DESIGN.md, »The Drawings«). */
	moskeer: { ljus: moskeerLjus, mork: moskeerMork },
	/** The new crescent at dusk over a lake shore — Det islamiska året. */
	aret: { ljus: aretLjus, mork: aretMork },
	/** A writing desk: open books, old volumes, inkwell, an oil lamp — Tänkare. */
	tankare: { ljus: tankareLjus, mork: tankareMork },
	/** A gravel road through Swedish farmland, old milestones along its verge, the nearest
	 *  milestone alone in ochre — Teman: essays read in order along one line of thought, as
	 *  stops on one road (the front page draws them as routes with stops). Replaced the open
	 *  books joined by a thread (2026-09-27), a pun on »Trådar« that the new name no longer
	 *  makes. The road itself was ochre until 2026-10-04: at the 112px the opening gives it,
	 *  a whole road in ochre was all the eye saw (»för mycket gult«). */
	teman: { ljus: temanLjus, mork: temanMork },
	/** A Swedish farmhouse wall barometer, its needle in ochre — upright, for the front page's
	 *  10rem column beside the AI-barometern's introduction. */
	barometern: { ljus: barometernLjus, mork: barometernMork },
	/** The same barometer beside a window, weather moving in over a lake — landscape, for the
	 *  hub's opening: the space beside an opening is wider than tall, and upright the
	 *  barometer stood 140px wide with a 400px empty field beside it (2026-09-26). */
	barometernBred: { ljus: barometernBredLjus, mork: barometernBredMork },
	/** An open Quran on a carved wooden stand by a window — Grunden, »Vad är islam?«. */
	grunden: { ljus: grundenLjus, mork: grundenMork },
	/** An empty bench by a forest path, a lantern on it — the 404 page. */
	vilse: { ljus: vilseLjus, mork: vilseMork },
} satisfies Record<string, RitningPar>;
