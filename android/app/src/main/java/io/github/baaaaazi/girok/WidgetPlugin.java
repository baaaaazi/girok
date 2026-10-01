package io.github.baaaaazi.girok;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

/** The WebView side of the home-screen widget; see updateWidget and takeWidgetOps in src/native.ts. */
@CapacitorPlugin(name = "GirokWidget")
public class WidgetPlugin extends Plugin {
    @PluginMethod
    public void update(PluginCall call) {
        String snapshot = call.getString("snapshot");
        if (snapshot == null) {
            call.reject("snapshot is required");
            return;
        }
        try {
            WidgetStore.saveSnapshot(getContext(), snapshot);
        } catch (JSONException e) {
            call.reject("snapshot is not valid JSON");
            return;
        }
        GirokWidgetProvider.refreshAll(getContext());
        call.resolve();
    }

    @PluginMethod
    public void takePending(PluginCall call) {
        JSObject result = new JSObject();
        result.put("ops", WidgetStore.takePending(getContext()));
        call.resolve(result);
    }
}
