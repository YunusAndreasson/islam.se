// EAS Metadata reads this file (eas.json → submit.production.ios.metadataPath):
// store.config.json plus the App Review contact's phone number, which comes from
// the environment so it isn't in the repository.
//
//   APP_REVIEW_PHONE=+46… eas metadata:push
//
// `eas metadata:pull` writes store.config.json; this file needs no editing.
const config = require("./store.config.json");

const phone = process.env.APP_REVIEW_PHONE;
if (!phone) {
	throw new Error("Set APP_REVIEW_PHONE to the App Review contact's number: APP_REVIEW_PHONE=+46… eas metadata:push");
}
config.apple.review.phone = phone;

module.exports = config;
