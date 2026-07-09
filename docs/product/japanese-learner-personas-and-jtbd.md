# Japanese Learner Personas and Jobs-to-Be-Done

**Status:** Draft for #13
**Last updated:** 2026-07-09
**Product context:** Chabiko | チャビコ — a Japanese-first Mandarin learning site
**Alignment:** PR #21 dual-script path-based strategy, PR #3 research summary

---

## 1. Overview

This document defines the Japanese speaker personas and jobs-to-be-done (JTBD) that guide Chabiko's v1 scope, curriculum priorities, content model, script display defaults, and product surface design. It ensures Chabiko is built for actual Japanese learner needs rather than becoming a generic Chinese-learning app.

**Design principles applied from source of truth:**

- **Product UI language:** Japanese — all learner-facing explanations, navigation, and labels are in Japanese. The product is built for Japanese speakers, not translated from English.
- **Chinese content script display:** Simplified and Traditional — Chinese text supports both scripts with path-based defaults and a global toggle. This is a display preference for Chinese content, not a change to the Japanese UI.
- **Path default vs manual toggle:** Learning paths set the default Chinese script display (e.g., Traditional-first for Taiwan travel), but the learner should be able to switch Simplified / Traditional display at any time through the global script toggle where both forms exist. A manual script choice should override the path default locally where appropriate. This toggle affects learner-facing Chinese content only; Japanese product UI and explanations remain Japanese-first.
- **Script availability:** Not all content may have both script forms authored or verified. Missing script forms need explicit fallback handling and scriptStatus metadata (authored / verified / generated / unavailable) to prevent silent display of unreviewed text. The toggle should indicate when a form is unavailable rather than silently falling back.
- Taiwan travel is the v1 differentiating spine.
- AI-assisted script conversion may aid authoring; production learner-facing forms must be authored or verified.
- No unreviewed runtime conversion for production display.

### Related issues

| Issue | Relationship |
|-------|-------------|
| #14 Pain-point taxonomy | Personas define *who*, #14 defines *what hurts* |
| #17 Learning paths | Persona JTBD feeds path design |
| #18 Dual-script / variant strategy | Script expectations from personas inform path defaults |
| #22 Global script toggle | Persona path membership sets the toggle default |
| #4 Beginner lesson sequence | Primary persona drives v1 lesson hook and examples |
| #6 Taiwan travel phrasebook | Primary persona's core use case |
| #12 Travel Quest readiness | Readiness metrics must feel relevant to primary persona |

---

## 2. Personas

### P1: Taiwan Travel Learner — 台湾旅行学習者

| Field | Value |
|-------|-------|
| **Learner snapshot** | Japanese speaker, 25–45, employed or student, planning a leisure trip to Taiwan within 3–12 months. Minimal or zero Mandarin background. Comfortable with hiragana/katakana and basic kanji but has never studied Chinese. |
| **Motivation** | Wants to travel independently beyond tourist bubble — read signs, order at night markets, ask for directions, handle check-in, and recover from misunderstandings. Wants the trip to feel smoother and more respectful. |
| **Learning context** | Self-directed, mobile-first. Studies during commute, lunch break, or before bed. No formal class. Uses travel guides, Google Translate, and YouTube for preparation. |
| **Desired outcome** | Can handle ~10 practical Taiwan travel scenarios with basic Chinese: ordering food, buying tickets, checking in, asking prices, introducing themselves, and simple emergency phrases. Can read about 30–50 common Traditional Chinese characters found on Taiwan signs and menus. |
| **Pain points** | Tones are unfamiliar and hard to distinguish. Knows kanji but discovers same-looking characters have different readings and meanings in Chinese. Struggles with Taiwan-specific vocabulary (e.g., 便當 vs 盒飯, 計程車 vs 出租車). Finds most Chinese-learning apps are English-based and generic-Mandarin-focused. Cannot tell which resources use Taiwan usage vs Mainland usage. |
| **Likely session length** | 3–8 minutes, multiple times per day. |
| **Strongest retention hook** | "I'll need this on my trip next month" — practical urgency and travel date anchoring. |
| **Default script expectation** | Traditional — because Taiwan uses Traditional Chinese and the learner wants to read real-world signs and menus. |
| **JTBD** | When I am **planning a trip to Taiwan**, I want to **learn practical Chinese phrases for real travel situations**, so I can **order food, read signs, ask directions, and handle basic interactions confidently during my stay without relying entirely on English or gestures**. |

