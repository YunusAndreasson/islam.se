/** Escape the five XML predefined entities. Safe for both element text and
 *  attribute values (a superset of what each needs), so the podcast feed and the
 *  image sitemap — which kept their own partial copies — can share one escaper. */
export function escapeXml(str: string): string {
	return str
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;");
}
