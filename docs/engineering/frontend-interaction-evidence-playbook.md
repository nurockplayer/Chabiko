# Frontend Interaction and Browser Evidence Playbook

本 playbook 收錄跨 ticket 可重用的 JS-free 前端互動模式、瀏覽器驗證證據、截圖驗證與唯讀 arbiter 邊界規則。內容與 Direction 無關，不綁定任何設計方向的 selector 或學習者文案。

來源：Issue #155 的 post-merge retrospective、PR #156 的實作與 review 歷史，以及解析後的 Codex review threads。Incident-specific 歷史留在 #155 與 PR #156，本檔只保存可重用規則。

## 1. Native interaction decision table

JS-free 原型必須只用原生互動模式。需要滿足下列需求時，採用對應的 required pattern：

| 需求 | 必須使用的模式 |
| --- | --- |
| reveal/hide toggle | `<details>` 與 `<summary>` |
| mutually exclusive options | 原生 radio input 搭配關聯的 `<label>` |
| fragment-driven state | 帶真實 `#id` target 的 anchor 與 `:target` |
| action without navigation | `<button type="button">` |
| state-dependent visible text | 用 CSS display 切換的真實 child elements |

禁止模式：

- focusable label 或泛用元素當作模擬按鈕；
- 用靜態 ARIA state 模仿可變的原生 mutable state；
- transparent 或 zero-size、但仍留在 keyboard tab sequence 的控制項；
- 把 `href="#"` 當成 inert action；
- 把 generated CSS content（例如 `::after`）當成唯一或主要的 accessible label；
- 使用 issue contract 未要求的控制項或狀態。

## 2. Required per-control behavior contract

實作前，每個互動控制項都必須定義並凍結以下項目：

- 原生 element type；
- 可見狀態；
- 鍵盤觸發行為；
- state 或 fragment transition（含預期的 hash 變化）；
- 是否可能觸發 completion；
- 瀏覽器計算出的 expected accessible name；
- 必須出現在哪個 screenshot state。

規格未描述的行為是 contract gap，不是授權 implementer 自行選一個看似合理的行為。

## 3. Browser evidence before arbiter review

瀏覽器 smoke test 必須在唯讀 arbiter review 之前執行，並提供具體證據，涵蓋：

- Tab traversal 沒有 invisible 或 zero-size focus stops；
- summary、radio、button、anchor 都能以鍵盤正確觸發；
- focus indicator 可見；
- 需要時，渲染出的互動 target 至少 44px；
- accessible name 來自瀏覽器 accessibility tree，或等價的 Playwright assertion；
- 預期的 hash/state transition 與 visibility 結果發生；
- 每個 contract viewport 都沒有 horizontal overflow。

`textContent`、`innerText`、DOM visibility、browser-computed accessible name、viewport inclusion 與 PNG evidence 是不同訊號，不能互相取代。

## 4. Screenshot and viewport evidence

每個相關 capture 都必須驗證：

- 確切的 viewport 與 PNG IHDR dimensions；
- issue 要求的 `fullPage` state；
- 預期的 reveal/completion/hash 與 scroll state；
- 每個必要 evidence element 的完整 viewport bounding box；
- 擷取片段中每個可見互動控制項的完整 viewport bounding box，包括手寫 checklist 遺漏的控制項；
- 視覺檢查已提交的 PNG 本身，不只是 `checkVisibility()` 這類 DOM visibility proxy。

## 5. Reviewer capability boundary

Read/Grep/Glob-only 的 arbiter 可以審查 code、contract 與提供的證據，但無法獨立建立：

- 實際瀏覽器鍵盤行為；
- accessibility-tree output；
- viewport inclusion；
- 已提交 PNG 的 pixel 內容。

因此瀏覽器證據必須在 arbiter review 前產生，並納入其 review packet。

## 6. Review and merge rule

最終獨立 review 可由 ChatGPT 或 Codex 執行。當 ChatGPT 親自驗證：

- 最新被 review 的 head 沒有移動；
- 最新 CI 成功；
- 完整 diff 與 changed-file scope 符合 issue；
- review findings 與 threads 都已處理；
- 沒有殘留的 blocking findings；

ChatGPT 可直接 merge，不需要額外的 abstract controller gate。

## 7. Worked example

下列 compact、方向無關的範例取自 PR #156 的修復歷程。

- **為何 focusable-label/hidden-input simulation 失敗**：用 focusable `<label>` 模擬按鈕、控制 transparent zero-size checkbox/radio，並疊上靜態 ARIA state，造成三種連動失敗：鍵盤啟動 label 無法可靠 toggle 關聯 input；隱藏 focusable input 留在 tab sequence 卻沒有可見 focus target；靜態 `aria-pressed` 無法追蹤真實 mutable state。
- **如何以 native primitives 取代**：reveal/hide 改用 `<details>`/`<summary>`，互斥選項改用原生 radio + label，completion 改用帶真實 `#id` 的 anchor 與 `:target`，無導覽動作改用 `<button type="button">`，狀態依賴文字改用 CSS display 切換的真實 child elements，並移除所有 `role=button`、`tabindex` 與靜態 `aria-pressed`。
- **為何 `checkVisibility()` 無法證明截圖包含**：DOM visibility proxy 只回報元素是否可視，不證明它在已提交 PNG 的 viewport 內完整可見。需改用完整 viewport bounding-box assertions，並視覺檢查 PNG 本身。
- **為何額外 non-contract 控制項增加驗證表面**：新增一個 contract 未要求的控制項後，它成為必須驗證與納入截圖的元素；若在行動版證據中被裁切，就會產生新的 blocking finding。控制項必須先在 per-control contract 中定義並納入驗證範圍，不能事後補上。