### P2: University / Class-Support Learner — 大学授業サポート学習者

| Field | Value |
|-------|-------|
| **Learner snapshot** | Japanese university student, 18–22, enrolled in a beginner Mandarin course (第二外国語としての中国語). Has 1–2 classes per week. Knows some pinyin and basic phrases from class but struggles with retention and lacks practice outside of class. |
| **Motivation** | Needs to pass the course and get credit. Wants to keep up with classmates and not fall behind. Some are interested in continuing beyond the requirement; others just want to survive the semester. |
| **Learning context** | Complements formal class. Studies before exams, submits homework, reviews vocabulary. Uses university-provided textbooks (typically Simplified-based). May also reference online resources for exam prep. |
| **Desired outcome** | Can recall assigned vocabulary, understand basic grammar points (word order, 是/在/有 sentences, basic complements), and pass the final exam. Can produce simple self-introductions and answer the teacher's questions in class. |
| **Pain points** | Classroom pace is too fast or too slow. Textbook explanations are in Japanese but boring and decontextualized. Pronunciation drills feel disconnected from real use. Finds it hard to practice outside of class — no conversation partner, no engaging review material. False friends between kanji and Chinese characters cause test mistakes. |
| **Likely session length** | 5–15 minutes, 2–4 times per week (exam-driven spikes). |
| **Strongest retention hook** | "This will be on the test" — exam alignment and credit pressure. |
| **Default script expectation** | Simplified — because most Japanese university Mandarin courses follow the PRC-based Beijing curriculum and use Simplified characters. |
| **JTBD** | When I am **taking a Mandarin course at university**, I want to **practice and review what we learned in class through engaging exercises**, so I can **keep up with the curriculum, avoid failing the exam, and build confidence in basic conversation**. |

### P3: HSK / General Mandarin Learner — HSK・一般中国語学習者

| Field | Value |
|-------|-------|
| **Learner snapshot** | Japanese self-directed learner, 20–40, studying Mandarin for career, travel (Mainland China or unspecified), or personal interest. May have studied some Chinese before (1–2 semesters) but plateaued. Target: HSK 3–4 or equivalent functional ability. |
| **Motivation** | Wants a structured, measurable progression. HSK certification is useful for job hunting, transfer to China, or personal goal-setting. Sees Mandarin as a long-term skill investment. |
| **Learning context** | Self-study with textbooks (e.g., 中日橋, 漢語教科書), apps, podcasts, or italki tutors. Has a routine but lacks a cohesive curriculum. May use Anki decks or HSK vocabulary lists. |
| **Desired outcome** | Can pass HSK 3 or 4. Can hold simple conversations on familiar topics (work, hobbies, travel). Can read simplified Chinese passages at an intermediate-beginner level. |
| **Pain points** | HSK vocabulary lists are dry and lack context. Few apps are designed for Japanese speakers — most are English-first. Struggles with grammar differences (word order, aspect particles 了/過/著, complement of result) that English-based resources don't explain well for Japanese learners. Tones remain difficult without feedback. |
| **Likely session length** | 10–20 minutes daily or every other day. |
| **Strongest retention hook** | "I'm making progress toward HSK level N" — certification milestone and visible level advancement. |
| **Default script expectation** | Simplified — because HSK is a Mainland China standard test using Simplified Chinese. |
| **JTBD** | When I want to **certify my Mandarin level or build general Chinese ability**, I want to **follow a structured path with clear milestones and vocabulary aligned to my goal**, so I can **pass HSK exams, hold practical conversations, and track measurable progress over time**. |

