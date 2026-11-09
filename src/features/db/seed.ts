/**
 * Seed a demo stadium.
 *
 * Run with `npm run db:seed`. Idempotent: each event is deleted by slug first
 * (sections and seats cascade) so re-running never duplicates inventory.
 *
 * Deterministic: the price jitter comes from a small LCG rather than
 * Math.random, so two runs produce byte-identical data - which makes "why did
 * this listing change?" actually debuggable.
 *
 * Note: relative imports rather than the `@/` alias, so the script does not
 * depend on the runner resolving tsconfig paths.
 */
import { eq } from "drizzle-orm";
import { formatMoney } from "../lib/money";
import { loadEnvFiles } from "../lib/load-env";
import { closeDb, getDb } from "./index";
import { events, seats, type NewSeat, sections, type ViewQuality } from "./schema";

// ---------------------------------------------------------------------------
// Deterministic pseudo-randomness
// ---------------------------------------------------------------------------
let rngState = 0x2f6e2b1;

function random() {
  rngState = (rngState * 1664525 + 1013904223) % 4294967296;
  return rngState / 4294967296;
}

/** Round to the nearest 500 kobo (₦5) so prices read like real listings. */
function roundTo(value: number, step = 500) {
  return Math.round(value / step) * step;
}

// ---------------------------------------------------------------------------
// Stadium geometry
// ---------------------------------------------------------------------------
type Tier = "vip" | "premium" | "standard" | "accessible";

type SectionSpec = {
  code: string;
  name: string;
  tier: Tier;
  /** Container percentages: x/y are the centre of the block. */
  x: number;
  y: number;
  w: number;
  h: number;
  rot: number;
  /** View qualities cycled through the seats, front row first. */
  mix: ViewQuality[];
};

const BASE_PRICE_KOBO: Record<Tier, number> = {
  vip: 18_000_000, // ₦180,000
  premium: 4_500_000, // ₦45,000
  standard: 1_200_000, // ₦12,000
  accessible: 900_000, // ₦9,000
};

const VIEW_NOTES: Partial<Record<ViewQuality, string>> = {
  premium: "Centre line, elevated above the touchline",
  restricted: "A pillar or rail may cross part of the pitch",
  obstructed: "Roof overhang cuts off the far corner",
};

const BOWL: SectionSpec[] = [
  { code: "N1", name: "North Stand Upper", tier: "vip", x: 50, y: 7, w: 42, h: 7, rot: 0, mix: ["premium"] },
  { code: "N2", name: "North Stand Lower", tier: "premium", x: 50, y: 15, w: 34, h: 6, rot: 0, mix: ["premium", "clear", "clear"] },
  { code: "C1", name: "North West Corner", tier: "standard", x: 21, y: 9, w: 11, h: 6, rot: -14, mix: ["clear", "clear", "restricted"] },
  { code: "C2", name: "North East Corner", tier: "standard", x: 79, y: 9, w: 11, h: 6, rot: 14, mix: ["clear", "clear", "restricted"] },
  { code: "W1", name: "West Stand Upper", tier: "premium", x: 13, y: 32, w: 8, h: 38, rot: 0, mix: ["clear", "clear", "restricted"] },
  { code: "W2", name: "West Stand Lower", tier: "standard", x: 22, y: 32, w: 6, h: 28, rot: 0, mix: ["clear", "clear", "restricted", "clear"] },
  { code: "E1", name: "East Stand Upper", tier: "premium", x: 87, y: 32, w: 8, h: 38, rot: 0, mix: ["clear", "clear", "restricted"] },
  { code: "E2", name: "East Stand Lower", tier: "standard", x: 78, y: 32, w: 6, h: 28, rot: 0, mix: ["clear", "clear", "restricted", "clear"] },
  { code: "S1", name: "South Stand", tier: "standard", x: 50, y: 57, w: 42, h: 7, rot: 0, mix: ["clear", "obstructed", "clear", "restricted"] },
  { code: "AC", name: "Accessible Platform", tier: "accessible", x: 50, y: 49, w: 24, h: 5, rot: 0, mix: ["clear"] },
];

const ROW_LABELS = ["A", "B", "C", "D", "E", "F"];
const SEATS_PER_ROW = 8;

// ---------------------------------------------------------------------------
// Event definitions
// ---------------------------------------------------------------------------
type EventSpec = {
  slug: string;
  title: string;
  competition: string;
  homeTeam: string;
  awayTeam: string;
  venueName: string;
  venueCity: string;
  capacity: number;
  daysFromNow: number;
  kickoffHourUtc: number;
  /** How many rows of each section to generate. */
  rowCount: number;
  sectionCodes: string[];
};

