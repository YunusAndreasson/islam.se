import { FAMILY_KEYS, familyOfModel } from "./families";
import type { AdoptedModel, CatalogueModel, FamilyKey, ModelsFile, SeenModel } from "./types";

// The release log. Every chat model that appears in a family's namespace on OpenRouter is
// recorded with the date the barometer first saw it, and stays `pending` until a human
// adopts or ignores it. `pnpm ai-barometern run` refuses to start while anything is
// pending, so a new release can never slip past a measurement unnoticed.
//
// Everything here is pure: the runner fetches the catalogue and writes the file.

/** The note on every model that was already listed when the barometer started. */
export const BASELINE_NOTE = "Fanns före första mätningen";

export function isoDateFromUnix(seconds: number): string {
	return new Date(seconds * 1000).toISOString().slice(0, 10);
}

export function emptyModelsFile(): ModelsFile {
	const families = Object.fromEntries(
		FAMILY_KEYS.map((key) => [key, { current: null, history: [] }]),
	) as unknown as ModelsFile["families"];
	return { schemaVersion: 1, lastChecked: null, families, seen: [] };
}

function seenEntry(
	m: CatalogueModel,
	family: FamilyKey,
	today: string,
	decision: SeenModel["decision"],
	note?: string,
): SeenModel {
	const entry: SeenModel = {
		family,
		id: m.id,
		canonicalSlug: m.canonical_slug,
		name: m.name,
		created: isoDateFromUnix(m.created),
		firstSeen: today,
		decision,
	};
	if (decision !== "pending") entry.decidedAt = today;
	if (note) entry.note = note;
	return entry;
}

/** Stable order for a readable git diff: family, newest first, then id. */
function sortSeen(seen: SeenModel[]): SeenModel[] {
	return [...seen].sort(
		(a, b) =>
			a.family.localeCompare(b.family) ||
			b.created.localeCompare(a.created) ||
			a.id.localeCompare(b.id),
	);
}

export interface CatalogueDiff {
	file: ModelsFile;
	added: SeenModel[];
	removed: SeenModel[];
	warnings: string[];
}

export function diffCatalogue(
	file: ModelsFile,
	catalogue: readonly CatalogueModel[],
	today: string,
): CatalogueDiff {
	const byId = new Map(catalogue.map((m) => [m.id, m]));
	const known = new Map(file.seen.map((s) => [s.id, { ...s }]));
	const added: SeenModel[] = [];
	const removed: SeenModel[] = [];
	const warnings: string[] = [];

	for (const m of catalogue) {
		const family = familyOfModel(m.id);
		if (!family) continue;
		const prior = known.get(m.id);
		if (!prior) {
			const entry = seenEntry(m, family, today, "pending");
			known.set(m.id, entry);
			added.push(entry);
		} else if (prior.removedAt) {
			delete prior.removedAt;
		}
	}

	for (const entry of known.values()) {
		if (!(byId.has(entry.id) || entry.removedAt)) {
			entry.removedAt = today;
			removed.push(entry);
		}
	}

	for (const key of FAMILY_KEYS) {
		const current = file.families[key].current;
		if (!current) {
			warnings.push(`${key}: ingen modell vald`);
			continue;
		}
		const listed = byId.get(current);
		if (!listed) warnings.push(`${key}: ${current} finns inte längre i katalogen`);
		else if (listed.expiration_date)
			warnings.push(`${key}: ${current} upphör ${listed.expiration_date}`);
	}

	return {
		file: { ...file, lastChecked: today, seen: sortSeen([...known.values()]) },
		added,
		removed,
		warnings,
	};
}

/** First check ever: everything already listed predates the barometer, so it is recorded
 *  as ignored rather than flooding the log with a hundred pending ids. */
export function baselineCatalogue(
	file: ModelsFile,
	catalogue: readonly CatalogueModel[],
	today: string,
): ModelsFile {
	const { file: next, added } = diffCatalogue(file, catalogue, today);
	const addedIds = new Set(added.map((a) => a.id));
	return {
		...next,
		seen: next.seen.map((s) =>
			addedIds.has(s.id) ? { ...s, decision: "ignored", decidedAt: today, note: BASELINE_NOTE } : s,
		),
	};
}

export function adoptModel(
	file: ModelsFile,
	family: FamilyKey,
	model: CatalogueModel,
	today: string,
	reason: string,
): ModelsFile {
	const modelFamily = familyOfModel(model.id);
	if (modelFamily !== family) {
		throw new Error(`${model.id} hör inte till familjen ${family}`);
	}
	const slot = file.families[family];
	if (slot.current === model.id) return file;

	const history: AdoptedModel[] = slot.history.map((h) =>
		h.id === slot.current && !h.retiredAt ? { ...h, retiredAt: today } : h,
	);
	history.push({
		id: model.id,
		canonicalSlug: model.canonical_slug,
		name: model.name,
		created: isoDateFromUnix(model.created),
		knowledgeCutoff: model.knowledge_cutoff ?? null,
		adoptedAt: today,
		reason,
	});

	const seen = file.seen.some((s) => s.id === model.id)
		? file.seen.map((s) =>
				s.id === model.id ? { ...s, decision: "adopted" as const, decidedAt: today } : s,
			)
		: sortSeen([...file.seen, seenEntry(model, family, today, "adopted")]);

	return {
		...file,
		families: { ...file.families, [family]: { current: model.id, history } },
		seen,
	};
}

export function ignoreModel(file: ModelsFile, id: string, today: string, note: string): ModelsFile {
	if (!file.seen.some((s) => s.id === id)) {
		throw new Error(`${id} finns inte i loggen – kör \`models\` först`);
	}
	return {
		...file,
		seen: file.seen.map((s) =>
			s.id === id ? { ...s, decision: "ignored" as const, decidedAt: today, note } : s,
		),
	};
}

export function pendingModels(file: ModelsFile): SeenModel[] {
	return file.seen.filter((s) => s.decision === "pending" && !s.removedAt);
}

/** The model that stood for `family` on `date`. On a switch day the new model wins. */
export function modelInForce(
	file: ModelsFile,
	family: FamilyKey,
	date: string,
): AdoptedModel | null {
	const eligible = file.families[family].history.filter((h) => h.adoptedAt <= date);
	return eligible.at(-1) ?? null;
}