### P4: Business / Service-Industry Learner — ビジネス・接客学習者

| Field | Value |
|-------|-------|
| **Learner snapshot** | Japanese professional, 28–50, working in retail, tourism, hospitality, logistics, or manufacturing where Chinese-speaking customers, clients, or colleagues are increasingly common. May have zero Chinese background or very basic phrasebook knowledge. |
| **Motivation** | Wants to provide better service to Chinese-speaking customers, build trust with business partners, or reduce friction in daily work communication. Often feels embarrassed when unable to handle a simple customer interaction. |
| **Learning context** | Time-constrained and pragmatic. Studies during downtime at work or after hours. Prefers scenario-based learning (e.g., "greeting a customer," "checking an order," "explaining a delay"). |
| **Desired outcome** | Can handle ~5–10 work-specific scenarios: greeting customers, confirming orders, giving simple directions, apologizing for delays, and basic small talk. Can recognize key vocabulary relevant to their industry. |
| **Pain points** | No time for long study sessions. Work scenarios vary widely (Taiwan tourists vs Mainland Chinese tourists vs Shenzhen-based suppliers). Unsure which script or regional usage to learn. Most business Chinese resources assume an English-speaking learner in a white-collar office, not a Japanese speaker in service/tourism/retail. |
| **Likely session length** | 3–10 minutes, during work breaks or on commute. |
| **Strongest retention hook** | "I'll use this with the customer tomorrow" — immediate work application and professional confidence. |
| **Default script expectation** | Either / path-dependent — depends on whether the learner's client base is primarily Taiwan-based (Traditional) or Mainland-based (Simplified). Some will need awareness of both. |
| **JTBD** | When I am **dealing with Chinese-speaking customers or work contacts**, I want to **learn practical phrases for my specific industry scenarios**, so I can **handle routine interactions professionally and build better relationships with Chinese-speaking partners or guests**. |

### P5: Study-Abroad / Exam-Oriented Learner — 留学・受験準備学習者

| Field | Value |
|-------|-------|
| **Learner snapshot** | Japanese student or career-changer, 18–30, planning to study at a university or language program in China or Taiwan for an extended period (semester to 2 years). High motivation, long time horizon. |
| **Motivation** | Needs to build a foundation strong enough for daily life and academic listening in a Chinese-speaking environment. Passing TOCFL or HSK is often a prerequisite for university admission or scholarship eligibility. |
| **Learning context** | Intensive self-study, possibly supplemented by a language school or tutor. Follows a structured daily study plan (1–2 hours). Uses textbooks, graded readers, flashcards, and shadowing practice. |
| **Desired outcome** | Can achieve HSK 4+ or TOCFL Level 2+ before departure. Can handle real-life situations: renting an apartment, opening a bank account, visiting a doctor, and understanding classroom instructions. |
| **Pain points** | High stakes — preparation is time-limited and visa/tuition-dependent. Needs comprehensive coverage (listening, reading, speaking, writing). Long plateau periods where progress feels invisible. Difficult to self-assess readiness before departure. |
| **Likely session length** | 30–60 minutes daily during preparation phase. |
| **Strongest retention hook** | "I'll be in Taipei/Beijing in 6 months" — fixed departure date creates sustained urgency. |
| **Default script expectation** | Path-dependent: Simplified if studying in Mainland China, Traditional if studying in Taiwan. |
| **JTBD** | When I am **preparing to study abroad in a Chinese-speaking country**, I want to **build a comprehensive Mandarin foundation with strong listening and reading skills**, so I can **handle daily life, follow academic content, and meet proficiency requirements before departure**. |

### P6: Chinese Media / Culture Interest Learner — 中国エンタメ・文化関心学習者

