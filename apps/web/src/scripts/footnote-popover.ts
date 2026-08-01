// Footnote + honorific popovers: hover on desktop, tap-to-toggle on touch, Tab-focus
// on keyboard. Shared by the essay route and the /fordjupning/ route — both carry GFM
// footnotes and honorific spans.

const HONORIFIC_TITLES: Record<string, string> = {
	swt: "Jalla jalāluhu — upphöjd är Hans majestät",
	saw: "Ṣallallāhu ʿalayhi wa-sallam — Guds frid och välsignelser vare med honom",
};

export function initFootnotePopovers(): void {
	const ctrl = new AbortController();
	const popover = document.createElement("div");
	popover.className = "fn-popover";
	popover.id = "fn-popover";
	popover.setAttribute("role", "tooltip");
	document.body.appendChild(popover);
	let hideTimer: ReturnType<typeof setTimeout> | null = null;
	let describedRef: HTMLElement | null = null;
	const isTouch = window.matchMedia("(hover: none) and (pointer: coarse)").matches;

	function positionPopover(anchor: Element) {
		const rect = anchor.getBoundingClientRect();
		popover.classList.add("fn-popover--visible");
		const popW = popover.offsetWidth;
		const popH = popover.offsetHeight;
		const pad = 12;
		const gap = 8;
		let left = rect.left + window.scrollX + rect.width / 2 - popW / 2;
		left = Math.max(pad, Math.min(left, window.innerWidth - popW - pad));
		// Prefer above; fall back to below if not enough room
		const above = rect.top - gap - popH;
		if (above >= pad) {
			popover.style.top = `${rect.top + window.scrollY - gap - popH}px`;
		} else {
			popover.style.top = `${rect.bottom + window.scrollY + gap}px`;
		}
		popover.style.left = `${left}px`;
	}

	function showPopover(ref: HTMLAnchorElement) {
		const fnId = ref.getAttribute("href")?.replace("#", "");
		if (!fnId) return;
		const fnLi = document.getElementById(fnId);
		if (!fnLi) return;

		if (hideTimer) {
			clearTimeout(hideTimer);
			hideTimer = null;
		}

		const clone = fnLi.cloneNode(true) as HTMLElement;
		for (const backref of clone.querySelectorAll(".data-footnote-backref")) backref.remove();
		popover.innerHTML = clone.innerHTML;
		popover.setAttribute("data-fn-id", fnId);
		positionPopover(ref.closest("sup") ?? ref);
		// Announce the note content to screen readers while it is shown.
		describedRef?.removeAttribute("aria-describedby");
		ref.setAttribute("aria-describedby", popover.id);
		describedRef = ref;
	}

	function showHonorificPopover(el: HTMLElement) {
		const code = el.classList.contains("honorific--swt")
			? "swt"
			: el.classList.contains("honorific--saw")
				? "saw"
				: null;
		const title = code ? HONORIFIC_TITLES[code] : null;
		if (!title) return;
		if (hideTimer) {
			clearTimeout(hideTimer);
			hideTimer = null;
		}
		popover.textContent = title;
		popover.setAttribute("data-fn-id", "honorific");
		positionPopover(el);
	}

	function dismissPopover() {
		popover.classList.remove("fn-popover--visible");
		popover.removeAttribute("data-fn-id");
		describedRef?.removeAttribute("aria-describedby");
		describedRef = null;
	}

	function scheduleDismiss() {
		hideTimer = setTimeout(dismissPopover, 200);
	}

	// Prevent footnote links from navigating — capture phase runs before Astro's router
	document.addEventListener(
		"click",
		(e) => {
			if ((e.target as HTMLElement).closest("a[data-footnote-ref]")) e.preventDefault();
		},
		{ capture: true, signal: ctrl.signal },
	);

	// Hover: show on mouseenter, hide on mouseleave (with grace period)
	document.addEventListener(
		"mouseenter",
		(e) => {
			if (isTouch) return;
			// closest?. — these are bound to document, so e.target is the document
			// itself when the pointer crosses the page boundary.
			const target = e.target as HTMLElement;
			const ref = target.closest?.<HTMLAnchorElement>("a[data-footnote-ref]");
			if (ref) {
				showPopover(ref);
				return;
			}
			const hon = target.closest?.<HTMLElement>(".honorific");
			if (hon) showHonorificPopover(hon);
		},
		{ capture: true, signal: ctrl.signal },
	);

	document.addEventListener(
		"mouseleave",
		(e) => {
			if (isTouch) return;
			const target = e.target as HTMLElement;
			if (target.closest?.("a[data-footnote-ref]") || target.closest?.(".honorific"))
				scheduleDismiss();
		},
		{ capture: true, signal: ctrl.signal },
	);

	// Keep popover visible while hovering over it
	popover.addEventListener("mouseenter", () => {
		if (hideTimer) {
			clearTimeout(hideTimer);
			hideTimer = null;
		}
	});
	popover.addEventListener("mouseleave", scheduleDismiss);

	// Keyboard: show on Tab-focus, dismiss when focus moves on. :focus-visible
	// keeps tap- and click-driven focus from double-triggering the touch toggle
	// and hover paths below.
	document.addEventListener(
		"focusin",
		(e) => {
			const ref = (e.target as HTMLElement).closest?.<HTMLAnchorElement>("a[data-footnote-ref]");
			if (ref?.matches(":focus-visible")) showPopover(ref);
		},
		{ signal: ctrl.signal },
	);
	document.addEventListener(
		"focusout",
		(e) => {
			if ((e.target as HTMLElement).closest?.("a[data-footnote-ref]")) scheduleDismiss();
		},
		{ signal: ctrl.signal },
	);

	// Click: prevent default jump; on touch and keyboard (detail === 0) toggle
	document.addEventListener(
		"click",
		(e) => {
			const target = e.target as HTMLElement;
			const ref = target.closest<HTMLAnchorElement>("a[data-footnote-ref]");
			if (ref) {
				e.preventDefault();
				if (isTouch || e.detail === 0) {
					const fnId = ref.getAttribute("href")?.replace("#", "");
					if (
						popover.getAttribute("data-fn-id") === fnId &&
						popover.classList.contains("fn-popover--visible")
					) {
						dismissPopover();
					} else {
						showPopover(ref);
					}
				}
				return;
			}
			const hon = target.closest<HTMLElement>(".honorific");
			if (hon && isTouch) {
				if (
					popover.getAttribute("data-fn-id") === "honorific" &&
					popover.classList.contains("fn-popover--visible")
				) {
					dismissPopover();
				} else {
					showHonorificPopover(hon);
				}
				return;
			}
			if (!popover.contains(target)) {
				dismissPopover();
			}
		},
		{ signal: ctrl.signal },
	);

	document.addEventListener(
		"keydown",
		(e) => {
			if (e.key === "Escape" && popover.classList.contains("fn-popover--visible")) {
				e.stopPropagation();
				dismissPopover();
			}
		},
		{ capture: true, signal: ctrl.signal },
	);

	document.addEventListener(
		"astro:before-swap",
		() => {
			ctrl.abort();
			popover.remove();
		},
		{ once: true },
	);
}
