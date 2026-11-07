import { describe, expect, it } from '@jest/globals';
import * as fc from 'fast-check';

import { ackScrub, beginScrub, EMPTY_SCRUB_MAILBOX, offerScrub, type ScrubMailbox } from './scrub-pipeline';

/** Drives the mailbox the way the scrubber does: offers from the finger, acks from JS. */
function run(events: ({ offer: number } | 'ack')[]): { sent: number[]; mailbox: ScrubMailbox } {
  let mailbox = EMPTY_SCRUB_MAILBOX;
  const sent: number[] = [];
  for (const event of events) {
    const step = event === 'ack' ? ackScrub(mailbox) : offerScrub(mailbox, event.offer);
    mailbox = step.mailbox;
    if (step.send !== null) sent.push(step.send);
  }
  return { sent, mailbox };
}

describe('scrub mailbox', () => {
  it('sends the first position at once', () => {
    expect(run([{ offer: 0.3 }]).sent).toEqual([0.3]);
  });

  it('holds only the newest position while JS is busy, and sends it on the ack', () => {
    // The backlog bug: four steps queued behind a slow rebuild used to be replayed one by
    // one after the finger had moved on. Only the last one is worth drawing.
    const { sent } = run([{ offer: 0.1 }, { offer: 0.2 }, { offer: 0.3 }, { offer: 0.4 }, 'ack']);
    expect(sent).toEqual([0.1, 0.4]);
  });

  it('does not resend the position the clock already has', () => {
    // onFinalize used to send the drag's last position a second time.
    expect(run([{ offer: 0.5 }, 'ack', { offer: 0.5 }]).sent).toEqual([0.5]);
    expect(run([{ offer: 0.5 }, { offer: 0.5 }, 'ack']).sent).toEqual([0.5]);
  });

  it('goes idle when an ack finds nothing held', () => {
    const { mailbox } = run([{ offer: 0.5 }, 'ack']);
    expect(mailbox).toEqual({ inFlight: false, held: null, sent: 0.5 });
  });

  it('never loses the final position, never has two in flight, never sends stale ones', () => {
    // Any interleaving of finger offers and JS acks (acks only arrive for something sent).
    const events = fc.array(
      fc.oneof(fc.record({ offer: fc.double({ min: 0, max: 1, noNaN: true }) }), fc.constant('ack' as const)),
      { maxLength: 60 },
    );
    fc.assert(
      fc.property(events, (raw) => {
        let mailbox = EMPTY_SCRUB_MAILBOX;
        let inFlight = 0;
        let lastOffered: number | null = null;
        for (const event of raw) {
          if (event === 'ack') {
            if (!mailbox.inFlight) continue;
            inFlight -= 1;
            const step = ackScrub(mailbox);
            mailbox = step.mailbox;
            if (step.send !== null) {
              inFlight += 1;
              // What goes out after an ack is always the newest thing the finger offered.
              expect(step.send).toBe(lastOffered);
            }
          } else {
            lastOffered = event.offer;
            const step = offerScrub(mailbox, event.offer);
            mailbox = step.mailbox;
            if (step.send !== null) inFlight += 1;
          }
          expect(inFlight).toBeLessThanOrEqual(1);
        }
        // Drain: JS acknowledges everything still in flight.
        while (mailbox.inFlight) mailbox = ackScrub(mailbox).mailbox;
        // Whatever the finger last offered is what the clock ends up with.
        if (lastOffered !== null) expect(mailbox.sent).toBe(lastOffered);
      }),
    );
  });
});

describe('a new drag', () => {
  // THE BUG THIS PINS: drag to the end of the day, tap Nu, drag to the end again. The second
  // drag's position equalled the first one's last `sent`, so it was never sent, and the map
  // stayed on now while the thumb sat at midnight.
  it('always sends its first position, even one the last drag ended on', () => {
    let mailbox = offerScrub(EMPTY_SCRUB_MAILBOX, 1).mailbox;
    mailbox = ackScrub(mailbox).mailbox;
    expect(offerScrub(mailbox, 1).send).toBeNull(); // within one drag, a repeat is noise
    expect(offerScrub(beginScrub(mailbox), 1).send).toBe(1);
  });

  it('keeps a position still in flight in flight, so its ack is not mistaken for idle', () => {
    const busy = offerScrub(EMPTY_SCRUB_MAILBOX, 0.4).mailbox;
    const begun = beginScrub(busy);
    expect(begun.inFlight).toBe(true);
    // The new drag's first position waits for that ack, then goes.
    const held = offerScrub(begun, 0.7);
    expect(held.send).toBeNull();
    expect(ackScrub(held.mailbox).send).toBe(0.7);
  });
});
