import { normaliseBikeStations, type BikeAvailability, type BikeStation } from "../../lib/sepsibike";

const SOURCE_URL = "https://sepsibike.ro/harta-statii-biciclete";
const CACHE_HEADERS = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
  "Netlify-CDN-Cache-Control": "public, max-age=60, stale-while-revalidate=300",
  "Access-Control-Allow-Origin": "*",
};

type Snapshot = { snapshotAt: string; stations: BikeStation[] };

function json(payload: BikeAvailability) {
  return new Response(JSON.stringify(payload), { headers: CACHE_HEADERS });
}

async function snapshot(request: Request): Promise<BikeAvailability> {
  const response = await fetch(new URL("/data/sepsibike.json", request.url));
  if (!response.ok) throw new Error("SepsiBike snapshot unavailable");
  const payload = await response.json() as Snapshot;
  if (!Array.isArray(payload.stations) || typeof payload.snapshotAt !== "string")
    throw new Error("invalid SepsiBike snapshot");
  return { stations: payload.stations, source: "snapshot", fetchedAt: payload.snapshotAt, stale: true };
}

export default async function handler(request: Request) {
  try {
    const response = await fetch(SOURCE_URL, {
      headers: {
        "User-Agent": "Sepsi-Menetrend/1.0 (+https://sepsi-menetrend.netlify.app)",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) throw new Error(`upstream returned ${response.status}`);
    const match = (await response.text()).match(/var items = (\[[\s\S]*?\]);/);
    if (!match) throw new Error("station items not found");
    const stations = normaliseBikeStations(JSON.parse(match[1]));
    return json({ stations, source: "live", fetchedAt: new Date().toISOString(), stale: false });
  } catch {
    try {
      return json(await snapshot(request));
    } catch {
      return new Response(JSON.stringify({ error: "SepsiBike availability temporarily unavailable" }), {
        status: 503,
        headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
      });
    }
  }
}

export const config = { path: "/api/sepsibike" };
