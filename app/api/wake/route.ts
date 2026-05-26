import { NextResponse } from "next/server";

// /api/wake — lightweight endpoint for an external cron (cron-job.org,
// UptimeRobot, GitHub Actions, etc.) to ping every ~14 minutes. Hitting it
// forces Vercel to spin up the dynamic runtime for this project so the next
// real user request doesn't pay a cold-start penalty.
//
// We force-dynamic + edge to make sure no static caching happens anywhere
// along the path - a cached "OK" wouldn't actually wake the function.
export const dynamic = "force-dynamic";
export const revalidate = 0;
// Edge runtime spins up the fastest and is cheapest on Vercel; it's also the
// surface most likely to go cold on the Hobby tier when traffic is sparse.
export const runtime = "edge";

export function GET() {
  return new NextResponse("OK", {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      // Mark this as an intentional dynamic endpoint so analytics tools and
      // log readers can filter cron pings out of real-user traffic.
      "X-Wake-Endpoint": "fleetsite-frontend",
    },
  });
}

// Some uptime monitors send HEAD instead of GET to save bandwidth - support both.
export function HEAD() {
  return new NextResponse(null, {
    status: 200,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "X-Wake-Endpoint": "fleetsite-frontend",
    },
  });
}
