package br.com.nexap.preview;

import android.app.Activity;
import android.os.Bundle;
import android.graphics.Color;
import android.view.View;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.ValueCallback;
import android.content.Intent;
import android.net.Uri;
import android.webkit.WebResourceRequest;

public class MainActivity extends Activity {
    private WebView webView;
    private ValueCallback<Uri[]> uploadCallback;
    private static final int FILE_CHOOSER_REQUEST = 42;
    private static final String APP_URL = "https://xp-work.pages.dev/?app=android";
    private static final String OAUTH_CALLBACK = "nexap://auth/callback";

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().setStatusBarColor(Color.rgb(22, 55, 27));
        getWindow().setNavigationBarColor(Color.rgb(16, 23, 19));
        getWindow().getDecorView().setSystemUiVisibility(0);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.rgb(245, 248, 245));
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setLoadsImagesAutomatically(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (isOAuthCallback(uri)) {
                    openOAuthCallback(uri);
                    return true;
                }
                String host = uri.getHost() == null ? "" : uri.getHost();
                if (host.equals("xp-work.pages.dev") ||
                    host.equals("balojriovbjzywjrvpyw.supabase.co") ||
                    host.endsWith("supabase.co") ||
                    host.equals("cdn.jsdelivr.net")) {
                    return false;
                }
                if ("https".equals(uri.getScheme()) &&
                    (host.contains("google.com") || host.contains("accounts.google"))) {
                    try { startActivity(new Intent(Intent.ACTION_VIEW, uri)); }
                    catch (Exception ignored) {}
                    return true;
                }
                return false;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                if (uploadCallback != null) uploadCallback.onReceiveValue(null);
                uploadCallback = callback;
                Intent intent = params.createIntent();
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                    return true;
                } catch (Exception e) {
                    uploadCallback = null;
                    return false;
                }
            }
        });
        setContentView(webView);
        if (savedInstanceState == null) {
            Uri callback = getIntent() == null ? null : getIntent().getData();
            if (isOAuthCallback(callback)) openOAuthCallback(callback);
            else webView.loadUrl(APP_URL);
        } else webView.restoreState(savedInstanceState);
    }

    private boolean isOAuthCallback(Uri uri) {
        return uri != null && "nexap".equals(uri.getScheme())
                && "auth".equals(uri.getHost()) && "/callback".equals(uri.getPath());
    }

    // Supabase JS processes OAuth tokens from the fragment of an HTTPS page.
    // Never navigate the WebView directly to the custom nexap:// scheme.
    private void openOAuthCallback(Uri callback) {
        if (webView == null || !isOAuthCallback(callback)) return;
        Uri webCallback = Uri.parse(APP_URL).buildUpon()
                .encodedFragment(callback.getEncodedFragment())
                .build();
        webView.post(() -> webView.loadUrl(webCallback.toString()));
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        Uri callback = intent == null ? null : intent.getData();
        if (webView != null && isOAuthCallback(callback)) {
            openOAuthCallback(callback);
        }
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == FILE_CHOOSER_REQUEST && uploadCallback != null) {
            Uri[] result = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
            uploadCallback.onReceiveValue(result);
            uploadCallback = null;
        }
    }

    @Override
    protected void onSaveInstanceState(Bundle outState) {
        super.onSaveInstanceState(outState);
        if (webView != null) webView.saveState(outState);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
