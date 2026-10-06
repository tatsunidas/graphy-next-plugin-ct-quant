/// <reference path="./graphy-plugin.d.ts" />
// @ts-check
/*
 * CT 臓器体積・体組成（研究版）— GRAPHY-Next の公式プラグイン。
 * 設計: GRAPHY-Next の fw/ct-quant-design.md。
 *
 * 流れ（「実行」1 回・同意 1 回）:
 *   1. 本体が匿名化した npz を外部の計算機（Colab の GPU など・H59）へ送る
 *   2. 計算機の上で TotalSegmentator の total タスク（重みは Apache-2.0）を走らせ、ラベルの volume を返す
 *   3. 本体の H66（measureLabels）で、臓器ごとの体積・CT 値と、L3 レベルの筋の面積を測る
 *      （計測はプラグインで書かない。数え上げ・統計の定義は本体の 1 か所にある）
 *   4. ROI マネージャに読み込み（H65）、SEG（H64）・SR・CSV で保存する
 *
 * 研究用。判定（サルコペニア・脂肪肝の有無など）は出さない。
 */

/** 計算機に入れる TotalSegmentator の版（数値の再現性のため固定する。2026-08-12 公開の 2.18.0）。 */
export const TOTALSEG_VERSION = "2.18.0";

/**
 * 骨格筋の CT 値の範囲（L3 の体組成で広く使われる設定）。v1 は画面で変えられない。
 * 出典の原典での確認は fw/ct-quant-design.md §4.3（Q4）。
 */
export const MUSCLE_HU = { name: "muscle", min: -29, max: 150 };

/** 画面に上から並べる主な臓器（TotalSegmentator total の名前 → 表示名）。ほかは「その他」として後ろに出す。 */
export const MAJOR = [
  ["liver", "肝臓"],
  ["spleen", "脾臓"],
  ["kidney_right", "右腎"],
  ["kidney_left", "左腎"],
  ["pancreas", "膵臓"],
  ["gallbladder", "胆嚢"],
  ["stomach", "胃"],
  ["heart", "心臓"],
  ["aorta", "大動脈"],
  ["urinary_bladder", "膀胱"],
  ["prostate", "前立腺"],
];

/** 合計して 1 行にするもの（例: 肺は 5 葉）。 */
export const GROUPS = [
  ["肺（5 葉の合計）", ["lung_upper_lobe_left", "lung_lower_lobe_left", "lung_upper_lobe_right", "lung_middle_lobe_right", "lung_lower_lobe_right"]],
];

export const L3 = "vertebrae_L3";
/**
 * L3 の骨格筋の全周の面積（SMA）に入れる筋（TotalSegmentator abdominal_muscles の名前・左右は合計）。
 * 定義は大腰筋・傍脊柱筋（脊柱起立筋・腰方形筋）・腹横筋・外腹斜筋・内腹斜筋・腹直筋（PMC7359407 による。原典の Mourtzakis 2008 は未読）。
 * 横突棘筋（多裂筋など）は傍脊柱筋として入れる。**腹横筋は abdominal_muscles に無いので入らない**（SMA は小さめに出る）。
 */
export const SMA_PARTS = [
  ["psoas_major", "大腰筋"],
  ["erector_spinae", "脊柱起立筋"],
  ["transversospinalis", "横突棘筋"],
  ["quadratus_lumborum", "腰方形筋"],
  ["external_oblique", "外腹斜筋"],
  ["internal_oblique", "内腹斜筋"],
  ["rectus_abdominis", "腹直筋"],
];
export const PSOAS = ["iliopsoas_left", "iliopsoas_right"];
export const PARASPINAL = ["autochthon_left", "autochthon_right"];

