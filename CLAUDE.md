# Chabiko — Claude Agent Guidelines

@~/.claude/CLAUDE.md

本檔只定義 Claude Code 專屬行為。

所有 repo 共用的開發、scope、git、package manager、供應鏈安全、測試與回報規則，以根目錄 `AGENTS.md` 為唯一 source of truth。不得在本檔重複維護同一套規則。

規則衝突時，優先順序如下：

1. 使用者本次明確指示
2. 當前 GitHub issue body
3. `AGENTS.md`
4. 本檔

## 語言

* 分析、進度回報與最終回報使用台灣正體中文。
* 學習內容、例句、UI copy、語法說明及面向日本學習者的文案可以使用日文。
* 目標語中文依產品路徑使用繁體或簡體。

## 實作前

開始修改前必須：

1. 讀取根目錄 `AGENTS.md`。
2. 讀取當前 GitHub issue body。
3. 確認 issue scope、acceptance criteria、依賴及允許修改範圍。
4. 只讀取完成本次任務所需的相關程式碼、schema、validator、fixture、測試與 source of truth。
5. 檢查工作區狀態，避免覆蓋或混入其他變更。
6. 遵循 `AGENTS.md` 的「實作前檢查」清單（安全機制 writer 盤點、跨檔契約同步、文件化命令測試、cleanup 假設）。
7. 判斷是否為 `AGENTS.md` 定義的 cross-cutting 變更；若是，先完成 Impact Map 再實作。

不得依賴本文件中的 implementation snapshot。當前狀態以 `main` 上的實際程式碼、測試及 GitHub issue／PR 為準。

## 實作原則

* 一次只處理當前 issue 明確要求的內容。
* 優先採用最小、直接、可驗證的修改。
* 不得順手重構、擴大 scope 或自動處理 non-blocking finding。
* 發現 scope 外問題時，只在最終回報中簡短列為 deferred finding。
* 不得相信 PR body、舊摘要或其他 agent 對完成狀態的宣稱，必須自行驗證。

## Subagent

* 普通讀檔、搜尋、實作或 routine 判斷不得啟動 subagent。
* 同一時間不得啟動用途重疊的 subagent。
* subagent 任務必須清楚、狹窄且有明確停止條件。
* subagent 不得再派生其他 agent。
* 不得讓 background agent 執行 broad repository audit。

`arbiter` 只用於已明確定義的困難技術決策，不得用於一般實作、routine review 或 repository 探索。

## Reviewer Gate

Implementation 與必要的本地驗證完成後，才可啟動獨立 `reviewer`。

* 每個 implementation cycle 最多只能有一個 reviewer。
* 一般 bounded cycle：reviewer 只審查當前 issue、acceptance criteria 與本次 staged diff。
* reviewer 不得修改檔案、建立工作項目、派生 agent 或展開 broad repository audit。
* non-blocking finding 只回報，不得阻止交付或自動觸發額外調查。
* blocking finding 只做最小修正，執行受影響驗證後再審。
* 一般 bounded cycle 的 re-review 只檢查修正後差異與先前 blocker，不重新全面探索 repository。
* cross-cutting 變更的 final integration review（依 `AGENTS.md` 的「Cross-cutting 變更 Gate」判斷）改為完整 surface 審查：review 當前 issue、Impact Map、完整 PR diff 與相關 contract surface，並依適用性檢查 writers、consumers、stale assumptions、canonical workflow、cleanup、rights／provenance、generated output 與 negative drift 行為。此例外只適用於 cross-cutting 的 final integration review，不把 routine review 變成 broad repository audit。
* cross-cutting 變更在 blocker 修正後的 final merge-readiness pass 仍須在最新 head 上確認完整 surface，而非只看最新 patch。
* reviewer 明確回覆 `No blocking findings.` 後，review loop 立即停止。

只有在 reviewer 回覆 `No blocking findings.`，且必要驗證通過後，才可依使用者指示 commit、push 或建立 PR。

除非使用者明確要求，否則不得 commit、push、建立 PR、merge，或修改 GitHub issue 與 review thread。

## Graphify

`graphify` 只用於程式碼導航與理解。

除非當前 issue 明確要求更新 knowledge graph，否則不得：

* 執行 `graphify update .`
* 修改或提交 `graphify-out/`
* 因一般 code 或 content change 產生 graph metadata churn

## 完成回報

只回報：

* 關鍵修改
* 實際執行的驗證與結果
* reviewer 最終結果
* 尚未解決的 blocking 問題
* 必要的 deferred non-blocking finding

