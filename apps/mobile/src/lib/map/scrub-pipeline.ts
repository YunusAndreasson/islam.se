// How the scrubber hands the finger's position to the JS thread: latest value wins.
//
// The thumb follows the finger on the UI thread at frame rate; the map's prayer lines can
// only follow at the rate JS rebuilds them. Every scrub step used to be its own
// scheduleOnRN, and scheduleOnRN does not coalesce, so under a busy JS thread the steps
// queued up: the lines worked through a backlog of positions the finger had already left
// and kept moving after it stopped.
//
// Now at most one position is in flight. While JS has one, newer positions overwrite a
// single held slot; when JS takes the value it acknowledges, and the newest held position
// (if any) goes next. The final position of a drag is offered like any other, so it can
// be held but never dropped. Everything here runs on the UI thread, inside the gesture's
// worklets and the acknowledgement worklet, so the state needs no locking.

export interface ScrubMailbox {
  /** A position has gone to JS and JS has not yet acknowledged it. */
  inFlight: boolean;
  /** The newest position offered while one was in flight; null when there is none. */
  held: number | null;
  /** The last position sent to JS; null before the first. */
  sent: number | null;
}

export const EMPTY_SCRUB_MAILBOX: ScrubMailbox = { inFlight: false, held: null, sent: null };

/** What a transition leaves behind, and the position to send to JS now (null for none). */
export interface ScrubStep {
  mailbox: ScrubMailbox;
  send: number | null;
}

/** The finger has a new track position. */
export function offerScrub(mailbox: ScrubMailbox, position: number): ScrubStep {
  'worklet';
  if (mailbox.inFlight) {
    return { mailbox: { inFlight: true, held: position, sent: mailbox.sent }, send: null };
  }
  // Nothing new to say: the clock already has exactly this position.
  if (mailbox.sent === position) return { mailbox, send: null };
  return { mailbox: { inFlight: true, held: null, sent: position }, send: position };
}

/** JS has taken the position in flight. Sends the newest held one, unless it is already there. */
export function ackScrub(mailbox: ScrubMailbox): ScrubStep {
  'worklet';
  const held = mailbox.held;
  if (held === null || held === mailbox.sent) {
    return { mailbox: { inFlight: false, held: null, sent: mailbox.sent }, send: null };
  }
  return { mailbox: { inFlight: true, held: null, sent: held }, send: held };
}

/** A new drag takes hold. What the last drag sent says nothing about the clock any more —
 *  a live tick or a tapped row may have moved it since — so the first position of this drag
 *  is always sent, even if it equals the last drag's final one (both ends of the track clamp
 *  to 0 and 1, so landing on the same value is the ordinary case, not a coincidence). A
 *  position still in flight stays in flight; its ack must still find the mailbox busy. */
export function beginScrub(mailbox: ScrubMailbox): ScrubMailbox {
  'worklet';
  return { inFlight: mailbox.inFlight, held: null, sent: null };
}
