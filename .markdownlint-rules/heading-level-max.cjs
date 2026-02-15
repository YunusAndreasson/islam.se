// @ts-check
/** @type {import("markdownlint").Rule} */
module.exports = {
  names: ["islam-se/heading-level-max"],
  description: "Only ## headings allowed (no # or ### or deeper)",
  tags: ["islam-se"],
  function: function (params, onError) {
    for (const token of params.tokens) {
      if (token.type === "heading_open") {
        const level = Number.parseInt(token.tag.slice(1), 10);
        if (level !== 2) {
          onError({
            lineNumber: token.lineNumber,
            detail: "Heading level " + level + " — only level 2 (##) allowed",
          });
        }
      }
    }
  },
};
