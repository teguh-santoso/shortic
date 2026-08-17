const fs = require("fs");
const path = require("path");

const targetDir = process.argv[2];
if (!targetDir) {
  console.error("Usage: node scripts/generate-config.js <output-dir>");
  process.exit(1);
}

const url = process.env.SUPABASE_URL || "https://YOUR-PROJECT-REF.supabase.co";
const key = process.env.SUPABASE_ANON_KEY || "YOUR-ANON-KEY";

const content =
  "window.APP_CONFIG = {\n" +
  "  SUPABASE_URL: " + JSON.stringify(url) + ",\n" +
  "  SUPABASE_ANON_KEY: " + JSON.stringify(key) + ",\n" +
  "};\n";

fs.mkdirSync(targetDir, { recursive: true });
fs.writeFileSync(path.join(targetDir, "config.js"), content);
console.log("config.js written to " + targetDir);