# Chabiko — Claude Agent Guidelines

@~/.claude/CLAUDE.md

本檔繼承 global ~/.claude/CLAUDE.md 的全域規則；repo-specific 與 Codex 共用規則以 AGENTS.md 為並行 source of truth。git、package manager、supply-chain、scope 與安全規則必須同時參照 AGENTS.md 才能取得完整規範。

## 語言設定（覆寫全域規則）

本專案覆寫全域語言限制：
- 代理人的說明與回報使用台灣正體中文。
- 學習內容、例句、UI copy、語法說明、面向日本學習者的文案可以使用日文。
- 繁體中文用於目標語內容（詞彙、例句、拼音標註）。
- 全域禁止日文的規則不在此限。

## 專案定位

Chabiko | チャビコ 是給日本人學中文的網站。目標是讓零基礎或初學者從「看得懂一些漢字」進到「可以用簡單中文在台灣旅行」。

產品核心不變：
- Chinese content dual-script：台灣旅遊路徑以繁體為主；HSK／學校課業／一般中文路徑可預設簡體。產品 UI 與解說始終以日文為主。
- 日文解釋優先（服務日本語使用者）。
- 內容有趣、短、讓人想繼續看。
- 中日漢字與音讀相近性只作為記憶提示，必須明確標示 false friends、聲調差異、台灣用法。
- 學習成果以 Travel Quest / 情境準備度呈現，不只是課程完成數。

## Source Of Truth 與 GSD 工作流程

実装前に以下を読む：
- `.planning/PROJECT.md`
- `.planning/REQUIREMENTS.md`
- `.planning/ROADMAP.md`
- GitHub issue body

GSD ルール：issue の所属 phase/依存関係を先に確認。未要求の機能を混ぜない。

## 技術方向

- Static-first web app, TypeScript, pnpm@10, Astro
- uv + Python 3.14+ for validation tooling
- LocalStorage for v1 progress, no backend/login/sync

## 実装済みコンテキスト

- **語彙セッション状態機** (`src/domain/vocabularySession.ts`) — PR #95 merged
- **語彙進捗ストア** (`src/domain/vocabularyProgress.ts`) — PR #96 merged
- **進捗ストア** (`src/lib/progress.ts`) — PR #53 merged
- **HSK 語彙コントラクト** (`src/types/vocabulary.ts`) — PR #92 merged
- **HSK 1 フラッシュカード** (`/vocabulary/hsk/1/`, `FlashcardSession.astro`) — 進捗統合済み、setup controls（10/20語、zh→ja/ja→zh）、pageshow/storage 対応

## graphify

This project has a knowledge graph at graphify-out/. Rules: prefer `graphify query/explain/path`, then graphify-out/wiki/, then GRAPH_REPORT.md. Run `graphify update .` after code changes.
