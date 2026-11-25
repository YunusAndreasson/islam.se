package se.islam.widget

import android.app.AlarmManager
import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.ComponentCallbacks
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.util.Log
import org.json.JSONObject
import java.time.ZoneId

internal fun provider(context: Context) =
  ComponentName(context.packageName, "${context.packageName}.PrayerTimesWidgetProvider")

internal object PrayerWidgetUpdates {
  const val BOUNDARY = "se.islam.widget.PRAYER_BOUNDARY"
  private var observingConfiguration = false

  private fun store(context: Context) =
    context.getSharedPreferences("prayer-widget-schedule", Context.MODE_PRIVATE)

  @Synchronized
  fun save(context: Context, json: String) {
    check(store(context).edit().putString("snapshot", json).commit()) { "Widget schedule write failed" }
    refresh(context)
  }

  @Synchronized
  fun refresh(context: Context) {
    val manager = AppWidgetManager.getInstance(context)
    val ids = manager.getAppWidgetIds(provider(context))
    val alarms = context.getSystemService(AlarmManager::class.java)
    val boundary = PendingIntent.getBroadcast(context, 0, Intent(BOUNDARY).setComponent(provider(context)),
      PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
    if (ids.isEmpty()) {
      alarms.cancel(boundary)
      return
    }
    observeConfiguration(context.applicationContext)
    val now = System.currentTimeMillis()
    val json = store(context).getString("snapshot", null)
    val snapshot = json?.let { runCatching { JSONObject(it) }.getOrNull() }
    val currentZone = ZoneId.systemDefault()
    val storedZone = snapshot?.optString("timeZone")
    // Compare zone rules too. Android and Hermes can spell the same zone with different aliases.
    val sameZone = storedZone == currentZone.id ||
      runCatching { ZoneId.of(storedZone).rules == currentZone.rules }.getOrDefault(false)
    val end = snapshot?.optLong("validUntilMs") ?: 0
    var current: JSONObject? = null
    var nextBoundary = end
    val entries = snapshot?.optJSONArray("entries")
    val status = when {
      json != null && (snapshot == null || entries == null) -> "error"
      snapshot == null || entries == null || entries.length() == 0 -> "empty"
      !sameZone -> "zone"
      now >= end -> "expired"
      else -> {
        for (index in 0 until entries.length()) {
          val entry = entries.optJSONObject(index) ?: continue
          val from = entry.optLong("fromMs")
          if (from > now) {
            nextBoundary = minOf(from, end)
            break
          }
          current = entry.optJSONObject("payload")
        }
        if (current == null) "clock" else null
      }
    }

    // One pending alarm for every instance. Exact alarms are already authorized
    // by the app's prayer-reminder setup. Use a best-effort wakeup if unavailable.
    if (status != null || nextBoundary <= now) {
      alarms.cancel(boundary)
    } else {
      try {
        if (android.os.Build.VERSION.SDK_INT < 31 || alarms.canScheduleExactAlarms()) {
          alarms.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextBoundary, boundary)
        } else {
          alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextBoundary, boundary)
        }
      } catch (error: SecurityException) {
        Log.w("PrayerWidget", "Exact widget refresh unavailable", error)
        alarms.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, nextBoundary, boundary)
      }
    }

    ids.forEach { id ->
      manager.updateAppWidget(id, PrayerWidgetViews.render(context, manager.getAppWidgetOptions(id),
        current, snapshot?.optString("theme"), status, now))
    }
  }

  private fun observeConfiguration(app: Context) {
    if (observingConfiguration) return
    observingConfiguration = true
    app.registerComponentCallbacks(object : ComponentCallbacks {
      private var previous = Configuration(app.resources.configuration)
      override fun onConfigurationChanged(config: Configuration) {
        val changed = previous.uiMode != config.uiMode || previous.fontScale != config.fontScale ||
          previous.locales != config.locales || previous.layoutDirection != config.layoutDirection
        previous = Configuration(config)
        if (changed) refresh(app)
      }
      override fun onLowMemory() = Unit
    })
  }
}
