/**
 * GRAPHY-Next プラグイン UI の型定義（第三者プラグイン開発者向け・エディタ補完用）。
 *
 * この .d.ts は「ビルド不要」でエディタ型補完を得るためのもの。`ui.js` の先頭で
 *   /// <reference path="./graphy-plugin.d.ts" />
 *   // @ts-check
 * を書けば、TypeScript を導入しなくても VS Code 等で `host` に補完が効く。
 *
 * 本体の契約は GRAPHY-Next の frontend/src/plugins/pluginTypes.ts。ここはその安定サブセット。
 * 設計: fw/plugin-architecture.md §2.1 / fw/plugin-manager-design.md。
 */

/**
 * プラグインを組み込む先（UI サーフェス）。
 *
 * <p>`viewer2d.menu.analysis` は **2D ビューアの「解析」メニュー**に出す（**0.2.1 以降**）。
 * `viewer2d.menu`（＝「プラグイン」メニュー）とは**出る場所だけ**が違い、host の中身は同一。
 * 本体の解析機能と並ぶ位置なので、**本体が区切り線と「（プラグイン）」の印を付ける**
 * — プラグイン側で名前に「プラグイン」と入れる必要はない（二重に出る）。
 *
 * <p>`viewer2d.xa3d` は **3D QCA のダイアログの中**にボタンとして出す（**H63・0.3.7 以降**）。
 * ダイアログは全画面の背景を持ちメニューを押せないので、「再構成を見ながら解析を掛ける」
 * （QFR など）にはこの面が要る。押してもダイアログは閉じない。host の中身は `viewer2d.menu` と同一。
 * 旧本体はこの面を知らないだけで、宣言しても害は無い（`contributes` で絞るだけ）。
 */
export type PluginSurface =
  | "viewer2d.menu"
  | "viewer2d.menu.analysis"
  | "viewer2d.toolbar"
  | "viewer2d.xa3d"
  | "mainscreen.menu";

/** 2D Viewer 系サーフェス（host の形が同じもの）。 */
export type Viewer2DSurface = "viewer2d.menu" | "viewer2d.menu.analysis" | "viewer2d.toolbar" | "viewer2d.xa3d";

/**
 * 2D Viewer プラグインから使える表示中タイルへの操作（安定サブセット）。
 * GRAPHY-Next 側にはこれ以外の操作もあるが、ここではプラグイン向けに安定なものだけを公開する。
 */
export interface ViewerActions {
  /** 表示を Fit（はみ出しなく収める）。 */
  fit(): void;
  /** 表示状態をリセット。 */
  reset(): void;
  /** 90 度回転。 */
  rotate90(): void;
  /** 左右反転。 */
  flipH(): void;
  /** 上下反転。 */
  flipV(): void;
  /** 白黒反転。 */
  invert(): void;
  /** 元に戻す / やり直し。 */
  undo(): void;
  redo(): void;
  /** ウィンドウレベル（中心・幅）を適用。 */
  setWindowLevel(center: number, width: number): void;
  /** DICOM 既定のウィンドウに戻す。 */
  resetWindow(): void;
}

/**
 * 操作対象タイル 1 枚が「いま何を表示しているか」。`host.getTargets()` の要素。
 *
 * <p>**GRAPHY-Next 0.1.9 以降**。使うプラグインは plugin.json の
 * `engines.graphy` を `">=0.1.9"` にすること（古い本体には導入させない＝正しい挙動）。
 */
export interface ViewerTarget {
  /** タイルの識別子。`getViewState(tileId)` に渡せる。 */
  tileId: string;
  /**
   * 同一患者の判定キー（PatientID → PatientName → StudyInstanceUID）。
   * 本体が ROI を永続化する鍵と同じ値。**患者単位の記録を持つならこれを鍵にする**
   * （スタディ UID を鍵にすると、同じ患者の別スタディを開いたときに記録を見失う）。**0.1.11 以降**。
   */
  patientKey: string;
  studyUid: string;
  /**
   * スタディの検査日（ISO `YYYY-MM-DD`）。DICOM の StudyDate 由来。
   * 解釈できない・存在しないなら `null`（怪しい日付は通さない）。**0.1.10 以降**。
   */
  studyDate: string | null;
  seriesUid: string;
  /** 画面に出ているシリーズ名。 */
  seriesLabel: string;
  /**
   * 表示中スライスの imageId。
   * ⚠ **動画タイル（`kind === "video"`）は cornerstone の像を持たないので空文字**。
   */
  imageId: string;
  /**
   * 表示中インスタンスの SOP Instance UID。解決できなければ null。**0.2.9 以降**。
   * 🔑 これがある前に書かれたプラグインは `imageId` を正規表現で削っていた。もう要らない。
   */
  sopInstanceUid: string | null;
  /**
   * 本体 REST の基点（例 `http://localhost:18090`）。**0.2.9 以降**。
   * 🔑 **JAR 面へ渡す値**——JAR は自分の backend のポートを知らない。
   */
  apiBase: string;
  /**
   * どの表示器に出ているか。`"image"` = 2D ビューア、`"video"` = 動画再生器。**0.2.9 以降**。
   * 🔴 動画には imageId も画素取得（`getPixelData`）も無い。**分岐すること**。
   */
  kind: "image" | "video";
  /**
   * 表示中スライス（Z）の 0 始まり index と、そのスタックの総数。
   * ⚠ 動画タイルは 1 SOP = 1 本として `sliceIndex: 0` / `sliceCount: 1` を返す
   * （**フレーム数ではない**。フレーム数は `/video-metadata` から取る）。
   */
  sliceIndex: number;
  sliceCount: number;
  /** ZCT モデルのチャンネル / 時相（多次元でないシリーズは 0）。 */
  c: number;
  t: number;
  modality: string;
}

/**
 * タイル 1 枚の表示状態。`host.getViewState()` の戻り。
 *
 * <p>W/L は**モダリティ値空間**（CT なら HU）。表示単位は `unit`。**0.1.9 以降**。
 */
export interface ViewerViewState {
  tileId: string;
  windowCenter: number;
  windowWidth: number;
  /** 校正済み画素値の単位（CT は "HU"、無ければ ""）。 */
  unit: string;
  /** 適用中の LUT 名（LUT ダイアログの名前。例 "10_Percent"）。グレースケール（未適用）なら null。 */
  colormap: string | null;
  invert: boolean;
  flipH: boolean;
  flipV: boolean;
  /** 度。 */
  rotation: number;
  /** Fit を 1.0 とした相対倍率。 */
  zoom: number;
  /** 既定（画像が中央）からのオフセット（world mm）。 */
  pan: [number, number];
  /**
   * **画面に見えている画像上の範囲**（画像画素座標, 0 origin）。算出できなければ null。
   *
   * <p>`rotation` / `zoom` / `pan` / `flipH` / `flipV` / Fit 倍率が**すべてここに畳み込まれている**ので、
   * 「画面で見えているとおりの画像」が欲しいときは**これだけを見ればよい**。
   * 画像の外側（Fit のときの余白）は切り落としてある。
   */
  visibleRegion: VisibleRegion | null;
}

/** 画面に見えている画像上の範囲（`ViewerViewState.visibleRegion`）。 */
export interface VisibleRegion {
  /**
   * 四隅の画像画素座標（0 origin）。並びは**画面から見た** 左上・右上・左下・右下。
   * 回転・反転がここに入っているので、左上が画像の右下になることもある。
   */
  corners: [number, number][];
  /** その範囲の画面上の大きさ（CSS px）。出力の縦横比に使う。 */
  screenWidth: number;
  screenHeight: number;
}

/**
 * レポートへ差し込む解析結果（`host.publishAnalysisResult()`。**H39**）。
 *
 * <p>host が入れるので**渡さない**もの: スタディ / シリーズ・id の名前空間・
 * 出自のプラグイン名と版・研究用である旨の 1 行。
 *
 * <p>🔴 **`caveats` は 1 つ以上必須**（空白だけは数えない）。host が研究用の 1 行を足すので
 * 形式上は空でも通るが、**その解析に固有の限界**——系統誤差・単一投影・未校正など、
 * 数値の意味を変える事情——を知っているのはプラグイン側だけ。空を許すと、
 * **注意の要らない結果と同じ顔でレポートに載る**。
 */
export interface AnalysisResultInput {
  /** プラグイン内でのローカル id。**同じ id で出し直すと置き換わる**（host が名前空間を付ける）。 */
  id: string;
  /**
   * 解析の種別。正本は本体の `report/analysisResults.ts` の `AnalysisKind`。
   *
   * <p>🔑 **プラグインが登録する結果は `"plugin"`**。本体は「どのプラグインか」を
   * `provenance` の 1 行として自分で足すので、**プラグインごとに種別を増やさない**設計。
   *
   * <p>🚨 2026-09-06 まで、ここは `"qca" | "qva" | "qlv" | "qca3d"` と書かれていた
   * （実在しない `"qva"` があり、実在する `"timi"` / `"plugin"` が無かった）。
   * `buildPluginAnalysisRecord` は `kind` を検証せず素通しするので、
   * **`"qva"` を渡すと実行時に存在しない種別がそのまま記録に入っていた**。
   * このファイルの追随テスト（`pluginTemplateTypes.test.ts`）は
   * **「名前が抜けていないか」しか見ない**ので、値の集合のずれは掴めなかった。
   */
  kind: "qca" | "qlv" | "qca3d" | "timi" | "plugin";
  /** 参照した元インスタンス。**開いているタイルの並びに無ければ拒否される。** */
  sopInstanceUids?: string[];
  /** 「ラン 3 / フレーム 12」のような人が読む位置。 */
  frameLabel: string;
  /** ブロックの見出し。 */
  title: string;
  /** 計測値。**丸めは渡す側の責任**（表示と保存でずれないように）。 */
  metrics: { label: string; value: string; unit?: string }[];
  /** 出自（校正の経路・手修正・アルゴリズム）。 */
  provenance: { label: string; value: string }[];
  /** 限界・注意。**1 つ以上必須**。 */
  caveats: string[];
}

/**
 * 表示状態（XA GSPS）の保存要求（`host.savePresentationState()`。**H38**）。
 *
 * <p>DSA のマスク・ピクセルシフト・VOI・空間校正・描画が入る**唯一の器**。
 * これを残せないと、差分表示や校正を伴う解析は**再現できない**。
 *
 * <p>🔴 `studyInstanceUid` は入っていない（本体が入れる）。参照 SOP は**そのタイルが
 * 開いている並びの中**に無ければ拒否される。座標は**画像ピクセル座標（0 origin, 小数可）**。
 *
 * <p>⚠️ **読み込み（適用）の口は無い**（意図的）。GSPS をビューポートへ当てるのは表示の仕事で、
 * プラグインは当たった結果を `getSpatialCalibration()` / `getXaState()` で見れば足りる。
 */
export interface PresentationStateRequest {
  seriesInstanceUid: string;
  sopInstanceUid: string;
  /** 対象フレーム（**1 origin**）。null / 空なら全フレーム。 */
  frameNumbers?: number[] | null;
  /** ContentLabel（DICOM CS: 大文字・空白不可。整形は本体が行う）。 */
  label?: string | null;
  description?: string | null;
  creator?: string | null;
  voi?: { windowCenter: number; windowWidth: number } | null;
  invert?: boolean | null;
  /** 0 / 90 / 180 / 270。 */
  rotation?: number | null;
  flipHorizontal?: boolean | null;
  /** DSA のマスク指定。null なら非減算。 */
  mask?: {
    /** **1 origin**。 */
    maskFrameNumbers: number[];
    subPixelShiftRow?: number | null;
    subPixelShiftCol?: number | null;
    operation?: string | null;
  } | null;
  /** 空間校正。**出自（description）を必ず入れる**——数値だけ残すと意味が失われる。 */
  calibration?: {
    mmPerPxRow?: number | null;
    mmPerPxCol?: number | null;
    type?: string | null;
    description?: string | null;
  } | null;
  /** 折れ線（中心線・エッジなど）。points は [x0,y0,x1,y1,...]（**0 origin**）。 */
  polylines?: { layer: string; points: number[]; filled?: boolean; rgb?: number[] | null }[];
  texts?: { layer: string; text: string; anchorX: number; anchorY: number }[];
}

/**
 * アンギオ解析の結果を **本体と同じ SR** で保存する要求（`host.saveAngioReport()`。**H37**）。
 *
 * <p>🔴 **`studyInstanceUid` は入っていない。** どのスタディに付けるかは本体が決める
 * （タイルが表示している検査）。また、参照する SOP は**そのタイルが開いている並びの中**に
 * 無ければ拒否される——書き手は参照インスタンスから患者・スタディを継承するので、
 * 他患者の SOP を渡せると**その患者の検査にレポートが生える**。
 *
 * <p>DICOM の構造・UID 採番・患者/検査属性の継承はすべて本体が行う。プラグインが渡すのは
 * 「何を測ったか」だけ（H4b / H9 と同じ方針）。
 */
export type AngioReportRequest =
  | { kind: "qca"; qca: AngioQcaReport }
  | { kind: "qva"; qva: AngioQvaReport }
  | { kind: "qlv"; qlv: AngioQlvReport }
  | { kind: "qca3d"; qca3d: AngioQca3dReport };

