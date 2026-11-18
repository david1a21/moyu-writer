#!/usr/bin/env python3
"""给 Tauri 生成的 Android MainActivity 打补丁：让 WebView 内容避开状态栏 / 刘海 / 底部手势条。"""
import glob
import os
import re
import sys

BEGIN = "    // == moyu-safe-area begin =="
END = "    // == moyu-safe-area end =="

SNIPPET = f'''{BEGIN}
    val moyuRootView = findViewById<android.view.View>(android.R.id.content)
    androidx.core.view.ViewCompat.setOnApplyWindowInsetsListener(moyuRootView) {{ v, insets ->
      val moyuBars = insets.getInsets(
        androidx.core.view.WindowInsetsCompat.Type.systemBars() or
          androidx.core.view.WindowInsetsCompat.Type.displayCutout()
      )
      v.setPadding(moyuBars.left, moyuBars.top, moyuBars.right, moyuBars.bottom)
      insets
    }}
{END}
'''


def patch_kotlin(path):
    src = open(path, encoding='utf-8').read()
    if BEGIN in src:
        print('已打过补丁，跳过')
        return True
    m = re.search(r'\n(\s*)super\.onCreate\(savedInstanceState\)', src)
    if not m:
        print('未找到 super.onCreate 调用')
        return False
    indent = m.group(1)
    insert_at = m.end()
    src = src[:insert_at] + '\n' + SNIPPET + src[insert_at:]
    open(path, 'w', encoding='utf-8').write(src)
    print('已注入安全区补丁:', path)
    return True


def main():
    root = 'src-tauri/gen/android'
    if not os.path.isdir(root):
        print('未找到 android 工程目录:', root)
        return 1
    files = glob.glob(f'{root}/app/src/main/java/**/MainActivity.kt', recursive=True)
    if not files:
        files = glob.glob(f'{root}/app/src/main/java/**/MainActivity.java', recursive=True)
        if files:
            print('当前为 Java 模板，尝试 Kotlin 补丁可能失败，改为跳过')
            return 0
    if not files:
        print('未找到 MainActivity')
        return 1
    for f in files:
        if not patch_kotlin(f):
            return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
