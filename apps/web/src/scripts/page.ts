// ONE PAGE LIFECYCLE for every script under Base's <ClientRouter />.
//
// A bundled module script runs once per full page load. After a client navigation it
// does not run again, so whatever it binds to the page's elements has to be bound again
// on the next page, and unbound before that page is swapped in. Eleven scripts each
// wrote that pair by hand (an AbortController, an `astro:before-swap` listener), in
// several shapes, and some forgot the second half.
//
// `onPage(setup)` runs `setup` for the current page and for every page after it, and
// aborts the signal it handed over just before the page is swapped out. Return a
// function for the cleanup a signal cannot do (an observer's disconnect, a timer).
//
//   ready  (default) as soon as the document is there: when the module runs, which for a
//          module script is after parsing, and after every swap. Use it for controls.
//          The router's own `astro:page-load` fires on a cold visit from the window's
//          `load` event, after the last image, and a control bound there is dead while
//          the page is already on screen.
//   load   on `astro:page-load`, as before: for work that measures the finished page.
//
// A module first evaluated during a client navigation runs after that navigation's swap,
// so its first run is the module's own and the swap event it missed is not needed.

/** Binds the page; may return its cleanup. Any other return value is ignored. */
type Setup = (signal: AbortSignal) => unknown;

export function onPage(setup: Setup, { when = "ready" }: { when?: "ready" | "load" } = {}): void {
	let controller: AbortController | null = null;
	let cleanup: (() => void) | undefined;

	const teardown = (): void => {
		controller?.abort();
		controller = null;
		cleanup?.();
		cleanup = undefined;
	};

	const run = (): void => {
		teardown();
		controller = new AbortController();
		const result = setup(controller.signal);
		cleanup = typeof result === "function" ? (result as () => void) : undefined;
	};

	document.addEventListener("astro:before-swap", teardown);
	if (when === "load") {
		document.addEventListener("astro:page-load", run);
		return;
	}
	document.addEventListener("astro:after-swap", run);
	run();
}
