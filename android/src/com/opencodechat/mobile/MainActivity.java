package com.opencodechat.mobile;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.res.Configuration;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.MediaStore;
import android.text.InputType;
import android.util.Base64;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.CheckBox;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.RadioButton;
import android.widget.RadioGroup;
import android.widget.ScrollView;
import android.widget.TextView;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.List;

public class MainActivity extends Activity {
    private static final String PREFS = "ocapp";
    private static final String KEY_HOST = "host";
    private static final String KEY_PW = "pw";
    private static final String KEY_CRASH = "last_crash";
    private static final String KEY_THEME = "theme";      // auto / light / dark
    private static final String KEY_FONT = "font";        // 12..22 px
    private static final String KEY_AWAKE = "awake";      // bool
    private static final String KEY_IMMERSIVE = "immersive"; // bool
    private static final String KEY_PORT = "port";        // 默认端口预设
    private static final String KEY_RECENT = "recent";    // 最近地址（换行分隔）
    private static final int REQ_FILE = 1001;
    private static final int DEFAULT_PORT = 8000;
    private static final int DARK_BG = 0xFF202123;
    private static final int LIGHT_BG = 0xFFF6F7F8;

    private FrameLayout root;
    private WebView web;
    private LinearLayout setup;
    private EditText setupHostEt;
    private EditText setupPortEt;
    private LinearLayout setupRecentBox;
    private FrameLayout fullscreenBox;
    private View customView;
    private WebChromeClient.CustomViewCallback customCallback;
    private WebChromeClient chrome;
    private ValueCallback<Uri[]> filePathCallback;
    private Uri pendingCaptureUri;
    private JsBridge bridge;
    private int lastImeBottom = -1;

    @Override
    protected void onCreate(Bundle b) {
        super.onCreate(b);
        installCrashHandler();
        try {
            applyKeepAwakeFlag();
            applyImmersive();

            String last = prefs().getString(KEY_CRASH, "");
            if (last != null && !last.isEmpty()) {
                prefs().edit().remove(KEY_CRASH).apply();
                showCrashText(last, true);
                return;
            }

            buildUi();
            String host = prefs().getString(KEY_HOST, "");
            if (host == null || host.trim().isEmpty()) {
                showSetup();
            } else {
                int p = portOf(host);
                if (p > 0) setPortPref(p);
                openHost(host, false);
            }
        } catch (Throwable t) {
            showCrashText(crashText(t), true);
        }
    }

    private void installCrashHandler() {
        final Thread.UncaughtExceptionHandler def = Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((thread, ex) -> {
            try {
                prefs().edit().putString(KEY_CRASH, crashText(ex)).apply();
            } catch (Throwable ignored) {
            }
            if (def != null) def.uncaughtException(thread, ex);
        });
    }

    private String crashText(Throwable t) {
        StringBuilder sb = new StringBuilder();
        sb.append(t.toString()).append("\n\n");
        StackTraceElement[] st = t.getStackTrace();
        for (int i = 0; i < st.length && i < 30; i++) sb.append("  at ").append(st[i]).append("\n");
        Throwable c = t.getCause();
        while (c != null) {
            sb.append("\nCaused by: ").append(c).append("\n");
            StackTraceElement[] cs = c.getStackTrace();
            for (int i = 0; i < cs.length && i < 15; i++) sb.append("  at ").append(cs[i]).append("\n");
            c = c.getCause();
        }
        return sb.toString();
    }

    private void showCrashText(final String text, final boolean retry) {
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setBackgroundColor(Color.BLACK);

        TextView tip = new TextView(this);
        tip.setText("出错了（可复制/分享下面内容反馈）：");
        tip.setTextColor(0xFFFFC107);
        tip.setTextSize(13);
        tip.setPadding(dp(16), dp(16), dp(16), dp(6));
        box.addView(tip);

        ScrollView sv = new ScrollView(this);
        TextView tv = new TextView(this);
        tv.setText(text);
        tv.setTextColor(0xFFFF6B6B);
        tv.setTextSize(11);
        tv.setTextIsSelectable(true);
        tv.setPadding(dp(16), 0, dp(16), dp(10));
        sv.addView(tv);
        box.addView(sv, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, 0, 1f));

        LinearLayout row = new LinearLayout(this);
        row.setGravity(Gravity.CENTER);
        row.setPadding(dp(10), dp(8), dp(10), dp(14));

