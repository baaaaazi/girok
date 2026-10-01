package io.github.baaaaazi.girok;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Locale;

/**
 * The widget's copy of the app data. The WebView pushes a snapshot (src/lib/widget.ts) after every change;
 * checks made on the widget go into the snapshot right away and into a pending list the app collects when it
 * opens. Pending checks are laid over every new snapshot until then, so an app write never hides them.
 */
final class WidgetStore {
    private static final String PREFS = "girok_widget";
    private static final String SNAPSHOT = "snapshot";
    private static final String PENDING = "pending";

    private WidgetStore() {}

    private static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    static synchronized void saveSnapshot(Context context, String json) throws JSONException {
        JSONObject snapshot = new JSONObject(json);
        applyOps(snapshot, pending(context));
        prefs(context).edit().putString(SNAPSHOT, snapshot.toString()).apply();
    }

    static synchronized JSONObject snapshot(Context context) {
        String raw = prefs(context).getString(SNAPSHOT, null);
        if (raw == null) return null;
        try {
            return new JSONObject(raw);
        } catch (JSONException e) {
            return null;
        }
    }

    /** Sets one routine's check for a date, as seen on the widget. */
    static synchronized void setCheck(Context context, String date, String id, boolean done) {
        JSONArray ops = pending(context);
        JSONArray next = new JSONArray();
        for (int i = 0; i < ops.length(); i++) {
            JSONObject op = ops.optJSONObject(i);
            if (op != null && !(date.equals(op.optString("date")) && id.equals(op.optString("id")))) next.put(op);
        }
        JSONObject op = new JSONObject();
        try {
            op.put("date", date).put("id", id).put("done", done);
        } catch (JSONException e) {
            return;
        }
        next.put(op);
        SharedPreferences.Editor editor = prefs(context).edit().putString(PENDING, next.toString());
        JSONObject snapshot = snapshot(context);
        if (snapshot != null) {
            JSONArray single = new JSONArray().put(op);
            applyOps(snapshot, single);
            editor.putString(SNAPSHOT, snapshot.toString());
        }
        editor.apply();
    }

    /** Hands the pending checks to the app and forgets them; the snapshot already includes them. */
    static synchronized String takePending(Context context) {
        String raw = pending(context).toString();
        prefs(context).edit().remove(PENDING).apply();
        return raw;
    }

    private static JSONArray pending(Context context) {
        try {
            return new JSONArray(prefs(context).getString(PENDING, "[]"));
        } catch (JSONException e) {
            return new JSONArray();
        }
    }

    private static void applyOps(JSONObject snapshot, JSONArray ops) {
        try {
            JSONObject checks = snapshot.optJSONObject("checks");
            if (checks == null) {
                checks = new JSONObject();
                snapshot.put("checks", checks);
            }
            for (int i = 0; i < ops.length(); i++) {
                JSONObject op = ops.optJSONObject(i);
                if (op == null) continue;
                String date = op.optString("date");
                String id = op.optString("id");
                JSONArray current = checks.optJSONArray(date);
                JSONArray next = new JSONArray();
                if (current != null) {
                    for (int j = 0; j < current.length(); j++) if (!id.equals(current.optString(j))) next.put(current.optString(j));
                }
                if (op.optBoolean("done")) next.put(id);
                if (next.length() > 0) checks.put(date, next);
                else checks.remove(date);
            }
        } catch (JSONException ignored) {
            // A malformed op is skipped; the app validates ops again when it applies them.
        }
    }

    static boolean isChecked(JSONObject snapshot, String date, String id) {
        JSONObject checks = snapshot.optJSONObject("checks");
        JSONArray ids = checks == null ? null : checks.optJSONArray(date);
        if (ids == null) return false;
        for (int i = 0; i < ids.length(); i++) if (id.equals(ids.optString(i))) return true;
        return false;
    }

    /** Mirrors isDue in src/lib/routines.ts: not before createdAt, and only on chosen weekdays when set. */
    static boolean isDue(JSONObject routine, String date, int weekday) {
        if (date.compareTo(routine.optString("createdAt")) < 0) return false;
        JSONArray days = routine.optJSONArray("days");
        if (days == null) return true;
        for (int i = 0; i < days.length(); i++) if (days.optInt(i, -1) == weekday) return true;
        return false;
    }

    static String dateKey(Calendar calendar) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(calendar.getTime());
    }
}
