# Taiwan Travel Wave 1 Human Review Packet

**Scope:** taiwan-travel-wave-1-v1
**Package state:** isolated candidate content; not linked to the production Taiwan path
**Reviewed items:** lessons:lesson:lesson-011 (data/content-pilots/taiwan-travel-wave-1/lessons.json), lessons:lesson:lesson-012 (data/content-pilots/taiwan-travel-wave-1/lessons.json), lessons:lesson:lesson-013 (data/content-pilots/taiwan-travel-wave-1/lessons.json), lessons:lesson:lesson-014 (data/content-pilots/taiwan-travel-wave-1/lessons.json), lessons:lesson:lesson-015 (data/content-pilots/taiwan-travel-wave-1/lessons.json), lessons:lesson:lesson-016 (data/content-pilots/taiwan-travel-wave-1/lessons.json), lessons:lesson:lesson-017 (data/content-pilots/taiwan-travel-wave-1/lessons.json), lessons:lesson:lesson-018 (data/content-pilots/taiwan-travel-wave-1/lessons.json), lessons:lesson:lesson-019 (data/content-pilots/taiwan-travel-wave-1/lessons.json), lessons:lesson:lesson-020 (data/content-pilots/taiwan-travel-wave-1/lessons.json), lessons:lesson:lesson-021 (data/content-pilots/taiwan-travel-wave-1/lessons.json), lessons:lesson:lesson-022 (data/content-pilots/taiwan-travel-wave-1/lessons.json), lessons:lesson:lesson-023 (data/content-pilots/taiwan-travel-wave-1/lessons.json), lessons:lesson:lesson-024 (data/content-pilots/taiwan-travel-wave-1/lessons.json)
**Review version:** 155002d704a438c6231c12249341c509f89a81a1b377147afe117483d7768274
**Overall review outcome:** {{accepted | rejected | needs-changes}}
**Current repository review state:** pending-human-review; no overall human decision is recorded; promotion is not allowed.
**Decision contract:** Canonical outcomes: accepted, rejected, needs-changes. Promotable: accepted. Non-promotable: rejected, needs-changes.
**Decision storage:** No decisions recorded; if a future compatible writer is added, accepted maps to accepted and needs-changes maps to needs_changes; rejected remains non-promotable and is never written as an accepted decision. This packet has a separate decision namespace and does not write to the production or issue-360 review campaigns.

## Coverage reconciliation

| Scenario | Required | Included |
|---|---:|---:|
| airport | 2 | 2 |
| transport | 2 | 2 |
| food | 3 | 3 |
| shopping | 2 | 2 |
| hotel | 2 | 2 |
| emergency | 2 | 2 |
| social | 1 | 1 |

## Approval Scope

Each required role records its own outcome independently. Replace each outcome with exactly `accepted`, `rejected`, `needs-changes`, or `not-reviewed`. The committed manifest starts with every role at `not-reviewed`; role outcomes do not set the separate overall decision or authorize promotion.

Every accepted, rejected, or needs-changes role outcome requires complete identity, valid ISO date, and findings evidence. A not-reviewed role must keep all evidence fields empty. Mixed outcomes in a multi-role dimension are retained and remain non-promotable; a global reviewer identity is not sufficient.

