import { afterEach, describe, expect, it, vi } from "vitest";
import { wireAllSettingsForms } from "./bonetider-settings-form";

afterEach(() => vi.unstubAllGlobals());

function setup(mode: "storage" | "detached") {
	const saved = new Map<string, string>();
	vi.stubGlobal("localStorage", {
		getItem: (key: string) => saved.get(key) ?? null,
		setItem: (key: string, value: string) => saved.set(key, value),
	});
	vi.stubGlobal("window", new EventTarget());
	const listeners = new Map<string, (event: Event) => void>();
	const form = {
		dataset: { btMode: mode },
		querySelector: () => null,
		querySelectorAll: () => [],
		addEventListener: (name: string, listener: (event: Event) => void) =>
			listeners.set(name, listener),
		dispatchEvent: vi.fn(),
	};
	wireAllSettingsForms({ querySelectorAll: () => [form] } as unknown as ParentNode);
	const input = {
		dataset: { adjust: "fajr" },
		value: "5",
		validity: { valid: true },
		reportValidity: vi.fn(),
	};
	const change = () => listeners.get("change")?.({ target: input } as unknown as Event);
	return { saved, form, input, change };
}

for (const mode of ["storage", "detached"] as const) {
	describe(`${mode} prayer settings validation`, () => {
		it("keeps the last valid setting when an adjustment is invalid, then accepts a correction", () => {
			const { saved, form, input, change } = setup(mode);
			change();
			expect(form.dispatchEvent).toHaveBeenCalledTimes(1);
			input.value = "999";
			input.validity.valid = false;
			change();
			expect(input.reportValidity).toHaveBeenCalledOnce();
			expect(form.dispatchEvent).toHaveBeenCalledTimes(1);
			if (mode === "storage") {
				expect(JSON.parse(saved.get("bonetider:settings") ?? "{}").adjustments.fajr).toBe(5);
			} else {
				expect(saved.size).toBe(0);
			}
			input.value = "-10";
			input.validity.valid = true;
			change();
			expect(form.dispatchEvent).toHaveBeenCalledTimes(2);
			const event = form.dispatchEvent.mock.calls[1]?.[0] as CustomEvent;
			expect(event.detail.settings.adjustments.fajr).toBe(-10);
		});
	});
}