// ---------------------------------------------------------------------------
// 計算機の上で走る Python。先頭に GRAPHY（version・fast）が足される。
// ---------------------------------------------------------------------------
export const PY = String.raw`
import json, os, subprocess, sys, time
from importlib import metadata as _md

VER = GRAPHY['version']
FAST = bool(GRAPHY.get('fast'))
T0 = time.time()
STAGES = {}


def stage(name, p):
    STAGES[name] = round(time.time() - T0, 1)
    print('__progress__', p, name, flush=True)


def importable(mod):
    import importlib.util
    try:
        return importlib.util.find_spec(mod) is not None
    except ModuleNotFoundError:
        return False


# パッケージを自分で入れるのは Colab（使い捨てのランタイム）のときだけ。
# 利用者が自分で立てた Jupyter の環境は書き換えない（足りなければ名前を示して止める）
COLAB = bool(os.environ.get('COLAB_RELEASE_TAG')) or importable('google.colab')


def installed(dist):
    try:
        return _md.version(dist)
    except _md.PackageNotFoundError:
        return None


stage('setup', 0.02)
if installed('TotalSegmentator') != VER:
    if not COLAB:
        raise RuntimeError('missing-packages: この計算機に TotalSegmentator==' + VER + ' を入れてください')
    subprocess.check_call([sys.executable, '-m', 'pip', 'install', '-q', '--disable-pip-version-check', 'TotalSegmentator==' + VER])
import numpy as np
import nibabel as nib
stage('packages', 0.15)

# npz（本体が匿名化して作ったもの）→ NIfTI。volume は [z, y, x]、origin/direction は LPS
z = np.load('inputs/0.npz')
series_meta = json.loads(bytes(z['meta.json'])) if 'meta.json' in z.files else {}
if str(series_meta.get('modality') or '').upper() != 'CT':
    raise RuntimeError('not-applicable: CT のシリーズだけに使えます（このシリーズは %s）' % (series_meta.get('modality') or '不明'))
vol, sp, org, dr = z['volume'], z['spacing'], z['origin'], z['direction']
if not (np.all(np.isfinite(sp)) and np.all(np.isfinite(org)) and np.all(np.isfinite(dr))):
    raise RuntimeError('no-geometry: このシリーズには患者座標（間隔・位置・向き）がありません')
nz, ny, nx = vol.shape
lps = np.eye(4)
lps[:3, 0] = dr[0] * sp[2]
lps[:3, 1] = dr[1] * sp[1]
lps[:3, 2] = dr[2] * sp[0]
lps[:3, 3] = org
ras = np.diag([-1.0, -1.0, 1.0, 1.0]) @ lps   # NIfTI は RAS
work = os.path.abspath('work')
os.makedirs(work, exist_ok=True)
img = nib.Nifti1Image(np.ascontiguousarray(vol.transpose(2, 1, 0)), ras)
img.set_qform(ras, 1)
img.set_sform(ras, 1)
img.header.set_xyzt_units('mm')
image_path = os.path.join(work, 'image.nii.gz')
out_path = os.path.join(work, 'labels.nii.gz')
nib.save(img, image_path)
stage('prepared', 0.2)

# 推論は新しい Python のプロセスで走らせる（この kernel で入れたパッケージが確実に効くように）。
# GPU が無ければ止める（CPU だと 1 例に数十分かかり、途中で切れる）
RUNNER = '''
import json, sys
import torch
if not torch.cuda.is_available():
    raise SystemExit('no-gpu: この計算機には GPU がありません')
torch.cuda.reset_peak_memory_stats()
from totalsegmentator.python_api import totalsegmentator
from totalsegmentator.map_to_binary import class_map
args = json.load(open(sys.argv[1], encoding='utf-8'))
totalsegmentator(args['input'], args['output'], ml=True, task='total', fast=args['fast'], quiet=True)
# 椎体だけ（椎弓を含まない）。L1 椎体の CT 値に使う。v2.18.0 ではライセンス不要（commercial_models に無い）
totalsegmentator(args['input'], args['bodies'], ml=True, task='vertebrae_body', quiet=True)
# 腹壁の筋を含む骨格筋（T4〜L4 の範囲だけ）。L3 の骨格筋の全周の面積に使う。v2.18.0 ではライセンス不要
totalsegmentator(args['input'], args['muscles'], ml=True, task='abdominal_muscles', quiet=True)
json.dump({'peakMiB': round(torch.cuda.max_memory_allocated() / 1048576),
           'gpu': torch.cuda.get_device_name(0),
           'classMap': {str(k): v for k, v in class_map['total'].items()},
           'bodyMap': {str(k): v for k, v in class_map['vertebrae_body'].items()},
           'muscleMap': {str(k): v for k, v in class_map['abdominal_muscles'].items()}}, open(sys.argv[2], 'w'))
'''
args_path = os.path.join(work, 'run-args.json')
info_path = os.path.join(work, 'run-info.json')
bodies_path = os.path.join(work, 'bodies.nii.gz')
muscles_path = os.path.join(work, 'muscles.nii.gz')
json.dump({'input': image_path, 'output': out_path, 'bodies': bodies_path, 'muscles': muscles_path, 'fast': FAST}, open(args_path, 'w', encoding='utf-8'))
proc = subprocess.run([sys.executable, '-c', RUNNER, args_path, info_path], capture_output=True, encoding='utf-8', errors='replace',
                      env={**os.environ, 'PYTHONIOENCODING': 'utf-8'})
if proc.stdout:
    print(proc.stdout[-4000:], flush=True)
if proc.returncode != 0:
    tail = (proc.stderr or '').strip().splitlines()[-30:]
    print('\n'.join(tail), file=sys.stderr, flush=True)
    last = next((l for l in reversed(tail) if l.strip()), 'unknown error')
    raise RuntimeError('totalseg-failed: ' + last[:500])
info = json.load(open(info_path))
stage('inferred', 0.85)

def to_input_grid(path):
    """出力の格子 → 入力の格子（同じなら写すだけ。違えば最近傍で取り直す）。戻りは [x, y, z] と、取り直したか。"""
    o = nib.load(path)
    lab = np.rint(np.asanyarray(o.dataobj)).astype(np.int32)
    if lab.ndim != 3:
        raise RuntimeError('unexpected-output-shape: ' + str(lab.shape))
    m = np.linalg.inv(o.affine) @ ras
    if lab.shape == (nx, ny, nz) and np.allclose(m, np.eye(4), atol=1e-3):
        return lab, False
    res = np.zeros((nx, ny, nz), np.int32)
    ii, jj = np.meshgrid(np.arange(nx), np.arange(ny), indexing='ij')
    for k in range(nz):
        p = m @ np.stack([ii.ravel(), jj.ravel(), np.full(ii.size, k), np.ones(ii.size)])
        q = np.rint(p[:3]).astype(np.int64)
        inside = np.all((q >= 0) & (q < np.array(lab.shape)[:, None]), axis=0)
        v = np.zeros(ii.size, np.int32)
        v[inside] = lab[q[0, inside], q[1, inside], q[2, inside]]
        res[:, :, k] = v.reshape(nx, ny)
    return res, True


lab, resampled = to_input_grid(out_path)
bodies, resampled_b = to_input_grid(bodies_path)
# L1 椎体 = total の vertebrae_L1（椎骨全体）と vertebrae_body の椎体が重なるところ
l1_id = {v: int(k) for k, v in info['classMap'].items()}.get('vertebrae_L1')
body_id = {v: int(k) for k, v in info['bodyMap'].items()}['vertebrae_body']
l1body = ((lab == l1_id) & (bodies == body_id)) if l1_id is not None else np.zeros(lab.shape, bool)
np.save('outputs/l1body.npy', np.ascontiguousarray(l1body.transpose(2, 1, 0)).astype(np.uint8))
muscles, resampled_m = to_input_grid(muscles_path)
np.save('outputs/muscles.npy', np.ascontiguousarray(muscles.transpose(2, 1, 0)).astype(np.uint8))
zyx = np.ascontiguousarray(lab.transpose(2, 1, 0))
np.save('outputs/labels.npy', zyx.astype(np.uint8 if zyx.max() < 256 else np.uint16))
values, counts = np.unique(zyx, return_counts=True)
stage('done', 1.0)
json.dump({
    'model': 'TotalSegmentator',
    'task': 'total',
    'version': installed('TotalSegmentator'),
    'fast': FAST,
    'classMap': info['classMap'],
    'labels': {str(int(v)): int(c) for v, c in zip(values, counts)},
    'shape': [int(nz), int(ny), int(nx)],
    'geometry': {'spacing': sp.tolist(), 'origin': org.tolist(), 'direction': dr.tolist()},
    'resampled': bool(resampled or resampled_b or resampled_m),
    'muscleMap': info['muscleMap'],
    'muscleVoxels': {str(int(v)): int(c) for v, c in zip(*np.unique(muscles[muscles > 0], return_counts=True))},
    'l1BodyVoxels': int(l1body.sum()),
    'stages': STAGES,
    'gpu': {'name': info['gpu'], 'peakMiB': info['peakMiB']},
}, open('outputs/labels.json', 'w', encoding='utf-8'), ensure_ascii=False)
`;

/**
 * 計算機へ送るコード。設定は JSON 文字列として埋め込む（JSON の文字列リテラルは Python でもそのまま読める）。
 * @param {{ fast?: boolean }} [opts]
 */
export function buildScript(opts = {}) {
  const cfg = JSON.stringify({ version: TOTALSEG_VERSION, fast: !!opts.fast });
  return `GRAPHY = __import__('json').loads(${JSON.stringify(cfg)})\n` + PY;
}

/** 本体がデータを作らなかった理由（よく出るものだけ）。 */
const REFUSALS = {
  "npz-duplicate-positions": "同じ位置のスライスが 2 枚以上あります（撮影が 2 回ぶん混ざったシリーズなど）。1 回ぶんだけのシリーズで試してください",
  "npz-uneven-spacing": "スライスの間隔が揃っていません（欠けたスライスがある）",
  "npz-mixed-geometry": "向きや大きさの違う画像が混ざっています",
  "npz-too-large": "シリーズが大きすぎます",
  "permission-denied": "このプラグインに外部の計算機を使う許可がありません",
  "no-endpoint": "環境設定 ＞ 外部の計算機 で計算機を登録してください",
  "colab-signin-required": "環境設定 ＞ 外部の計算機 で Google にログインしてください（ログインすると Colab の GPU T4 が自動で登録されます）",
  "t4-not-available": "いまのプランでは Colab の GPU T4 が使えません。環境設定 ＞ 外部の計算機 で別の種類を登録してください",
  "colab-not-configured": "このアプリには Colab に接続するための設定が入っていません。Jupyter Server を登録してください",
};
export const explain = (code) => (code && REFUSALS[code] ? `${REFUSALS[code]}（${code}）` : String(code));

