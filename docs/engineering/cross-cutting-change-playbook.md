# Cross-Cutting Change Playbook

本 playbook 收錄跨 ticket 可重用的 cross-cutting 變更工作流程，定義在實作前如何凍結完整 contract surface、如何產出可稽核的完成證據，以及最終 reviewer 如何以完整 surface 收斂 findings。內容與特定 Direction 或 issue 無關。

來源：Issue #198 的 scope 定義，以及 Issue #193 / PR #196 的反覆 review 歷史。Incident-specific 細節留在 #193 與 PR #196，本檔只保存可重用規則。

## 1. Cross-cutting 分類觸發器

實作前先用下列清單判斷是否為 cross-cutting 變更。影響至少兩類領域即屬於 cross-cutting：

- asset 路徑、generated 檔案或 migration；
- schema、state 或 metadata contract；
- generator、importer、rebuild script 或 legacy 相容路徑；
- build、deployment、pruning、`.gitignore` 或 cleanup 行為；
- rights、license、attribution 或 provenance；
- 多個 runtime consumer（loader、UI、API、validator、測試）；
- 大型 committed generated 輸出。

只影響單一檔案或單一本地機制的變更不需 Impact Map，保持既有輕量流程。

## 2. Impact Map 模板

實作前產出精簡 Impact Map，凍結下列每個 surface。任一 surface 未知或仍需產品決策時，停止實作並回報，不得自行猜測。

```text
# Impact Map — <issue 標題>

## Writers
- <寫入受影響路徑／資料／state 的每個來源；包含 generator、importer、手動編輯、測試 fixture>

## Consumers
- <每個讀取或依賴該路徑／schema／state 的 consumer：資料檔、loader、validator、UI、API、測試>

## Legacy paths
- <legacy writer、舊路徑、相容層；移除安全機制前必須確認沒有其他 writer 仍依賴>

## Canonical workflow
- <重建或 migration 的正式命令與順序，例如 canonical build command>

## Boundaries
- Git、build、deployment、`.gitignore`、pruning 與 cleanup 各自限制；測試 cleanup 只刪除自己建立的檔案／目錄>

## Rights / provenance
- <license、attribution、provenance 要求與其來源（ADR、rights 檔、product-owner 決策）>

## Clean / dirty environment
- <clean 與 dirty 環境各自的預期行為與失敗案例>
```

## 3. Requirement → Diff → Test Evidence 矩陣

每個 frozen requirement 都必須在完成報告中對應到變更檔案、驗證與觀察結果。沒有證據的 requirement 不得宣稱完成。

```text
| # | 凍結 requirement | 變更的檔案／artifact | 驗證 | 觀察到的結果 |
| --- | --- | --- | --- | --- |
| 1 | <從 issue 凍結的 contract> | <diff 對應路徑或 generated 輸出> | <focused test 或 validation 名稱> | <通過／失敗與關鍵數字> |
```

## 4. Writer / consumer / legacy-path 搜尋指引

變更跨檔契約或安全機制前，先完整盤點，再動手。搜尋至少涵蓋：

- writer：直接寫入路徑／資料／state 的所有來源，包括 generator、importer、build 整合、手動或 fixture 寫入。
- consumer：資料檔、loader、validator、UI、API、測試中讀取或依賴該契約的位置。
- legacy 相容路徑：舊路徑、舊 state、舊 label、被淘汰的 guard 及其殘留引用。
- stale assumptions：已凍結契約的舊假設，可能散落在文件、ADR、測試或 generated 輸出中。

移除或收窄任何安全機制（build guard、`.gitignore` 規則、驗證 gate）前，先確認沒有其他 writer 仍依賴該機制。

## 5. Canonical workflow 驗證

- 文件化的 workflow 命令必須由 self-test 斷言其行為本身，不能只測被呼叫的函式。
- 涉及 generators、builds、migrations 或 cleanup 時，canonical 命令本身要作為驗證目標，例如確認 rebuild 後 serialized corpus 與 committed metadata 一致。
- 涉及 reuse 或 provenance 時，重跑 canonical 命令不得悄悄改變既有 accepted 狀態；例如 accepted-AI reuse 必須 fail closed，除非 committed `promptDigest`、`generationRevision` 與 `referenceSetIds` 與當前 frozen prompt contract 相符。

