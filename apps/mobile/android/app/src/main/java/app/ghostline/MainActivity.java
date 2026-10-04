package app.ghostline;

import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Ringtone and remote call audio start without a tap (the web app plays them from sockets/LiveKit).
        getBridge().getWebView().getSettings().setMediaPlaybackRequiresUserGesture(false);
        // A WebView drops downloads on the floor; the update banner's APK link goes to the system instead.
        getBridge().getWebView().setDownloadListener((url, userAgent, contentDisposition, mimeType, contentLength) ->
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url))));
    }
}
