package se.islam.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.LinearGradient
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Shader
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.util.SizeF
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import kotlin.math.floor
import kotlin.math.roundToInt

internal object PrayerWidgetViews {
  private data class Palette(val paper: Int, val ink: Int, val muted: Int, val brass: Int, val rule: Int)

  private fun rgb(hex: String) = Color.parseColor(hex)
  private val light = Palette(rgb("#f6f3ed"), rgb("#1a1712"), rgb("#6f6456"), rgb("#805b1f"), rgb("#ded7ca"))
  private val dark = Palette(rgb("#161a26"), rgb("#e8e3d8"), rgb("#c1c6d4"), rgb("#fad486"), rgb("#343b4c"))

  fun render(context: Context, options: Bundle, payload: JSONObject?, preference: String?, status: String?, now: Long): RemoteViews {
    val useDark = when (preference) {
      "light" -> false
      "dark" -> true
      else -> context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK == Configuration.UI_MODE_NIGHT_YES
    }
    val palette = if (useDark) dark else light
    val sizes = if (Build.VERSION.SDK_INT >= 33) {
      options.getParcelableArrayList(AppWidgetManager.OPTION_APPWIDGET_SIZES, SizeF::class.java)
    } else if (Build.VERSION.SDK_INT >= 31) {
      @Suppress("DEPRECATION")
      options.getParcelableArrayList<SizeF>(AppWidgetManager.OPTION_APPWIDGET_SIZES)
    } else null
    if (Build.VERSION.SDK_INT >= 31 && !sizes.isNullOrEmpty() && sizes.size <= 16) {
      return RemoteViews(sizes.associateWith { size ->
        card(context, palette, useDark, payload, status, now, size.width, size.height)
      })
    }
    return card(context, palette, useDark, payload, status, now,
      options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 136).toFloat(),
      options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 124).toFloat())
  }

  private fun card(context: Context, c: Palette, darkMode: Boolean, payload: JSONObject?, status: String?,
    now: Long, width: Float, height: Float): RemoteViews {
    fun view(layout: Int) = RemoteViews(context.packageName, layout)
    val root = view(R.layout.islam_widget)
    val destination = Intent(Intent.ACTION_VIEW, Uri.parse("islamse:///widget/prayer-times"))
      .setPackage(context.packageName).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    root.setOnClickPendingIntent(android.R.id.background,
      PendingIntent.getActivity(context, 0, destination, PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT))
    root.setImageViewBitmap(R.id.widget_paper, Bitmap.createBitmap(1, 1, Bitmap.Config.ARGB_8888).apply { eraseColor(c.paper) })
    root.removeAllViews(R.id.widget_body)

    fun add(child: RemoteViews) = root.addView(R.id.widget_body, child)
    fun gap(dp: Float, line: Boolean = false) {
      val gap = view(R.layout.islam_widget_gap)
      if (Build.VERSION.SDK_INT >= 31) gap.setViewLayoutHeight(R.id.widget_gap, dp, TypedValue.COMPLEX_UNIT_DIP)
      if (line) gap.setImageViewBitmap(R.id.widget_gap, rule(c.rule))
      add(gap)
    }

    val scale = context.resources.configuration.fontScale
    val expanded = width >= 255 && height >= 121
    val large = expanded && height >= 280
    val roomy = height >= 175
    val tall = height >= 400
    if (payload == null || status != null) {
      val message = view(R.layout.islam_widget_state)
      message.label(R.id.widget_message_title, "Bönetider", c.ink)
      message.label(R.id.widget_message_text, when (status) {
        "zone" -> "Ny tidszon. Öppna appen för rätt tider."
        "clock" -> "Klockan har ändrats. Öppna appen för att uppdatera."
        "expired" -> "Bönetiderna behöver uppdateras. Öppna appen."
        "error" -> "Bönetiderna kunde inte läsas. Öppna appen."
        else -> "Öppna appen för att läsa in bönetider."
      }, c.muted)
      message.capSize(context, R.id.widget_message_title, 19f, height * .23f)
      message.capSize(context, R.id.widget_message_text, 13f, height * .15f)
      add(message)
      return root
    }

    val contextLine = view(R.layout.islam_widget_context)
    val city = payload.optString("location")
    val hijri = payload.optString("hijri")
    contextLine.label(R.id.widget_city, city.ifEmpty { "Bönetider" }, c.ink)
    contextLine.label(R.id.widget_hijri, hijri, c.muted)
    contextLine.capSize(context, R.id.widget_city, if (roomy) 13f else 11f, if (roomy) 17f else 13f)
    contextLine.capSize(context, R.id.widget_hijri, if (roomy) 12f else 11f, 15f)
    contextLine.setViewVisibility(R.id.widget_hijri, if (expanded && hijri.isNotEmpty()) View.VISIBLE else View.GONE)

    val nextAt = payload.optLong("nextAtMs")
    val nextName = payload.optString("nextArabic")
    val hasNext = nextAt > now && nextName.isNotEmpty()
    val hero = view(if (expanded) R.layout.islam_widget_hero else R.layout.islam_widget_compact)
    val nextLabel = if (payload.optBoolean("nextIsTomorrow")) "I morgon" else "Nästa bön"
    hero.label(R.id.widget_next_label, if (hasNext) nextLabel else "Bönetider", c.muted)
    hero.capSize(context, R.id.widget_next_label, if (roomy) 13f else 11f, if (roomy) 17f else 13f)
    val target = payload.optString("nextTime")
    val title = when {
      !hasNext -> if (expanded) "Ingen kommande tid" else "Ingen tid"
      expanded -> "$nextName  $target"
      else -> nextName
    }
    hero.label(R.id.widget_next, title, c.ink)
    val titleSize = when {
      !hasNext -> 16f
      large -> 29f
      expanded && roomy -> 27f
      expanded -> 21f
      roomy -> 21f
      else -> 17f
    }
    hero.capSize(context, R.id.widget_next, titleSize, if (expanded && roomy) 32f else if (roomy) 25f else 20f)
    if (!expanded) {
      hero.setViewVisibility(R.id.widget_target_time, if (hasNext) View.VISIBLE else View.GONE)
      hero.label(R.id.widget_target_time, target, c.ink)
      hero.capSize(context, R.id.widget_target_time, if (roomy) 37f else 25f, if (roomy) 43f else 29f)
      hero.setViewVisibility(R.id.widget_hijri, if (roomy && hijri.isNotEmpty()) View.VISIBLE else View.GONE)
      hero.label(R.id.widget_hijri, hijri, c.muted)
      hero.capSize(context, R.id.widget_hijri, 10f, (width - 26) / 12f)
    }
    hero.setViewVisibility(R.id.widget_timer, if (hasNext) View.VISIBLE else View.GONE)
    if (hasNext) {
      hero.setTextColor(R.id.widget_timer, c.brass)
      hero.capSize(context, R.id.widget_timer, if (roomy) 16f else 12f, if (roomy) 20f else 15f)
      hero.setChronometer(R.id.widget_timer, SystemClock.elapsedRealtime() + nextAt - now, null, true)
      hero.setChronometerCountDown(R.id.widget_timer, true)
    }
    val solar = payload.optJSONObject("solar")
    val showArc = solar != null && (expanded || (height >= 202 && scale <= 1.2f))
    hero.setViewVisibility(R.id.widget_solar, if (showArc) View.VISIBLE else View.GONE)
    if (showArc && solar != null) {
      val chartHeight = when {
        !expanded -> 44f
        Build.VERSION.SDK_INT < 31 -> 55f
        tall -> 104f
        large -> 78f
        roomy -> 76f
        else -> 46f
      }
      // Match the preview bitmap to its weighted layout so the sun stays circular.
      val chartWidth = if (expanded) (width - 36) * 0.75f / 1.75f else width - 28
      val graph = solarGraph(solar, now, darkMode, c, (chartWidth * 2).roundToInt(), (chartHeight * 2).roundToInt())
      hero.setImageViewBitmap(R.id.widget_solar, graph.bitmap)
      hero.setContentDescription(R.id.widget_solar, "Solens läge · ${graph.phase}")
      if (expanded && Build.VERSION.SDK_INT >= 31) {
        hero.setViewLayoutHeight(R.id.widget_solar, chartHeight, TypedValue.COMPLEX_UNIT_DIP)
      }
    }

    if (!expanded) {
      add(contextLine)
      gap(if (roomy) 8f else 3f)
      add(hero)
      return root
    }

    add(contextLine)
    gap(if (roomy) 12f else 4f)
    add(hero)
    gap(if (roomy) 15f else 6f, line = true)
    val rows = payload.optJSONArray("rows")
    val schedule = if (large) null else view(R.layout.islam_widget_schedule)
    for (index in 0 until (rows?.length() ?: 0)) {
      val row = rows?.optJSONObject(index) ?: continue
      if (row.optBoolean("isMarker")) continue
      val cell = view(if (large) R.layout.islam_widget_row else R.layout.islam_widget_cell)
      val current = row.optBoolean("isCurrent")
      val name = row.optString("arabic")
      cell.label(R.id.widget_cell_name, name, if (current) c.brass else c.muted)
      cell.label(R.id.widget_cell_time, row.optString("time"), if (current) c.brass else c.ink)
      cell.capSize(context, R.id.widget_cell_name, if (large) 16f else if (roomy) 12f else 10f, if (large) 20f else (width - 32) / 19f)
      cell.capSize(context, R.id.widget_cell_time, if (large) 17f else if (roomy) 15f else 12f, if (large) 21f else (width - 32) / 17f)
      if (roomy) {
        val density = context.resources.displayMetrics.density
        val horizontal = if (large) (9 * density).toInt() else 0
        val vertical = ((if (tall) 9 else 5) * density).toInt()
        cell.setViewPadding(R.id.widget_cell_content, horizontal, vertical, horizontal, vertical)
      }
      if (current) {
        cell.setImageViewResource(R.id.widget_cell_fill,
          if (darkMode) R.drawable.islam_widget_current_dark else R.drawable.islam_widget_current_light)
        cell.setContentDescription(R.id.widget_cell_name, "$name, pågående bön")
      }
      if (schedule == null) add(cell) else schedule.addView(R.id.widget_schedule, cell)
    }
    if (schedule != null) add(schedule)
    if (large) {
      gap(if (tall) 18f else 12f, line = true)
      val tomorrow = view(R.layout.islam_widget_large_footer)
      tomorrow.label(R.id.widget_tomorrow_label, "Fajr i morgon", c.muted)
      tomorrow.label(R.id.widget_tomorrow, payload.optString("tomorrowFajr", "–"), c.brass)
      tomorrow.capSize(context, R.id.widget_tomorrow_label, 14f, 18f)
      tomorrow.capSize(context, R.id.widget_tomorrow, 16f, 20f)
      add(tomorrow)
    }
    return root
  }

  private fun RemoteViews.label(id: Int, value: String, color: Int) {
    setTextViewText(id, value)
    setTextColor(id, color)
  }

  private fun RemoteViews.capSize(context: Context, id: Int, sp: Float, maxDp: Float) {
    val metrics = context.resources.displayMetrics
    val scaledDp = TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, sp, metrics) / metrics.density
    // Host cells have fixed height. Honor font scale until a line would otherwise clip.
    setTextViewTextSize(id, TypedValue.COMPLEX_UNIT_DIP, minOf(scaledDp, maxDp))
  }

  private fun rule(color: Int) = Bitmap.createBitmap(1, 12, Bitmap.Config.ARGB_8888).apply {
    setPixel(0, 6, color)
  }

  private data class SolarGraph(val bitmap: Bitmap, val phase: String)

  private fun solarGraph(solar: JSONObject, now: Long, darkMode: Boolean, c: Palette, width: Int, height: Int): SolarGraph {
    val start = solar.optLong("startMs")
    val end = solar.optLong("endMs")
    val samples = solar.optJSONArray("altitudes")
    val count = samples?.length() ?: 0
    val duration = (end - start).coerceAtLeast(1)
    val progress = ((now - start).toDouble() / duration).coerceIn(0.0, 1.0)
    val cursor = progress * (count - 1).coerceAtLeast(0)
    val index = floor(cursor).toInt().coerceAtMost((count - 2).coerceAtLeast(0))
    val before = samples?.optDouble(index, 0.0) ?: 0.0
    val after = samples?.optDouble(index + 1, before) ?: before
    val altitude = before + (after - before) * (cursor - index)
    val phase = when {
      altitude >= 0 -> 0
      altitude < -12 -> 3
      after >= before -> 1
      else -> 2
    }
    val (top, bottom) = if (darkMode) when (phase) {
      0 -> "#233344" to "#35444e"
      1 -> "#2d3048" to "#514036"
      2 -> "#31314a" to "#513c40"
      else -> "#21283e" to "#2d314b"
    } else when (phase) {
      0 -> "#dbe5e9" to "#efe5cb"
      1 -> "#dce1f0" to "#f3e0bc"
      2 -> "#e1dff0" to "#f2d9c3"
      else -> "#dce0ed" to "#e6e4f0"
    }

    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    paint.shader = LinearGradient(0f, 0f, 0f, height.toFloat(), rgb(top), rgb(bottom), Shader.TileMode.CLAMP)
    canvas.drawRoundRect(0f, 0f, width.toFloat(), height.toFloat(), 16f, 16f, paint)
    paint.shader = null
    // Squeeze deep night into the lower third so a winter arc stays legible above the horizon.
    val horizon = height * .68f
    fun y(degrees: Double): Float = if (degrees >= 0) {
      horizon - (horizon - 14) * (degrees / 64).coerceAtMost(1.0).toFloat()
    } else {
      horizon + (height - horizon - 13) * (-degrees / 45).coerceAtMost(1.0).toFloat()
    }
    fun x(fraction: Double) = 13f + (width - 26) * fraction.toFloat()
    paint.color = c.muted
    paint.alpha = 95
    paint.strokeWidth = 1.4f
    canvas.drawLine(x(0.0), horizon, x(1.0), horizon, paint)
    val path = Path()
    for (sample in 0 until count) {
      val sx = x(sample.toDouble() / (count - 1).coerceAtLeast(1))
      val sy = y(samples?.optDouble(sample, 0.0) ?: 0.0)
      if (sample == 0) path.moveTo(sx, sy) else path.lineTo(sx, sy)
    }
    paint.color = c.brass
    paint.alpha = 185
    paint.style = Paint.Style.STROKE
    paint.strokeWidth = 2.4f
    paint.strokeJoin = Paint.Join.ROUND
    canvas.drawPath(path, paint)
    paint.style = Paint.Style.FILL
    paint.alpha = 255
    val sx = x(progress)
    val sy = y(altitude)
    paint.color = c.paper
    canvas.drawCircle(sx, sy, 9f, paint)
    paint.color = c.brass
    canvas.drawCircle(sx, sy, 6f, paint)
    return SolarGraph(bitmap, listOf("Dagsljus", "Gryning", "Skymning", "Natt")[phase])
  }
}
