// Hand-maintained. Swedish stadsdelar the GeoNames spine (places.ts) does not carry:
// that dump is feature class P at population >= 200 and drops PPLX (sections of a
// populated place), so Rinkeby and Kista are in it by chance while Husby, Tensta and
// the rest of Järva are absent entirely.
//
// ⚠️ Kept OUT of places.ts on purpose — that file is regenerated wholesale, and its
// generator (scripts/build-places.py) lives in apps/mobile and writes to the mobile
// copy, so anything added there is lost on the next regeneration.
//
// ⚠️ `scbPopulation` must stay unset. The pages gate every official figure and the
// SCB citation on it (bonetider/[stad].astro:77); an unset field renders no claim.
// `population` is the slug-ordering key and the OG-card tier only — never displayed.
// Coordinates: OpenStreetMap (Nominatim), verified 2026-08-03.

import type { SwedishPlace } from "./places";

export const DISTRICTS: readonly SwedishPlace[] = [
	{
		name: "Tensta",
		county: "Stockholm",
		kommun: "Stockholm",
		population: 18575, // Stockholms stad, 31 dec 2021
		lat: 59.39477,
		lon: 17.89969,
	},
	{
		name: "Solberga",
		county: "Stockholm",
		kommun: "Stockholm",
		population: 12288, // Stockholms stad, 2021
		lat: 59.27957,
		lon: 18.007,
	},
	{
		name: "Husby",
		county: "Stockholm",
		kommun: "Stockholm",
		population: 11832, // Stockholms stad, 2021
		lat: 59.40818,
		lon: 17.92867,
	},
	{
		name: "Rågsved",
		county: "Stockholm",
		kommun: "Stockholm",
		population: 11677, // Stockholms stad, 2021
		lat: 59.25669,
		lon: 18.02845,
	},
	{
		// Egen stadsdel, skild från Hässelby strand och Hässelby villastad.
		name: "Hässelby gård",
		county: "Stockholm",
		kommun: "Stockholm",
		population: 11559, // Stockholms stad, 2021
		lat: 59.36697,
		lon: 17.84391,
	},
	{
		name: "Bredäng",
		county: "Stockholm",
		kommun: "Stockholm",
		population: 10571, // Stockholms stad, 31 dec 2022
		lat: 59.29478,
		lon: 17.93344,
	},
	{
		name: "Akalla",
		county: "Stockholm",
		kommun: "Stockholm",
		population: 9373, // Stockholms stad, 2021
		lat: 59.41558,
		lon: 17.91322,
	},
	{
		name: "Vällingby",
		county: "Stockholm",
		kommun: "Stockholm",
		population: 8640, // Stockholms stad, 2025
		lat: 59.36596,
		lon: 17.87163,
	},
	{
		name: "Skärholmen",
		county: "Stockholm",
		kommun: "Stockholm",
		population: 8615, // Stockholms stad, 31 dec 2022
		lat: 59.27692,
		lon: 17.90675,
	},
	{
		// Botkyrka redovisar Hallunda-Norsborg samlat: 17 014 invånare (2016).
		name: "Norsborg",
		county: "Stockholm",
		kommun: "Botkyrka",
		population: 8500,
		lat: 59.2439,
		lon: 17.81273,
	},
];
