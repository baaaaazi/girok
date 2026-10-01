package io.github.baaaaazi.girok;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.RectF;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.util.TypedValue;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;

/**
 * Home-screen widget: today's recorded hours as a 24-cell strip, and today's routines with tap-to-check.
 * Data comes from WidgetStore; a tap on a routine updates the store and redraws without opening the app.
 */
public class GirokWidgetProvider extends AppWidgetProvider {
    private static final String ACTION_TOGGLE = "io.github.baaaaazi.girok.widget.TOGGLE";
    private static final String ACTION_REFRESH = "io.github.baaaaazi.girok.widget.REFRESH";
    private static final String[] WEEKDAYS = {"일", "월", "화", "수", "목", "금", "토"};

    // Layout heights in dp, used to work out how many routine rows fit.
    private static final int PADDING = 16;
    private static final int HEADER = 44;
    private static final int BAR = 15 + 10;
    private static final int LIST_TOP = 8;
    private static final int ROW = 44;
    private static final int ROW_MAX = 52; // rows grow toward this to fill a roomy widget (Android 12+)
    private static final int MORE = 20;

    // The app's light and dark tokens (src/styles.css) for when the user picked a theme in the app;
    // "system" leaves the layout's day/night color resources in charge.
    private static final int[] LIGHT = {0xFF171719, 0xFF62626B};
    private static final int[] DARK = {0xFFF2F2F4, 0xFFA4A4AC};

    @Override
    public void onUpdate(Context context, AppWidgetManager manager, int[] ids) {
        for (int id : ids) render(context, manager, id);
        scheduleMidnight(context);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context context, AppWidgetManager manager, int id, Bundle options) {
        render(context, manager, id);
    }

    @Override
    public void onDisabled(Context context) {
        alarmManager(context).cancel(refreshIntent(context));
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (ACTION_TOGGLE.equals(action)) {
            String date = intent.getStringExtra("date");
            String id = intent.getStringExtra("id");
            if (date != null && id != null) WidgetStore.setCheck(context, date, id, intent.getBooleanExtra("done", false));
            refreshAll(context);
        } else if (ACTION_REFRESH.equals(action) || Intent.ACTION_TIME_CHANGED.equals(action) || Intent.ACTION_TIMEZONE_CHANGED.equals(action)) {
            refreshAll(context);
        } else {
            super.onReceive(context, intent);
        }
    }

    static void refreshAll(Context context) {
        AppWidgetManager manager = AppWidgetManager.getInstance(context);
        int[] ids = manager.getAppWidgetIds(new ComponentName(context, GirokWidgetProvider.class));
        for (int id : ids) render(context, manager, id);
        if (ids.length > 0) scheduleMidnight(context);
    }

