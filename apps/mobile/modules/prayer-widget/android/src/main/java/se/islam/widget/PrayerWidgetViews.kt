package se.islam.widget

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.Path
import android.graphics.Typeface
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.util.SizeF
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import org.json.JSONObject
import kotlin.math.ceil
import kotlin.math.floor
import kotlin.math.roundToInt

internal object PrayerWidgetViews {
  private data class Palette(val paper: Int, val ink: Int, val muted: Int, val brass: Int, val rule: Int)

  private fun rgb(hex: String) = Color.parseColor(hex)
  private val light = Palette(rgb("#f6f3ed"), rgb("#1a1712"), rgb("#6f6456"), rgb("#805b1f"), rgb("#ded7ca"))
  private val dark = Palette(rgb("#161a26"), rgb("#e8e3d8"), rgb("#c1c6d4"), rgb("#fad486"), rgb("#343b4c"))
  private const val HORIZONTAL_PADDING = 14f

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

    val text = WidgetText(context)
    // The host can round down its reported bounds. Leave clearance for that rounding,
    // and reserve the whole timetable before adding the hero's secondary elements.
    val contentWidth = width - 2 * HORIZONTAL_PADDING - 2
    var remaining = height - 26
    fun reserve(dp: Float): Boolean {
      if (dp > remaining) return false
      remaining -= dp
      return true
    }
    val flexibleDimensions = Build.VERSION.SDK_INT >= 31
    val rows = payload.optJSONArray("rows")
    val prayers = (0 until (rows?.length() ?: 0)).mapNotNull { rows?.optJSONObject(it) }
      .filterNot { it.optBoolean("isMarker") }
    // Keep visible separation between adjacent times when the five-column row is narrow.
    val cellWidth = if (large) contentWidth - 18 else contentWidth / prayers.size.coerceAtLeast(1) - 6
    val rowTime = text.fit(
      text.size(if (large) 17f else if (roomy) 15f else 12f, if (large) 21f else 18f),
      cellWidth, prayers.map { it.optString("time") },
    )
    val nameWidth = if (large) {
      cellWidth - (prayers.maxOfOrNull { text.width(it.optString("time"), rowTime) } ?: 0f)
    } else cellWidth
    val rowName = text.fit(
      text.size(if (large) 16f else if (roomy) 12f else 10f, if (large) 20f else 16f),
      nameWidth, prayers.map { it.optString("arabic") },
    )
    val cellPadding = when {
      large && tall -> 7f
      large -> 3f
      else -> 2f
    }
    if (expanded && prayers.isNotEmpty()) {
      remaining -= if (large) {
        prayers.size * (maxOf(text.line(rowName), text.line(rowTime)) + cellPadding * 2)
      } else {
        text.line(rowName) + text.line(rowTime) + cellPadding * 2
      }
    }

    val city = payload.optString("location").ifEmpty { "Bönetider" }
    val hijri = payload.optString("hijri")
    val nextAt = payload.optLong("nextAtMs")
    val nextName = payload.optString("nextArabic")
    val hasNext = nextAt > now && nextName.isNotEmpty()
    val target = payload.optString("nextTime")
    val title = when {
      !hasNext -> if (expanded) "Ingen kommande tid" else "Ingen tid"
      expanded -> "$nextName  $target"
      else -> nextName
    }
    val requestedTitle = when {
      !hasNext -> 16f
      large -> 29f
      expanded && roomy -> 27f
      expanded -> 21f
      roomy -> 21f
      else -> 17f
    }
    val titleSize = text.size(requestedTitle, if (expanded && roomy) 32f else if (roomy) 25f else 20f)
    val compactTime = text.fit(text.size(if (roomy) 37f else 25f, if (roomy) 43f else 29f), contentWidth, listOf(target))
    val fullTitle = text.fit(titleSize, contentWidth, listOf(title))
    val solar = payload.optJSONObject("solar")
    val splitWidth = (contentWidth - 8) / 1.75f
    val splitTitle = text.fit(titleSize, splitWidth, listOf(title))
    val split = expanded && solar != null && splitTitle >= minOf(fullTitle, 22f)
    val fittedTitle = if (split) splitTitle else fullTitle
    var heroHeight = text.line(fittedTitle) + if (expanded) 2 else 3
    if (!expanded && hasNext) heroHeight += text.line(compactTime)
    remaining -= heroHeight

