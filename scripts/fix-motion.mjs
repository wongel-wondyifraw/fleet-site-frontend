import fs from "fs";

const p = new URL(
  "../components/dashboard/DesktopDashboard.tsx",
  import.meta.url,
);
const wrong = String.fromCharCode(109, 111, 116, 105, 111, 110);
const right = String.fromCharCode(100, 105, 118);
let s = fs.readFileSync(p, "utf8");
s = s
  .replaceAll(`<${wrong}`, `<${right}`)
  .replaceAll(`</${wrong}>`, `</${right}>`);
fs.writeFileSync(p, s);
console.log("remaining:", (s.match(new RegExp(`<${wrong}`, "g")) || []).length);
