// node --test
//
// 計算機の上のコード（PY）も試すときは、numpy・nibabel のある Python を渡す:
//   GRAPHY_TEST_PYTHON=C:\Users\...\python.exe node --test
// TotalSegmentator と torch は偽物（入力の閾値で 2 ラベルを作る）に差し替える。確かめるのは「npz → NIfTI → 結果 → npz の格子」の往復。
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import {
  MUSCLE_HU, TOTALSEG_VERSION, buildScript, combine, idsByName, l1BodyRow, l3Muscles, l3Sma, l3Slice, liverSpleen, vertebraCut,
  mapSlices, organRows, parseNpy, reorderLabels, srGroups, toCsv,
} from "./ui.js";

const CLASS_MAP = {
  1: "spleen", 5: "liver", 10: "lung_upper_lobe_left", 13: "lung_upper_lobe_right", 29: "vertebrae_L3",
  86: "autochthon_left", 87: "autochthon_right", 88: "iliopsoas_left", 89: "iliopsoas_right", 99: "other_thing",
};

/** H66 の結果を手で作る（stats は summarizeValues の形の一部）。 */
const m = (label, n, mean, extra = {}) => ({
  label, voxelCount: n, volumeMl: n / 1000, unit: "HU",
  stats: { n, mean, sd: 10, min: mean - 1, max: mean + 1, median: mean },
  eroded: { n: Math.floor(n / 2), mean: mean + 1, sd: 5 },
  kRange: [2, 8], centroidLps: [0, 0, 0], slices: [], ...extra,
});

test("idsByName inverts the class map", () => {
  const ids = idsByName(CLASS_MAP);
  assert.equal(ids.get("vertebrae_L3"), 29);
  assert.equal(ids.get("iliopsoas_right"), 89);
});

test("combine weights the mean by voxel count", () => {
  const c = combine([m(10, 100, -800), m(13, 300, -900)]);
  assert.equal(c.voxelCount, 400);
  assert.equal(c.volumeMl, 0.4);
  assert.equal(c.mean, (100 * -800 + 300 * -900) / 400);
  assert.equal(c.erodedMean, (50 * -799 + 150 * -899) / 200);
});

test("organRows puts major organs first, sums the lung lobes and keeps the rest", () => {
  const rows = organRows([m(1, 200, 45), m(5, 1500, 55), m(10, 100, -800), m(13, 300, -900), m(99, 7, 0)], CLASS_MAP);
  assert.deepEqual(rows.map((r) => r.name), ["肝臓", "脾臓", "肺（5 葉の合計）", "other_thing"]);
  assert.equal(rows[2].volumeMl, 0.4);
  assert.ok(Number.isNaN(rows[2].sdHu), "合計の行に SD は出さない（左右の SD を足しても意味が無い）");
  assert.equal(rows[0].sdHu, 10);
});

test("liverSpleen gives liver minus spleen, NaN when one is missing", () => {
  const ls = liverSpleen([m(1, 200, 45), m(5, 1500, 55)], CLASS_MAP);
  assert.equal(ls.liverMinusSpleenHu, 10);
  assert.equal(ls.liverErodedHu, 56);
  assert.ok(Number.isNaN(liverSpleen([m(5, 1500, 55)], CLASS_MAP).liverMinusSpleenHu));
});

test("l3Slice takes the slice nearest to the L3 centroid and refuses a cut-off vertebra", () => {
  // k = z / 2.5（worldToIndex の 3 行目）
  const vol = { dims: /** @type {[number, number, number]} */ ([4, 4, 20]), worldToIndex: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.4, 0, 0, 0, 0, 1] };
  assert.deepEqual(l3Slice(m(29, 50, 300, { centroidLps: [0, 0, 26.4], kRange: [8, 13] }), vol), { ok: true, k: 11 });
  assert.equal(l3Slice(undefined, vol).ok, false);
  assert.equal(l3Slice(m(29, 50, 300, { kRange: [0, 5] }), vol).ok, false);
  assert.equal(l3Slice(m(29, 50, 300, { kRange: [15, 19] }), vol).ok, false);
  assert.equal(l3Slice(m(29, 50, 300, { kRange: [0, 13] }), vol, { l2: true, l4: false }).ok, false);
});