/** QCA（冠動脈）。 */
export interface AngioQcaReport {
  seriesInstanceUid: string;
  sopInstanceUid: string;
  /** **1 origin**。単一フレームなら null。 */
  frameNumber?: number | null;
  /** "mm" または "px"。**未校正なら px のまま出す**（mm を騙らない）。 */
  unit: string;
  /** 校正の出自（人向け文字列。`getSpatialCalibration().provenance` をそのまま渡してよい）。 */
  calibration?: string | null;
  vesselLabel?: string | null;
  /** 手修正の内容。全自動なら null。**自動値と同じ顔で保存しない**ため。 */
  manualCorrection?: string | null;
  /** `"half-max"` / `"densitometric"`。省略は半値法。**測り方を落とさない**。 */
  diameterMethod?: string | null;
  mld: number;
  rvd: number;
  percentDiameterStenosis: number;
  percentAreaStenosis: number;
  lesionLength: number;
}

/** QVA（末梢・脳血管）。狭窄に加えて拡張（瘤）を持てる。 */
export interface AngioQvaReport {
  seriesInstanceUid: string;
  sopInstanceUid: string;
  frameNumber?: number | null;
  unit: string;
  calibration?: string | null;
  vesselLabel?: string | null;
  manualCorrection?: string | null;
  diameterMethod?: string | null;
  mld: number;
  rvd: number;
  percentDiameterStenosis: number;
  lesionLength: number;
  /** 拡張（瘤）。無ければ null。**空欄を 0 で埋めない**。 */
  dilation?: {
    maxDiameter: number;
    ratio: number;
    percentDilation: number;
    length: number;
    proximalNeck: number;
    distalNeck: number;
    eccentricity?: number | null;
    aneurysmal: boolean;
  } | null;
}

/** QLV（左室造影・単一面）。 */
export interface AngioQlvReport {
  seriesInstanceUid: string;
  sopInstanceUid: string;
  /** **1 origin**。 */
  edFrameNumber: number;
  esFrameNumber: number;
  /** 校正済みなら "mL"、未校正なら null（EF はスケール不変なので校正が無くても出る）。 */
  unit: string | null;
  calibration?: string | null;
  /** "manual" / "automatic (area curve)"。ED/ES の決め方は結果の意味を変える。 */
  frameSelection: string;
  ejectionFraction: number;
  edvMl: number | null;
  esvMl: number | null;
  kennedyEdvMl: number | null;
  kennedyEsvMl: number | null;
  kennedyEjectionFraction: number | null;
  method: string;
}

/** 3D QCA（2 方向からの再構成）。**方向 A / B の SOP は両方とも開いている必要がある。** */
export interface AngioQca3dReport {
  seriesInstanceUid: string;
  viewASopInstanceUid: string;
  /** **1 origin**。 */
  viewAFrameNumber: number;
  viewBSopInstanceUid: string;
  viewBFrameNumber: number;
  separationDeg: number;
  /** 3 未満なら装置角度の補正が掛かっていない。 */
  anchorCount: number;
  anchorReprojectionPx: number;
  angleCorrected: boolean;
  lengthMm: number;
  minAreaMm2: number | null;
  minEquivalentDiameterMm: number | null;
  /** 見えている長さの割合（短縮の指標）。 */
  visibleFractionA: number | null;
  visibleFractionB: number | null;
  calibration: string | null;
  /** `"half-max"` / `"densitometric"` / 2 方向で違うなら `"mixed"`。 */
  diameterMethod?: string | null;
  percentDiameterStenosis: number | null;
  percentAreaStenosis: number | null;
  mldMm: number | null;
  rvdMm: number | null;
  lesionLengthMm: number | null;
}

/**
 * 空間校正と**その出自**。`host.getSpatialCalibration()` の戻り。**H35**。
 *
 * <p>🔴 **数値だけでは足りない。** mm/px は `getPixelData().spacing` からも取れるが、
 * それが**実測（カテーテル法）／装置の校正値／幾何近似／未校正**のどれなのかが分からない。
 * アンギオのように「近似には近似と書く」ことが求められる領域では、出自が無いと
 * **正しい注記を書けない**。
 *
 * <p>⚠️ **未校正のとき `mmPerPxRow` / `mmPerPxCol` は null**。`detectorMmPerPx`
 * （検出器面の画素ピッチ）は**被写体の mm/px ではない**ので、計測に使ってはいけない。
 */
export interface SpatialCalibration {
  tileId: string;
  imageId: string;
  /** 行方向 mm/px。**未校正なら null**。 */
  mmPerPxRow: number | null;
  /** 列方向 mm/px。非等方はそのまま 2 値で来る（平均して潰さない）。 */
  mmPerPxCol: number | null;
  /** 出自の識別子（`user-catheter` / `dicom-fiducial` / `geometric-sid-sod` / `none` 等）。 */
  source: string;
  confidence: "high" | "medium" | "low" | "none";
  /** 表示の縮退区分。`approximate` なら「近似」と書く義務がある。 */
  tier: "calibrated" | "approximate" | "uncalibrated";
  /** その値が妥当な平面（`fiducial-depth` / `isocenter` / `central-ray` / `detector` / `unknown`）。 */
  plane: string;
  /** 人向けの根拠文字列（そのまま画面に出してよい）。 */
  provenance: string;
  /** 警告の識別子。 */
  warnings: string[];
  /** 未校正のときの検出器面 mm/px。**計測に使わない**（ツールチップ用）。 */
  detectorMmPerPx: number | null;
}

/**
 * 再構成済み 3D 血管モデルの 1 区間。`host.getVesselModel()` の戻りに入る。**H11**。
 */
export interface VesselSegment {
  /** モデル内で一意（単一血管は "main"、分岐部は "proximal" / "distal" / "side"）。 */
  id: string;
  /** 中心線（患者 LPS mm・近位→遠位）。 */
  points: [number, number, number][];
  /**
   * 各点の内腔径 [mm]。**測れなかった点は null**。
   *
   * 🔴 **0 や補間値で埋めないこと。** 径から断面積を作るので、埋めた値は
   * 「そこが細い / 太い」という所見に化ける。未校正なら全点 null。
   */
  diameterMm: (number | null)[];
  /** 近位側の区間 id。根なら null。 */
  parentId: string | null;
}

/** 空間校正の状態。近似には近似と書くために要る。**H11**。 */
export interface VesselCalibration {
  /** 径が mm で出せているか。false なら断面積を作れない＝FFR の入力にならない。 */
  diameterCalibrated: boolean;
  /** 方向ごとの校正の出自（`getSpatialCalibration()` と同じ語彙）。読めなければ "unknown"。 */
  sources: string[];
  /** 方向ごとの縮退区分。`approximate` が混ざれば結果も近似。 */
  tiers: ("calibrated" | "approximate" | "uncalibrated")[];
  /**
   * 径の測り方。半値法と密度計測では絶対値が 10% 以上違い、断面積はその 2 乗で効く。
   * 2 方向で違えば "mixed"（断面積はどちらの意味でもない）。分からなければ null。
   */
  diameterMethod: "half-max" | "densitometric" | "mixed" | null;
}

/** この数字がどこから来たか。注記を書くための材料。**H11**。 */
export interface VesselProvenance {
  studyUid: string;
  seriesUids: string[];
  sopUids: string[];
  /** 方向ごとの [primary, secondary] 角度 [deg]。 */
  angles: [number, number][];
  /** 角度補正（バンドル調整）が掛かったか。掛かっていない結果は歪みを含む。 */
  angleCorrected: boolean;
  /** 方向ごとの可視割合（短縮）。取れなければ null。 */
  visibleFractions: (number | null)[];
  /** アンカーの再投影誤差 RMS [px]。**幾何の検算はこれ**。 */
  anchorReprojectionPx: number;
  /** 2 方向の角度差 [deg]。 */
  separationDeg: number;
  /** 方向ごとのフレーム番号（0 origin）。`seriesUids` と同じ並び。**H62**。 */
  frameIndices: number[];
}

/**
 * 中心線の向き。**H62**。
 *
 * 🔴 `points` は**描いた順**で、近位→遠位は保証されない。`proximalFirst: true` は
 * 利用者が 3D QCA のダイアログで近位端を選んだとき**だけ**立つ（そのとき本体は
 * `points[0]` が近位になるよう並べ替えて渡す）。null は「誰も確かめていない」。
 * 圧力を近位から積む解析は、null のまま計算しないこと。
 */
export interface VesselOrientation {
  proximalFirst: true | null;
  source: "user" | null;
}

/**
 * 再構成済み 3D 血管モデル。`host.getVesselModel()` の戻り。**H11**。
 *
 * 🔴 **本体は FFR を計算しない。** 流体解析・学習モデルはプラグインの担当で、
 * 本体はモデルを渡し、返ってきた値を色で見せるだけ。
 */
export interface VesselModel {
  /** セッション内の鍵。🔴 本体の URL（ポート）を含み、**起動し直すと変わる**。保存の鍵にしない。 */
  runId: string;
  /**
   * 起動し直しても変わらない鍵（SOPInstanceUID・フレーム番号・解析区間から作る）。**H62**。
   * 解析入力を `saveStore` に残して引き当てるのはこちら。SOP が取れなければ null。
   * 向きを反転しても変わらない。
   */
  stableKey: string | null;
  /** 中心線の向き。**H62**。 */
  orientation: VesselOrientation;
  kind: "xa-qca3d" | "xa-bifurcation3d";
  label: string;
  segments: VesselSegment[];
  calibration: VesselCalibration;
  provenance: VesselProvenance;
  at: number;
}

/** `host.listVesselModels()` の 1 件（点列を含まない要約）。**H11**。 */
export interface VesselModelSummary {
  runId: string;
  kind: "xa-qca3d" | "xa-bifurcation3d";
  label: string;
  segmentCount: number;
  pointCount: number;
  diameterCalibrated: boolean;
  /** 最も弱い縮退区分（1 方向でも近似なら "approximate"）。 */
  tier: "calibrated" | "approximate" | "uncalibrated";
  /** {@link VesselModel.stableKey}。**H62**。 */
  stableKey: string | null;
  /** {@link VesselOrientation.proximalFirst}。**H62**。 */
  proximalFirst: true | null;
  at: number;
}

/**
 * 解析結果（点ごとの値）。`host.putVesselAnalysis()` に渡す。**H12**。
 *
 * 🔴 **色の向きは range[0] が赤・range[1] が青**（FFR のように低いほど悪い量に合わせてある）。
 * 高いほど悪い量は同じ向きで描かれるので、符号を反転して渡すこと。
 */
export interface VesselAnalysisInput {
  kind: "ffr" | "custom";
  /** 凡例名（例 "FFR"）。 */
  label: string;
  /** 色マップの範囲 [min, max]。min < max。 */
  range: [number, number];
  /** `index` は該当区間の中心線の添字。範囲外・非有限はエラーになる（黙って落とされない）。 */
  perPoint: { segmentId: string; index: number; value: number }[];
  /** 提供元の免責文。**そのまま画面に出る**（本体は要約も書き換えもしない）。 */
  disclaimer?: string;
}

/** `host.putVesselAnalysis()` の戻り。 */
export interface VesselAnalysisResult {
  ok: boolean;
  /** 拒否された理由（形が壊れているとき）。 */
  error?: string;
}

/**
 * XA（血管撮影）の表示状態。`host.getXaState()` の戻り。**H36**。
 *
 * <p>🔴 **DSA（差分）表示中は画素の意味が反転する。** 差分後は血管が正の大きな値になるので、
 * エッジ検出の向きも、対数を取るかどうかも変わる。合成 imageId は元の URL を持たないため、
 * **受け取った側からは見分けられない**。知らずに測ると例外も警告も出ずに違う径が出る。
 */
export interface XaState {
  tileId: string;
  imageId: string;
  /** DSA（差分）を表示しているか。 */
  isSubtracted: boolean;
  /** マスクフレーム（0 origin）。差分していなければ空。 */
  maskFrames: number[];
  /** ピクセルシフト [dx, dy]。 */
  shift: [number, number];
  /** 対数変換を掛けているか。 */
  logarithmic: boolean;
  /** `PixelIntensityRelationship (0028,1040)`（LOG / LIN）。読めなければ null。 */
  pixelIntensityRelationship: string | null;
  /** 表示中のフレーム（0 origin）と総数。 */
  frameIndex: number;
  frameCount: number;
}

/**
 * XA シネの**時間軸**。`host.getXaCine()` の戻り。**H40**。
 *
 * <h3>🔴 fps だけを見て換算しない</h3>
 * `fpsSource` が `"default"` のときは、**どのタグからも決まらず既定値（15fps）に落ちた**という
 * 意味であって、**測定値ではない**。本体は既定値に落ちたランで TIMI フレームカウントの
 * 30fps 換算値を出さないと決めている。プラグイン側だけが黙って埋めると、
 * 同じ製品の中で「同じランの時間軸が画面と解析で違う」という、目視では気づけない食い違いになる。
 *
 * <h3>🔑 経過時間は `frameStartTimesMs` の差で取る</h3>
 * **フレーム差 × 1/fps で代用しないこと。** `uniform` が false（可変レート収集）では合わない。
 *
 * <p>⚠️ dataSet が**プリウォーム前**なら `getXaCine()` は null を返す。シネを一度再生すれば温まる。
 */
export interface XaCine {
  tileId: string;
  imageId: string;
  /* --- 生の材料（受け取った側が検算できるように） --- */
  numberOfFrames: number;
  /** FrameTime (0018,1063) [ms]。 */
  frameTimeMs: number | null;
  /** FrameTimeVector (0018,1065) [ms]。可変レート収集。 */
  frameTimeVectorMs: number[] | null;
  /** CineRate (0018,0040) [fps]。 */
  cineRate: number | null;
  /** RecommendedDisplayFrameRate (0008,2144) [fps]。 */
  recommendedDisplayFrameRate: number | null;
  /* --- 本体の決定結果 --- */
  fps: number;
  fpsSource: "frameTimeVector" | "frameTime" | "cineRate" | "recommendedDisplayFrameRate" | "default";
  /** 各フレームの開始時刻 [ms]（0 起点・長さ = `numberOfFrames`）。 */
  frameStartTimesMs: number[];
  /** フレーム間隔が一様か。false なら「フレーム差 × 1/fps」は実時間と合わない。 */
  uniform: boolean;
}

