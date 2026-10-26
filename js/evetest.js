// 24日のテストプレイ（タイトルのバージョン表示を5回タップすると出る。通常のプレイには出さない）
// ひな形ごとに、イブの朝（最終章・最後の週の金曜）か深夜（作戦を選ぶ画面）の状態を作る
import { newState, setFlag, dayIndex } from './state.js';

// どのひな形でも済ませておくこと（加入の場面・チュートリアル・最終章の巡回の判定）
const BASE = ['tutorial_done', 'white_arrived', 'white_spy', 'shizuku', 'strict_checked'];
// 屋敷の調べ物は一通り終えている
const INFO = ['c_import', 'c_red', 'c_daughter', 'c_study', 'h_window', 'h_blueprint', 'hidden_room', 'hint_redbook', 'red_book',
  'desk_lock', 'p_lover', 'p_bday', 'n_codehint', 'key_hidden', 'found_painting', 'breaker_seen', 'white_elec', 'ladder', 'balcony_open',
  'hall_patrol', 'shizuku_reunion', 'shizuku_diary', 'shizuku_courier', 'guard_known', 'guard_info', 'back_gate', 'caterer_friend', 'eve_display',
  'b_well', 'b_plan', 'b_hatch', 'b_key', 'b_light', 'b_tool', 'b_found', 'b_vault', 'b_tunnel', 'b_grate'];
const FORGERY = ['forgery_start', 'forgery_ready', 'hide_ok'];

export const PRESETS = [
  { id: 'e1', name: 'ENDING 1 の条件', desc: '白が協力者。絵の場所・暗証番号・巡回員の癖が分かっている',
    flags: [...INFO, 'white_ally'], aff: { white: 75 } },
  { id: 'e2', name: 'ENDING 2 の条件', desc: 'ENDING 1 の条件に加えて、青の模写が完成し、お嬢様のクローゼットに隠せる',
    flags: [...INFO, 'white_ally', ...FORGERY], aff: { white: 75, blue: 75, daughter: 75 } },
  { id: 'e3', name: 'ENDING 3 の条件', desc: '4人全員が協力者で、23日の夜に予告状を出すと決めてある（朝から始めると、0時の仮面外しで停電劇）',
    flags: [...INFO, 'white_ally', 'white_turned', ...FORGERY, 'told_red', 'told_blue', 'told_white'], aff: { red: 75, blue: 75, white: 75, daughter: 75 } },
  { id: 'bad', name: '何もそろっていない', desc: '調べ物も協力者も無い。BAD END の確認用', flags: [], aff: {} },
];
export const WHEN = [['morning', '24日の朝（イブの昼）から'], ['night', '24日の深夜（作戦を選ぶ画面）から']];
// お嬢様・お母様との関係（ひな形の上に重ねる）
// ふつう：好感度30／親しい：70（ダンスに誘える・秘密を打ち明けられている）／深い仲：85（夜を重ねた仲・イブの夜に部屋へ招かれている）
export const REL = [['normal', 'ふつう'], ['close', '親しい'], ['deep', '深い仲']];
const AFF = { normal: 30, close: 70, deep: 85 };
function applyRel(s, rel) {
  for (const [who, pre] of [['daughter', 'd'], ['mother', 'm']]) {
    const lv = rel[who] || 'normal';
    s.aff[who] = AFF[lv];
    for (const f of [`${pre}_secret`, `${pre}_close`, `eve_${who}`]) delete s.flags[f];
    if (lv !== 'normal') setFlag(s, `${pre}_secret`);
    if (lv === 'deep') { setFlag(s, `${pre}_close`); setFlag(s, `eve_${who}`); }
  }
}

export function testState(presetId, when, rel = {}) {
  const p = PRESETS.find(x => x.id === presetId);
  const s = newState();
  Object.assign(s, { chapter: 3, week: 1, day: when === 'night' ? 5 : 4, phase: when === 'night' ? 'weekend' : 'meeting', trust: 60, susp: 10 });
  for (const f of [...BASE, ...p.flags]) setFlag(s, f);
  Object.assign(s.aff, { black: 100 }, p.aff);
  if (s.flags.forgery_start) s.forgeryDay = dayIndex(s) - 10;
  // ENDING 3：23日の夜の決起会で、予告状を出すと決めてある（朝から始めると、0時に停電劇になる）
  if (presetId === 'e3') { setFlag(s, 'plan_blackout'); setFlag(s, 'rally_done'); }
  // 深夜から始めるときは、ENDING 2 のすり替え（イブの昼）も済ませておく
  if (presetId === 'e2' && when === 'night') { setFlag(s, 'swapped'); setFlag(s, 'swap_hidden'); }
  applyRel(s, rel);
  s.testPreset = presetId; s.testWhen = when; s.testRel = rel;
  return s;
}
