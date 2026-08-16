# Chabiko Reference Family — Visual Grammar (Issue #389)

> Direction: **A1 Editorial Calm**。Japanese editorial learning × Taiwan travel warmth を
> consumer app として表現する。三頁（Home / 先生厳選単語 / 台湾旅行）が同一の
> visual language を共有する reference family。
>
> 本文件說明三頁共用的 grammar。**Token 值是探索參考，尚未 freeze。**
> Freeze 前の決定項目は末尾に列挙。

## 三頁

| # | 頁 | ファイル | 役割 |
|---|---|---|---|
| 01 | Home（今日の学習） | `01-home.html` | 毎日開く入り口。続きからが主役。 |
| 02 | 先生厳選単語 Study | `02-teacher-vocab-study.html` | 単語セッション。flashcard が唯一の object card。 |
| 03 | 台湾旅行 Lesson | `03-taiwan-lesson.html` | レッスン読み。Home の featured と対になる。 |

各 HTML は mobile（390px）を基準に設計し、`>=1024px` で desktop representative、
`<=374px` で narrow mobile（320px）調整、`prefers-color-scheme: dark` で dark token
を、同一ファイル内で持つ。

---

## 1. 共用 Typography Grammar

日本語 UI/本文が視覚の基調。中国語は「学ぶ対象」、ピンインは「補助」。

| Role | Font | Mobile 目安 | 320px 縮小 |
|---|---|---|---|
| 日本語 本文 / UI | Hiragino Sans / Noto Sans JP（sans） | 12–14px, lh 1.7–1.8 | 同 |
| 日本語 見出し（editorial） | Hiragino Mincho ProN / Yu Mincho（serif-ja） | ページ題 28–33px / 節題 16–19px | ページ題 28–30px |
| 中国語 学習文 | Songti TC / Songti SC（serif-zh） | コア 46px / 本文 21–22px, lh 1.25–1.4 | コア 40px |
| ピンイン | Hiragino Sans（sans） | 12.5–14px | 同 |
| 小さな補助ラベル | sans | 10–11.5px, tracking 0.12–0.16em | 同 |

**ルール**
- 中国語（繁体/簡体）とピンインには必ず `lang="zh-Hant"` / `zh-Hans"` / `zh-Latn"`。
- ページ題は「一瞬の hero」にしない（#389: 26–30px 前後）。Home の `今日の学習` のみ 33px の例外。
- 長い日本語・中国語は自然に折返す（`overflow-wrap` を許す）。320px ではコア文を 40px に縮め、不自然な単語折返しを避ける。

## 2. 共用 Spacing Grammar

**8px family を基準**。mobile の左右 padding は **28px**（320–374px では **20px**）。

| Token | 値 | 用途 |
|---|---|---|
| `--sp-1/2/3/4` | 4/8/12/16px | 行内・要素間 |
| `--sp-5/6/7` | 20/24/28px | 要素間・カード内 |
| `--sp-8/10/12` | 32/40/48px | section 間・大見出し回り |

- Section 間は一律 **40px** 前後。
- 余白は「グループ化」の道具。重要度によらず一律 padding をしない。

## 3. 共用 Surface / Hairline Grammar

**カードに頼らない。** whitespace・typography・hairline で hierarchy を作る。

| Surface | 用途 |
|---|---|
| `--paper`（warm off-white） | ページ基底 |
| `--paper-deep` | ソフトな block 背景（can-do、flashcard 下地） |
| `--hairline`（1px） | 行の区切り（track rows、chunk rows、example rows） |
| `--hairline-strong` | より強い区切り（track-nav、input border） |
| 白 surface + 罫線 | **本当に object なものだけ**（flashcard のみ） |

- 罫線は「下線のみ」を基本にする。
- section 見出し直下の強い罫線（`--ink` 1px）は Home の typographic index のみ。

## 4. 共用 Color Grammar

neutral-dominant。jade / coral は控えめに。

### Light（reference）