/** `getPixelData` の任意指定。**0.1.9 以降**。 */
export interface PixelDataOptions {
  /**
   * 読み出すスライス（Z）の 0 始まり index。既定は表示中スライス。
   * 範囲外は拒否（null が返る）＝黙って別のスライスにはならない。
   */
  sliceIndex?: number;
}

/**
 * スライス 1 枚の**校正済み画素**。`host.getPixelData()` の戻り。**0.1.9 以降**。
 *
 * <p>値はモダリティ値（CT なら HU、SUV 校正済み PET なら SUV）で、**表示 W/L は掛かっていない**
 * ＝定量処理に使える。カラー（RGB）画像は輝度に落ちて `unit === "raw"`。
 */
export interface PixelData {
  tileId: string;
  imageId: string;
  /** 実際に読み出したスライスの index。 */
  sliceIndex: number;
  /** 行数・列数。`data.length === rows * cols`。 */
  rows: number;
  cols: number;
  /** row-major。`data[y * cols + x]`。 */
  data: Float32Array;
  /** 値の単位（"HU" / "SUVbw" / "" / カラーは "raw"）。 */
  unit: string;
  /**
   * 画素間隔 [列方向(x), 行方向(y), スライス方向(z)] mm。不明な軸は null。
   * z は**スライス間隔**で、ギャップのある収集ではスライス厚と一致しない。
   */
  spacing: [number | null, number | null, number | null];
  /**
   * DICOM SliceThickness (0018,0050) mm。無ければ null（間隔で代用しない）。**0.1.12 以降**。
   */
  sliceThickness: number | null;
}

/** `showOverlay` に渡す値マップ。**0.1.9 以降**。 */
export interface Overlay {
  /** rows*cols, row-major。`NaN` は透明。 */
  data: Float32Array;
  /** 現在スライスの rows/cols と一致していること（不一致は拒否）。 */
  rows: number;
  cols: number;
  /** 値 → 濃淡の窓。省略時は data の min/max（NaN 以外）で自動。 */
  window?: { center: number; width: number };
  /** 本体の LUT 名（例 "Hot_Iron"）。省略/null はグレースケール。 */
  colormap?: string | null;
  /** 不透明度 0〜1（既定 0.5）。 */
  opacity?: number;
}

/** `saveDerivedSeries` に渡す保存要求。**0.1.9 以降**。 */
export interface DerivedSeriesRequest {
  /** 新シリーズの説明。保存時に本体が `[Plugin] ` 接頭辞を付ける。 */
  seriesDescription: string;
  /**
   * フレーム（1 枚以上）。`sliceIndex` は**元シリーズのどのスライスに対応するか**。
   * 幾何（IPP/IOP/PixelSpacing/厚み）は本体が元シリーズから引き継ぐので、プラグインは書かない。
   */
  frames: Array<{ sliceIndex: number; data: Float32Array }>;
  /** 元スライスと一致していること（不一致は拒否）。 */
  rows: number;
  cols: number;
  /** 値の単位（`RescaleType` に入る。例 "HU"）。 */
  unit?: string;
  /** 派生内容の説明。プラグイン id・版は本体が併記する。 */
  derivationDescription?: string;
  /**
   * `NaN`（データ無し）の画素を埋める値。**`data` に `NaN` を含むなら必須**（未指定は拒否）。
   *
   * <p>本体が勝手に決めない: 閾値マスクのように「有効値がすべて閾値以上」の場合、最小値で埋めると
   * **背景が閾値そのものの値**になり、何も無い場所が組織と同程度の値を持つ誤ったシリーズになる。
   * CT のマスクなら空気の `-1000` が素直。指定した値は DICOM の `PixelPaddingValue` にも書かれる。
   */
  background?: number;
}

/** 保存結果。`cancelled` はユーザーが確認ダイアログで拒否した場合。**0.1.9 以降**。 */
export interface DerivedSeriesResult {
  ok: boolean;
  cancelled?: boolean;
  seriesInstanceUid?: string;
  instanceCount?: number;
  error?: string;
}

/**
 * ROI 1 件の計測値。**取れない項目は `undefined`**（「測っていない」と「0 だった」を区別する）。
 *
 * <p>長径・短径が **2 系統ある**のは意図的で、黙って片方を代入しないため。
 * `Bidirectional`（ROI メニューの「長径・短径（RECIST）」）はユーザーが 2 軸を明示的に引くので
 * `length` / `shortAxis` を使い、楕円・矩形・自由曲線は `longAxisMm` / `shortAxisMm`
 * （形状から本体が算出）を使う。**0.1.9 以降**。
 */
export interface ViewerRoiMeasurements {
  /** ツール自身の主計測 (mm)。Length の長さ、Bidirectional の長軸。 */
  length?: number;
  /** Bidirectional の短軸 (mm)。ユーザーが長軸に直交して引いた軸。 */
  shortAxis?: number;
  /** 形状の頂点から本体が算出した最遠 2 点間距離 (mm)＝RECIST の「長径」。 */
  longAxisMm?: number;
  /** 上記の長径に**直交**する方向の広がり (mm)＝RECIST の「短径」。全方位の最小幅ではない。 */
  shortAxisMm?: number;
  /** 長径の両端（画素座標）。 */
  longAxisEnds?: [[number, number], [number, number]];
  /**
   * 面 ROI の面積 (mm²)。閉多角形（メッシュ）の面積であって、ラスタ画素数 × 画素面積ではない。
   * **画素間隔が無いシリーズでは `undefined`**（px² を mm² と偽らない）。
   */
  area?: number;
  /**
   * ROI 内のモダリティ値統計（CT なら HU。表示 W/L は掛かっていない）。
   * **SUV 校正済みの PET では SUV 値**になる（`unit` も "SUVbw" 等）。
   * 出せない場合はすべて `undefined`（別経路の値で埋めない）。
   */
  mean?: number;
  stdDev?: number;
  min?: number;
  max?: number;
  /**
   * 統計値の単位。解決順は SUV 校正 → RescaleType → モダリティ既定（CT なら "HU"）。
   * 🔴 **`"raw"` は「校正が無い」という意味**。定量に使う前に必ず見ること。
   */
  unit?: string;
}

/**
 * ユーザーが描いた ROI（計測・幾何注釈）1 件。`host.getRois()` の要素。**0.1.9 以降**。
 *
 * <p>⚠ **`roiUid` はセッション内でのみ安定**（本体に ROI の永続化が無い）。時系列で同じ病変を
 * 追うなら `sopInstanceUid` ＋ `points` ＋自分で振った ID で記録し、`roiUid` を鍵にしないこと。
 */
export interface ViewerRoi {
  roiUid: string;
  /** ツール種別（"Length" / "Bidirectional" / "EllipticalROI" / "PlanarFreehandROI" 等）。 */
  tool: string;
  /** ROI マネージャで付けたラベル。未設定なら null。 */
  label: string | null;
  /** どのタイルで読んだ ROI か。 */
  tileId: string;
  /** 同一患者の判定キー（本体が ROI を永続化する鍵と同じ値）。**0.1.11 以降**。 */
  patientKey: string;
  studyUid: string;
  /** この ROI が属するスタディの検査日（ISO `YYYY-MM-DD`）。不明なら null。**0.1.10 以降**。 */
  studyDate: string | null;
  seriesUid: string;
  /** 解決できなければ null。 */
  sopInstanceUid: string | null;
  /** 表示スタック内の 0 始まり index。 */
  sliceIndex: number;
  /**
   * ROI の Z スコープ。**`"all"`（全スライス共通の global ROI）だと `sliceIndex` /
   * `sopInstanceUid` は「いま見ているスライス」を指すだけで病変の位置ではない**。
   * 計測を時系列で記録する用途では弾くこと。
   */
  zScope: number | "all" | null;
  c: number;
  t: number;
  /** 頂点（画像画素座標。x=列, y=行, 0 始まり・サブピクセル可）。 */
  points: Array<[number, number]>;
  /** 面内画素間隔 [列方向(x), 行方向(y)] mm。不明な軸は null。 */
  spacing: [number | null, number | null];
  measurements: ViewerRoiMeasurements;
  visible: boolean;
}

/**
 * 読み出すシリーズの指定（`loadVolume` / `registerVolumes`）。**0.2.0 以降**。
 * `studyUid` 省略時は開いているタイルから解決する（**患者を跨いでは読めない**）。
 */
export interface PluginSeriesRef {
  seriesUid: string;
  studyUid?: string;
  /** 多次元シリーズのチャンネル / 時相（既定 0）。 */
  c?: number;
  t?: number;
}

/** ボリュームの格子（リサンプル先の指定にも使う）。**0.2.0 以降**。 */
export interface PluginVolumeGrid {
  /** [nx, ny, nz] = [columns, rows, slices]。 */
  dims: [number, number, number];
  /** 各軸の実効間隔 [mm]。 */
  spacing: [number, number, number];
  /** index (i,j,k,1) → 患者 LPS mm。row-major 4×4（16 要素）。 */
  indexToWorld: number[];
  /** その逆行列。 */
  worldToIndex: number[];
}

/**
 * `loadVolume` が返すボリューム。値は**校正済みモダリティ値**（HU / Bq/mL / SUV）。
 * **0.2.0 以降**。
 */
export interface PluginVolume extends PluginVolumeGrid {
  /** z-major のフラット配列（長さ = nx·ny·nz）。`data[i + j*nx + k*nx*ny]`。 */
  data: Float32Array;
  /** 先頭ボクセルの ImagePositionPatient。 */
  ipp: [number, number, number];
  /** ImageOrientationPatient（6 要素）。 */
  iop: number[];
  /** スライスが 1 進むときの移動ベクトル（法線 × 間隔ではなく**実測の IPP 差**）。 */
  sliceStep: [number, number, number];
  frameOfReferenceUid: string | null;
  modality: string;
  /** 値の単位（`HU` / `Bq/ml` / `SUV` 等。分からなければ空文字＝**捏造しない**）。 */
  unit: string;
  /** DICOM SliceThickness（**スライス間隔とは別物**）。 */
  sliceThickness: number | null;
  seriesUid: string;
  studyUid: string;
}

/** 読み込み前の見積り。**0.2.0 以降**。 */
export interface PluginVolumeEstimate {
  bytes: number;
  dims: [number, number, number];
  /** 患者座標（IOP/IPP）が揃っているか。**false なら空間的な処理はできない**。 */
  spatial: boolean;
}

/** 位置合わせの要求。**0.2.0 以降**。 */
export interface PluginRegistrationRequest {
  fixed: PluginSeriesRef;
  moving: PluginSeriesRef;
  /** 既定 "rigid"。 */
  mode?: "rigid" | "deformable" | "rigid+deformable";
  options?: {
    metric?: string;
    pyramidMm?: number[];
    samplesPerIteration?: number;
    maxIterationsPerLevel?: number;
    seed?: number;
    limits?: { translationMm: number; rotationDeg: number };
    deformable?: {
      controlSpacingsMm?: number[];
      maxDisplacementMm?: number;
      regularizationWeight?: number;
    };
  };
}

/**
 * 位置合わせの結果。数値は記録・表示用、`transform` はリサンプルへ渡す用。**0.2.0 以降**。
 */
export interface PluginRegistrationResult {
  /** fixed world → moving world の 4×4（row-major, 16 要素）。 */
  matrix: number[];
  center: [number, number, number];
  translationMm: [number, number, number];
  eulerDeg: [number, number, number];
  metric: string;
  metricValue: number;
  elapsedMs: number;
  aborted: boolean;
  hasDeformation: boolean;
  maxDisplacementMm: number;
  /** 本体の内部表現。**中身を見ない**で `resampleVolume` に渡す。 */
  transform: unknown;
}

// ── H30〜H33: 「見せる」側の貸し出し（**0.2.1 以降**） ───────────────────────

/** プラグイン専用ウィンドウのハンドル（H30）。 */
export interface PluginWindowHandle {
  /** プラグインが自由に使ってよい DOM。ここより外は触らない。 */
  container: HTMLElement;
  close(): void;
  /** 閉じられたときに呼ばれる（ユーザーが × を押した場合も含む）。 */
  onClose(listener: () => void): void;
  readonly closed: boolean;
  /**
   * H52: × で閉じる前の確認。`fn` が文言を返したら、本体が窓の中に確認を出し、「閉じる」を選んだときだけ閉じる
   * （null なら確認なしで閉じる）。長い処理の途中で誤って閉じないために使う。`close()` を直接呼んだときは効かない。
   */
  setCloseGuard?(fn: (() => string | null) | null): void;
  /** H52: この窓を最前面へ出す（同じものを 2 枚開かず、開いている窓を見せるときなど）。 */
  focus?(): void;
}

export interface PluginWindowOptions {
  title?: string;
  width?: number;
  height?: number;
}

/** プラグインが作った値ボリューム（`PluginVolume` の部分集合）。 */
export interface PluginValueVolume {
  /** z-major のフラット配列（長さ nx·ny·nz）。`NaN` は「データ無し」。 */
  data: Float32Array;
  dims: [number, number, number];
  /** index (i,j,k,1) → 患者 LPS mm。row-major 4×4。 */
  indexToWorld: number[];
  unit?: string;
}

/**
 * フュージョンの前景（**0.2.1 以降**）。**下地とは別のビューポート**として重ねる。
 *
 * 🔴 単一チャンネルのビューポートでは「灰色の下地 ＋ 色の前景 ＋ 透過度」は表現できない。
 * host は同じ要素にもう 1 枚ビューポートを重ね、カメラとスライスを同期し、
 * `mix-blend-mode: screen` ＋ `opacity` で合成する（cornerstone の背景の黒が不透明なので、
 * 素の透過だけで重ねると下地が濁る）。
 */