test("l3Slice accepts an L3 that touches the edge when L2 and L4 are both in the scan", () => {
  // 2026-10-05 の実機: L3 の下関節突起が L4 の高さ（端の 2 枚）に数画素だけ出ていた
  const vol = { dims: /** @type {[number, number, number]} */ ([4, 4, 43]), worldToIndex: [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0.2, 0, 0, 0, 0, 1] };
  assert.deepEqual(l3Slice(m(29, 50, 300, { centroidLps: [0, 0, 43], kRange: [0, 13] }), vol, { l2: true, l4: true }), { ok: true, k: 9 });
});

test("vertebraCut trusts both neighbours and otherwise looks at the edges", () => {
  assert.equal(vertebraCut({ kRange: [0, 9] }, 40, { above: true, below: true }), false);
  assert.equal(vertebraCut({ kRange: [0, 9] }, 40, { above: true, below: false }), true);
  assert.equal(vertebraCut({ kRange: [3, 9] }, 40, { above: false, below: false }), false);
  assert.equal(vertebraCut({ kRange: [3, 39] }, 40, { above: false, below: true }), true);
});

test("l1BodyRow reports the vertebral body CT value and refuses a cut-off L1", () => {
  const body = m(1, 400, 180, { eroded: { n: 120, mean: 150, sd: 20 } });
  const l1 = m(31, 900, 300, { kRange: [5, 15] });
  const r = l1BodyRow(body, l1, 40, { t12: true, l2: true });
  assert.equal(r.ok, true);
  assert.deepEqual([r.meanHu, r.erodedMeanHu, r.erodedVoxels, r.voxelCount], [180, 150, 120, 400]);
  assert.equal(l1BodyRow(body, m(31, 900, 300, { kRange: [0, 15] }), 40, { t12: false, l2: true }).ok, false);
  assert.equal(l1BodyRow(undefined, l1, 40, { t12: true, l2: true }).ok, false);
  assert.equal(l1BodyRow(m(1, 0, NaN), l1, 40, { t12: true, l2: true }).ok, false);
});

test("l3Sma sums the SMA muscles (left and right), skips other muscles and divides by height squared", () => {
  const MM = { 1: "pectoralis_major_right", 3: "rectus_abdominis_right", 4: "rectus_abdominis_left", 19: "psoas_major_right", 20: "psoas_major_left", 7: "latissimus_dorsi_right" };
  const sl = (pixelCount, areaCm2, mean, muscle) => [{ k: 9, pixelCount, areaCm2, mean, rangeAreasCm2: { [MUSCLE_HU.name]: muscle } }];
  const ms = [m(3, 0, 0, { slices: sl(100, 5, 40, 4) }), m(4, 0, 0, { slices: sl(100, 5, 20, 5) }),
    m(19, 0, 0, { slices: sl(200, 8, 50, 8) }), m(7, 0, 0, { slices: sl(500, 30, 45, 30) })];
  const r = l3Sma(ms, MM, 160);
  const rect = r.parts.find((x) => x.key === "rectus_abdominis");
  assert.equal(rect.areaCm2, 10);
  assert.equal(rect.meanHu, 30);
  assert.equal(r.total.areaCm2, 18, "広背筋は SMA に入れない");
  assert.equal(r.total.meanHu, (100 * 40 + 100 * 20 + 200 * 50) / 400);
  assert.equal(r.total.muscleRangeAreaCm2, 17);
  assert.ok(Math.abs(r.total.smiCm2PerM2 - 18 / 1.6 ** 2) < 1e-12);
  assert.equal(r.parts.find((x) => x.key === "quadratus_lumborum").areaCm2, 0);
  assert.ok(Number.isNaN(l3Sma(ms, MM, null).total.smiCm2PerM2));
});

