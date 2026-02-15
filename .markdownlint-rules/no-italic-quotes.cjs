// @ts-check
/** @type {import("markdownlint").Rule} */
module.exports = {
  names: ["islam-se/no-italic-quotes"],
  description: 'No italic quotes — write "text" not *"text"*',
  tags: ["islam-se"],
  function: function (params, onError) {
    for (let i = 0; i < params.lines.length; i++) {
      const line = params.lines[i];
      // Matches *"..."* pattern (italic wrapping a quoted string)
      if (/\*"[^"]*"\*/.test(line)) {
        onError({
          lineNumber: i + 1,
          detail:
            'Remove italic markers around quotes — write "text" not *"text"*',
        });
      }
      // Catch entirely-italic blockquotes: > *long text*
      // Allow short italics (book titles like *Ihya 'Ulum al-Din*)
      if (/^>\s*\*[^*]{40,}\*\s*$/.test(line)) {
        onError({
          lineNumber: i + 1,
          detail:
            "Blockquote content should not be entirely italic — remove * markers",
        });
      }
    }
  },
};
