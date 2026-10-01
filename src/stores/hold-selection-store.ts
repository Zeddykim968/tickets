import { create } from "zustand";
import { MAX_SEATS_PER_HOLD } from "@/features/holds/constants";
import type { ListingSort, SectionCategory, ViewQuality } from "@/features/events/types";

/** View-quality filter applied to the ticket feed. */
export type ViewFilter = "all" | "clear_plus" | "premium" | "only_restricted";

/**
 * The minimum a seat needs to carry to be shown in the sticky hold bar and to
 * compute a *display* total. The authoritative total is always recomputed on
 * the server from the database, so a tampered payload here cannot change what
 * is charged - this is purely optimistic UI.
 */
export type SelectedSeat = {
  id: string;
  sectionId: string;
  priceCents: number;
  originalPriceCents: number | null;
  sectionCode: string;
  sectionName: string;
  rowLabel: string;
  seatNumber: string;
  category: SectionCategory;
  viewQuality: ViewQuality;
};

export type ToggleOutcome = "added" | "removed" | "limit_reached";

type HoldSelectionState = {
  /** Guard so switching events can never leak a stale cross-event selection. */
  eventId: string | null;
  /** Which section the buyer is currently drilling into. */
  activeSectionId: string | null;
  selectedSeats: SelectedSeat[];
  /** Set once the server has granted the hold. */
  holdId: string | null;
  /** Epoch millis, mirrored from Redis. */
  expiresAt: number | null;
  isSubmitting: boolean;
  errorMessage: string | null;

  // --- Feed view preferences. These survive a section switch on purpose. ---
  sort: ListingSort;
  viewFilter: ViewFilter;
  hideSold: boolean;
  setSort: (sort: ListingSort) => void;
  setViewFilter: (filter: ViewFilter) => void;
  toggleHideSold: () => void;

  setEvent: (eventId: string) => void;
  activateSection: (sectionId: string | null) => void;
  toggleSeat: (seat: SelectedSeat) => ToggleOutcome;
  /** Used to silently drop seats a failed hold reported as taken. */
  removeSeats: (seatIds: string[]) => void;
  clearSelection: () => void;
  setSubmitting: (submitting: boolean) => void;
  setError: (message: string | null) => void;
  beginHold: (holdId: string, expiresAtIso: string) => void;
  reset: () => void;
};

export const useHoldStore = create<HoldSelectionState>((set, get) => ({
  eventId: null,
  activeSectionId: null,
  selectedSeats: [],
  holdId: null,
  expiresAt: null,
  isSubmitting: false,
  errorMessage: null,

  sort: "price_asc",
  viewFilter: "all",
  hideSold: false,

  setSort: (sort) => set({ sort }),
  setViewFilter: (viewFilter) => set({ viewFilter }),
  toggleHideSold: () => set((state) => ({ hideSold: !state.hideSold })),

  setEvent: (eventId) => {
    if (get().eventId === eventId) return;
    // Different fixture: never carry a selection across events.
    set({
      eventId,
      activeSectionId: null,
      selectedSeats: [],
      holdId: null,
      expiresAt: null,
      errorMessage: null,
    });
  },

  activateSection: (sectionId) =>
    set((state) => ({
      activeSectionId: state.activeSectionId === sectionId ? null : sectionId,
    })),

  toggleSeat: (seat) => {
    const { selectedSeats } = get();
    const existing = selectedSeats.some((s) => s.id === seat.id);

    if (existing) {
      set({
        selectedSeats: selectedSeats.filter((s) => s.id !== seat.id),
        errorMessage: null,
      });
      return "removed";
    }

    if (selectedSeats.length >= MAX_SEATS_PER_HOLD) {
      set({ errorMessage: `You can hold up to ${MAX_SEATS_PER_HOLD} seats at a time.` });
      return "limit_reached";
    }

    // Keep a stable order so the bar does not jump around as seats are added.
    set({
      selectedSeats: [...selectedSeats, seat].sort(
        (a, b) =>
          a.sectionCode.localeCompare(b.sectionCode) ||
          a.rowLabel.localeCompare(b.rowLabel) ||
          a.seatNumber.localeCompare(b.seatNumber, undefined, { numeric: true }),
      ),
      errorMessage: null,
    });
    return "added";
  },

  removeSeats: (seatIds) => {
    const doomed = new Set(seatIds);
    set((state) => ({ selectedSeats: state.selectedSeats.filter((seat) => !doomed.has(seat.id)) }));
  },

  clearSelection: () => set({ selectedSeats: [], errorMessage: null }),

  setSubmitting: (isSubmitting) => set({ isSubmitting }),

  setError: (errorMessage) => set({ errorMessage }),

  beginHold: (holdId, expiresAtIso) =>
    set({ holdId, expiresAt: new Date(expiresAtIso).getTime(), isSubmitting: false }),

  reset: () =>
    set({
      eventId: null,
      activeSectionId: null,
      selectedSeats: [],
      holdId: null,
      expiresAt: null,
      isSubmitting: false,
      errorMessage: null,
    }),
}));

// --- Selectors -------------------------------------------------------------
// Zustand re-renders on identity change, so components subscribe to the
// narrowest slice they need rather than the whole store object.
// `selectedSeats` is a stable array reference (only ever replaced on mutation),
// which is what makes this selector safe to use without a shallow equality fn.

export const selectSelectedSeats = (state: HoldSelectionState) => state.selectedSeats;
