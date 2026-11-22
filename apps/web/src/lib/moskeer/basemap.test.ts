import type { ExpressionSpecification, LayerSpecification } from "maplibre-gl";
import { describe, expect, it } from "vitest";
import { styleBasemapLayer } from "./basemap";

const color = (key: string): ExpressionSpecification => ["get", key];

describe("mosque basemap style", () => {
	it("applies the palette before rendering while retaining the provider's other paint", () => {
		const border: LayerSpecification = {
			type: "line",
			id: "boundary_country",
			source: "openmaptiles",
			paint: { "line-width": 2 },
		};
		expect(styleBasemapLayer(border, color)).toMatchObject({
			paint: { "line-width": 2, "line-color": color("border"), "line-opacity": 0.45 },
		});
		const water: LayerSpecification = { type: "fill", id: "water", source: "openmaptiles" };
		expect(styleBasemapLayer(water, color)).toMatchObject({
			paint: { "fill-color": color("water") },
		});
	});

	it("styles labels and keeps road shields and restored cluster counts readable", () => {
		const symbol: LayerSpecification = {
			type: "symbol",
			id: "label_city",
			source: "openmaptiles",
			layout: { "text-field": "{name}", "text-size": 12 },
		};
		expect(styleBasemapLayer(symbol, color)).toMatchObject({
			layout: {
				"text-field": ["coalesce", ["get", "name:sv"], ["get", "name:latin"], ["get", "name"]],
				"text-size": 12,
			},
			paint: { "text-color": color("label"), "text-halo-color": color("halo") },
		});
		expect(styleBasemapLayer({ ...symbol, id: "road_shield" }, color)).toMatchObject({
			layout: symbol.layout,
		});
		// MapLibre reapplies the transform to its snapshot after a WebGL context loss.
		// The cluster count needs its own contrasting ink throughout that restoration.
		const count: LayerSpecification = {
			...symbol,
			id: "mk-cluster-count",
			paint: { "text-color": "#fffaf0" },
		};
		expect(styleBasemapLayer(count, color)).toEqual(count);
	});
});