| Dimension | Reviewer role | Outcome | Reviewer identity | Review date | Findings |
|---|---|---|---|---|---|
| Natural Taiwan Mandarin | human-language-reviewer | not-reviewed | {{natural-taiwan-mandarin__human-language-reviewer__IDENTITY}} | {{natural-taiwan-mandarin__human-language-reviewer__YYYY-MM-DD}} | {{natural-taiwan-mandarin__human-language-reviewer__FINDINGS_OR_None.}} |
| Natural Taiwan Mandarin | human-regional-reviewer | not-reviewed | {{natural-taiwan-mandarin__human-regional-reviewer__IDENTITY}} | {{natural-taiwan-mandarin__human-regional-reviewer__YYYY-MM-DD}} | {{natural-taiwan-mandarin__human-regional-reviewer__FINDINGS_OR_None.}} |
| Natural Japanese explanation | human-language-reviewer | not-reviewed | {{natural-japanese-explanation__human-language-reviewer__IDENTITY}} | {{natural-japanese-explanation__human-language-reviewer__YYYY-MM-DD}} | {{natural-japanese-explanation__human-language-reviewer__FINDINGS_OR_None.}} |
| Review status assignment | human-language-reviewer | not-reviewed | {{review-status__human-language-reviewer__IDENTITY}} | {{review-status__human-language-reviewer__YYYY-MM-DD}} | {{review-status__human-language-reviewer__FINDINGS_OR_None.}} |
| Teaching accuracy and pain-point metadata | human-teaching-reviewer | not-reviewed | {{teaching-accuracy__human-teaching-reviewer__IDENTITY}} | {{teaching-accuracy__human-teaching-reviewer__YYYY-MM-DD}} | {{teaching-accuracy__human-teaching-reviewer__FINDINGS_OR_None.}} |
| Lesson loop and travel usefulness | human-teaching-reviewer | not-reviewed | {{lesson-loop-usefulness__human-teaching-reviewer__IDENTITY}} | {{lesson-loop-usefulness__human-teaching-reviewer__YYYY-MM-DD}} | {{lesson-loop-usefulness__human-teaching-reviewer__FINDINGS_OR_None.}} |
| Pinyin and pronunciation guidance | human-language-reviewer | not-reviewed | {{pronunciation-guidance__human-language-reviewer__IDENTITY}} | {{pronunciation-guidance__human-language-reviewer__YYYY-MM-DD}} | {{pronunciation-guidance__human-language-reviewer__FINDINGS_OR_None.}} |
| Pinyin and pronunciation guidance | human-teaching-reviewer | not-reviewed | {{pronunciation-guidance__human-teaching-reviewer__IDENTITY}} | {{pronunciation-guidance__human-teaching-reviewer__YYYY-MM-DD}} | {{pronunciation-guidance__human-teaching-reviewer__FINDINGS_OR_None.}} |
| Kanji bridge accuracy | human-teaching-reviewer | not-reviewed | {{kanji-bridge-accuracy__human-teaching-reviewer__IDENTITY}} | {{kanji-bridge-accuracy__human-teaching-reviewer__YYYY-MM-DD}} | {{kanji-bridge-accuracy__human-teaching-reviewer__FINDINGS_OR_None.}} |
| Review prompt quality | human-teaching-reviewer | not-reviewed | {{exercise-quality__human-teaching-reviewer__IDENTITY}} | {{exercise-quality__human-teaching-reviewer__YYYY-MM-DD}} | {{exercise-quality__human-teaching-reviewer__FINDINGS_OR_None.}} |
| Graph, identity, order, and scope correctness | maintainer | not-reviewed | {{graph-and-scope-correctness__maintainer__IDENTITY}} | {{graph-and-scope-correctness__maintainer__YYYY-MM-DD}} | {{graph-and-scope-correctness__maintainer__FINDINGS_OR_None.}} |
| Source and script provenance correctness | human-source-reviewer | not-reviewed | {{source-and-script-provenance__human-source-reviewer__IDENTITY}} | {{source-and-script-provenance__human-source-reviewer__YYYY-MM-DD}} | {{source-and-script-provenance__human-source-reviewer__FINDINGS_OR_None.}} |
| Source and script provenance correctness | human-script-verifier | not-reviewed | {{source-and-script-provenance__human-script-verifier__IDENTITY}} | {{source-and-script-provenance__human-script-verifier__YYYY-MM-DD}} | {{source-and-script-provenance__human-script-verifier__FINDINGS_OR_None.}} |

## Exact lesson versions

