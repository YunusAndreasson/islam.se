// The wall's prayer-time lattice, built off the main thread.
//
// The screen's lattice is 137 × 104 cells, each a complete adhan solve: 309 ms on a desktop
// (measured, node), several times that on the kind of box behind a mosque television, at
// every boot and again at every Stockholm midnight. buildGridAsync keeps that from being one
// long task by yielding after each row, but the work still ran on the thread that beats the
// clock's colon, runs the camera move and animates the hand-off. In a worker, all the main
// thread does is receive the result.
//
// Written for a page that runs for months without a reload, so nothing here can end in a
// state only a reload would clear. A worker that errors or stops answering is terminated and
// forgotten, that one lattice is built on the main thread (buildGridAsync), and the next
// day's build starts a fresh worker. There is deliberately no »the worker is broken« flag: a
// chunk that failed to load over a mosque's wifi in March is no reason to give up in June.
import type { PrayerSettings } from "../settings";
import { buildGridAsync, type GridOptions, type SolarGrid } from "./field";
import type { GridReply, GridRequest } from "./grid-worker";

/** Long enough for a slow box to build the lattice; short enough that a worker which never
 *  answers costs the lines one wait, not the day. */
const ANSWER_WITHIN_MS = 30_000;

/** Kept between builds rather than started for each: a deploy takes the old build's worker
 *  file off the origin, and a wall that has not reloaded since could not start a new worker
 *  — while the one it already has goes on working. */
let worker: Worker | null = null;
let nextId = 0;

function dropWorker(w: Worker): void {
	w.terminate();
	if (worker === w) worker = null;
}

/** buildGridAsync's lattice, computed in a worker. Never rejects on the worker's account: any
 *  failure builds it on the main thread instead. */
export function buildGridOffMainThread(
	date: Date,
	settings: PrayerSettings,
	opts: GridOptions,
): Promise<SolarGrid> {
	return new Promise<SolarGrid>((resolve, reject) => {
		if (typeof Worker !== "function") throw new Error("bonetider: no Worker");
		worker ??= new Worker(new URL("./grid-worker.ts", import.meta.url), {
			type: "module",
			name: "bonetider-grid",
		});
		const w = worker;
		const id = ++nextId;
		const done = (): void => {
			clearTimeout(timer);
			w.removeEventListener("message", onMessage);
			w.removeEventListener("error", onFailure);
			w.removeEventListener("messageerror", onFailure);
		};
		const onMessage = (event: MessageEvent<GridReply>): void => {
			const reply = event.data;
			if (reply.id !== id) return;
			done();
			if ("grid" in reply) resolve(reply.grid);
			else reject(new Error(reply.error));
		};
		// A worker that failed to load, crashed, or has not answered in time is not reused.
		const onFailure = (): void => {
			done();
			dropWorker(w);
			reject(new Error("bonetider: grid worker failed"));
		};
		const timer = setTimeout(onFailure, ANSWER_WITHIN_MS);
		w.addEventListener("message", onMessage);
		w.addEventListener("error", onFailure);
		w.addEventListener("messageerror", onFailure);
		const request: GridRequest = { id, at: date.getTime(), settings, opts };
		try {
			w.postMessage(request);
		} catch (err) {
			// Settings that cannot be cloned are this request's problem, not the worker's.
			done();
			reject(err);
		}
	}).catch(() => buildGridAsync(date, settings, opts));
}
