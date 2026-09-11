// The map glyph for a Muslim burial ground — ONE path for both maps. The web /moskeer map
// draws it onto a canvas (scripts/moskeer-map.ts); the mobile map ships it as PNGs rendered
// from this string by apps/mobile/scripts/build-burial-pins.mjs. Change it here, then re-run
// that script, or the two maps draw two different graves.
//
// WHAT IT DRAWS, AND WHY NOT A CRESCENT. A grave raised above the ground in a hump
// (musannam), with one plain upright stone at its head. That is the grave the sunna
// describes: Sufyān al-Tammār saw the Prophet's ﷺ grave humped (al-Bukhārī 1390), and the
// Prophet ﷺ marked ʿUthmān ibn Maẓʿūn's grave with a single stone "so that I know my
// brother's grave by it" (Abū Dāwūd 3206). The stone carries no inscription and no emblem —
// building over graves and writing on them is what the classical ruling forbids (Muslim
// 970), the same position /fordjupning/muslimsk-begravning/ states — and the crescent is a
// later political ensign, not a sign the religion itself gives.
//
// The pointed top is the one concession to legibility. A round-topped slab is the generic
// Western headstone, and at the 19 px the mobile map first draws this at, the arch is what
// tells the two apart. It is also the arch the mosque glyph's dome carries, so the two read
// as one family on the same map.
//
// Drawn on the 24-unit grid of Material Design Icons, so it sits at the same visual weight
// as the MDI `mosque` glyph it shares the mobile map with.
export const BURIAL_GLYPH_GRID = 24;

export const BURIAL_GLYPH_PATH =
	"M8 15V8.2C8 5.9 9.8 4 12 2.6C14.2 4 16 5.9 16 8.2V15ZM1.5 21C2.2 18 6.4 16.1 12 16.1C17.6 16.1 21.8 18 22.5 21Z";
