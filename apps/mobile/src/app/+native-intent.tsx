import { router } from 'expo-router';

/** Widget taps mean "show prayer times", including when another sheet is open.
 * Consume warm links so Router doesn't push a second map over the current stack.
 * Cold starts go through the existing introduction/storage gate at `/`. */
export function redirectSystemPath({ path, initial }: { path: string; initial: boolean }): string | null {
  let url: URL;
  try {
    url = new URL(path);
  } catch {
    return path;
  }
  if (url.protocol !== 'islamse:' || url.host !== '' || url.pathname !== '/widget/prayer-times') {
    return path;
  }
  if (initial) return '/';
  try {
    router.dismissTo('/bonetider');
    return null;
  } catch {
    // If navigation isn't ready yet, let Router handle the intended destination.
    return '/bonetider';
  }
}
