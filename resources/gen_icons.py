#!/usr/bin/env python3
"""生成 Tauri 所需的全套图标（纯标准库，无依赖）"""
import os, struct, zlib, math

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', 'src-tauri', 'icons')
os.makedirs(OUT, exist_ok=True)

BG = (47, 111, 94)      # 深墨绿
BG2 = (38, 92, 78)
FG = (250, 249, 246)

# W 的四条笔画（512 坐标系）
STROKES = [
    (138, 158, 184, 366),
    (184, 366, 256, 232),
    (256, 232, 328, 366),
    (328, 366, 374, 158),
]
STROKE_W = 27.0


def seg_dist(px, py, x1, y1, x2, y2):
    dx, dy = x2 - x1, y2 - y1
    if dx == 0 and dy == 0:
        return math.hypot(px - x1, py - y1)
    t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)
    t = max(0.0, min(1.0, t))
    return math.hypot(px - (x1 + t * dx), py - (y1 + t * dy))


def in_round_rect(x, y, w, h, r):
    cx = min(max(x, r), w - r)
    cy = min(max(y, r), h - r)
    return math.hypot(x - cx, y - cy) <= r


def sample(x, y):
    """返回该点颜色 (r,g,b,a)"""
    if not in_round_rect(x, y, 512.0, 512.0, 108.0):
        return None
    # 背景轻微渐变
    k = y / 512.0
    bg = tuple(int(BG[i] * (1 - k) + BG2[i] * k) for i in range(3))
    for (x1, y1, x2, y2) in STROKES:
        if seg_dist(x, y, x1, y1, x2, y2) <= STROKE_W:
            return FG
    return bg


def render(size, ss=4):
    scale = 512.0 / size
    buf = bytearray()
    for py in range(size):
        for px in range(size):
            r = g = b = a = 0
            for sy in range(ss):
                for sx in range(ss):
                    x = (px + (sx + 0.5) / ss) * scale
                    y = (py + (sy + 0.5) / ss) * scale
                    c = sample(x, y)
                    if c is not None:
                        r += c[0]; g += c[1]; b += c[2]; a += 255
            n = ss * ss
            if a == 0:
                buf += bytes((0, 0, 0, 0))
            else:
                cover = a / (255 * n)
                buf += bytes((int(r / n), int(g / n), int(b / n), int(round(255 * cover))))
    return bytes(buf)


def png(size, rgba):
    def chunk(t, d):
        c = t + d
        return struct.pack('>I', len(d)) + c + struct.pack('>I', zlib.crc32(c) & 0xFFFFFFFF)

    raw = b''
    for y in range(size):
        raw += b'\x00' + rgba[y * size * 4:(y + 1) * size * 4]
    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9))
            + chunk(b'IEND', b''))


SIZES = [512, 256, 128, 64, 32, 16]
cache = {}
for s in SIZES:
    cache[s] = png(s, render(s))
    print(f'  render {s}x{s}  {len(cache[s])} bytes')


def write(name, data):
    with open(os.path.join(OUT, name), 'wb') as f:
        f.write(data)


write('icon.png', cache[512])
write('128x128@2x.png', cache[256])
write('128x128.png', cache[128])
write('32x32.png', cache[32])
write('Square107x107Logo.png', cache[128])
write('Square142x142Logo.png', cache[128])
write('Square150x150Logo.png', cache[256])
write('Square284x284Logo.png', cache[512])
write('Square310x310Logo.png', cache[512])
write('Square44x44Logo.png', cache[64])
write('StoreLogo.png', cache[64])

# ---- ICO（内嵌 PNG，Vista 格式）----
ico_sizes = [256, 128, 64, 48, 32, 16]
entries = b''
payload = b''
offset = 6 + 16 * len(ico_sizes)
for s in ico_sizes:
    data = cache[s] if s in cache else png(s, render(s))
    w = 0 if s == 256 else s
    entries += struct.pack('<BBBBHHII', w, w, 0, 0, 1, 32, len(data), offset)
    offset += len(data)
    payload += data
ico = struct.pack('<HHH', 0, 1, len(ico_sizes)) + entries + payload
write('icon.ico', ico)

# ---- ICNS ----
icns_items = [(b'ic09', 512), (b'ic08', 256), (b'ic13', 256), (b'ic07', 128),
              (b'ic12', 64), (b'ic11', 32), (b'ic14', 512), (b'ic10', 512)]
body = b''
for tag, s in icns_items:
    data = cache[s]
    body += tag + struct.pack('>I', len(data) + 8) + data
icns = b'icns' + struct.pack('>I', len(body) + 8) + body
write('icon.icns', icns)

for root, dirs, files in os.walk(OUT):
    for f in sorted(files):
        p = os.path.join(root, f)
        print(f'  ✔ {os.path.relpath(p, OUT)}  {os.path.getsize(p) // 1024} KB')