// ---------------------------------------------------------------------------
// 純関数（node --test で試す）
// ---------------------------------------------------------------------------

/**
 * numpy の .npy（v1/v2・C 順）を読む。対応は u1/u2/i4/f4。
 * @param {Uint8Array} bytes
 */
export function parseNpy(bytes) {
  const magic = [0x93, 0x4e, 0x55, 0x4d, 0x50, 0x59];
  if (bytes.length < 10 || magic.some((b, i) => bytes[i] !== b)) throw new Error("npy-magic");
  const major = bytes[6];
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const hlen = major === 1 ? dv.getUint16(8, true) : dv.getUint32(8, true);
  const hstart = major === 1 ? 10 : 12;
  const header = new TextDecoder("latin1").decode(bytes.subarray(hstart, hstart + hlen));
  const descr = /'descr':\s*'([^']+)'/.exec(header)?.[1];
  const fortran = /'fortran_order':\s*True/.test(header);
  const shape = (/'shape':\s*\(([^)]*)\)/.exec(header)?.[1] ?? "")
    .split(",").map((s) => s.trim()).filter(Boolean).map(Number);
  if (fortran) throw new Error("npy-fortran-order");
  const n = shape.reduce((a, b) => a * b, 1);
  const body = bytes.slice(hstart + hlen); // 揃った位置から読むために複写する
  /** @type {Record<string, (b: ArrayBuffer) => ArrayLike<number>>} */
  const make = {
    "|u1": (b) => new Uint8Array(b, 0, n),
    "<u1": (b) => new Uint8Array(b, 0, n),
    "<u2": (b) => new Uint16Array(b, 0, n),
    "<i4": (b) => new Int32Array(b, 0, n),
    "<f4": (b) => new Float32Array(b, 0, n),
  };
  if (!descr || !make[descr]) throw new Error("npy-dtype " + descr);
  return { dtype: descr, shape, data: make[descr](body.buffer) };
}

/**
 * 計算機から返ったラベル（npz と同じ格子 [z, y, x]）のスライスを、loadVolume の格子のスライスへ対応づける。
 * 患者座標で照らし合わせる（並び順の違いに強く、1 枚ずれていれば必ず止まる）。vis-monai と同じ。
 * @param {{ spacing: number[], origin: number[], direction: number[][] }} g  labels.json の geometry
 * @param {[number, number, number]} shapeZyx
 * @param {{ dims: [number, number, number], worldToIndex: number[] }} vol
 * @returns {{ ok: true, kMap: Int32Array } | { ok: false, error: string }}
 */
export function mapSlices(g, shapeZyx, vol) {
  const [nz, ny, nx] = shapeZyx;
  const [vx, vy, vz] = vol.dims;
  if (nx !== vx || ny !== vy || nz !== vz) return { ok: false, error: `grid-mismatch: ${nx}x${ny}x${nz} vs ${vx}x${vy}x${vz}` };
  const [dz, dy, dx] = g.spacing;
  const w2i = vol.worldToIndex;
  const toIndex = (p) => [0, 1, 2].map((r) => w2i[r * 4] * p[0] + w2i[r * 4 + 1] * p[1] + w2i[r * 4 + 2] * p[2] + w2i[r * 4 + 3]);
  const world = (i, j, k) => [0, 1, 2].map((a) =>
    g.origin[a] + i * dx * g.direction[0][a] + j * dy * g.direction[1][a] + k * dz * g.direction[2][a]);
  const kMap = new Int32Array(nz);
  const seen = new Uint8Array(nz);
  for (let k = 0; k < nz; k++) {
    const c0 = toIndex(world(0, 0, k));
    const ci = toIndex(world(nx - 1, 0, k));
    const cj = toIndex(world(0, ny - 1, k));
    const kk = Math.round(c0[2]);
    const tol = 0.25;
    const okPlane = Math.abs(c0[0]) < tol && Math.abs(c0[1]) < tol &&
      Math.abs(ci[0] - (nx - 1)) < tol && Math.abs(ci[1]) < tol &&
      Math.abs(cj[0]) < tol && Math.abs(cj[1] - (ny - 1)) < tol;
    if (!okPlane || Math.abs(c0[2] - kk) > tol || kk < 0 || kk >= nz || seen[kk]) {
      return { ok: false, error: `grid-mismatch at slice ${k}` };
    }
    seen[kk] = 1;
    kMap[k] = kk;
  }
  return { ok: true, kMap };
}

/**
 * 計算機から返ったラベル（npz の並び）を、`loadVolume` の並びの 1 本の volume に写す（同じ型のまま）。
 * @param {Uint8Array | Uint16Array} labels [z, y, x]
 * @param {Int32Array} kMap  npz の k → 本体の k
 * @param {number} nxy  1 スライスの画素数
 */
export function reorderLabels(labels, kMap, nxy) {
  const out = new /** @type {any} */ (labels.constructor)(labels.length);
  for (let k = 0; k < kMap.length; k++) {
    out.set(labels.subarray(k * nxy, (k + 1) * nxy), kMap[k] * nxy);
  }
  return out;
}

/** ラベル番号ごとに見分けやすい色（黄金角で色相を回す）。vis-monai と同じ。 */
export function colorFor(value) {
  const h = (value * 137.508) % 360;
  const s = 0.75, l = 0.55;
  const f = (n) => {
    const k = (n + h / 30) % 12;
    return Math.round(255 * (l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1))));
  };
  return /** @type {[number, number, number]} */ ([f(0), f(8), f(4)]);
}

/**
 * TotalSegmentator の class map（{"1": "spleen", …}）から 名前 → 番号 の表を作る。
 * @param {Record<string, string>} classMap
 */
export function idsByName(classMap) {
  const out = new Map();
  for (const [k, v] of Object.entries(classMap)) out.set(String(v), Number(k));
  return out;
}

/**
 * 複数のラベル（左右など）を 1 つにまとめる。平均はボクセル数で重みを付けた平均（同じ母集団の平均になる）。
 * @param {any[]} ms H66 の結果（まとめたいものだけ）
 */
export function combine(ms) {
  const voxelCount = ms.reduce((a, m) => a + m.voxelCount, 0);
  const volumeMl = ms.reduce((a, m) => a + m.volumeMl, 0);
  const weighted = (key) => {
    let n = 0, s = 0;
    for (const m of ms) {
      const st = m[key];
      if (st && Number.isFinite(st.mean)) { n += st.n; s += st.n * st.mean; }
    }
    return n > 0 ? s / n : NaN;
  };
  return { voxelCount, volumeMl, mean: weighted("stats"), erodedMean: weighted("eroded") };
}

/**
 * 臓器の表（主な臓器 → 合計 → その他）。CSV と画面で同じものを使う。
 * @param {any[]} measurements H66 の結果（全ラベル）
 * @param {Record<string, string>} classMap
 */
