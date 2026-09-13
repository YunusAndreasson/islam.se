// The prayer-time lattice, built in a Web Worker (grid-client.ts says why).
//
// Nothing on this path touches the DOM — field.ts, prayer-times.ts and adhan are plain
// computation — which is what lets the same buildGrid run on either side of postMessage.
import type { PrayerSettings } from "../settings";
import { buildGrid, type GridOptions, type SolarGrid } from "./field";

export interface GridRequest {
	id: number;
	/** The instant the lattice is built for, in epoch ms. */
	at: number;
	settings: PrayerSettings;
	opts: GridOptions;
}

export type GridReply = { id: number; grid: SolarGrid } | { id: number; error: string };

addEventListener("message", (event: MessageEvent<GridRequest>) => {
	const { id, at, settings, opts } = event.data;
	let reply: GridReply;
	try {
		reply = { id, grid: buildGrid(new Date(at), settings, opts) };
	} catch (err) {
		reply = { id, error: String(err) };
	}
	postMessage(reply);
});
