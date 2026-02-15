// @ts-check
/** @type {import("markdownlint").Rule} */
module.exports = {
  names: ["islam-se/no-guillemets"],
  description: "No guillemets — use straight double quotes",
  tags: ["islam-se"],
  function: function (params, onError) {
    for (let i = 0; i < params.lines.length; i++) {
      if (/[»«]/.test(params.lines[i])) {
        onError({
          lineNumber: i + 1,
          detail: 'Replace guillemets with straight double quotes (")',
        });
      }
    }
  },
};
