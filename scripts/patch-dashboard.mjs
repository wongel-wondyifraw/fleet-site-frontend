import fs from "fs";

const p = new URL(
  "../components/dashboard/DesktopDashboard.tsx",
  import.meta.url,
);
let s = fs.readFileSync(p, "utf8");

const D = "div";
const o = `<${D}`;
const c = `</${D}>`;

const pageIntroRight = `      ${o} className="flex flex-wrap items-center gap-4 sm:gap-6">
        ${o} className="hidden text-right lg:block">
          <p className="text-sm font-semibold text-dashboard-on-background">
            October 24, 2023
          </p>
          <p className="text-[11px] text-dashboard-on-surface-variant">
            08:42 AM · GMT-5
          </p>
        ${c}
        ${o} className="flex items-center gap-2 rounded-full bg-white p-2 pr-5 shadow-sm">
          <span className="flex size-10 items-center justify-center rounded-full bg-dashboard-surface-low">
            <CircleUser className="size-5 text-dashboard-primary" />
          </span>
          ${o} className="ml-1 hidden sm:block">
            <p className="text-sm font-semibold text-dashboard-on-background">
              Manager
            </p>
            <p className="text-[11px] font-semibold text-dashboard-primary">
              Fleet Admin
            </p>
          ${c}
          <Button
            variant="ghost"
            size="icon"
            className="ml-2 size-9 rounded-full hover:bg-dashboard-surface-low"
          >
            <Bell className="size-4 text-dashboard-on-surface-variant" />
          </Button>
        ${c}
      ${c}`;

s = s.replace(
  /      <div className="flex flex-wrap items-center gap-3 sm:gap-4">[\s\S]*?      <\/div>\n    <\/header>/,
  `${pageIntroRight}\n    </header>`,
);

fs.writeFileSync(p, s);
console.log("done", s.includes("Fleet Admin") ? "ok" : "fail");
