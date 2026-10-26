#!/usr/bin/env python3
"""舞踏会の一般客の VRM を、今ある VRM から作る（色を変えて、軽くする）。

  python3 tools/vrm_guest.py 元.vrm 出力.vrm [--hair '#c9b27a'] [--cloth-hue 140] [--cloth-dark '#28324a'] [--tex 256]

  --hair       髪の画像を、この色に染め直す（陰影は残す）
  --cloth-hue  服の画像の色相を回す（度）。色の付いた布だけが変わり、白や黒はそのまま
  --cloth-dark 服の画像の暗い部分（黒いスーツなど）を、この色に寄せる。白いシャツは白のまま
  --tex        画像の大きさの上限（客は遠くに小さく映るので 256 で十分）
表情とモーフ、揺れもの（スプリングボーン）は取り除く（客は仮面を付け、表情を使わない）。
仕上げに tools/vrm_lite.py で、使っていないデータを取り除いて画像を縮める。
"""
import argparse, colorsys, io, os, subprocess, sys, tempfile
from PIL import Image
sys.path.insert(0, os.path.dirname(__file__))
from vrm_lite import read_glb, write_glb


def hexrgb(h):
    h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))


def recolor(data, fn):
    im = Image.open(io.BytesIO(data)).convert('RGBA')
    px = im.load()
    for y in range(im.height):
        for x in range(im.width):
            r, g, b, a = px[x, y]
            if a == 0: continue
            nr, ng, nb = fn(r / 255, g / 255, b / 255)
            px[x, y] = (round(min(1, nr) * 255), round(min(1, ng) * 255), round(min(1, nb) * 255), a)
    out = io.BytesIO(); im.save(out, 'PNG', optimize=True)
    return out.getvalue()


def textures_of(m):
    """材質が使う画像の番号（texture の index）をすべて集める"""
    found = set()
    def walk(o):
        if isinstance(o, dict):
            for k, v in o.items():
                if k == 'index' and isinstance(v, int): found.add(v)
                else: walk(v)
        elif isinstance(o, list):
            for v in o: walk(v)
    walk({k: v for k, v in m.items() if k != 'name'})
    return found


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--hair'); ap.add_argument('--cloth-hue', type=float, default=0); ap.add_argument('--cloth-dark')
    ap.add_argument('--tex', type=int, default=256)
    o = ap.parse_args()
    j, binary = read_glb(o.src)
    view = lambda i: bytes(binary[j['bufferViews'][i].get('byteOffset', 0):][:j['bufferViews'][i]['byteLength']])
    data = {i: view(i) for i in range(len(j['bufferViews']))}

    # 髪と服の画像を見分ける（材質の名前に HAIR / CLOTH が入っている物）
    kind = {}
    for m in j.get('materials', []):
        n = m.get('name', '').upper()
        k = 'hair' if 'HAIR' in n else 'cloth' if 'CLOTH' in n else None
        if not k: continue
        for ti in textures_of(m):
            src = j['textures'][ti].get('source')
            if src is not None: kind.setdefault(src, k)
    hair = hexrgb(o.hair) if o.hair else None
    dark = hexrgb(o.cloth_dark) if o.cloth_dark else None
    def hair_fn(r, g, b):
        lum = 0.3 * r + 0.59 * g + 0.11 * b
        k = lum / 0.45
        return hair[0] * k, hair[1] * k, hair[2] * k
    def cloth_fn(r, g, b):
        h, s, v = colorsys.rgb_to_hsv(r, g, b)
        if o.cloth_hue and s > 0.15: r, g, b = colorsys.hsv_to_rgb((h + o.cloth_hue / 360) % 1, s, v)
        if dark:
            lum = 0.3 * r + 0.59 * g + 0.11 * b
            w = max(0, 1 - lum / 0.45)   # 暗いほど強く寄せる
            r, g, b = (r * (1 - w) + dark[0] * lum / 0.25 * w, g * (1 - w) + dark[1] * lum / 0.25 * w, b * (1 - w) + dark[2] * lum / 0.25 * w)
        return r, g, b
    for ii, im in enumerate(j.get('images', [])):
        if 'bufferView' not in im or ii not in kind: continue
        if kind[ii] == 'hair' and hair: data[im['bufferView']] = recolor(data[im['bufferView']], hair_fn)
        elif kind[ii] == 'cloth' and (o.cloth_hue or dark): data[im['bufferView']] = recolor(data[im['bufferView']], cloth_fn)
        else: continue
        im['mimeType'] = 'image/png'

    # 表情・モーフの結び付きと、揺れものを取り除く
    vrm = j['extensions']['VRMC_vrm']
    for grp in ('preset', 'custom'):
        for e in vrm.get('expressions', {}).get(grp, {}).values():
            e.pop('morphTargetBinds', None); e.pop('materialColorBinds', None); e.pop('textureTransformBinds', None)
    j['extensions'].pop('VRMC_springBone', None)
    if 'extensionsUsed' in j: j['extensionsUsed'] = [x for x in j['extensionsUsed'] if x != 'VRMC_springBone']

    with tempfile.NamedTemporaryFile(suffix='.vrm', delete=False) as t: tmp = t.name
    write_glb(tmp, j, [data[i] for i in range(len(j['bufferViews']))])
    subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), 'vrm_lite.py'), tmp, o.dst, '--tex', str(o.tex), '--no-morph-normals'], check=True)
    os.unlink(tmp)
    print(o.dst, os.path.getsize(o.dst) // 1024, 'KB')


if __name__ == '__main__':
    main()
