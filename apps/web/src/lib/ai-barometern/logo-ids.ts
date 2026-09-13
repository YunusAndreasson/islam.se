// Inline SVG ids are page-global. Gemini's logo references its gradients by id, so every
// instance of it on a page needs ids of its own, or the second copy paints the first one's
// gradient and a hidden first copy (the narrow-screen key) blanks them all.
let count = 0;

export function logoInstanceId(): string {
	count += 1;
	return `abm${count}`;
}
