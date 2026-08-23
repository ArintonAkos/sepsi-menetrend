const SOURCE_URL = "https://sepsibike.ro/harta-statii-biciclete";

export default async function handler(req: Request) {
  try {
    const response = await fetch(SOURCE_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });

    if (!response.ok) {
      throw new Error(`Upstream returned ${response.status}`);
    }

    const html = await response.text();
    const match = html.match(/var items = (\[[\s\S]*?\]);/);
    if (!match) {
      throw new Error("Station items not found in response");
    }

    const rawStations = JSON.parse(match[1]);
    const stations = rawStations.map((s: {
      StationName: string;
      Address: string;
      Latitude: number;
      Longitude: number;
      OcuppiedSpots: number;
      EmptyDoors: number;
      Status: string;
    }) => ({
      id: s.StationName.split(".")[0].trim().padStart(2, "0"),
      name: s.StationName,
      address: s.Address,
      lat: s.Latitude,
      lng: s.Longitude,
      availableBikes: s.OcuppiedSpots,
      freeDocks: s.EmptyDoors,
      totalCapacity: s.OcuppiedSpots + s.EmptyDoors,
      status: s.Status,
    }));

    return new Response(JSON.stringify(stations), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        "Netlify-CDN-Cache-Control": "public, max-age=60, stale-while-revalidate=300",
        "Access-Control-Allow-Origin": "*",
      },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: "Failed to fetch bike data", details: String(err) }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

export const config = {
  path: "/api/sepsibike",
};
