// 顔アイコン（assets/faces/<id>.webp）を、人物照会用の VRM から撮って作る
// 使い方：リポジトリで python3 -m http.server 8080 を動かしてから  node tools/face_icons.mjs
// VRM を入れ替えたり服を変えたりしたら、作り直す
// （playwright が見つからないときは NODE_PATH に node_modules の場所を入れる）
import { createRequire } from 'module';
import { writeFileSync } from 'fs';
const { chromium } = createRequire(import.meta.url)('playwright');
const IDS = ['butler', 'father', 'mother', 'daughter', 'red', 'blue', 'white', 'black', 'black2', 'guard'];
const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const p = await b.newPage();
await p.goto('http://localhost:8080/tools/face_icons.html');
await p.waitForFunction(() => window.ready);
for (const id of IDS) {
  const url = await p.evaluate(id => window.shoot(id), id);
  writeFileSync(new URL(`../assets/faces/${id}.webp`, import.meta.url), Buffer.from(url.split(',')[1], 'base64'));
  console.log(id);
}
await b.close();