## 6. Clean / dirty 環境測試

凡涉及檔案、目錄、generator、build、migration 或 cleanup 的變更，clean 與 dirty 環境驗證都必須：

- clean 環境：全新 checkout 或受控 fixture 下，canonical workflow 從頭成功。
- dirty 環境：工作區含其他開發者檔案時，驗證 build、prune、cleanup 與 migration 不會刪除或覆蓋非本變更建立的內容。

cleanup 規則：process 只移除自己建立的檔案；只有當 process 自己建立了該目錄且目錄為空時，才移除該目錄。

## 7. Rights / provenance 一致性檢查

- 每個 committed 資產與 metadata 的 rights、license、attribution 與 provenance 都必須可回溯到 repository 內的來源（ADR、rights 檔、product-owner 決策、commit）。
- generated 輸出（例如 preview corpus）與 committed metadata（例如 rights 檔、契約）不得互相矛盾。
- 涉及 reuse 時，provenance 欄位（`promptDigest`、`generationRevision`、`referenceSetIds`）必須與 frozen 契約一致。

## 8. Repo-wide 最終 Reviewer Checklist

最終唯讀 reviewer 檢查完整 contract surface，不能只看最後一次 follow-up diff。至少驗證：

- 所有已知 writer 與 consumer 都已盤點並同步。
- 沒有 stale path、state、metadata 或 documentation 殘留。
- canonical rebuild／migration workflow 正確且被驗證。
- destructive cleanup 與 dirty 環境行為安全。
- rights／license／provenance 一致。
- generated 輸出與 committed metadata 一致。
- negative drift test 與 fail-closed 行為存在且有效。

除立即的 P0／P1 安全或資料遺失風險外，reviewer 應完成完整掃描並將 findings 聚合到同一 follow-up cycle，而非逐條送出。

## 9. Worked example — Issue #193 / PR #196

PR #196 因為初始實作與 review 只驗證最終 asset 狀態、未先映射完整 contract surface，經歷多次 follow-up。下列 compact 範例濃縮其教訓：

- **Legacy writer**：`pruneLocalOnlyAssets()` 在 cleanup 時移除已 tracked 的 teacher derivatives，且舊的本地 guard 遺漏 `public/assets/dev/` 的 legacy 來源，造成 legacy 資產滲入部署。
  → 移除安全機制前先盤點所有 writer；新 `pruneDevAssets()` 只移除 build 產生的 `dist/assets/dev/`，不碰 deployable 目錄。
- **Schema／loader consumer**：`rights.status` 契約變更後，learner loader 仍拒絕新狀態，或契約新增 `approved` 狀態但未同步 validator／UI。
  → 跨檔契約變更必須在同一個變更內同步所有 consumer（資料檔、loader、validator、UI、測試）。
- **Canonical rebuild command**：文件化的 build 命令遺漏 `--reuse-accepted-ai-assets`，重跑後 432 個 accepted AI assets 退化為 `ai-pending`。
  → canonical 命令本身必須由 self-test 斷言，確保 rebuild 不會悄悄改變 accepted 狀態。
- **Dirty 環境 cleanup**：build regression test 在包含開發者檔案的 workspace 中刪除了開發者擁有的 dev assets。
  → 測試 cleanup 只刪除自己建立的檔案；只有自己建立的空目錄才移除。
- **Rights／provenance**：accepted-AI reuse 必須比對 committed `promptDigest`／`generationRevision`／`referenceSetIds` 與 frozen prompt contract，不符則 fail closed。
  → provenance 欄位與 frozen 契約一致是驗收的一部分。

每個凍結 requirement 都要能對應到 diff 與驗證結果；review 只看最終狀態而不映射完整 surface，正是這些缺陷層層浮現的原因。
