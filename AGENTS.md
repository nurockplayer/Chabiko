# Chabiko — Agent Guidelines

## 語言設定

永遠使用台灣正體中文回覆。日文內容只用於學習材料、例句、UI 標籤、語法說明或面向日本學習者的文案。

## 專案定位

Chabiko | チャビコ 是給日本人學中文的網站。目標是讓零基礎或初學者從「看得懂一些漢字」進到「可以用簡單中文在台灣旅行」。

產品核心：

- Chinese content dual-script：台灣旅遊路徑以繁體為主；HSK／學校課業／一般中文路徑可預設簡體。產品 UI 與解說始終以日文為主。
- 日文解釋優先，服務日本語使用者。
- 內容要有趣、短、讓人想繼續看。
- 使用中日漢字與音讀相近性降低入門門檻，但必須明確標示 false friends、聲調差異、台灣用法。
- 學習成果以 Travel Quest / 情境準備度呈現，不只是課程完成數。

## Source Of Truth

開始實作前，先讀取當前 GitHub issue body，再只讀取與本次 scope 直接相關的 source of truth。

衝突時優先順序：

1. 使用者本次明確指示
2. 當前 GitHub issue body
3. 已合併且仍有效的 phase context
4. `.planning/REQUIREMENTS.md` — v1 可驗收需求。
5. `.planning/ROADMAP.md` — phase 邊界與 issue 對應。
6. `.planning/PROJECT.md` — 專案定位、核心價值、限制、決策。
7. strategy、draft 或研究文件

不得為了確認簡單任務而全面讀取所有規劃文件。

若文件互相衝突且會影響 correctness，停止擴大實作，回報衝突；除非使用者明確要求，不得自行更新 source of truth 或建立 issue。

## Shell 指令

- `git` / `gh` 相關 shell 指令必須用 `rtk` 降低輸出 token。
- 非 git 指令不要加 `rtk`，例如 `sed`、`grep`、`find`、`pnpm`、`node`、`pytest`、`make`。

例：

```bash
rtk git --no-optional-locks status
rtk git diff --stat
rtk gh issue view 12
pnpm test
sed -n '1,120p' AGENTS.md
```


## 技術基線

目前專案已採用：

- Astro
- TypeScript
- pnpm
- Vitest
- Structured content files
- uv + Python 3.14+ validation tooling
- LocalStorage-based v1 progress

現有架構、schema 與測試是 implementation baseline。除非 issue 明確要求，不得重新選型、替換框架或重建 scaffold。


## Scope 邊界

- PR 只做 GitHub issue 明確列出的任務。
- 不要把未要求的功能、重構或 future work 混進同一個變更。
- 發現 scope 外需求或技術債時，不得直接塞進當前 PR。只在回報中簡短列為 deferred finding。
- 若需要新增依賴、調整架構或擴大功能範圍，先說明理由、替代方案與風險。
- 高衝擊自動化，例如 auto-close PR、dependency auto-merge，預設禁止，除非使用者明確確認。

## 實作前檢查

這些規則來自 Issue #193 反覆 review 循環的教訓，實作前必須確認，避免同類缺陷重演：

- 移除或收窄任何安全機制（build guard、`.gitignore` 規則、驗證 gate）前，先找出所有**寫入該路徑**的來源與**依賴該機制**的 consumer，確認沒有其他 writer 後才能動手。
- 變更跨檔契約（rights、state、schema、資料結構）時，列出完整 consumer 清單（資料檔、loader、validator、UI、測試），在同一個變更內全部同步，不得「加檔後續補」。
- 文件化的 workflow 命令必須由 self-test 斷言其行為本身，不能只測被呼叫的函式。
- Regression 測試的 cleanup 只刪除自己建立的檔案與目錄，預設工作區含有其他開發者的檔案；不得假設環境是乾淨的。

## Cross-cutting 變更 Gate

影響下列至少兩類領域的 issue 屬於 cross-cutting 變更，實作前必須產出精簡 Impact Map：

