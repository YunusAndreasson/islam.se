// The app's entry point. The OS can start this bundle without mounting a screen.
//
// ⚠️ A BACKGROUND TASK HAS TO BE DEFINED BEFORE ANYTHING RENDERS, AND expo-router ROUTES
// ARE NOT. `expo-router/entry` registers the root component; it does not render it, and the
// route modules under src/app are required by `require.context` only when that component
// renders the route tree. So a task defined in app/_layout.tsx exists only in a session that
// has drawn a screen.
//
// That is precisely the session a background wake-up is NOT. When Android's WorkManager (or
// iOS's BGTaskScheduler) starts the JS runtime headlessly to run the prayer-notification
// refresh, nothing renders, _layout.tsx is never required, `TaskManager.defineTask` never
// runs, and the OS finds no task under that name — expo-task-manager logs "Task ... has been
// executed but looks like it is not defined" and gives up.
//
// The failure is invisible from inside the app: registration still succeeds, the task still
// appears registered, and the only symptom is that the rolling notification window silently
// stops advancing for readers who don't open the app — which is the exact failure
// lib/notification-refresh exists to prevent. Importing it here, at the true entry, is what
// guarantees the definition is evaluated in every session the OS can start.
//
// Relative rather than `@/`: this file is resolved before anything else in the app, and the
// entry point is the one place not worth making depend on path-alias resolution.
//
// Crash reporting is initialised first, above even the task definition, for the same
// reason: a headless background wake-up renders nothing, so a Sentry.init placed in the
// layout would leave exactly the runs nobody watches unreported.
import './src/lib/sentry';

import './src/lib/notification-refresh';
import './src/lib/notification-handlers';
// Publish this bundle's platform layouts before native renders a widget or notification.
// Scheduling alerts and computing timelines still wait for a refresh.
import './src/widget/register-layouts';

import 'expo-router/entry';
