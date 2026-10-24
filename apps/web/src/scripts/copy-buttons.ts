// THE COPY BUTTONS on /ai/: the server address and each code block (CopyCodeBlock). A
// button marked `data-copy-button` copies the <code> of its `data-copy-scope`, says so in
// the scope's status line, and wears `data-copied` for a moment — the icons swap on that
// attribute in CSS, not on inline styles a script sets (an inline style outranks the rule
// that would undo it: AudioPlayer.astro). Where the clipboard refuses, the text is
// selected for the reader to copy.
import { copyText } from "./clipboard";
import { onPage } from "./page";

onPage((signal) => {
	for (const button of document.querySelectorAll<HTMLButtonElement>("[data-copy-button]")) {
		const scope = button.closest("[data-copy-scope]");
		const code = scope?.querySelector("code");
		const status = scope?.querySelector<HTMLElement>(".copy-status");
		if (!(code && status)) continue;
		const label = button.querySelector<HTMLElement>(".copy-label");
		let reset: ReturnType<typeof setTimeout> | undefined;
		const settle = () => {
			button.removeAttribute("data-copied");
			status.textContent = "";
			if (label) label.textContent = "Kopiera";
		};
		signal.addEventListener("abort", () => clearTimeout(reset), { once: true });
		button.addEventListener(
			"click",
			async () => {
				clearTimeout(reset);
				settle();
				button.disabled = true;
				const copied = await copyText(code.textContent ?? "");
				button.disabled = false;
				if (copied) {
					button.setAttribute("data-copied", "");
					status.textContent = "Kopierad.";
					if (label) label.textContent = "Kopierad";
					reset = setTimeout(settle, 2000);
					return;
				}
				const range = document.createRange();
				range.selectNodeContents(code);
				const selection = window.getSelection();
				selection?.removeAllRanges();
				selection?.addRange(range);
				status.textContent =
					"Kunde inte kopiera automatiskt. Texten är markerad så att du kan kopiera den själv.";
			},
			{ signal },
		);
	}
});
