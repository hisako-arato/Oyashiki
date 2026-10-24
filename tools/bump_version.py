"""バージョンを上げる。js/version.js・version.json・sw.js のキャッシュ名をそろえて書き換える。
   使い方: python3 tools/bump_version.py 1.16 [2026-10-25]   （日付を省くと今日）
"""
import datetime, json, re, sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
ver = sys.argv[1]
date = sys.argv[2] if len(sys.argv) > 2 else datetime.date.today().isoformat()
js = root / 'js/version.js'
t = js.read_text()
t = re.sub(r"VERSION = '[^']*'", f"VERSION = '{ver}'", t)
t = re.sub(r"VERSION_DATE = '[^']*'", f"VERSION_DATE = '{date}'", t)
js.write_text(t)
(root / 'version.json').write_text(json.dumps({'version': ver, 'date': date}) + '\n')
sw = root / 'sw.js'
sw.write_text(re.sub(r"const CACHE = 'oyashiki-[^']*'", f"const CACHE = 'oyashiki-{ver}'", sw.read_text()))
print(f'version {ver} ({date})')
