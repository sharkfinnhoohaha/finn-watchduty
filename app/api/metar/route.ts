import { NextResponse } from "next/server";

export const revalidate = 300; // 5 min

type RawMetar = {
  rawOb?: string;
  reportTime?: string;
  temp?: number;
  dewp?: number;
  wdir?: number | string;
  wspd?: number;
  visib?: number | string;
  altim?: number;
  wxString?: string | null;
  cover?: string;
  clouds?: Array<{ cover?: string; base?: number }>;
};

export async function GET() {
  try {
    const res = await fetch(
      "https://aviationweather.gov/api/data/metar?ids=KOXR&format=json&taf=false",
      { next: { revalidate: 300 } }
    );
    if (!res.ok) {
      return NextResponse.json(
        { error: "upstream", status: res.status },
        { status: 502 }
      );
    }
    const raw = (await res.json()) as RawMetar[];
    const first = raw?.[0];
    if (!first) {
      return NextResponse.json({ error: "no_data" }, { status: 502 });
    }
    return NextResponse.json(
      {
        rawOb: first.rawOb ?? null,
        reportTime: first.reportTime ?? null,
        tempC: typeof first.temp === "number" ? first.temp : null,
        dewC: typeof first.dewp === "number" ? first.dewp : null,
        windDir: first.wdir ?? null,
        windKt: typeof first.wspd === "number" ? first.wspd : null,
        visSm: first.visib ?? null,
        altimHg: typeof first.altim === "number" ? first.altim / 33.8639 : null,
        clouds: first.clouds ?? [],
      },
      {
        status: 200,
        headers: {
          "Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
        },
      }
    );
  } catch (e) {
    return NextResponse.json(
      { error: "fetch_failed", message: (e as Error).message },
      { status: 502 }
    );
  }
}
