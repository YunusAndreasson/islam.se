import { describe, expect, it } from "vitest";
import {
	cleanPassageText,
	findPageMarkers,
	formatPageSpan,
	type PassageSlice,
	resolvePassagePages,
} from "./pages.js";

const none = (): PassageSlice[] => [];

describe("resolvePassagePages — OpenITI markers close the page they follow", () => {
	it("gives the page of the FIRST marker after the text, not the one before it", () => {
		// Majmūʿ al-fatāwā 28:389–390 as OpenITI has it. »ولاية أمر الناس من أعظم واجبات
		// الدين« is cited as 28:390; reading the marker before the text (PageV28P389) as
		// its page — the obvious rule — would cite 28:389.
		const text =
			"فلم يوجب ما لا يستطاع PageV28P389\n# فصل:\n# يجب أن يعرف أن ولاية أمر الناس من أعظم واجبات الدين PageV28P390\n# وروى";
		const pages = resolvePassagePages({ text, startPosition: 0 }, none);
		expect(pages.page).toBe("28:389");
		expect(pages.pages).toBe("28:389–390");
		const match = text.indexOf("ولاية");
		expect(resolvePassagePages({ text, startPosition: 0 }, none, match).matchPage).toBe("28:390");
	});

	it("does not read a marker at the very start of a passage as its page", () => {
		// The marker at the head closes the previous page; the text after it is on the next.
		const text = "PageV01P016\n### || فصل\n# فإذا ثبت وجوب الإمامة PageV01P017\n# والثاني";
		const pages = resolvePassagePages({ text, startPosition: 0 }, none);
		expect(pages.page).toBe("1:17");
	});

	it("reads ahead into the following passages when the passage has no marker", () => {
		const current = { text: "# نص بلا علامة صفحة", startPosition: 1000 };
		// The next passage repeats the tail of this one (overlap); only markers beyond this
		// passage's text count.
		const following = [{ text: "علامة صفحة PageV03P045 # بعدها", startPosition: 1010 }];
		const pages = resolvePassagePages(current, () => following);
		expect(pages.page).toBe("3:45");
		expect(pages.pages).toBe("3:45");
	});

	it("ignores markers in the overlap that lie before the passage's own end", () => {
		const current = { text: "# أول PageV02P010 # ثاني", startPosition: 0 };
		// The following passage starts inside `current` and repeats its marker at absolute
		// position 6; that marker is BEFORE the end of current's text and must be skipped.
		const following = [{ text: "PageV02P010 # ثاني # ثالث PageV02P011", startPosition: 6 }];
		const pages = resolvePassagePages(current, () => following);
		expect(pages.page).toBe("2:10");
		expect(pages.pages).toBe("2:10–11");
	});

	it("spans volumes", () => {
		const text = "# آخر المجلد PageV27P412 # أول المجلد التالي PageV28P001 # تتمة PageV28P002";
		expect(resolvePassagePages({ text, startPosition: 0 }, none).pages).toBe("27:412–28:2");
	});

	it("reports an unnumbered page (PageV00P000) as unknown, not as 0:0", () => {
		const text = "# ١٦ - حدثنا هاشم PageV00P000 # يعمهم بعقابه";
		const pages = resolvePassagePages({ text, startPosition: 0 }, none);
		expect(pages.page).toBeNull();
		expect(pages.pages).toBeNull();
	});

	it("returns null when no marker exists anywhere ahead", () => {
		expect(resolvePassagePages({ text: "# نص", startPosition: 0 }, none).page).toBeNull();
	});

	it("formats spans compactly", () => {
		expect(formatPageSpan({ volume: 1, page: 16 }, { volume: 1, page: 16 })).toBe("1:16");
		expect(formatPageSpan({ volume: 1, page: 16 }, { volume: 1, page: 18 })).toBe("1:16–18");
		expect(findPageMarkers("x PageV12P0034 y")).toEqual([{ index: 2, volume: 12, page: 34 }]);
	});
});

describe("cleanPassageText", () => {
	it("strips OpenITI markup but keeps the words and the section heading", () => {
		const raw = `وعليهم} 2. PageV01P016
### || فصل: "في بيان حكم الخلافة"
# فإذا ثبت وجوب الإمامة ففرضها على الكفاية، فإذا قام
~~بها من هو من أهلها سقط فرضها ms002 على الكفاية`;
		expect(cleanPassageText(raw)).toBe(
			'وعليهم} 2.\nفصل: "في بيان حكم الخلافة"\nفإذا ثبت وجوب الإمامة ففرضها على الكفاية، فإذا قام بها من هو من أهلها سقط فرضها على الكفاية',
		);
	});

	it("drops the #META# header, including a passage that starts mid-header", () => {
		const raw =
			"ibURL\t:: http://shamela.ws/x\n#META# 043.EdPUBLISHER\t:: دار الحديث\n\n#META#Header#End#\n\n### | مقدمة المؤلف\n# بسم الله";
		expect(cleanPassageText(raw)).toBe("مقدمة المؤلف\nبسم الله");
	});

	it("leaves non-OpenITI text alone", () => {
		expect(cleanPassageText("  Det var en gång en kung.\nHan hette Olof.  ")).toBe(
			"Det var en gång en kung.\nHan hette Olof.",
		);
	});
});
