import { readFileSync } from "node:fs";

const indexHtml = readFileSync("static/index.html", "utf8");
const appSource = readFileSync("static/app.bundle.js", "utf8");

const scriptTags = [...indexHtml.matchAll(/<script\b[^>]*>/gi)].map((match) => match[0]);
const appScript = scriptTags.find((tag) => /src=["']\/app\.bundle\.js(?:\?[^"']*)?["']/i.test(tag));

if (!appScript) {
  throw new Error("static/index.html must load /app.bundle.js.");
}

if (/https?:\/\/unpkg\.com/i.test(indexHtml)) {
  throw new Error("Frontend runtime scripts must be served locally, not from unpkg.com.");
}

if (/type=["']text\/babel["']/i.test(indexHtml)) {
  throw new Error("Do not load Babel in the browser. Use the prebuilt app.bundle.js.");
}

for (const tag of scriptTags) {
  if (/src=["'][^"']+\.(?:mjs|module\.js)["']/i.test(tag) && !/type=["']module["']/i.test(tag)) {
    throw new Error(`ES module script must use type="module": ${tag}`);
  }
}

if (/^\s*import\s/m.test(appSource)) {
  throw new Error("app.bundle.js must not contain top-level import statements.");
}

console.log("Frontend script loading check passed.");