| Field | Value |
|-------|-------|
| **Learner snapshot** | Japanese learner, 16–35, drawn to Chinese-language media — C-dramas, movies, variety shows, web novels, or music. May have started learning because of a specific show or artist. Often self-taught through exposure. |
| **Motivation** | Wants to understand original content without relying on subtitles or translation. Wants to engage with a fandom or community. May also want to visit filming locations or attend events. |
| **Learning context** | Media-driven informal learning. Watches content with Chinese subtitles, looks up words, follows fan accounts. Less structured but high exposure volume. Learns by encountering the same phrases repeatedly. |
| **Desired outcome** | Can follow the gist of a variety show or drama episode. Can understand song lyrics. Can read Weibo posts or web novel chapters with occasional dictionary lookups. |
| **Pain points** | Media Chinese is fast and full of slang, cultural references, and regional expressions not found in textbooks. Dictionaries and subtitles help but don't explain the grammar or cultural context. Spoken dialogue in dramas often uses different tones or colloquial reductions from textbook pronunciation. |
| **Likely session length** | 1–5 minutes (while watching content: pause and look up), or 15–30 minute dedicated study sessions. |
| **Strongest retention hook** | "I want to understand this drama without subtitles" — emotional connection to content and characters. |
| **Default script expectation** | Both — depends on media type. Mainland productions use Simplified; Taiwanese productions use Traditional. Learner will encounter both and needs flexibility. |
| **JTBD** | When I am **watching or reading Chinese-language media**, I want to **understand what the original content says without relying on Japanese subtitles**, so I can **enjoy the material as intended and engage more deeply with the culture and fandom**. |

---

## 3. V1 Priority Ranking

### Primary v1 Persona

| Rank | Persona | Rationale |
|------|---------|-----------|
| **1** | P1: Taiwan Travel Learner | Most differentiated use case. Aligns with Chabiko's core value ("Taiwan travel readiness as v1 differentiating spine"). Strongest JTBD urgency — travel has a fixed date. Minimum viable content scope is well-bounded (10–15 travel scenarios). Dual-script needs are clear (Traditional-first). Few mainstream apps serve this persona from a Japanese-first angle. |

### Secondary v1 Personas

Personas Chabiko can partially serve in v1 without diluting the Taiwan travel spine. Their needs inform content format, practice design, and script flexibility — but do not drive the primary curriculum.

| Rank | Persona | How v1 Serves | Guardrails |
|------|---------|---------------|------------|
| **2** | P2: University / Class-Support Learner | Kanji bridge vocabulary, pinyin and tone practice, grammar notes, and beginner lesson loop overlap with what a first-year university student needs. Chabiko's lesson structure (chunk breakdown, sound focus) supplements classroom learning. | Must not add curriculum scope just to match a specific textbook. Lessons remain can-do/task-based, not academically sequenced. |
| **3** | P3: HSK / General Mandarin Learner | Kanji bridge vocabulary, general beginner lessons, pinyin/tone practice, and path-based script support (Simplified-first for HSK path) are useful. HSK vocabulary alignment could be additive without replacing the Taiwan travel spine. | Must not pull the v1 curriculum toward HSK exam-only content. HSK path in v1 means "practical Mandarin that happens to be HSK-level-appropriate," not "prepare for the HSK exam." |
| **4** | P4: Business / Service-Industry Learner | Taiwan travel phrasebook overlaps with service-industry scenarios (ordering food, checking in, asking directions). Scenario roleplay cards and practice interactions translate directly to work contexts. | Scenario roleplay in v1 is travel-first. Business-specific content (e.g., meeting vocabulary, formal email) is deferred. |

### Later / Not Optimized for v1 Personas

Chabiko's v1 design should not block these personas, but the curriculum, phrasebook, and practice loops are not primarily designed for them.