| Role | 値 | 役割 |
|---|---|---|
| `--paper` | `#FAF8F4` | ページ |
| `--paper-deep` | `#F4F0E9` | ソフト surface |
| `--ink` | `#272522` | 本文・見出し |
| `--ink-secondary` | `#5E5A53` | 説明・補助 |
| `--ink-muted` | `#736C66` | ピンイン・メタ |
| `--hairline` | `#E6E1D8` | 罫線 |
| `--jade` / `--jade-ink` | `#536B62` / `#3E554D` | **brand・学習状態** |
| `--coral` / `--coral-deep` | `#E87961` / `#B84C38` | **強調・編集アクセント** |
| `--jade-soft` / `--coral-soft` | `#E7ECE8` / `#F6E6E1` | ごく薄い支持背景 |

### Dark（reference · 同一 hierarchy）

同じ構造・同じ token 名を使い、値だけ切替える。UI を再発明しない。

| Role | 値 | 備考 |
|---|---|---|
| `--paper` | `#1E1C19` | 深い暖炭 |
| `--paper-deep` | `#2A2723` | soft block（やや明るく） |
| `--ink` | `#EFE9E0` | 暖白 |
| `--ink-secondary` | `#C6BFB4` | |
| `--ink-muted` | `#A29A8E` | ピンイン・メタ（AA 維持） |
| `--hairline` | `#3A352D` | |
| `--hairline-strong` | `#4C463D` | |
| `--jade` | `#7FA093` | brand |
| `--jade-ink` | `#A5C0B5` | 文字色として使うので明るく |
| `--coral` | `#F09380` | |
| `--coral-deep` | `#EB8D74` | 文字色として使うので明るく |
| `--jade-soft` / `--coral-soft` | `#27302B` / `#352621` | 深 soft |

**役割の分担**（light/dark 共通）
- **jade = 学びの状態 / ブランド**。アクティブ、完了、できること。
- **coral = 編集のアクセント / いまここ**。続き、コア表現、番号。
- 一ページで primary なアクセントは **jade か coral のどちらかが主**。Home / Lesson は coral 主、Study は jade 主。

**注意**：dark 下で solid ボタン（`--jade-ink` 背景 + 白文字）を作るときは、`--jade-ink` が
明るくなるため白文字の対比が落ちる。solid 背景には `--jade`（dark 版 `#7FA093`）を使い
`--ink`（暗色）文字にするなど、freeze 時に検証する。

## 5. 共用 Radius Grammar（未 freeze）

| Token | 値 | 使う場所 |
|---|---|---|
| `--radius-chip` | 6px | 小さい chip |
| `--radius-control` | 8px | ボタン / input |
| `--radius-content` | 10px | ソフト block（can-do、travel-task、小図） |
| `--radius-card` | 12px | 本当の object card（flashcard） |
| `--radius-hero` | 16px | 例外的 hero |
| `50%` | 円 | brand mark、ドット |

## 6. 共用 Imagery Grammar

- **先生厳選単語**：実イラスト（teacher-core-v1 の webp）は**答えの supporting material**。
  中文学習文（52px）より下に小さく配置（mobile 幅 180px / desktop 220px）。hero にしない。
- **台湾旅行**：イラスト大物 hero はしない。warmth は `--coral-soft` の小さな block で表現。
- **Home**：イラストなし。typography + hairline で十分。

## 7. 共用ページ骨格（三頁共通）

1. **Header**（軽量ブランド行）: coral の円マーク「C」+ Chabiko（serif）+ チャビコ + 漢字表記 / テーマ。
2. **Breadcrumb**（demoted）: 11px muted、box なし、`›` で区切る。
3. **Track-local nav**: 下罫線 + アクティブ 2px jade。
4. **Section**（typographic）: serif-ja の節題 + 罫線 or 余白。

## 8. 三頁それぞれの grammar

### Home — 今日の学習
- `続きから` featured = **coral 2px 頂線** + serif-zh 46px のコア文。
- `学んでいるコース` = typographic index（`01/02/03` を coral-deep 番号で章立て風）。
- `これまでの学習` = hairline rows + jade の ✓。