test("l3Muscles sums left and right and divides by height squared", () => {
  const slice = (pixelCount, areaCm2, mean, muscle) => [{ k: 11, pixelCount, areaCm2, mean, rangeAreasCm2: { [MUSCLE_HU.name]: muscle } }];
  const ms = [
    m(88, 0, 0, { slices: slice(100, 8, 40, 7.5) }), m(89, 0, 0, { slices: slice(300, 10, 50, 9) }),
    m(86, 0, 0, { slices: slice(200, 20, 30, 18) }),
  ];
  const [psoas, para] = l3Muscles(ms, CLASS_MAP, 170);
  assert.equal(psoas.areaCm2, 18);
  assert.equal(psoas.meanHu, (100 * 40 + 300 * 50) / 400);
  assert.equal(psoas.muscleRangeAreaCm2, 16.5);
  assert.ok(Math.abs(psoas.indexCm2PerM2 - 18 / 1.7 ** 2) < 1e-12);
  assert.equal(para.areaCm2, 20);
  assert.ok(Number.isNaN(l3Muscles(ms, CLASS_MAP, null)[0].indexCm2PerM2));
});

test("toCsv has a BOM, a model line and one row per structure", () => {
  const organs = organRows([m(5, 1500, 55), m(1, 200, 45)], CLASS_MAP);
  const csv = toCsv(organs, liverSpleen([m(1, 200, 45), m(5, 1500, 55)], CLASS_MAP), null,
    { model: "TotalSegmentator", version: "2.18.0", fast: false, seriesLabel: "PRE LIVER", l3k: null, heightCm: null });
  assert.equal(csv.charCodeAt(0), 0xfeff);
  const lines = csv.slice(1).trim().split("\r\n");
  assert.match(lines[0], /^# TotalSegmentator 2\.18\.0 \/ PRE LIVER \/ research use only$/);
  assert.equal(lines.length, 2 + organs.length + 1);
  assert.match(lines[2], /^organ,"肝臓",1\.50,55\.0,10\.0,56\.0,,,$/);
  const withL1 = toCsv(organs, liverSpleen([m(1, 200, 45), m(5, 1500, 55)], CLASS_MAP), null,
    { model: "TotalSegmentator", version: "2.18.0", fast: false, seriesLabel: "PRE LIVER", l3k: null, heightCm: null },
    { ok: true, volumeMl: 30, voxelCount: 400, meanHu: 180, sdHu: 20, erodedMeanHu: 150, erodedVoxels: 120 });
  assert.match(withL1, /^L1,"L1 vertebral body",30\.00,180\.0,20\.0,150\.0,,,\r?$/m);
});

test("srGroups skips values the SR cannot hold and uses UCUM units", () => {
  const organs = organRows([m(5, 1500, -5), m(10, 100, -800), m(13, 300, -900)], CLASS_MAP);
  const g = srGroups(organs, [{ name: "大腰筋", areaCm2: 18, meanHu: 45, muscleRangeAreaCm2: 16, indexCm2PerM2: NaN }, { name: "x", areaCm2: 0, meanHu: NaN }], { seriesUid: "1.2" });
  assert.equal(g.length, 3);
  assert.deepEqual(g[0].measurements.map((x) => [x.type, x.unit]), [["volume", "mL"], ["meanValue", "[hnsf'U]"], ["stdDev", "[hnsf'U]"]]);
  assert.equal(g[0].measurements[1].value, -5, "平均 CT 値は負のまま入る");
  assert.deepEqual(g[1].measurements.map((x) => x.type), ["volume", "meanValue"], "合計の行は SD を出さない");
  assert.deepEqual(g[2].measurements.map((x) => x.type), ["area", "meanValue"]);
  for (const grp of g) for (const x of grp.measurements) assert.ok(Number.isFinite(x.value));
  const g2 = srGroups(organs, null, { seriesUid: "1.2" }, { ok: true, volumeMl: 30, voxelCount: 400, meanHu: 180, sdHu: 20, erodedMeanHu: 150, erodedVoxels: 120 });
  assert.deepEqual(g2.at(-1).measurements.map((x) => x.type), ["meanValue", "stdDev"]);
  assert.match(g2.at(-1).findingText, /no BMD conversion/);
});

test("buildScript pins the version and passes the code inspector limits", () => {
  const code = buildScript({ fast: true });
  assert.ok(code.length < 64 * 1024);
  assert.equal(/[A-Za-z0-9+/=_-]{200,}/.test(code), false);
  assert.equal(/[0-9.,\s-]{400,}/.test(code), false);
  const cfg = JSON.parse(JSON.parse(/loads\((".*")\)$/.exec(code.split("\n")[0])[1]));
  assert.deepEqual(cfg, { version: TOTALSEG_VERSION, fast: true });
});

// ---------------------------------------------------------------------------
// PY の往復（偽の TotalSegmentator で）
// ---------------------------------------------------------------------------
const PYTHON = process.env.GRAPHY_TEST_PYTHON;

const FAKE = {
  "torch/__init__.py": `
class _Cuda:
    def is_available(self): return __import__('os').environ.get('FAKE_NO_GPU') != '1'
    def reset_peak_memory_stats(self): pass
    def max_memory_allocated(self): return 3 * 1048576
    def get_device_name(self, i): return 'Fake T4'
cuda = _Cuda()
`,
  "totalsegmentator/__init__.py": "",
  "totalsegmentator/map_to_binary.py": "class_map = {'total': {1: 'spleen', 2: 'vertebrae_L1'}, 'vertebrae_body': {1: 'vertebrae_body', 2: 'intervertebral_discs'}, 'abdominal_muscles': {19: 'psoas_major_right', 20: 'psoas_major_left'}}\n",
  "totalsegmentator/python_api.py": `
import os
import numpy as np
import nibabel as nib


def totalsegmentator(input, output, ml=False, task='total', fast=False, quiet=False):
    assert ml and task in ('total', 'vertebrae_body', 'abdominal_muscles'), (ml, task)
    img = nib.load(input)
    a = np.asanyarray(img.dataobj)
    if task == 'abdominal_muscles':
        # 700 のところ = psoas_major_right（19）
        nib.save(nib.Nifti1Image((a == 700).astype(np.uint8) * 19, img.affine), output)
        return
    if task == 'vertebrae_body':
        # 椎体 = 1500 を超えるところと 700 のところ（700 は L1 ではないので重なりに入らない）
        nib.save(nib.Nifti1Image(((a > 1500) | (a == 700)).astype(np.uint8), img.affine), output)
        return
    assert fast == (os.environ.get('WANT_FAST') == '1'), fast
    lab = (a > 500).astype(np.uint8) + (a > 1500).astype(np.uint8)
    aff = img.affine
    if os.environ.get('FAKE_MODE') == 'flip':   # 保存の向きだけ x を反転（同じ場所を指す）
        lab = lab[::-1]
        f = np.eye(4); f[0, 0] = -1; f[0, 3] = a.shape[0] - 1
        aff = aff @ f
    nib.save(nib.Nifti1Image(lab, aff), output)
`,
  "TotalSegmentator-2.18.0.dist-info/METADATA": "Metadata-Version: 2.1\nName: TotalSegmentator\nVersion: 2.18.0\n",
};

const MAKE_INPUT = `
import json, os, zipfile, numpy as np
c, s = np.cos(np.pi / 6), np.sin(np.pi / 6)
vol = np.zeros((6, 7, 9), np.float32)   # [z, y, x]
vol[1, 2, 3] = 1000                     # 非対称な目印
vol[4, 5, 7] = 2000
vol[2, 0, 8] = 700
os.makedirs('inputs', exist_ok=True); os.makedirs('outputs', exist_ok=True)
np.savez('inputs/0.npz', volume=vol, spacing=np.array([2.5, 0.8, 0.7]), origin=np.array([-100.0, -120.0, 50.0]),
         direction=np.array([[c, s, 0], [-s, c, 0], [0, 0, 1.0]]))
np.save('expected.npy', ((vol > 500).astype(np.uint8) + (vol > 1500).astype(np.uint8)))
with zipfile.ZipFile('inputs/0.npz', 'a') as zf:
    zf.writestr('meta.json', json.dumps({'format': 'graphy-npz/1', 'modality': os.environ.get('FAKE_MODALITY', 'CT')}))
`;

function sandbox(mode, extraEnv = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "graphy-ctq-"));
  const lib = path.join(dir, "lib");
  for (const [p, body] of Object.entries(FAKE)) {
    fs.mkdirSync(path.dirname(path.join(lib, p)), { recursive: true });
    fs.writeFileSync(path.join(lib, p), body);
  }
  const run = path.join(dir, "run");
  fs.mkdirSync(run);
  const env = {
    ...process.env,
    PYTHONPATH: [lib, process.env.GRAPHY_TEST_PYTHONPATH].filter(Boolean).join(path.delimiter),
    FAKE_MODE: mode, HOME: dir, USERPROFILE: dir,
    PIP_NO_INDEX: "1", PYTHONIOENCODING: "utf-8", // 万一 pip が呼ばれても手元の環境を書き換えない
    ...extraEnv,
  };
  delete env.COLAB_RELEASE_TAG;
  const py = (code) => spawnSync(PYTHON, ["-c", code], { cwd: run, env, encoding: "utf8" });
  return { dir, run, py };
}

