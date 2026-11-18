#!/usr/bin/env python3
"""在 CI 中修复 Android 状态栏遮挡：关闭 Tauri 模板默认的 edge-to-edge。"""
import pathlib
import re
import shutil
import sys

GEN = pathlib.Path("src-tauri/gen/android")
DISABLED = (
    "// moyu-safe-area begin\n"
    "    androidx.core.view.WindowCompat.setDecorFitsSystemWindows(window, true)\n"
    "    // moyu-safe-area end"
)


def find_main_activity():
    for p in GEN.rglob("MainActivity.kt"):
        return p
    for p in GEN.rglob("*.kt"):
        if "class MainActivity" in p.read_text(encoding="utf-8"):
            return p
    return None


def main():
    f = find_main_activity()
    if f is None:
        print("!! 未找到 MainActivity.kt")
        return 1
    src = f.read_text(encoding="utf-8")
    print(f"[patch] 目标文件: {f}")

    # 1) 应用图标：把 tauri icon 生成的 mipmap 覆盖到工程里
    src_icons = pathlib.Path("src-tauri/icons/android")
    res_dst = GEN / "app/src/main/res"
    if src_icons.is_dir():
        for item in sorted(src_icons.iterdir()):
            if item.is_dir():
                shutil.copytree(item, res_dst / item.name, dirs_exist_ok=True)
            else:
                shutil.copy2(item, res_dst / item.name)
        print(f"[patch] 已覆盖 Android 图标: {sorted(p.name for p in src_icons.iterdir())}")
    else:
        print("!! 未找到 src-tauri/icons/android")

    if "setDecorFitsSystemWindows" in src:
        print("[patch] 已存在处理，跳过")
        return 0

    if "enableEdgeToEdge()" in src:
        # 删掉 enableEdgeToEdge 那一行，避免和 setDecorFits 冲突
        src = re.sub(r"^[ \t]*enableEdgeToEdge\(\)[ \t]*\r?\n", "", src, flags=re.M)
        print("[patch] 已移除 enableEdgeToEdge() 调用")

    anchor = "super.onCreate(savedInstanceState)"
    if anchor not in src:
        print("!! 未找到 onCreate 锚点，跳过")
        return 1

    src = src.replace(anchor, anchor + "\n    " + DISABLED, 1)
    f.write_text(src, encoding="utf-8")
    print("[patch] 已在 super.onCreate 之后插入 setDecorFitsSystemWindows(true)")

    # 应用显示名改成中文（Android 桌面图标下方文字）
    for v in GEN.rglob("strings.xml"):
        if "values/strings.xml" in str(v).replace("\\", "/"):
            txt = v.read_text(encoding="utf-8")
            if 'name="app_name"' in txt and "墨屿写作" not in txt:
                import re as _re
                txt = _re.sub(r'<string name="app_name">[^<]*</string>',
                              '<string name="app_name">墨屿写作</string>', txt)
                v.write_text(txt, encoding="utf-8")
                print(f"[patch] 应用名已改为 墨屿写作: {v}")
            break

    print("---- 修改后关键行 ----")
    for line in src.splitlines():
        if any(k in line for k in ("class MainActivity", "onCreate", "EdgeToEdge", "setDecorFits")):
            print("   ", line.strip())
    return 0


if __name__ == "__main__":
    sys.exit(main())