export interface PluginViewportOverlay {
  data: Float32Array;
  /** 前景の LUT 名。省略/null はグレースケール。 */
  colormap?: string | null;
  /** 0〜1（既定 0.5）。 */
  opacity?: number;
  window?: { center: number; width: number };
}

export interface PluginViewportOptions {
  /** 表示窓。省略時は値域の 1〜99% から決める。 */
  window?: { center: number; width: number };
  /** フュージョンの前景。省略すると 1 層のまま。**0.2.1 以降**。 */
  overlay?: PluginViewportOverlay;
  /**
   * カラーマップ名。省略/null はグレースケール。
   *
   * - `"divergent"` … **host が必ず用意する発散色**（負=青 / 0=暗灰 / 正=赤）。差分向け。
   * - 本体の LUT 名（例 `"Hot_Iron"`）… ⚠️ **ユーザーが LUT ダイアログで 1 度使うまで
   *   登録されない**ので、当てにすると灰色のままになることがある。
   * - cornerstone の colormap 名もそのまま通る。
   *
   * 解決できない名前は**グレースケールで出し、コンソールに理由を残す**（黙って無視しない）。
   */
  colormap?: string | null;
  sliceIndex?: number;
}

export interface PluginViewportHandle {
  setSlice(index: number): void;
  getSlice(): number;
  setWindowLevel(center: number, width: number): void;
  /**
   * **中身だけ差し替える**（大きさは同じであること）。**0.2.1 以降**。
   *
   * <p>`destroy()` → `mountViewport()` ではカメラ（ズーム・パン）とスライス位置が毎回飛ぶ。
   * 手で動かしながら見るような用途ではこちらを使う。
   */
  setVolume(volume: PluginValueVolume, opts?: PluginViewportOptions): Promise<void>;
  /** 前景だけ差し替える（`overlay` を渡していたときのみ効く）。**0.2.1 以降**。 */
  setOverlay(overlay: PluginViewportOverlay): Promise<void>;
  /** 前景の透過度だけ変える（再サンプル不要・その場で効く）。**0.2.1 以降**。 */
  setOverlayOpacity(opacity: number): void;
  destroy(): void;
}

export type PluginVolumeViewMode = "MIP" | "MINIP" | "VR";

export interface PluginVolumeViewHandle {
  setMode(mode: PluginVolumeViewMode): Promise<void>;
  /**
   * **白黒反転**（階調のみ）。🔴 **MINIP とは別物** — 投影は最大値のままで、
   * 反転するのは投影した後の見え方だけ。反転した MIP の「いちばん暗い点」は最大値の点。
   * 背景色も一緒に切り替わる。カメラ（向き）は保たれる。
   */
  setInvert(invert: boolean): Promise<void>;
  destroy(): void;
}

/** シリーズビューパネルの貸し出し（H34・**0.2.1 以降**）。 */
export interface PluginSeriesPanelOptions {
  /** 重ねるシリーズ（省略でフュージョンなし）。 */
  fusion?: {
    series: PluginSeriesRef;
    /** `registerVolumes`（H21）が返した `transform` をそのまま渡す（**中身を見ない**）。 */
    transform?: unknown;
    /** 重ねる側の不透明度（0〜1・既定 0.5）。 */
    opacity?: number;
    /**
     * 重ねる側の **LUT 名**（既定 `"Hot_Iron"`）。`null` でグレースケール。
     * 名前は host が実データへ解決する（**プラグインが LUT を取りに行く必要はない**）。
     * 読めない名前を渡したときはグレースケールで描き、コンソールに理由を残す。
     */
    lut?: string | null;
  };
  /** 画像下の操作パネルを出すか（既定 true）。 */
  showControls?: boolean;
}

export interface PluginSeriesPanelHandle {
  destroy(): void;
}

/** メッシュ化して測るマスク（H33）。0=背景, >0=セグメント番号。 */
export interface PluginMaskInput {
  data: Uint8Array;
  dims: [number, number, number];
  indexToWorld: number[];
}

export interface PluginMeshOptions {
  /** 測るセグメント番号。省略時はマスクに出てくる番号すべて。 */
  segments?: number[];
  /** 平滑化反復数（0 で無効）。既定 15。 */
  smoothIterations?: number;
  passBand?: number;
}

export interface PluginMeshMeasurement {
  segment: number;
  voxelCount: number;
  /** ボクセル数 × 1 ボクセルの体積。 */
  voxelVolumeMm3: number;
  voxelVolumeMl: number;
  /** メッシュ（平滑化後の曲面）の体積。**ボクセル数の体積とは一致しない**。 */
  meshVolumeMm3: number;
  meshVolumeMl: number;
  surfaceAreaMm2: number;
  /** 主径 [長径, 中径, 短径]（mm・PCA 軸への投影範囲）。 */
  diameters: [number, number, number];
  numTriangles: number;
  numPoints: number;
  boundsMin: [number, number, number];
  boundsMax: [number, number, number];
}

/** 測るラベルの volume（H66）。`loadVolume` と同じ z-major の並び。0=背景。 */
export interface PluginLabelInput {
  data: Uint8Array | Uint16Array;
  dims: [number, number, number];
  indexToWorld: number[];
}

export interface PluginLabelStatsOptions {
  /** 測るラベル。省略時は出てくる全部。 */
  labels?: number[];
  /** 1 にすると、境界の 1 ボクセル（6 近傍）を除いた統計（`eroded`）も返す。 */
  erodeVoxels?: 0 | 1;
  /** 面積を出すスライス（格子の k）。 */
  slices?: number[];
  /** スライス内で、値がこの範囲（両端を含む）に入る画素の面積も出す。 */
  valueRanges?: Array<{ name: string; min: number; max: number }>;
}

/** 値の統計（ROI 統計と同じ実装。母標準偏差・非有限値は除く）。 */
export interface PluginValueStats {
  n: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
  median: number;
  sum: number;
  p5: number;
  p95: number;
  unit: string;
}

export interface PluginLabelSliceMeasurement {
  k: number;
  pixelCount: number;
  /** 画素の数え上げ × 画素面積（ROI 統計のメッシュの面積とは別の量）。 */
  areaCm2: number;
  /** 前景が無ければ NaN。 */
  mean: number;
  rangeAreasCm2: Record<string, number>;
}

export interface PluginLabelMeasurement {
  label: number;
  voxelCount: number;
  volumeMm3: number;
  volumeMl: number;
  unit: string;
  stats: PluginValueStats | null;
  eroded?: PluginValueStats | null;
  kRange: [number, number];
  /** ボクセル中心の重心（患者 LPS mm）。 */
  centroidLps: [number, number, number];
  slices: PluginLabelSliceMeasurement[];
}

/** 中心線グラフの節点（H41・**0.2.9 以降**）。端点 degree=1 / 分岐点 degree>=3。 */
export interface PluginCenterlineNode {
  id: number;
  /** 患者 LPS mm。 */
  world: [number, number, number];
  /** この節点に集まる枝の数。 */
  degree: number;
}

/** 2 つの節点を結ぶ 1 本の枝。**枝の内部に分岐は無い**＝1 本の管に対応する。 */
export interface PluginCenterlineBranch {
  id: number;
  startNode: number;
  endNode: number;
  /** startNode → endNode の順の制御点（患者 LPS mm）。2 点以上。 */
  pointsWorld: [number, number, number][];
  lengthMm: number;
}

export interface PluginCenterlineGraph {
  nodes: PluginCenterlineNode[];
  branches: PluginCenterlineBranch[];
}

export interface PluginCenterlineOptions {
  /** 制御点の簡略化（Douglas-Peucker）の許容誤差 mm。既定 0.5。 */
  simplifyEpsilonMm?: number;
  /** 細線化前に前景 bbox へ付ける余白ボクセル。既定 2。 */
  margin?: number;
  /**
   * 短い葉枝を落とす下限 mm。既定 0（＝落とさない）。
   * 骨格化は表面のこぶから短いひげを生やすので、実データでは 2〜3 mm を入れることが多い。
   */
  pruneMinLengthMm?: number;
  /**
   * 前景とみなすセグメント番号。省略すると 0 以外すべてが前景。
   * 🔴 複数セグメントのマスクを省略のまま渡すと、別々の構造が 1 本に繋がった骨格ができる。
   */
  segment?: number;
}

/** 弧長位置での 位置 ＋ 正規直交フレーム（H41）。 */
export interface PluginCurveFrame {
  positionWorld: [number, number, number];
  /** 単位・接線方向。 */
  tangent: [number, number, number];
  /** 単位・接線に直交（出力の第 2 軸）。 */
  normal: [number, number, number];
  /** 単位・tangent × normal。 */
  binormal: [number, number, number];
  /** 曲線の始点からの弧長 mm。 */
  arcLengthMm: number;
}

export interface PluginCurveFrameOptions {
  /** フレームどうしの弧長間隔 mm。正の有限値。 */
  spacingMm: number;
  /** 生成する本数。既定 1。曲線の外に出る分は**返らない**。 */
  count?: number;
  /** この点に最も近い曲線上の位置を中心に前後へ振り分ける。省略時は曲線の中央。 */
  anchorWorld?: [number, number, number];
  /**
   * 第 2 軸の規約。既定 `"ROTATION_MINIMIZING"`（捩れ最小）。
   * 血管のように曲線が面外へ出る用途はこちら。`"FIXED_Z"` は曲線が 1 断面に収まる用途向け。
   */
  frameMode?: "FIXED_Z" | "ROTATION_MINIMIZING";
}

