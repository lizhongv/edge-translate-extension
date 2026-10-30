"""生成扩展图标 public/icons/{16,32,48,128}.png：品牌渐变圆角方块 + 白色「译」字 + 划词高亮条。

用法：python scripts/make-icons.py      （依赖 Pillow；Windows 自带微软雅黑粗体）
每个尺寸都按 4 倍画布绘制再缩小，保证小尺寸边缘清晰。
"""

import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "public", "icons")
FONT_CANDIDATES = [r"C:\Windows\Fonts\msyhbd.ttc", r"C:\Windows\Fonts\msyh.ttc",
                   "/System/Library/Fonts/PingFang.ttc", "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc"]
TOP, BOTTOM = (59, 130, 246), (79, 70, 229)          # 渐变 #3B82F6 → #4F46E5，与 tokens.css 一致


def render(size):
    s = size * 4
    grad = Image.new("RGB", (s, s))
    gd = ImageDraw.Draw(grad)
    for y in range(s):
        t = y / (s - 1)
        gd.line([(0, y), (s, y)], fill=tuple(int(a + (b - a) * t) for a, b in zip(TOP, BOTTOM)))
    mask = Image.new("L", (s, s), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, s - 1, s - 1], radius=int(s * 0.23), fill=255)
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    img.paste(grad, (0, 0), mask)

    d = ImageDraw.Draw(img)
    # 划词高亮条：半透明白色圆角条，表示「选中文字」
    bar_h = s * 0.08
    d.rounded_rectangle([s * 0.22, s * 0.77, s * 0.78, s * 0.77 + bar_h], radius=bar_h / 2,
                        fill=(255, 255, 255, 110))
    font_path = next(p for p in FONT_CANDIDATES if os.path.exists(p))
    font = ImageFont.truetype(font_path, int(s * 0.50))
    box = d.textbbox((0, 0), "译", font=font)
    w, h = box[2] - box[0], box[3] - box[1]
    d.text(((s - w) / 2 - box[0], s * 0.43 - h / 2 - box[1]), "译", font=font, fill="white")
    return img.resize((size, size), Image.LANCZOS)


def main():
    os.makedirs(OUT, exist_ok=True)
    for size in (16, 32, 48, 128):
        render(size).save(os.path.join(OUT, f"{size}.png"))
    render(256).save(os.path.join(ROOT, "docs", "images", "logo.png"))
    print("图标已生成：", OUT)


if __name__ == "__main__":
    main()
