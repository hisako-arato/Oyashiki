#!/usr/bin/env python3
"""VRM（glb）の小さな手直し：要らない部品を消し、浮いたネクタイをシャツに沿わせる。

  python3 tools/vrm_fix_tie.py 入力.vrm 出力.vrm --hide 部品の名前の一部 --tie ネクタイの名前の一部 --shirt シャツの名前の一部

  --hide  : その材質の部品（三角形）を消す（例：蝶ネクタイ）。何度でも指定できる
  --tie   : 前に浮いているネクタイ。高さごとに、シャツの表面から少し前まで後ろへ下げる
  --shirt : ネクタイを沿わせる相手（シャツ）の材質
  --cover : 上着の材質。上着が体の真ん中を覆っている高さでは、ネクタイを上着の裏へ入れる（スーツの中に納める）
同じ頂点を共有するほかの部品は動かさない（ネクタイだけが使う頂点を動かす）。
"""
import argparse, json, struct
from array import array


def read(path):
    b = open(path, 'rb').read()
    n = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + n])
    off = 20 + n
    bl = struct.unpack('<I', b[off:off + 4])[0]
    return j, bytearray(b[off + 8:off + 8 + bl])


def write(path, j, bin_):
    js = json.dumps(j, ensure_ascii=False, separators=(',', ':')).encode()
    js += b' ' * ((4 - len(js) % 4) % 4)
    bin_ += b'\0' * ((4 - len(bin_) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(bin_)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A)); f.write(js)
        f.write(struct.pack('<II', len(bin_), 0x004E4942)); f.write(bin_)


def view(j, bin_, acc_i):
    a = j['accessors'][acc_i]
    bv = j['bufferViews'][a['bufferView']]
    start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    return a, start, bv.get('byteStride')


def indices(j, bin_, acc_i):
    a, start, _ = view(j, bin_, acc_i)
    fmt = {5121: 'B', 5123: 'H', 5125: 'I'}[a['componentType']]
    return array(fmt, bytes(bin_[start:start + a['count'] * array(fmt).itemsize]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('src'); ap.add_argument('dst')
    ap.add_argument('--hide', action='append', default=[])
    ap.add_argument('--tie'); ap.add_argument('--shirt'); ap.add_argument('--cover')
    ap.add_argument('--gap', type=float, default=0.004, help='シャツの表面からネクタイの裏までの隙間（m）')
    o = ap.parse_args()
    j, bin_ = read(o.src)
    mat = lambda p: j['materials'][p['material']]['name'] if 'material' in p else ''
    for m in j['meshes']:
        keep = []
        for p in m['primitives']:
            if any(h in mat(p) for h in o.hide):
                print('消した:', mat(p)); continue
            keep.append(p)
        m['primitives'] = keep
    if o.tie:
        for m in j['meshes']:
            tie = [p for p in m['primitives'] if o.tie in mat(p)]
            shirt = [p for p in m['primitives'] if o.shirt and o.shirt in mat(p)]
            if not tie: continue
            pos_i = tie[0]['attributes']['POSITION']
            a, start, stride = view(j, bin_, pos_i)
            stride = stride or 12
            P = lambda v: struct.unpack_from('<fff', bin_, start + v * stride)
            tie_v = set().union(*[set(indices(j, bin_, p['indices'])) for p in tie])
            other_v = set()
            for p in m['primitives']:
                if p not in tie: other_v |= set(indices(j, bin_, p['indices']))
            shirt_v = set().union(*[set(indices(j, bin_, p['indices'])) for p in shirt]) if shirt else set()
            cover = [p for p in m['primitives'] if o.cover and o.cover in mat(p)]
            cover_v = set().union(*[set(indices(j, bin_, p['indices'])) for p in cover]) if cover else set()
            movable = tie_v - other_v
            xs = [P(v)[0] for v in tie_v]
            x0, x1 = min(xs) - 0.02, max(xs) + 0.02
            # 高さごとの、シャツの前面（z が大きいほど前）とネクタイの裏面
            band = lambda y: round(y / 0.01)
            front, back = {}, {}
            for v in shirt_v:
                x, y, z = P(v)
                if x0 <= x <= x1: front[band(y)] = max(front.get(band(y), -9), z)
            for v in tie_v:
                x, y, z = P(v)
                back[band(y)] = min(back.get(band(y), 9), z)
            # 上着の前面（体の真ん中）
            jacket = {}
            for v in cover_v:
                x, y, z = P(v)
                if abs(x) < 0.06: jacket[band(y)] = max(jacket.get(band(y), -9), z)
            moved = 0
            for v in movable:
                x, y, z = P(v)
                k = band(y)
                f = next((front[k + d] for d in (0, 1, -1, 2, -2, 3, -3) if k + d in front), None)
                jf = next((jacket[k + d] for d in (0, 1, -1, 2, -2, 3, -3) if k + d in jacket), None)
                if k not in back or (f is None and jf is None): continue
                target = f + o.gap if f is not None else 9
                if jf is not None and (f is None or jf > f - 0.002): target = min(target, jf - 0.012)   # 上着が真ん中を覆う高さでは、上着の裏へ
                dz = back[k] - target
                if dz > 0:
                    struct.pack_into('<f', bin_, start + v * stride + 8, z - dz); moved += 1
            print('ネクタイの頂点を後ろへ下げた:', moved, '/', len(tie_v))
            # 位置の範囲（min/max）を付け直す
            zs = [P(v)[2] for v in range(a['count'])]
            a['min'][2], a['max'][2] = min(zs), max(zs)
    write(o.dst, j, bin_)


if __name__ == '__main__':
    main()