interface PluginHostBase {
  /** 自分の plugin.json の id。 */
  pluginId: string;
  /**
   * H50: 本体の REST の基点（`ViewerTarget.apiBase` と同じ。同じ origin なら空文字）。
   * メイン画面の host からも `/api/instances/{sop}/rendered` などを組み立てられる。
   */
  apiBase: string;
  /** i18n 取得関数（ホスト言語に追従）。 */
  t: (key: string) => string;
  /**
   * いまの表示言語（`"ja"` / `"en"`）。**プラグインが自前の文言を持つ場合の言語判定に使う**
   * （`t()` は本体のキーしか引けない）。**0.1.12 以降**。
   *
   * <p>値は活性化した時点のもの。プラグインの UI は本体の React ツリーの外にあるため、
   * 途中で言語を切り替えても自動では追従しない（切り替えたら開き直す）。
   */
  locale: string;
  /** ユーザーへの簡易通知。 */
  notify: (message: string) => void;
  /** バックエンド面（Java 実装）を呼ぶ: POST /api/plugins/{id}/run。standalone のみ実行可。 */
  runBackend: (payload?: unknown) => Promise<unknown>;
  /**
   * 外部 AI への画像送信（H40）。
   *
   * <p>⚠ **患者の画素を第三者クラウドへ出す API である。** 使うには `plugin.json` の
   * `permissions` に `"ai-egress"` を宣言すること（未宣言なら `permission-denied` で弾かれる。
   * これは実際に強制される数少ない権限のひとつ）。送信のたびに、**送る画像とプロンプト全文を
   * 見せた同意ダイアログ**が本体側で出る。同意が効くのはセッション内・同一 `scopeKey` のみ。
   *
   * <p>例外は投げず `{ok:false, error}` で返る。`error:"canceled"` はユーザーが送信を
   * 取り消しただけなので、**エラーとして表示しないこと**。デスクトップ専用。
   */
  ai: {
    generate: (req: AiGenerationRequest) => Promise<AiGenerationOutcome>;
  };
  /**
   * 名前を付けて保存（H41）。OS の保存ダイアログを出すので、
   * **同名ファイルの上書き確認は OS が行う**（自前で確認しないこと）。
   * `{ok:false, canceled:true}` は取り消しであって失敗ではない。デスクトップ専用。
   */
  file: {
    saveAs: (opts: PluginSaveFileOptions) => Promise<SaveFileResult>;
    /**
     * **開くダイアログ**（H43・**0.3.0 以降**）。OS のダイアログでファイルを選ばせ、**絶対パス**を返す。
     * フォルダは選べない。取り消しは `{ok:false, canceled:true}`（失敗ではない）。
     * パスはバックエンド面（JAR）へ渡して読む想定。デスクトップ専用（web は `desktop-only`）。
     */
    pickFiles: (opts?: PluginPickFilesOptions) => Promise<PickFilesResult>;
    /**
     * H53: ジョブの成果物（JAR が一時フォルダに書き、結果の `__artifact` に入れて返したファイル）を、
     * OS の保存ダイアログで保存する。`jobId` は結果の `__artifact.jobId`。デスクトップ専用。
     */
    saveJobArtifact?: (jobId: string, opts: PluginSaveArtifactOptions) => Promise<SaveFileResult>;
    /** H56: フォルダを選ばせる（デスクトップ専用）。書き込みは選んだフォルダの直下だけ。 */
    pickDirectory?: (opts?: { title?: string }) => Promise<PickDirectoryResult>;
    /** H56: ジョブの成果物を選んだフォルダへ保存する（ダイアログなし・上書きしない名前）。 */
    saveJobArtifactTo?: (jobId: string, opts: { dirToken: string; name: string }) => Promise<SaveFileResult>;
    /** H56: バイト列を選んだフォルダへ書く（例: 集計 CSV）。 */
    writeToDirectory?: (opts: { dirToken: string; name: string; bytes: Uint8Array }) => Promise<SaveFileResult>;
  };
  /**
   * バックエンド面を**ジョブとして**走らせる（H45・**0.3.0 以降**）。進み具合と取り消しがある。
   *
   * <p>JAR の `run(Map)` には、args の `__progress`（`java.util.function.BiConsumer<Double,String>`）と
   * `__cancelled`（`java.util.function.BooleanSupplier`）が入る。同期の `runBackend` から呼ばれたときは
   * 入らないので、JAR は「無ければ何もしない」で書くこと。例外は投げない（`{ok:false}` で返る）。
   * `cancelled: true` は利用者の取り消しで、エラーとして表示しないこと。standalone 専用。
   */
  runBackendJob: (payload?: unknown, opts?: PluginJobOptions) => Promise<PluginJobOutcome>;
  /**
   * 外部の計算機（Jupyter Server・GPU）で計算する（H59・**0.4.0 以降**）。
   *
   * <p>`plugin.json` の `permissions` に `"remote-compute"` が要る。送るたびに本体の窓で、宛先・データ・
   * **コードの全文**を見せて同意を取る。データは本体が匿名化して作り（渡すのはシリーズの参照だけ）、
   * 計算機の上では作業フォルダに `inputs/0.npz` … が置かれる。`outputs/` に書いたものが返る。
   * 進み具合は `print("__progress__", 0.4, "message")`。例外は投げない。デスクトップ専用。
   */
  compute: {
    runJob: (opts: ComputeRunJobOptions, jobOpts?: PluginJobOptions) => Promise<ComputeRunOutcome>;
    /** H61: 計算機の一覧と、Colab のランタイムを確保しているか（トークンや URL は出さない）。 */
    status: () => Promise<ComputeEndpointStatus[]>;
    /**
     * H61: Colab のランタイムを解放する。`ask: true` なら本体が確認を出す（文言は本体が決める）。
     * 確保していなければ `{ok:true, released:false}`。次の `runJob` が自動で確保し直す。
     */
    releaseRuntime: (endpointId: string, opts?: { ask?: boolean }) => Promise<ComputeReleaseOutcome>;
  };
  /** 本体の DB（H44・H46・H51・**0.3.0 以降**）。 */
  db: {
    /** 患者を ID・氏名の部分一致で探す（H44）。**読み取りのみ**。空文字は全件。 */
    searchPatients: (query: string) => Promise<PluginPatient[]>;
    /**
     * 保管庫にある**動画**を並べる（H51）。**読み取りのみ**。検査（`{ studyUid }`。例: メイン画面の
     * `selectedStudyUid`）か患者（`{ patientKey }`）で引く。新しい検査から順。動画の判定は 2D ビューアと同じ
     * （Video 系 SOP クラス、または H.264 等で包まれた US Multi-frame など）。
     */
    listVideos: (query: PluginVideoListQuery) => Promise<PluginVideoEntry[]>;
    /** H57: DICOM ファイルを保管庫へ取り込む（H55 の `dicomToken` の範囲だけ）。 */
    importDicomFiles?: (req: { consentToken: string; paths: string[] }) => Promise<PluginDicomImportOutcome>;
    /**
     * DB を変えたことを知らせる（H46）。メイン画面の一覧（呼んだウィンドウ自身も含む）と、
     * 開いている他のウィンドウが読み直す。本体の書き込み API は自分で知らせるので、
     * これを呼ぶのはプラグインが別の経路で DB を変えたときだけ。
     */
    notifyChanged: (detail?: { studyUids?: string[]; patientId?: string }) => void;
  };
  /**
   * **動画の取り込み**（H47〜H49・**0.3.0 以降**）。standalone 専用。
   *
   * <p>🔴 **DICOM はプラグインに書かせない**。変換・DICOM・UID・患者属性・出所は本体が書き、保管庫へ書く前に
   * 本体が**必ず**確認ダイアログを出す。流れ: `probe`（重複の確認）→ `requestImportConsent`（ダイアログ 1 回）
   * → 1 本ずつ `importAsDicom`。札はダイアログで見せた**患者・ファイル・書くもの**の範囲でしか使えない。
   */
  video: {
    /** H47: 諸元・指紋（SHA-256）・既に取り込み済みか。本体の ffmpeg で調べる。 */
    probe: (path: string) => Promise<PluginVideoProbe>;
    /** H48（前半）: 本体の確認ダイアログを出し、同意の札を返す。取り消しは `cancelled`。 */
    requestImportConsent: (req: PluginVideoConsentRequest) => Promise<PluginVideoConsentResult>;
    /**
     * H48（後半）: 1 本取り込む（ジョブ）。同じ動画が既にあれば書かずに `duplicate: true`。
     * `frameValues` を渡すと「フレームごとの値」の SR も書く（長さが動画のフレーム数と違えば SR だけ書かない）。
     */
    importAsDicom: (req: PluginVideoImportRequest, opts?: PluginJobOptions) => Promise<PluginVideoImportOutcome>;
    /** H49: その動画に、このプラグインが書いた「フレームごとの値」を読む。無ければ null。 */
    readFrameValues: (sopInstanceUid: string) => Promise<PluginFrameValuesRead | null>;
    /**
     * H54: プラグインが作った MP4（H53 の成果物）を、元の動画から派生したシリーズとして本体が DICOM に書く。
     * `target: "db"` は保管庫へ（本体の確認ダイアログを必ず出す）、`"file"` は .dcm の成果物（`file.saveJobArtifact` で保存）。
     */
    saveDerivedVideo?: (req: PluginDerivedVideoRequest, opts?: PluginJobOptions) => Promise<PluginDerivedVideoOutcome>;
    /**
     * H55: バッチを始める前に本体の確認ダイアログを 1 回だけ出し、取り込み（H48）・DICOM の取り込み（H57）・
     * 派生シリーズの保存（H54）の札をまとめて返す。
     */
    requestBatchConsent?: (req: PluginBatchConsentRequest) => Promise<PluginBatchConsentResult>;
  };
}

/** `host.video.probe()` の結果（H47）。 */
export interface PluginVideoProbe {
  path: string;
  fileName: string;
  sizeBytes: number;
  /** 元ファイルの SHA-256（16 進）。 */
  sha256: string;
  codec: string;
  width: number;
  height: number;
  fps: number;
  /** 数え直したフレーム数。 */
  frameCount: number;
  durationSec: number;
  /** 同じ動画が既にあればその所在（あれば取り込まれない）。 */
  alreadyImported: { sopInstanceUid: string; studyInstanceUid: string; patientId: string; patientName: string } | null;
}

/** 患者の指定（H48）。既存（`db.searchPatients` の `patientKey`）か新しい患者か。 */
export type PluginVideoPatient =
  | { patientKey: string }
  | { create: { patientId: string; patientName?: string; birthDate?: string; sex?: string } };

/** フレームごとの値の 1 系列（フレーム 1〜N の順）。 */
export interface PluginFrameValuesSeries {
  /** 英数字と _ の 1〜16 文字。 */
  key: string;
  label: string;
  /** UCUM。無次元は "1"（既定）。 */
  unit?: string;
  values: number[];
}

/** フレームごとの値（H48）。系列の長さは動画のフレーム数と一致すること。 */
export interface PluginFrameValues {
  series: PluginFrameValuesSeries[];
  params?: Record<string, string>;
}

/** `host.video.requestImportConsent()` の要求（確認ダイアログに出す中身）。 */
/** H48 の同意の 1 本分（動画ごとに患者・シリーズの説明を変えられる）。 */
export interface PluginVideoConsentItem {
  path: string;
  patient: PluginVideoPatient;
  /** シリーズの説明（ダイアログに出る。渡したら `importAsDicom` でも同じ値であること）。 */
  seriesDescription?: string;
}

/** 動画ごとの患者は `items`。全部同じ患者なら従来の `patient` + `paths` でもよい。 */
export interface PluginVideoConsentRequest {
  items?: PluginVideoConsentItem[];
  patient?: PluginVideoPatient;
  paths?: string[];
  /** `"US"` は US Multi-frame。既定は Video Photographic。 */
  modality?: "US";
  /** フレームごとの値の SR も書くなら、その説明（ダイアログにそのまま出る）。 */
  frameValues?: { description: string };
}

/**
 * 事前確認の問題（ダイアログは出ない）。`code`: `patient-exists`（新しい患者の ID が既にある。
 * `existingPatientKey` で既存の患者を指せる）/ `patient-not-found` / `patient-invalid` / `patient-conflict` / `patient-missing`。
 */
export interface PluginVideoConsentIssue {
  index: number;
  path: string | null;
  code: string;
  message: string;
  existingPatientKey?: string | null;
  existingPatientName?: string | null;
}

export type PluginVideoConsentResult =
  | { ok: true; consentToken: string }
  | { ok: false; cancelled?: boolean; error?: string; issues?: PluginVideoConsentIssue[] };

/** `host.video.importAsDicom()` の 1 本分の要求。 */
export interface PluginVideoImportRequest {
  consentToken: string;
  path: string;
  /** 同意のときと同じ指定であること。 */
  patient: PluginVideoPatient;
  modality?: "US";
  /** 同じ取り込みの 2 本目以降は 1 本目の `studyInstanceUid` を渡すと同じ検査に入る。 */
  studyInstanceUid?: string;
  studyDescription?: string;
  seriesDescription?: string;
  frameValues?: PluginFrameValues;
}

/** `host.video.importAsDicom()` の 1 本分の結果。 */
export interface PluginVideoImportResult {
  duplicate: boolean;
  sopInstanceUid: string;
  seriesInstanceUid: string | null;
  studyInstanceUid: string;
  patientId: string;
  numberOfFrames: number;
  transcoded: boolean;
  frameValuesSopInstanceUid: string | null;
  /** SR を書けなかった理由（動画は取り込まれている）。 */
  frameValuesError: string | null;
}

export type PluginVideoImportOutcome =
  | { ok: true; result: PluginVideoImportResult }
  | { ok: false; cancelled?: boolean; error?: string };

/** `host.video.readFrameValues()` の結果（H49）。 */
export interface PluginFrameValuesRead {
  sopInstanceUid: string;
  videoSopInstanceUid: string;
  producerId: string;
  contentDate: string;
  series: { key: string; label: string; unit: string; values: number[] }[];
  params: Record<string, string>;
}

/** `host.file.pickFiles()` の引数（H43）。 */
export interface PluginPickFilesOptions {
  title?: string;
  /** 複数選べるか（既定 false）。 */
  multiple?: boolean;
  /** 拡張子のフィルタ（例 `[{ name: "Video", extensions: ["avi", "mp4"] }]`）。 */
  filters?: { name: string; extensions: string[] }[];
}

/** `host.file.pickFiles()` の結果。`canceled` は失敗ではない。 */
export type PickFilesResult =
  | { ok: true; paths: string[] }
  | { ok: false; canceled?: boolean; error?: string };

/** `host.runBackendJob()` の引数（H45）。 */
export interface PluginJobOptions {
  /** 進み具合（0〜1）と短い説明。ポーリングのたびに呼ばれる。 */
  onProgress?: (progress: number, message: string) => void;
  /** 取り消し。abort すると backend に取り消しを求め、JAR が止まるのを待つ。 */
  signal?: AbortSignal;
  /** ポーリング間隔（ms・既定 400）。 */
  pollMs?: number;
}

/** `host.runBackendJob()` の結果。 */
export type PluginJobOutcome =
  | { ok: true; result: unknown }
  | { ok: false; cancelled?: boolean; error?: string };

/** `host.compute.runJob()` に渡すシリーズ（H59）。 */
export interface ComputeJobInput {
  studyUid: string;
  seriesUid: string;
  /**
   * 既定 `npz`: `volume`（float32 `[z, y, x]`・Rescale 適用済み）・`spacing` `[dz, dy, dx]`・`origin`（LPS）・
   * `direction`（3×3）・`meta.json`。`dicom-zip` は匿名化した DICOM の zip。
   */
  format?: "npz" | "dicom-zip";
}

/** `host.compute.runJob()` の引数（H59）。 */
export interface ComputeRunJobOptions {
  /** 実行する Python（64KB まで）。データを文字列で埋め込んだコードは弾かれる。 */
  script: string;
  /** 0〜8 件。0 件なら画像を送らずコードだけを実行する（同意画面と監査は同じ）。 */
  inputs: ComputeJobInput[];
  /** 環境設定 ＞ 外部の計算機 の ID。省略するとトークンの入った最初の計算機。 */
  endpointId?: string;
  /** 秒。既定 3600・上限 6 時間。 */
  timeoutSec?: number;
}

/** `outputs/` のファイル。 */
export interface ComputeOutputFile {
  name: string;
  size: number;
}

/** `host.compute.runJob()` の結果（H59）。 */
export type ComputeRunOutcome =
  | {
      ok: true;
      jobId: string;
      /** `error` は Python の例外（ジョブ自体は終わっている）。 */
      status: "ok" | "error";
      stdout: string;
      stderr: string;
      errorName?: string;
      errorValue?: string;
      traceback?: string[];
      files: ComputeOutputFile[];
      /** `outputs/` のファイルを取り出す。無ければ null。まとめて保存するなら `file.saveJobArtifact(jobId)`。 */
      readFile: (name: string) => Promise<Uint8Array | null>;
    }
  | { ok: false; cancelled?: boolean; error: string };

/** `host.db.searchPatients()` の 1 件。`patientKey` は保存領域（H8/H42）の患者の鍵と同じ。 */
export interface PluginPatient {
  patientKey: string;
  patientId: string;
  patientName: string;
  /** DICOM の日付（YYYYMMDD）。無ければ空。 */
  birthDate: string;
  sex: string;
  studyCount: number;
}

/** `host.db.listVideos()` の問い合わせ（H51）: 検査 1 つ、または患者 1 人。 */
export type PluginVideoListQuery = { studyUid: string } | { patientKey: string };