export function organRows(measurements, classMap) {
  const byLabel = new Map(measurements.map((m) => [m.label, m]));
  const ids = idsByName(classMap);
  const rows = [];
  const used = new Set();
  const push = (key, name, ms) => {
    if (ms.length === 0) return;
    const c = combine(ms);
    rows.push({ key, name, voxelCount: c.voxelCount, volumeMl: c.volumeMl, meanHu: c.mean, erodedMeanHu: c.erodedMean,
      sdHu: ms.length === 1 ? ms[0].stats?.sd ?? NaN : NaN });
  };
  for (const [key, name] of MAJOR) {
    const m = byLabel.get(ids.get(key));
    if (m) { used.add(m.label); push(key, name, [m]); }
  }
  for (const [name, keys] of GROUPS) {
    const ms = keys.map((k) => byLabel.get(ids.get(k))).filter(Boolean);
    ms.forEach((m) => used.add(m.label));
    push(keys.join("+"), name, ms);
  }
  for (const m of measurements) {
    if (used.has(m.label)) continue;
    push(classMap[String(m.label)] ?? `label ${m.label}`, classMap[String(m.label)] ?? `label ${m.label}`, [m]);
  }
  return rows;
}

/**
 * 肝・脾の CT 値。どちらかが無ければ差は NaN。
 * @param {any[]} measurements
 * @param {Record<string, string>} classMap
 */
export function liverSpleen(measurements, classMap) {
  const ids = idsByName(classMap);
  const pick = (k) => measurements.find((m) => m.label === ids.get(k));
  const liver = pick("liver");
  const spleen = pick("spleen");
  const lHu = liver?.stats?.mean ?? NaN;
  const sHu = spleen?.stats?.mean ?? NaN;
  return {
    liverMl: liver?.volumeMl ?? NaN,
    liverHu: lHu,
    liverErodedHu: liver?.eroded?.mean ?? NaN,
    spleenMl: spleen?.volumeMl ?? NaN,
    spleenHu: sHu,
    spleenErodedHu: spleen?.eroded?.mean ?? NaN,
    liverMinusSpleenHu: lHu - sHu,
  };
}

/**
 * 椎骨が撮影範囲の端で切れているか。すぐ上とすぐ下の椎骨がどちらも写っていれば、間に収まっている。
 * どちらかが無いときだけ、ラベルが端のスライスに触れているかで見る（理由は l3Slice の説明）。
 * @param {{ kRange: [number, number] }} m H66 の結果
 * @param {number} nz
 * @param {{ above: boolean, below: boolean }} neighbours
 */
export function vertebraCut(m, nz, neighbours) {
  const touches = m.kRange[0] === 0 || m.kRange[1] === nz - 1;
  return touches && !(neighbours.above && neighbours.below);
}

/**
 * L3 のスライスを決める: `vertebrae_L3` の重心に最も近い格子のスライス。
 *
 * 撮影範囲で切れていれば重心が本当の高さとずれるので測らない。切れているかは、すぐ上の L2 とすぐ下の L4 が
 * どちらも写っているかで見る（写っていれば L3 は両者の間に収まっている）。L3 の下関節突起は L4 の高さまで
 * 下りるので、「L3 のラベルが端のスライスに触れたら切れている」とすると、収まっている L3 まで弾いてしまう
 * （2026-10-05 の実機で発生: 端の 2 枚に 4・12 画素）。L2・L4 のどちらかが無いときだけ、端に触れているかで見る。
 * @param {any | undefined} l3 H66 の結果（vertebrae_L3）
 * @param {{ dims: [number, number, number], worldToIndex: number[] }} vol
 * @param {{ l2: boolean, l4: boolean }} [neighbours] L2・L4 が写っているか
 * @returns {{ ok: true, k: number } | { ok: false, reason: string }}
 */
export function l3Slice(l3, vol, neighbours = { l2: false, l4: false }) {
  if (!l3) return { ok: false, reason: "L3 椎体が見つかりませんでした（撮影範囲に入っていないか、認識できませんでした）" };
  const nz = vol.dims[2];
  if (vertebraCut(l3, nz, { above: neighbours.l2, below: neighbours.l4 })) {
    return { ok: false, reason: "L3 椎体が撮影範囲の端で切れています（L2・L4 の片方が写っておらず、重心が本当の高さとずれるので測りません）" };
  }
  const w = vol.worldToIndex;
  const [x, y, z] = l3.centroidLps;
  const k = Math.round(w[8] * x + w[9] * y + w[10] * z + w[11]);
  if (k < 0 || k >= nz) return { ok: false, reason: "L3 の高さが格子の外に出ました" };
  return { ok: true, k };
}

/**
 * L1 椎体（vertebrae_body と vertebrae_L1 の重なり）の CT 値。骨密度への換算や閾値での判定はしない。
 * 椎骨が撮影範囲で切れていれば出さない（切れた椎体の平均は別の部位の平均になる）。
 * @param {any | undefined} body H66 の結果（L1 椎体のマスク・ラベル 1）
 * @param {any | undefined} l1 H66 の結果（total の vertebrae_L1。切れているかの判定に使う）
 * @param {number} nz
 * @param {{ t12: boolean, l2: boolean }} neighbours
 * @returns {{ ok: true, volumeMl: number, voxelCount: number, meanHu: number, sdHu: number, erodedMeanHu: number, erodedVoxels: number } | { ok: false, reason: string }}
 */
export function l1BodyRow(body, l1, nz, neighbours) {
  if (!l1 || !body || body.voxelCount === 0) return { ok: false, reason: "L1 椎体が見つかりませんでした（撮影範囲に入っていないか、認識できませんでした）" };
  if (vertebraCut(l1, nz, { above: neighbours.t12, below: neighbours.l2 })) {
    return { ok: false, reason: "L1 が撮影範囲の端で切れています（T12・L2 の片方が写っていないので測りません）" };
  }
  return {
    ok: true,
    volumeMl: body.volumeMl,
    voxelCount: body.voxelCount,
    meanHu: body.stats?.mean ?? NaN,
    sdHu: body.stats?.sd ?? NaN,
    erodedMeanHu: body.eroded?.mean ?? NaN,
    erodedVoxels: body.eroded?.n ?? 0,
  };
}

/**
 * L3 のスライスでの筋の面積・CT 値（左右を合計）。身長（cm）があれば 面積 ÷ 身長²（cm²/m²）も出す。
 * @param {any[]} sliceMeasurements H66 の結果（slices に L3 の k を 1 つ渡したもの）
 * @param {Record<string, string>} classMap
 * @param {number | null} heightCm
 */
export function l3Muscles(sliceMeasurements, classMap, heightCm) {
  const ids = idsByName(classMap);
  const part = (keys, name) => {
    const ss = keys.map((key) => sliceMeasurements.find((m) => m.label === ids.get(key))?.slices?.[0]).filter(Boolean);
    const pixels = ss.reduce((a, s) => a + s.pixelCount, 0);
    const areaCm2 = ss.reduce((a, s) => a + s.areaCm2, 0);
    const sum = ss.reduce((a, s) => a + (s.pixelCount > 0 ? s.mean * s.pixelCount : 0), 0);
    const muscleAreaCm2 = ss.reduce((a, s) => a + (s.rangeAreasCm2?.[MUSCLE_HU.name] ?? 0), 0);
    const h = heightCm && heightCm > 0 ? heightCm / 100 : null;
    return {
      name,
      areaCm2,
      meanHu: pixels > 0 ? sum / pixels : NaN,
      muscleRangeAreaCm2: muscleAreaCm2,
      indexCm2PerM2: h ? areaCm2 / (h * h) : NaN,
    };
  };
  return [part(PSOAS, "大腰筋（左右の合計）"), part(PARASPINAL, "脊柱起立筋（左右の合計）")];
}