| Lesson | Scenario | Can-Do | reviewStatus | Fingerprint |
|---|---|---|---|---|
| lesson-011 | airport | 到着後、預けたスーツケースが壊れていることを空港の係員に伝え、確認を頼める | draft | 936583cc2f6a7629fbfabd807637deebcfc9ccb2b377e1e55ddef209f2b2c954 |
| lesson-012 | airport | 預けた荷物が受取場所に出てこない状況を係員に伝えられる | draft | ccbef93b9d3ff2dec0caadb545b1207fa675b11965eb1bcee383da35efe03bc7 |
| lesson-013 | transport | 乗る前に、その車両が自分の目的地へ行くか確認できる | draft | 2d6e0db576f8cf7f18fbe510c3ac0a87cba35d9baf16834aff3a3280989afce2 |
| lesson-014 | transport | 目的地へ向かう途中で、どこで乗り換えるか尋ねられる | draft | da6aa08773b80a87174d5731a07d1d4bc3ca13d20a2a3571cfd508268a1d3210 |
| lesson-015 | food | 飲食店で人数を伝え、その人数で利用できる席があるか尋ねられる | draft | 4e118949942ee45a8c4d1e3dd4825b62eabfb95c96a040f501775dc905679b94 |
| lesson-016 | food | 料理にピーナッツが入っているか、注文前に店員へ尋ねられる | draft | 57337f46f12e42ee7d1f27f741e83db719c90962ca46a32fde7153c3723fead7 |
| lesson-017 | food | 食べ切れなかった料理を持ち帰れるよう包んでもらえるか尋ねられる | draft | 2f84a3124406fcf94b67bd0755492a19546e68c468e0876bf2894a3a95a25bf9 |
| lesson-018 | shopping | 店で気になる服を指し、試着してよいか尋ねられる | draft | 278f9f42f12b70bbecc0d4751c475a69e212b95ae2f0676928237d917f48364f |
| lesson-019 | shopping | 支払い後、必要な領収書を店員に頼める | draft | 129497f519e3d8de45c9f31d1535a04d3b6fae6260dc1750cc75b1dc7330e9b9 |
| lesson-020 | hotel | チェックイン前やチェックアウト後に、ホテルで荷物を預けられるか尋ねられる | draft | b715140fb6b9a57fa1bd1cbe24d7211fbde7a6df3f7cfce81b9677a891c8d5fa |
| lesson-021 | hotel | ホテルの受付で、ルームキーが使えない状況を説明できる | draft | 9986ada4d7ede5ada6a20b54efeb3c866967fbe12664683ff53650dc40cfd0de |
| lesson-022 | emergency | 同行者とはぐれた状況を伝え、周囲の人に助けを求められる | draft | 2a0e06dd7ddb7102f56774144b6b665f2825a7f26bf1dde117fc25d44e9f7862 |
| lesson-023 | emergency | 緊急時に、周囲の人へ救急車を呼んでほしいと頼める | draft | 80b4259043045e17304092cd57853046dc3f7f98fd10ed35d4e438638498673b |
| lesson-024 | social | 初対面の相手に自分の名前と日本から来たことを簡単に伝えられる | draft | 792191b89d8c1bc992f6c77c1ded37ebb1af04404d199a946f4b6b52630ec2a1 |

## Human gate

- All 14 lessons remain `reviewStatus: "draft"`.
- Script provenance for the candidate examples remains `generated`.
- Technical validation does not constitute a human content decision.
- Rejected, needs-changes, and not-reviewed role outcomes remain non-promotable. Promotion requires a complete human artifact for the exact fingerprints above, every required role accepted with complete evidence, an independent overall accepted outcome, and a separate maintainer action.
- The human language, teaching, and regional review remain pending, as do source/provenance and script verification.

## Unresolved Issues

{{LIST_UNRESOLVED_ISSUES_OR_None.}}

## Blocked Content

{{LIST_BLOCKED_CONTENT_OR_None.}}
