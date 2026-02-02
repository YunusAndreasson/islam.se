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
	 * Mark reference as used
	 */
	public markAsUsed(id: string): void {
		const ref = this.references.get(id);
		if (ref) {
			ref.used = true;
		}
	}

	/**
	 * Get reference by ID
	 */
	public getReference(id: string): Reference | undefined {
		return this.references.get(id);
	}

	/**
	 * Get all references
	 */
	public getAllReferences(): Reference[] {
		return Array.from(this.references.values());
	}

	/**
	 * Get only used references
	 */
	public getUsedReferences(): Reference[] {
		return this.getAllReferences().filter((ref) => ref.used);
	}

	/**
	 * Format references in Swedish style
	 */
	public formatSwedishBibliography(onlyUsed = true): string {
		const refs = onlyUsed ? this.getUsedReferences() : this.getAllReferences();

		// Sort by author/title
		const sorted = [...refs].sort((a, b) => {
			const aKey = a.author || a.title;
			const bKey = b.author || b.title;
			return aKey.localeCompare(bKey, "sv");
		});

		const formatted: string[] = [];

		for (const ref of sorted) {
			let citation = "";

			if (ref.type === "quote") {
				// Quote from database
				citation = `— ${ref.author || "Okänd"}. ${ref.title}.`;
				if (ref.publication) {
					citation += `\n  (${ref.publication})`;
				}
			} else if (ref.type === "academic") {
				// Academic paper/book
				citation = ref.author ? `${ref.author}. "${ref.title}".` : `"${ref.title}".`;
				if (ref.publication) {
					citation += ` ${ref.publication}`;
					if (ref.date) {
						citation += `, ${ref.date}`;
					}
					citation += ".";
				}
				if (ref.url && ref.accessDate) {
					citation += `\n  ${ref.url} (Hämtad ${this.formatSwedishDate(ref.accessDate)})`;
				}
			} else if (ref.type === "media") {
				// News article
				citation = ref.author ? `${ref.author}. "${ref.title}".` : `"${ref.title}".`;
				if (ref.publication) {
					citation += ` ${ref.publication}`;
				}
				if (ref.date) {
					citation += `, ${ref.date}`;
				}
				citation += ".";
				if (ref.url && ref.accessDate) {
					citation += `\n  Hämtad ${this.formatSwedishDate(ref.accessDate)}.`;
				}
			} else {
				// Web source
				citation = `"${ref.title}".`;
				if (ref.url) {
					citation += `\n  ${ref.url}`;
					if (ref.accessDate) {
						citation += ` (Hämtad ${this.formatSwedishDate(ref.accessDate)})`;
					}
				}
			}

			formatted.push(citation);
		}

		return formatted.join("\n\n");
	}

	/**
	 * Format date in Swedish (e.g., "31 januari 2026")
	 */
	private formatSwedishDate(dateStr: string): string {
		const date = new Date(dateStr);
		const day = date.getDate();
		const months = [
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
		const month = months[date.getMonth()];
		const year = date.getFullYear();
		return `${day} ${month} ${year}`;
	}

	/**
	 * Get statistics
	 */
	public getStats(): {
		total: number;
		used: number;
		byType: Record<string, number>;
		byCredibility: Record<string, number>;
	} {
		const all = this.getAllReferences();
		const used = this.getUsedReferences();

		const byType: Record<string, number> = {};
		const byCredibility: Record<string, number> = {};

		for (const ref of all) {
			byType[ref.type] = (byType[ref.type] || 0) + 1;
			if (ref.credibility) {
				byCredibility[ref.credibility] = (byCredibility[ref.credibility] || 0) + 1;
			}
		}

		return {
			total: all.length,
			used: used.length,
			byType,
			byCredibility,
		};
	}

	/**
	 * Export references as JSON
	 */
	public toJSON(): Reference[] {
		return this.getAllReferences();
	}

	/**
	 * Import references from JSON
	 */
	public fromJSON(refs: Reference[]): void {
		this.references.clear();
		for (const ref of refs) {
			this.references.set(ref.id, ref);
			// Update counter to avoid ID collisions
			const num = Number.parseInt(ref.id.replace("ref-", ""), 10);
			if (!Number.isNaN(num) && num > this.idCounter) {
				this.idCounter = num;
			}
		}
	}
}
