#!/usr/bin/env python3
"""CI 中重写 Android 的窗口装饰：沉浸式状态栏（透明 + insets 内边距，不遮挡内容）。

做三件事：
1. 覆盖 tauri icon 生成的 mipmap 图标
2. 应用名改成「墨屿写作」
3. 状态栏/导航栏透明，内容用 systemBars insets 让开，避免遮挡
"""
import pathlib
import re
import shutil
import sys

GEN = pathlib.Path("src-tauri/gen/android")
MARK_BEGIN = "// moyu-safe-area begin"
MARK_END = "// moyu-safe-area end"

IMMERSIVE = f"""{MARK_BEGIN}
    androidx.core.view.WindowCompat.setDecorFitsSystemWindows(window, false)
    window.statusBarColor = android.graphics.Color.TRANSPARENT
    window.navigationBarColor = android.graphics.Color.TRANSPARENT
    window.setBackgroundDrawable(
      android.graphics.drawable.ColorDrawable(android.graphics.Color.parseColor("#F4F6FC"))
    )
    val moyuCtrl = androidx.core.view.WindowCompat.getInsetsController(window, window.decorView)
    moyuCtrl.isAppearanceLightStatusBars = true
    moyuCtrl.isAppearanceLightNavigationBars = true
    val moyuRoot = findViewById<android.view.ViewGroup>(android.R.id.content)
    androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(moyuRoot) {{ view, insets ->
      val bars = androidx.core.view.WindowInsetsCompat
        .toWindowInsetsCompat(insets, view)
        .getInsets(androidx.core.view.WindowInsetsCompat.Type.systemBars())
      view.setPadding(bars.left, bars.top, bars.right, bars.bottom)
      insets
    }}
    androidx.core.view.ViewCompat.requestApplyInsets(moyuRoot)
    {MARK_END}"""


def find_main_activity():
    for p in GEN.rglob("MainActivity.kt"):
        return p
    for p in GEN.rglob("*.kt"):
        if "class MainActivity" in p.read_text(encoding="utf-8"):
            return p
    return None


def patch_icons():
    src_icons = pathlib.Path("src-tauri/icons/android")
    res_dst = GEN / "app/src/main/res"
    if not src_icons.is_dir():
        print("!! 未找到 src-tauri/icons/android")
        return
    for item in sorted(src_icons.iterdir()):
        if item.is_dir():
            shutil.copytree(item, res_dst / item.name, dirs_exist_ok=True)
        else:
            shutil.copy2(item, res_dst / item.name)
    print(f"[patch] 已覆盖 Android 图标: {sorted(p.name for p in src_icons.iterdir())}")


def patch_app_name():
    for v in GEN.rglob("strings.xml"):
        if "values/strings.xml" in str(v).replace("\\", "/"):
            txt = v.read_text(encoding="utf-8")
            if 'name="app_name"' in txt and "墨屿写作" not in txt:
                txt = re.sub(r'<string name="app_name">[^<]*</string>',
                             '<string name="app_name">墨屿写作</string>', txt)
                v.write_text(txt, encoding="utf-8")
                print(f"[patch] 应用名已改为 墨屿写作: {v}")
            break


def patch_window(f):
    src = f.read_text(encoding="utf-8")
    print(f"[patch] 目标文件: {f}")

    if MARK_BEGIN in src:
        src = re.sub(r"[^\n]*// moyu-safe-area begin.*?// moyu-safe-area end",
                     IMMERSIVE, src, flags=re.S)
        print("[patch] 已替换为沉浸式状态栏配置")
    else:
        src = re.sub(r"^[ \t]*enableEdgeToEdge\(\)[ \t]*\r?\n", "", src, flags=re.M)
        anchor = "super.onCreate(savedInstanceState)"
        if anchor not in src:
            print("!! 未找到 onCreate 锚点")
            return False
        src = src.replace(anchor, anchor + "\n" + IMMERSIVE, 1)
        print("[patch] 已插入沉浸式状态栏配置")
    f.write_text(src, encoding="utf-8")
    return True


def main():
    f = find_main_activity()
    if f is None:
        print("!! 未找到 MainActivity.kt")
        return 1
    patch_icons()
    patch_app_name()
    if not patch_window(f):
        return 1
    print("---- 关键行 ----")
    for line in f.read_text(encoding="utf-8").splitlines():
        if any(k in line for k in ("class MainActivity", "onCreate", "setDecorFits",
                                   "statusBarColor", "moyu-safe-area")):
            print("   ", line.strip())
    return 0


if __name__ == "__main__":
    sys.exit(main())
