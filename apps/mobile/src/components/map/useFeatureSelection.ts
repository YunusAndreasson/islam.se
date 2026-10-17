import type { GeoJSONSourceRef } from '@maplibre/maplibre-react-native';
import { useEffect, useRef } from 'react';

/** Keep selection in native paint state instead of rebuilding a layer's filter.
 * Style replacement discards native feature state; styleRevision reapplies it.
 * Serialize writes so a slow selection cannot light up after its card was closed.
 */
export function useFeatureSelection(selectedId: string | null | undefined, styleRevision: number) {
  const sourceRef = useRef<GeoJSONSourceRef>(null);
  const appliedId = useRef<string | null>(null);
  const pending = useRef<Promise<void>>(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    pending.current = pending.current.then(async () => {
      const source = sourceRef.current;
      if (cancelled || !source) return;
      if (appliedId.current !== null) {
        await source.removeFeatureState({ id: appliedId.current }, 'selected');
        appliedId.current = null;
      }
      if (cancelled || selectedId == null) return;
      await source.setFeatureState({ id: selectedId }, { selected: true });
      appliedId.current = selectedId;
    }).catch((error: unknown) => {
      // A native source can disappear during a style swap or screen teardown.
      // Consume the rejection so subsequent selections/style-ready events can retry.
      if (!cancelled) console.warn('[karta] Kunde inte uppdatera platsmarkeringen', error);
    });
    return () => { cancelled = true; };
  }, [selectedId, styleRevision]);

  return sourceRef;
}
