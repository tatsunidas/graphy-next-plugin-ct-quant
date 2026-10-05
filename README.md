# CT 臓器体積・体組成 (remote GPU) — GRAPHY-Next 公式プラグイン

> **研究用です。診断・判定には使わないでください。** 医療機器ではありません。

GRAPHY-Next の 2D ビューアから、CT のシリーズを [TotalSegmentator](https://github.com/wasserth/TotalSegmentator) で 117 の構造に分け、
臓器の体積・CT 値と、L3 レベルの筋の面積を測ります。セグメンテーションは外部の GPU（Google Colab など）で行い、
**数値は GRAPHY-Next 本体が測ります**（host API H66 `measureLabels`）。

## 使い方

1. 環境設定 ＞ 外部の計算機 で Google にログインする（Colab の GPU T4 が自動で登録されます）。
2. 2D ビューアで CT のシリーズを開き、「解析」メニュー ＞ **AI** ＞ **CT 臓器体積・体組成**。
3. 「実行」。送る前に同意画面が出ます（送るのは匿名化したこのシリーズだけ）。
4. 結果は 3 つのタブに出ます。
   - **臓器**: 体積（mL）、平均 CT 値・SD、境界の 1 ボクセルを除いた平均。肺は 5 葉の合計も出します。
   - **肝・脾**: 体積、平均 CT 値、肝 − 脾。CT 値の意味は時相で変わります（脂肪肝の目安として読めるのは単純 CT のときだけ）。
   - **L3**: L3 椎体の重心の高さで、大腰筋・脊柱起立筋（左右の合計）の面積・平均 CT 値・−29〜150 HU に入る面積。身長を入れると面積 ÷ 身長²。
5. ROI マネージャに構造の名前つきで読み込まれます。「SEG で保存」「SR で保存」「CSV で保存」。

## 出さないもの

- 判定（サルコペニア・脂肪肝の有無など）、基準値との比較。
- 皮下脂肪・内臓脂肪、骨格筋の全周の面積：これらを出す TotalSegmentator のタスク（`tissue_types`・`abdominal_muscles`）は商用に別ライセンスが要るため使っていません。

## モデルとライセンス

| | ライセンス |
|---|---|
| このプラグインのコード | MIT |
| TotalSegmentator のコード | Apache-2.0 |
| `total` タスクの重み | Apache-2.0（TotalSegmentator の README による。2026-10-05 確認） |

計算機には TotalSegmentator **2.18.0** を入れます（数値の再現性のため版を固定）。版と「低解像度（`--fast`）」の有無は SEG・SR・CSV に書かれます。

## 計算機の上でしていること

- 本体が匿名化して作った npz を NIfTI にし、`totalsegmentator(..., ml=True, task='total')` を新しい Python のプロセスで実行します。
- GPU が無ければ止めます（CPU だと 1 例に数十分かかるため）。CT 以外のシリーズでも止めます。
- Colab 以外（自分で立てた Jupyter）では、パッケージを入れずに名前を示して止めます。
- 結果のラベルを元の格子に戻して返します（向きが違えば最近傍で取り直す）。

## 必要なもの

GRAPHY-Next 0.4.0 より後の版（H66 `measureLabels` と SR の面積・平均値が要ります）。設計は GRAPHY-Next の `fw/ct-quant-design.md`。

## 開発

```
npm test                                   # 純関数
GRAPHY_TEST_PYTHON=<python> npm test       # 計算機の上のコードの往復（numpy・nibabel が要る。TotalSegmentator と torch は偽物に差し替え）
```

本体の実機スパイクは GRAPHY-Next の `automator/src/spike/computeCtQuantCheck.ts`。
