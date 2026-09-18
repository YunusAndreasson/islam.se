// The ʿAṣr shadow rule as drawable geometry.
//
// ʿAṣr begins when a vertical object's shadow has grown past its *noon* shadow by
// the object's own length (Shāfiʿī, Mālikī, Ḥanbalī) or by twice its length
// (Ḥanafī). The noon shadow is not zero at Swedish latitudes — the sun never gets
// anywhere near overhead — so the rule is always "noon shadow plus one/two", never
// "one/two" on its own. That is the part a sentence cannot convey and the diagram
// on /bonetider/metod/ exists to show.
//
// This module returns shadow-to-height RATIOS, which is what a drawing needs. The
// published clock times keep coming from computePrayerTimes() (adhan) — the figure
// calls both and the cross-check in asr-shadow.test.ts pins them to each other, so
// the picture can never drift from the number printed beside it.
import type { Madhab } from "./settings";
import { solarParams } from "./solar/sun";

const DEG = Math.PI / 180;

/** Object-lengths of shadow added after noon before ʿAṣr begins, per madhhab. */
export const SHADOW_LENGTH: Record<Madhab, number> = { shafi: 1, hanafi: 2 };

export interface AsrShadow {
	/** Shadow ÷ object height at solar noon — the shortest shadow of the day. */
	readonly noonRatio: number;
	/** Shadow ÷ object height when ʿAṣr begins for Shāfiʿī, Mālikī and Ḥanbalī. */
	readonly shafiRatio: number;
	/** …and for Ḥanafī. */
	readonly hanafiRatio: number;
	/** Sun altitude at solar noon, degrees above the horizon. */
	readonly noonAltDeg: number;
	/** Sun altitude when ʿAṣr begins, per madhhab. */
	readonly shafiAltDeg: number;
	readonly hanafiAltDeg: number;
}

/**
 * Shadow geometry for a latitude and date.
 *
 * At solar noon the sun's zenith angle is |latitude − declination|, so the shadow
 * of a vertical object is tan(that) times its height. A shadow ratio s means the
 * sun sits at atan(1/s) above the horizon — the same inversion adhan's
 * SolarTime.afternoon() performs to find the ʿAṣr instant.
 */
export function asrShadow(latDeg: number, date: Date): AsrShadow {
	const { declRad } = solarParams(date);
	const noonZenithDeg = Math.abs(latDeg - declRad / DEG);
	const noonRatio = Math.tan(noonZenithDeg * DEG);
	const shafiRatio = noonRatio + SHADOW_LENGTH.shafi;
	const hanafiRatio = noonRatio + SHADOW_LENGTH.hanafi;
	const altFor = (ratio: number): number => Math.atan(1 / ratio) / DEG;
	return {
		noonRatio,
		shafiRatio,
		hanafiRatio,
		noonAltDeg: 90 - noonZenithDeg,
		shafiAltDeg: altFor(shafiRatio),
		hanafiAltDeg: altFor(hanafiRatio),
	};
}