- asset 路徑、generated 檔案或 migration；
- schema、state 或 metadata contract；
- generator、importer、rebuild script 或 legacy 相容路徑；
- build、deployment、pruning、`.gitignore` 或 cleanup 行為；
- rights、license、attribution 或 provenance；
- 多個 runtime consumer（loader、UI、API、validator、測試）；
- 大型 committed generated 輸出。

Impact Map 必須凍結下列 surface；任一 surface 未知或仍需產品決策時，停止實作並回報，不得自行猜測：

- 所有寫入受影響路徑／資料／state 的 writer；
- 所有 consumer 與 validator；
- legacy writer 與相容路徑；
- canonical rebuild 或 migration 命令；
- Git、build、deployment 與 cleanup 邊界；
- rights／license／provenance 要求；
- clean 與 dirty 環境的失敗案例。

模板、Requirement → Diff → Test Evidence 矩陣與完整工作流程見 `docs/engineering/cross-cutting-change-playbook.md`。非 cross-cutting 的普通單檔或本地變更不需 Impact Map。

## Cross-cutting 完成回報與最終 Review

Cross-cutting 變更的完成回報必須把每個 frozen requirement 對應到：

- 變更的檔案或產生的 artifact；
- 對應的 focused test 或 validation；
- 觀察到的結果。

沒有對應 diff 或證據的 requirement 不得宣稱完成。

最終唯讀 reviewer 必須檢查完整 contract surface，不能只看最後一次 follow-up diff。至少驗證：所有已知 writer 與 consumer、stale path／state／metadata／documentation、canonical rebuild／migration workflow、destructive cleanup 與 dirty 環境行為、rights／license／provenance 一致性、generated 輸出與 committed metadata 的一致性、negative drift test 與 fail-closed 行為。

Reviewer 除立即的 P0／P1 安全或資料遺失中斷外，應完成完整 contract-surface 掃描，並把全部 findings 聚合到一份 review 結果或 follow-up plan。隨後由 coordinator 依 root cause、implementation mechanism、主要修改檔案與 validation boundary 分組：

- 只有符合「Flash 任務大小 Gate」merge criteria（root cause、主要修改檔案、implementation mechanism 與 validation boundary 都相同）的 findings，才可以共享一個 bounded implementation cycle。
- 無關的 findings 必須在同一 branch／PR 上拆成 separate bounded cycles 依序實作。

## Flash 任務大小 Gate

本節適用於 DeepSeek v4 Flash 或其他低成本 implementation model，也約束產生實作或 review-fix prompt 的 coordinator。

- Review findings 不是一個可直接整包委派的 executable task。委派前必須依 root cause 與 implementation mechanism 分組。
- 每個 implementation cycle 只能有一個 primary mechanism，以及與該機制直接耦合的 targeted tests。
- 同一 cycle 不得同時包含 production logic／architecture 修改、test harness／mocking／fixture 重設計，以及 GitHub／CI／review thread／PR cleanup。
- 多個 findings 只有在 root cause、主要修改檔案、implementation mechanism 與 validation boundary 都相同時才可合併。
- 其餘 findings 必須在同一 branch／PR 上依序拆成 bounded cycles：production correctness、failure-path tests／test harness、final integration／delivery cleanup。
- 非 final cycle 到 targeted validation 與精簡回報即停止。完整 validation、reviewer rerun、thread resolution、PR body 更新與 CI 確認只放在 final integration cycle。
- 若 prompt 含有超過一個獨立 primary mechanism，coordinator 必須在委派前拆分；implementer 若收到違反本 Gate 的任務，必須在修改前停止並回報建議拆法。
- Prompt 長度必須依任務規模裁剪，不得重複 Issue、`AGENTS.md` 或 `CLAUDE.md` 已明定的要求。
- 單一 cycle 完成不得被表述為整個 PR 已 merge-ready，除非 final integration、完整驗證與 reviewer gate 均已完成。

## Model Routing / Sol Budget Gate

