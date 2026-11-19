#!/usr/bin/env bash
# 一键构建全部平台：触发 workflow → 等待完成 → 下载产物到 dist/
#
# 用法：
#   GH_TOKEN=ghp_xxx ./scripts/build-all.sh            # 全部平台
#   GH_TOKEN=ghp_xxx ./scripts/build-all.sh android    # 只构建安卓
#
# 依赖：gh CLI（https://cli.github.com）

set -euo pipefail

REPO="david1a21/moyu-writer"
OUT="${OUT:-dist}"
TARGET="${1:-all}"

if [ -z "${GH_TOKEN:-}" ]; then
  echo "错误：请先设置 GH_TOKEN（GitHub Personal Access Token）"
  exit 1
fi

mkdir -p "$OUT"

declare -A WF=(
  [android]="build-android.yml"
  [macos]="build-macos.yml"
  [ios]="build-ios-m14.yml"
  [desktop]="build.yml"
)

trigger() {
  local name="$1" file="${WF[$1]}"
  echo "→ 触发 $name ($file)"
  gh workflow run "$file" --repo "$REPO" --ref main >/dev/null
}

wait_run() {
  local file="$1" name="$2"
  echo "   等待 $name 完成…"
  for _ in $(seq 1 60); do
    sleep 20
    local line
    line=$(gh run list --repo "$REPO" --workflow "$file" --limit 1 \
      --json status,conclusion,databaseId \
      -q '.[0] | "\(.status) \(.conclusion) \(.databaseId)"')
    local st concl id
    st=$(echo "$line" | cut -d' ' -f1)
    concl=$(echo "$line" | cut -d' ' -f2)
    id=$(echo "$line" | cut -d' ' -f3)
    if [ "$st" = "completed" ]; then
      echo "   $name: $concl (run $id)"
      if [ "$concl" != "success" ]; then
        echo "   !! $name 构建失败，查看: gh run view $id --repo $REPO --log-failed"
      fi
      return 0
    fi
  done
  echo "   !! $name 等待超时"
}

download() {
  local run_id="$1" name="$2" dir="$OUT/$2"
  mkdir -p "$dir"
  gh run download "$run_id" --repo "$REPO" --dir "$dir" 2>/dev/null || true
  echo "   已下载 $name → $dir"
}

get_latest_run() {
  gh run list --repo "$REPO" --workflow "$1" --limit 1 --json databaseId -q '.[0].databaseId'
}

TARGETS=()
if [ "$TARGET" = "all" ]; then
  TARGETS=(desktop android macos ios)
else
  TARGETS=("$TARGET")
fi

for t in "${TARGETS[@]}"; do
  if [ -z "${WF[$t]:-}" ]; then
    echo "未知目标：$t（可用：android / macos / ios / desktop / all）"
    exit 1
  fi
  trigger "$t"
done

echo
echo "全部任务已触发，开始等待…"
for t in "${TARGETS[@]}"; do
  wait_run "${WF[$t]}" "$t"
  download "$(get_latest_run "${WF[$t]}")" "$t"
done

echo
echo "完成。产物在 $OUT/ 下："
find "$OUT" -maxdepth 3 -type f \( -name '*.apk' -o -name '*.dmg' -o -name '*.ipa' -o -name '*.exe' -o -name '*.msi' \) -exec ls -lh {} \; 2>/dev/null || true