const EVENT_SPECS: EventSpec[] = [
  {
    slug: "super-eagles-vs-black-stars-uyo",
    title: "Super Eagles vs Black Stars",
    competition: "International Friendly",
    homeTeam: "Super Eagles",
    awayTeam: "Black Stars",
    venueName: "Godswill Akpabio International Stadium",
    venueCity: "Uyo",
    capacity: 30_000,
    daysFromNow: 9,
    kickoffHourUtc: 16,
    rowCount: 6,
    sectionCodes: BOWL.map((section) => section.code),
  },
  {
    slug: "npl-lagos-derby",
    title: "Lagos Derby",
    competition: "NPFL",
    homeTeam: "Enyimba FC",
    awayTeam: "Rangers International",
    venueName: "Mobolaji Johnson Arena",
    venueCity: "Lagos",
    capacity: 8_000,
    daysFromNow: 4,
    kickoffHourUtc: 15,
    rowCount: 3,
    // A shorter bowl, so the two events do not look copy-pasted.
    sectionCodes: ["N1", "W1", "E1", "S1"],
  },
];

function kickoffDate(daysFromNow: number, hourUtc: number) {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromNow);
  date.setUTCHours(hourUtc, 0, 0, 0);
  return date;
}

// ---------------------------------------------------------------------------
// Seeding
// ---------------------------------------------------------------------------
async function seedEvent(db: ReturnType<typeof getDb>, spec: EventSpec) {
  await db.delete(events).where(eq(events.slug, spec.slug));

  const specs = BOWL.filter((section) => spec.sectionCodes.includes(section.code));
  const startsAt = kickoffDate(spec.daysFromNow, spec.kickoffHourUtc);

  const [event] = await db
    .insert(events)
    .values({
      slug: spec.slug,
      title: spec.title,
      competition: spec.competition,
      homeTeam: spec.homeTeam,
      awayTeam: spec.awayTeam,
      venueName: spec.venueName,
      venueCity: spec.venueCity,
      venueCountry: "NG",
      startsAt,
      salesOpenAt: new Date(Date.now() - 86_400_000),
      salesCloseAt: startsAt,
      status: "on_sale",
      currency: "NGN",
      capacity: spec.capacity,
    })
    .returning({ id: events.id });

  if (!event) throw new Error(`Failed to insert event ${spec.slug}`);

  const insertedSections = await db
    .insert(sections)
    .values(
      specs.map((section) => ({
        eventId: event.id,
        code: section.code,
        name: section.name,
        tier: section.tier,
        capacity: spec.rowCount * SEATS_PER_ROW,
        mapX: section.x,
        mapY: section.y,
        mapWidth: section.w,
        mapHeight: section.h,
        mapRotation: section.rot,
      })),
    )
    .returning({ id: sections.id, code: sections.code });

  // Explicit tuple annotation: `new Map` needs `[K, V]`, and a bare array
  // literal inside .map() widens to (string | string)[] without it.
  const sectionIdByCode = new Map(
    insertedSections.map((row): [string, string] => [row.code, row.id]),
  );

  const seatRows: NewSeat[] = [];

  for (const section of specs) {
    const sectionId = sectionIdByCode.get(section.code);
    if (!sectionId) continue;

    const faceValue = BASE_PRICE_KOBO[section.tier];
    let index = 0;

    for (const rowLabel of ROW_LABELS.slice(0, spec.rowCount)) {
      for (let seatNumber = 1; seatNumber <= SEATS_PER_ROW; seatNumber += 1) {
        const quality = section.mix[index % section.mix.length] ?? "clear";

        // Resale reality: most seats trade near face value, some are bargains,
        // a few sellers ask well above it. ~0.62 .. 1.38 of face.
        const factor = 0.62 + random() * 0.76;
        // View quality is priced: blocked seats are meaningfully cheaper.
        const qualityFactor = quality === "obstructed" ? 0.55 : quality === "restricted" ? 0.78 : 1;

        seatRows.push({
          eventId: event.id,
          sectionId,
          rowLabel,
          seatNumber: String(seatNumber),
          category: section.tier,
          viewQuality: quality,
          viewNote: VIEW_NOTES[quality] ?? null,
          isAisle: seatNumber === 1 || seatNumber === SEATS_PER_ROW,
          isListed: true,
          priceCents: roundTo(faceValue * factor * qualityFactor),
          originalPriceCents: faceValue,
          status: "available",
        });

        index += 1;
      }
    }
  }

  // Postgres caps a statement at 65,535 parameters; 480 rows is well inside it.
  for (let offset = 0; offset < seatRows.length; offset += 500) {
    await db.insert(seats).values(seatRows.slice(offset, offset + 500));
  }

  return {
    slug: spec.slug,
    sections: insertedSections.length,
    seats: seatRows.length,
    cheapest: Math.min(...seatRows.map((seat) => seat.priceCents ?? 0)),
  };
}

async function main() {
  loadEnvFiles();

  const db = getDb();
  const results = [];

  for (const spec of EVENT_SPECS) {
    results.push(await seedEvent(db, spec));
  }

  console.log("\nSeeded demo data:\n");
  for (const result of results) {
    console.log(
      `  ${result.slug}\n    ${result.sections} sections · ${result.seats} seat listings · from ${formatMoney(
        result.cheapest,
        "NGN",
        { compact: true },
      )}`,
    );
  }
  console.log("\nOpen http://localhost:3000/marketplace\n");

  await closeDb();
}

main().catch(async (error) => {
  console.error("\nSeeding failed:", error instanceof Error ? error.message : error);
  await closeDb().catch(() => undefined);
  process.exitCode = 1;
});