本節定義 repo 的 canonical model routing。`CLAUDE.md` 與 GitHub issue 引用本節，不得另立分歧規則。本節只定義 role 分工與 Sol escalation 條件；Flash 的 task-size 分組、bounded cycle 與 merge criteria 由前述「Flash 任務大小 Gate」定義，兩者合併解讀。

### Roles

- **Flash（DeepSeek V4 Flash）** — 預設 bounded implementation model。直接依既有 contract、驗證與 issue scope 實作並執行 targeted validation。不需先詢問 Sol。
- **Pro（DeepSeek V4 Pro）** — diagnosis、reviewer 與 arbiter model。負責既有 reviewer policy 定義的 review、diagnosis 與需要判斷的單點決策。
- **Sol** — 稀缺的 architecture／concurrency／security／correctness reasoning resource。只用於對**明確 decision question** 的收斂判斷，不做整張 ticket 的全程實作。

### Sol 使用原則

- Sol invocation 必須針對明確 decision question，包含已收集的 evidence 與收斂後的可行選項。
- 禁止用 Sol 做：broad repo exploration、找檔案、routine tests／lint、boilerplate、mechanical refactor。
- 只有 cheap evidence 仍無法解除的 architecture／concurrency／security／correctness ambiguity，才呼叫 Sol。
- 預設高難度流程：cheap repo evidence collection → narrowly scoped Sol decision → Flash implementation → Pro review → Sol re-entry only if unresolved。
- `Sol-assisted` 是**按需 escalation**，不是每張票的 mandatory Sol preflight：Flash 依 issue contract、既有 architecture 與 repository evidence 已可無歧義實作時，直接繼續，不呼叫 Sol。
- `Sol` classification 不等於「整張 ticket 由 Sol 實作」。標記 `Sol` 的 issue 仍以 Flash 執行 implementation，Sol 只介入決策點。

### `Sol-assisted`

- 語意：ticket 以 Flash 為主要 implementer；預先定義需要 Sol 判斷的 decision points；ticket scope 的 execution 依該等 decision 進行。
- escalation：Flash 在 decision point 上需要 reasoning 判斷時 escalate 到 Sol。Sol 回覆後，Flash 繼續實作，最終由 Pro 做 independent review。
- 適用：多數現有標記 Sol 的高難度 vertical-slice ticket。

### `Sol-led reasoning`

- 語意：ticket 的**核心輸出是 correctness／security reasoning 或 acceptance verdict**，而不是某個 bounded implementation。Sol 在收斂 decision question 後主導該 reasoning 產出；任何緊接的實作仍由 Flash 執行，並由 Pro 審查。
- escalation：此模式是 explicit。Sol 只有在進入明確 decision phase 時介入，不觸碰 routine implementation。
- 適用：integration／release acceptance、security-critical correctness 收斂，例如 #267、#294。

### Issue routing

- issue 的 routing 標記只描述 model 分工與 Sol escalation 語意，不改變 issue scope、acceptance criteria 或 dependencies。
- `Routing: Sol-assisted` 與 `Routing: Sol-led reasoning` 是 issue 上的唯一合法 Sol routing 標記。`Implementation: Sol` 表示整張 ticket 由 Sol 實作，除非本節明確允許，否則不得使用。
- coordinator 委派時，Sol-assisted ／ Sol-led 的 ticket 不得整包委派給 Sol 實作；Sol 只處理預先定義的 decision questions。

## Git 規範

- Branch 名稱使用 `<agent-or-purpose>/<short-description>`，並優先遵循使用者或當前 workflow 指定的命名方式。
- Commit 訊息使用簡潔英文祈使句或 `<type>: <short description>`。
- 在 mixed worktree 中不得使用 `git add -A` 或 `git add .`；只 stage 本次任務需要的檔案。
- 不要 revert 使用者未要求 revert 的變更。
- GitHub / git 指令必須 non-interactive。
- PR 必須列出 source of truth、變更內容、明確不做的事與驗證結果。

## Issue 實作與 Coordinator Worktree 規範