/**
 * L3 の骨格筋の全周の面積（SMA）。筋ごと（左右の合計）と合計。身長（cm）があれば SMA ÷ 身長²（SMI）。
 * @param {any[]} sliceMeasurements H66 の結果（abdominal_muscles のラベル・slices に L3 の k を 1 つ）
 * @param {Record<string, string>} muscleMap abdominal_muscles の class map
 * @param {number | null} heightCm
 */
export function l3Sma(sliceMeasurements, muscleMap, heightCm) {
  const ids = idsByName(muscleMap);
  const h = heightCm && heightCm > 0 ? heightCm / 100 : null;
  const sum = (ss) => {
    const pixels = ss.reduce((a, x) => a + x.pixelCount, 0);
    const areaCm2 = ss.reduce((a, x) => a + x.areaCm2, 0);
    const meanHu = pixels > 0 ? ss.reduce((a, x) => a + (x.pixelCount > 0 ? x.mean * x.pixelCount : 0), 0) / pixels : NaN;
    const muscleRangeAreaCm2 = ss.reduce((a, x) => a + (x.rangeAreasCm2?.[MUSCLE_HU.name] ?? 0), 0);
    return { pixels, areaCm2, meanHu, muscleRangeAreaCm2 };
  };
  const all = [];
  const parts = SMA_PARTS.map(([key, name]) => {
    const ss = ["right", "left"].map((side) => sliceMeasurements.find((m) => m.label === ids.get(`${key}_${side}`))?.slices?.[0]).filter(Boolean);
    all.push(...ss);
    return { key, name, ...sum(ss) };
  });
  const total = sum(all);
  return { parts, total: { ...total, smiCm2PerM2: h ? total.areaCm2 / (h * h) : NaN } };
}

const fmt = (v, d = 1) => (Number.isFinite(v) ? v.toFixed(d) : "");

/**
 * CSV（UTF-8・BOM 付き：Excel で文字化けしないように）。
 * @param {ReturnType<typeof organRows>} organs
 * @param {ReturnType<typeof liverSpleen>} ls
 * @param {ReturnType<typeof l3Muscles> | null} l3
 * @param {{ model: string, version: string, fast: boolean, seriesLabel: string, l3k: number | null, heightCm: number | null }} meta
 */
export function toCsv(organs, ls, l3, meta, l1 = null, sma = null) {
  const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
  const lines = [
    `# ${meta.model} ${meta.version}${meta.fast ? " (fast)" : ""} / ${meta.seriesLabel} / research use only`,
    "section,structure,volume_mL,mean_HU,sd_HU,mean_HU_eroded1,area_cm2,muscle_range_area_cm2,index_cm2_per_m2",
    ...organs.map((r) => ["organ", q(r.name), fmt(r.volumeMl, 2), fmt(r.meanHu), fmt(r.sdHu), fmt(r.erodedMeanHu), "", "", ""].join(",")),
    ["liver_spleen", q("liver - spleen (HU)"), "", fmt(ls.liverMinusSpleenHu), "", "", "", "", ""].join(","),
    ...(l3 ?? []).map((r) => ["L3", q(r.name), "", fmt(r.meanHu), "", "", fmt(r.areaCm2, 2), fmt(r.muscleRangeAreaCm2, 2), fmt(r.indexCm2PerM2, 2)].join(",")),
    ...(l1 && l1.ok ? [["L1", q("L1 vertebral body"), fmt(l1.volumeMl, 2), fmt(l1.meanHu), fmt(l1.sdHu), fmt(l1.erodedMeanHu), "", "", ""].join(",")] : []),
    ...(sma ? [
      ...sma.parts.map((r) => ["L3_SMA_part", q(r.key), "", fmt(r.meanHu), "", "", fmt(r.areaCm2, 2), fmt(r.muscleRangeAreaCm2, 2), ""].join(",")),
      ["L3_SMA", q("skeletal muscle area without transversus abdominis"), "", fmt(sma.total.meanHu), "", "", fmt(sma.total.areaCm2, 2), fmt(sma.total.muscleRangeAreaCm2, 2), fmt(sma.total.smiCm2PerM2, 2)].join(","),
    ] : []),
  ];
  if (meta.l3k != null) lines.push(`# L3 slice index k=${meta.l3k}${meta.heightCm ? ` / height ${meta.heightCm} cm` : ""}`);
  return "﻿" + lines.join("\r\n") + "\r\n";
}

/**
 * SR の計測グループ（臓器ごと・L3 の構造ごと）。値の無いものは入れない（SR は NaN を受け付けない）。
 * @param {ReturnType<typeof organRows>} organs
 * @param {ReturnType<typeof l3Muscles> | null} l3
 * @param {{ seriesUid: string }} target
 */
export function srGroups(organs, l3, target, l1 = null, sma = null) {
  const HU = "[hnsf'U]";
  const groups = [];
  for (const r of organs) {
    const measurements = [{ type: "volume", value: r.volumeMl, unit: "mL" }];
    if (Number.isFinite(r.meanHu)) measurements.push({ type: "meanValue", value: r.meanHu, unit: HU });
    if (Number.isFinite(r.sdHu)) measurements.push({ type: "stdDev", value: r.sdHu, unit: HU });
    groups.push({ trackingId: r.key, findingText: r.name, seriesInstanceUid: target.seriesUid, measurements });
  }
  for (const r of l3 ?? []) {
    if (!(r.areaCm2 > 0)) continue;
    const measurements = [{ type: "area", value: r.areaCm2, unit: "cm2" }];
    if (Number.isFinite(r.meanHu)) measurements.push({ type: "meanValue", value: r.meanHu, unit: HU });
    groups.push({ trackingId: `L3 ${r.name}`, findingText: `L3 level: ${r.name}`, seriesInstanceUid: target.seriesUid, measurements });
  }
  if (sma && sma.total.areaCm2 > 0) {
    const measurements = [{ type: "area", value: sma.total.areaCm2, unit: "cm2" }];
    if (Number.isFinite(sma.total.meanHu)) measurements.push({ type: "meanValue", value: sma.total.meanHu, unit: HU });
    groups.push({ trackingId: "L3 skeletal muscle area", findingText: "L3 level: skeletal muscle area (TotalSegmentator abdominal_muscles; transversus abdominis not included)", seriesInstanceUid: target.seriesUid, measurements });
  }
  if (l1 && l1.ok && Number.isFinite(l1.meanHu)) {
    const measurements = [{ type: "meanValue", value: l1.meanHu, unit: HU }];
    if (Number.isFinite(l1.sdHu)) measurements.push({ type: "stdDev", value: l1.sdHu, unit: HU });
    groups.push({ trackingId: "L1 vertebral body", findingText: `L1 vertebral body (no BMD conversion). Mean excluding 1-voxel border: ${fmt(l1.erodedMeanHu)} HU`, seriesInstanceUid: target.seriesUid, measurements });
  }
  return groups;
}