### 先生厳選単語 Study
- **jade が主役**。アクティブ nav・状態ラベルが jade。
- flashcard は唯一の object card。**revealed state** の並び（production contract 準拠）：
  1. `答えを表示済み` ラベル（jade-ink）
  2. 簡体中文 **52px**（主。画像より上）
  3. 答え：ピンイン → 日本語 → 繁体（hairline 区切り）
  4. イラスト（supporting。中文より下、小さい）
  5. self-rating（また / むずかしい / できた）
- **答えを見る前**は簡体中文のみ・画像なし（contract annotation で明示）。

### 台湾旅行 Lesson
- **Home と対になる**。`今日のコア表現` は Home の featured と同じ coral 頂線文法。
- `できるようになること` = paper-deep soft block（jade 見出し）。
- チャンク / 音 / 例文 = hairline rows。
- `旅先でやってみよう` = coral-soft block。

## 9. Dark mode（reference）

- `@media (prefers-color-scheme: dark)` で token のみ切替える。構造・hierarchy は同一。
- header / breadcrumb / track-nav / section の並びは light と完全に同じ。
- dark の studio backdrop は `#14120F`、desktop では `--paper`（`#1E1C19`）。
- dark でも jade/coral の役割分担は維持（jade = 状態、coral = 編集アクセント）。

## 10. 320px（narrow mobile）検証結果

- 三頁とも `scrollWidth == clientWidth == 320`（水平 overflow なし）を Playwright で確認。
- 対応：`.app` を `<=374px` で `width: 100%`、padding 28 → 20px、コア文 46 → 40px、
  ページ題 33/30 → 28–30px、flashcard 図を 150px 幅に縮小。
- 中文の不自然な単語折返しは、コア文の縮小で回避（「這個多少錢？」5 字は 320px で 1 行に収まる）。

## 11. Artwork-style finding（要決定）

現行の 先生厳選単語 illustration（`teacher-core-v1` の webp、500×500）は
教材イラストパック（`0420 名詞x50`）由来で、以下の特徴を持つ：

- 背景が黒（解析サンプルで ~50% のピクセルが `#000000`）
- 平塗り・輪郭線のある教材カートゥーン風（低〜中彩度、茶系 / 青灰系の色）

これは A1 Editorial Calm の「warm-paper editorial」言語と**同源ではない**。
revealed state では supporting（小さく・中文より下）に置いて衝突を緩和したが、
これは配置の対処であって、スタイル自体の解決ではない。

**Freeze 前の選択肢**：
1. 現行イラストをこのまま採用し、「教材感のある図解」として supporting に固定する
2. 編集言語に合わせた新規イラスト（細線・紙色背景・淡彩）へ差し替える
3. 当面 illustration なしで文字中心にし、図は後から入れる

参考 prototype は**追加の card/chrome で隠さない**（この finding を明示する）。

---

## 12. Freeze 前に決定すべき項目

### 色 / dark
- [ ] dark の最終値を確定（現 reference は探索値）
- [ ] dark 下の solid ボタン（`--jade` 背景 + `--ink` 文字）の対比を確定
- [ ] `--paper-deep` の dark 値（`#2A2723`）が soft block として十分区別できるか

### タイポグラフィ
- [ ] 中国語コア文 46px（320px では 40px）を確定
- [ ] serif-ja のウェイト（700 一本 vs 600/700 併用）
- [ ] ピンインの muted 度（`#736C66` / dark `#A29A8E` の AA 最小サイズ）
- [ ] システムフォント依存（Hiragino が無い環境の fallback）

### レイアウト / 間隔
- [ ] desktop 最大幅（Home 880 / Study 720 / Lesson 760px）
- [ ] section 間 40px の token 化
- [ ] 320px の padding 20px / コア文 40px の最終確認

### 部品 / 状態
- [ ] flashcard の revealed 遷移（答えを見るタップ → 答え + 画像）の実際のアニメーション/表示契機
- [ ] rating 三択の文言（また / むずかしい / できた）
- [ ] 中国語簡体（Study）と繁体（Lesson）で serif-zh の fallback 差
- [ ] 空状態・完了状態（未開始 HSK、レッスン完了）の reference

### イメージ
- [ ] **Artwork finding の選択肢を決定**（11 節）
- [ ] 台湾旅行のイラスト/編集素材を使うべき場所（現在は未使用）
