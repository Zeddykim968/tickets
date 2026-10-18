/**
 * Every key the hold engine touches, in one place.
 *
 * ## Cluster safety
 * Redis Cluster splits the keyspace into 16,384 slots. A Lua script may only
 * touch keys that live in the *same* slot, otherwise the script is rejected
 * with CROSSSLOT. We get that for free by wrapping the event id in a hash tag
 * (`{ev:ab12cd34}`): Redis hashes the tag, so the hold manifest and every seat
 * lock for one event always land in the same slot.
 *
 * The `hold:idx:*` key is deliberately *outside* the tag because it is only
 * ever read/written with single-key commands, which are always cluster-safe.
 */

/**
 * The `{...}` hash tag that pins all of an event's hold keys to one slot.
 *
 * Module-private: callers should always go through `holdManifestKey` /
 * `seatLockKey` so the tagging scheme can change in one place.
 */
function eventSlotTag(eventId: string) {
  return `{ev:${eventId.replace(/-/g, "").slice(0, 8)}}`;
}

/** hash: holdId -> eventId. Lets `/checkout/[holdId]` resolve its own event. */
export function holdIndexKey(holdId: string) {
  return `hold:idx:${holdId}`;
}

/** string(JSON manifest) for one hold. Expires with the seat locks. */
export function holdManifestKey(eventId: string, holdId: string) {
  return `hold:${eventSlotTag(eventId)}:${holdId}`;
}

/** string(holdId) claiming one seat. The TTL *is* the hold deadline. */
export function seatLockKey(eventId: string, seatId: string) {
  return `lock:seat:${eventSlotTag(eventId)}:${seatId}`;
}

/** Extract the seat id back out of a seat lock key returned by Lua. */
export function seatIdFromLockKey(lockKey: string) {
  return lockKey.slice(lockKey.lastIndexOf(":") + 1);
}