本節適用於所有由 agent 或 workflow 實作的 GitHub issue，目的是避免 worktree 被誤刪、Agent resume 落入錯誤工作區，以及 PR merge 後 Issue 未關閉。

- Issue 實作一律由 Coordinator 預先建立獨立 worktree；執行 Agent 不含 isolation wrapper，改用 Coordinator 明確指定的 absolute worktree path。
- Agent 不得自行建立、切換、改名或刪除 worktree。
- worktree 清理只在 PR 建立且遠端 commit 安全之後，由 Coordinator 執行。
- issue-reviewer 無 verdict 中止（BLOCKED_REVIEW、turn limit、逾時或中斷）後：先修復明確的環境問題，再在同一 exact head 上啟動全新的 issue-reviewer instance（不得 resume 同一個 reviewer）。
- 全新的 issue-reviewer 仍無 verdict 時，才允許使用未參與實作的、全新的 read-only general-purpose reviewer；fallback reviewer 只授與唯讀工具。
- Fallback reviewer 仍必須輸出 exact reviewed head 與 blocking findings，或 `No blocking findings.`。
- Controller 的驗證結果不得取代 reviewer verdict；只有 reviewer 明確回覆 verdict，review 才算完成。
- PR 必須包含 `Closes #<issue>`，並列出 scope、changed files、validation 與 non-goals；禁止只以裸 issue number 引用。

## Review 與 Merge 政策（並行 sub-agent 吞吐量感知）

本節是 PR review 與 merge eligibility 的唯一 canonical policy。repo 根目錄 `CLAUDE.md` 的「Reviewer Gate」段落與 `.github/pull_request_template.md` 都引用本節，不得另立分歧規則。目標是讓實作寬、整合窄：

```text
parallel isolated implementation
→ bounded review queue
→ independent exact-head review
→ sequential integration against latest main
```

### Reviewer roles（reviewer 角色）

- implementing agent 不得作為自身 work 的唯一 reviewer；每個 PR 至少需要一位未參與實作的 independent reviewer。
- 每個 PR 至少需要一個 independent reviewer verdict，且該 verdict 必須針對 exact current head。
- CodeRabbit 預設 advisory：pending、delayed、skipped、disabled、quota-limited、cancelled、no-op 的 CodeRabbit run 不得單獨 block merge。
- CodeRabbit check 標記 successful 不計為 reviewer approval，除非它包含對 current exact head 的真實 review verdict 或 concrete findings。
- CodeRabbit findings 必須分類為 blocking、valid non-blocking、incorrect/irrelevant；只有 unresolved blocking findings 阻止 merge。

### Risk tiers（風險分級）

Risk tier 判定必須 deterministic 且 checkable，PR template 必須標記風險分級與理由。

- **低風險（Low risk）**：documentation、tests、copy、isolated maintenance、不改變 production behavior 的變更。Independent review + required CI 即可。
- **中風險（Medium risk）**：ordinary product behavior、state management、API integration、build configuration、persistent data access。Independent exact-head review + required CI；CodeRabbit feedback 可用時納入，但不只為了 completion 而等待。
- **高風險（High risk）**：authentication、authorization、secrets、destructive operations、migrations、payments/economy、deployment、concurrency、queue correctness、core architecture。需要兩個 independent review signals；CodeRabbit 可算一個 signal，但可用同等獨立 reviewer 取代。

### Throughput limits（吞吐量上限）

- 最多 4 個 implementation PR 可同時在 active review queue 等待。
- 最多 2 個 PR 可同時在 final review。
- 一次只 merge 一個 PR，且必須對最新 `main` 進行。
- 額外完成的 agent work 留在 implementation-ready queue，不開出無上限的 PR。
- 另一個 PR merge 後，對剩餘 PR 以最新 `main` 重新評估 integration order 與 dependency constraints；**stale base SHA alone 不是 blocker**，不得僅因 base 落後就要求 rebase、force-push 或改寫 branch。
- 只有在下列任一條件成立時，才要求 update branch 並重跑 required gates：merge conflict；changed-file overlap 造成需要重新整合；dependency / API / schema / contract 已改變；temporary integration result 的 required validation 失敗；branch protection 明確要求 up-to-date branch。
- 其餘情況保持 reviewed PR head 不變：以最新 `origin/main` 與 PR exact head 建立 temporary merge／integration tree，驗證 merge-tree、dependency、scope 與 required gates；integration result 通過即依最新 main 順序 squash merge，不重跑整套 exact-head review。

