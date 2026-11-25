import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

import type { AndroidWidgetSnapshot } from './android-snapshot';

export interface WidgetReceipt { seq: number; at: number; present: boolean; added: boolean; pin: boolean }
export interface WidgetSnapshot { present: boolean | null; receipts: WidgetReceipt[] }
export type PinResult = 'accepted' | 'unsupported' | 'failed';
interface PlacementModule {
  snapshot(): Promise<WidgetSnapshot>;
  supportsPin(): Promise<boolean>;
  requestPin(): Promise<PinResult>;
  acknowledge(seq: number): Promise<void>;
  addListener(event: 'onPinPlaced', listener: () => void): { remove(): void };
  saveSchedule(json: string): Promise<void>;
  refreshSchedule(): Promise<void>;
}
const native = requireOptionalNativeModule<PlacementModule>('PrayerWidgetPlacement');
export async function widgetSnapshot(): Promise<WidgetSnapshot> {
  return await native?.snapshot().catch(() => null) ?? { present: null, receipts: [] };
}
export async function supportsWidgetPin() {
  return Platform.OS === 'android' && await native?.supportsPin().catch(() => false) === true;
}
export async function requestWidgetPin(): Promise<PinResult> {
  if (!await supportsWidgetPin() || !native) return 'unsupported';
  return native.requestPin().catch(() => 'failed' as const);
}
export async function acknowledgeReceipts(seq: number) {
  if (Platform.OS === 'android') await native?.acknowledge(seq);
}

export function observeWidgetPin(listener: () => void) {
  return Platform.OS === 'android' ? native?.addListener('onPinPlaced', listener) : undefined;
}

export function androidPrayerWidget() {
  if (!native) throw new Error('Android prayer widget is unavailable');
  const widget = native;
  return {
    updateSnapshot: (snapshot: AndroidWidgetSnapshot) => widget.saveSchedule(JSON.stringify(snapshot)),
    reload: () => widget.refreshSchedule(),
  };
}
