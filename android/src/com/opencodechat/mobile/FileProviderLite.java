package com.opencodechat.mobile;

import android.content.ContentProvider;
import android.content.ContentValues;
import android.database.Cursor;
import android.net.Uri;
import android.os.ParcelFileDescriptor;

import java.io.File;
import java.io.FileNotFoundException;

/**
 * 极简 ContentProvider：把 App 私有缓存目录（cache/share）里的文件以
 * content:// 形式暴露给系统分享面板，避免 FileUriExposedException。
 * 仅本 App 可用（exported=false），分享时按 Intent 授予临时读权限。
 */
public class FileProviderLite extends ContentProvider {
    public static final String AUTHORITY = "com.opencodechat.mobile.files";
    private static final String DIR = "share";

    public static Uri uriFor(String name) {
        return Uri.parse("content://" + AUTHORITY + "/" + safeName(name));
    }

    /** 只保留文件名本身并过滤非法字符，防止路径穿越。 */
    public static String safeName(String name) {
        String n = String.valueOf(name == null ? "file" : name).replace('\\', '/');
        int slash = n.lastIndexOf('/');
        if (slash >= 0) n = n.substring(slash + 1);
        n = n.replaceAll("[^A-Za-z0-9._\\-\\u4e00-\\u9fa5]", "_");
        if (n.isEmpty() || n.equals(".") || n.equals("..")) n = "file";
        if (n.length() > 120) n = n.substring(n.length() - 120);
        return n;
    }

    private File resolve(Uri uri) {
        String name = safeName(uri.getLastPathSegment());
        File dir = new File(getContext().getCacheDir(), DIR);
        if (!dir.exists()) dir.mkdirs();
        return new File(dir, name);
    }

    @Override
    public boolean onCreate() {
        return true;
    }

    @Override
    public ParcelFileDescriptor openFile(Uri uri, String mode) throws FileNotFoundException {
        int flags = (mode != null && mode.contains("w"))
                ? (ParcelFileDescriptor.MODE_READ_WRITE
                | ParcelFileDescriptor.MODE_CREATE
                | ParcelFileDescriptor.MODE_TRUNCATE)
                : ParcelFileDescriptor.MODE_READ_ONLY;
        return ParcelFileDescriptor.open(resolve(uri), flags);
    }

    @Override
    public String getType(Uri uri) {
        return null;
    }

    @Override
    public Cursor query(Uri uri, String[] projection, String selection,
                        String[] selectionArgs, String sortOrder) {
        return null;
    }

    @Override
    public Uri insert(Uri uri, ContentValues values) {
        return null;
    }

    @Override
    public int delete(Uri uri, String selection, String[] selectionArgs) {
        return 0;
    }

    @Override
    public int update(Uri uri, ContentValues values, String selection, String[] selectionArgs) {
        return 0;
    }
}
