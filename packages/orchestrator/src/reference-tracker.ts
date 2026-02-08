export interface Reference {
	id: string;
	type: "web" | "quote" | "academic" | "media";
	title: string;
	url?: string;
	author?: string;
	publication?: string;
	date?: string;
	accessDate?: string;
	credibility?: "high" | "medium" | "low";
	used: boolean;
}

const SWEDISH_MONTHS = [
	"januari",
	"februari",
	"mars",
	"april",
	"maj",
	"juni",
	"juli",
	"augusti",
	"september",
	"oktober",
	"november",
	"december",
];

function formatSwedishDate(dateStr: string): string {
	const date = new Date(dateStr);
	const day = date.getDate();
	const month = SWEDISH_MONTHS[date.getMonth()];
	const year = date.getFullYear();
	return `${day} ${month} ${year}`;
}

function formatQuoteCitation(ref: Reference): string {
	let citation = `— ${ref.author || "Okänd"}. ${ref.title}.`;
	if (ref.publication) {
		citation += `\n  (${ref.publication})`;
	}
	return citation;
}

function formatAcademicCitation(ref: Reference): string {
	let citation = ref.author ? `${ref.author}. "${ref.title}".` : `"${ref.title}".`;
	if (ref.publication) {
		citation += ` ${ref.publication}`;
		if (ref.date) citation += `, ${ref.date}`;
		citation += ".";
	}
	if (ref.url && ref.accessDate) {
		citation += `\n  ${ref.url} (Hämtad ${formatSwedishDate(ref.accessDate)})`;
	}
	return citation;
}

function formatMediaCitation(ref: Reference): string {
	let citation = ref.author ? `${ref.author}. "${ref.title}".` : `"${ref.title}".`;
	if (ref.publication) citation += ` ${ref.publication}`;
	if (ref.date) citation += `, ${ref.date}`;
	citation += ".";
	if (ref.url && ref.accessDate) {
		citation += `\n  Hämtad ${formatSwedishDate(ref.accessDate)}.`;
	}
	return citation;
}

function formatWebCitation(ref: Reference): string {
	let citation = `"${ref.title}".`;
	if (ref.url) {
		citation += `\n  ${ref.url}`;
		if (ref.accessDate) {
			citation += ` (Hämtad ${formatSwedishDate(ref.accessDate)})`;
		}
	}
	return citation;
}

function formatCitation(ref: Reference): string {
	switch (ref.type) {
		case "quote":
			return formatQuoteCitation(ref);
		case "academic":
			return formatAcademicCitation(ref);
		case "media":
			return formatMediaCitation(ref);
		default:
			return formatWebCitation(ref);
	}
}

export class ReferenceTracker {
	private references: Map<string, Reference> = new Map();
	private idCounter = 0;

	/**
	 * Add a new reference
	 */
	public addReference(ref: Omit<Reference, "id" | "used">): string {
		const id = `ref-${++this.idCounter}`;
		this.references.set(id, { ...ref, id, used: false });
		return id;
	}

	/**
	 * Get all references
	 */
	public getAllReferences(): Reference[] {
		return Array.from(this.references.values());
	}

	/**
	 * Format references in Swedish style
	 */
	public formatSwedishBibliography(onlyUsed = true): string {
		const all = this.getAllReferences();
		const refs = onlyUsed ? all.filter((ref) => ref.used) : all;

		const seen = new Set<string>();
		const deduped = refs.filter((r) => {
			const key = `${r.author ?? ""}|${r.title}`;
			if (seen.has(key)) return false;
			seen.add(key);
			return true;
		});

		const sorted = deduped.sort((a, b) => {
			const aKey = a.author || a.title;
			const bKey = b.author || b.title;
			return aKey.localeCompare(bKey, "sv");
		});

		return sorted.map(formatCitation).join("\n\n");
	}

}
