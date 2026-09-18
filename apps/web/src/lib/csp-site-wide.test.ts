import { describe, expect, it } from "vitest";
import { inlineHashes, widenPolicy } from "./csp-site-wide";

const page = (css: string, js: string) =>
	`<html><head><meta http-equiv="content-security-policy" content="default-src 'self'; script-src 'self' 'sha256-own'; style-src 'self' 'sha256-own'; style-src-attr 'unsafe-inline';">` +
	`<style>${css}</style><script type="module">${js}</script>` +
	`<script type="application/ld+json">{"@type":"Thing"}</script><script type="module" src="/a.js"></script></head></html>`;

function policyOf(html: string): string {
	return /content="([^"]*)"/.exec(html)?.[1] ?? "";
}

describe("site-wide CSP", () => {
	// The bug this exists for: a <meta> policy is fixed at first load, and ClientRouter
	// swaps the next page INTO that document. /essaer/'s stylesheet, judged by /om/'s
	// policy, was refused and the page rendered unstyled after a click.
	it("lets a page accept the inline styles and scripts every other page carries", () => {
		const om = page(".om{}", "om()");
		const essaer = page(".essaer{}", "essaer()");
		const a = inlineHashes(om);
		const b = inlineHashes(essaer);
		const styles = [...new Set([...a.styles, ...b.styles])].sort();
		const scripts = [...new Set([...a.scripts, ...b.scripts])].sort();

		const widened = policyOf(widenPolicy(om, styles, scripts));
		for (const h of b.styles) expect(widened).toContain(`'${h}'`);
		for (const h of b.scripts) expect(widened).toContain(`'${h}'`);
	});

	it("puts style hashes in style-src and script hashes in script-src, never style-src-attr", () => {
		const html = page(".x{}", "x()");
		const { styles, scripts } = inlineHashes(html);
		const directives = policyOf(widenPolicy(html, styles, scripts))
			.split(";")
			.map((d) => d.trim());
		const find = (name: string) => directives.find((d) => d.split(" ")[0] === name) ?? "";
		expect(find("style-src")).toContain(styles[0]);
		expect(find("script-src")).toContain(scripts[0]);
		expect(find("style-src-attr")).toBe("style-src-attr 'unsafe-inline'");
	});

	it("does not hash JSON islands or external scripts, which script-src never judges by hash", () => {
		expect(inlineHashes(page(".x{}", "x()")).scripts).toHaveLength(1);
	});

	// The nightly deploy uploads only files whose bytes changed; a second pass over an
	// already-widened page must be a no-op, or every page would re-upload every night.
	it("is idempotent", () => {
		const html = page(".x{}", "x()");
		const { styles, scripts } = inlineHashes(html);
		const once = widenPolicy(html, styles, scripts);
		expect(widenPolicy(once, styles, scripts)).toBe(once);
	});

	it("leaves a page without a policy untouched", () => {
		const html = "<html><head><style>.x{}</style></head></html>";
		expect(widenPolicy(html, ["sha256-a"], ["sha256-b"])).toBe(html);
	});
});