/** `host.db.listVideos()` の 1 件（保管庫にある動画 1 本）。 */
export interface PluginVideoEntry {
  /** `searchPatients` の `patientKey` と同じ（保存領域の鍵にそのまま使える）。 */
  patientKey: string;
  patientId: string;
  patientName: string;
  studyUid: string;
  /** YYYYMMDD（無ければ空）。 */
  studyDate: string;
  studyDescription: string;
  seriesUid: string;
  seriesNumber: number | null;
  seriesDescription: string;
  modality: string;
  sopInstanceUid: string;
  sopClassUid: string;
  transferSyntaxUid: string;
}

/**
 * `host.ai.generate()` の要求（H40）。
 *
 * ⚠ **`model` / `apiVersion` / `responseModalities` は Gemini の語彙で、複数提供元への
 * ルーティングを入れる際に `capability` へ置き換わる**（設計: `fw/ai-routing-design.md`）。
 * 新しいプラグインは**宛先やモデルを名指しせず、用途を頼む**形で書くこと。
 * 提供元の差（電文の形・応答の形）は本体が吸収する。
 */
export interface AiGenerationRequest {
  /**
   * 何をしてほしいか。**新しいプラグインはこれを渡す。**
   *
   * <p>モデルも宛先も本体が決める（利用者の環境設定に従う）。提供元が増えても
   * プラグインは書き換えなくてよい。設計: `fw/ai-routing-design.md` §2。
   *
   * <p>⚠ 提供元によって**できる用途が違う**（画像を生成しない提供元がある）。
   * 扱えない用途は送信前に `unsupported-capability` で断られる。
   */
  capability?: AiCapability;
  /**
   * モデル ID（例 `gemini-3.1-flash-image`）。
   *
   * @deprecated 提供元に固有の語彙。`capability` を使うこと
   *             （`fw/ai-routing-design.md` §3.1）。渡された場合はそのまま尊重する。
   */
  model?: string;
  /**
   * API バージョン。既定 `v1beta`。
   *
   * @deprecated Gemini に固有。提供元ごとの接続先設定へ移る。
   */
  apiVersion?: string;
  /** 指示文。**同意ダイアログに全文が表示される**ので、患者情報を混ぜないこと。 */
  prompt: string;
  /** 送信する画像そのもの（PNG 等のエンコード済みバイト列）。 */
  imageBytes: Uint8Array;
  mimeType?: string;
  /** 同意を覚える単位。通常はシリーズ UID。省略すると毎回確認になる。 */
  scopeKey?: string;
  temperature?: number;
  /**
   * 既定 `["TEXT","IMAGE"]`。画像と説明文を 1 回で受け取るために両方を要求する。
   *
   * @deprecated Gemini に固有。用途（`image-to-image` / `image-to-text`）で表す形に移る。
   */
  responseModalities?: string[];
  /**
   * 提供元固有の追い込み（temperature 以外の細かい指定）。
   *
   * <p>🔴 **無くても動くように書くこと。** 提供元が変わると無視される。
   */
  providerOptions?: Record<string, unknown>;
}

/** 用途。提供元ではなくこれで頼む（`fw/ai-routing-design.md` §2）。 */
export type AiCapability = "image-to-image" | "image-to-text";

/** どこで何によって作られたか。作品の再現性と監査のために持ち回る。 */
export interface AiProvenance {
  providerId: string;
  kind: string;
  model: string;
  endpointHost: string;
  /** 平文 http で送った（院内に立てたサーバのみ起こりうる）。 */
  plaintext?: boolean;
}

/**
 * `host.ai.generate()` の結果。
 *
 * <p>🔑 **`image` / `text` は提供元非依存。** 提供元ごとの応答の形は本体のアダプタが畳むので、
 * プラグインはこの 2 つだけを見ればよい（`fw/ai-routing-design.md` §3.2）。
 *
 * <p>⚠ **`ok: true` でも `image` / `text` が無いことがある。** 安全フィルタで止まった場合など。
 * そのときは `blockReason` が入るので、利用者への案内を分けられる。
 */
export type AiGenerationOutcome =
  | {
      ok: true;
      /** 生成された画像（`image-to-image` のとき）。 */
      image?: { bytes: Uint8Array; mimeType: string };
      /** 返ってきた文章。 */
      text?: string;
      /** 何も返らなかった理由。`image` も `text` も無いときだけ入る。 */
      blockReason?: string;
      provenance?: AiProvenance;
      /**
       * 提供元の生レスポンス。
       *
       * @deprecated 提供元ごとに形が違う。`image` / `text` を使うこと。
       *             移行期間のあいだだけ残す。
       */
      data?: unknown;
    }
  | {
      ok: false;
      /**
       * `desktop-only` / `permission-denied` / `no-api-key` / `canceled` / `busy` /
       * `unsupported-capability` / API 側のメッセージ。
       */
      error: string;
      status?: number;
      kind?: string;
    };

/** `host.file.saveAs()` の引数（H41）。 */
export interface PluginSaveFileOptions {
  /** 保存ダイアログの初期ファイル名（拡張子込み）。 */
  defaultName: string;
  bytes: Uint8Array;
  /** 拡張子フィルタ。既定は PNG。 */
  filters?: { name: string; extensions: string[] }[];
}

/** `host.file.saveAs()` の結果。`canceled` は失敗ではない。 */
export type SaveFileResult =
  | { ok: true; filePath: string }
  | { ok: false; canceled?: boolean; error?: string };

