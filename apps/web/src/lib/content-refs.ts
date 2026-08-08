/** Resolve slugs authored in one content-collection entry's frontmatter (`related`,
 *  `essays`, …) against a same-collection index, throwing a build error that names the
 *  exact stale slug. A "read more" link that silently drops is worse than a build that
 *  fails loudly — the same reasoning tänkare.ts and the fördjupning/svar getStaticPaths
 *  already applied per-field; this is the one implementation they share. */
export function requireBySlug<T>(
	index: ReadonlyMap<string, T>,
	slugs: readonly string[],
	opts: { sourceFile: string; field: string; dataDir: string },
): T[] {
	return slugs.map((slug) => {
		const found = index.get(slug);
		if (!found) {
			throw new Error(
				`${opts.sourceFile}: \`${opts.field}\` references unknown slug "${slug}". ` +
					`Use a slug from ${opts.dataDir} (the filename without .md).`,
			);
		}
		return found;
	});
}
