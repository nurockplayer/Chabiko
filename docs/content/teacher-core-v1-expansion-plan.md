# Teacher Core V1 Expansion Plan

## Source

| Field | Value |
|---|---|
| Source file | `单词表(带图).xlsx` |
| SHA-256 | `3fad65934dd3801fedfbd9e110f2c5bb8730b36d4117ee7a228cbf0089383f37` |
| Importer | `scripts/import-teacher-vocabulary-xlsx.py` |
| Detected sheets | 名词1, 动词1, 形容词1, 副词, 名词2, 形容词2, 动词2 |
| Separator sheets | 難易度☆, 難易度☆☆ |
| Ignored columns per sheet | 造词/造句, 日文字, 备注, plus the sheet's POS label (e.g. 名词) |

## Inventory summary

| Metric | Count |
|---|---|
| Total candidate rows | 1,865 |
| Accepted | 20 |
| Rejected | 1,845 |
| Reconciliation | 20 + 1,845 = 1,865 ✓ |

### By difficulty

| Difficulty | Count |
|---|---|
| star-1 | 20 |
| star-2 | 0 |

### By part of speech

| POS | Count |
|---|---|
| noun | 20 |
| verb | 0 |
| adjective | 0 |
| adverb | 0 |

### Rejection breakdown by category

| Category | Count |
|---|---|
| `missing_pinyin` | 1254 |
| `missing_difficulty_check` | 549 |
| `missing_japanese` | 42 |

No formulas, duplicates, or ID collisions were detected.

### Rejection by sheet

| Sheet | Total | Breakdown |
|---|---|---|
| 名词1 | 489 | missing_difficulty_check=37, missing_japanese=41, missing_pinyin=411 |
| 动词1 | 162 | missing_difficulty_check=161, missing_japanese=1 |
| 形容词1 | 102 | missing_difficulty_check=102 |
| 副词 | 98 | missing_pinyin=98 |
| 名词2 | 477 | missing_pinyin=477 |
| 形容词2 | 111 | missing_difficulty_check=111 |
| 动词2 | 406 | missing_difficulty_check=138, missing_pinyin=268 |

## Batch-01 reconciliation

**Result: exact match.** The production `teacher-vocabulary-batch-01.json` (20 entries) is confirmed as the exact first 20 accepted rows in global importer order.

- IDs: identical sequence across all 20 positions
- Source sheets: all 名词1
- Source rows: 2, 3, 7, 8, 9, 10, 11, 14, 15, 16, 17, 18, 19, 20, 23, 26, 27, 28, 29, 30
- `exactAcceptedPrefix`: true

Existing batch-01 vocabulary IDs, illustration IDs, asset paths, ordering, and learning progress are preserved as-is — no renumbering or reprocessing.

## Remaining batches (batch-02+)

**No remaining accepted rows.** The workbook yielded exactly 20 accepted items, which are fully consumed by batch-01. Therefore no batch-02 or later batches are needed.

If additional rows become accepted after a future data revision, the same deterministic ordering and at-most-50-per-batch rules apply starting from batch-02.

## Rejected rows (1845 total)

