import assert from "node:assert/strict";
import test from "node:test";
import {
  isTrustedTicketmasterUrl,
  mapAvailabilityStatus,
  normalizeDiscoveryEvent,
} from "./normalize";

test("normalizes a sports event without inventing team roles or seat availability", () => {
  const event = normalizeDiscoveryEvent({
    id: "event-1",
    name: "Home vs Away",
    url: "https://www.ticketmaster.com/event-1",
    dates: {
      start: { dateTime: "2026-06-01T12:00:00Z", localDate: "2026-06-01", localTime: "13:00:00" },
      status: { code: "onsale" },
    },
    sales: { public: { startDateTime: "2026-01-01T00:00:00Z" } },
    priceRanges: [{ min: 20, max: 80, currency: "GBP" }],
    classifications: [{ segment: { name: "Sports" }, genre: { name: "Football" }, subGenre: { name: "League" } }],
    _embedded: {
      venues: [{ id: "venue-1", name: "Stadium", city: { name: "London" }, location: { latitude: "51.5" } }],
      attractions: [{ id: "team-1", name: "Team A" }, { id: "team-2", name: "Team B" }],
    },
  });

  assert.equal(event.id, "event-1");
  assert.equal(event.sport, "Football");
  assert.equal(event.league, "League");
  assert.deepEqual(event.teams.map((team) => team.role), [null, null]);
  assert.equal(event.min, 20);
  assert.equal(event.max, 80);
  assert.equal(mapAvailabilityStatus(event.saleStatus, event.onsaleStart, event.onsaleEnd), "unknown");
});

test("keeps all Discovery availability unknown because it is not seat inventory", () => {
  assert.equal(mapAvailabilityStatus("onsale", new Date(0), null), "unknown");
  assert.equal(mapAvailabilityStatus("offsale", null, null), "unknown");
  assert.equal(mapAvailabilityStatus("cancelled", null, null), "unknown");
});

test("accepts official Ticketmaster links and rejects lookalike or unsafe URLs", () => {
  assert.equal(isTrustedTicketmasterUrl("https://www.ticketmaster.com/event/123"), true);
  assert.equal(isTrustedTicketmasterUrl("https://www.ticketmaster.co.uk/event/123"), true);
  assert.equal(isTrustedTicketmasterUrl("https://ticketmaster.evil.com/event/123"), false);
  assert.equal(isTrustedTicketmasterUrl("http://ticketmaster.com/event/123"), false);
  assert.equal(isTrustedTicketmasterUrl("https://ticketmaster.com:8443/event/123"), false);
});
