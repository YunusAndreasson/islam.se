package se.islam.widget

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import androidx.core.content.ContextCompat
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DeviceClockModule : Module() {
  private var context: Context? = null

  private val receiver = object : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
      sendEvent("onClockChanged")
    }
  }

  private fun stopObservingClock() {
    context?.unregisterReceiver(receiver)
    context = null
  }

  override fun definition() = ModuleDefinition {
    Name("IslamDeviceClock")
    Events("onClockChanged")

    OnStartObserving("onClockChanged") {
      val app = appContext.reactContext?.applicationContext ?: return@OnStartObserving
      if (context == null) {
        val filter = IntentFilter().apply {
          addAction(Intent.ACTION_TIMEZONE_CHANGED)
          addAction(Intent.ACTION_TIME_CHANGED)
          addAction(Intent.ACTION_DATE_CHANGED)
        }
        ContextCompat.registerReceiver(app, receiver, filter, ContextCompat.RECEIVER_NOT_EXPORTED)
        context = app
      }
    }
    OnStopObserving("onClockChanged") { stopObservingClock() }
    OnDestroy { stopObservingClock() }
  }
}