| Sheet | Row | Reason |
|---|---|---|
| 名词1 | 4 | missing difficulty check: 名词1:4 |
| 名词1 | 5 | missing difficulty check: 名词1:5 |
| 名词1 | 6 | missing difficulty check: 名词1:6 |
| 名词1 | 12 | missing difficulty check: 名词1:12 |
| 名词1 | 13 | missing difficulty check: 名词1:13 |
| 名词1 | 21 | missing pinyin: 名词1:21 |
| 名词1 | 22 | missing pinyin: 名词1:22 |
| 名词1 | 24 | missing difficulty check: 名词1:24 |
| 名词1 | 25 | missing difficulty check: 名词1:25 |
| 名词1 | 31 | missing difficulty check: 名词1:31 |
| 名词1 | 32 | missing pinyin: 名词1:32 |
| 名词1 | 33 | missing difficulty check: 名词1:33 |
| 名词1 | 34 | missing difficulty check: 名词1:34 |
| 名词1 | 35 | missing difficulty check: 名词1:35 |
| 名词1 | 36 | missing difficulty check: 名词1:36 |
| 名词1 | 37 | missing difficulty check: 名词1:37 |
| 名词1 | 38 | missing difficulty check: 名词1:38 |
| 名词1 | 39 | missing difficulty check: 名词1:39 |
| 名词1 | 40 | missing difficulty check: 名词1:40 |
| 名词1 | 41 | missing difficulty check: 名词1:41 |
| 名词1 | 42 | missing difficulty check: 名词1:42 |
| 名词1 | 43 | missing difficulty check: 名词1:43 |
| 名词1 | 44 | missing difficulty check: 名词1:44 |
| 名词1 | 45 | missing difficulty check: 名词1:45 |
| 名词1 | 46 | missing difficulty check: 名词1:46 |
| 名词1 | 47 | missing difficulty check: 名词1:47 |
| 名词1 | 48 | missing difficulty check: 名词1:48 |
| 名词1 | 49 | missing difficulty check: 名词1:49 |
| 名词1 | 50 | missing difficulty check: 名词1:50 |
| 名词1 | 51 | missing difficulty check: 名词1:51 |
| 名词1 | 52 | missing difficulty check: 名词1:52 |
| 名词1 | 53 | missing difficulty check: 名词1:53 |
| 名词1 | 54 | missing difficulty check: 名词1:54 |
| 名词1 | 55 | missing difficulty check: 名词1:55 |
| 名词1 | 56 | missing difficulty check: 名词1:56 |
| 名词1 | 57 | missing difficulty check: 名词1:57 |
| 名词1 | 58 | missing difficulty check: 名词1:58 |
| 名词1 | 59 | missing difficulty check: 名词1:59 |
| 名词1 | 60 | missing difficulty check: 名词1:60 |
| 名词1 | 61 | missing difficulty check: 名词1:61 |
| 名词1 | 62 | missing japanese: 名词1:62 |
| 名词1 | 63 | missing japanese: 名词1:63 |
| 名词1 | 64 | missing japanese: 名词1:64 |
| 名词1 | 65 | missing pinyin: 名词1:65 |
| 名词1 | 66 | missing pinyin: 名词1:66 |
| 名词1 | 67 | missing pinyin: 名词1:67 |
| 名词1 | 68 | missing japanese: 名词1:68 |
| 名词1 | 69 | missing pinyin: 名词1:69 |
| 名词1 | 70 | missing pinyin: 名词1:70 |
| 名词1 | 71 | missing japanese: 名词1:71 |
| 名词1 | 72 | missing japanese: 名词1:72 |
| 名词1 | 73 | missing japanese: 名词1:73 |
| 名词1 | 74 | missing japanese: 名词1:74 |
| 名词1 | 75 | missing pinyin: 名词1:75 |
| 名词1 | 76 | missing pinyin: 名词1:76 |
| 名词1 | 77 | missing japanese: 名词1:77 |
| 名词1 | 78 | missing japanese: 名词1:78 |
| 名词1 | 79 | missing pinyin: 名词1:79 |
| 名词1 | 80 | missing pinyin: 名词1:80 |
| 名词1 | 81 | missing pinyin: 名词1:81 |
| 名词1 | 82 | missing pinyin: 名词1:82 |
| 名词1 | 83 | missing pinyin: 名词1:83 |
| 名词1 | 84 | missing japanese: 名词1:84 |
| 名词1 | 85 | missing pinyin: 名词1:85 |
| 名词1 | 86 | missing japanese: 名词1:86 |
| 名词1 | 87 | missing pinyin: 名词1:87 |
| 名词1 | 88 | missing pinyin: 名词1:88 |
| 名词1 | 89 | missing japanese: 名词1:89 |
| 名词1 | 90 | missing japanese: 名词1:90 |
| 名词1 | 91 | missing pinyin: 名词1:91 |
| 名词1 | 92 | missing japanese: 名词1:92 |
| 名词1 | 93 | missing pinyin: 名词1:93 |
| 名词1 | 94 | missing japanese: 名词1:94 |
| 名词1 | 95 | missing japanese: 名词1:95 |
| 名词1 | 96 | missing pinyin: 名词1:96 |
| 名词1 | 97 | missing pinyin: 名词1:97 |
| 名词1 | 98 | missing pinyin: 名词1:98 |
| 名词1 | 99 | missing pinyin: 名词1:99 |
| 名词1 | 100 | missing pinyin: 名词1:100 |
| 名词1 | 101 | missing pinyin: 名词1:101 |
| 名词1 | 102 | missing pinyin: 名词1:102 |
| 名词1 | 103 | missing pinyin: 名词1:103 |
| 名词1 | 104 | missing pinyin: 名词1:104 |
| 名词1 | 105 | missing japanese: 名词1:105 |
| 名词1 | 106 | missing japanese: 名词1:106 |
| 名词1 | 107 | missing pinyin: 名词1:107 |
| 名词1 | 108 | missing pinyin: 名词1:108 |
| 名词1 | 109 | missing pinyin: 名词1:109 |
| 名词1 | 110 | missing pinyin: 名词1:110 |
| 名词1 | 111 | missing pinyin: 名词1:111 |
| 名词1 | 112 | missing pinyin: 名词1:112 |
| 名词1 | 113 | missing japanese: 名词1:113 |
| 名词1 | 114 | missing pinyin: 名词1:114 |
| 名词1 | 115 | missing japanese: 名词1:115 |
| 名词1 | 116 | missing pinyin: 名词1:116 |
| 名词1 | 117 | missing pinyin: 名词1:117 |
| 名词1 | 118 | missing pinyin: 名词1:118 |
| 名词1 | 119 | missing pinyin: 名词1:119 |
| 名词1 | 120 | missing japanese: 名词1:120 |
| 名词1 | 121 | missing pinyin: 名词1:121 |
| 名词1 | 122 | missing pinyin: 名词1:122 |
| 名词1 | 123 | missing pinyin: 名词1:123 |
| 名词1 | 124 | missing pinyin: 名词1:124 |
| 名词1 | 125 | missing pinyin: 名词1:125 |
| 名词1 | 126 | missing japanese: 名词1:126 |
| 名词1 | 127 | missing pinyin: 名词1:127 |
| 名词1 | 128 | missing japanese: 名词1:128 |
| 名词1 | 129 | missing pinyin: 名词1:129 |
| 名词1 | 130 | missing pinyin: 名词1:130 |
| 名词1 | 131 | missing pinyin: 名词1:131 |
| 名词1 | 132 | missing pinyin: 名词1:132 |
| 名词1 | 133 | missing pinyin: 名词1:133 |
| 名词1 | 134 | missing japanese: 名词1:134 |
| 名词1 | 135 | missing japanese: 名词1:135 |
| 名词1 | 136 | missing japanese: 名词1:136 |
| 名词1 | 137 | missing japanese: 名词1:137 |
| 名词1 | 138 | missing japanese: 名词1:138 |
| 名词1 | 139 | missing japanese: 名词1:139 |
| 名词1 | 140 | missing japanese: 名词1:140 |
| 名词1 | 141 | missing japanese: 名词1:141 |
| 名词1 | 142 | missing japanese: 名词1:142 |
| 名词1 | 143 | missing japanese: 名词1:143 |
| 名词1 | 144 | missing japanese: 名词1:144 |
| 名词1 | 145 | missing japanese: 名词1:145 |
| 名词1 | 146 | missing japanese: 名词1:146 |
| 名词1 | 147 | missing pinyin: 名词1:147 |
| 名词1 | 148 | missing pinyin: 名词1:148 |
| 名词1 | 149 | missing pinyin: 名词1:149 |
| 名词1 | 150 | missing pinyin: 名词1:150 |
| 名词1 | 151 | missing japanese: 名词1:151 |
| 名词1 | 152 | missing pinyin: 名词1:152 |
| 名词1 | 153 | missing japanese: 名词1:153 |
| 名词1 | 154 | missing japanese: 名词1:154 |
| 名词1 | 155 | missing pinyin: 名词1:155 |
| 名词1 | 156 | missing japanese: 名词1:156 |
| 名词1 | 157 | missing pinyin: 名词1:157 |
| 名词1 | 158 | missing pinyin: 名词1:158 |
| 名词1 | 159 | missing pinyin: 名词1:159 |
| 名词1 | 160 | missing pinyin: 名词1:160 |
| 名词1 | 161 | missing pinyin: 名词1:161 |
| 名词1 | 162 | missing pinyin: 名词1:162 |
| 名词1 | 163 | missing pinyin: 名词1:163 |
| 名词1 | 164 | missing pinyin: 名词1:164 |
| 名词1 | 165 | missing pinyin: 名词1:165 |
| 名词1 | 166 | missing pinyin: 名词1:166 |
| 名词1 | 167 | missing pinyin: 名词1:167 |
| 名词1 | 168 | missing pinyin: 名词1:168 |
| 名词1 | 169 | missing pinyin: 名词1:169 |
| 名词1 | 170 | missing pinyin: 名词1:170 |
| 名词1 | 171 | missing pinyin: 名词1:171 |
| 名词1 | 172 | missing pinyin: 名词1:172 |
| 名词1 | 173 | missing pinyin: 名词1:173 |
| 名词1 | 174 | missing pinyin: 名词1:174 |
| 名词1 | 175 | missing pinyin: 名词1:175 |
| 名词1 | 176 | missing pinyin: 名词1:176 |
| 名词1 | 177 | missing pinyin: 名词1:177 |
| 名词1 | 178 | missing pinyin: 名词1:178 |
| 名词1 | 179 | missing pinyin: 名词1:179 |
| 名词1 | 180 | missing pinyin: 名词1:180 |
| 名词1 | 181 | missing pinyin: 名词1:181 |
| 名词1 | 182 | missing pinyin: 名词1:182 |
| 名词1 | 183 | missing pinyin: 名词1:183 |
| 名词1 | 184 | missing pinyin: 名词1:184 |
| 名词1 | 185 | missing pinyin: 名词1:185 |
| 名词1 | 186 | missing pinyin: 名词1:186 |
| 名词1 | 187 | missing pinyin: 名词1:187 |
| 名词1 | 188 | missing pinyin: 名词1:188 |
| 名词1 | 189 | missing pinyin: 名词1:189 |
| 名词1 | 190 | missing pinyin: 名词1:190 |
| 名词1 | 191 | missing pinyin: 名词1:191 |
| 名词1 | 192 | missing pinyin: 名词1:192 |
| 名词1 | 193 | missing pinyin: 名词1:193 |
| 名词1 | 194 | missing pinyin: 名词1:194 |
| 名词1 | 195 | missing pinyin: 名词1:195 |
| 名词1 | 196 | missing pinyin: 名词1:196 |
| 名词1 | 197 | missing pinyin: 名词1:197 |
| 名词1 | 198 | missing pinyin: 名词1:198 |
| 名词1 | 199 | missing pinyin: 名词1:199 |
| 名词1 | 200 | missing pinyin: 名词1:200 |
| 名词1 | 201 | missing pinyin: 名词1:201 |
| 名词1 | 202 | missing pinyin: 名词1:202 |
| 名词1 | 203 | missing pinyin: 名词1:203 |
| 名词1 | 204 | missing pinyin: 名词1:204 |
| 名词1 | 205 | missing pinyin: 名词1:205 |
| 名词1 | 206 | missing pinyin: 名词1:206 |
| 名词1 | 207 | missing pinyin: 名词1:207 |
| 名词1 | 208 | missing pinyin: 名词1:208 |
| 名词1 | 209 | missing pinyin: 名词1:209 |
| 名词1 | 210 | missing pinyin: 名词1:210 |
| 名词1 | 211 | missing pinyin: 名词1:211 |
| 名词1 | 212 | missing pinyin: 名词1:212 |
| 名词1 | 213 | missing pinyin: 名词1:213 |
| 名词1 | 214 | missing pinyin: 名词1:214 |
| 名词1 | 215 | missing pinyin: 名词1:215 |
| 名词1 | 216 | missing pinyin: 名词1:216 |
| 名词1 | 217 | missing pinyin: 名词1:217 |
| 名词1 | 218 | missing pinyin: 名词1:218 |
| 名词1 | 219 | missing pinyin: 名词1:219 |
| 名词1 | 220 | missing pinyin: 名词1:220 |
| 名词1 | 221 | missing pinyin: 名词1:221 |
| 名词1 | 222 | missing pinyin: 名词1:222 |
| 名词1 | 223 | missing pinyin: 名词1:223 |
| 名词1 | 224 | missing pinyin: 名词1:224 |
| 名词1 | 225 | missing pinyin: 名词1:225 |
| 名词1 | 226 | missing pinyin: 名词1:226 |
| 名词1 | 227 | missing pinyin: 名词1:227 |
| 名词1 | 228 | missing pinyin: 名词1:228 |
| 名词1 | 229 | missing pinyin: 名词1:229 |
| 名词1 | 230 | missing pinyin: 名词1:230 |
| 名词1 | 231 | missing pinyin: 名词1:231 |
| 名词1 | 232 | missing pinyin: 名词1:232 |
| 名词1 | 233 | missing pinyin: 名词1:233 |
| 名词1 | 234 | missing pinyin: 名词1:234 |
| 名词1 | 235 | missing pinyin: 名词1:235 |
| 名词1 | 236 | missing pinyin: 名词1:236 |
| 名词1 | 237 | missing pinyin: 名词1:237 |
| 名词1 | 238 | missing pinyin: 名词1:238 |
| 名词1 | 239 | missing pinyin: 名词1:239 |
| 名词1 | 240 | missing pinyin: 名词1:240 |
| 名词1 | 241 | missing pinyin: 名词1:241 |
| 名词1 | 242 | missing pinyin: 名词1:242 |
| 名词1 | 243 | missing pinyin: 名词1:243 |
| 名词1 | 244 | missing pinyin: 名词1:244 |
| 名词1 | 245 | missing pinyin: 名词1:245 |
| 名词1 | 246 | missing pinyin: 名词1:246 |
| 名词1 | 247 | missing pinyin: 名词1:247 |
| 名词1 | 248 | missing pinyin: 名词1:248 |
| 名词1 | 249 | missing pinyin: 名词1:249 |
| 名词1 | 250 | missing pinyin: 名词1:250 |
| 名词1 | 251 | missing pinyin: 名词1:251 |
| 名词1 | 252 | missing pinyin: 名词1:252 |
| 名词1 | 253 | missing pinyin: 名词1:253 |
| 名词1 | 254 | missing pinyin: 名词1:254 |
| 名词1 | 255 | missing pinyin: 名词1:255 |
| 名词1 | 256 | missing pinyin: 名词1:256 |
| 名词1 | 257 | missing pinyin: 名词1:257 |
| 名词1 | 258 | missing pinyin: 名词1:258 |
| 名词1 | 259 | missing pinyin: 名词1:259 |
| 名词1 | 260 | missing pinyin: 名词1:260 |
| 名词1 | 261 | missing pinyin: 名词1:261 |
| 名词1 | 262 | missing pinyin: 名词1:262 |
| 名词1 | 263 | missing pinyin: 名词1:263 |
| 名词1 | 264 | missing pinyin: 名词1:264 |
| 名词1 | 265 | missing pinyin: 名词1:265 |
| 名词1 | 266 | missing pinyin: 名词1:266 |
| 名词1 | 267 | missing pinyin: 名词1:267 |
| 名词1 | 268 | missing pinyin: 名词1:268 |
| 名词1 | 269 | missing pinyin: 名词1:269 |
| 名词1 | 270 | missing pinyin: 名词1:270 |
| 名词1 | 271 | missing pinyin: 名词1:271 |
| 名词1 | 272 | missing pinyin: 名词1:272 |
| 名词1 | 273 | missing pinyin: 名词1:273 |
| 名词1 | 274 | missing pinyin: 名词1:274 |
| 名词1 | 275 | missing pinyin: 名词1:275 |
| 名词1 | 276 | missing pinyin: 名词1:276 |
| 名词1 | 277 | missing pinyin: 名词1:277 |
| 名词1 | 278 | missing pinyin: 名词1:278 |
| 名词1 | 279 | missing pinyin: 名词1:279 |
| 名词1 | 280 | missing pinyin: 名词1:280 |
| 名词1 | 281 | missing pinyin: 名词1:281 |
| 名词1 | 282 | missing pinyin: 名词1:282 |
| 名词1 | 283 | missing pinyin: 名词1:283 |
| 名词1 | 284 | missing pinyin: 名词1:284 |
| 名词1 | 285 | missing pinyin: 名词1:285 |
| 名词1 | 286 | missing pinyin: 名词1:286 |
| 名词1 | 287 | missing pinyin: 名词1:287 |
| 名词1 | 288 | missing pinyin: 名词1:288 |
| 名词1 | 289 | missing pinyin: 名词1:289 |
| 名词1 | 290 | missing pinyin: 名词1:290 |
| 名词1 | 291 | missing pinyin: 名词1:291 |
| 名词1 | 292 | missing pinyin: 名词1:292 |
| 名词1 | 293 | missing pinyin: 名词1:293 |
| 名词1 | 294 | missing pinyin: 名词1:294 |
| 名词1 | 295 | missing pinyin: 名词1:295 |
| 名词1 | 296 | missing pinyin: 名词1:296 |
| 名词1 | 297 | missing pinyin: 名词1:297 |
| 名词1 | 298 | missing pinyin: 名词1:298 |
| 名词1 | 299 | missing pinyin: 名词1:299 |
| 名词1 | 300 | missing pinyin: 名词1:300 |
| 名词1 | 301 | missing pinyin: 名词1:301 |
| 名词1 | 302 | missing pinyin: 名词1:302 |
| 名词1 | 303 | missing pinyin: 名词1:303 |
| 名词1 | 304 | missing pinyin: 名词1:304 |
| 名词1 | 305 | missing pinyin: 名词1:305 |
| 名词1 | 306 | missing pinyin: 名词1:306 |
| 名词1 | 307 | missing pinyin: 名词1:307 |
| 名词1 | 308 | missing pinyin: 名词1:308 |
| 名词1 | 309 | missing pinyin: 名词1:309 |
| 名词1 | 310 | missing pinyin: 名词1:310 |
| 名词1 | 311 | missing pinyin: 名词1:311 |
| 名词1 | 312 | missing pinyin: 名词1:312 |
| 名词1 | 313 | missing pinyin: 名词1:313 |
| 名词1 | 314 | missing pinyin: 名词1:314 |
| 名词1 | 315 | missing pinyin: 名词1:315 |
| 名词1 | 316 | missing pinyin: 名词1:316 |
| 名词1 | 317 | missing pinyin: 名词1:317 |
| 名词1 | 318 | missing pinyin: 名词1:318 |
| 名词1 | 319 | missing pinyin: 名词1:319 |
| 名词1 | 320 | missing pinyin: 名词1:320 |
| 名词1 | 321 | missing pinyin: 名词1:321 |
| 名词1 | 322 | missing pinyin: 名词1:322 |
| 名词1 | 323 | missing pinyin: 名词1:323 |
| 名词1 | 324 | missing pinyin: 名词1:324 |
| 名词1 | 325 | missing pinyin: 名词1:325 |
| 名词1 | 326 | missing pinyin: 名词1:326 |
| 名词1 | 327 | missing pinyin: 名词1:327 |
| 名词1 | 328 | missing pinyin: 名词1:328 |
| 名词1 | 329 | missing pinyin: 名词1:329 |
| 名词1 | 330 | missing pinyin: 名词1:330 |
| 名词1 | 331 | missing pinyin: 名词1:331 |
| 名词1 | 332 | missing pinyin: 名词1:332 |
| 名词1 | 333 | missing pinyin: 名词1:333 |
| 名词1 | 334 | missing pinyin: 名词1:334 |
| 名词1 | 335 | missing pinyin: 名词1:335 |
| 名词1 | 336 | missing pinyin: 名词1:336 |
| 名词1 | 337 | missing pinyin: 名词1:337 |
| 名词1 | 338 | missing pinyin: 名词1:338 |
| 名词1 | 339 | missing pinyin: 名词1:339 |
| 名词1 | 340 | missing pinyin: 名词1:340 |
| 名词1 | 341 | missing pinyin: 名词1:341 |
| 名词1 | 342 | missing pinyin: 名词1:342 |
| 名词1 | 343 | missing pinyin: 名词1:343 |
| 名词1 | 344 | missing pinyin: 名词1:344 |
| 名词1 | 345 | missing pinyin: 名词1:345 |
| 名词1 | 346 | missing pinyin: 名词1:346 |
| 名词1 | 347 | missing pinyin: 名词1:347 |
| 名词1 | 348 | missing pinyin: 名词1:348 |
| 名词1 | 349 | missing pinyin: 名词1:349 |
| 名词1 | 350 | missing pinyin: 名词1:350 |
| 名词1 | 351 | missing pinyin: 名词1:351 |
| 名词1 | 352 | missing pinyin: 名词1:352 |
| 名词1 | 353 | missing pinyin: 名词1:353 |
| 名词1 | 354 | missing pinyin: 名词1:354 |
| 名词1 | 355 | missing pinyin: 名词1:355 |
| 名词1 | 356 | missing pinyin: 名词1:356 |
| 名词1 | 357 | missing pinyin: 名词1:357 |
| 名词1 | 358 | missing pinyin: 名词1:358 |
| 名词1 | 359 | missing pinyin: 名词1:359 |
| 名词1 | 360 | missing pinyin: 名词1:360 |
| 名词1 | 361 | missing pinyin: 名词1:361 |
| 名词1 | 362 | missing pinyin: 名词1:362 |
| 名词1 | 363 | missing pinyin: 名词1:363 |
| 名词1 | 364 | missing pinyin: 名词1:364 |
| 名词1 | 365 | missing pinyin: 名词1:365 |
| 名词1 | 366 | missing pinyin: 名词1:366 |
| 名词1 | 367 | missing pinyin: 名词1:367 |
| 名词1 | 368 | missing pinyin: 名词1:368 |
| 名词1 | 369 | missing pinyin: 名词1:369 |
| 名词1 | 370 | missing pinyin: 名词1:370 |
| 名词1 | 371 | missing pinyin: 名词1:371 |
| 名词1 | 372 | missing pinyin: 名词1:372 |
| 名词1 | 373 | missing pinyin: 名词1:373 |
| 名词1 | 374 | missing pinyin: 名词1:374 |
| 名词1 | 375 | missing pinyin: 名词1:375 |
| 名词1 | 376 | missing pinyin: 名词1:376 |
| 名词1 | 377 | missing pinyin: 名词1:377 |
| 名词1 | 378 | missing pinyin: 名词1:378 |
| 名词1 | 379 | missing pinyin: 名词1:379 |
| 名词1 | 380 | missing pinyin: 名词1:380 |
| 名词1 | 381 | missing pinyin: 名词1:381 |
| 名词1 | 382 | missing pinyin: 名词1:382 |
| 名词1 | 383 | missing pinyin: 名词1:383 |
| 名词1 | 384 | missing pinyin: 名词1:384 |
| 名词1 | 385 | missing pinyin: 名词1:385 |
| 名词1 | 386 | missing pinyin: 名词1:386 |
| 名词1 | 387 | missing pinyin: 名词1:387 |
| 名词1 | 388 | missing pinyin: 名词1:388 |
| 名词1 | 389 | missing pinyin: 名词1:389 |
| 名词1 | 390 | missing pinyin: 名词1:390 |
| 名词1 | 391 | missing pinyin: 名词1:391 |
| 名词1 | 392 | missing pinyin: 名词1:392 |
| 名词1 | 393 | missing pinyin: 名词1:393 |
| 名词1 | 394 | missing pinyin: 名词1:394 |
| 名词1 | 395 | missing pinyin: 名词1:395 |
| 名词1 | 396 | missing pinyin: 名词1:396 |
| 名词1 | 397 | missing pinyin: 名词1:397 |
| 名词1 | 398 | missing pinyin: 名词1:398 |
| 名词1 | 399 | missing pinyin: 名词1:399 |
| 名词1 | 400 | missing pinyin: 名词1:400 |
| 名词1 | 401 | missing pinyin: 名词1:401 |
| 名词1 | 402 | missing pinyin: 名词1:402 |
| 名词1 | 403 | missing pinyin: 名词1:403 |
| 名词1 | 404 | missing pinyin: 名词1:404 |
| 名词1 | 405 | missing pinyin: 名词1:405 |
| 名词1 | 406 | missing pinyin: 名词1:406 |
| 名词1 | 407 | missing pinyin: 名词1:407 |
| 名词1 | 408 | missing pinyin: 名词1:408 |
| 名词1 | 409 | missing pinyin: 名词1:409 |
| 名词1 | 410 | missing pinyin: 名词1:410 |
| 名词1 | 411 | missing pinyin: 名词1:411 |
| 名词1 | 412 | missing pinyin: 名词1:412 |
| 名词1 | 413 | missing pinyin: 名词1:413 |
| 名词1 | 414 | missing pinyin: 名词1:414 |
| 名词1 | 415 | missing pinyin: 名词1:415 |
| 名词1 | 416 | missing pinyin: 名词1:416 |
| 名词1 | 417 | missing pinyin: 名词1:417 |
| 名词1 | 418 | missing pinyin: 名词1:418 |
| 名词1 | 419 | missing pinyin: 名词1:419 |
| 名词1 | 420 | missing pinyin: 名词1:420 |
| 名词1 | 421 | missing pinyin: 名词1:421 |
| 名词1 | 422 | missing pinyin: 名词1:422 |
| 名词1 | 423 | missing pinyin: 名词1:423 |
| 名词1 | 424 | missing pinyin: 名词1:424 |
| 名词1 | 425 | missing pinyin: 名词1:425 |
| 名词1 | 426 | missing pinyin: 名词1:426 |
| 名词1 | 427 | missing pinyin: 名词1:427 |
| 名词1 | 428 | missing pinyin: 名词1:428 |
| 名词1 | 429 | missing pinyin: 名词1:429 |
| 名词1 | 430 | missing pinyin: 名词1:430 |
| 名词1 | 431 | missing pinyin: 名词1:431 |
| 名词1 | 432 | missing pinyin: 名词1:432 |
| 名词1 | 433 | missing pinyin: 名词1:433 |
| 名词1 | 434 | missing pinyin: 名词1:434 |
| 名词1 | 435 | missing pinyin: 名词1:435 |
| 名词1 | 436 | missing pinyin: 名词1:436 |
| 名词1 | 437 | missing pinyin: 名词1:437 |
| 名词1 | 438 | missing pinyin: 名词1:438 |
| 名词1 | 439 | missing pinyin: 名词1:439 |
| 名词1 | 440 | missing pinyin: 名词1:440 |
| 名词1 | 441 | missing pinyin: 名词1:441 |
| 名词1 | 442 | missing pinyin: 名词1:442 |
| 名词1 | 443 | missing pinyin: 名词1:443 |
| 名词1 | 444 | missing pinyin: 名词1:444 |
| 名词1 | 445 | missing pinyin: 名词1:445 |
| 名词1 | 446 | missing pinyin: 名词1:446 |
| 名词1 | 447 | missing pinyin: 名词1:447 |
| 名词1 | 448 | missing pinyin: 名词1:448 |
| 名词1 | 449 | missing pinyin: 名词1:449 |
| 名词1 | 450 | missing pinyin: 名词1:450 |
| 名词1 | 451 | missing pinyin: 名词1:451 |
| 名词1 | 452 | missing pinyin: 名词1:452 |
| 名词1 | 453 | missing pinyin: 名词1:453 |
| 名词1 | 454 | missing pinyin: 名词1:454 |
| 名词1 | 455 | missing pinyin: 名词1:455 |
| 名词1 | 456 | missing pinyin: 名词1:456 |
| 名词1 | 457 | missing pinyin: 名词1:457 |
| 名词1 | 458 | missing pinyin: 名词1:458 |
| 名词1 | 459 | missing pinyin: 名词1:459 |
| 名词1 | 460 | missing pinyin: 名词1:460 |
| 名词1 | 461 | missing pinyin: 名词1:461 |
| 名词1 | 462 | missing pinyin: 名词1:462 |
| 名词1 | 463 | missing pinyin: 名词1:463 |
| 名词1 | 464 | missing pinyin: 名词1:464 |
| 名词1 | 465 | missing pinyin: 名词1:465 |
| 名词1 | 466 | missing pinyin: 名词1:466 |
| 名词1 | 467 | missing pinyin: 名词1:467 |
| 名词1 | 468 | missing pinyin: 名词1:468 |
| 名词1 | 469 | missing pinyin: 名词1:469 |
| 名词1 | 470 | missing pinyin: 名词1:470 |
| 名词1 | 471 | missing pinyin: 名词1:471 |
| 名词1 | 472 | missing pinyin: 名词1:472 |
| 名词1 | 473 | missing pinyin: 名词1:473 |
| 名词1 | 474 | missing pinyin: 名词1:474 |
| 名词1 | 475 | missing pinyin: 名词1:475 |
| 名词1 | 476 | missing pinyin: 名词1:476 |
| 名词1 | 477 | missing pinyin: 名词1:477 |
| 名词1 | 478 | missing pinyin: 名词1:478 |
| 名词1 | 479 | missing pinyin: 名词1:479 |
| 名词1 | 480 | missing pinyin: 名词1:480 |
| 名词1 | 481 | missing pinyin: 名词1:481 |
| 名词1 | 482 | missing pinyin: 名词1:482 |
| 名词1 | 483 | missing pinyin: 名词1:483 |
| 名词1 | 484 | missing pinyin: 名词1:484 |
| 名词1 | 485 | missing pinyin: 名词1:485 |
| 名词1 | 486 | missing pinyin: 名词1:486 |
| 名词1 | 487 | missing pinyin: 名词1:487 |
| 名词1 | 488 | missing pinyin: 名词1:488 |
| 名词1 | 489 | missing pinyin: 名词1:489 |
| 名词1 | 490 | missing pinyin: 名词1:490 |
| 名词1 | 491 | missing pinyin: 名词1:491 |
| 名词1 | 492 | missing pinyin: 名词1:492 |
| 名词1 | 493 | missing pinyin: 名词1:493 |
| 名词1 | 494 | missing pinyin: 名词1:494 |
| 名词1 | 495 | missing pinyin: 名词1:495 |
| 名词1 | 500 | missing pinyin: 名词1:500 |
| 名词1 | 501 | missing pinyin: 名词1:501 |
| 名词1 | 502 | missing pinyin: 名词1:502 |
| 名词1 | 503 | missing pinyin: 名词1:503 |
| 名词1 | 504 | missing pinyin: 名词1:504 |
| 名词1 | 505 | missing pinyin: 名词1:505 |
| 名词1 | 506 | missing pinyin: 名词1:506 |
| 名词1 | 507 | missing pinyin: 名词1:507 |
| 名词1 | 508 | missing pinyin: 名词1:508 |
| 名词1 | 509 | missing pinyin: 名词1:509 |
| 名词1 | 510 | missing pinyin: 名词1:510 |
| 名词1 | 511 | missing pinyin: 名词1:511 |
| 名词1 | 512 | missing pinyin: 名词1:512 |
| 名词1 | 513 | missing pinyin: 名词1:513 |
| 名词1 | 514 | missing pinyin: 名词1:514 |
| 动词1 | 2 | missing difficulty check: 动词1:2 |
| 动词1 | 3 | missing difficulty check: 动词1:3 |
| 动词1 | 4 | missing difficulty check: 动词1:4 |
| 动词1 | 5 | missing difficulty check: 动词1:5 |
| 动词1 | 6 | missing difficulty check: 动词1:6 |
| 动词1 | 7 | missing difficulty check: 动词1:7 |
| 动词1 | 8 | missing difficulty check: 动词1:8 |
| 动词1 | 9 | missing difficulty check: 动词1:9 |
| 动词1 | 10 | missing difficulty check: 动词1:10 |
| 动词1 | 11 | missing difficulty check: 动词1:11 |
| 动词1 | 12 | missing difficulty check: 动词1:12 |
| 动词1 | 13 | missing difficulty check: 动词1:13 |
| 动词1 | 14 | missing difficulty check: 动词1:14 |
| 动词1 | 15 | missing difficulty check: 动词1:15 |
| 动词1 | 16 | missing difficulty check: 动词1:16 |
| 动词1 | 17 | missing difficulty check: 动词1:17 |
| 动词1 | 18 | missing difficulty check: 动词1:18 |
| 动词1 | 19 | missing difficulty check: 动词1:19 |
| 动词1 | 20 | missing difficulty check: 动词1:20 |
| 动词1 | 21 | missing difficulty check: 动词1:21 |
| 动词1 | 22 | missing difficulty check: 动词1:22 |
| 动词1 | 23 | missing difficulty check: 动词1:23 |
| 动词1 | 24 | missing difficulty check: 动词1:24 |
| 动词1 | 25 | missing difficulty check: 动词1:25 |
| 动词1 | 26 | missing difficulty check: 动词1:26 |
| 动词1 | 27 | missing difficulty check: 动词1:27 |
| 动词1 | 28 | missing difficulty check: 动词1:28 |
| 动词1 | 29 | missing difficulty check: 动词1:29 |
| 动词1 | 30 | missing difficulty check: 动词1:30 |
| 动词1 | 31 | missing difficulty check: 动词1:31 |
| 动词1 | 32 | missing difficulty check: 动词1:32 |
| 动词1 | 33 | missing difficulty check: 动词1:33 |
| 动词1 | 34 | missing difficulty check: 动词1:34 |
| 动词1 | 35 | missing difficulty check: 动词1:35 |
| 动词1 | 36 | missing difficulty check: 动词1:36 |
| 动词1 | 37 | missing difficulty check: 动词1:37 |
| 动词1 | 38 | missing difficulty check: 动词1:38 |
| 动词1 | 39 | missing difficulty check: 动词1:39 |
| 动词1 | 40 | missing difficulty check: 动词1:40 |
| 动词1 | 41 | missing difficulty check: 动词1:41 |
| 动词1 | 42 | missing difficulty check: 动词1:42 |
| 动词1 | 43 | missing difficulty check: 动词1:43 |
| 动词1 | 44 | missing difficulty check: 动词1:44 |
| 动词1 | 45 | missing difficulty check: 动词1:45 |
| 动词1 | 46 | missing difficulty check: 动词1:46 |
| 动词1 | 47 | missing difficulty check: 动词1:47 |
| 动词1 | 48 | missing difficulty check: 动词1:48 |
| 动词1 | 49 | missing difficulty check: 动词1:49 |
| 动词1 | 50 | missing difficulty check: 动词1:50 |
| 动词1 | 51 | missing difficulty check: 动词1:51 |
| 动词1 | 52 | missing difficulty check: 动词1:52 |
| 动词1 | 53 | missing difficulty check: 动词1:53 |
| 动词1 | 54 | missing difficulty check: 动词1:54 |
| 动词1 | 55 | missing difficulty check: 动词1:55 |
| 动词1 | 56 | missing japanese: 动词1:56 |
| 动词1 | 57 | missing difficulty check: 动词1:57 |
| 动词1 | 58 | missing difficulty check: 动词1:58 |
| 动词1 | 59 | missing difficulty check: 动词1:59 |
| 动词1 | 60 | missing difficulty check: 动词1:60 |
| 动词1 | 61 | missing difficulty check: 动词1:61 |
| 动词1 | 62 | missing difficulty check: 动词1:62 |
| 动词1 | 63 | missing difficulty check: 动词1:63 |
| 动词1 | 64 | missing difficulty check: 动词1:64 |
| 动词1 | 65 | missing difficulty check: 动词1:65 |
| 动词1 | 66 | missing difficulty check: 动词1:66 |
| 动词1 | 67 | missing difficulty check: 动词1:67 |
| 动词1 | 68 | missing difficulty check: 动词1:68 |
| 动词1 | 69 | missing difficulty check: 动词1:69 |
| 动词1 | 70 | missing difficulty check: 动词1:70 |
| 动词1 | 71 | missing difficulty check: 动词1:71 |
| 动词1 | 72 | missing difficulty check: 动词1:72 |
| 动词1 | 73 | missing difficulty check: 动词1:73 |
| 动词1 | 74 | missing difficulty check: 动词1:74 |
| 动词1 | 75 | missing difficulty check: 动词1:75 |
| 动词1 | 76 | missing difficulty check: 动词1:76 |
| 动词1 | 77 | missing difficulty check: 动词1:77 |
| 动词1 | 78 | missing difficulty check: 动词1:78 |
| 动词1 | 79 | missing difficulty check: 动词1:79 |
| 动词1 | 80 | missing difficulty check: 动词1:80 |
| 动词1 | 81 | missing difficulty check: 动词1:81 |
| 动词1 | 82 | missing difficulty check: 动词1:82 |
| 动词1 | 83 | missing difficulty check: 动词1:83 |
| 动词1 | 84 | missing difficulty check: 动词1:84 |
| 动词1 | 85 | missing difficulty check: 动词1:85 |
| 动词1 | 86 | missing difficulty check: 动词1:86 |
| 动词1 | 87 | missing difficulty check: 动词1:87 |
| 动词1 | 88 | missing difficulty check: 动词1:88 |
| 动词1 | 89 | missing difficulty check: 动词1:89 |
| 动词1 | 90 | missing difficulty check: 动词1:90 |
| 动词1 | 91 | missing difficulty check: 动词1:91 |
| 动词1 | 92 | missing difficulty check: 动词1:92 |
| 动词1 | 93 | missing difficulty check: 动词1:93 |
| 动词1 | 94 | missing difficulty check: 动词1:94 |
| 动词1 | 95 | missing difficulty check: 动词1:95 |
| 动词1 | 96 | missing difficulty check: 动词1:96 |
| 动词1 | 97 | missing difficulty check: 动词1:97 |
| 动词1 | 98 | missing difficulty check: 动词1:98 |
| 动词1 | 99 | missing difficulty check: 动词1:99 |
| 动词1 | 100 | missing difficulty check: 动词1:100 |
| 动词1 | 101 | missing difficulty check: 动词1:101 |
| 动词1 | 102 | missing difficulty check: 动词1:102 |
| 动词1 | 103 | missing difficulty check: 动词1:103 |
| 动词1 | 104 | missing difficulty check: 动词1:104 |
| 动词1 | 105 | missing difficulty check: 动词1:105 |
| 动词1 | 106 | missing difficulty check: 动词1:106 |
| 动词1 | 107 | missing difficulty check: 动词1:107 |
| 动词1 | 108 | missing difficulty check: 动词1:108 |
| 动词1 | 109 | missing difficulty check: 动词1:109 |
| 动词1 | 110 | missing difficulty check: 动词1:110 |
| 动词1 | 111 | missing difficulty check: 动词1:111 |
| 动词1 | 112 | missing difficulty check: 动词1:112 |
| 动词1 | 113 | missing difficulty check: 动词1:113 |
| 动词1 | 114 | missing difficulty check: 动词1:114 |
| 动词1 | 115 | missing difficulty check: 动词1:115 |
| 动词1 | 116 | missing difficulty check: 动词1:116 |
| 动词1 | 117 | missing difficulty check: 动词1:117 |
| 动词1 | 118 | missing difficulty check: 动词1:118 |
| 动词1 | 119 | missing difficulty check: 动词1:119 |
| 动词1 | 120 | missing difficulty check: 动词1:120 |
| 动词1 | 121 | missing difficulty check: 动词1:121 |
| 动词1 | 122 | missing difficulty check: 动词1:122 |
| 动词1 | 123 | missing difficulty check: 动词1:123 |
| 动词1 | 124 | missing difficulty check: 动词1:124 |
| 动词1 | 125 | missing difficulty check: 动词1:125 |
| 动词1 | 126 | missing difficulty check: 动词1:126 |
| 动词1 | 127 | missing difficulty check: 动词1:127 |
| 动词1 | 128 | missing difficulty check: 动词1:128 |
| 动词1 | 129 | missing difficulty check: 动词1:129 |
| 动词1 | 130 | missing difficulty check: 动词1:130 |
| 动词1 | 131 | missing difficulty check: 动词1:131 |
| 动词1 | 132 | missing difficulty check: 动词1:132 |
| 动词1 | 133 | missing difficulty check: 动词1:133 |
| 动词1 | 134 | missing difficulty check: 动词1:134 |
| 动词1 | 135 | missing difficulty check: 动词1:135 |
| 动词1 | 136 | missing difficulty check: 动词1:136 |
| 动词1 | 137 | missing difficulty check: 动词1:137 |
| 动词1 | 138 | missing difficulty check: 动词1:138 |
| 动词1 | 139 | missing difficulty check: 动词1:139 |
| 动词1 | 140 | missing difficulty check: 动词1:140 |
| 动词1 | 141 | missing difficulty check: 动词1:141 |
| 动词1 | 142 | missing difficulty check: 动词1:142 |
| 动词1 | 143 | missing difficulty check: 动词1:143 |
| 动词1 | 144 | missing difficulty check: 动词1:144 |
| 动词1 | 145 | missing difficulty check: 动词1:145 |
| 动词1 | 146 | missing difficulty check: 动词1:146 |
| 动词1 | 147 | missing difficulty check: 动词1:147 |
| 动词1 | 148 | missing difficulty check: 动词1:148 |
| 动词1 | 149 | missing difficulty check: 动词1:149 |
| 动词1 | 150 | missing difficulty check: 动词1:150 |
| 动词1 | 151 | missing difficulty check: 动词1:151 |
| 动词1 | 152 | missing difficulty check: 动词1:152 |
| 动词1 | 153 | missing difficulty check: 动词1:153 |
| 动词1 | 154 | missing difficulty check: 动词1:154 |
| 动词1 | 155 | missing difficulty check: 动词1:155 |
| 动词1 | 156 | missing difficulty check: 动词1:156 |
| 动词1 | 157 | missing difficulty check: 动词1:157 |
| 动词1 | 158 | missing difficulty check: 动词1:158 |
| 动词1 | 159 | missing difficulty check: 动词1:159 |
| 动词1 | 160 | missing difficulty check: 动词1:160 |
| 动词1 | 161 | missing difficulty check: 动词1:161 |
| 动词1 | 162 | missing difficulty check: 动词1:162 |
| 动词1 | 163 | missing difficulty check: 动词1:163 |
| 形容词1 | 2 | missing difficulty check: 形容词1:2 |
| 形容词1 | 3 | missing difficulty check: 形容词1:3 |
| 形容词1 | 4 | missing difficulty check: 形容词1:4 |
| 形容词1 | 5 | missing difficulty check: 形容词1:5 |
| 形容词1 | 6 | missing difficulty check: 形容词1:6 |
| 形容词1 | 7 | missing difficulty check: 形容词1:7 |
| 形容词1 | 8 | missing difficulty check: 形容词1:8 |
| 形容词1 | 9 | missing difficulty check: 形容词1:9 |
| 形容词1 | 10 | missing difficulty check: 形容词1:10 |
| 形容词1 | 11 | missing difficulty check: 形容词1:11 |
| 形容词1 | 12 | missing difficulty check: 形容词1:12 |
| 形容词1 | 13 | missing difficulty check: 形容词1:13 |
| 形容词1 | 14 | missing difficulty check: 形容词1:14 |
| 形容词1 | 15 | missing difficulty check: 形容词1:15 |
| 形容词1 | 16 | missing difficulty check: 形容词1:16 |
| 形容词1 | 17 | missing difficulty check: 形容词1:17 |
| 形容词1 | 18 | missing difficulty check: 形容词1:18 |
| 形容词1 | 19 | missing difficulty check: 形容词1:19 |
| 形容词1 | 20 | missing difficulty check: 形容词1:20 |
| 形容词1 | 21 | missing difficulty check: 形容词1:21 |
| 形容词1 | 22 | missing difficulty check: 形容词1:22 |
| 形容词1 | 23 | missing difficulty check: 形容词1:23 |
| 形容词1 | 24 | missing difficulty check: 形容词1:24 |
| 形容词1 | 25 | missing difficulty check: 形容词1:25 |
| 形容词1 | 26 | missing difficulty check: 形容词1:26 |
| 形容词1 | 27 | missing difficulty check: 形容词1:27 |
| 形容词1 | 28 | missing difficulty check: 形容词1:28 |
| 形容词1 | 29 | missing difficulty check: 形容词1:29 |
| 形容词1 | 30 | missing difficulty check: 形容词1:30 |
| 形容词1 | 31 | missing difficulty check: 形容词1:31 |
| 形容词1 | 32 | missing difficulty check: 形容词1:32 |
| 形容词1 | 33 | missing difficulty check: 形容词1:33 |
| 形容词1 | 34 | missing difficulty check: 形容词1:34 |
| 形容词1 | 35 | missing difficulty check: 形容词1:35 |
| 形容词1 | 36 | missing difficulty check: 形容词1:36 |
| 形容词1 | 37 | missing difficulty check: 形容词1:37 |
| 形容词1 | 38 | missing difficulty check: 形容词1:38 |
| 形容词1 | 39 | missing difficulty check: 形容词1:39 |
| 形容词1 | 40 | missing difficulty check: 形容词1:40 |
| 形容词1 | 41 | missing difficulty check: 形容词1:41 |
| 形容词1 | 42 | missing difficulty check: 形容词1:42 |
| 形容词1 | 43 | missing difficulty check: 形容词1:43 |
| 形容词1 | 44 | missing difficulty check: 形容词1:44 |
| 形容词1 | 45 | missing difficulty check: 形容词1:45 |
| 形容词1 | 46 | missing difficulty check: 形容词1:46 |
| 形容词1 | 47 | missing difficulty check: 形容词1:47 |
| 形容词1 | 48 | missing difficulty check: 形容词1:48 |
| 形容词1 | 49 | missing difficulty check: 形容词1:49 |
| 形容词1 | 50 | missing difficulty check: 形容词1:50 |
| 形容词1 | 51 | missing difficulty check: 形容词1:51 |
| 形容词1 | 52 | missing difficulty check: 形容词1:52 |
| 形容词1 | 53 | missing difficulty check: 形容词1:53 |
| 形容词1 | 54 | missing difficulty check: 形容词1:54 |
| 形容词1 | 55 | missing difficulty check: 形容词1:55 |
| 形容词1 | 56 | missing difficulty check: 形容词1:56 |
| 形容词1 | 57 | missing difficulty check: 形容词1:57 |
| 形容词1 | 58 | missing difficulty check: 形容词1:58 |
| 形容词1 | 59 | missing difficulty check: 形容词1:59 |
| 形容词1 | 60 | missing difficulty check: 形容词1:60 |
| 形容词1 | 61 | missing difficulty check: 形容词1:61 |
| 形容词1 | 62 | missing difficulty check: 形容词1:62 |
| 形容词1 | 63 | missing difficulty check: 形容词1:63 |
| 形容词1 | 64 | missing difficulty check: 形容词1:64 |
| 形容词1 | 65 | missing difficulty check: 形容词1:65 |
| 形容词1 | 66 | missing difficulty check: 形容词1:66 |
| 形容词1 | 67 | missing difficulty check: 形容词1:67 |
| 形容词1 | 68 | missing difficulty check: 形容词1:68 |
| 形容词1 | 69 | missing difficulty check: 形容词1:69 |
| 形容词1 | 70 | missing difficulty check: 形容词1:70 |
| 形容词1 | 71 | missing difficulty check: 形容词1:71 |
| 形容词1 | 72 | missing difficulty check: 形容词1:72 |
| 形容词1 | 73 | missing difficulty check: 形容词1:73 |
| 形容词1 | 74 | missing difficulty check: 形容词1:74 |
| 形容词1 | 75 | missing difficulty check: 形容词1:75 |
| 形容词1 | 76 | missing difficulty check: 形容词1:76 |
| 形容词1 | 77 | missing difficulty check: 形容词1:77 |
| 形容词1 | 78 | missing difficulty check: 形容词1:78 |
| 形容词1 | 79 | missing difficulty check: 形容词1:79 |
| 形容词1 | 80 | missing difficulty check: 形容词1:80 |
| 形容词1 | 81 | missing difficulty check: 形容词1:81 |
| 形容词1 | 82 | missing difficulty check: 形容词1:82 |
| 形容词1 | 83 | missing difficulty check: 形容词1:83 |
| 形容词1 | 84 | missing difficulty check: 形容词1:84 |
| 形容词1 | 85 | missing difficulty check: 形容词1:85 |
| 形容词1 | 86 | missing difficulty check: 形容词1:86 |
| 形容词1 | 87 | missing difficulty check: 形容词1:87 |
| 形容词1 | 88 | missing difficulty check: 形容词1:88 |
| 形容词1 | 89 | missing difficulty check: 形容词1:89 |
| 形容词1 | 90 | missing difficulty check: 形容词1:90 |
| 形容词1 | 91 | missing difficulty check: 形容词1:91 |
| 形容词1 | 92 | missing difficulty check: 形容词1:92 |
| 形容词1 | 93 | missing difficulty check: 形容词1:93 |
| 形容词1 | 94 | missing difficulty check: 形容词1:94 |
| 形容词1 | 95 | missing difficulty check: 形容词1:95 |
| 形容词1 | 96 | missing difficulty check: 形容词1:96 |
| 形容词1 | 97 | missing difficulty check: 形容词1:97 |
| 形容词1 | 98 | missing difficulty check: 形容词1:98 |
| 形容词1 | 99 | missing difficulty check: 形容词1:99 |
| 形容词1 | 100 | missing difficulty check: 形容词1:100 |
| 形容词1 | 101 | missing difficulty check: 形容词1:101 |
| 形容词1 | 102 | missing difficulty check: 形容词1:102 |
| 形容词1 | 103 | missing difficulty check: 形容词1:103 |
| 副词 | 2 | missing pinyin: 副词:2 |
| 副词 | 3 | missing pinyin: 副词:3 |
| 副词 | 4 | missing pinyin: 副词:4 |
| 副词 | 5 | missing pinyin: 副词:5 |
| 副词 | 6 | missing pinyin: 副词:6 |
| 副词 | 7 | missing pinyin: 副词:7 |
| 副词 | 8 | missing pinyin: 副词:8 |
| 副词 | 9 | missing pinyin: 副词:9 |
| 副词 | 10 | missing pinyin: 副词:10 |
| 副词 | 11 | missing pinyin: 副词:11 |
| 副词 | 12 | missing pinyin: 副词:12 |
| 副词 | 13 | missing pinyin: 副词:13 |
| 副词 | 14 | missing pinyin: 副词:14 |
| 副词 | 15 | missing pinyin: 副词:15 |
| 副词 | 16 | missing pinyin: 副词:16 |
| 副词 | 17 | missing pinyin: 副词:17 |
| 副词 | 18 | missing pinyin: 副词:18 |
| 副词 | 19 | missing pinyin: 副词:19 |
| 副词 | 20 | missing pinyin: 副词:20 |
| 副词 | 21 | missing pinyin: 副词:21 |
| 副词 | 22 | missing pinyin: 副词:22 |
| 副词 | 23 | missing pinyin: 副词:23 |
| 副词 | 24 | missing pinyin: 副词:24 |
| 副词 | 25 | missing pinyin: 副词:25 |
| 副词 | 26 | missing pinyin: 副词:26 |
| 副词 | 27 | missing pinyin: 副词:27 |
| 副词 | 28 | missing pinyin: 副词:28 |
| 副词 | 29 | missing pinyin: 副词:29 |
| 副词 | 30 | missing pinyin: 副词:30 |
| 副词 | 31 | missing pinyin: 副词:31 |
| 副词 | 32 | missing pinyin: 副词:32 |
| 副词 | 33 | missing pinyin: 副词:33 |
| 副词 | 34 | missing pinyin: 副词:34 |
| 副词 | 35 | missing pinyin: 副词:35 |
| 副词 | 36 | missing pinyin: 副词:36 |
| 副词 | 37 | missing pinyin: 副词:37 |
| 副词 | 38 | missing pinyin: 副词:38 |
| 副词 | 39 | missing pinyin: 副词:39 |
| 副词 | 40 | missing pinyin: 副词:40 |
| 副词 | 41 | missing pinyin: 副词:41 |
| 副词 | 42 | missing pinyin: 副词:42 |
| 副词 | 43 | missing pinyin: 副词:43 |
| 副词 | 44 | missing pinyin: 副词:44 |
| 副词 | 45 | missing pinyin: 副词:45 |
| 副词 | 46 | missing pinyin: 副词:46 |
| 副词 | 47 | missing pinyin: 副词:47 |
| 副词 | 48 | missing pinyin: 副词:48 |
| 副词 | 49 | missing pinyin: 副词:49 |
| 副词 | 50 | missing pinyin: 副词:50 |
| 副词 | 51 | missing pinyin: 副词:51 |
| 副词 | 52 | missing pinyin: 副词:52 |
| 副词 | 53 | missing pinyin: 副词:53 |
| 副词 | 54 | missing pinyin: 副词:54 |
| 副词 | 55 | missing pinyin: 副词:55 |
| 副词 | 56 | missing pinyin: 副词:56 |
| 副词 | 57 | missing pinyin: 副词:57 |
| 副词 | 58 | missing pinyin: 副词:58 |
| 副词 | 59 | missing pinyin: 副词:59 |
| 副词 | 60 | missing pinyin: 副词:60 |
| 副词 | 61 | missing pinyin: 副词:61 |
| 副词 | 62 | missing pinyin: 副词:62 |
| 副词 | 63 | missing pinyin: 副词:63 |
| 副词 | 64 | missing pinyin: 副词:64 |
| 副词 | 65 | missing pinyin: 副词:65 |
| 副词 | 66 | missing pinyin: 副词:66 |
| 副词 | 67 | missing pinyin: 副词:67 |
| 副词 | 68 | missing pinyin: 副词:68 |
| 副词 | 69 | missing pinyin: 副词:69 |
| 副词 | 70 | missing pinyin: 副词:70 |
| 副词 | 71 | missing pinyin: 副词:71 |
| 副词 | 72 | missing pinyin: 副词:72 |
| 副词 | 73 | missing pinyin: 副词:73 |
| 副词 | 74 | missing pinyin: 副词:74 |
| 副词 | 75 | missing pinyin: 副词:75 |
| 副词 | 76 | missing pinyin: 副词:76 |
| 副词 | 77 | missing pinyin: 副词:77 |
| 副词 | 78 | missing pinyin: 副词:78 |
| 副词 | 79 | missing pinyin: 副词:79 |
| 副词 | 80 | missing pinyin: 副词:80 |
| 副词 | 81 | missing pinyin: 副词:81 |
| 副词 | 82 | missing pinyin: 副词:82 |
| 副词 | 83 | missing pinyin: 副词:83 |
| 副词 | 84 | missing pinyin: 副词:84 |
| 副词 | 85 | missing pinyin: 副词:85 |
| 副词 | 86 | missing pinyin: 副词:86 |
| 副词 | 87 | missing pinyin: 副词:87 |
| 副词 | 88 | missing pinyin: 副词:88 |
| 副词 | 89 | missing pinyin: 副词:89 |
| 副词 | 90 | missing pinyin: 副词:90 |
| 副词 | 91 | missing pinyin: 副词:91 |
| 副词 | 92 | missing pinyin: 副词:92 |
| 副词 | 93 | missing pinyin: 副词:93 |
| 副词 | 94 | missing pinyin: 副词:94 |
| 副词 | 95 | missing pinyin: 副词:95 |
| 副词 | 96 | missing pinyin: 副词:96 |
| 副词 | 97 | missing pinyin: 副词:97 |
| 副词 | 98 | missing pinyin: 副词:98 |
| 副词 | 99 | missing pinyin: 副词:99 |
| 名词2 | 2 | missing pinyin: 名词2:2 |
| 名词2 | 3 | missing pinyin: 名词2:3 |
| 名词2 | 4 | missing pinyin: 名词2:4 |
| 名词2 | 5 | missing pinyin: 名词2:5 |
| 名词2 | 6 | missing pinyin: 名词2:6 |
| 名词2 | 7 | missing pinyin: 名词2:7 |
| 名词2 | 8 | missing pinyin: 名词2:8 |
| 名词2 | 9 | missing pinyin: 名词2:9 |
| 名词2 | 10 | missing pinyin: 名词2:10 |
| 名词2 | 11 | missing pinyin: 名词2:11 |
| 名词2 | 12 | missing pinyin: 名词2:12 |
| 名词2 | 13 | missing pinyin: 名词2:13 |
| 名词2 | 14 | missing pinyin: 名词2:14 |
| 名词2 | 15 | missing pinyin: 名词2:15 |
| 名词2 | 16 | missing pinyin: 名词2:16 |
| 名词2 | 17 | missing pinyin: 名词2:17 |
| 名词2 | 18 | missing pinyin: 名词2:18 |
| 名词2 | 19 | missing pinyin: 名词2:19 |
| 名词2 | 20 | missing pinyin: 名词2:20 |
| 名词2 | 21 | missing pinyin: 名词2:21 |
| 名词2 | 22 | missing pinyin: 名词2:22 |
| 名词2 | 23 | missing pinyin: 名词2:23 |
| 名词2 | 24 | missing pinyin: 名词2:24 |
| 名词2 | 25 | missing pinyin: 名词2:25 |
| 名词2 | 26 | missing pinyin: 名词2:26 |
| 名词2 | 27 | missing pinyin: 名词2:27 |
| 名词2 | 28 | missing pinyin: 名词2:28 |
| 名词2 | 29 | missing pinyin: 名词2:29 |
| 名词2 | 30 | missing pinyin: 名词2:30 |
| 名词2 | 31 | missing pinyin: 名词2:31 |
| 名词2 | 32 | missing pinyin: 名词2:32 |
| 名词2 | 33 | missing pinyin: 名词2:33 |
| 名词2 | 34 | missing pinyin: 名词2:34 |
| 名词2 | 35 | missing pinyin: 名词2:35 |
| 名词2 | 36 | missing pinyin: 名词2:36 |
| 名词2 | 37 | missing pinyin: 名词2:37 |
| 名词2 | 38 | missing pinyin: 名词2:38 |
| 名词2 | 39 | missing pinyin: 名词2:39 |
| 名词2 | 40 | missing pinyin: 名词2:40 |
| 名词2 | 41 | missing pinyin: 名词2:41 |
| 名词2 | 42 | missing pinyin: 名词2:42 |
| 名词2 | 43 | missing pinyin: 名词2:43 |
| 名词2 | 44 | missing pinyin: 名词2:44 |
| 名词2 | 45 | missing pinyin: 名词2:45 |
| 名词2 | 46 | missing pinyin: 名词2:46 |
| 名词2 | 47 | missing pinyin: 名词2:47 |
| 名词2 | 48 | missing pinyin: 名词2:48 |
| 名词2 | 49 | missing pinyin: 名词2:49 |
| 名词2 | 50 | missing pinyin: 名词2:50 |
| 名词2 | 51 | missing pinyin: 名词2:51 |
| 名词2 | 52 | missing pinyin: 名词2:52 |
| 名词2 | 53 | missing pinyin: 名词2:53 |
| 名词2 | 54 | missing pinyin: 名词2:54 |
| 名词2 | 55 | missing pinyin: 名词2:55 |
| 名词2 | 56 | missing pinyin: 名词2:56 |
| 名词2 | 57 | missing pinyin: 名词2:57 |
| 名词2 | 58 | missing pinyin: 名词2:58 |
| 名词2 | 59 | missing pinyin: 名词2:59 |
| 名词2 | 60 | missing pinyin: 名词2:60 |
| 名词2 | 61 | missing pinyin: 名词2:61 |
| 名词2 | 62 | missing pinyin: 名词2:62 |
| 名词2 | 63 | missing pinyin: 名词2:63 |
| 名词2 | 64 | missing pinyin: 名词2:64 |
| 名词2 | 65 | missing pinyin: 名词2:65 |
| 名词2 | 66 | missing pinyin: 名词2:66 |
| 名词2 | 67 | missing pinyin: 名词2:67 |
| 名词2 | 68 | missing pinyin: 名词2:68 |
| 名词2 | 69 | missing pinyin: 名词2:69 |
| 名词2 | 70 | missing pinyin: 名词2:70 |
| 名词2 | 71 | missing pinyin: 名词2:71 |
| 名词2 | 72 | missing pinyin: 名词2:72 |
| 名词2 | 73 | missing pinyin: 名词2:73 |
| 名词2 | 74 | missing pinyin: 名词2:74 |
| 名词2 | 75 | missing pinyin: 名词2:75 |
| 名词2 | 76 | missing pinyin: 名词2:76 |
| 名词2 | 77 | missing pinyin: 名词2:77 |
| 名词2 | 78 | missing pinyin: 名词2:78 |
| 名词2 | 79 | missing pinyin: 名词2:79 |
| 名词2 | 80 | missing pinyin: 名词2:80 |
| 名词2 | 81 | missing pinyin: 名词2:81 |
| 名词2 | 82 | missing pinyin: 名词2:82 |
| 名词2 | 83 | missing pinyin: 名词2:83 |
| 名词2 | 84 | missing pinyin: 名词2:84 |
| 名词2 | 85 | missing pinyin: 名词2:85 |
| 名词2 | 86 | missing pinyin: 名词2:86 |
| 名词2 | 87 | missing pinyin: 名词2:87 |
| 名词2 | 88 | missing pinyin: 名词2:88 |
| 名词2 | 89 | missing pinyin: 名词2:89 |
| 名词2 | 90 | missing pinyin: 名词2:90 |
| 名词2 | 91 | missing pinyin: 名词2:91 |
| 名词2 | 92 | missing pinyin: 名词2:92 |
| 名词2 | 93 | missing pinyin: 名词2:93 |
| 名词2 | 94 | missing pinyin: 名词2:94 |
| 名词2 | 95 | missing pinyin: 名词2:95 |
| 名词2 | 96 | missing pinyin: 名词2:96 |
| 名词2 | 97 | missing pinyin: 名词2:97 |
| 名词2 | 98 | missing pinyin: 名词2:98 |
| 名词2 | 99 | missing pinyin: 名词2:99 |
| 名词2 | 100 | missing pinyin: 名词2:100 |
| 名词2 | 101 | missing pinyin: 名词2:101 |
| 名词2 | 102 | missing pinyin: 名词2:102 |
| 名词2 | 103 | missing pinyin: 名词2:103 |
| 名词2 | 104 | missing pinyin: 名词2:104 |
| 名词2 | 105 | missing pinyin: 名词2:105 |
| 名词2 | 106 | missing pinyin: 名词2:106 |
| 名词2 | 107 | missing pinyin: 名词2:107 |
| 名词2 | 108 | missing pinyin: 名词2:108 |
| 名词2 | 109 | missing pinyin: 名词2:109 |
| 名词2 | 110 | missing pinyin: 名词2:110 |
| 名词2 | 111 | missing pinyin: 名词2:111 |
| 名词2 | 112 | missing pinyin: 名词2:112 |
| 名词2 | 113 | missing pinyin: 名词2:113 |
| 名词2 | 114 | missing pinyin: 名词2:114 |
| 名词2 | 115 | missing pinyin: 名词2:115 |
| 名词2 | 116 | missing pinyin: 名词2:116 |
| 名词2 | 117 | missing pinyin: 名词2:117 |
| 名词2 | 118 | missing pinyin: 名词2:118 |
| 名词2 | 119 | missing pinyin: 名词2:119 |
| 名词2 | 120 | missing pinyin: 名词2:120 |
| 名词2 | 121 | missing pinyin: 名词2:121 |
| 名词2 | 122 | missing pinyin: 名词2:122 |
| 名词2 | 123 | missing pinyin: 名词2:123 |
| 名词2 | 124 | missing pinyin: 名词2:124 |
| 名词2 | 125 | missing pinyin: 名词2:125 |
| 名词2 | 126 | missing pinyin: 名词2:126 |
| 名词2 | 127 | missing pinyin: 名词2:127 |
| 名词2 | 128 | missing pinyin: 名词2:128 |
| 名词2 | 129 | missing pinyin: 名词2:129 |
| 名词2 | 130 | missing pinyin: 名词2:130 |
| 名词2 | 131 | missing pinyin: 名词2:131 |
| 名词2 | 132 | missing pinyin: 名词2:132 |
| 名词2 | 133 | missing pinyin: 名词2:133 |
| 名词2 | 134 | missing pinyin: 名词2:134 |
| 名词2 | 135 | missing pinyin: 名词2:135 |
| 名词2 | 136 | missing pinyin: 名词2:136 |
| 名词2 | 137 | missing pinyin: 名词2:137 |
| 名词2 | 138 | missing pinyin: 名词2:138 |
| 名词2 | 139 | missing pinyin: 名词2:139 |
| 名词2 | 140 | missing pinyin: 名词2:140 |
| 名词2 | 141 | missing pinyin: 名词2:141 |
| 名词2 | 142 | missing pinyin: 名词2:142 |
| 名词2 | 143 | missing pinyin: 名词2:143 |
| 名词2 | 144 | missing pinyin: 名词2:144 |
| 名词2 | 145 | missing pinyin: 名词2:145 |
| 名词2 | 146 | missing pinyin: 名词2:146 |
| 名词2 | 147 | missing pinyin: 名词2:147 |
| 名词2 | 148 | missing pinyin: 名词2:148 |
| 名词2 | 149 | missing pinyin: 名词2:149 |
| 名词2 | 150 | missing pinyin: 名词2:150 |
| 名词2 | 151 | missing pinyin: 名词2:151 |
| 名词2 | 152 | missing pinyin: 名词2:152 |
| 名词2 | 153 | missing pinyin: 名词2:153 |
| 名词2 | 154 | missing pinyin: 名词2:154 |
| 名词2 | 155 | missing pinyin: 名词2:155 |
| 名词2 | 156 | missing pinyin: 名词2:156 |
| 名词2 | 157 | missing pinyin: 名词2:157 |
| 名词2 | 158 | missing pinyin: 名词2:158 |
| 名词2 | 159 | missing pinyin: 名词2:159 |
| 名词2 | 160 | missing pinyin: 名词2:160 |
| 名词2 | 161 | missing pinyin: 名词2:161 |
| 名词2 | 162 | missing pinyin: 名词2:162 |
| 名词2 | 163 | missing pinyin: 名词2:163 |
| 名词2 | 164 | missing pinyin: 名词2:164 |
| 名词2 | 165 | missing pinyin: 名词2:165 |
| 名词2 | 166 | missing pinyin: 名词2:166 |
| 名词2 | 167 | missing pinyin: 名词2:167 |
| 名词2 | 168 | missing pinyin: 名词2:168 |
| 名词2 | 169 | missing pinyin: 名词2:169 |
| 名词2 | 170 | missing pinyin: 名词2:170 |
| 名词2 | 171 | missing pinyin: 名词2:171 |
| 名词2 | 172 | missing pinyin: 名词2:172 |
| 名词2 | 173 | missing pinyin: 名词2:173 |
| 名词2 | 174 | missing pinyin: 名词2:174 |
| 名词2 | 175 | missing pinyin: 名词2:175 |
| 名词2 | 176 | missing pinyin: 名词2:176 |
| 名词2 | 177 | missing pinyin: 名词2:177 |
| 名词2 | 178 | missing pinyin: 名词2:178 |
| 名词2 | 179 | missing pinyin: 名词2:179 |
| 名词2 | 180 | missing pinyin: 名词2:180 |
| 名词2 | 181 | missing pinyin: 名词2:181 |
| 名词2 | 182 | missing pinyin: 名词2:182 |
| 名词2 | 183 | missing pinyin: 名词2:183 |
| 名词2 | 184 | missing pinyin: 名词2:184 |
| 名词2 | 185 | missing pinyin: 名词2:185 |
| 名词2 | 186 | missing pinyin: 名词2:186 |
| 名词2 | 187 | missing pinyin: 名词2:187 |
| 名词2 | 188 | missing pinyin: 名词2:188 |
| 名词2 | 189 | missing pinyin: 名词2:189 |
| 名词2 | 190 | missing pinyin: 名词2:190 |
| 名词2 | 191 | missing pinyin: 名词2:191 |
| 名词2 | 192 | missing pinyin: 名词2:192 |
| 名词2 | 193 | missing pinyin: 名词2:193 |
| 名词2 | 194 | missing pinyin: 名词2:194 |
| 名词2 | 195 | missing pinyin: 名词2:195 |
| 名词2 | 196 | missing pinyin: 名词2:196 |
| 名词2 | 197 | missing pinyin: 名词2:197 |
| 名词2 | 198 | missing pinyin: 名词2:198 |
| 名词2 | 199 | missing pinyin: 名词2:199 |
| 名词2 | 200 | missing pinyin: 名词2:200 |
| 名词2 | 201 | missing pinyin: 名词2:201 |
| 名词2 | 202 | missing pinyin: 名词2:202 |
| 名词2 | 203 | missing pinyin: 名词2:203 |
| 名词2 | 204 | missing pinyin: 名词2:204 |
| 名词2 | 205 | missing pinyin: 名词2:205 |
| 名词2 | 206 | missing pinyin: 名词2:206 |
| 名词2 | 207 | missing pinyin: 名词2:207 |
| 名词2 | 208 | missing pinyin: 名词2:208 |
| 名词2 | 209 | missing pinyin: 名词2:209 |
| 名词2 | 210 | missing pinyin: 名词2:210 |
| 名词2 | 211 | missing pinyin: 名词2:211 |
| 名词2 | 212 | missing pinyin: 名词2:212 |
| 名词2 | 213 | missing pinyin: 名词2:213 |
| 名词2 | 214 | missing pinyin: 名词2:214 |
| 名词2 | 215 | missing pinyin: 名词2:215 |
| 名词2 | 216 | missing pinyin: 名词2:216 |
| 名词2 | 217 | missing pinyin: 名词2:217 |
| 名词2 | 218 | missing pinyin: 名词2:218 |
| 名词2 | 219 | missing pinyin: 名词2:219 |
| 名词2 | 220 | missing pinyin: 名词2:220 |
| 名词2 | 221 | missing pinyin: 名词2:221 |
| 名词2 | 222 | missing pinyin: 名词2:222 |
| 名词2 | 223 | missing pinyin: 名词2:223 |
| 名词2 | 224 | missing pinyin: 名词2:224 |
| 名词2 | 225 | missing pinyin: 名词2:225 |
| 名词2 | 226 | missing pinyin: 名词2:226 |
| 名词2 | 227 | missing pinyin: 名词2:227 |
| 名词2 | 228 | missing pinyin: 名词2:228 |
| 名词2 | 229 | missing pinyin: 名词2:229 |
| 名词2 | 230 | missing pinyin: 名词2:230 |
| 名词2 | 231 | missing pinyin: 名词2:231 |
| 名词2 | 232 | missing pinyin: 名词2:232 |
| 名词2 | 233 | missing pinyin: 名词2:233 |
| 名词2 | 234 | missing pinyin: 名词2:234 |
| 名词2 | 235 | missing pinyin: 名词2:235 |
| 名词2 | 236 | missing pinyin: 名词2:236 |
| 名词2 | 237 | missing pinyin: 名词2:237 |
| 名词2 | 238 | missing pinyin: 名词2:238 |
| 名词2 | 239 | missing pinyin: 名词2:239 |
| 名词2 | 240 | missing pinyin: 名词2:240 |
| 名词2 | 241 | missing pinyin: 名词2:241 |
| 名词2 | 242 | missing pinyin: 名词2:242 |
| 名词2 | 243 | missing pinyin: 名词2:243 |
| 名词2 | 244 | missing pinyin: 名词2:244 |
| 名词2 | 245 | missing pinyin: 名词2:245 |
| 名词2 | 246 | missing pinyin: 名词2:246 |
| 名词2 | 247 | missing pinyin: 名词2:247 |
| 名词2 | 248 | missing pinyin: 名词2:248 |
| 名词2 | 249 | missing pinyin: 名词2:249 |
| 名词2 | 250 | missing pinyin: 名词2:250 |
| 名词2 | 251 | missing pinyin: 名词2:251 |
| 名词2 | 252 | missing pinyin: 名词2:252 |
| 名词2 | 253 | missing pinyin: 名词2:253 |
| 名词2 | 254 | missing pinyin: 名词2:254 |
| 名词2 | 255 | missing pinyin: 名词2:255 |
| 名词2 | 256 | missing pinyin: 名词2:256 |
| 名词2 | 257 | missing pinyin: 名词2:257 |
| 名词2 | 258 | missing pinyin: 名词2:258 |
| 名词2 | 259 | missing pinyin: 名词2:259 |
| 名词2 | 260 | missing pinyin: 名词2:260 |
| 名词2 | 261 | missing pinyin: 名词2:261 |
| 名词2 | 262 | missing pinyin: 名词2:262 |
| 名词2 | 263 | missing pinyin: 名词2:263 |
| 名词2 | 264 | missing pinyin: 名词2:264 |
| 名词2 | 265 | missing pinyin: 名词2:265 |
| 名词2 | 266 | missing pinyin: 名词2:266 |
| 名词2 | 267 | missing pinyin: 名词2:267 |
| 名词2 | 268 | missing pinyin: 名词2:268 |
| 名词2 | 269 | missing pinyin: 名词2:269 |
| 名词2 | 270 | missing pinyin: 名词2:270 |
| 名词2 | 271 | missing pinyin: 名词2:271 |
| 名词2 | 272 | missing pinyin: 名词2:272 |
| 名词2 | 273 | missing pinyin: 名词2:273 |
| 名词2 | 274 | missing pinyin: 名词2:274 |
| 名词2 | 275 | missing pinyin: 名词2:275 |
| 名词2 | 276 | missing pinyin: 名词2:276 |
| 名词2 | 277 | missing pinyin: 名词2:277 |
| 名词2 | 278 | missing pinyin: 名词2:278 |
| 名词2 | 279 | missing pinyin: 名词2:279 |
| 名词2 | 280 | missing pinyin: 名词2:280 |
| 名词2 | 281 | missing pinyin: 名词2:281 |
| 名词2 | 282 | missing pinyin: 名词2:282 |
| 名词2 | 283 | missing pinyin: 名词2:283 |
| 名词2 | 284 | missing pinyin: 名词2:284 |
| 名词2 | 285 | missing pinyin: 名词2:285 |
| 名词2 | 286 | missing pinyin: 名词2:286 |
| 名词2 | 287 | missing pinyin: 名词2:287 |
| 名词2 | 288 | missing pinyin: 名词2:288 |
| 名词2 | 289 | missing pinyin: 名词2:289 |
| 名词2 | 290 | missing pinyin: 名词2:290 |
| 名词2 | 291 | missing pinyin: 名词2:291 |
| 名词2 | 292 | missing pinyin: 名词2:292 |
| 名词2 | 293 | missing pinyin: 名词2:293 |
| 名词2 | 294 | missing pinyin: 名词2:294 |
| 名词2 | 295 | missing pinyin: 名词2:295 |
| 名词2 | 296 | missing pinyin: 名词2:296 |
| 名词2 | 297 | missing pinyin: 名词2:297 |
| 名词2 | 298 | missing pinyin: 名词2:298 |
| 名词2 | 299 | missing pinyin: 名词2:299 |
| 名词2 | 300 | missing pinyin: 名词2:300 |
| 名词2 | 301 | missing pinyin: 名词2:301 |
| 名词2 | 302 | missing pinyin: 名词2:302 |
| 名词2 | 303 | missing pinyin: 名词2:303 |
| 名词2 | 304 | missing pinyin: 名词2:304 |
| 名词2 | 305 | missing pinyin: 名词2:305 |
| 名词2 | 306 | missing pinyin: 名词2:306 |
| 名词2 | 307 | missing pinyin: 名词2:307 |
| 名词2 | 308 | missing pinyin: 名词2:308 |
| 名词2 | 309 | missing pinyin: 名词2:309 |
| 名词2 | 310 | missing pinyin: 名词2:310 |
| 名词2 | 311 | missing pinyin: 名词2:311 |
| 名词2 | 312 | missing pinyin: 名词2:312 |
| 名词2 | 313 | missing pinyin: 名词2:313 |
| 名词2 | 314 | missing pinyin: 名词2:314 |
| 名词2 | 315 | missing pinyin: 名词2:315 |
| 名词2 | 316 | missing pinyin: 名词2:316 |
| 名词2 | 317 | missing pinyin: 名词2:317 |
| 名词2 | 318 | missing pinyin: 名词2:318 |
| 名词2 | 319 | missing pinyin: 名词2:319 |
| 名词2 | 320 | missing pinyin: 名词2:320 |
| 名词2 | 321 | missing pinyin: 名词2:321 |
| 名词2 | 322 | missing pinyin: 名词2:322 |
| 名词2 | 323 | missing pinyin: 名词2:323 |
| 名词2 | 324 | missing pinyin: 名词2:324 |
| 名词2 | 325 | missing pinyin: 名词2:325 |
| 名词2 | 326 | missing pinyin: 名词2:326 |
| 名词2 | 327 | missing pinyin: 名词2:327 |
| 名词2 | 328 | missing pinyin: 名词2:328 |
| 名词2 | 329 | missing pinyin: 名词2:329 |
| 名词2 | 330 | missing pinyin: 名词2:330 |
| 名词2 | 331 | missing pinyin: 名词2:331 |
| 名词2 | 332 | missing pinyin: 名词2:332 |
| 名词2 | 333 | missing pinyin: 名词2:333 |
| 名词2 | 334 | missing pinyin: 名词2:334 |
| 名词2 | 335 | missing pinyin: 名词2:335 |
| 名词2 | 336 | missing pinyin: 名词2:336 |
| 名词2 | 337 | missing pinyin: 名词2:337 |
| 名词2 | 338 | missing pinyin: 名词2:338 |
| 名词2 | 339 | missing pinyin: 名词2:339 |
| 名词2 | 340 | missing pinyin: 名词2:340 |
| 名词2 | 341 | missing pinyin: 名词2:341 |
| 名词2 | 342 | missing pinyin: 名词2:342 |
| 名词2 | 343 | missing pinyin: 名词2:343 |
| 名词2 | 344 | missing pinyin: 名词2:344 |
| 名词2 | 345 | missing pinyin: 名词2:345 |
| 名词2 | 346 | missing pinyin: 名词2:346 |
| 名词2 | 347 | missing pinyin: 名词2:347 |
| 名词2 | 348 | missing pinyin: 名词2:348 |
| 名词2 | 349 | missing pinyin: 名词2:349 |
| 名词2 | 350 | missing pinyin: 名词2:350 |
| 名词2 | 351 | missing pinyin: 名词2:351 |
| 名词2 | 352 | missing pinyin: 名词2:352 |
| 名词2 | 353 | missing pinyin: 名词2:353 |
| 名词2 | 354 | missing pinyin: 名词2:354 |
| 名词2 | 355 | missing pinyin: 名词2:355 |
| 名词2 | 356 | missing pinyin: 名词2:356 |
| 名词2 | 357 | missing pinyin: 名词2:357 |
| 名词2 | 358 | missing pinyin: 名词2:358 |
| 名词2 | 359 | missing pinyin: 名词2:359 |
| 名词2 | 360 | missing pinyin: 名词2:360 |
| 名词2 | 361 | missing pinyin: 名词2:361 |
| 名词2 | 362 | missing pinyin: 名词2:362 |
| 名词2 | 363 | missing pinyin: 名词2:363 |
| 名词2 | 364 | missing pinyin: 名词2:364 |
| 名词2 | 365 | missing pinyin: 名词2:365 |
| 名词2 | 366 | missing pinyin: 名词2:366 |
| 名词2 | 367 | missing pinyin: 名词2:367 |
| 名词2 | 368 | missing pinyin: 名词2:368 |
| 名词2 | 369 | missing pinyin: 名词2:369 |
| 名词2 | 370 | missing pinyin: 名词2:370 |
| 名词2 | 371 | missing pinyin: 名词2:371 |
| 名词2 | 372 | missing pinyin: 名词2:372 |
| 名词2 | 373 | missing pinyin: 名词2:373 |
| 名词2 | 374 | missing pinyin: 名词2:374 |
| 名词2 | 375 | missing pinyin: 名词2:375 |
| 名词2 | 376 | missing pinyin: 名词2:376 |
| 名词2 | 377 | missing pinyin: 名词2:377 |
| 名词2 | 378 | missing pinyin: 名词2:378 |
| 名词2 | 379 | missing pinyin: 名词2:379 |
| 名词2 | 380 | missing pinyin: 名词2:380 |
| 名词2 | 381 | missing pinyin: 名词2:381 |
| 名词2 | 382 | missing pinyin: 名词2:382 |
| 名词2 | 383 | missing pinyin: 名词2:383 |
| 名词2 | 384 | missing pinyin: 名词2:384 |
| 名词2 | 385 | missing pinyin: 名词2:385 |
| 名词2 | 386 | missing pinyin: 名词2:386 |
| 名词2 | 387 | missing pinyin: 名词2:387 |
| 名词2 | 388 | missing pinyin: 名词2:388 |
| 名词2 | 389 | missing pinyin: 名词2:389 |
| 名词2 | 390 | missing pinyin: 名词2:390 |
| 名词2 | 391 | missing pinyin: 名词2:391 |
| 名词2 | 392 | missing pinyin: 名词2:392 |
| 名词2 | 393 | missing pinyin: 名词2:393 |
| 名词2 | 394 | missing pinyin: 名词2:394 |
| 名词2 | 395 | missing pinyin: 名词2:395 |
| 名词2 | 396 | missing pinyin: 名词2:396 |
| 名词2 | 397 | missing pinyin: 名词2:397 |
| 名词2 | 398 | missing pinyin: 名词2:398 |
| 名词2 | 399 | missing pinyin: 名词2:399 |
| 名词2 | 400 | missing pinyin: 名词2:400 |
| 名词2 | 401 | missing pinyin: 名词2:401 |
| 名词2 | 402 | missing pinyin: 名词2:402 |
| 名词2 | 403 | missing pinyin: 名词2:403 |
| 名词2 | 404 | missing pinyin: 名词2:404 |
| 名词2 | 405 | missing pinyin: 名词2:405 |
| 名词2 | 406 | missing pinyin: 名词2:406 |
| 名词2 | 407 | missing pinyin: 名词2:407 |
| 名词2 | 408 | missing pinyin: 名词2:408 |
| 名词2 | 409 | missing pinyin: 名词2:409 |
| 名词2 | 410 | missing pinyin: 名词2:410 |
| 名词2 | 411 | missing pinyin: 名词2:411 |
| 名词2 | 412 | missing pinyin: 名词2:412 |
| 名词2 | 413 | missing pinyin: 名词2:413 |
| 名词2 | 414 | missing pinyin: 名词2:414 |
| 名词2 | 415 | missing pinyin: 名词2:415 |
| 名词2 | 416 | missing pinyin: 名词2:416 |
| 名词2 | 417 | missing pinyin: 名词2:417 |
| 名词2 | 418 | missing pinyin: 名词2:418 |
| 名词2 | 419 | missing pinyin: 名词2:419 |
| 名词2 | 420 | missing pinyin: 名词2:420 |
| 名词2 | 421 | missing pinyin: 名词2:421 |
| 名词2 | 422 | missing pinyin: 名词2:422 |
| 名词2 | 423 | missing pinyin: 名词2:423 |
| 名词2 | 424 | missing pinyin: 名词2:424 |
| 名词2 | 425 | missing pinyin: 名词2:425 |
| 名词2 | 426 | missing pinyin: 名词2:426 |
| 名词2 | 427 | missing pinyin: 名词2:427 |
| 名词2 | 428 | missing pinyin: 名词2:428 |
| 名词2 | 429 | missing pinyin: 名词2:429 |
| 名词2 | 430 | missing pinyin: 名词2:430 |
| 名词2 | 431 | missing pinyin: 名词2:431 |
| 名词2 | 432 | missing pinyin: 名词2:432 |
| 名词2 | 433 | missing pinyin: 名词2:433 |
| 名词2 | 434 | missing pinyin: 名词2:434 |
| 名词2 | 435 | missing pinyin: 名词2:435 |
| 名词2 | 436 | missing pinyin: 名词2:436 |
| 名词2 | 437 | missing pinyin: 名词2:437 |
| 名词2 | 438 | missing pinyin: 名词2:438 |
| 名词2 | 439 | missing pinyin: 名词2:439 |
| 名词2 | 440 | missing pinyin: 名词2:440 |
| 名词2 | 441 | missing pinyin: 名词2:441 |
| 名词2 | 442 | missing pinyin: 名词2:442 |
| 名词2 | 443 | missing pinyin: 名词2:443 |
| 名词2 | 444 | missing pinyin: 名词2:444 |
| 名词2 | 445 | missing pinyin: 名词2:445 |
| 名词2 | 446 | missing pinyin: 名词2:446 |
| 名词2 | 447 | missing pinyin: 名词2:447 |
| 名词2 | 448 | missing pinyin: 名词2:448 |
| 名词2 | 449 | missing pinyin: 名词2:449 |
| 名词2 | 450 | missing pinyin: 名词2:450 |
| 名词2 | 451 | missing pinyin: 名词2:451 |
| 名词2 | 452 | missing pinyin: 名词2:452 |
| 名词2 | 453 | missing pinyin: 名词2:453 |
| 名词2 | 454 | missing pinyin: 名词2:454 |
| 名词2 | 455 | missing pinyin: 名词2:455 |
| 名词2 | 456 | missing pinyin: 名词2:456 |
| 名词2 | 457 | missing pinyin: 名词2:457 |
| 名词2 | 458 | missing pinyin: 名词2:458 |
| 名词2 | 459 | missing pinyin: 名词2:459 |
| 名词2 | 460 | missing pinyin: 名词2:460 |
| 名词2 | 461 | missing pinyin: 名词2:461 |
| 名词2 | 462 | missing pinyin: 名词2:462 |
| 名词2 | 463 | missing pinyin: 名词2:463 |
| 名词2 | 464 | missing pinyin: 名词2:464 |
| 名词2 | 465 | missing pinyin: 名词2:465 |
| 名词2 | 466 | missing pinyin: 名词2:466 |
| 名词2 | 467 | missing pinyin: 名词2:467 |
| 名词2 | 468 | missing pinyin: 名词2:468 |
| 名词2 | 469 | missing pinyin: 名词2:469 |
| 名词2 | 470 | missing pinyin: 名词2:470 |
| 名词2 | 471 | missing pinyin: 名词2:471 |
| 名词2 | 472 | missing pinyin: 名词2:472 |
| 名词2 | 473 | missing pinyin: 名词2:473 |
| 名词2 | 474 | missing pinyin: 名词2:474 |
| 名词2 | 479 | missing pinyin: 名词2:479 |
| 名词2 | 480 | missing pinyin: 名词2:480 |
| 名词2 | 481 | missing pinyin: 名词2:481 |
| 名词2 | 482 | missing pinyin: 名词2:482 |
| 形容词2 | 2 | missing difficulty check: 形容词2:2 |
| 形容词2 | 3 | missing difficulty check: 形容词2:3 |
| 形容词2 | 4 | missing difficulty check: 形容词2:4 |
| 形容词2 | 5 | missing difficulty check: 形容词2:5 |
| 形容词2 | 6 | missing difficulty check: 形容词2:6 |
| 形容词2 | 7 | missing difficulty check: 形容词2:7 |
| 形容词2 | 8 | missing difficulty check: 形容词2:8 |
| 形容词2 | 9 | missing difficulty check: 形容词2:9 |
| 形容词2 | 10 | missing difficulty check: 形容词2:10 |
| 形容词2 | 11 | missing difficulty check: 形容词2:11 |
| 形容词2 | 12 | missing difficulty check: 形容词2:12 |
| 形容词2 | 13 | missing difficulty check: 形容词2:13 |
| 形容词2 | 14 | missing difficulty check: 形容词2:14 |
| 形容词2 | 15 | missing difficulty check: 形容词2:15 |
| 形容词2 | 16 | missing difficulty check: 形容词2:16 |
| 形容词2 | 17 | missing difficulty check: 形容词2:17 |
| 形容词2 | 18 | missing difficulty check: 形容词2:18 |
| 形容词2 | 19 | missing difficulty check: 形容词2:19 |
| 形容词2 | 20 | missing difficulty check: 形容词2:20 |
| 形容词2 | 21 | missing difficulty check: 形容词2:21 |
| 形容词2 | 22 | missing difficulty check: 形容词2:22 |
| 形容词2 | 23 | missing difficulty check: 形容词2:23 |
| 形容词2 | 24 | missing difficulty check: 形容词2:24 |
| 形容词2 | 25 | missing difficulty check: 形容词2:25 |
| 形容词2 | 26 | missing difficulty check: 形容词2:26 |
| 形容词2 | 27 | missing difficulty check: 形容词2:27 |
| 形容词2 | 28 | missing difficulty check: 形容词2:28 |
| 形容词2 | 29 | missing difficulty check: 形容词2:29 |
| 形容词2 | 30 | missing difficulty check: 形容词2:30 |
| 形容词2 | 31 | missing difficulty check: 形容词2:31 |
| 形容词2 | 32 | missing difficulty check: 形容词2:32 |
| 形容词2 | 33 | missing difficulty check: 形容词2:33 |
| 形容词2 | 34 | missing difficulty check: 形容词2:34 |
| 形容词2 | 35 | missing difficulty check: 形容词2:35 |
| 形容词2 | 36 | missing difficulty check: 形容词2:36 |
| 形容词2 | 37 | missing difficulty check: 形容词2:37 |
| 形容词2 | 38 | missing difficulty check: 形容词2:38 |
| 形容词2 | 39 | missing difficulty check: 形容词2:39 |
| 形容词2 | 40 | missing difficulty check: 形容词2:40 |
| 形容词2 | 41 | missing difficulty check: 形容词2:41 |
| 形容词2 | 42 | missing difficulty check: 形容词2:42 |
| 形容词2 | 43 | missing difficulty check: 形容词2:43 |
| 形容词2 | 44 | missing difficulty check: 形容词2:44 |
| 形容词2 | 45 | missing difficulty check: 形容词2:45 |
| 形容词2 | 46 | missing difficulty check: 形容词2:46 |
| 形容词2 | 47 | missing difficulty check: 形容词2:47 |
| 形容词2 | 48 | missing difficulty check: 形容词2:48 |
| 形容词2 | 49 | missing difficulty check: 形容词2:49 |
| 形容词2 | 50 | missing difficulty check: 形容词2:50 |
| 形容词2 | 51 | missing difficulty check: 形容词2:51 |
| 形容词2 | 52 | missing difficulty check: 形容词2:52 |
| 形容词2 | 53 | missing difficulty check: 形容词2:53 |
| 形容词2 | 54 | missing difficulty check: 形容词2:54 |
| 形容词2 | 55 | missing difficulty check: 形容词2:55 |
| 形容词2 | 56 | missing difficulty check: 形容词2:56 |
| 形容词2 | 57 | missing difficulty check: 形容词2:57 |
| 形容词2 | 58 | missing difficulty check: 形容词2:58 |
| 形容词2 | 59 | missing difficulty check: 形容词2:59 |
| 形容词2 | 60 | missing difficulty check: 形容词2:60 |
| 形容词2 | 61 | missing difficulty check: 形容词2:61 |
| 形容词2 | 62 | missing difficulty check: 形容词2:62 |
| 形容词2 | 63 | missing difficulty check: 形容词2:63 |
| 形容词2 | 64 | missing difficulty check: 形容词2:64 |
| 形容词2 | 65 | missing difficulty check: 形容词2:65 |
| 形容词2 | 66 | missing difficulty check: 形容词2:66 |
| 形容词2 | 67 | missing difficulty check: 形容词2:67 |
| 形容词2 | 68 | missing difficulty check: 形容词2:68 |
| 形容词2 | 69 | missing difficulty check: 形容词2:69 |
| 形容词2 | 70 | missing difficulty check: 形容词2:70 |
| 形容词2 | 71 | missing difficulty check: 形容词2:71 |
| 形容词2 | 72 | missing difficulty check: 形容词2:72 |
| 形容词2 | 73 | missing difficulty check: 形容词2:73 |
| 形容词2 | 74 | missing difficulty check: 形容词2:74 |
| 形容词2 | 75 | missing difficulty check: 形容词2:75 |
| 形容词2 | 76 | missing difficulty check: 形容词2:76 |
| 形容词2 | 77 | missing difficulty check: 形容词2:77 |
| 形容词2 | 78 | missing difficulty check: 形容词2:78 |
| 形容词2 | 79 | missing difficulty check: 形容词2:79 |
| 形容词2 | 80 | missing difficulty check: 形容词2:80 |
| 形容词2 | 81 | missing difficulty check: 形容词2:81 |
| 形容词2 | 82 | missing difficulty check: 形容词2:82 |
| 形容词2 | 83 | missing difficulty check: 形容词2:83 |
| 形容词2 | 84 | missing difficulty check: 形容词2:84 |
| 形容词2 | 85 | missing difficulty check: 形容词2:85 |
| 形容词2 | 86 | missing difficulty check: 形容词2:86 |
| 形容词2 | 87 | missing difficulty check: 形容词2:87 |
| 形容词2 | 88 | missing difficulty check: 形容词2:88 |
| 形容词2 | 89 | missing difficulty check: 形容词2:89 |
| 形容词2 | 90 | missing difficulty check: 形容词2:90 |
| 形容词2 | 91 | missing difficulty check: 形容词2:91 |
| 形容词2 | 92 | missing difficulty check: 形容词2:92 |
| 形容词2 | 93 | missing difficulty check: 形容词2:93 |
| 形容词2 | 94 | missing difficulty check: 形容词2:94 |
| 形容词2 | 95 | missing difficulty check: 形容词2:95 |
| 形容词2 | 96 | missing difficulty check: 形容词2:96 |
| 形容词2 | 97 | missing difficulty check: 形容词2:97 |
| 形容词2 | 98 | missing difficulty check: 形容词2:98 |
| 形容词2 | 99 | missing difficulty check: 形容词2:99 |
| 形容词2 | 100 | missing difficulty check: 形容词2:100 |
| 形容词2 | 101 | missing difficulty check: 形容词2:101 |
| 形容词2 | 102 | missing difficulty check: 形容词2:102 |
| 形容词2 | 103 | missing difficulty check: 形容词2:103 |
| 形容词2 | 104 | missing difficulty check: 形容词2:104 |
| 形容词2 | 105 | missing difficulty check: 形容词2:105 |
| 形容词2 | 106 | missing difficulty check: 形容词2:106 |
| 形容词2 | 107 | missing difficulty check: 形容词2:107 |
| 形容词2 | 108 | missing difficulty check: 形容词2:108 |
| 形容词2 | 109 | missing difficulty check: 形容词2:109 |
| 形容词2 | 110 | missing difficulty check: 形容词2:110 |
| 形容词2 | 111 | missing difficulty check: 形容词2:111 |
| 形容词2 | 112 | missing difficulty check: 形容词2:112 |
| 动词2 | 2 | missing difficulty check: 动词2:2 |
| 动词2 | 3 | missing difficulty check: 动词2:3 |
| 动词2 | 4 | missing difficulty check: 动词2:4 |
| 动词2 | 5 | missing difficulty check: 动词2:5 |
| 动词2 | 6 | missing difficulty check: 动词2:6 |
| 动词2 | 7 | missing difficulty check: 动词2:7 |
| 动词2 | 8 | missing difficulty check: 动词2:8 |
| 动词2 | 9 | missing difficulty check: 动词2:9 |
| 动词2 | 10 | missing difficulty check: 动词2:10 |
| 动词2 | 11 | missing difficulty check: 动词2:11 |
| 动词2 | 12 | missing difficulty check: 动词2:12 |
| 动词2 | 13 | missing difficulty check: 动词2:13 |
| 动词2 | 14 | missing difficulty check: 动词2:14 |
| 动词2 | 15 | missing difficulty check: 动词2:15 |
| 动词2 | 16 | missing difficulty check: 动词2:16 |
| 动词2 | 17 | missing difficulty check: 动词2:17 |
| 动词2 | 18 | missing difficulty check: 动词2:18 |
| 动词2 | 19 | missing difficulty check: 动词2:19 |
| 动词2 | 20 | missing difficulty check: 动词2:20 |
| 动词2 | 21 | missing difficulty check: 动词2:21 |
| 动词2 | 22 | missing difficulty check: 动词2:22 |
| 动词2 | 23 | missing difficulty check: 动词2:23 |
| 动词2 | 24 | missing difficulty check: 动词2:24 |
| 动词2 | 25 | missing difficulty check: 动词2:25 |
| 动词2 | 26 | missing difficulty check: 动词2:26 |
| 动词2 | 27 | missing difficulty check: 动词2:27 |
| 动词2 | 28 | missing difficulty check: 动词2:28 |
| 动词2 | 29 | missing difficulty check: 动词2:29 |
| 动词2 | 30 | missing difficulty check: 动词2:30 |
| 动词2 | 31 | missing difficulty check: 动词2:31 |
| 动词2 | 32 | missing difficulty check: 动词2:32 |
| 动词2 | 33 | missing difficulty check: 动词2:33 |
| 动词2 | 34 | missing difficulty check: 动词2:34 |
| 动词2 | 35 | missing difficulty check: 动词2:35 |
| 动词2 | 36 | missing difficulty check: 动词2:36 |
| 动词2 | 37 | missing difficulty check: 动词2:37 |
| 动词2 | 38 | missing difficulty check: 动词2:38 |
| 动词2 | 39 | missing difficulty check: 动词2:39 |
| 动词2 | 40 | missing difficulty check: 动词2:40 |
| 动词2 | 41 | missing difficulty check: 动词2:41 |
| 动词2 | 42 | missing difficulty check: 动词2:42 |
| 动词2 | 43 | missing difficulty check: 动词2:43 |
| 动词2 | 44 | missing difficulty check: 动词2:44 |
| 动词2 | 45 | missing difficulty check: 动词2:45 |
| 动词2 | 46 | missing difficulty check: 动词2:46 |
| 动词2 | 47 | missing difficulty check: 动词2:47 |
| 动词2 | 48 | missing difficulty check: 动词2:48 |
| 动词2 | 49 | missing difficulty check: 动词2:49 |
| 动词2 | 50 | missing difficulty check: 动词2:50 |
| 动词2 | 51 | missing difficulty check: 动词2:51 |
| 动词2 | 52 | missing difficulty check: 动词2:52 |
| 动词2 | 53 | missing difficulty check: 动词2:53 |
| 动词2 | 54 | missing difficulty check: 动词2:54 |
| 动词2 | 55 | missing difficulty check: 动词2:55 |
| 动词2 | 56 | missing difficulty check: 动词2:56 |
| 动词2 | 57 | missing difficulty check: 动词2:57 |
| 动词2 | 58 | missing difficulty check: 动词2:58 |
| 动词2 | 59 | missing difficulty check: 动词2:59 |
| 动词2 | 60 | missing difficulty check: 动词2:60 |
| 动词2 | 61 | missing difficulty check: 动词2:61 |
| 动词2 | 62 | missing difficulty check: 动词2:62 |
| 动词2 | 63 | missing difficulty check: 动词2:63 |
| 动词2 | 64 | missing difficulty check: 动词2:64 |
| 动词2 | 65 | missing difficulty check: 动词2:65 |
| 动词2 | 66 | missing difficulty check: 动词2:66 |
| 动词2 | 67 | missing difficulty check: 动词2:67 |
| 动词2 | 68 | missing difficulty check: 动词2:68 |
| 动词2 | 69 | missing difficulty check: 动词2:69 |
| 动词2 | 70 | missing difficulty check: 动词2:70 |
| 动词2 | 71 | missing difficulty check: 动词2:71 |
| 动词2 | 72 | missing difficulty check: 动词2:72 |
| 动词2 | 73 | missing difficulty check: 动词2:73 |
| 动词2 | 74 | missing difficulty check: 动词2:74 |
| 动词2 | 75 | missing difficulty check: 动词2:75 |
| 动词2 | 76 | missing difficulty check: 动词2:76 |
| 动词2 | 77 | missing difficulty check: 动词2:77 |
| 动词2 | 78 | missing difficulty check: 动词2:78 |
| 动词2 | 79 | missing difficulty check: 动词2:79 |
| 动词2 | 80 | missing difficulty check: 动词2:80 |
| 动词2 | 81 | missing difficulty check: 动词2:81 |
| 动词2 | 82 | missing difficulty check: 动词2:82 |
| 动词2 | 83 | missing difficulty check: 动词2:83 |
| 动词2 | 84 | missing difficulty check: 动词2:84 |
| 动词2 | 85 | missing difficulty check: 动词2:85 |
| 动词2 | 86 | missing difficulty check: 动词2:86 |
| 动词2 | 87 | missing difficulty check: 动词2:87 |
| 动词2 | 88 | missing difficulty check: 动词2:88 |
| 动词2 | 89 | missing difficulty check: 动词2:89 |
| 动词2 | 90 | missing difficulty check: 动词2:90 |
| 动词2 | 91 | missing difficulty check: 动词2:91 |
| 动词2 | 92 | missing difficulty check: 动词2:92 |
| 动词2 | 93 | missing difficulty check: 动词2:93 |
| 动词2 | 94 | missing difficulty check: 动词2:94 |
| 动词2 | 95 | missing difficulty check: 动词2:95 |
| 动词2 | 96 | missing difficulty check: 动词2:96 |
| 动词2 | 97 | missing difficulty check: 动词2:97 |
| 动词2 | 98 | missing difficulty check: 动词2:98 |
| 动词2 | 99 | missing difficulty check: 动词2:99 |
| 动词2 | 100 | missing difficulty check: 动词2:100 |
| 动词2 | 101 | missing difficulty check: 动词2:101 |
| 动词2 | 102 | missing difficulty check: 动词2:102 |
| 动词2 | 103 | missing difficulty check: 动词2:103 |
| 动词2 | 104 | missing difficulty check: 动词2:104 |
| 动词2 | 105 | missing difficulty check: 动词2:105 |
| 动词2 | 106 | missing difficulty check: 动词2:106 |
| 动词2 | 107 | missing difficulty check: 动词2:107 |
| 动词2 | 108 | missing difficulty check: 动词2:108 |
| 动词2 | 109 | missing difficulty check: 动词2:109 |
| 动词2 | 110 | missing difficulty check: 动词2:110 |
| 动词2 | 111 | missing difficulty check: 动词2:111 |
| 动词2 | 112 | missing difficulty check: 动词2:112 |
| 动词2 | 113 | missing difficulty check: 动词2:113 |
| 动词2 | 114 | missing difficulty check: 动词2:114 |
| 动词2 | 115 | missing difficulty check: 动词2:115 |
| 动词2 | 116 | missing difficulty check: 动词2:116 |
| 动词2 | 117 | missing difficulty check: 动词2:117 |
| 动词2 | 118 | missing difficulty check: 动词2:118 |
| 动词2 | 119 | missing difficulty check: 动词2:119 |
| 动词2 | 120 | missing difficulty check: 动词2:120 |
| 动词2 | 121 | missing difficulty check: 动词2:121 |
| 动词2 | 122 | missing difficulty check: 动词2:122 |
| 动词2 | 123 | missing difficulty check: 动词2:123 |
| 动词2 | 124 | missing difficulty check: 动词2:124 |
| 动词2 | 125 | missing difficulty check: 动词2:125 |
| 动词2 | 126 | missing difficulty check: 动词2:126 |
| 动词2 | 127 | missing difficulty check: 动词2:127 |
| 动词2 | 128 | missing difficulty check: 动词2:128 |
| 动词2 | 129 | missing difficulty check: 动词2:129 |
| 动词2 | 130 | missing difficulty check: 动词2:130 |
| 动词2 | 131 | missing difficulty check: 动词2:131 |
| 动词2 | 132 | missing difficulty check: 动词2:132 |
| 动词2 | 133 | missing difficulty check: 动词2:133 |
| 动词2 | 134 | missing difficulty check: 动词2:134 |
| 动词2 | 135 | missing difficulty check: 动词2:135 |
| 动词2 | 136 | missing difficulty check: 动词2:136 |
| 动词2 | 137 | missing difficulty check: 动词2:137 |
| 动词2 | 138 | missing difficulty check: 动词2:138 |
| 动词2 | 139 | missing difficulty check: 动词2:139 |
| 动词2 | 140 | missing pinyin: 动词2:140 |
| 动词2 | 141 | missing pinyin: 动词2:141 |
| 动词2 | 142 | missing pinyin: 动词2:142 |
| 动词2 | 143 | missing pinyin: 动词2:143 |
| 动词2 | 144 | missing pinyin: 动词2:144 |
| 动词2 | 145 | missing pinyin: 动词2:145 |
| 动词2 | 146 | missing pinyin: 动词2:146 |
| 动词2 | 147 | missing pinyin: 动词2:147 |
| 动词2 | 148 | missing pinyin: 动词2:148 |
| 动词2 | 149 | missing pinyin: 动词2:149 |
| 动词2 | 150 | missing pinyin: 动词2:150 |
| 动词2 | 151 | missing pinyin: 动词2:151 |
| 动词2 | 152 | missing pinyin: 动词2:152 |
| 动词2 | 153 | missing pinyin: 动词2:153 |
| 动词2 | 154 | missing pinyin: 动词2:154 |
| 动词2 | 155 | missing pinyin: 动词2:155 |
| 动词2 | 156 | missing pinyin: 动词2:156 |
| 动词2 | 157 | missing pinyin: 动词2:157 |
| 动词2 | 158 | missing pinyin: 动词2:158 |
| 动词2 | 159 | missing pinyin: 动词2:159 |
| 动词2 | 160 | missing pinyin: 动词2:160 |
| 动词2 | 161 | missing pinyin: 动词2:161 |
| 动词2 | 162 | missing pinyin: 动词2:162 |
| 动词2 | 163 | missing pinyin: 动词2:163 |
| 动词2 | 164 | missing pinyin: 动词2:164 |
| 动词2 | 165 | missing pinyin: 动词2:165 |
| 动词2 | 166 | missing pinyin: 动词2:166 |
| 动词2 | 167 | missing pinyin: 动词2:167 |
| 动词2 | 168 | missing pinyin: 动词2:168 |
| 动词2 | 169 | missing pinyin: 动词2:169 |
| 动词2 | 170 | missing pinyin: 动词2:170 |
| 动词2 | 171 | missing pinyin: 动词2:171 |
| 动词2 | 172 | missing pinyin: 动词2:172 |
| 动词2 | 173 | missing pinyin: 动词2:173 |
| 动词2 | 174 | missing pinyin: 动词2:174 |
| 动词2 | 175 | missing pinyin: 动词2:175 |
| 动词2 | 176 | missing pinyin: 动词2:176 |
| 动词2 | 177 | missing pinyin: 动词2:177 |
| 动词2 | 178 | missing pinyin: 动词2:178 |
| 动词2 | 179 | missing pinyin: 动词2:179 |
| 动词2 | 180 | missing pinyin: 动词2:180 |
| 动词2 | 181 | missing pinyin: 动词2:181 |
| 动词2 | 182 | missing pinyin: 动词2:182 |
| 动词2 | 183 | missing pinyin: 动词2:183 |
| 动词2 | 184 | missing pinyin: 动词2:184 |
| 动词2 | 185 | missing pinyin: 动词2:185 |
| 动词2 | 186 | missing pinyin: 动词2:186 |
| 动词2 | 187 | missing pinyin: 动词2:187 |
| 动词2 | 188 | missing pinyin: 动词2:188 |
| 动词2 | 189 | missing pinyin: 动词2:189 |
| 动词2 | 190 | missing pinyin: 动词2:190 |
| 动词2 | 191 | missing pinyin: 动词2:191 |
| 动词2 | 192 | missing pinyin: 动词2:192 |
| 动词2 | 193 | missing pinyin: 动词2:193 |
| 动词2 | 194 | missing pinyin: 动词2:194 |
| 动词2 | 195 | missing pinyin: 动词2:195 |
| 动词2 | 196 | missing pinyin: 动词2:196 |
| 动词2 | 197 | missing pinyin: 动词2:197 |
| 动词2 | 198 | missing pinyin: 动词2:198 |
| 动词2 | 199 | missing pinyin: 动词2:199 |
| 动词2 | 200 | missing pinyin: 动词2:200 |
| 动词2 | 201 | missing pinyin: 动词2:201 |
| 动词2 | 202 | missing pinyin: 动词2:202 |
| 动词2 | 203 | missing pinyin: 动词2:203 |
| 动词2 | 204 | missing pinyin: 动词2:204 |
| 动词2 | 205 | missing pinyin: 动词2:205 |
| 动词2 | 206 | missing pinyin: 动词2:206 |
| 动词2 | 207 | missing pinyin: 动词2:207 |
| 动词2 | 208 | missing pinyin: 动词2:208 |
| 动词2 | 209 | missing pinyin: 动词2:209 |
| 动词2 | 210 | missing pinyin: 动词2:210 |
| 动词2 | 211 | missing pinyin: 动词2:211 |
| 动词2 | 212 | missing pinyin: 动词2:212 |
| 动词2 | 213 | missing pinyin: 动词2:213 |
| 动词2 | 214 | missing pinyin: 动词2:214 |
| 动词2 | 215 | missing pinyin: 动词2:215 |
| 动词2 | 216 | missing pinyin: 动词2:216 |
| 动词2 | 217 | missing pinyin: 动词2:217 |
| 动词2 | 218 | missing pinyin: 动词2:218 |
| 动词2 | 219 | missing pinyin: 动词2:219 |
| 动词2 | 220 | missing pinyin: 动词2:220 |
| 动词2 | 221 | missing pinyin: 动词2:221 |
| 动词2 | 222 | missing pinyin: 动词2:222 |
| 动词2 | 223 | missing pinyin: 动词2:223 |
| 动词2 | 224 | missing pinyin: 动词2:224 |
| 动词2 | 225 | missing pinyin: 动词2:225 |
| 动词2 | 226 | missing pinyin: 动词2:226 |
| 动词2 | 227 | missing pinyin: 动词2:227 |
| 动词2 | 228 | missing pinyin: 动词2:228 |
| 动词2 | 229 | missing pinyin: 动词2:229 |
| 动词2 | 230 | missing pinyin: 动词2:230 |
| 动词2 | 231 | missing pinyin: 动词2:231 |
| 动词2 | 232 | missing pinyin: 动词2:232 |
| 动词2 | 233 | missing pinyin: 动词2:233 |
| 动词2 | 234 | missing pinyin: 动词2:234 |
| 动词2 | 235 | missing pinyin: 动词2:235 |
| 动词2 | 236 | missing pinyin: 动词2:236 |
| 动词2 | 237 | missing pinyin: 动词2:237 |
| 动词2 | 238 | missing pinyin: 动词2:238 |
| 动词2 | 239 | missing pinyin: 动词2:239 |
| 动词2 | 240 | missing pinyin: 动词2:240 |
| 动词2 | 241 | missing pinyin: 动词2:241 |
| 动词2 | 242 | missing pinyin: 动词2:242 |
| 动词2 | 243 | missing pinyin: 动词2:243 |
| 动词2 | 244 | missing pinyin: 动词2:244 |
| 动词2 | 245 | missing pinyin: 动词2:245 |
| 动词2 | 246 | missing pinyin: 动词2:246 |
| 动词2 | 247 | missing pinyin: 动词2:247 |
| 动词2 | 248 | missing pinyin: 动词2:248 |
| 动词2 | 249 | missing pinyin: 动词2:249 |
| 动词2 | 250 | missing pinyin: 动词2:250 |
| 动词2 | 251 | missing pinyin: 动词2:251 |
| 动词2 | 252 | missing pinyin: 动词2:252 |
| 动词2 | 253 | missing pinyin: 动词2:253 |
| 动词2 | 254 | missing pinyin: 动词2:254 |
| 动词2 | 255 | missing pinyin: 动词2:255 |
| 动词2 | 256 | missing pinyin: 动词2:256 |
| 动词2 | 257 | missing pinyin: 动词2:257 |
| 动词2 | 258 | missing pinyin: 动词2:258 |
| 动词2 | 259 | missing pinyin: 动词2:259 |
| 动词2 | 260 | missing pinyin: 动词2:260 |
| 动词2 | 261 | missing pinyin: 动词2:261 |
| 动词2 | 262 | missing pinyin: 动词2:262 |
| 动词2 | 263 | missing pinyin: 动词2:263 |
| 动词2 | 264 | missing pinyin: 动词2:264 |
| 动词2 | 265 | missing pinyin: 动词2:265 |
| 动词2 | 266 | missing pinyin: 动词2:266 |
| 动词2 | 267 | missing pinyin: 动词2:267 |
| 动词2 | 268 | missing pinyin: 动词2:268 |
| 动词2 | 269 | missing pinyin: 动词2:269 |
| 动词2 | 270 | missing pinyin: 动词2:270 |
| 动词2 | 271 | missing pinyin: 动词2:271 |
| 动词2 | 272 | missing pinyin: 动词2:272 |
| 动词2 | 273 | missing pinyin: 动词2:273 |
| 动词2 | 274 | missing pinyin: 动词2:274 |
| 动词2 | 275 | missing pinyin: 动词2:275 |
| 动词2 | 276 | missing pinyin: 动词2:276 |
| 动词2 | 277 | missing pinyin: 动词2:277 |
| 动词2 | 278 | missing pinyin: 动词2:278 |
| 动词2 | 279 | missing pinyin: 动词2:279 |
| 动词2 | 280 | missing pinyin: 动词2:280 |
| 动词2 | 281 | missing pinyin: 动词2:281 |
| 动词2 | 282 | missing pinyin: 动词2:282 |
| 动词2 | 283 | missing pinyin: 动词2:283 |
| 动词2 | 284 | missing pinyin: 动词2:284 |
| 动词2 | 285 | missing pinyin: 动词2:285 |
| 动词2 | 286 | missing pinyin: 动词2:286 |
| 动词2 | 287 | missing pinyin: 动词2:287 |
| 动词2 | 288 | missing pinyin: 动词2:288 |
| 动词2 | 289 | missing pinyin: 动词2:289 |
| 动词2 | 290 | missing pinyin: 动词2:290 |
| 动词2 | 291 | missing pinyin: 动词2:291 |
| 动词2 | 292 | missing pinyin: 动词2:292 |
| 动词2 | 293 | missing pinyin: 动词2:293 |
| 动词2 | 294 | missing pinyin: 动词2:294 |
| 动词2 | 295 | missing pinyin: 动词2:295 |
| 动词2 | 296 | missing pinyin: 动词2:296 |
| 动词2 | 297 | missing pinyin: 动词2:297 |
| 动词2 | 298 | missing pinyin: 动词2:298 |
| 动词2 | 299 | missing pinyin: 动词2:299 |
| 动词2 | 300 | missing pinyin: 动词2:300 |
| 动词2 | 301 | missing pinyin: 动词2:301 |
| 动词2 | 302 | missing pinyin: 动词2:302 |
| 动词2 | 303 | missing pinyin: 动词2:303 |
| 动词2 | 304 | missing pinyin: 动词2:304 |
| 动词2 | 305 | missing pinyin: 动词2:305 |
| 动词2 | 306 | missing pinyin: 动词2:306 |
| 动词2 | 307 | missing pinyin: 动词2:307 |
| 动词2 | 308 | missing pinyin: 动词2:308 |
| 动词2 | 309 | missing pinyin: 动词2:309 |
| 动词2 | 310 | missing pinyin: 动词2:310 |
| 动词2 | 311 | missing pinyin: 动词2:311 |
| 动词2 | 312 | missing pinyin: 动词2:312 |
| 动词2 | 313 | missing pinyin: 动词2:313 |
| 动词2 | 314 | missing pinyin: 动词2:314 |
| 动词2 | 315 | missing pinyin: 动词2:315 |
| 动词2 | 316 | missing pinyin: 动词2:316 |
| 动词2 | 317 | missing pinyin: 动词2:317 |
| 动词2 | 318 | missing pinyin: 动词2:318 |
| 动词2 | 319 | missing pinyin: 动词2:319 |
| 动词2 | 320 | missing pinyin: 动词2:320 |
| 动词2 | 321 | missing pinyin: 动词2:321 |
| 动词2 | 322 | missing pinyin: 动词2:322 |
| 动词2 | 323 | missing pinyin: 动词2:323 |
| 动词2 | 324 | missing pinyin: 动词2:324 |
| 动词2 | 325 | missing pinyin: 动词2:325 |
| 动词2 | 326 | missing pinyin: 动词2:326 |
| 动词2 | 327 | missing pinyin: 动词2:327 |
| 动词2 | 328 | missing pinyin: 动词2:328 |
| 动词2 | 329 | missing pinyin: 动词2:329 |
| 动词2 | 330 | missing pinyin: 动词2:330 |
| 动词2 | 331 | missing pinyin: 动词2:331 |
| 动词2 | 332 | missing pinyin: 动词2:332 |
| 动词2 | 333 | missing pinyin: 动词2:333 |
| 动词2 | 334 | missing pinyin: 动词2:334 |
| 动词2 | 335 | missing pinyin: 动词2:335 |
| 动词2 | 336 | missing pinyin: 动词2:336 |
| 动词2 | 337 | missing pinyin: 动词2:337 |
| 动词2 | 338 | missing pinyin: 动词2:338 |
| 动词2 | 339 | missing pinyin: 动词2:339 |
| 动词2 | 340 | missing pinyin: 动词2:340 |
| 动词2 | 341 | missing pinyin: 动词2:341 |
| 动词2 | 342 | missing pinyin: 动词2:342 |
| 动词2 | 343 | missing pinyin: 动词2:343 |
| 动词2 | 344 | missing pinyin: 动词2:344 |
| 动词2 | 345 | missing pinyin: 动词2:345 |
| 动词2 | 346 | missing pinyin: 动词2:346 |
| 动词2 | 347 | missing pinyin: 动词2:347 |
| 动词2 | 348 | missing pinyin: 动词2:348 |
| 动词2 | 349 | missing pinyin: 动词2:349 |
| 动词2 | 350 | missing pinyin: 动词2:350 |
| 动词2 | 351 | missing pinyin: 动词2:351 |
| 动词2 | 352 | missing pinyin: 动词2:352 |
| 动词2 | 353 | missing pinyin: 动词2:353 |
| 动词2 | 354 | missing pinyin: 动词2:354 |
| 动词2 | 355 | missing pinyin: 动词2:355 |
| 动词2 | 356 | missing pinyin: 动词2:356 |
| 动词2 | 357 | missing pinyin: 动词2:357 |
| 动词2 | 358 | missing pinyin: 动词2:358 |
| 动词2 | 359 | missing pinyin: 动词2:359 |
| 动词2 | 360 | missing pinyin: 动词2:360 |
| 动词2 | 361 | missing pinyin: 动词2:361 |
| 动词2 | 362 | missing pinyin: 动词2:362 |
| 动词2 | 363 | missing pinyin: 动词2:363 |
| 动词2 | 364 | missing pinyin: 动词2:364 |
| 动词2 | 365 | missing pinyin: 动词2:365 |
| 动词2 | 366 | missing pinyin: 动词2:366 |
| 动词2 | 367 | missing pinyin: 动词2:367 |
| 动词2 | 368 | missing pinyin: 动词2:368 |
| 动词2 | 369 | missing pinyin: 动词2:369 |
| 动词2 | 370 | missing pinyin: 动词2:370 |
| 动词2 | 371 | missing pinyin: 动词2:371 |
| 动词2 | 372 | missing pinyin: 动词2:372 |
| 动词2 | 373 | missing pinyin: 动词2:373 |
| 动词2 | 374 | missing pinyin: 动词2:374 |
| 动词2 | 375 | missing pinyin: 动词2:375 |
| 动词2 | 376 | missing pinyin: 动词2:376 |
| 动词2 | 377 | missing pinyin: 动词2:377 |
| 动词2 | 378 | missing pinyin: 动词2:378 |
| 动词2 | 379 | missing pinyin: 动词2:379 |
| 动词2 | 380 | missing pinyin: 动词2:380 |
| 动词2 | 381 | missing pinyin: 动词2:381 |
| 动词2 | 382 | missing pinyin: 动词2:382 |
| 动词2 | 383 | missing pinyin: 动词2:383 |
| 动词2 | 384 | missing pinyin: 动词2:384 |
| 动词2 | 385 | missing pinyin: 动词2:385 |
| 动词2 | 386 | missing pinyin: 动词2:386 |
| 动词2 | 387 | missing pinyin: 动词2:387 |
| 动词2 | 388 | missing pinyin: 动词2:388 |
| 动词2 | 389 | missing pinyin: 动词2:389 |
| 动词2 | 390 | missing pinyin: 动词2:390 |
| 动词2 | 391 | missing pinyin: 动词2:391 |
| 动词2 | 392 | missing pinyin: 动词2:392 |
| 动词2 | 393 | missing pinyin: 动词2:393 |
| 动词2 | 394 | missing pinyin: 动词2:394 |
| 动词2 | 396 | missing pinyin: 动词2:396 |
| 动词2 | 397 | missing pinyin: 动词2:397 |
| 动词2 | 398 | missing pinyin: 动词2:398 |
| 动词2 | 399 | missing pinyin: 动词2:399 |
| 动词2 | 400 | missing pinyin: 动词2:400 |
| 动词2 | 401 | missing pinyin: 动词2:401 |
| 动词2 | 402 | missing pinyin: 动词2:402 |
| 动词2 | 403 | missing pinyin: 动词2:403 |
| 动词2 | 404 | missing pinyin: 动词2:404 |
| 动词2 | 405 | missing pinyin: 动词2:405 |
| 动词2 | 406 | missing pinyin: 动词2:406 |
| 动词2 | 407 | missing pinyin: 动词2:407 |
| 动词2 | 408 | missing pinyin: 动词2:408 |

## Not committed

- Source text (Simplified, pinyin, Japanese, Traditional Chinese)
- Workbook bytes
- Image files or image filenames
- Personal or absolute filesystem paths

## Downstream instruction

Create per-batch text/review/image/publication issues only from the merged JSON plan at `docs/content/teacher-core-v1-expansion-plan.json`. The JSON plan is the authoritative source for:

- vocabulary IDs and expected illustration IDs
- source sheet and source row for every remaining accepted row and every rejected row
- deterministic ordering and batch boundaries
- rejection reasons

Batch-01's full source provenance (sourceSheet, sourceRow) is already stored in the production `teacher-vocabulary-batch-01.json` file — refer to it directly for accepted row details.

Do not derive batch structure from the raw importer output or from this Markdown report.
