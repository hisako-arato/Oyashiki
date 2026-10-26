// 24日のテストプレイ（タイトルのバージョン表示を5回タップすると出る。通常のプレイには出さない）
// ひな形ごとに、イブの朝（最終章・最後の週の金曜）か深夜（作戦を選ぶ画面）の状態を作る
import { newState, setFlag, dayIndex } from './state.js';

// どのひな形でも済ませておくこと（加入の場面・チュートリアル・最終章の巡回の判定）
const BASE = ['tutorial_done', 'white_arrived', 'white_spy', 'shizuku', 'strict_checked'];
// 屋敷の調べ物は一通り終えている
const INFO = ['c_import', 'c_red', 'c_daughter', 'c_study', 'h_window', 'h_blueprint', 'hidden_room', 'hint_redbook', 'red_book',
  'desk_lock', 'p_lover', 'p_bday', 'n_codehint', 'key_hidden', 'found_painting', 'breaker_seen', 'white_elec', 'ladder', 'balcony_open',
  'hall_patrol', 'shizuku_reunion', 'shizuku_diary', 'shizuku_courier', 'guard_known', 'guard_info', 'back_gate',
  'b_well', 'b_plan', 'b_hatch', 'b_key', 'b_light', 'b_tool', 'b_found', 'b_vault', 'b_tunnel', 'b_grate'];
const FORGERY = ['forgery_start', 'forgery_ready', 'hide_ok'];

export const PRESETS = [
  { id: 'e1', name: 'ENDING 1 の条件', desc: '白が協力者。絵の場所・暗証番号・巡回員の癖が分かっている',
    flags: [...INFO, 'white_ally'], aff: { white: 75 } },
  { id: 'e2', name: 'ENDING 2 の条件', desc: 'ENDING 1 の条件に加えて、青の模写が完成し、お嬢様のクローゼットに隠せる',
    flags: [...INFO, 'white_ally', ...FORGERY], aff: { white: 75, blue: 75, daughter: 75 } },
  { id: 'e3', name: 'ENDING 3 の条件', desc: '4人全員が協力者（雫とのことも、全員に打ち明けてある）',
    flags: [...INFO, 'white_ally', 'white_turned', ...FORGERY, 'told_red', 'told_blue', 'told_white'], aff: { red: 75, blue: 75, white: 75, daughter: 75 } },
  { id: 'bad', name: '何もそろっていない', desc: '調べ物も協力者も無い。BAD END の確認用', flags: [], aff: {} },
];
export const WHEN = [['morning', '24日の朝（イブの昼）から'], ['night', '24日の深夜（作戦を選ぶ画面）から']];

export function testState(presetId, when) {
  const p = PRESETS.find(x => x.id === presetId);
  const s = newState();
  Object.assign(s, { chapter: 3, week: 1, day: when === 'night' ? 5 : 4, phase: when === 'night' ? 'weekend' : 'meeting', trust: 60, susp: 10 });
  for (const f of [...BASE, ...p.flags]) setFlag(s, f);
  Object.assign(s.aff, { black: 100 }, p.aff);
  if (s.flags.forgery_start) s.forgeryDay = dayIndex(s) - 10;
  s.testPreset = presetId; s.testWhen = when;
  return s;
}
