import type { ExpressionSpecification, LayerSpecification } from "maplibre-gl";

/** Place and water names as a Swedish atlas prints them (»Norge«, »Helsingfors«, »Nordsjön«).
 *  The base style writes the English name with the local script under it (»Norway«,
 *  »Moscow / Москва«). OpenFreeMap's tiles carry `name:sv`; where one is missing, the Latin
 *  form, then the local name. Street names and shields keep the style's own fields. */
const SWEDISH_NAME: ExpressionSpecification = [
	"coalesce",
	["get", "name:sv"],
	["get", "name:latin"],
	["get", "name"],
];
const SWEDISH_LABEL_LAYER = /^(label_|water_name|waterway_line_label|airport)/;

type BaseColor = "land" | "water" | "building" | "road" | "border" | "label" | "halo";

/** Apply the page palette when MapLibre first lays out Positron, including on style restoration. */
export function styleBasemapLayer(
	layer: LayerSpecification,
	color: (key: BaseColor) => ExpressionSpecification,
): LayerSpecification {
	// A context restore feeds the constructor transform a snapshot containing our own markers.
	if (layer.id.startsWith("mk-")) return layer;
	switch (layer.type) {
		case "background":
			return { ...layer, paint: { ...layer.paint, "background-color": color("land") } };
		case "symbol": {
			const styled = {
				...layer,
				paint: { ...layer.paint, "text-color": color("label"), "text-halo-color": color("halo") },
			};
			if (SWEDISH_LABEL_LAYER.test(layer.id) && layer.layout?.["text-field"]) {
				styled.layout = { ...layer.layout, "text-field": SWEDISH_NAME };
			}
			return styled;
		}
		case "fill": {
			let fill: BaseColor;
			if (/water/.test(layer.id)) fill = "water";
			else if (/building/.test(layer.id)) fill = "building";
			else if (/landcover|landuse|wood|park|grass|forest|sand|wetland/.test(layer.id))
				fill = "land";
			else return layer;
			return { ...layer, paint: { ...layer.paint, "fill-color": color(fill) } };
		}
		case "line": {
			const paint = { ...layer.paint };
			if (/water/.test(layer.id)) paint["line-color"] = color("water");
			else if (/boundary|admin|border/.test(layer.id)) {
				paint["line-color"] = color("border");
				paint["line-opacity"] = 0.45;
			} else if (
				/road|street|highway|bridge|tunnel|transit|rail|path|motorway|trunk/.test(layer.id)
			) {
				paint["line-color"] = color("road");
			} else return layer;
			return { ...layer, paint };
		}
		default:
			return layer;
	}
}
