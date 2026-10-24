/** Milliseconds in a day. */
export const MS_PER_DAY = 86_400_000;

/** The reader's own calendar day as an ISO date (»2026-10-24«): what every »still to come«
 *  filter compares an observance's last day against. Local, never UTC — just after a
 *  Swedish midnight `toISOString()` still says yesterday, and the year page went on showing
 *  the observances that had ended. The calendar's three scripts each wrote their own. */
export function localIsoDate(now: Date = new Date()): string {
	const month = String(now.getMonth() + 1).padStart(2, "0");
	const day = String(now.getDate()).padStart(2, "0");
	return `${now.getFullYear()}-${month}-${day}`;
}