/** 2D Viewer 系サーフェスに渡るコンテキスト。 */
export interface Viewer2DPluginHost extends PluginHostBase {
  surface: Viewer2DSurface;
  /** 表示中タイルへの操作。 */
  actions: ViewerActions;
  /**
   * 操作対象タイル（選択タイル→無ければ全タイル。`actions` の対象と同じ）が
   * いま何を表示しているか。**0.1.9 以降**。
   *
   * <p>**呼ぶたびに現在値を読む**。ダイアログを開いている間にユーザーがスライスを送ることが
   * あるので、活性化時に一度だけ読んだ値を持ち回らないこと。
   */
  getTargets: () => ViewerTarget[];
  /**
   * 対象タイルの表示状態。`tileId` を省略すると対象の先頭タイル。取得不能なら null。
   * **0.1.9 以降**。
   */
  getViewState: (tileId?: string) => ViewerViewState | null;
  /**
   * 対象タイルのスライス 1 枚の**校正済み画素**（HU / SUV。表示 8bit ではない）。
   * `tileId` 省略時は対象の先頭タイル。取得不能・`sliceIndex` が範囲外なら null。**0.1.9 以降**。
   *
   * <p>1 回 1 スライス。シリーズ全体が要るなら `sliceIndex` を変えて回すこと
   * （512×512×500 を Float32 で全部持つと 500MB を超える）。
   *
   * <p>患者の生画素を扱う API なので、使うプラグインは `plugin.json` の `permissions` に
   * `"read-pixels"` を宣言すること（導入時の同意画面に出る）。
   */
  getPixelData: (tileId?: string, opts?: PixelDataOptions) => Promise<PixelData | null>;
  /**
   * 対象タイルの**空間校正と、その出自**（H35）。`tileId` 省略時は対象の先頭タイル。
   * XA / XRF 以外、または解決できないなら null。
   *
   * <p>数値（mm/px）だけを見て測ると、**未校正・近似のまま mm で報告する**ことになる。
   * `tier` を見て、`approximate` なら「近似」、`uncalibrated` なら px として扱うこと。
   *
   * <p>⚠️ 校正を**書く**口は無い（意図的）。確定するのは本体だけ。
   */
  getSpatialCalibration: (tileId?: string) => SpatialCalibration | null;
  /**
   * アンギオ解析の結果を **本体と同じ SR** で保存する（H37）。
   *
   * <p>**本体が必ず確認ダイアログを出す**（抑止不可）。拒否されると
   * `{ ok: false, cancelled: true }` が返る。出所（プラグイン id・版）は本体が入れる。
   *
   * <p>🔴 スタディはプラグインが選べない（表示中のもの）。参照 SOP が**そのタイルの並びに
   * 無ければ拒否**される。3D QCA は方向 A / B の両方が開いているタイルから呼ぶこと。
   */
  saveAngioReport: (tileId: string | undefined, req: AngioReportRequest) => Promise<SrResult>;
  /**
   * **表示状態（XA GSPS）を保存する**（H38）。確認ダイアログは抑止不可。出所は本体が入れる。
   *
   * <p>🔴 H37 と同じ制約——スタディはプラグインが選べず、参照 SOP が**そのタイルの並びに
   * 無ければ拒否**される。
   */
  savePresentationState: (
    tileId: string | undefined,
    req: PresentationStateRequest,
  ) => Promise<SrResult>;
  /**
   * **解析結果をレポートへ差し込める形で登録する**（H39）。DICOM は書かないので確認は出ない。
   *
   * <p>実際にレポートへ差し込むのは利用者の操作（レポート画面の「解析結果を差し込む」）で、
   * ここはその候補に載せるだけ。登録簿は**セッション限り・直近 20 件**。
   *
   * <p>🔴 `caveats` は 1 つ以上必須。id は host が名前空間を付ける（本体の結果を差し替えられない）。
   */
  publishAnalysisResult: (
    tileId: string | undefined,
    input: AnalysisResultInput,
  ) => { ok: boolean; error?: string };
  /**
   * 対象タイルの **XA 表示状態**（DSA・フレーム軸）（H36）。XA / XRF でなければ null。
   *
   * <p>`isSubtracted` が true のとき、`getPixelData()` が返すのは**差分画像**である
   * （血管が正の大きな値）。エッジ検出や対数変換の向きを必ず切り替えること。
   */
  getXaState: (tileId?: string) => XaState | null;
  /**
   * 対象タイルの **XA シネの時間軸**（**H40**）。XA / XRF でなければ null。
   *
   * <p>フレーム番号を秒に直すのに要る（造影の通過時間・フレームカウント）。
   * 🔴 **`fpsSource` を必ず見ること**——`"default"` は測定値ではない。
   */
  getXaCine: (tileId?: string) => XaCine | null;
  /**
   * **再構成済み 3D 血管モデルの一覧**（**H11**）。新しい順。まだ無ければ空配列。
   * 点列を含まない要約だけを返す（本体は `getVesselModel()` で取る）。
   */
  listVesselModels: () => VesselModelSummary[];
  /**
   * **再構成済み 3D 血管モデル**（**H11**）。`runId` 省略時は最も新しいもの。無ければ null。
   *
   * 中心線（患者 LPS mm）・点ごとの内腔径・分岐のトポロジと、校正と出自が入る。
   * 本体の 3D QCA（A6a）／分岐部（A6b）で再構成すると登録される。
   *
   * 🔴 **測れなかった点の径は null。** 補間して埋めないこと（本体も埋めていない）。
   * 🔴 **`calibration.diameterMethod` を必ず見る。** 半値法と密度計測では径の絶対値が
   * 10% 以上違い、断面積はその 2 乗で効く。係数を定数として持ち回らないこと。
   * ⚠️ セッション限り。アプリを閉じると消える。
   */
  getVesselModel: (runId?: string) => VesselModel | null;
  /**
   * **解析結果（点ごとの値）を書き戻す**（**H12**）。3D ウィンドウが色マップと凡例で表示する。
   *
   * 確認ダイアログは出ない（DICOM を書かない）。出自（id・名前・版）は host が入れる。
   * 同じ `runId` に入れ直すと置き換わる。
   *
   * 🔴 **壊れた入力はエラーになる**（未知の `segmentId`・範囲外の `index`・非有限の値・
   * 退化した `range`）。捨てて残りを採用すると**ずれたまま色が乗り**、誰も気付けない。
   */
  putVesselAnalysis: (runId: string, result: VesselAnalysisInput) => VesselAnalysisResult;
  /**
   * 処理結果（値マップ）を**表示中スライスへ重ねて見せる**。`tileId` 省略時は対象の先頭タイル。
   * rows/cols が現在スライスと不一致なら false。**0.1.9 以降**。
   *
   * <p>渡すのは値だけ。色付け（`window` / `colormap` / `opacity`）は本体がする。
   * `NaN` の画素は透明になるので、マスクや部分的なマップをそのまま渡せる。
   * 本体が画像左下に「プラグイン: <名前>」のラベルを出す。
   *
   * <p>オーバーレイは**出したスライスに紐付く**（他スライスでは隠れ、戻ると再表示。
   * シリーズ切替では破棄）。**保存はされない**（派生シリーズ保存は未実装）。
   */
  showOverlay: (tileId: string | undefined, overlay: Overlay) => boolean;
  /**
   * **ラベルの volume をビューアの Mask として読み込む**（H65・**0.4.0 以降**）。ROI マネージャに出て、
   * セグメントの札には表の名前が出る。格子は `loadVolume` が返したもの（`dims`・`ipp`・`sliceStep`）を渡す。
   * スライスが IPP で 0.5 mm 以内に揃わなければ拒否。前景の無いラベルは入らない（255 ラベルまで）。
   * **表示だけで保存はしない**（保存は `saveSegmentation`）。
   */
  showLabelVolume: (tileId: string | undefined, req: LabelVolumeRequest) => Promise<LabelVolumeResult>;
  /** オーバーレイを消す。`tileId` 省略時は対象タイル全部。**0.1.9 以降**。 */
  clearOverlay: (tileId?: string) => void;
  /**
   * 処理結果を**派生シリーズとして保存する**（standalone はこの PC の保管庫、web は接続中の PACS）。
   * **0.1.9 以降**。
   *
   * <p>**本体が必ず確認ダイアログを出す**（抑止不可）。ユーザーが拒否すると
   * `{ ok: false, cancelled: true }` が返る。プラグインが黙って保存することはできない。
   *
   * <p>画素は 16bit signed ＋ Rescale で保存される（HU のような整数はそのまま、確率マップのような
   * 小さい実数は値域から係数を決めて量子化）。**`NaN` を含むなら `background` が必須**。
   * 保存物には `[Plugin] ` 接頭辞とプラグイン id・版が必ず残る。**元シリーズは変更されない。**
   */
  saveDerivedSeries: (tileId: string | undefined, req: DerivedSeriesRequest) => Promise<DerivedSeriesResult>;
  /**
   * ユーザーが描いた **ROI（計測・幾何注釈）を読む**。`tileId` 省略時は**対象タイル全部**
   * （他の問い合わせ系は「先頭タイル」だがこれだけ違う。ベースラインと追跡を並べて開く用途を想定）。
   * ROI が無ければ空配列。**0.1.9 以降**。
   *
   * <p>**呼ぶたびに現在値を読む**。ユーザーは ROI を編集し続けるので、活性化時の
   * スナップショットを持ち回らないこと。
   */
  getRois: (tileId?: string) => ViewerRoi[];
  /**
   * **シリーズ 1 本をボリュームとして読む**。校正済みの値と**患者 LPS の幾何**が付く。
   * **0.2.0 以降**。
   *
   * <p>`getPixelData`（1 枚ずつ・開いているタイルのみ）では複数シリーズの格子の対応が組めない。
   * こちらは**開いていないシリーズ**も読める（同じ患者の中で）。
   *
   * <p>★ **1 回 1 ボリューム。** 大きさは {@link Viewer2DPluginHost.estimateVolume} で
   * **先に**聞ける。数百 MB になり得るので、聞かずに複数本読まないこと。
   *
   * <p>NM（SPECT）の多フレーム断層も、本体が Z に展開してから読む。ただし
   * **間隔が無いシリーズでは座標を作らない**（捏造しない）ので `spatial: false` になる。
   */
  loadVolume: (
    ref: PluginSeriesRef,
    onProgress?: (loaded: number, total: number) => void,
  ) => Promise<PluginVolume | null>;
  /** 読み込み前の大きさの見積り。**0.2.0 以降**。 */
  estimateVolume: (ref: PluginSeriesRef) => Promise<PluginVolumeEstimate | null>;
  /**
   * **位置合わせを実行する**（剛体・非剛体・その両方）。本体の検証済み実装をそのまま使う。
   * **0.2.0 以降**。
   *
   * <p>★ **プラグインが持っているボリュームは渡せない**（シリーズ参照だけを受ける）。
   * Worker へは画素バッファを*転送*するので、渡した側の配列が detach されて壊れるため。
   */
  registerVolumes: (
    req: PluginRegistrationRequest,
    onProgress?: (fraction: number, stage: string) => void,
  ) => Promise<PluginRegistrationResult | null>;
  /**
   * 位置合わせの結果で `source` を `target` の格子へリサンプルする。**0.2.0 以降**。
   *
   * <p>向きは **target world → source world**（pull-back）。
   * **範囲外は `NaN`**（0 で埋めない ＝「視野の外」と「空気」を混同しない）。
   * `transform` に `null` を渡すと、幾何だけで格子を合わせる（位置合わせなしのリサンプル）。
   */
  resampleVolume: (
    source: PluginVolume,
    transform: unknown | null,
    target: PluginVolumeGrid,
  ) => PluginVolume;
  /**
   * **表示位置を移動する**。結果の一覧から「その ROI のスライス」へ飛ぶ用途。**0.1.13 以降**。
   *
   * <p>範囲外は端に丸める。**読み出し（`getPixelData`）とは別**にしてあるので、
   * 読むだけで画面が動くことはない。`tileId` 省略時は対象タイル。
   */
  goTo: (tileId: string | undefined, dims: { sliceIndex?: number; c?: number; t?: number }) => void;
  /**
   * **ROI を選択状態にする**。`null` で解除。`exclusive` 既定 true（他の選択を外す）。
   * **0.1.13 以降**。
   *
   * <p>ハイライトの実体は本体の選択表示なので、プラグイン独自の強調とずれない。
   */
  selectRoi: (tileId: string | undefined, roiUid: string | null, exclusive?: boolean) => void;
  /**
   * ROI に紐付けた**このプラグインの属性**を読む。未設定なら空オブジェクト。
   * キーは自動で `plugin.<pluginId>.` 名前空間に置かれるので、他プラグインの属性とは混ざらない。
   */
  getRoiMeta: (roiUid: string) => Record<string, string>;
  /**
   * ROI に**このプラグインの属性**を書く（既存キーはマージ更新）。ROI が無ければ false。
   * 例: 病変の追跡 ID・標的/非標的の区分・測定ステータス。
   *
   * <p>属性は ROI と同じ寿命しか持たない（本体に ROI の永続化が無いため、アプリ再起動で消える）。
   * 永続化が要るならプラグイン側で保存すること。
   */
  setRoiMeta: (roiUid: string, patch: Record<string, string>) => boolean;
  /**
   * ROI の追加・変更・削除を購読する。返り値を呼ぶと解除（ダイアログを閉じるときは必ず解除する）。
   * **何が変わったかは渡さない**ので、通知を受けたら `getRois()` を読み直すこと。
   */
  subscribeRois: (listener: () => void) => () => void;
  /**
   * **このプラグイン専用の保存領域**を読む（患者単位・backend 保管）。**0.1.12 以降**。
   * 未保存でもエラーにならず `json: null` が返る。`patientKey` 省略時は対象タイルの患者。
   */
  loadStore: (patientKey?: string) => Promise<PluginStoreDoc>;
  /**
   * **このプラグイン専用の保存領域**へ書く。**0.1.12 以降**。
   *
   * <p>`version` は `loadStore()` で受け取った値をそのまま返送する規約。別ウィンドウ・別端末が
   * 先に保存していたら `{ ok: false, conflict: true }` が返るので、**読み直して統合してから**
   * 新しい版で再保存すること（単純な上書きは相手の記録を消す）。初回保存は `version: null`。
   */
  saveStore: (
    json: string,
    opts?: { patientKey?: string; version?: number | null },
  ) => Promise<PluginStoreSaveResult>;
  /** **このプラグイン専用の保存領域**を消す。**0.1.12 以降**。 */
  deleteStore: (patientKey?: string) => Promise<boolean>;
  /**
   * **専用ウィンドウを開く**（H30・**0.2.1 以降**）。本体が窓を開き、**中身の DOM だけ貸す**。
   *
   * <p>同じ文書の中に浮かぶ窓である（OS のウィンドウではない）。別文書にすると
   * `container: HTMLElement` を渡せず、Cornerstone の単一 RenderingEngine 前提も崩れるため。
   *
   * <p>タイトルバーには**プラグイン名が必ず出る**（消せない）。閉じたら本体が後始末し、
   * その窓に貸したビューポートも一緒に落ちる。
   */
  openWindow: (opts?: PluginWindowOptions) => PluginWindowHandle;
  /**
   * **値ボリュームを 2D ビューポートとして表示する**（H31・**0.2.1 以降**）。
   * W/L・パン/ズーム・スライス送りは本体の実装がそのまま効く。
   *
   * <p>幾何とメタデータは `referenceTileId` が表示しているシリーズへ委譲するので、
   * 参照線・向きマーカー・座標同期が元シリーズと一致する。
   *
   * <p>🔴 **ボリュームの k と参照シリーズのスライスは 1:1 で対応していること。**
   * 並びが違うと「ずれた絵」ではなく**「もっともらしいが別スライスの絵」**になり、見て気付けない。
   * `getPixelData()` で数枚読み比べてから渡すこと。
   *
   * <p>値は**校正済みのまま**扱われる（Modality LUT は恒等）。生の格納値を渡さないこと。
   */
  mountViewport: (
    el: HTMLElement,
    volume: PluginValueVolume,
    referenceTileId: string | undefined,
    opts?: PluginViewportOptions,
  ) => Promise<PluginViewportHandle | null>;
  /**
   * **値ボリュームを 3D（MIP / MINIP / VR）で表示する**（H32・**0.2.1 以降**）。
   *
   * <p>🔴 `NaN` は投影の前に潰される（MIP なら最小値、MINIP なら最大値で埋める）。
   * 「データが無い」ところが投影で勝たないようにするため。`background` で変えられる。
   */
  mountVolumeView: (
    el: HTMLElement,
    volume: PluginValueVolume,
    opts?: {
      mode?: PluginVolumeViewMode;
      background?: number;
      preset?: string;
      /** 白黒反転（階調のみ。投影は最大値のまま＝MINIP とは別物）。 */
      invert?: boolean;
    },
  ) => Promise<PluginVolumeViewHandle | null>;
  /**
   * **マスクをメッシュ化して測る**（H33・**0.2.1 以降**）。セグメントごとに別のメッシュにする。
   *
   * <p>🔴 返る体積は 2 種類ある。`voxelVolumeMm3`（数え上げ）と `meshVolumeMm3`
   * （平滑化した曲面）は**一致しない**。どちらが正しいでもないので両方返す。
   */
  measureMask: (mask: PluginMaskInput, opts?: PluginMeshOptions) => PluginMeshMeasurement[];
  /**
   * **ラベルの volume を測る**（H66・**0.4.0 の次の版から**）。体積（数え上げ）・値の統計・重心・
   * 指定スライスの面積。`values` は H10 で読んだボリュームそのもの（格子が合わなければ例外）。
   */
  measureLabels: (labels: PluginLabelInput, values: PluginVolume, opts?: PluginLabelStatsOptions) => PluginLabelMeasurement[];
  /**
   * **マスクを 3D 細線化して中心線グラフにする**（H41・**0.2.9 以降**）。0=背景 / >0=前景。
   *
   * <p>本体の Lee-Kashyap-Chu 1994 細線化（Fiji Skeletonize3D と数値一致）＋ 26 近傍歩行を
   * そのまま通す。3D 細線化は vtk.js にも cornerstone にも無いので、
   * **各プラグインが自前で書くと実装がアプリ内に増え続ける**（H5 / H33 と同じ理由）。
   *
   * <p>返る枝は**内部に分岐を持たない**＝1 本の管に対応する。
   * **どの枝がどの構造かは本体が知らない**——選ぶのはプラグインの仕事。
   *
   * <p>前景が無ければ `null`（空のグラフは返さない＝「何も無かった」と「できなかった」を混ぜない）。
   */
  extractCenterline: (
    mask: PluginMaskInput,
    opts?: PluginCenterlineOptions,
  ) => PluginCenterlineGraph | null;
  /**
   * **折れ線に沿って等間隔の位置と正規直交フレームを作る**（H41・**0.2.9 以降**）。
   * 中心線に直交する断面を並べる用途（流量計測・CPR・径プロファイル）。
   *
   * <p>補間は centripetal Catmull-Rom ＋ 弧長パラメータ化。**入力の平滑化はしない**
   * （どれだけ均すかは測る対象で決まるので本体が既定値を選ばない）。
   *
   * <p>🔴 **曲線をはみ出す位置は返さない**。端に丸めて本数を揃えると、呼び出し側は
   * 「等間隔で置けた」と思ったまま重なった断面で積分する（絵は最後までもっともらしい）。
   * 足りないことは戻り値の長さで分かるので、**必ず length を見ること**。
   */
  sampleCenterlineFrames: (
    polylineWorld: readonly [number, number, number][],
    opts: PluginCurveFrameOptions,
  ) => PluginCurveFrame[];
  /**
   * **シリーズビューパネルをそのまま貸す**（H34・**0.2.1 以降**）。W/L バー・スライダ・
   * ThickSlab・参照線・計測・シネ、そして**フュージョン重畳**が丸ごと付いてくる。
   *
   * <p>使い分け: **保管庫にある実シリーズはこちら**、プラグインが計算した値ボリュームは
   * `mountViewport`（H31）。`SeriesViewer` は `instances` を受け取る作りなので、
   * 値ボリュームはここには載らない。
   *
   * <p>⚠️ 渡した要素の中身は**本体が管理する**（React ルートを張る）。
   * プラグイン側から子要素を触らないこと。`destroy()` で返す。
   */
  mountSeriesPanel: (
    el: HTMLElement,
    series: PluginSeriesRef,
    opts?: PluginSeriesPanelOptions,
  ) => Promise<PluginSeriesPanelHandle | null>;
  /**
   * 計測を **DICOM SR（構造化レポート）** として保存する。**0.1.12 以降**。
   *
   * <p>**本体が必ず確認ダイアログを出す**（抑止不可）。拒否されると `{ ok:false, cancelled:true }`。
   * DICOM の構造・UID 採番・患者/検査属性の引き継ぎは本体が行うので、プラグインは
   * 「何を測ったか」だけを渡す。計測種別は表にあるものだけ
   * （**未知の種別は拒否される**。黙って落とすと「入れたはずの計測が無いレポート」になるため）。
   */
  saveStructuredReport: (tileId: string | undefined, req: SrRequest) => Promise<SrResult>;
  /**
   * マスクを **DICOM SEG（セグメンテーション）** として保存する。**0.2.2 以降**。
   *
   * <p>**本体が必ず確認ダイアログを出す**（抑止不可）。DICOM の組み立て・UID 採番・
   * 患者/検査の引き継ぎは本体が行う。
   *
   * <p>⚠ 渡す `grid` は **`loadVolume` が返したボリュームの幾何そのもの**であること。
   * 元シリーズのスライス位置と一致しなければ**保存されない**
   * （1 枚ずれた SEG は、見ないと気付けない）。前景ゼロのセグメントは保存対象から外れる。
   */
  saveSegmentation: (req: SegmentationRequest) => Promise<SegmentationResult>;
  /**
   * 線量分布を **DICOM RTDOSE** として保存する。**0.2.2 以降**。
   *
   * <p>派生シリーズ（`saveDerivedSeries`）でも保存はできるが、他システムからは
   * **ただの画像**に見える。こちらは「線量」として読まれる。
   *
   * <p>画素は Float32 [Gy] → uint16 ＋ `DoseGridScaling` に量子化される（相対分解能 1/65535）。
   * `NaN` を含むなら `backgroundGy` が**必須**（未指定は拒否。0 Gy で黙って埋めると
   * 「線量が無かった」と読まれるため）。
   *
   * <p>🔴 返り値の `warnings` には「出力はしたが DICOM の要求を満たしていない点」が入る。
   * **握り潰さないこと**（放射性医薬品の線量評価に RT Plan は無いので通常 1 件入る）。
   */
  saveRtDose: (req: RtDoseRequest) => Promise<RtDoseResult>;
  // 解析結果のレポートへの差し込みは `publishAnalysisResult(tileId?, input)` を使う（上に定義）。
  // 🔴 スタディ / シリーズは**本体が表示中のタイルから入れる**ので、プラグインは渡さない
  //    （渡せると、開いてもいない他患者の検査へレポートが生える）。
}