### Merge gate（merge 條件）

以下條件全部為 true 才可 merge：

- required CI 與 repository validation gates 在 exact head 上 green；
- 該 risk tier 所需的 independent reviewer count 回報 `No blocking findings.`；
- 沒有 unresolved non-outdated blocking review thread；
- reviewed head SHA 未改變；
- scope 符合 owning issue 且沒有無關 work 混入；
- integration order 與 dependency constraints 對最新 `main` 仍然有效。

reviewer verdict 綁定實際 reviewed candidate（reviewed head SHA）：merge 本身不構成 review、也不能補齊缺失的 verdict；只有當 PR head 真的被改寫、產生新的 candidate 時，原 exact-head verdict 才失效並需要重新 review。以 temporary merge／integration tree 驗證、或另一張 PR merge，都不得視為對該 PR 的 review 已完成。

CodeRabbit 未完成不構成 independent merge blocker，除非該 PR 被明確歸類為 high risk 且 CodeRabbit 被選為 required review signal 之一。

## JavaScript Package Manager

- 使用 pnpm。
- 使用 `package.json` 中既有的精確 `packageManager` 版本。不得自行降級、升級或改寫版本，除非 issue 明確要求。
- 不得引入 `package-lock.json`、`yarn.lock`、`bun.lock` 或 `bun.lockb`。
- 不得新增 `preinstall`。
- 不得用 lifecycle script 強制 package manager。

## 供應鏈安全

- 不得自行新增依賴，除非任務需要且已說明原因。
- 不得執行 `npx`、`pnpm dlx`、`npm exec`、`curl | bash`、`wget | sh` 這類遠端即時執行指令，除非使用者明確批准。
- `package.json` 與 lockfile 改動必須在回報中明確說明。
- 外部教材、字典資料、音訊、圖片或例句不得直接匯入，除非 license、attribution 與 allowed use 已文件化。

## 前端品質重點

- 設計或重設前端頁面前，先使用 `design-taste-frontend`。
- 第一畫面應該快速呈現實際學習內容或練習，不是 landing page。
- UI 應該 mobile-first、內容導向、輕快但不幼稚。
- 日文用於學習者說明；繁體中文用於目標語內容；台灣正體中文可用於開發/管理介面。
- Lesson 頁面要清楚呈現：hook、can-do goal、core sentence、chunk breakdown、kanji bridge、sound focus、mini practice、travel task。
- Travel Quest / scenario readiness 要比泛用 streak 更優先。
- 手機與桌面都要檢查文字不重疊、不截斷，尤其是日文長句、拼音、繁體中文字卡與按鈕。

## JS-free 互動與瀏覽器證據

JS-free 互動工作必須：

- 使用原生控制項與原生瀏覽器語意（例如 `details`/`summary`、radio、`<a href="#id">`、`<button type="button">`）。
- 不得用 focusable label、泛用元素或 inert anchor 模擬按鈕；不得用靜態 ARIA state 模仿可變的原生 state。
- 在唯讀 arbiter review 前，先產生瀏覽器互動、accessible-name、focus、viewport 與截圖證據。
- 確認截圖片段中每個必要證據元素與每個可見互動控制項都完整位於 viewport 內。

詳細的互動決策表、per-control 契約、瀏覽器煙霧測試矩陣、截圖／viewport 證據規則、arbiter 能力邊界與 review/merge 規則，見 `docs/engineering/frontend-interaction-evidence-playbook.md`。

## 內容與資料規則