| Rank | Persona | Reason for Deferral |
|------|---------|---------------------|
| **5** | P5: Study-Abroad / Exam-Oriented Learner | Requires intensive curriculum depth and comprehensive listening/reading/writing coverage far beyond v1 scope. High-stakes exam preparation needs audio and speaking assessment that v1 explicitly defers. |
| **6** | P6: Chinese Media / Culture Interest Learner | Media comprehension requires large vocabulary breadth, listening speed, and cultural reference knowledge that exceed v1's bounded scenario scope. Most useful after v1 core content stabilizes and audio support exists. |

---

## 4. Persona-to-Surface Mapping

| Chabiko Surface | P1: Taiwan Travel | P2: University | P3: HSK / General | P4: Business / Service | Notes |
|-----------------|-------------------|----------------|-------------------|------------------------|-------|
| **Beginner lesson sequence** | Lessons use Taiwan travel scenarios as hooks and examples. | Lessons overlap with beginner grammar, chunk breakdown, and pinyin. | Lessons can be taken on an HSK-labeled path with same content. | Travel scenarios (ordering, asking directions) = service scenarios. | Core lesson content is shared; path labels and script defaults differ. |
| **Kanji bridge vocabulary** | False friends relevant to travel context. Japanese-on'yomi bridge for memorization. | Direct classroom aid — many false friends appear in first-year curriculum. | Useful for HSK vocabulary memorization. | Industry-specific false friends applicable where overlap exists. | Kanji bridge is cross-persona utility. |
| **Taiwan travel phrasebook** | Primary use case. 6 scenarios (food, transport, hotel, shopping, emergency, airport). | Supplementary — travel may not be their goal. | Less relevant for HSK-only learners. | Maps to service scenarios (hotel, food, transport). | This surface exists for P1 first. |
| **Practice interactions** | Tone discrimination + scenario roleplay aligned to travel. | Pinyin/tone practice and recognition drills. | Pinyin/tone practice and recall exercises. | Scenario roleplay cards for service contexts. | Practice modes are shared; content context differs. |
| **Travel Quest / readiness** | Primary motivation system. Trip date anchors urgency and scenario readiness tracking. | May not resonate unless they also plan to travel. | Less relevant unless combined with travel interest. | Readiness framed as "can handle service scenario X." | Designed for P1; others can opt in. |
| **Daily Taiwan Chinese** | Re-engagement hook — sees a phrase they'll need tomorrow. | Casual cultural exposure. | Casual vocabulary building. | Work-relevant if daily phrase matches their industry. | Designed for P1; others benefit passively. |
| **Scenario roleplay cards** | Taiwan-specific roleplay (night market, check-in, taxi). | Basic roleplay for classroom practice. | General roleplay for conversation practice. | Customer-service roleplay contexts. | v1 cards are travel-first; service overlap is secondary. |
| **Goal-based learning paths** | "Taiwan trip readiness" is the default v1 path. | "University support" path could be added post-v1. | "HSK preparation" path could be added post-v1. | "Service Chinese" path deferred. | v1 has one primary path; others are post-launch. |
| **Script display default** | Traditional-first. | Simplified-first. | Simplified-first. | Depends on client region. | Path membership determines default; toggle available. |

---

## 5. V1 Non-Goals

Chabiko v1 explicitly does **not** optimize for:

- **Not a generic Chinese-learning app.** Chabiko is built for Japanese speakers learning Mandarin for practical goals, with Taiwan travel as the primary v1 spine. It is not a Duolingo/Pleco/HelloChinese replacement.
- **Not a full HSK curriculum in v1.** HSK vocabulary alignment is useful, but v1 does not offer HSK-specific lesson tracks, mock exams, or certification preparation.
- **Not a dictionary replacement.** Chabiko links and explains vocabulary in context. It does not aim to replace Weblio, CC-CEDICT, or Pleco as a general-purpose dictionary.
- **Not speech-recognition-first.** Tone and pronunciation practice in v1 uses listening discrimination and recognition exercises, not speech input.
- **Not account / cloud-sync dependent.** v1 learning progress may persist in LocalStorage. Accounts, bookmarks, and cross-device sync are deferred.
- **Not Mainland-only Mandarin product.** Simplified-first paths exist for appropriate personas, but Taiwan travel — with Traditional-first, Taiwan-usage-first content — remains the differentiator. The product does not assume all learners target Mainland Mandarin.
- **Not Traditional-only after PR #21.** Dual-script support with path-based defaults is the baseline. No learner is forced into Traditional-only or Simplified-only content.
- **Not a classroom replacement.** Chabiko supplements classroom or self-study; it does not replace a teacher, tutor, or formal course for learners who need structured correction and speaking practice.
- **Not a media-comprehension tool.** Drama/ variety show / web novel vocabulary support is deferred until core content stabilizes and audio support is available.
- **Not AI-tutor-first.** v1 does not offer AI-generated explanations, AI conversation partners, or adaptive question generation. All learner-facing content is authored or verified before release.