/** 書き出し（SEG / RTDOSE）で渡す格子の申告。**0.2.2 以降**。 */
export interface ExportGrid {
  dims: [number, number, number];
  /** 各軸の実効間隔 [mm]（[列, 行, スライス]）。 */
  spacing: [number, number, number];
  ipp: [number, number, number];
  iop: number[];
  sliceStep: [number, number, number];
}

/** DICOM SEG 保存の要求。**0.2.2 以降**。 */
export interface SegmentationRequest {
  /** 幾何・患者の継承元。**`loadVolume` で読んだのと同じシリーズ**を指すこと。 */
  reference: PluginSeriesRef;
  grid: ExportGrid;
  seriesDescription?: string;
  segments?: Array<{
    label: string;
    /** RGB 0..255。 */
    color?: [number, number, number];
    description?: string;
    /** `grid.dims` のボクセル数と同じ長さ。**0 以外が前景**。 */
    data: Uint8Array;
  }>;
  /**
   * **ラベルの volume で渡す形（H64・0.4.0 以降）**。`segments` の代わりに使う（どちらか一方）。
   * 1 ボクセル 1 値（0 は背景）で、`table` にある値だけがセグメントになる（前景の無いラベルは入らない）。
   * 多ラベル（例: 104 臓器）でも、セグメントごとに volume 大の配列を作らずに済む。
   */
  labels?: {
    /** `grid.dims` のボクセル数と同じ長さ・z-major（`loadVolume` と同じ並び）。 */
    data: Uint8Array | Uint16Array;
    table: Array<{ value: number; label: string; color?: [number, number, number]; description?: string }>;
  };
}

export interface SegmentationResult {
  ok: boolean;
  cancelled?: boolean;
  seriesInstanceUid?: string;
  sopInstanceUid?: string;
  /** 入力セグメントごとの前景ボクセル数（**0 のセグメントは保存されない**）。 */
  foregroundVoxels?: number[];
  error?: string;
}

/** RTDOSE 保存の要求。**0.2.2 以降**。 */
export interface RtDoseRequest {
  reference: PluginSeriesRef;
  grid: ExportGrid;
  /** 吸収線量 [Gy]。`grid.dims` のボクセル数と同じ長さ。 */
  doseGy: Float32Array;
  /** `doseGy` に `NaN` があるなら必須。 */
  backgroundGy?: number;
  seriesDescription?: string;
  doseType?: "PHYSICAL" | "EFFECTIVE" | "ERROR";
  /** DICOM の列挙値（既定 `PLAN`）。 */
  doseSummationType?: string;
  doseComment?: string;
  tissueHeterogeneityCorrection?: "IMAGE" | "ROI_OVERRIDE" | "WATER";
}

export interface RtDoseResult {
  ok: boolean;
  cancelled?: boolean;
  seriesInstanceUid?: string;
  sopInstanceUid?: string;
  /** 格納値 → Gy の係数。 */
  doseGridScaling?: number;
  /** 量子化で生じる最大誤差 [Gy]。 */
  quantizationErrorGy?: number;
  /** 背景で埋めたボクセル数。 */
  filledVoxels?: number;
  /** **出力はしたが DICOM の要求を満たしていない点。** */
  warnings?: string[];
  error?: string;
}

/** 本体レポートへ差し込む解析結果。**0.2.2 以降**。 */
/** 計測レポートの保存要求。**0.1.12 以降**。 */
export interface SrRequest {
  /** シリーズ説明（一覧に出る。`[Plugin] ` が前置される）。 */
  seriesDescription?: string;
  /** 文書タイトル（自由文）。 */
  documentTitle?: string;
  /** 観測者名（読影医）。 */
  observerName?: string;
  /** 計測グループ（病変ごと）。 */
  groups: SrMeasurementGroup[];
  /** 所見テキスト（経時判定のまとめ等）。 */
  findings?: { label: string; text: string }[];
}

export interface SrMeasurementGroup {
  /** 病変の追跡 ID（時系列で同じ病変を結ぶ鍵。**必須**）。 */
  trackingId: string;
  /** 追跡 UID。省略時は本体が採番する。 */
  trackingUid?: string;
  /** 所見の説明（"Target lesion" 等）。 */
  findingText?: string;
  /** 計測した画像。省略時は表示中シリーズが使われる（SOP を省略すると画像参照なし）。 */
  seriesInstanceUid?: string;
  sopInstanceUid?: string;
  measurements: {
    /**
     * 計測種別。**0.2.2 以降**で線量系が増えた。未知の種別は本体が拒否する。
     *
     * <p>`unit` を省略すると種別ごとの既定（UCUM）が入る:
     * 長径/短径 `mm` ／ 体積 `mL` ／ 質量 `g` ／ 吸収線量・BED・EQD2 `Gy` ／
     * 時間積分放射能 `Bq.s` ／ 有効半減期 `h`。**換算はされない**（値はそのまま入る）。
     */
    type:
      | "longAxis"
      | "shortAxis"
      | "volume"
      | "mass"
      | "absorbedDose"
      | "timeIntegratedActivity"
      | "effectiveHalfLife"
      | "bed"
      | "eqd2"
      // H66 の定量（fw/ct-quant-design.md §6）。meanValue・stdDev は unit 必須（HU / SUV を取り違えない）。meanValue は負も可
      | "area"
      | "meanValue"
      | "stdDev";
    value: number;
    unit?: string;
  }[];
}

export interface SrResult {
  ok: boolean;
  /** ユーザーが確認ダイアログで拒否した。 */
  cancelled?: boolean;
  seriesInstanceUid?: string;
  sopInstanceUid?: string;
  error?: string;
}

/** プラグイン保存領域の読み出し結果。**0.1.12 以降**。 */
export interface PluginStoreDoc {
  /**
   * **読み出せたか**。`false` は「読めなかった」であって「空」ではない。
   * 混ぜると、到達できないときに「記録が無い」と判断して保存し、**サーバ側の記録を空で上書き**する。
   * `false` のときは保存しないこと。
   */
  available: boolean;
  /** 保存されている JSON。未保存なら null。 */
  json: string | null;
  /** 楽観ロックの版。保存時にそのまま返送する。未保存なら null。 */
  version: number | null;
  /** 最終更新（ISO）。未保存なら null。 */
  updatedAt: string | null;
}

/** プラグイン保存領域への保存結果。**衝突（conflict）を握り潰さないこと**。**0.1.12 以降**。 */
export type PluginStoreSaveResult =
  | { ok: true; version: number }
  | { ok: false; conflict: true; message: string }
  | { ok: false; conflict: false; message: string };

/** MainScreen 系（mainscreen.menu）に渡るコンテキスト。 */
export interface MainScreenPluginHost extends PluginHostBase {
  surface: "mainscreen.menu";
  /** 選択中スタディの UID（未選択なら null）。 */
  selectedStudyUid: string | null;
  /** 専用ウィンドウを開く（H42・**0.3.0 以降**。2D ビューアの `openWindow` と同じ）。 */
  openWindow: (opts?: PluginWindowOptions) => PluginWindowHandle;
  /**
   * このプラグイン専用の保存領域を読む（H42・**0.3.0 以降**。規則は 2D ビューアの `loadStore` と同じ）。
   * メイン画面には表示中の患者が無いので、**`patientKey` は必須**（`db.searchPatients` で得る）。
   */
  loadStore: (patientKey: string) => Promise<PluginStoreDoc>;
  /** 保存領域へ書く（H42）。`version` の規約は 2D ビューアの `saveStore` と同じ。 */
  saveStore: (json: string, opts: { patientKey: string; version?: number | null }) => Promise<PluginStoreSaveResult>;
  /** 保存領域を消す（H42）。 */
  deleteStore: (patientKey: string) => Promise<boolean>;
}

export type PluginHost = Viewer2DPluginHost | MainScreenPluginHost;

/**
 * `ui.js`（ES モジュール）が公開する契約。
 * `export function activate(host) {}` か、default export で `{ activate }`。
 *
 * <p>⚠️ **`ui.js` は単一ファイルとして配信される**（`GET /api/plugins/{id}/ui.js`）。
 * バンドラを通らないので、**bare specifier も相対 import も使えない**
 * （`./core/foo.js` は 404 になる）。ソースを分割するなら、配布前に 1 ファイルへ束ねること。
 */
export interface PluginModule {
  activate(host: PluginHost): void | Promise<void>;
}

/** `host.file.saveJobArtifact()` の指定（H53）。 */
export interface PluginSaveArtifactOptions {
  defaultName: string;
  filters?: { name: string; extensions: string[] }[];
}

/** `host.video.saveDerivedVideo()` の要求（H54）。 */
export interface PluginDerivedVideoRequest {
  /** 動画の MP4 を作ったジョブ（`runBackendJob` の結果の `__artifact.jobId`）。H.264・偶数寸法。 */
  artifactJobId: string;
  /** 元の動画の SOP Instance UID（患者・検査・属性はここから継ぐ）。 */
  sourceSopInstanceUid: string;
  /** 元の動画のどのフレームを採ったか（1 始まり）。 */
  referencedFrames?: number[];
  seriesDescription?: string;
  derivationDescription?: string;
  /** `"db"` は保管庫へ（本体の確認ダイアログ）、`"file"` は .dcm の成果物。 */
  target: "db" | "file";
  /** H55 のバッチの札（`derivedToken`）。範囲内なら確認ダイアログを出さない。 */
  consentToken?: string;
}

/** `host.video.saveDerivedVideo()` の結果（H54）。 */
export interface PluginDerivedVideoResult {
  target: "db" | "file";
  sopInstanceUid: string;
  seriesInstanceUid: string;
  studyInstanceUid: string;
  seriesNumber: number;
  numberOfFrames: number;
  seriesDescription: string;
  artifact: { jobId: string; name: string; size: number } | null;
}

export type PluginDerivedVideoOutcome =
  | { ok: true; result: PluginDerivedVideoResult }
  | { ok: false; cancelled?: boolean; error?: string };

/** `host.file.pickDirectory()` の結果（H56）。 */
export type PickDirectoryResult = { ok: true; path: string; dirToken: string } | { ok: false; canceled?: boolean; error?: string };

/** `host.video.requestBatchConsent()` の要求（H55）。 */
export interface PluginBatchConsentRequest {
  importVideos?: PluginVideoConsentItem[];
  importDicom?: { paths: string[] };
  /**
   * 派生シリーズの保存（H54）。取り込み済みは `sourceSopInstanceUid`、同じ要求で取り込む動画は `sourcePath`
   * （その取り込みが済むと、できた SOP が範囲に入る）。
   */
  derived?: { sourceSopInstanceUid?: string; sourcePath?: string; seriesDescription: string }[];
  modality?: "US";
  frameValues?: { description: string };
}

/** `host.video.requestBatchConsent()` の結果（H55）。 */
export type PluginBatchConsentResult =
  | { ok: true; importToken: string | null; dicomToken: string | null; derivedToken: string | null }
  | { ok: false; cancelled?: boolean; error?: string; issues?: PluginVideoConsentIssue[] };

/** `host.db.importDicomFiles()` の結果（H57）。 */
export type PluginDicomImportOutcome =
  | { ok: true; imported: number; skipped: number; failed: number; errors: string[] }
  | { ok: false; error?: string };

/** `host.compute.status()` の要素（H61）。 */
export interface ComputeEndpointStatus {
  id: string;
  label: string;
  kind: "jupyter" | "colab";
  /** colab のとき: ランタイムを確保しているか・アクセラレータ（例 T4）。jupyter は null。 */
  runtime: { allocated: boolean; accelerator: string | null } | null;
}

/** `host.compute.releaseRuntime()` の結果（H61）。 */
export type ComputeReleaseOutcome = { ok: true; released: boolean } | { ok: false; error: string };

/** `showLabelVolume` に渡すラベルの volume（H65）。 */
export interface LabelVolumeRequest {
  grid: { dims: [number, number, number]; ipp: [number, number, number]; sliceStep: [number, number, number] };
  /** z-major・1 ボクセル 1 値（0 は背景）。 */
  data: Uint8Array | Uint16Array;
  table: Array<{ value: number; label: string; color?: [number, number, number]; description?: string }>;
  /** ROI マネージャに出す Mask の名前（省略時はプラグイン名）。 */
  label?: string;
}

export type LabelVolumeResult = { ok: true; segmentationId: string; segmentCount: number } | { ok: false; error: string };
