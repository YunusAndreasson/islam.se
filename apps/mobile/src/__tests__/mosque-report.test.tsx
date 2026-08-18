import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { router, useLocalSearchParams } from 'expo-router';

import MoskeRattelse from '@/app/moske-rattelse';
import { MosqueCard } from '@/components/map/MosqueCard';
import { mosqueById } from '@/lib/mosques';
import { REPORT_ENDPOINT } from '@/lib/mosques/report';
import { jsonBodyOf } from '@/test-utils/fetch-body';

// A real record from the vendored dataset — using a fixture would let the test pass while
// the screen mis-reads the actual shape (it resolves the mosque through mosqueById).
const MOSQUE_ID = 'alsalam-moske-karlshamn';
const MOSQUE = mosqueById(MOSQUE_ID)!;

const params = jest.mocked(useLocalSearchParams);

function respond(status: number, body: unknown) {
  const fn = jest.fn(async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  }));
  (globalThis as { fetch: unknown }).fetch = fn;
  return fn;
}

/** Fill in a valid "wrong address" report. Returns the text the form should send. */
async function fillValidReport(text = 'Rätt adress är Storgatan 9'): Promise<string> {
  await act(async () => {
    fireEvent.press(screen.getByRole('radio', { name: 'Adressen stämmer inte' }));
  });
  await act(async () => {
    fireEvent.changeText(screen.getByLabelText('Vad är rätt adress?'), text);
  });
  return text;
}

