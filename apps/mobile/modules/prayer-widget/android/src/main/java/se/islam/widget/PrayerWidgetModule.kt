package se.islam.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONArray
import org.json.JSONObject

private fun provider(context: Context) =
  ComponentName(context.packageName, "${context.packageName}.PrayerTimesWidgetProvider")

// The generated provider and the app run in the same process. Persist receipts
// synchronously before returning control to a launcher that can suspend us.
object PlacementReceipts {
  private fun prefs(c: Context) = c.getSharedPreferences("prayer-widget-placement", Context.MODE_PRIVATE)
  private fun ids(c: Context) = AppWidgetManager.getInstance(c).getAppWidgetIds(provider(c)).map { it.toString() }.toSet()

  @Synchronized
  fun observe(c: Context, pinId: Int? = null) {
    val p = prefs(c)
    val current = ids(c)
    val previous = p.getStringSet("ids", null)
    val verifiedPin = pinId != null && pinId.toString() in current &&
      AppWidgetManager.getInstance(c).getAppWidgetInfo(pinId)?.provider == provider(c)
    if (pinId != null && !verifiedPin) return
    if (previous == null || (previous == current && !verifiedPin)) return
    val sequence = p.getLong("seq", 0) + 1
    val queue = JSONArray(p.getString("receipts", "[]"))
    queue.put(JSONObject().put("seq", sequence).put("at", System.currentTimeMillis())
      .put("present", current.isNotEmpty()).put("added", verifiedPin || (current - previous).isNotEmpty())
      .put("pin", verifiedPin))
    p.edit().putStringSet("ids", current).putLong("seq", sequence).putString("receipts", queue.toString()).commit()
  }

  @Synchronized
  fun snapshot(c: Context): Map<String, Any> {
    val p = prefs(c)
    val current = ids(c)
    if (!p.contains("ids")) p.edit().putStringSet("ids", current).commit()
    val queue = JSONArray(p.getString("receipts", "[]"))
    val rows = (0 until queue.length()).map {
      val r = queue.getJSONObject(it)
      mapOf("seq" to r.getLong("seq"), "at" to r.getLong("at"), "present" to r.getBoolean("present"),
        "added" to r.getBoolean("added"), "pin" to r.getBoolean("pin"))
    }
    return mapOf("present" to current.isNotEmpty(), "receipts" to rows)
  }

  @Synchronized
  fun acknowledge(c: Context, through: Long) {
    val p = prefs(c)
    val queue = JSONArray(p.getString("receipts", "[]"))
    val keep = JSONArray()
    for (i in 0 until queue.length()) {
      val r = queue.getJSONObject(i)
      if (r.getLong("seq") > through) keep.put(r)
    }
    p.edit().putString("receipts", keep.toString()).commit()
  }
}

class PinResultReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val id = intent.getIntExtra(AppWidgetManager.EXTRA_APPWIDGET_ID, AppWidgetManager.INVALID_APPWIDGET_ID)
    if (id != AppWidgetManager.INVALID_APPWIDGET_ID) PlacementReceipts.observe(context, id)
  }
}

class PrayerWidgetModule : Module() {
  private val context: Context get() = requireNotNull(appContext.reactContext)
  override fun definition() = ModuleDefinition {
    Name("PrayerWidgetPlacement")
    AsyncFunction("snapshot") { PlacementReceipts.snapshot(context) }
    AsyncFunction("acknowledge") { seq: Double -> PlacementReceipts.acknowledge(context, seq.toLong()) }
    AsyncFunction("supportsPin") { AppWidgetManager.getInstance(context).isRequestPinAppWidgetSupported }
    AsyncFunction("requestPin") {
      val c = context
      val manager = AppWidgetManager.getInstance(c)
      if (!manager.isRequestPinAppWidgetSupported) return@AsyncFunction "unsupported"
      PlacementReceipts.snapshot(c)
      // The launcher supplies the new ID as a fill-in extra. Restrict the mutable
      // token to our explicit private receiver and consume it only once.
      val flags = PendingIntent.FLAG_ONE_SHOT or PendingIntent.FLAG_CANCEL_CURRENT or
        (if (Build.VERSION.SDK_INT >= 31) PendingIntent.FLAG_MUTABLE else 0)
      val callback = PendingIntent.getBroadcast(c, 0, Intent(c, PinResultReceiver::class.java), flags)
      if (manager.requestPinAppWidget(provider(c), null, callback)) "accepted" else "failed"
    }
  }
}