    val gapUnit = if (flexibleDimensions) 4f else 6f
    val citySize = text.size(if (roomy) 13f else 11f, if (roomy) 17f else 13f)
    val hijriSize = text.size(11f, 15f)
    val showCity = reserve(maxOf(text.line(citySize), text.line(hijriSize)) + gapUnit)
    val labelSize = text.size(if (roomy) 13f else 11f, if (roomy) 17f else 13f)
    val showLabel = hasNext && reserve(text.line(labelSize))
    if (showLabel) heroHeight += text.line(labelSize)
    val timerSize = text.fit(text.size(if (roomy) 16f else 12f, if (roomy) 20f else 15f),
      if (split) splitWidth else contentWidth, listOf("00:00:00"))
    val showTimer = hasNext && reserve(text.line(timerSize) + 2)
    if (showTimer) heroHeight += text.line(timerSize) + 2
    val footerLabel = text.size(14f, 18f)
    val footerTime = text.size(16f, 20f)
    val showTomorrow = large && reserve(maxOf(text.line(footerLabel), text.line(footerTime)) + gapUnit)
    val showDivider = expanded && prayers.isNotEmpty() && reserve(gapUnit)
    val chartHeight = if (split) {
      when {
        !flexibleDimensions -> 55f.takeIf { it <= heroHeight + remaining } ?: 0f
        else -> minOf(heroHeight + remaining, if (tall) 104f else if (large) 78f else 58f)
          .takeIf { it >= 24 } ?: 0f
      }
    } else if (!expanded && solar != null) {
      val compactChart = if (flexibleDimensions) minOf(44f, remaining - 9) else 44f
      compactChart.takeIf { it >= 28 && reserve(it + 9) } ?: 0f
    } else 0f
    val compactHijri = !expanded && roomy && hijri.isNotEmpty() && reserve(text.line(hijriSize) + 7)
    if (split && chartHeight > heroHeight) remaining -= chartHeight - heroHeight
    val extraGap = if (flexibleDimensions) (remaining / 3).coerceIn(0f, 7f) else 0f

    if (showCity) {
      val contextLine = view(R.layout.islam_widget_context)
      contextLine.label(R.id.widget_city, city, c.ink)
      contextLine.size(R.id.widget_city, citySize)
      contextLine.label(R.id.widget_hijri, hijri, c.muted)
      contextLine.size(R.id.widget_hijri, hijriSize)
      contextLine.setViewVisibility(R.id.widget_hijri,
        if (expanded && hijri.isNotEmpty() && text.width(hijri, hijriSize) < contentWidth / 2) View.VISIBLE else View.GONE)
      add(contextLine)
      gap(gapUnit + extraGap)
    }
    val hero = view(if (expanded) R.layout.islam_widget_hero else R.layout.islam_widget_compact)
    val nextLabel = if (payload.optBoolean("nextIsTomorrow")) "I morgon" else "Nästa bön"
    hero.label(R.id.widget_next_label, nextLabel, c.muted)
    hero.size(R.id.widget_next_label, labelSize)
    hero.setViewVisibility(R.id.widget_next_label, if (showLabel) View.VISIBLE else View.GONE)
    hero.label(R.id.widget_next, title, c.ink)
    hero.size(R.id.widget_next, fittedTitle)
    if (!expanded) {
      hero.setViewVisibility(R.id.widget_target_time, if (hasNext) View.VISIBLE else View.GONE)
      hero.label(R.id.widget_target_time, target, c.ink)
      hero.size(R.id.widget_target_time, compactTime)
      hero.setViewVisibility(R.id.widget_hijri, if (compactHijri) View.VISIBLE else View.GONE)
      hero.label(R.id.widget_hijri, hijri, c.muted)
      hero.size(R.id.widget_hijri, hijriSize)
    }
    hero.setViewVisibility(R.id.widget_timer, if (showTimer) View.VISIBLE else View.GONE)
    if (showTimer) {
      hero.setTextColor(R.id.widget_timer, c.brass)
      hero.size(R.id.widget_timer, timerSize)
      hero.setChronometer(R.id.widget_timer, SystemClock.elapsedRealtime() + nextAt - now, null, true)
      hero.setChronometerCountDown(R.id.widget_timer, true)
    }
    hero.setViewVisibility(R.id.widget_solar, if (chartHeight > 0) View.VISIBLE else View.GONE)
    if (chartHeight > 0 && solar != null) {
      // Match the preview bitmap to its weighted layout so the sun stays circular.
      val chartWidth = if (expanded) (width - 36) * 0.75f / 1.75f else width - 28
      val graph = solarGraph(solar, now, darkMode, c, (chartWidth * 2).roundToInt(), (chartHeight * 2).roundToInt())
      hero.setImageViewBitmap(R.id.widget_solar, graph.bitmap)
      hero.setContentDescription(R.id.widget_solar, "Solens läge · ${graph.phase}")
      if (flexibleDimensions) {
        hero.setViewLayoutHeight(R.id.widget_solar, chartHeight, TypedValue.COMPLEX_UNIT_DIP)
      }
    }