describe('mosque correction form', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    params.mockReturnValue({ id: MOSQUE_ID });
    respond(200, { ok: true, id: 7 });
  });

  it('names the mosque being corrected so the subject is never in doubt', async () => {
    render(<MoskeRattelse />);
    expect(screen.getByText(MOSQUE.name)).toBeTruthy();
    expect(screen.getByText('Rapportera fel')).toBeTruthy();
  });

  // A stale deep link or a mosque dropped between OTA updates must dead-end quietly.
  // Rendering `undefined.name` would take out the whole modal with a red screen.
  it('shows a quiet message instead of crashing on an unknown mosque', async () => {
    params.mockReturnValue({ id: 'no-such-mosque' });
    render(<MoskeRattelse />);
    expect(screen.getByText('Moskén kunde inte hittas.')).toBeTruthy();
  });

  // THE POINT OF THE REASON ENUM: the free-text prompt is derived from it. A generic
  // "describe the problem" produces reports that say the address is wrong without ever
  // containing an address — unapplicable, and we cannot go back and ask.
  it('asks a question that matches the chosen reason', async () => {
    render(<MoskeRattelse />);

    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Adressen stämmer inte' }));
    });
    expect(screen.getByLabelText('Vad är rätt adress?')).toBeTruthy();

    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Namnet stämmer inte' }));
    });
    expect(screen.getByLabelText('Vad är rätt namn?')).toBeTruthy();
  });

  it('keeps Skicka disabled until the report can actually be acted on', async () => {
    render(<MoskeRattelse />);
    const submit = () => screen.getByRole('button', { name: 'Skicka rättelse' });

    // No reason picked yet — there is nothing to report.
    expect(submit().props.accessibilityState.disabled).toBe(true);

    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Adressen stämmer inte' }));
    });
    // Reason picked, but "the address is wrong" without the right address is unfixable.
    expect(submit().props.accessibilityState.disabled).toBe(true);

    await act(async () => {
      fireEvent.changeText(screen.getByLabelText('Vad är rätt adress?'), 'Storgatan 9');
    });
    expect(submit().props.accessibilityState.disabled).toBe(false);
  });

  // "Moskén har stängt" is complete on its own: the radio row IS the report. Demanding a
  // sentence there would be busywork with nothing to say.
  it('lets a closure be reported without any text', async () => {
    render(<MoskeRattelse />);
    await act(async () => {
      fireEvent.press(screen.getByRole('radio', { name: 'Moskén har stängt' }));
    });
    expect(
      screen.getByRole('button', { name: 'Skicka rättelse' }).props.accessibilityState.disabled,
    ).toBe(false);
  });

  it('posts the report and confirms it in the app', async () => {
    const fetchMock = respond(200, { ok: true, id: 7 });
    render(<MoskeRattelse />);
    const text = await fillValidReport();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Skicka rättelse' }));
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(REPORT_ENDPOINT);
    const sent = JSON.parse(jsonBodyOf(init));
    expect(sent.mosque_id).toBe(MOSQUE_ID);
    expect(sent.reason).toBe('adress');
    expect(sent.description).toBe(text);

    // The user gets an answer inside the app — the whole reason this is a POST and not a
    // hand-off to the mail client.
    await waitFor(() => expect(screen.getByText('Tack')).toBeTruthy());
    expect(screen.queryByRole('button', { name: 'Skicka rättelse' })).toBeNull();
  });

  // THE PROMISE THIS GUARDS: Om appen says "Din plats lämnar aldrig enheten." MosqueCard
  // holds userCoords for its distance readout and hands the mosque to this screen, so
  // leaking a coordinate into the payload would be an easy accident to make and a hard
  // one to notice.
  it('sends no user location with the report', async () => {
    const fetchMock = respond(200, { ok: true, id: 7 });
    render(<MoskeRattelse />);
    await fillValidReport();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Skicka rättelse' }));
    });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    // Through jsonBodyOf, not String(): this is the assertion that the report carries no
    // location or user identifier, and `String()` of a non-string body is the constant
    // "[object Object]" — which satisfies `.not.toMatch(...)` no matter what was actually
    // sent. A privacy check that cannot fail is worse than none.
    expect(jsonBodyOf(init)).not.toMatch(/latitude|longitude|user_/);
  });

  // A failed submission must never eat what the user wrote: they would have to retype the
  // correction, and most people simply won't.
  it('keeps the typed report intact when the server rejects it', async () => {
    respond(429, { ok: false, error: 'rate_limited' });
    render(<MoskeRattelse />);
    const text = await fillValidReport();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Skicka rättelse' }));
    });

    await waitFor(() => expect(screen.getByText(/senaste timmen/)).toBeTruthy());
    // Still the form, still filled in, and the button is pressable again.
    expect(screen.getByLabelText('Vad är rätt adress?').props.value).toBe(text);
    expect(
      screen.getByRole('button', { name: 'Skicka rättelse' }).props.accessibilityState.disabled,
    ).toBe(false);
  });

  it('reports a dead network as something the user can retry', async () => {
    (globalThis as { fetch: unknown }).fetch = jest.fn(async () => {
      throw new TypeError('Network request failed');
    });
    render(<MoskeRattelse />);
    await fillValidReport();

    await act(async () => {
      fireEvent.press(screen.getByRole('button', { name: 'Skicka rättelse' }));
    });

    await waitFor(() => expect(screen.getByText(/Ingen anslutning/)).toBeTruthy());
  });

  // The one screen in the app that sends anything says what it sends. The user should not
  // have to take the privacy claim on trust when the list can just be printed.
  it('spells out what leaves the device, including what does not', async () => {
    render(<MoskeRattelse />);
    expect(screen.getByText('Det här skickas')).toBeTruthy();
    expect(screen.getByText(/Din plats skickas inte/)).toBeTruthy();
  });
});

describe('MosqueCard report link', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('opens the correction form for the mosque that is showing', async () => {
    render(
      <MosqueCard
        mosque={MOSQUE}
        userCoords={{ latitude: 59.33, longitude: 18.06 }}
        bottom={0}
        onClose={() => {}}
      />,
    );

    fireEvent.press(screen.getByLabelText(`Rapportera fel om ${MOSQUE.name}`));

    // The id is what the form resolves the record from — routing without it lands on the
    // "kunde inte hittas" dead end.
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/moske-rattelse',
      params: { id: MOSQUE_ID },
    });
  });

  // Directions stays the card's one emphasised action; the report must not grow into a
  // second button competing with it.
  it('keeps Vägbeskrivning as the card’s primary action', () => {
    render(
      <MosqueCard
        mosque={MOSQUE}
        userCoords={{ latitude: 59.33, longitude: 18.06 }}
        bottom={0}
        onClose={() => {}}
      />,
    );
    expect(screen.getByLabelText(`Vägbeskrivning till ${MOSQUE.name}`)).toBeTruthy();
  });
});
