package se.islam.mobile

import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.Context
import android.content.Intent
import android.os.Bundle
import se.islam.widget.PlacementReceipts
import se.islam.widget.PrayerWidgetUpdates

// Preserve the component name used by already placed widgets and launcher pin receipts.
class PrayerTimesWidgetProvider : AppWidgetProvider() {
  override fun onReceive(context: Context, intent: Intent) {
    super.onReceive(context, intent)
    when (intent.action) {
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED,
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      PrayerWidgetUpdates.BOUNDARY -> PrayerWidgetUpdates.refresh(context)
    }
  }

  override fun onUpdate(context: Context, manager: AppWidgetManager, ids: IntArray) {
    PlacementReceipts.observe(context)
    PrayerWidgetUpdates.refresh(context)
  }

  override fun onAppWidgetOptionsChanged(context: Context, manager: AppWidgetManager, id: Int, options: Bundle) {
    PrayerWidgetUpdates.refresh(context)
  }

  override fun onDeleted(context: Context, ids: IntArray) {
    PlacementReceipts.observe(context)
  }

  override fun onDisabled(context: Context) {
    PlacementReceipts.observe(context)
    PrayerWidgetUpdates.refresh(context)
  }
}
