import { describe, expect, it, vi } from "vitest";
import { LOCATING, locationFailed, requestMapLocation } from "./geolocation";

describe("the mosque map's location button", () => {
	it.each(["starting", "unavailable"])("allows another press when geolocation is %s", (reason) => {
		// Before its async setup finishes, MapLibre returns false without firing an event.
		// A missing geolocation API throws. Both used to leave the button permanently busy.
		const control = {
			trigger: vi
				.fn(() => true)
				.mockImplementationOnce(() => {
					if (reason === "unavailable") throw new TypeError("Geolocation unavailable");
					return false;
				}),
		};
		const button = { ariaBusy: null };
		const status = { textContent: "" };
		requestMapLocation(control, button, status);
		expect(button.ariaBusy).toBeNull();
		expect(status.textContent).toBe(locationFailed(2));

		requestMapLocation(control, button, status);
		expect(button.ariaBusy).toBe("true");
		expect(status.textContent).toBe(LOCATING);
		requestMapLocation(control, button, status);
		expect(control.trigger).toHaveBeenCalledTimes(2);
	});
});
