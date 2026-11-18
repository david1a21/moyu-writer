#!/usr/bin/env python3
"""在 CI 中修复 Android 状态栏遮挡：关闭 Tauri 模板默认的 edge-to-edge。"""
import pathlib
import re
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

    print("---- 修改后关键行 ----")
    for line in src.splitlines():
        if any(k in line for k in ("class MainActivity", "onCreate", "EdgeToEdge", "setDecorFits")):
            print("   ", line.strip())
    return 0


if __name__ == "__main__":
    sys.exit(main())