// ---------------------------------------------------------------------------
// 画面
// ---------------------------------------------------------------------------

/** @param {any} host */
export async function activate(host) {
  const target = (host.getTargets?.() ?? []).find((t) => t.kind === "image");
  if (!target) {
    host.notify("CT 定量: 画像のタイルを選んでから開いてください");
    return;
  }
  if (typeof host.measureLabels !== "function") {
    host.notify("CT 定量: この GRAPHY-Next では使えません（本体を新しい版に更新してください）");
    return;
  }
  const win = host.openWindow({ title: "CT 臓器体積・体組成（研究用）", width: 760, height: 820 });
  const root = win.container;
  root.style.cssText = "font: 13px system-ui, sans-serif; padding: 12px; overflow: auto; display: flex; flex-direction: column; gap: 8px;";
  /** @type {Record<string, any>} */
  const state = (/** @type {any} */ (window).__ctQuantState = { phase: "idle" });

  const el = (tag, props = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === "testid") e.dataset.testid = v;
      else if (k === "style") e.style.cssText = v;
      else e[k] = v;
    }
    for (const c of kids) e.append(c);
    return e;
  };
  const isCt = String(target.modality).toUpperCase() === "CT";
  const fast = el("input", { type: "checkbox", testid: "ctq-fast" });
  const runBtn = el("button", { textContent: "実行", testid: "ctq-run", disabled: !isCt });
  const height = el("input", { type: "number", min: "50", max: "250", step: "0.1", placeholder: "身長 cm（任意）", testid: "ctq-height", style: "width: 9em" });
  const status = el("div", { testid: "ctq-status", style: "color: #52606d; min-height: 1.2em" });
  const tabs = el("div", { style: "display: none; gap: 4px" });
  const panes = { organs: el("div", { testid: "ctq-organs" }), liver: el("div", { testid: "ctq-liver" }), l3: el("div", { testid: "ctq-l3" }), bone: el("div", { testid: "ctq-bone" }) };
  const saveRow = el("div", { style: "display: none; gap: 6px; flex-wrap: wrap" });
  const result = el("div", { testid: "ctq-result" });
  const cell = "padding: 2px 8px; border-bottom: 1px solid #e6eaee";
  root.append(
    el("div", {
      testid: "ctq-research-only",
      textContent: "研究用です。診断・判定には使わないでください。数値はセグメンテーションの結果に依存します。必ず画像で確かめてください。",
      style: "font-size: 12px; color: #8a4b00; background: #fdf0e3; border: 1px solid #e0b884; border-radius: 4px; padding: 4px 8px",
    }),
    el("div", {}, `対象: ${target.seriesLabel}（${target.modality}・${target.sliceCount} 枚）${isCt ? "" : " — CT のシリーズだけに使えます"}`),
    el("div", { style: "display: flex; gap: 12px; align-items: center" },
      runBtn, el("label", {}, fast, " 低解像度で速く（3 mm。数値が変わります）"), el("label", {}, "身長 ", height)),
    el("div", { style: "font-size: 11px; color: #52606d" },
      `「実行」で、匿名化したこのシリーズを外部の計算機へ送り、TotalSegmentator ${TOTALSEG_VERSION}（total・重みは Apache-2.0）で 117 の構造に分けます。` +
      "体積と CT 値は本体が測ります（H66）。"),
    status, tabs, panes.organs, panes.liver, panes.l3, panes.bone, saveRow, result,
  );
  const tabBtns = /** @type {Array<[keyof typeof panes, string]>} */ ([["organs", "臓器"], ["liver", "肝・脾"], ["l3", "L3"], ["bone", "L1 椎体"]]).map(([key, label]) => {
    const b = el("button", { textContent: label, testid: `ctq-tab-${key}` });
    b.addEventListener("click", () => showTab(key));
    return b;
  });
  tabs.append(...tabBtns);
  /** @param {keyof typeof panes} key */
  function showTab(key) {
    for (const [k, p] of Object.entries(panes)) p.style.display = k === key ? "block" : "none";
    tabBtns.forEach((b, i) => { b.style.fontWeight = ["organs", "liver", "l3", "bone"][i] === key ? "bold" : "normal"; });
  }
  Object.values(panes).forEach((p) => { p.style.display = "none"; });

  const setStatus = (t) => { status.textContent = t; };
  const onProgress = (p, m) => setStatus(`${Math.round(p * 100)}% ${m ?? ""}`);
  const busy = (b) => {
    state.phase = b ? "running" : "idle";
    runBtn.disabled = b || !isCt;
    saveRow.querySelectorAll("button").forEach((x) => { /** @type {HTMLButtonElement} */ (x).disabled = b; });
  };
  win.setCloseGuard?.(() => (state.phase === "running" ? "計算の途中です。閉じると結果を受け取れません。" : null));
  win.onClose(async () => {
    if (!state.usedCompute || !host.compute.status) return;
    for (const e of await host.compute.status()) {
      if (e.kind === "colab" && e.runtime?.allocated) state.release = await host.compute.releaseRuntime(e.id, { ask: true });
    }
  });

  const table = (head, rows) => el("table", { style: "border-collapse: collapse; font-size: 12px" },
    el("tr", {}, ...head.map((h) => el("th", { textContent: h, style: cell + "; text-align: left; color: #334e68" }))),
    ...rows.map((r) => el("tr", {}, ...r.map((v, i) => el("td", { textContent: v, style: cell + (i > 0 ? "; text-align: right" : "") })))));

  function renderOrgans() {
    panes.organs.replaceChildren(table(
      ["構造", "体積 mL", "平均 HU", "SD HU", "平均 HU（境界 1 ボクセルを除く）"],
      state.organs.map((r) => [r.name, fmt(r.volumeMl, 1), fmt(r.meanHu), fmt(r.sdHu), fmt(r.erodedMeanHu)])));
  }

  function renderLiver() {
    const ls = state.ls;
    panes.liver.replaceChildren(
      table(["", "体積 mL", "平均 HU", "平均 HU（境界を除く）"], [
        ["肝臓", fmt(ls.liverMl, 1), fmt(ls.liverHu), fmt(ls.liverErodedHu)],
        ["脾臓", fmt(ls.spleenMl, 1), fmt(ls.spleenHu), fmt(ls.spleenErodedHu)],
      ]),
      el("div", { testid: "ctq-liver-diff", textContent: `肝 − 脾: ${fmt(ls.liverMinusSpleenHu)} HU`, style: "margin-top: 6px; font-weight: bold" }),
      el("div", { style: "font-size: 11px; color: #8a4b00", textContent: "CT 値の意味は撮影の時相で変わります。脂肪肝の目安として読めるのは単純 CT のときだけです（時相は判定していません）。" }));
  }

  function renderL3() {
    if (!state.l3.ok) {
      panes.l3.replaceChildren(el("div", { testid: "ctq-l3-unavailable", textContent: state.l3.reason, style: "color: #b42318" }));
      return;
    }
    const h = Number(height.value);
    state.l3Rows = l3Muscles(state.l3Measure, state.classMap, h > 0 ? h : null);
    state.sma = l3Sma(state.smaMeasure ?? [], state.summary.muscleMap, h > 0 ? h : null);
    const canvas = el("canvas", { testid: "ctq-l3-preview", style: "max-width: 100%; border: 1px solid #ccd" });
    drawSlice(canvas, state.l3.k);
    panes.l3.replaceChildren(
      el("div", {}, `L3 椎体の重心の高さ（スライス k = ${state.l3.k}）`),
      table(["構造", "面積 cm²", "平均 HU", `うち ${MUSCLE_HU.min}〜${MUSCLE_HU.max} HU の面積 cm²`, "面積 ÷ 身長² cm²/m²"],
        state.l3Rows.map((r) => [r.name, fmt(r.areaCm2, 2), fmt(r.meanHu), fmt(r.muscleRangeAreaCm2, 2), fmt(r.indexCm2PerM2, 2)])),
      el("div", { style: "font-weight: bold; margin-top: 8px", textContent: "骨格筋の全周（SMA・腹横筋を除く）" }),
      table(["筋（左右の合計）", "面積 cm²", "平均 HU", `うち ${MUSCLE_HU.min}〜${MUSCLE_HU.max} HU の面積 cm²`],
        [...state.sma.parts.map((r) => [r.name, fmt(r.areaCm2, 2), fmt(r.meanHu), fmt(r.muscleRangeAreaCm2, 2)]),
          ["合計（SMA）", fmt(state.sma.total.areaCm2, 2), fmt(state.sma.total.meanHu), fmt(state.sma.total.muscleRangeAreaCm2, 2)]]),
      el("div", { testid: "ctq-smi", textContent: `SMA ÷ 身長²（SMI）: ${Number.isFinite(state.sma.total.smiCm2PerM2) ? state.sma.total.smiCm2PerM2.toFixed(2) + " cm²/m²" : "身長を入れると出ます"}` }),
      el("div", { style: "font-size: 11px; color: #52606d", textContent:
        "面積は画素の数え上げ × 画素面積です。基準値による判定はしていません。SMA の定義（大腰筋・傍脊柱筋・腰方形筋・腹横筋・外腹斜筋・内腹斜筋・腹直筋）のうち、" +
        "腹横筋は TotalSegmentator abdominal_muscles に無いので入っておらず、文献の SMA より小さく出ます。abdominal_muscles は小さい別のデータで学習したモデルです（頑健さは total より劣ると作者が注記）。皮下脂肪・内臓脂肪は、使えるモデルが商用ライセンス制なので出していません。" }),
      canvas);
  }
  height.addEventListener("input", () => { if (state.l3) renderL3(); });

  function renderBone() {
    const r = state.l1;
    if (!r.ok) { panes.bone.replaceChildren(el("div", { testid: "ctq-l1-unavailable", textContent: r.reason, style: "color: #b42318" })); return; }
    panes.bone.replaceChildren(
      table(["", "体積 mL", "平均 HU", "SD HU", "平均 HU（境界 1 ボクセルを除く）"], [["L1 椎体", fmt(r.volumeMl, 1), fmt(r.meanHu), fmt(r.sdHu), fmt(r.erodedMeanHu)]]),
      el("div", { style: "font-size: 11px; color: #8a4b00", textContent:
        "椎体（椎弓を含まない・TotalSegmentator vertebrae_body）と L1 の重なりの平均 CT 値です。骨密度（mg/cm³）への換算や、基準値による判定はしていません。" +
        "文献の測り方（椎体中央の海綿骨に置いた ROI）とは範囲が違います（皮質骨を含みます。境界を除いた値も参考に）。造影 CT では値が上がります。" }));
  }

  /** L3 のスライスに、大腰筋・脊柱起立筋だけを色で重ねる（目で確かめるため）。 */
  function drawSlice(canvas, k) {
    const { data, vol } = state.labels;
    const [nx, ny] = vol.dims;
    const nxy = nx * ny;
    const ids = idsByName(state.classMap);
    const show = new Set([...PSOAS, ...PARASPINAL].map((n) => ids.get(n)));
    // 重ね表示は SMA の筋（abdominal_muscles）を優先する。無ければ total の大腰筋・脊柱起立筋
    const mids = idsByName(state.summary.muscleMap);
    const smaIds = new Set(SMA_PARTS.flatMap(([key]) => ["right", "left"].map((side) => mids.get(`${key}_${side}`))));
    canvas.width = nx; canvas.height = ny;
    const ctx = /** @type {CanvasRenderingContext2D} */ (canvas.getContext("2d"));
    const im = ctx.createImageData(nx, ny);
    const lo = 40 - 200, hi = 40 + 200;   // 腹部の窓（HU 40±200）
    for (let p = 0; p < nxy; p++) {
      const g = Math.max(0, Math.min(255, ((vol.data[k * nxy + p] - lo) / (hi - lo)) * 255));
      const mv = state.muscles ? state.muscles[k * nxy + p] : 0;
      const v = data[k * nxy + p];
      const c = smaIds.has(mv) ? colorFor(mv + 200) : show.has(v) ? colorFor(v) : null;
      im.data[p * 4] = c ? (g + c[0]) / 2 : g;
      im.data[p * 4 + 1] = c ? (g + c[1]) / 2 : g;
      im.data[p * 4 + 2] = c ? (g + c[2]) / 2 : g;
      im.data[p * 4 + 3] = 255;
    }
    ctx.putImageData(im, 0, 0);
    canvas.style.width = Math.min(nx, 512) + "px";
  }

  runBtn.addEventListener("click", async () => {
    Object.assign(state, { summary: null, labels: null, measurements: null, error: undefined });
    tabs.style.display = "none"; saveRow.style.display = "none"; result.replaceChildren();
    Object.values(panes).forEach((p) => { p.style.display = "none"; p.replaceChildren(); });
    busy(true);
    state.usedCompute = true;
    setStatus("送っています…");
    const r = await host.compute.runJob({
      inputs: [{ studyUid: target.studyUid, seriesUid: target.seriesUid, format: "npz" }],
      script: buildScript({ fast: fast.checked }),
      timeoutSec: 3600,
    }, { onProgress });
    if (!r.ok) {
      state.error = r.error;
      setStatus(r.cancelled ? "取り消しました" : `失敗: ${explain(r.error)}`);
      busy(false);
      return;
    }
    if (r.status !== "ok") {
      state.error = `${r.errorName}: ${r.errorValue}`;
      state.traceback = r.traceback;
      state.stderr = r.stderr;
      setStatus(`失敗: ${r.errorName}: ${r.errorValue}`);
      busy(false);
      return;
    }
    const [lj, ln, lb, lm] = await Promise.all([r.readFile("labels.json"), r.readFile("labels.npy"), r.readFile("l1body.npy"), r.readFile("muscles.npy")]);
    if (!lj || !ln || !lb || !lm) { setStatus("失敗: 結果が返りませんでした"); busy(false); return; }
    const summary = JSON.parse(new TextDecoder().decode(lj));
    const npy = parseNpy(ln);
    setStatus("ボリュームを読み込んでいます…");
    const vol = await host.loadVolume({ studyUid: target.studyUid, seriesUid: target.seriesUid });
    if (!vol) { setStatus("失敗: ボリュームを読めませんでした"); busy(false); return; }
    const mapped = mapSlices(summary.geometry, /** @type {any} */ (npy.shape), vol);
    if (!mapped.ok) { state.error = mapped.error; setStatus(`失敗: ${mapped.error}`); busy(false); return; }
    state.summary = summary;
    state.classMap = summary.classMap;
    const data = reorderLabels(/** @type {any} */ (npy.data), mapped.kMap, vol.dims[0] * vol.dims[1]);
    state.labels = { data, vol };

    setStatus("測っています…");
    const labelsIn = { data, dims: vol.dims, indexToWorld: vol.indexToWorld };
    state.measurements = host.measureLabels(labelsIn, vol, { erodeVoxels: 1 });
    state.organs = organRows(state.measurements, state.classMap);
    state.ls = liverSpleen(state.measurements, state.classMap);
    const ids = idsByName(state.classMap);
    const present = (name) => state.measurements.some((m) => m.label === ids.get(name));
    state.l3 = l3Slice(state.measurements.find((m) => m.label === ids.get(L3)), vol, { l2: present("vertebrae_L2"), l4: present("vertebrae_L4") });
    if (state.l3.ok) {
      state.l3Measure = host.measureLabels(labelsIn, vol, {
        labels: [...PSOAS, ...PARASPINAL].map((n) => ids.get(n)).filter((v) => v != null),
        slices: [state.l3.k],
        valueRanges: [MUSCLE_HU],
      });
    }
    // L1 椎体（別のマスク・ラベル 1）。同じ格子の対応で写す
    const body = reorderLabels(/** @type {any} */ (parseNpy(lb).data), mapped.kMap, vol.dims[0] * vol.dims[1]);
    const [bodyMeasure] = host.measureLabels({ data: body, dims: vol.dims, indexToWorld: vol.indexToWorld }, vol, { erodeVoxels: 1 });
    state.l1BodyMeasure = bodyMeasure ?? null;
    state.l1 = l1BodyRow(bodyMeasure, state.measurements.find((m) => m.label === ids.get("vertebrae_L1")), vol.dims[2],
      { t12: present("vertebrae_T12"), l2: present("vertebrae_L2") });
    // 骨格筋（abdominal_muscles・別のラベルの volume）。L3 が測れるときだけ、そのスライスで測る
    state.muscles = reorderLabels(/** @type {any} */ (parseNpy(lm).data), mapped.kMap, vol.dims[0] * vol.dims[1]);
    if (state.l3.ok) {
      const mids = Object.keys(summary.muscleMap).map(Number);
      state.smaMeasure = host.measureLabels({ data: state.muscles, dims: vol.dims, indexToWorld: vol.indexToWorld }, vol, { labels: mids, slices: [state.l3.k], valueRanges: [MUSCLE_HU] });
    }
    renderOrgans(); renderLiver(); renderL3(); renderBone();
    tabs.style.display = "flex";
    showTab("organs");
    renderSaveRow();

    // H65: ROI マネージャへ（表示だけ。保存は下のボタン）
    if (host.showLabelVolume) {
      const values = state.measurements.map((m) => m.label);
      state.shown = await host.showLabelVolume(target.tileId, {
        grid: { dims: vol.dims, ipp: vol.ipp, sliceStep: vol.sliceStep },
        data,
        table: values.map((v) => ({ value: v, label: state.classMap[String(v)] ?? `label ${v}`, color: colorFor(v) })),
        label: `TotalSegmentator ${summary.version}`,
      });
      result.textContent = state.shown.ok ? `ROI マネージャに読み込みました（${state.shown.segmentCount} 構造）。` : `ROI マネージャに読み込めませんでした: ${state.shown.error}`;
    }
    setStatus(`できました（${summary.stages?.done ?? "?"} 秒・${summary.gpu?.name ?? "?"}・最大 ${summary.gpu?.peakMiB ?? "?"} MiB${summary.fast ? "・低解像度" : ""}）`);
    busy(false);
  });

  const modelText = () => `TotalSegmentator ${state.summary.version} total${state.summary.fast ? " fast" : ""}`;

  function renderSaveRow() {
    const seg = el("button", { textContent: "SEG で保存", testid: "ctq-save-seg" });
    const sr = el("button", { textContent: "SR で保存", testid: "ctq-save-sr" });
    const csv = el("button", { textContent: "CSV で保存", testid: "ctq-save-csv" });
    saveRow.replaceChildren(seg, sr, csv);
    saveRow.style.display = "flex";

    seg.addEventListener("click", async () => {
      const { data, vol } = state.labels;
      busy(true);
      const res = await host.saveSegmentation({
        reference: { studyUid: target.studyUid, seriesUid: target.seriesUid },
        grid: { dims: vol.dims, spacing: vol.spacing, ipp: vol.ipp, iop: vol.iop, sliceStep: vol.sliceStep },
        seriesDescription: modelText(),
        labels: {
          data,
          table: state.measurements.map((m) => ({ value: m.label, label: state.classMap[String(m.label)] ?? `label ${m.label}`, color: colorFor(m.label), description: modelText() })),
        },
      });
      state.savedSeg = res;
      result.textContent = res.ok ? `SEG を保存しました（${res.seriesInstanceUid}）。` : res.cancelled ? "保存を取り消しました" : `SEG の保存に失敗しました: ${res.error}`;
      busy(false);
    });

    sr.addEventListener("click", async () => {
      busy(true);
      const res = await host.saveStructuredReport(target.tileId, {
        seriesDescription: "CT quantification (research)",
        documentTitle: `CT organ volume and body composition — ${modelText()} (research use only)`,
        groups: srGroups(state.organs, state.l3.ok ? state.l3Rows : null, target, state.l1, state.l3.ok ? state.sma : null),
        findings: [{ label: "Note", text: `Segmentation by ${modelText()}. Measured by GRAPHY-Next H66. Research use only; not for diagnosis.` }],
      });
      state.savedSr = res;
      result.textContent = res.ok ? `SR を保存しました（${res.seriesInstanceUid}）。` : res.cancelled ? "保存を取り消しました" : `SR の保存に失敗しました: ${res.error}`;
      busy(false);
    });

    csv.addEventListener("click", async () => {
      const text = toCsv(state.organs, state.ls, state.l3.ok ? state.l3Rows : null, {
        model: "TotalSegmentator", version: state.summary.version, fast: state.summary.fast,
        seriesLabel: target.seriesLabel, l3k: state.l3.ok ? state.l3.k : null, heightCm: Number(height.value) > 0 ? Number(height.value) : null,
      }, state.l1, state.l3.ok ? state.sma : null);
      const res = await host.file.saveAs({ defaultName: "ct-quant.csv", bytes: new TextEncoder().encode(text), filters: [{ name: "CSV", extensions: ["csv"] }] });
      state.savedCsv = res;
      if (res.ok) result.textContent = `CSV を保存しました（${res.filePath}）。`;
      else if (!res.canceled) result.textContent = `CSV の保存に失敗しました: ${res.error ?? "不明"}`;
    });
  }
}