- 內容與資料支援繁簡雙語顯示；台灣旅遊路徑以繁體為主，HSK／學校課業／一般中文路徑可預設簡體。
- 內容必須存在 structured、reviewable 的資料檔案，不得硬編碼在 Astro page、UI component 或 rendering logic 中。
- 每個 vocabulary entry 至少支援：繁體中文、pinyin、日文說明、類別、例句、tone note、caution/source/review metadata。
- 每個核心 lesson 必須符合 `docs/strategy/learning-and-motivation-strategy.md` 的 lesson loop。
- 中日音讀相近性只能作為 learning bridge，不得在沒有來源時做詞源或語音等同宣稱。
- false friends、聲調陷阱、台灣用法差異必須明確標示。

## 測試與驗證

宣稱完成前至少回報實際執行過的驗證。
只執行與本次變更直接相關的 targeted validation；不得為 bounded change 無條件執行所有測試類別。
若修改跨越共用 domain、schema、build configuration 或 package metadata，再擴大至相應的完整驗證。

優先測：

- Content schema validation。
- Lesson loop 欄位完整性。
- On-yomi bridge vocabulary 的 caution/source/review metadata。
- Practice scoring、retry、local progress。
- Travel Quest readiness 計算。
- Mobile / desktop 主要畫面無重疊、無截斷。
- pnpm lockfile policy。

## 驗證階梯（risk-based validation ladder）

Bounded cycle 的最小驗證層級由「變更風險」決定，不由 model 判斷。可執行分級器在
`scripts/validation/classify.ts`，依變更檔案把風險對應到 minimum tier。Agent 用下列
穩定指令（各指令保證「至少」該 tier，classifier 分級更高時會自動升級），不要自行挑
測試：

- `pnpm validate` — 自動分級目前對 `origin/main` 的 diff 並執行對應 tier。
- `pnpm validate:affected` — T1 Affected：affected-domain tests + lint + typecheck。
- `pnpm validate:integration` — T2 Integration：full Vitest + lint + typecheck + build。
- `pnpm validate:full` — T3 Full Gate：T2 + visual + accessibility + content。
- `pnpm validate:classify` — 只列出 tier 與理由，不執行。

Tier 定義（minimum required）：

- **T0 Smoke** — 實作當下直接對應的 focused test/validator；無 repo-wide 指令。
- **T1 Affected** — 受影響 domain 的測試 + 最小 static check（lint、typecheck）。
- **T2 Integration** — full Vitest + lint + typecheck + build（final review 前）。
- **T3 Full Gate** — T2 + visual regression + accessibility + content／cross-cutting（merge-ready、high-risk、`main`）。

分類取「所有變更檔案的 tier 的 max」，全部檔案都屬低風險時才會降到低 tier。以下
surface 保守升級：schema／repository contract（`src/types`、`src/data`）、
auth／account／Supabase、generator／build／CI／`scripts`、`package.json`／lockfile／
config、generated 資料（`data/**/generated`、`data/unicode`）、學習者可見的
UI／component（`src/components`、`src/pages`、`src/layouts`、`.astro`——可能影響
layout 或鍵盤 focus 順序，需跑 visual regression 與 accessibility）。無法分類的檔案一律
fail safe 到 T3；`main` push 一律 T3。PR CI 用同一 classifier 跳過不相關的昂貴 job，
high-risk／unknown 仍跑 full gate。classifier 的 risk-class → tier 對照與
affected-test 選擇以 `scripts/validation/classify.ts` 為準，並由
`tests/validation/classifier.test.ts` 守護（含「每個 domain source 都有 affected
test 對照」的 coverage 斷言）。

## 回報格式

回報保持精簡：

- 只列出關鍵變更：檔案名稱 + 一句說明。
- 測試結果只報 pass/fail 與失敗原因，不貼完整 log。
- 有新增依賴、package manager、license 或外部資料風險時必須明確說明。
- 遇到可在當前 issue scope 內安全修復的錯誤，先診斷並做最小修正，再重新驗證。
- 只有在修正會擴大 scope、改變架構、增加依賴、破壞相容性或需要產品決策時，才停止並請使用者決定。