---

## 6. Cross-References

### Source of truth alignment

| Document | Alignment |
|----------|-----------|
| `.planning/PROJECT.md` | Personas validate the "Target learner" and "Secondary use cases" sections; P1 directly maps to "Main use case: preparing for a Taiwan trip." |
| `.planning/REQUIREMENTS.md` | POS-01 is directly satisfied; PATH-01 (Taiwan travel as v1 differentiating path) reinforced. |
| `.planning/ROADMAP.md` | Phase 1 plan 01-02 ("Define Japanese learner personas and JTBD") scoped correctly. |
| `.planning/research/SUMMARY.md` | Personas ground the "Japanese Learner Alignment" section with specific jobs and priorities. |
| Phase 1 CONTEXT | D-05 (personas guide v1 scope before content schemas) and D-06 (Taiwan travel as differentiating spine) are confirmed. |
| `.planning/github-issues/INDEX.md` | No change needed — #13 already listed under Phase 1. |

### Cross-references to update

The following documents reference persona/JTBD work and should be checked for consistency:

- `.planning/ROADMAP.md` — Phase 1 success criterion #3 ("Japanese learner personas and jobs-to-be-done are prioritized for v1") is now defineable.
- `.planning/REQUIREMENTS.md` — POS-01 scope aligned; PATH-01 priority confirmed.
- `.planning/github-issues/INDEX.md` — No structural change needed; #13 remains correctly placed.

---

## 7. Persona Assumptions to Validate

The following assumptions should be validated through user research or early product signals. They are reasonable starting points but may shift as the team learns more.

| Assumption | Source Persona | Risk If Wrong |
|------------|----------------|---------------|
| Taiwan travel learners have a trip date within 3–12 months that creates urgency | P1 | Session length and retention hook weakens; Travel Quest framing may not motivate |
| 3–8 minute sessions are sufficient for beginners to make progress | P1, P4 | Content chunk size may be too small for meaningful learning |
| Japanese learners prefer explicit kanji bridge notes rather than finding it distracting | P1, P2, P3 | Kanji bridge feature could add noise if learners find it unhelpful or confusing |
| University Mandarin courses in Japan predominantly use Simplified Chinese and PRC-based curriculum | P2 | Script default for P2 path would need adjustment |
| Japanese self-directed HSK learners want Simplified-first, not Traditional | P3 | Script default for HSK path would need adjustment |
| Learners value readiness-by-scenario over completion streaks | P1, P4 | Motivation system redesign needed if learners prefer traditional progress metrics |

These assumptions will be revisited when user feedback is available after v1 launch.

---

## 8. Recommended Next Steps

| After closing #13 | Connected issue |
|---|---|
| Define Japanese-native learner pain-point taxonomy | #14 |
| Draft dual-script and Taiwan/Mainland variant strategy | #18 |
| Design goal-based learning paths | #17 |
| Build global Simplified / Traditional display toggle | #22 |
| Revisit persona assumptions after user feedback | Post-v1 |

---

*This document is a product planning artifact, not an implementation spec. It will be updated as personas are validated or invalidated through user feedback and product iteration.*
