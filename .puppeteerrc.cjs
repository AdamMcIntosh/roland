/** @type {import('puppeteer').Configuration} */
module.exports = {
  // Skip bundled browser download during npm install — use system Chrome for tests.
  // Run `npx puppeteer browsers install` locally if you need the bundled browser.
  chrome: { skipDownload: true },
  'chrome-headless-shell': { skipDownload: true },
  firefox: { skipDownload: true },
};