    private static void render(Context context, AppWidgetManager manager, int widgetId) {
        Calendar now = Calendar.getInstance();
        String today = WidgetStore.dateKey(now);
        int weekday = now.get(Calendar.DAY_OF_WEEK) - 1;
        JSONObject snapshot = WidgetStore.snapshot(context);
        Bundle options = manager.getAppWidgetOptions(widgetId);
        int widthDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 250);
        int heightDp = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 180);
        if (widthDp <= 0) widthDp = 250;
        if (heightDp <= 0) heightDp = 180;

        int[] palette = palette(context, snapshot);
        RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_girok);
        if (palette != null) {
            views.setImageViewResource(R.id.widget_bg, palette == DARK ? R.drawable.widget_bg_dark : R.drawable.widget_bg_light);
            views.setTextColor(R.id.widget_title, palette[0]);
            views.setTextColor(R.id.widget_hours, palette[0]);
            views.setTextColor(R.id.widget_subtitle, palette[1]);
            views.setTextColor(R.id.widget_hours_unit, palette[1]);
            views.setTextColor(R.id.widget_note, palette[1]);
        }
        int opacity = snapshot == null ? 100 : Math.max(0, Math.min(100, snapshot.optInt("opacity", 100)));
        views.setInt(R.id.widget_bg, "setImageAlpha", Math.round(opacity * 2.55f));
        PendingIntent open = openApp(context);
        views.setOnClickPendingIntent(R.id.widget_header, open);
        views.setOnClickPendingIntent(R.id.widget_bar, open);
        views.setOnClickPendingIntent(R.id.widget_note, open);

        boolean current = snapshot != null && today.equals(snapshot.optString("date"));
        JSONArray hours = current ? snapshot.optJSONArray("hours") : null;
        int recorded = 0;
        if (hours != null) for (int i = 0; i < hours.length(); i++) if (hours.optJSONArray(i) != null && hours.optJSONArray(i).length() > 0) recorded++;
        views.setTextViewText(R.id.widget_hours, String.valueOf(recorded));
        views.setImageViewBitmap(R.id.widget_bar, hourBar(context, hours, widthDp - PADDING * 2));

        List<JSONObject> due = new ArrayList<>();
        JSONArray routines = snapshot == null ? null : snapshot.optJSONArray("routines");
        if (routines != null) {
            for (int i = 0; i < routines.length(); i++) {
                JSONObject routine = routines.optJSONObject(i);
                if (routine != null && WidgetStore.isDue(routine, today, weekday)) due.add(routine);
            }
        }
        int done = 0;
        for (JSONObject routine : due) if (WidgetStore.isChecked(snapshot, today, routine.optString("id"))) done++;
        String dateLabel = (now.get(Calendar.MONTH) + 1) + "월 " + now.get(Calendar.DAY_OF_MONTH) + "일 " + WEEKDAYS[weekday];
        views.setTextViewText(R.id.widget_subtitle, due.isEmpty() ? dateLabel : dateLabel + " · 루틴 " + done + "/" + due.size());

        views.removeAllViews(R.id.widget_routines);
        int available = heightDp - PADDING * 2 - HEADER - BAR - LIST_TOP;
        int shown = due.size() * ROW <= available ? due.size() : Math.max(0, (available - MORE) / ROW);
        int rowHeight = shown == due.size() && shown > 0 ? Math.min(ROW_MAX, available / shown) : ROW;
        for (int i = 0; i < shown; i++) {
            RemoteViews row = routineRow(context, snapshot, due.get(i), today, palette, current);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) row.setViewLayoutHeight(R.id.row_root, rowHeight, TypedValue.COMPLEX_UNIT_DIP);
            views.addView(R.id.widget_routines, row);
        }

        String note = null;
        if (snapshot == null) note = "앱을 열면 오늘 기록이 여기에 보여요";
        else if (due.isEmpty()) note = "오늘 할 루틴이 없어요";
        else if (shown < due.size()) note = "+" + (due.size() - shown) + "개 더";
        views.setViewVisibility(R.id.widget_note, note == null ? View.GONE : View.VISIBLE);
        if (note != null) views.setTextViewText(R.id.widget_note, note);

        manager.updateAppWidget(widgetId, views);
    }

    private static RemoteViews routineRow(Context context, JSONObject snapshot, JSONObject routine, String today, int[] palette, boolean current) {
        String id = routine.optString("id");
        boolean checked = WidgetStore.isChecked(snapshot, today, id);
        RemoteViews row = new RemoteViews(context.getPackageName(), R.layout.widget_routine_row);
        row.setTextViewText(R.id.row_name, routine.optString("name"));
        if (palette != null) {
            row.setTextColor(R.id.row_name, palette[0]);
            row.setTextColor(R.id.row_label, palette[1]);
        }
        // Streak / weekly count for today, done or not; a snapshot from an earlier day cannot know it.
        JSONArray labels = current ? routine.optJSONArray("labels") : null;
        String label = labels == null ? "" : labels.optString(checked ? 1 : 0, "");
        row.setTextViewText(R.id.row_label, label);
        row.setViewVisibility(R.id.row_label, label.isEmpty() ? View.GONE : View.VISIBLE);
        row.setFloat(R.id.row_name, "setAlpha", checked ? 0.45f : 1f);
        row.setImageViewBitmap(R.id.row_check, checkIcon(context, parseColor(routine.optString("color"), 0xFF8A8D96), checked));
        row.setContentDescription(R.id.row_root, routine.optString("name") + (checked ? ", 완료. 눌러서 취소" : ", 눌러서 완료"));

        Intent intent = new Intent(context, GirokWidgetProvider.class)
                .setAction(ACTION_TOGGLE)
                // A distinct data URI keeps each row's PendingIntent from replacing the others.
                .setData(Uri.parse("girok-widget://toggle/" + today + "/" + Uri.encode(id)))
                .putExtra("date", today)
                .putExtra("id", id)
                .putExtra("done", !checked);
        row.setOnClickPendingIntent(R.id.row_root, PendingIntent.getBroadcast(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        return row;
    }

    /** Null means follow the system theme through the color resources. */
    private static int[] palette(Context context, JSONObject snapshot) {
        String theme = snapshot == null ? "system" : snapshot.optString("theme", "system");
        if ("dark".equals(theme)) return DARK;
        if ("light".equals(theme)) return LIGHT;
        return null;
    }

    /** 24 hour cells in four groups of six, matching the record page's rows; two-activity hours split diagonally. */
    private static Bitmap hourBar(Context context, JSONArray hours, int widthDp) {
        float density = context.getResources().getDisplayMetrics().density;
        float gap = 2 * density;
        float groupGap = 5 * density;
        int width = Math.max(1, Math.round(widthDp * density));
        int height = Math.round(15 * density);
        float cell = (width - gap * 20 - groupGap * 3) / 24f;
        float radius = 3 * density;
        Bitmap bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        float x = 0;
        for (int hour = 0; hour < 24; hour++) {
            RectF rect = new RectF(x, 0, x + cell, height);
            JSONArray colors = hours == null ? null : hours.optJSONArray(hour);
            if (colors == null || colors.length() == 0) {
                paint.setColor(0x38808080); // neutral track that reads on both themes
                canvas.drawRoundRect(rect, radius, radius, paint);
            } else {
                paint.setColor(parseColor(colors.optString(0), Color.GRAY));
                canvas.drawRoundRect(rect, radius, radius, paint);
                if (colors.length() > 1) {
                    canvas.save();
                    Path lower = new Path();
                    lower.moveTo(rect.right, rect.top);
                    lower.lineTo(rect.right, rect.bottom);
                    lower.lineTo(rect.left, rect.bottom);
                    lower.close();
                    canvas.clipPath(lower);
                    paint.setColor(parseColor(colors.optString(1), Color.GRAY));
                    canvas.drawRoundRect(rect, radius, radius, paint);
                    canvas.restore();
                }
            }
            x += cell + (hour % 6 == 5 ? groupGap : gap);
        }
        return bitmap;
    }

    private static Bitmap checkIcon(Context context, int color, boolean checked) {
        float density = context.getResources().getDisplayMetrics().density;
        int size = Math.round(28 * density);
        float stroke = 2.4f * density;
        Bitmap bitmap = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bitmap);
        Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
        float center = size / 2f;
        if (checked) {
            paint.setColor(color);
            canvas.drawCircle(center, center, center, paint);
            Path mark = new Path();
            mark.moveTo(size * 0.29f, size * 0.52f);
            mark.lineTo(size * 0.44f, size * 0.67f);
            mark.lineTo(size * 0.72f, size * 0.37f);
            paint.setColor(Color.WHITE);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(stroke);
            paint.setStrokeCap(Paint.Cap.ROUND);
            paint.setStrokeJoin(Paint.Join.ROUND);
            canvas.drawPath(mark, paint);
        } else {
            paint.setColor(color);
            paint.setStyle(Paint.Style.STROKE);
            paint.setStrokeWidth(stroke);
            canvas.drawCircle(center, center, center - stroke / 2 - 0.5f, paint);
        }
        return bitmap;
    }

    private static int parseColor(String value, int fallback) {
        try {
            return Color.parseColor(value);
        } catch (IllegalArgumentException e) {
            return fallback;
        }
    }

    private static PendingIntent openApp(Context context) {
        Intent intent = new Intent(context, MainActivity.class).setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        return PendingIntent.getActivity(context, 0, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static AlarmManager alarmManager(Context context) {
        return (AlarmManager) context.getSystemService(Context.ALARM_SERVICE);
    }

    private static PendingIntent refreshIntent(Context context) {
        Intent intent = new Intent(context, GirokWidgetProvider.class).setAction(ACTION_REFRESH);
        return PendingIntent.getBroadcast(context, 1, intent, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Redraws just after midnight so the new day's routines show. */
    private static void scheduleMidnight(Context context) {
        Calendar next = Calendar.getInstance();
        next.add(Calendar.DAY_OF_MONTH, 1);
        next.set(Calendar.HOUR_OF_DAY, 0);
        next.set(Calendar.MINUTE, 0);
        next.set(Calendar.SECOND, 5);
        next.set(Calendar.MILLISECOND, 0);
        // Exact but non-waking (USE_EXACT_ALARM is already granted for reminders): it fires at midnight, or the
        // moment the phone wakes after it. Inexact alarms can slip by 10 minutes to an hour.
        AlarmManager alarms = alarmManager(context);
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S || alarms.canScheduleExactAlarms()) {
            alarms.setExact(AlarmManager.RTC, next.getTimeInMillis(), refreshIntent(context));
        } else {
            alarms.setWindow(AlarmManager.RTC, next.getTimeInMillis(), 10 * 60_000, refreshIntent(context));
        }
    }
}