    add(hero)
    if (!expanded) return root
    if (showDivider) gap(gapUnit + extraGap, line = true)
    val schedule = if (large) null else view(R.layout.islam_widget_schedule)
    for (row in prayers) {
      val cell = view(if (large) R.layout.islam_widget_row else R.layout.islam_widget_cell)
      val current = row.optBoolean("isCurrent")
      val name = row.optString("arabic")
      cell.label(R.id.widget_cell_name, name, if (current) c.brass else c.muted)
      cell.label(R.id.widget_cell_time, row.optString("time"), if (current) c.brass else c.ink)
      cell.size(R.id.widget_cell_name, rowName)
      cell.size(R.id.widget_cell_time, rowTime)
      val horizontal = if (large) text.pixels(9f) else 0
      val vertical = text.pixels(cellPadding)
      cell.setViewPadding(R.id.widget_cell_content, horizontal, vertical, horizontal, vertical)
      if (current) {
        cell.setImageViewResource(R.id.widget_cell_fill,
          if (darkMode) R.drawable.islam_widget_current_dark else R.drawable.islam_widget_current_light)
        cell.setContentDescription(R.id.widget_cell_name, "$name, pågående bön")
      }
      if (schedule == null) add(cell) else schedule.addView(R.id.widget_schedule, cell)
    }
    if (schedule != null) add(schedule)
    if (showTomorrow) {
      gap(gapUnit + extraGap, line = true)
      val tomorrow = view(R.layout.islam_widget_large_footer)
      tomorrow.label(R.id.widget_tomorrow_label, "Fajr i morgon", c.muted)
      tomorrow.label(R.id.widget_tomorrow, payload.optString("tomorrowFajr", "–"), c.brass)
      tomorrow.size(R.id.widget_tomorrow_label, footerLabel)
      tomorrow.size(R.id.widget_tomorrow, footerTime)
      add(tomorrow)
    }
    return root
  }

  private fun RemoteViews.label(id: Int, value: String, color: Int) {
    setTextViewText(id, value)
    setTextColor(id, color)
  }

  private fun RemoteViews.size(id: Int, dp: Float) = setTextViewTextSize(id, TypedValue.COMPLEX_UNIT_DIP, dp)

  private class WidgetText(context: Context) {
    private val metrics = context.resources.displayMetrics
    private val paint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      typeface = Typeface.create("sans-serif-medium", Typeface.NORMAL)
      fontFeatureSettings = "tnum"
    }
    fun pixels(dp: Float): Int = (dp * metrics.density).toInt()
    fun size(sp: Float, maxDp: Float): Float =
      minOf(TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_SP, sp, metrics) / metrics.density, maxDp)

    fun width(value: String, dp: Float): Float {
      paint.textSize = dp * metrics.density
      return paint.measureText(value) / metrics.density
    }

    fun fit(dp: Float, width: Float, values: List<String>): Float {
      val needed = values.maxOfOrNull { width(it, dp) } ?: 0f
      return if (needed > width) dp * width / needed else dp
    }

    fun line(dp: Float): Float {
      paint.textSize = dp * metrics.density
      val font = paint.fontMetrics
      return ceil(font.bottom - font.top + 1) / metrics.density
    }
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
    // The tint belongs to the curve so the graph shares the widget's paper.
    val curve = when (phase) {
      0 -> c.brass
      1 -> rgb(if (darkMode) "#a7badf" else "#4e658a")
      2 -> rgb(if (darkMode) "#e4b1c0" else "#80536b")
      else -> rgb(if (darkMode) "#adb6dd" else "#585d84")
    }
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
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
    paint.color = curve
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
