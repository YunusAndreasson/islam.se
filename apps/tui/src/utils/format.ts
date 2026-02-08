export function truncate(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	return `${text.slice(0, maxLength)}…`;
}

/** Truncate and pad to a fixed width for column alignment. */
export function fixedWidth(text: string, width: number): string {
	if (text.length > width) return `${text.slice(0, width - 1)}…`;
	return text.padEnd(width);
}

export function formatDate(date: string | Date): string {
	const d = typeof date === "string" ? new Date(date) : date;
	return d.toLocaleDateString("sv-SE");
}
