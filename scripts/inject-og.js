const fs = require("fs");
const path = require("path");

const targetDir = process.argv[2];
if (!targetDir) {
  console.error("Usage: node scripts/inject-og.js <output-dir>");
  process.exit(1);
}

const file = path.join(targetDir, "index.html");
const siteUrl = (process.env.SITE_URL || "").replace(/\/+$/, "");

const html = fs.readFileSync(file, "utf8").replace(/__SITE_URL__/g, siteUrl);
fs.writeFileSync(file, html);
console.log("OG URL injected (" + (siteUrl || "relative fallback") + ") into " + file);