        Button share = new Button(this);
        share.setText("分享错误");
        share.setOnClickListener(v -> {
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType("text/plain");
            i.putExtra(Intent.EXTRA_SUBJECT, "opencode chat 崩溃");
            i.putExtra(Intent.EXTRA_TEXT, "opencode chat crash\n" + text);
            try {
                startActivity(Intent.createChooser(i, "分享"));
            } catch (Exception ignored) {
            }
        });
        row.addView(share);

        if (retry) {
            Button again = new Button(this);
            again.setText("重试");
            again.setOnClickListener(v -> {
                Intent i = new Intent(this, MainActivity.class);
                i.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP);
                startActivity(i);
                finish();
            });
            row.addView(again);
        }

        Button quit = new Button(this);
        quit.setText("退出");
        quit.setOnClickListener(v -> finish());
        row.addView(quit);

        box.addView(row);
        setContentView(box);
    }

    private void buildUi() {
        root = new FrameLayout(this);
        root.setBackgroundColor(themeBackground());

        web = new WebView(this);
        web.setBackgroundColor(themeBackground());
        root.addView(web, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        fullscreenBox = new FrameLayout(this);
        fullscreenBox.setBackgroundColor(Color.BLACK);
        fullscreenBox.setVisibility(View.GONE);
        root.addView(fullscreenBox, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        setup = buildSetup();
        root.addView(setup, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));

        setContentView(root);
        configureWeb();
        installImeInsets();
        applyNativeTheme();
    }

    /* 软键盘：监听 IME insets，把 WebView 底边抬高，避免输入栏被键盘遮挡。
       edge-to-edge（decorFitsSystemWindows=false）下 WebView 自身不会 resize，
       visualViewport 在部分机型/WebView 也不上报键盘，因此这里从原生兜底。 */
    private void installImeInsets() {
        if (Build.VERSION.SDK_INT < 30 || root == null) return;
        root.setOnApplyWindowInsetsListener((v, insets) -> {
            int ime = insets.getInsets(WindowInsets.Type.ime()).bottom;
            applyWebBottomInset(ime);
            return insets;
        });
        root.requestApplyInsets();
    }

    private void applyWebBottomInset(final int bottom) {
        final int want = Math.max(0, bottom);
        if (want == lastImeBottom) return;
        lastImeBottom = want;
        runOnUiThread(() -> {
            if (web == null) return;
            ViewGroup.LayoutParams lp = web.getLayoutParams();
            if (!(lp instanceof FrameLayout.LayoutParams)) return;
            FrameLayout.LayoutParams flp = (FrameLayout.LayoutParams) lp;
            if (flp.bottomMargin == want) return;
            flp.bottomMargin = want;
            web.setLayoutParams(flp);
        });
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private int dp(int v) {
        return Math.round(getResources().getDisplayMetrics().density * v);
    }

    private LinearLayout buildSetup() {
        ScrollView scroll = new ScrollView(this);
        scroll.setBackgroundColor(0xFF202123);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        box.setGravity(Gravity.CENTER_HORIZONTAL);
        int pad = dp(24);
        box.setPadding(pad, dp(36), pad, dp(28));
        box.setBackgroundColor(0xFF202123);

        TextView title = new TextView(this);
        title.setText("opencode chat");
        title.setTextColor(Color.WHITE);
        title.setTextSize(22);
        title.setGravity(Gravity.CENTER);
        box.addView(title);

        TextView hint = new TextView(this);
        hint.setText("输入电脑的局域网 IP（端口用下面的预设，无需重复填写）");
        hint.setTextColor(0xFF9AA0A6);
        hint.setTextSize(13);
        hint.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams hp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        hp.topMargin = dp(10);
        box.addView(hint, hp);

        String saved = prefs().getString(KEY_HOST, "");
        String savedHostOnly = hostOnly(saved);

        // 主机 + 端口
        LinearLayout hostRow = new LinearLayout(this);
        hostRow.setOrientation(LinearLayout.HORIZONTAL);
        hostRow.setGravity(Gravity.CENTER_VERTICAL);
        LinearLayout.LayoutParams hrp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        hrp.topMargin = dp(16);
        hostRow.setLayoutParams(hrp);

        setupHostEt = new EditText(this);
        setupHostEt.setHint("192.168.1.5");
        setupHostEt.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        setupHostEt.setTextColor(Color.WHITE);
        setupHostEt.setHintTextColor(0xFF6B7075);
        if (savedHostOnly != null && !savedHostOnly.isEmpty()) setupHostEt.setText(savedHostOnly);
        hostRow.addView(setupHostEt, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));

        setupPortEt = new EditText(this);
        setupPortEt.setHint(String.valueOf(DEFAULT_PORT));
        setupPortEt.setInputType(InputType.TYPE_CLASS_NUMBER);
        setupPortEt.setGravity(Gravity.CENTER);
        setupPortEt.setTextColor(Color.WHITE);
        setupPortEt.setHintTextColor(0xFF6B7075);
        setupPortEt.setText(String.valueOf(portPref()));
        LinearLayout.LayoutParams portLp = new LinearLayout.LayoutParams(dp(84), ViewGroup.LayoutParams.WRAP_CONTENT);
        portLp.leftMargin = dp(8);
        hostRow.addView(setupPortEt, portLp);
        box.addView(hostRow);

        final EditText pw = new EditText(this);
        pw.setHint("访问密码（可选，用于自动登录）");
        pw.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_PASSWORD);
        pw.setTextColor(Color.WHITE);
        pw.setHintTextColor(0xFF6B7075);
        String savedPw = prefs().getString(KEY_PW, "");
        if (savedPw != null) pw.setText(savedPw);
        LinearLayout.LayoutParams lp2 = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp2.topMargin = dp(10);
        box.addView(pw, lp2);

        Button connect = new Button(this);
        connect.setText("连接");
        LinearLayout.LayoutParams lp3 = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp3.topMargin = dp(18);
        connect.setLayoutParams(lp3);
        connect.setOnClickListener(v -> {
            String h = normalizeHost(setupHostEt.getText().toString(), parsePort(setupPortEt.getText().toString()));
            if (h.isEmpty()) {
                Toast.makeText(this, "请输入地址", Toast.LENGTH_SHORT).show();
                return;
            }
            int used = portOf(h);
            if (used > 0) setPortPref(used);
            prefs().edit().putString(KEY_HOST, h).putString(KEY_PW, pw.getText().toString()).apply();
            addRecentHost(h);
            openHost(h, true);
        });
        box.addView(connect);

        // 最近使用的地址（一键连接）
        setupRecentBox = new LinearLayout(this);
        setupRecentBox.setOrientation(LinearLayout.VERTICAL);
        LinearLayout.LayoutParams rbp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        rbp.topMargin = dp(14);
        box.addView(setupRecentBox, rbp);

        Button settings = new Button(this);
        settings.setText("设置");
        LinearLayout.LayoutParams lp5 = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp5.topMargin = dp(10);
        settings.setLayoutParams(lp5);
        settings.setOnClickListener(v -> showSettingsDialog());
        box.addView(settings);

        TextView tip = new TextView(this);
        tip.setText("提示：地址会自动记住；按返回键可重新设置地址或打开设置");
        tip.setTextColor(0xFF9AA0A6);
        tip.setTextSize(12);
        tip.setGravity(Gravity.CENTER);
        LinearLayout.LayoutParams lp4 = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp4.topMargin = dp(16);
        box.addView(tip, lp4);

        scroll.addView(box, new ScrollView.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        LinearLayout wrap = new LinearLayout(this);
        wrap.addView(scroll, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        return wrap;
    }

    private int parsePort(String raw) {
        try {
            int p = Integer.parseInt(String.valueOf(raw).trim());
            if (p >= 1 && p <= 65535) return p;
        } catch (Exception e) { /* ignore */ }
        return portPref();
    }

    private int portPref() {
        try {
            int p = prefs().getInt(KEY_PORT, DEFAULT_PORT);
            return (p >= 1 && p <= 65535) ? p : DEFAULT_PORT;
        } catch (Exception e) {
            return DEFAULT_PORT;
        }
    }

    private void setPortPref(int p) {
        if (p >= 1 && p <= 65535) prefs().edit().putInt(KEY_PORT, p).apply();
    }

    private String hostOnly(String full) {
        try {
            Uri u = Uri.parse(String.valueOf(full));
            String h = u.getHost();
            return h == null ? "" : h;
        } catch (Exception e) {
            return "";
        }
    }

    private int portOf(String full) {
        try {
            return Uri.parse(String.valueOf(full)).getPort();
        } catch (Exception e) {
            return -1;
        }
    }

    private List<String> recentHosts() {
        List<String> out = new ArrayList<>();
        String raw = prefs().getString(KEY_RECENT, "");
        if (raw != null && !raw.isEmpty()) {
            for (String s : raw.split("\n")) {
                String v = s.trim();
                if (!v.isEmpty()) out.add(v);
            }
        }
        return out;
    }

    private void addRecentHost(String host) {
        if (host == null || host.isEmpty()) return;
        List<String> list = recentHosts();
        list.remove(host);
        list.add(0, host);
        while (list.size() > 5) list.remove(list.size() - 1);
        StringBuilder sb = new StringBuilder();
        for (String h : list) {
            if (sb.length() > 0) sb.append('\n');
            sb.append(h);
        }
        prefs().edit().putString(KEY_RECENT, sb.toString()).apply();
    }

    private void renderRecentHosts() {
        if (setupRecentBox == null) return;
        setupRecentBox.removeAllViews();
        final List<String> list = recentHosts();
        if (list.isEmpty()) {
            setupRecentBox.setVisibility(View.GONE);
            return;
        }
        setupRecentBox.setVisibility(View.VISIBLE);
        TextView label = new TextView(this);
        label.setText("最近使用");
        label.setTextColor(0xFF9AA0A6);
        label.setTextSize(12);
        label.setPadding(0, 0, 0, dp(2));
        setupRecentBox.addView(label);
        for (final String h : list) {
            Button b = new Button(this);
            b.setText(h);
            b.setTextSize(12);
            b.setAllCaps(false);
            LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
            lp.topMargin = dp(6);
            b.setLayoutParams(lp);
            b.setOnClickListener(v -> {
                int p = portOf(h);
                if (p > 0) setPortPref(p);
                prefs().edit().putString(KEY_HOST, h).apply();
                addRecentHost(h);
                openHost(h, true);
            });
            setupRecentBox.addView(b);
        }
    }

    private String normalizeHost(String raw, int defPort) {
        String s = raw == null ? "" : raw.trim();
        if (s.isEmpty()) return "";
        if (!s.matches("(?i)^https?://.*")) s = "http://" + s;
        while (s.endsWith("/")) s = s.substring(0, s.length() - 1);
        try {
            Uri u = Uri.parse(s);
            if (u.getPort() == -1) s = s + ":" + (defPort > 0 ? defPort : DEFAULT_PORT);
        } catch (Exception e) {
            /* ignore */
        }
        return s + "/";
    }

    private void showSetup() {
        renderRecentHosts();
        setup.setVisibility(View.VISIBLE);
        web.setVisibility(View.GONE);
    }

    private void openHost(String h, boolean reload) {
        setup.setVisibility(View.GONE);
        web.setVisibility(View.VISIBLE);
        String cur = web.getUrl();
        if (!reload && cur != null && cur.startsWith(h)) {
            return;
        }
        web.loadUrl(h);
    }

    private void configureWeb() {
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        try {
            s.setDatabaseEnabled(true);
        } catch (Throwable ignored) {
        }
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        try {
            s.setMediaPlaybackRequiresUserGesture(false);
        } catch (Throwable ignored) {
        }
        try {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        } catch (Throwable ignored) {
        }
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        CookieManager.getInstance().setAcceptCookie(true);
        try {
            CookieManager.getInstance().setAcceptThirdPartyCookies(web, true);
        } catch (Throwable ignored) {
        }

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView v, WebResourceRequest req) {
                return handleUrl(req.getUrl().toString());
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView v, String url) {
                return handleUrl(url);
            }

            @Override
            public void onPageFinished(WebView v, String url) {
                injectNativeSettings();
                injectAutoLogin();
            }
        });

        bridge = new JsBridge();
        web.addJavascriptInterface(bridge, "OCAndroid");

        web.setDownloadListener((url, userAgent, contentDisposition, mimetype, contentLength) -> {
            if (url == null) return;
            if (url.startsWith("blob:") || url.startsWith("data:")) {
                // 由网页侧调用 OCAndroid.saveDataUrl 保存/分享，这里只做提示。
                showToast("请用图片查看器里的「保存 / 分享」按钮");
                return;
            }
            openExternalUrl(url);
        });

        chrome = new WebChromeClient() {
            @Override
            public void onShowCustomView(View view, CustomViewCallback callback) {
                if (customView != null) {
                    callback.onCustomViewHidden();
                    return;
                }
                customView = view;
                customCallback = callback;
                fullscreenBox.addView(view);
                fullscreenBox.setVisibility(View.VISIBLE);
                web.setVisibility(View.GONE);
                applyImmersive();
            }

            @Override
            public void onHideCustomView() {
                if (customView == null) return;
                fullscreenBox.removeView(customView);
                fullscreenBox.setVisibility(View.GONE);
                web.setVisibility(View.VISIBLE);
                customView = null;
                if (customCallback != null) {
                    customCallback.onCustomViewHidden();
                    customCallback = null;
                }
                applyImmersive();
            }

            @Override
            public boolean onShowFileChooser(WebView v, ValueCallback<Uri[]> cb,
                                             FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = cb;
                try {
                    // 带 capture 的输入（网页「拍照上传」）优先直接调用相机。
                    if (params.isCaptureEnabled()) {
                        Intent capture = buildCaptureIntent();
                        if (capture != null) {
                            startActivityForResult(capture, REQ_FILE);
                            return true;
                        }
                    }
                    Intent i = params.createIntent();
                    i.addCategory(Intent.CATEGORY_OPENABLE);
                    if (params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE) {
                        i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                    }
                    startActivityForResult(Intent.createChooser(i, "选择文件"), REQ_FILE);
                    return true;
                } catch (Exception e) {
                    pendingCaptureUri = null;
                    filePathCallback = null;
                    return false;
                }
            }
        };
        web.setWebChromeClient(chrome);
    }

    private boolean handleUrl(String url) {
        if (url == null) return false;
        if (url.startsWith("http://") || url.startsWith("https://")) return false;
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception e) {
            /* ignore */
        }
        return true;
    }

    /** 用系统相机拍照，写入 App 私有目录（经 FileProviderLite 暴露为 content://）。 */
    private Intent buildCaptureIntent() {
        try {
            File dir = new File(getCacheDir(), "share");
            if (!dir.exists() && !dir.mkdirs()) return null;
            String name = "capture_" + System.currentTimeMillis() + ".jpg";
            File out = new File(dir, FileProviderLite.safeName(name));
            if (!out.exists() && !out.createNewFile()) return null;
            pendingCaptureUri = FileProviderLite.uriFor(name);
            Intent ci = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            ci.putExtra(MediaStore.EXTRA_OUTPUT, pendingCaptureUri);
            ci.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (ci.resolveActivity(getPackageManager()) == null) {
                pendingCaptureUri = null;
                return null;
            }
            return ci;
        } catch (Exception e) {
            pendingCaptureUri = null;
            return null;
        }
    }

    /* ==================== 原生设置（暗色模式 / 字号 / 常亮 / 沉浸） ==================== */

    private String themePref() {
        String v = prefs().getString(KEY_THEME, "auto");
        return "dark".equals(v) || "light".equals(v) ? v : "auto";
    }

    private int fontPref() {
        try {
            int v = prefs().getInt(KEY_FONT, 15);
            return Math.min(22, Math.max(12, v));
        } catch (Exception e) {
            return 15;
        }
    }

    private boolean awakePref() {
        return prefs().getBoolean(KEY_AWAKE, true);
    }

    private boolean immersivePref() {
        return prefs().getBoolean(KEY_IMMERSIVE, true);
    }

    private boolean systemDark() {
        int mode = getResources().getConfiguration().uiMode & Configuration.UI_MODE_NIGHT_MASK;
        return mode == Configuration.UI_MODE_NIGHT_YES;
    }

    private boolean resolveDark() {
        String t = themePref();
        if ("dark".equals(t)) return true;
        if ("light".equals(t)) return false;
        return systemDark();
    }

    private int themeBackground() {
        return resolveDark() ? DARK_BG : LIGHT_BG;
    }

    private void applyKeepAwakeFlag() {
        if (awakePref()) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
    }

    private void applyNativeTheme() {
        final boolean dark = resolveDark();
        runOnUiThread(() -> {
            int bg = dark ? DARK_BG : LIGHT_BG;
            if (root != null) root.setBackgroundColor(bg);
            if (web != null) web.setBackgroundColor(bg);
            if (immersivePref()) applyImmersive();
            else applySystemBarAppearance(dark);
        });
    }

    private void applySystemBarAppearance(boolean dark) {
        try {
            Window w = getWindow();
            if (Build.VERSION.SDK_INT >= 30) {
                WindowInsetsController c = w.getInsetsController();
                if (c != null) {
                    int mask = WindowInsetsController.APPEARANCE_LIGHT_STATUS_BARS
                            | WindowInsetsController.APPEARANCE_LIGHT_NAVIGATION_BARS;
                    c.setSystemBarsAppearance(dark ? 0 : mask, mask);
                }
            } else {
                int flags = w.getDecorView().getSystemUiVisibility();
                if (dark) flags &= ~View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                else flags |= View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
                w.getDecorView().setSystemUiVisibility(flags);
            }
            w.setStatusBarColor(dark ? Color.BLACK : LIGHT_BG);
            w.setNavigationBarColor(dark ? Color.BLACK : LIGHT_BG);
        } catch (Throwable ignored) {
        }
    }

    private void injectNativeSettings() {
        if (web == null) return;
        web.evaluateJavascript(
                "(function(){try{if(typeof applyNativeSettings==='function')applyNativeSettings();}catch(e){}})();",
                null);
    }

    private String settingsJson() {
        try {
            JSONObject o = new JSONObject();
            o.put("theme", resolveDark() ? "dark" : "light");
            o.put("themePref", themePref());
            o.put("fontSize", fontPref());
            o.put("keepAwake", awakePref());
            o.put("immersive", immersivePref());
            return o.toString();
        } catch (Exception e) {
            return "{}";
        }
    }

    private void showSettingsDialog() {
        ScrollView sv = new ScrollView(this);
        LinearLayout box = new LinearLayout(this);
        box.setOrientation(LinearLayout.VERTICAL);
        int pad = dp(20);
        box.setPadding(pad, dp(8), pad, dp(8));

        box.addView(sectionLabel("暗色模式"));
        final RadioGroup themeGroup = new RadioGroup(this);
        themeGroup.setOrientation(RadioGroup.VERTICAL);
        final String[] themeVals = {"auto", "light", "dark"};
        final String[] themeLabels = {"跟随系统", "亮色", "暗色"};
        String curTheme = themePref();
        for (int i = 0; i < themeVals.length; i++) {
            RadioButton rb = new RadioButton(this);
            rb.setText(themeLabels[i]);
            rb.setId(View.generateViewId());
            rb.setTag(themeVals[i]);
            themeGroup.addView(rb);
            if (themeVals[i].equals(curTheme)) rb.setChecked(true);
        }
        themeGroup.setOnCheckedChangeListener((g, id) -> {
            View v = g.findViewById(id);
            Object tag = v == null ? null : v.getTag();
            String val = tag == null ? "auto" : tag.toString();
            prefs().edit().putString(KEY_THEME, val).apply();
            applyNativeTheme();
            injectNativeSettings();
        });
        box.addView(themeGroup);

        box.addView(sectionLabel("字号"));
        final RadioGroup fontGroup = new RadioGroup(this);
        fontGroup.setOrientation(RadioGroup.VERTICAL);
        final int[] fontVals = {13, 15, 18};
        final String[] fontLabels = {"小", "标准", "大"};
        int curFont = fontPref();
        for (int i = 0; i < fontVals.length; i++) {
            RadioButton rb = new RadioButton(this);
            rb.setText(fontLabels[i]);
            rb.setId(View.generateViewId());
            rb.setTag(fontVals[i]);
            fontGroup.addView(rb);
            if (fontVals[i] == curFont) rb.setChecked(true);
        }
        fontGroup.setOnCheckedChangeListener((g, id) -> {
            View v = g.findViewById(id);
            Object tag = v == null ? null : v.getTag();
            int val = tag instanceof Integer ? (Integer) tag : 15;
            prefs().edit().putInt(KEY_FONT, val).apply();
            injectNativeSettings();
        });
        box.addView(fontGroup);

        box.addView(sectionLabel("显示"));
        final CheckBox awake = new CheckBox(this);
        awake.setText("保持屏幕常亮");
        awake.setChecked(awakePref());
        awake.setOnCheckedChangeListener((v, on) -> {
            prefs().edit().putBoolean(KEY_AWAKE, on).apply();
            applyKeepAwakeFlag();
        });
        box.addView(awake);

        final CheckBox immersive = new CheckBox(this);
        immersive.setText("沉浸全屏（隐藏状态栏 / 导航栏）");
        immersive.setChecked(immersivePref());
        immersive.setOnCheckedChangeListener((v, on) -> {
            prefs().edit().putBoolean(KEY_IMMERSIVE, on).apply();
            applyImmersive();
        });
        box.addView(immersive);

        box.addView(sectionLabel("默认端口"));
        LinearLayout portRow = new LinearLayout(this);
        portRow.setOrientation(LinearLayout.HORIZONTAL);
        portRow.setGravity(Gravity.CENTER_VERTICAL);
        final EditText portInput = new EditText(this);
        portInput.setInputType(InputType.TYPE_CLASS_NUMBER);
        portInput.setText(String.valueOf(portPref()));
        portRow.addView(portInput, new LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f));
        Button savePort = new Button(this);
        savePort.setText("保存");
        savePort.setOnClickListener(v -> {
            int p = parsePort(portInput.getText().toString());
            setPortPref(p);
            portInput.setText(String.valueOf(p));
            showToast("已保存默认端口 " + p);
            if (setupPortEt != null) setupPortEt.setText(String.valueOf(p));
        });
        portRow.addView(savePort, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT));
        box.addView(portRow);
        TextView portHint = new TextView(this);
        portHint.setText("「更换主机地址」时端口自动用此预设，无需重复填写。");
        portHint.setTextSize(11);
        portHint.setTextColor(0xFF9AA0A6);
        box.addView(portHint);

        box.addView(sectionLabel("操作"));
        final AlertDialog[] dlg = new AlertDialog[1];
        LinearLayout row = new LinearLayout(this);
        row.setOrientation(LinearLayout.VERTICAL);
        Button clear = new Button(this);
        clear.setText("清除缓存并刷新");
        clear.setOnClickListener(v -> {
            try {
                web.clearCache(true);
            } catch (Throwable ignored) {
            }
            web.reload();
        });
        row.addView(clear);
        Button reload = new Button(this);
        reload.setText("重新加载页面");
        reload.setOnClickListener(v -> web.reload());
        row.addView(reload);
        Button changeHost = new Button(this);
        changeHost.setText("更换主机地址");
        changeHost.setOnClickListener(v -> {
            if (dlg[0] != null) dlg[0].dismiss();
            showSetup();
        });
        row.addView(changeHost);
        box.addView(row);

        sv.addView(box);
        dlg[0] = new AlertDialog.Builder(this)
                .setTitle("设置")
                .setView(sv)
                .setPositiveButton("关闭", null)
                .create();
        dlg[0].show();
    }

    private TextView sectionLabel(String text) {
        TextView tv = new TextView(this);
        tv.setText(text);
        tv.setTextSize(12);
        tv.setTextColor(0xFF9AA0A6);
        LinearLayout.LayoutParams lp = new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT);
        lp.topMargin = dp(14);
        tv.setLayoutParams(lp);
        return tv;
    }

    private void showToast(final String msg) {
        runOnUiThread(() -> {
            try {
                Toast.makeText(this, msg, Toast.LENGTH_SHORT).show();
            } catch (Throwable ignored) {
            }
        });
    }

    /* ==================== 与网页的桥接（文件保存 / 分享 / 打开） ==================== */

    public class JsBridge {
        @JavascriptInterface
        public String getSettings() {
            return settingsJson();
        }

        @JavascriptInterface
        public void openSettings() {
            runOnUiThread(MainActivity.this::showSettingsDialog);
        }

        @JavascriptInterface
        public void openExternal(final String url) {
            if (!bridgeAllowed() || url == null) return;
            runOnUiThread(() -> openExternalUrl(url));
        }

        @JavascriptInterface
        public void shareText(final String text) {
            if (!bridgeAllowed() || text == null) return;
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType("text/plain");
                    i.putExtra(Intent.EXTRA_TEXT, text);
                    startActivity(Intent.createChooser(i, "分享"));
                } catch (Exception ignored) {
                }
            });
        }

        @JavascriptInterface
        public void toast(String text) {
            if (text != null) showToast(text);
        }

        @JavascriptInterface
        public void saveDataUrl(final String name, final String mime, final String dataUrl) {
            if (!bridgeAllowed() || dataUrl == null) return;
            new Thread(() -> {
                try {
                    String base64 = dataUrl;
                    int comma = dataUrl.indexOf(',');
                    if (comma >= 0) base64 = dataUrl.substring(comma + 1);
                    byte[] bytes = Base64.decode(base64, Base64.DEFAULT);
                    File dir = new File(getCacheDir(), "share");
                    if (!dir.exists() && !dir.mkdirs()) throw new Exception("无法创建临时目录");
                    String safe = FileProviderLite.safeName(name);
                    File out = new File(dir, safe);
                    FileOutputStream fos = new FileOutputStream(out);
                    fos.write(bytes);
                    fos.close();
                    final Uri uri = FileProviderLite.uriFor(safe);
                    runOnUiThread(() -> shareUri(uri, mime, safe));
                } catch (Throwable t) {
                    showToast("保存失败：" + t.getMessage());
                }
            }).start();
        }
    }

    private boolean bridgeAllowed() {
        try {
            if (web == null) return false;
            String url = web.getUrl();
            String host = prefs().getString(KEY_HOST, "");
            if (url == null || host == null || host.isEmpty()) return false;
            return url.startsWith(host);
        } catch (Throwable e) {
            return false;
        }
    }

    private void openExternalUrl(String url) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception e) {
            showToast("无法打开该链接");
        }
    }

    private void shareUri(Uri uri, String mime, String name) {
        try {
            Intent i = new Intent(Intent.ACTION_SEND);
            i.setType(mime == null || mime.isEmpty() ? "*/*" : mime);
            i.putExtra(Intent.EXTRA_STREAM, uri);
            i.putExtra(Intent.EXTRA_TITLE, name);
            i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            startActivity(Intent.createChooser(i, "保存 / 分享"));
        } catch (Exception e) {
            showToast("无法分享文件");
        }
    }

    private void injectAutoLogin() {
        String pw = prefs().getString(KEY_PW, "");
        if (pw == null || pw.isEmpty()) return;
        String js = "(function(){var p=" + jsStr(pw) + ";var n=0;var t=setInterval(function(){"
                + "var m=document.getElementById('remoteLoginMask');"
                + "var i=document.getElementById('remotePw');"
                + "var b=document.getElementById('remoteLoginBtn');"
                + "if(i&&b&&m&&m.classList&&m.classList.contains('show')){i.value=p;b.click();clearInterval(t);}"
                + "if(++n>60){clearInterval(t);}},500);})()";
        web.evaluateJavascript(js, null);
    }

    private String jsStr(String s) {
        StringBuilder sb = new StringBuilder("'");
        for (char c : s.toCharArray()) {
            if (c == '\\' || c == '\'') sb.append('\\');
            if (c == '\n') {
                sb.append("\\n");
                continue;
            }
            sb.append(c);
        }
        return sb.append("'").toString();
    }

    @Override
    protected void onActivityResult(int req, int res, Intent data) {
        super.onActivityResult(req, res, data);
        if (req == REQ_FILE) {
            Uri[] out = null;
            if (res == RESULT_OK) {
                if (data != null && data.getClipData() != null) {
                    int n = data.getClipData().getItemCount();
                    out = new Uri[n];
                    for (int i = 0; i < n; i++) out[i] = data.getClipData().getItemAt(i).getUri();
                } else if (data != null && data.getData() != null) {
                    out = new Uri[]{data.getData()};
                } else if (pendingCaptureUri != null) {
                    // 相机以 EXTRA_OUTPUT 写入，返回 data 为空，用预生成的 Uri。
                    out = new Uri[]{pendingCaptureUri};
                }
            }
            pendingCaptureUri = null;
            if (filePathCallback != null) {
                filePathCallback.onReceiveValue(out);
                filePathCallback = null;
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (customView != null) {
            if (chrome != null) chrome.onHideCustomView();
            return;
        }
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        new AlertDialog.Builder(this)
                .setTitle("opencode chat")
                .setItems(new String[]{"设置", "更换主机地址", "重新加载", "退出"}, (d, w) -> {
                    if (w == 0) showSettingsDialog();
                    else if (w == 1) showSetup();
                    else if (w == 2) web.reload();
                    else finish();
                })
                .show();
    }

    private void applyImmersive() {
        try {
            Window w = getWindow();
            boolean immersive = immersivePref();
            if (Build.VERSION.SDK_INT >= 30) {
                // 保持 edge-to-edge（false）以铺满屏幕；软键盘遮挡由网页端
                // visualViewport 动态压缩 #app 高度解决（见 mobile.js）。
                w.setDecorFitsSystemWindows(!immersive);
                WindowInsetsController c = w.getInsetsController();
                if (c != null) {
                    if (immersive) {
                        c.hide(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                        c.setSystemBarsBehavior(WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
                    } else {
                        c.show(WindowInsets.Type.statusBars() | WindowInsets.Type.navigationBars());
                    }
                }
            } else {
                int flags = immersive
                        ? (View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY)
                        : View.SYSTEM_UI_FLAG_LAYOUT_STABLE;
                w.getDecorView().setSystemUiVisibility(flags);
            }
            applySystemBarAppearance(resolveDark());
        } catch (Throwable ignored) {
        }
    }

    @Override
    public void onConfigurationChanged(Configuration newConfig) {
        super.onConfigurationChanged(newConfig);
        applyNativeTheme();
        injectNativeSettings();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus && immersivePref()) applyImmersive();
    }
}