for (const mode of ["same", "flip"]) {
  test(`PY round trip keeps the voxel grid (${mode})`, { skip: !PYTHON && "GRAPHY_TEST_PYTHON is not set" }, () => {
    const { dir, run, py } = sandbox(mode, { WANT_FAST: mode === "flip" ? "1" : "" });
    try {
      assert.equal(py(MAKE_INPUT).status, 0);
      const r = py(buildScript({ fast: mode === "flip" }));
      assert.equal(r.status, 0, r.stderr);
      assert.match(r.stdout, /__progress__ 1\.0 done/);
      const labels = parseNpy(new Uint8Array(fs.readFileSync(path.join(run, "outputs", "labels.npy"))));
      const expected = parseNpy(new Uint8Array(fs.readFileSync(path.join(run, "expected.npy"))));
      assert.deepEqual(labels.shape, [6, 7, 9]);
      assert.deepEqual([...labels.data], [...expected.data]);
      const summary = JSON.parse(fs.readFileSync(path.join(run, "outputs", "labels.json"), "utf8"));
      assert.equal(summary.resampled, mode === "flip");
      assert.equal(summary.version, "2.18.0");
      assert.equal(summary.fast, mode === "flip");
      assert.deepEqual(summary.classMap, { 1: "spleen", 2: "vertebrae_L1" });
      // L1 椎体 = vertebrae_L1（2000 の 1 ボクセル）と椎体（2000・700）の重なり → 1 ボクセルだけ
      assert.equal(summary.l1BodyVoxels, 1);
      const body = parseNpy(new Uint8Array(fs.readFileSync(path.join(run, "outputs", "l1body.npy"))));
      assert.deepEqual(body.shape, [6, 7, 9]);
      assert.equal([...body.data].reduce((a, v) => a + v, 0), 1);
      assert.equal(body.data[4 * 63 + 5 * 9 + 7], 1, "[z=4, y=5, x=7] の目印");
      const mus = parseNpy(new Uint8Array(fs.readFileSync(path.join(run, "outputs", "muscles.npy"))));
      assert.deepEqual(mus.shape, [6, 7, 9]);
      assert.equal(mus.data[2 * 63 + 0 * 9 + 8], 19, "[z=2, y=0, x=8] の 700 が psoas_major_right");
      assert.deepEqual(summary.muscleVoxels, { 19: 1 });
      assert.deepEqual(summary.muscleMap, { 19: "psoas_major_right", 20: "psoas_major_left" });
      assert.deepEqual(summary.labels, { 0: 6 * 7 * 9 - 3, 1: 2, 2: 1 });
      assert.deepEqual(summary.gpu, { name: "Fake T4", peakMiB: 3 });
      // 本体の格子（スライスが逆順）へ写しても目印が同じ場所に来る
      const g = summary.geometry;
      const mapped = mapSlices(g, labels.shape, volGrid(g, 9, 7, 6));
      assert.equal(mapped.ok, true);
      const host = reorderLabels(labels.data, mapped.kMap, 63);
      assert.equal(host[(5 - 1) * 63 + 2 * 9 + 3], 1);
      assert.equal(host[(5 - 4) * 63 + 5 * 9 + 7], 2);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
}

test("PY refuses a non-CT series, a missing GPU and a different installed version", { skip: !PYTHON && "GRAPHY_TEST_PYTHON is not set" }, () => {
  for (const [env, want] of [[{ FAKE_MODALITY: "MR" }, /not-applicable/], [{ FAKE_NO_GPU: "1" }, /no-gpu/]]) {
    const { dir, py } = sandbox("same", env);
    try {
      assert.equal(py(MAKE_INPUT).status, 0);
      const r = py(buildScript());
      assert.notEqual(r.status, 0);
      assert.match(r.stderr, want);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
  const { dir, run, py } = sandbox("same");
  try {
    fs.rmSync(path.join(dir, "lib", "TotalSegmentator-2.18.0.dist-info"), { recursive: true });
    assert.equal(py(MAKE_INPUT).status, 0);
    const r = py(buildScript());
    assert.notEqual(r.status, 0);
    assert.match(r.stderr, /missing-packages: .*TotalSegmentator==2\.18\.0/, "Colab 以外では pip を呼ばずに止まる");
    assert.equal(fs.existsSync(path.join(run, "outputs", "labels.npy")), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

/** 本体の格子: スライスの並びを逆にした（k が増えると npz の k は減る）もの。 */
function volGrid(g, nx, ny, nz) {
  const [dz, dy, dx] = g.spacing;
  const d = g.direction;
  const o = g.origin.map((v, a) => v + (nz - 1) * dz * d[2][a]);
  const i2w = [
    dx * d[0][0], dy * d[1][0], -dz * d[2][0], o[0],
    dx * d[0][1], dy * d[1][1], -dz * d[2][1], o[1],
    dx * d[0][2], dy * d[1][2], -dz * d[2][2], o[2],
    0, 0, 0, 1,
  ];
  return { dims: /** @type {[number, number, number]} */ ([nx, ny, nz]), worldToIndex: invert(i2w) };
}

function invert(a) {
  // 4×4 の逆行列（ガウス・ジョルダン）
  const n = 4;
  const m = a.slice();
  const inv = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  for (let c = 0; c < n; c++) {
    let p = c;
    for (let r = c + 1; r < n; r++) if (Math.abs(m[r * n + c]) > Math.abs(m[p * n + c])) p = r;
    for (let k = 0; k < n; k++) {
      [m[c * n + k], m[p * n + k]] = [m[p * n + k], m[c * n + k]];
      [inv[c * n + k], inv[p * n + k]] = [inv[p * n + k], inv[c * n + k]];
    }
    const piv = m[c * n + c];
    for (let k = 0; k < n; k++) { m[c * n + k] /= piv; inv[c * n + k] /= piv; }
    for (let r = 0; r < n; r++) {
      if (r === c) continue;
      const f = m[r * n + c];
      for (let k = 0; k < n; k++) { m[r * n + k] -= f * m[c * n + k]; inv[r * n + k] -= f * inv[c * n + k]; }
    }
  }
  return inv;
}
