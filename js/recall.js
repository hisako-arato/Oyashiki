// 伏線と回収：イブの一日で伏線を回収する瞬間に「回想カード」（手がかりを得た日付と一文）を一瞬出す
// 回収した物は端末に覚えておき（遊び直しても残る）、クリア後の手帳の「伏線」のページに並べる（見逃した物は「？？？」）
import { CLUES } from './data.js';
import { dateOf } from './state.js';

const KEY = 'oyashiki-recall';
// clue：伏線になる手がかり（どれか一つ）、date：手がかりの無い出来事の日付（11月の何日か）、text：伏線の一文、pay：回収のされ方
export const FORESHADOW = [
  { key: 'code', clue: ['p_bday', 'n_codehint'], title: '麗子の誕生日', pay: '隠し部屋の鍵の番号は、麗子の誕生日（1103）だった。' },
  { key: 'oil', clue: ['c_study'], title: '書斎の油絵具の匂い', pay: 'イブの昼、旦那様は自ら「月下の庭」を大広間の壁に掛けた。あの絵だけは、誰にも触らせない。' },
  { key: 'dropout', clue: ['d_secret'], title: 'お嬢様の秘密', pay: '舞踏会で、旦那様はお嬢様を「美術史を学ぶ娘」と紹介した。' },
  { key: 'ledger', clue: ['b_ledger'], title: '地下の仕入れ帳', pay: '仕入れ帳の符丁の向こうにいたのは、今夜の仮面の客たちだった。' },
  { key: 'dealer', clue: ['r_parcel', 'm_dealer'], title: '夜中に来る絵の業者', pay: '眼鏡の客――オークション会社の担当者は、夜中に額縁の荷物を運んでくる男と同じ顔だった。' },
  { key: 'young', clue: ['m_secret'], title: 'お母様の贈り物', pay: '麗子が連れてきた若い男は、お母様が時計を贈っていた相手だった。' },
  { key: 'company', clue: ['w_past'], title: '会社の裏金', pay: '招待客の中に、白の会社の役員たちがいた。保管庫の工事費の行き先は、この夜の主だった。' },
  { key: 'caterer', clue: ['caterer_friend'], title: '仕出し屋の知り合い', pay: '雫の知人の仕出し屋は、外から来て外へ帰る車で、絵の受け手になった。' },
  { key: 'storm', date: 27, title: '嵐の夜の停電', pay: 'あの嵐の夜、屋敷じゅうが一瞬で闇に沈んだ。……0時の仮面外しの瞬間に、もう一度。' },
  { key: 'masks', clue: ['forgery_start'], title: '青の筆', pay: '模写を描いた青の筆は、客の仮面も、落とした切れ端も描いていた。' },
  { key: 'stamp', clue: ['shizuku_diary'], title: '母の日記の蔵印', pay: 'キャンバスの裏に、美術館の蔵印が残っていた。額縁ではなく、キャンバスこそが本物の証だった。' },
  { key: 'framed', clue: ['r_past'], title: '前のメイドの濡れ衣', pay: '旦那様がまた罪を着せようとしたとき、赤は初めて言い返した。' },
  { key: 'courier', clue: ['shizuku_courier', 'c_red'], title: '25日の朝の運び屋', pay: '12月25日の朝7時、正門にオークション会社のトラックが着いた。' },
  { key: 'guard', clue: ['guard_known'], title: '警備会社の巡回員', pay: '舞踏会の夜、巡回員は客の帰りを待って、夜通しの巡回に入った。' },
];
const byKey = Object.fromEntries(FORESHADOW.map(f => [f.key, f]));

function seenSet() { try { return new Set(JSON.parse(localStorage.getItem(KEY) || '[]')); } catch (e) { return new Set(); } }
export const recalled = key => seenSet().has(key);
function remember(key) { try { const set = seenSet(); set.add(key); localStorage.setItem(KEY, JSON.stringify([...set])); } catch (e) { /* noop */ } }

const fmt = off => { const d = dateOf(off); return `${d.m}月${d.d}日（${d.w}）`; };
// 回収の瞬間に呼ぶ。伏線の手がかりを持っていれば、回想カードを2.6秒ほど出す（持っていなければ何もしない）
export function recall(s, key) {
  const f = byKey[key];
  if (!f || (s.recalled && s.recalled[key])) return false;
  const clue = f.clue && f.clue.find(c => s.flags[c]);
  if (f.clue && !clue) return false;
  (s.recalled ||= {})[key] = true;
  remember(key);
  if (typeof document === 'undefined') return true;
  const day = clue ? (s.clueDay && s.clueDay[clue]) : f.date - 1;
  const text = clue ? CLUES[clue].text.replace(/^【[^】]*】/, '') : f.title;
  const card = document.createElement('div');
  card.className = 'recall-card';
  card.innerHTML = '<small></small><p></p><b></b>';
  card.querySelector('small').textContent = `回想　${day != null ? fmt(day) : ''}`;
  card.querySelector('p').textContent = text;
  card.querySelector('b').textContent = f.pay;
  const wait = Math.max(0, busyUntil - Date.now());
  busyUntil = Date.now() + wait + 4800;
  setTimeout(() => {
    document.body.append(card);
    setTimeout(() => card.classList.add('on'), 20);
    setTimeout(() => { card.classList.remove('on'); setTimeout(() => card.remove(), 600); }, 4200);
  }, wait);
  return true;
}
let busyUntil = 0;
// 手帳の「伏線」のページ
export function foreshadowList(s) {
  return FORESHADOW.map(f => ({ title: f.title, found: recalled(f.key) || !!(s.recalled && s.recalled[f.key]), pay: f.pay }));
}
