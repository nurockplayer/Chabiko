# Japanese Learner Personas and Jobs-to-Be-Done

**Status:** Chabiko v1 產品假設與優先順序（尚未經使用者訪談驗證）  
**Last updated:** 2026-07-13  
**Scope:** GitHub Issue #13

## 決策摘要

Chabiko v1 以「準備赴台旅行的日語母語初學者」為 primary persona。Secondary personas 是「因台灣文化而想學日常實用中文的初學者」與「需要日文優先補強的學校、大學或 HSK 初學者」。這個排序採納 Issue #13 的初始假設，但理由是它最符合既有產品方向、目前的台灣旅遊 lesson vertical slice，以及已規劃的 Travel Quest，不是因為訪談或市場規模已證實它勝出。

- **Primary:** P1 赴台旅行準備者。
- **Secondary:** P2 台灣文化與日常實用中文初學者、P3 學校／大學／HSK 補強者。
- **v1 不主動最佳化:** P4 接客／工作情境、P5 中長期留學／居住準備、P6 中文媒體／粉絲文化理解。

這些 persona 是用來控制 v1 取捨的行為與情境假設，不是人口統計分眾。現階段不指定年齡、職業比例或市場大小。

## 證據、既有決策與假設邊界

### 已知依據

1. Repo source of truth 已將 Japanese-first、台灣旅行 readiness、短而實用的 lesson loop、繁簡雙語顯示與 scenario-based practice 設為產品方向；目前可執行的 `lesson-001` 也是夜市點餐情境。這些是**已採用的產品決策**，不是外部使用者研究結果。
2. 台灣交通部觀光署 2025 年 12 月統計中，按居住地計算的日本旅客為 173,702 人，占當月來台旅客 18.35%。這能支持「日本赴台旅遊是具體且持續存在的使用情境」，但不能證明旅客有中文學習需求、偏好的學習方式，或願意使用 Chabiko。[來源](https://admin.taiwan.net.tw/english/info/News?a=1329&id=35220)
3. 一項 2024 年研究比較 9 名日本人中國語學習者與 9 名母語者的聲調產出，發現部分聲調的調域有顯著差異。樣本很小，因此只用來支持「聲調值得明確教學與練習」，不能推論所有日本學習者的共同錯誤或某一種練習必然有效。[來源](https://www.jstage.jst.go.jp/article/asjsc/4/3/4_SC-2024-26/_article/-char/ja)
4. 一項針對初級日本人中文學習者的研究顯示，既有漢字知識可協助漢字詞義處理，但漢字、拼音與中文讀音之間的轉換仍有速度與正確度取捨。這支持 Chabiko 把漢字當 bridge、同時要求拼音與發音提醒；它不支持把相似字形、詞義或音讀直接視為等同。[來源](https://www.jstage.jst.go.jp/article/psysoc/67/1/67_2023-A254/_article/-char/en)

### 尚待驗證的產品假設

- Persona 的動機、情境、痛點、session 長度與 retention hook 均是設計假設，不是訪談發現。
- 「有旅行日期會提高回訪」、「Daily Taiwan Chinese 能留住文化型初學者」與「scenario readiness 比 streak 更有動機」都仍待產品訊號或後續研究驗證。
- 學校與大學課程使用的字體、教材與教學順序可能不同；P3 的簡體優先只適用於 HSK 或採簡體教材的路徑，不宣稱代表所有日本學校。
- 外部證據只支持部分跨 persona 的學習設計，不證明下面六個 persona 的規模或排序。排序是 v1 策略選擇。

## V1 優先順序

排序依四項產品判準：與 Taiwan-travel differentiator 的適配度、能否重用既有／已規劃 surface、v1 scope 是否可控、是否有明確的回訪理由。這不是市場研究排名。

| Rank | Persona | V1 role | 排序理由 |
|---|---|---|---|
| **1** | P1 赴台旅行準備者 | **Primary** | 與 core value、現有夜市 lesson、六個 phrasebook 情境及 Travel Quest 直接一致；情境邊界清楚。 |
| **2** | P2 台灣文化與日常實用中文初學者 | **Secondary** | 可重用台灣旅遊內容，Daily Taiwan Chinese 與 Culture Bite 可形成不靠旅行日期的回訪入口。 |
| **3** | P3 學校／大學／HSK 補強者 | **Secondary** | 可重用日文解說、漢字 bridge、發音與基礎 practice；繁簡路徑支援其教材差異，但不需在 v1 建完整考試課程。 |
| **4** | P4 接客／工作情境學習者 | Later | 部分接客任務可重用，但產業、客群地區與正式程度差異會快速擴大內容範圍。 |
| **5** | P5 中長期留學／居住準備者 | Later | 需要醫療、租屋、行政、學術與長篇聽讀等深度，超出旅行型 v1。 |
| **6** | P6 中文媒體／粉絲文化理解者 | Later | 需要大量詞彙、快速聽力、俚語與作品脈絡，與 v1 的短情境任務重疊較少。 |

## Personas 與 JTBD

每個「可能 session 長度」都是用來協助內容切片的設計目標，並非觀察所得。

### P1 赴台旅行準備者 — 台湾旅行準備者

| Field | Hypothesis |
|---|---|
| **JTBD** | 當我準備去台灣旅行時，我想在真實旅遊情境中快速學會可說、可辨識的中文，使我能完成點餐、交通、住宿、購物與求助等任務，不必完全依賴英文、翻譯工具或手勢。 |
| **Motivation** | 降低旅途中的不確定感，並能在台灣主動完成幾個重要互動。 |
| **Learning context** | 零基礎或初學；旅行前用手機自學，偏好能立刻連到行程的內容。 |
| **Desired outcome** | 看懂常見正體中文線索，能使用少量高頻 chunk，並在六個 v1 travel scenarios 中完成基本 can-do task 與誤解修復。 |
| **Pain points** | `tone`、`pinyin-pronunciation`、`traditional-simplified`、`taiwan-mainland-usage`；漢字看似熟悉卻不會讀，或誤把日文意義套入中文。標籤只在內容確實教到該難點時使用。 |
| **Likely session length** | **假設：3–8 分鐘。** 一次完成一個 phrase、sound focus、mini practice 或 travel task。 |
| **Strongest retention hook** | 下一個旅行情境的 readiness，以及「這句在旅途中會用到」的時間迫近感。 |
| **Script / region default** | 正體中文、台灣用語優先；有已審核形式時可切換簡體。 |

### P2 台灣文化與日常實用中文初學者 — 台湾文化・日常中国語ビギナー

| Field | Hypothesis |
|---|---|
| **JTBD** | 當我因台灣飲食、城市生活與文化產生興趣時，我想用很短的日文解說持續學一點實用中文，使我能理解日常詞句、感覺自己更接近台灣，並逐步具備未來旅行時可用的能力。 |
| **Motivation** | 對台灣文化的好奇與想理解「這個詞在台灣怎麼用」，未必已有旅行日期。 |
| **Learning context** | 零碎、自主、手機優先；由一則食物、交通、便利商店或生活文化內容進入學習。 |
| **Desired outcome** | 穩定累積常見台灣詞彙與短句，能辨識一些正體字，並把文化興趣轉成可回想的日常表達。 |
| **Pain points** | 長課程容易失去動機；不知道文化內容如何轉成可用語言；漢字帶來早期熟悉感，也可能遮蔽中文讀音、聲調與實際用法。 |
| **Likely session length** | **假設：1–5 分鐘。** 一則 Daily Taiwan Chinese，必要時接一題 practice。 |
| **Strongest retention hook** | 每日一個有趣而可用的台灣發現，以及同一內容日後在 Travel Quest 再出現。 |
| **Script / region default** | 正體中文、台灣用語優先；避免為了展示差異而在每則內容塞滿變體。 |

### P3 學校／大學／HSK 補強者 — 授業・HSKサポート学習者

| Field | Hypothesis |
|---|---|
| **JTBD** | 當我在學校、大學或 HSK 自學中遇到難懂或記不住的基礎中文時，我想用日文與日本語母語者熟悉的對照方式做短練習，使我能理解課內概念、記住詞句，並更有把握完成下一次課堂或複習。 |
| **Motivation** | 跟上課程、完成複習或取得可見的基礎進步；考試可能是目標之一，但不是唯一目標。 |
| **Learning context** | 搭配既有教材或課程，不取代老師與課本；常在上課前後或考前使用。 |
| **Desired outcome** | 用日文釐清初級語序、量詞、體貌、補語、拼音與聲調，並能回想教材中的核心詞句。 |
| **Pain points** | `word-order`、`measure-word`、`aspect-particle`、`complement`、`tone`、`pinyin-pronunciation` 與 kanji false friends；不同教材的字體與範圍不一致。 |
| **Likely session length** | **假設：5–15 分鐘。** 以一個概念或一組錯題為單位。 |
| **Strongest retention hook** | 近期課堂／測驗可用的補強，以及 shaky item 的短期重現。 |
| **Script / region default** | 由 path 或教材決定；HSK／簡體教材可簡體優先，仍保留已審核正體形式。 |

### P4 接客／工作情境學習者 — 接客・業務場面学習者

| Field | Hypothesis |
|---|---|
| **JTBD** | 當我需要接待或與中文使用者完成例行工作互動時，我想練習少量、情境明確的用語，使我能確認需求、說明下一步並在沒聽懂時禮貌修復溝通。 |
| **Motivation** | 近期可用的工作表現與服務信心。 |
| **Learning context** | 工作空檔或通勤；需要與職務直接相關的情境。 |
| **Desired outcome** | 完成數個高頻接客任務，不以廣泛商務流利為目標。 |
| **Pain points** | 時間少；產業術語與禮貌層次不同；客群來自台灣或中國大陸時，用字與字體需求不同。 |
| **Likely session length** | **假設：3–10 分鐘。** |
| **Strongest retention hook** | 下一個班次或客戶互動能直接使用。 |
| **V1 implication** | 只重用與旅遊接待重疊的內容；不建立產業別 business Chinese path。 |

### P5 中長期留學／居住準備者 — 留学・長期滞在準備者

| Field | Hypothesis |
|---|---|
| **JTBD** | 當我準備在中文環境中長期學習或生活時，我想建立比旅遊更完整的語言能力，使我能處理日常行政、醫療、居住與學習任務。 |
| **Motivation** | 出發日期、入學或檢定門檻，以及長期生活自立。 |
| **Learning context** | 較密集、通常搭配正式課程、家教或教材。 |
| **Desired outcome** | 整合聽、說、讀、寫與較長對話，不只記住 survival phrases。 |
| **Pain points** | 範圍大、風險高、需要個別回饋；台灣與中國大陸目的地也會改變字體、檢定與用語需求。 |
| **Likely session length** | **假設：20–45 分鐘以上。** |
| **Strongest retention hook** | 出發與入學時程、生活任務 readiness。 |
| **V1 implication** | Chabiko v1 只能提供旅行／日常基礎，不宣稱足以完成留學或檢定準備。 |

### P6 中文媒體／粉絲文化理解者 — 中国語コンテンツ理解学習者

| Field | Hypothesis |
|---|---|
| **JTBD** | 當我接觸中文戲劇、音樂、社群或作品時，我想理解原文中的常見表達與文化脈絡，使我能降低對日文翻譯的依賴並更深入享受內容。 |
| **Motivation** | 對作品、人物或社群的情感連結。 |
| **Learning context** | 一邊觀看／閱讀一邊查詞，或從特定片段延伸學習。 |
| **Desired outcome** | 理解高頻口語、字幕與文化語境。 |
| **Pain points** | 語速、俚語、作品脈絡與詞彙量遠高於 v1 travel scope；來源授權也是額外限制。 |
| **Likely session length** | **假設：5–20 分鐘，或隨內容即時查詢。** |
| **Strongest retention hook** | 能理解下一段原文內容。 |
| **V1 implication** | Culture Bite 可以帶來少量重疊，但不匯入或重製第三方作品內容，也不做媒體理解 curriculum。 |

## Top personas 對 v1 surfaces 的映射

下表只承諾共享內容與 path-aware 呈現；不為每個 persona 複製一套 curriculum。

| Surface | P1 赴台旅行準備者 | P2 台灣文化／日常初學者 | P3 學校／大學／HSK 補強者 |
|---|---|---|---|
| **Lessons** | 台灣六大旅遊情境作為 hook 與 travel task；目前夜市點餐 `lesson-001` 是第一個 vertical slice。 | 從食物、城市與生活文化 hook 進入同一 lesson loop；保留 can-do 與 sound focus，不變成純文化文章。 | 重用 chunk、kanji bridge 與日文文法對照；可由簡體優先 path 呈現，但不按特定課本複製章次。 |
| **Vocabulary** | 優先旅行高頻詞、正體辨識、台灣用語與有實際風險的 false friend。 | Daily Taiwan Chinese／Culture Bite 串回 3–5 個可複習詞；文化趣味必須連到用法。 | 以 pain-point metadata 找出聲調、語序、量詞、體貌與補語等補強項目；不宣稱完整覆蓋 HSK 詞表。 |
| **Phrasebook** | 核心 surface：airport、transport、food、shopping、hotel、emergency；包含 fallback phrase 與 roleplay 連結。 | 每日內容可從 phrasebook 選一個文化／日常相關 phrase，再導向完整情境。 | 當作實用輸出補充，不把 phrasebook 包裝成考試題庫或課堂對齊。 |
| **Practice** | 認讀、聲調／拼音辨識、日文提示 recall、3–5 回合 scenario roleplay 與 retry。 | 一題即可完成的認讀／recall，之後把 shaky item 放回相關日常情境。 | 針對近期概念做辨識、排序與 recall；使用同一套 `painPointTags`，不另建考試專用 scoring。 |
| **Travel Quest** | 主要 motivation layer；以「能否點餐、搭車、入住、求助、修復誤解」顯示 scenario readiness。 | 將文化興趣逐步導向可做的日常任務；可選擇加入 quest，但不強迫先有旅行日期。 | 只在 learner 選擇旅行目標時使用；不把 HSK 等級或學分進度錯算成 Taiwan readiness。 |
| **Daily Taiwan Chinese** | 在旅行前重現下一個情境的一句 phrase、一個 sound point 與一題練習。 | **主要 retention hook**：1–3 分鐘的 phrase、日文解說、台灣文化 note 與 instant practice。 | 作為低壓補充與複習入口；若內容不符合其教材範圍，不宣稱可取代課內複習。 |

### 對既有與已規劃內容的直接影響

- #4 beginner lesson sequence 應以 P1 決定第一批 lesson 排序，P2 與 P3 透過共享內容、日文解說與 script default 受益。
- #6 phrasebook 與 #19 roleplay 先服務 P1；P2 可從 Daily Taiwan Chinese 進入，P3 只作補充。
- #12／#20 Travel Quest readiness 只把實際 can-do 與情境練習算入 Taiwan readiness；它不是泛用 streak 或 HSK 分數。
- `docs/content/japanese-native-pain-point-taxonomy.md` 的 tag 是跨 persona 的內容 metadata，不是「每位日本學習者都有此問題」的證明，也不得過度標註。
- P1 與 P2 正體／台灣用語優先；P3 由 path 決定 script default。所有 learner-facing 形式仍須 authored 或 verified。

## V1 deliberate non-optimization

Chabiko v1 刻意不為下列目標最佳化，即使部分 persona 可能受益：

- **不做完整 HSK、TOCFL、校內考試或指定教材對齊。** 不提供全級詞表、模擬考、分數預測或逐章同步。
- **不做完整留學／長期生活課程。** 租屋、醫療、行政、學術聽讀與長篇寫作不納入旅行型 v1 的完成定義。
- **不做產業別 business Chinese。** 不為零售、飯店、製造或辦公室各自建立內容樹；只保留與 travel/service 重疊的任務。
- **不做中文媒體理解產品。** 不追求俚語庫、字幕學習、作品匯入或受版權保護內容的重製。
- **不以長時間、全面流利為 session model。** v1 優先 1–15 分鐘內可完成的單一 lesson／practice／quest step。
- **不把漢字熟悉感當成中文能力。** 每個 bridge 仍需搭配拼音、聲調、語義／用法 caution 與 review metadata。
- **不以 AI tutor、speech recognition、帳號或 cloud sync 解決 persona 需求。** 這些仍在 v1 scope 之外。
- **不以 generic streak 取代實際 readiness。** 回訪機制必須連回可使用的 phrase、practice 或 scenario outcome。

## 待驗證清單

後續訪談、可用性測試或產品訊號應優先檢查以下假設；本 issue 不假裝已完成這些研究。

| Assumption | 可觀察訊號 | 若不成立的調整 |
|---|---|---|
| P1 的旅行情境與日期能帶來最強的開始／回訪動機 | 首次 lesson 啟動、Travel Quest 選擇、情境完成與回訪 | 降低旅行日期依賴，重新比較 P2 的文化型入口。 |
| P2 願意從文化興趣進入短 practice | Daily Taiwan Chinese 完成後進入 practice／lesson 的比例 | 讓 Daily 格式更獨立，或降低其 v1 優先度。 |
| P3 覺得日文對照與 pain-point practice 能補強既有教材 | 補強題 retry、回訪與質性回饋 | 收窄支援範圍，不建立未被使用的 school／HSK path。 |
| 1–15 分鐘的設計切片符合前三 persona | 開始到完成時間、半途離開位置、同 session 的下一步選擇 | 調整內容粒度；不把預估 session 長度當硬性人格特徵。 |
| Scenario readiness 比單純完成數更能傳達進步 | readiness 檢視、quest completion、返回相關 practice | 簡化 readiness 呈現，但仍保留 can-do outcome。 |
| Path-based script default 足以處理 P3 的教材差異 | 手動切換頻率與 fallback 發生率 | 在 #17／#22 調整 path 與 toggle 行為，不改變 Japanese-first UI。 |

## Source of truth 與參考

### Repository

- [`.planning/PROJECT.md`](../../.planning/PROJECT.md)
- [`.planning/REQUIREMENTS.md`](../../.planning/REQUIREMENTS.md) — POS-01、PATH-01、MOTIV-01～03
- [`.planning/ROADMAP.md`](../../.planning/ROADMAP.md) — Phase 1 plan 01-02
- [`docs/strategy/learning-and-motivation-strategy.md`](../strategy/learning-and-motivation-strategy.md)
- [`docs/content/japanese-native-pain-point-taxonomy.md`](../content/japanese-native-pain-point-taxonomy.md)
- [`docs/content/dual-script-and-regional-variant-strategy.md`](../content/dual-script-and-regional-variant-strategy.md)
- [`data/examples/valid/lessons.json`](../../data/examples/valid/lessons.json)
- GitHub issues #4、#6、#12、#14、#17、#19、#20、#42

### External evidence

- Taiwan Tourism Administration, [Visitor Statistical Analysis for December 2025](https://admin.taiwan.net.tw/english/info/News?a=1329&id=35220).
- 伍晟（2024）, [日本語を母語とする中国語学習者による声調の産出に関する研究](https://www.jstage.jst.go.jp/article/asjsc/4/3/4_SC-2024-26/_article/-char/ja).
- Zhang & Tamaoka（2025）, [Harmonizing Sounds: The Navigation of Phonological Processing in Pinyin and Hanzi by Early Japanese CFL Learners](https://www.jstage.jst.go.jp/article/psysoc/67/1/67_2023-A254/_article/-char/en).

---

這份文件是產品規劃假設，不是 persona 訪談報告。當實際研究或產品訊號反駁某項假設時，應更新 persona、排序與相應 source of truth，而不是把原假設重新包裝成證據。
