import { storage } from '../storage';
import { ANALYTICS_EVENTS } from './events';
import { enqueueSetupEvent } from './index';

export const FIRST_OPEN_KEY = 'analytics:firstOpen:v1';

export interface PendingFirstOpen {
  id: string;
  at: number;
  development: boolean;
}

interface SavedAssignment {
  install_kind?: unknown;
  pendingFirstOpen?: unknown;
  setupStartedAt?: unknown;
  development?: unknown;
}

export function pendingFirstOpen(saved: SavedAssignment | null): PendingFirstOpen | undefined {
  if (saved?.install_kind === 'new' && typeof saved.pendingFirstOpen === 'string' &&
      typeof saved.setupStartedAt === 'number' && Number.isFinite(saved.setupStartedAt)) {
    return { id: saved.pendingFirstOpen, at: saved.setupStartedAt, development: saved.development === true };
  }
  return undefined;
}

let assigned = false;
const observers = new Set<() => void>();

export function publishSetupAssignment(value: boolean) {
  assigned = value;
  if (assigned) for (const observe of observers) observe();
}

export function onSetupAssignment(observe: () => void) {
  observers.add(observe);
  if (assigned) observe();
  return () => { observers.delete(observe); };
}

let upload: Promise<void> | undefined;
async function send(saved?: PendingFirstOpen) {
  const pending = saved ?? pendingFirstOpen(JSON.parse(await storage.getItem(FIRST_OPEN_KEY) ?? 'null'));
  if (!pending) return;
  const accepted = await enqueueSetupEvent([ANALYTICS_EVENTS.FIRST_OPEN, {
    install_kind: 'new', flow_version: 'map_1', development: pending.development,
  }], pending.id, pending.at);
  if (accepted) await storage.setItem(FIRST_OPEN_KEY, JSON.stringify({ install_kind: 'new', setupStartedAt: pending.at }));
}

// The SDK lifecycle and the durable setup queue can both witness restored connectivity.
export function retryFirstOpen(pending?: PendingFirstOpen) {
  upload ??= send(pending).catch(() => undefined).finally(() => { upload = undefined; });
  return upload;
}

// An older request can still report an offline failure after a setup row was
// accepted. Recheck the durable marker once that attempt has settled.
export function retryFirstOpenAfterSetupUpload() {
  void (upload ?? Promise.resolve()).then(() => retryFirstOpen());
}
