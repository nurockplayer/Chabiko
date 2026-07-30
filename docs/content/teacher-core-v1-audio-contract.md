# Teacher Core V1 Audio Contract

## Decision

The first pronunciation release uses static audio generated once through **Microsoft Azure AI Speech** on a paid Speech resource.

| Field | Frozen value |
|---|---|
| Source type | `generated-tts` |
| Product | Microsoft Azure AI Speech, prebuilt Standard Neural Text-to-Speech |
| Locale | `zh-TW` |
| Voice ID | `zh-TW-HsiaoChenNeural` |
| Region | `japaneast` |
| REST endpoint | `https://japaneast.tts.speech.microsoft.com/cognitiveservices/v1` |
| Output format | `audio-24khz-48kbitrate-mono-mp3` |
| Review status | `draft` |

Azure lists `zh-TW-HsiaoChenNeural` as a standard female voice for Chinese Taiwanese Mandarin in Traditional Chinese. Japan East supports neural text to speech and the REST endpoint above.

Official references:

- [Azure Speech language and voice support](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/language-support)
- [Azure Speech supported regions](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/regions)
- [Text to speech REST API and audio outputs](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-text-to-speech)
- [Microsoft Product Terms for Azure Text-to-Speech output use rights](https://www.microsoft.com/licensing/terms/en-US/productoffering/MicrosoftAzureServices/MCA)

## Why static committed audio

Static committed files are used instead of browser `speechSynthesis` or runtime provider calls because the learner must receive the same reviewed pronunciation on every supported browser. Runtime synthesis would vary by operating system, installed voices, browser behavior, network availability, account configuration, and later provider changes. Static files also keep credentials and provider dependencies out of the learner runtime.

The selected voice is appropriate for this provisional release because its declared locale is Taiwanese Mandarin (`zh-TW`), it is a stable prebuilt Standard neural voice rather than a preview HD or custom voice, and its neutral female presentation is suitable for isolated beginner vocabulary. This is still a provisional source decision, not a claim that automated speech is equivalent to teacher-recorded pronunciation.

## Permission decision

The source must be generated with a **paid Azure Text-to-Speech tier**. Microsoft Product Terms state that paid-tier customers may use audio output from prebuilt neural voices, including commercially. The project owns or is authorized to submit the teacher-provided vocabulary text. No custom voice, voice cloning, free-tier output, or third-party source recording is authorized by this contract.

Permission status in the contract is therefore:

```text
approved-for-provisional-web-use
```

This approval applies only to audio generated from the exact frozen request contract below through the paid tier. It does not clear the teacher workbook itself, change the pending rights status of teacher-provided images, or authorize reuse of another person's recording.

## Exact generation contract

Generate one vocabulary item per request. The request must use:

```http
POST https://japaneast.tts.speech.microsoft.com/cognitiveservices/v1
Content-Type: application/ssml+xml
X-Microsoft-OutputFormat: audio-24khz-48kbitrate-mono-mp3
```

Authentication is supplied only at generation time and must never be committed.

The UTF-8 SSML body is serialized from this exact template, with XML escaping applied only to `spokenText`:

```xml
<speak version="1.0" xml:lang="zh-TW"><voice name="zh-TW-HsiaoChenNeural"><prosody rate="0%" pitch="0%">{spokenText}</prosody></voice></speak>
```

Generation rules:

1. Require HTTP `200`.
2. The generation step must save the response body byte-for-byte as the expected source filename.
3. Do not concatenate items.
4. Do not transcode, trim, normalize, denoise, resample, or otherwise modify the response.
5. #178 must record each committed file checksum, duration, MIME type, sample rate, channel count, and size.
6. A later regeneration is a new source event. It must not silently replace reviewed bytes, even when the request settings are unchanged.

## Derivative format and browser rationale

The committed derivative is mono MP3 at 24 kHz and 48 kbit/s, exposed as `audio/mpeg`. MP3 is directly playable through native HTML audio in the target browsers, while 24 kHz mono is sufficient for short isolated speech and keeps the 20-file corpus small.

Each file must satisfy:

- extension: `.mp3`
- MIME type: `audio/mpeg`
- codec: MPEG Audio Layer III
- sample rate: `24000` Hz
- channels: `1`
- nominal bitrate: `48 kbit/s`
- maximum duration: `6000` ms
- maximum size: `65536` bytes
- normalization: none; Azure response bytes remain unchanged

## Frozen spoken forms

Item order exactly matches `data/vocabulary/teacher-core-v1/teacher-vocabulary-batch-01.json`.

| # | Vocabulary ID | Spoken text | Override reason | Source filename |
|---:|---|---|---|---|
| 1 | `teacher-star-1-37e0eb213f0f` | 大家 | None | `audio-teacher-star-1-37e0eb213f0f.mp3` |
| 2 | `teacher-star-1-a66948a76fda` | 人 | None | `audio-teacher-star-1-a66948a76fda.mp3` |
| 3 | `teacher-star-1-86f5cdb6e25c` | 客人 | None | `audio-teacher-star-1-86f5cdb6e25c.mp3` |
| 4 | `teacher-star-1-bdc7865a507e` | 朋友 | None | `audio-teacher-star-1-bdc7865a507e.mp3` |
| 5 | `teacher-star-1-86367b2d53f6` | 先生 | None | `audio-teacher-star-1-86367b2d53f6.mp3` |
| 6 | `teacher-star-1-8b957a100bd4` | 小姐，女士 | Visible text uses "/" as a learner-facing alternative separator; synthesized speech replaces it with a full-width comma so both terms are pronounced naturally. | `audio-teacher-star-1-8b957a100bd4.mp3` |
| 7 | `teacher-star-1-2cfcacc0503e` | 自己 | None | `audio-teacher-star-1-2cfcacc0503e.mp3` |
| 8 | `teacher-star-1-e7bc12c4f23a` | 爸爸 | None | `audio-teacher-star-1-e7bc12c4f23a.mp3` |
| 9 | `teacher-star-1-e64490a207eb` | 妈妈 | None | `audio-teacher-star-1-e64490a207eb.mp3` |
| 10 | `teacher-star-1-bada4e11125d` | 父亲 | None | `audio-teacher-star-1-bada4e11125d.mp3` |
| 11 | `teacher-star-1-d903f490725f` | 母亲 | None | `audio-teacher-star-1-d903f490725f.mp3` |
| 12 | `teacher-star-1-7420330fee5c` | 哥哥 | None | `audio-teacher-star-1-7420330fee5c.mp3` |
| 13 | `teacher-star-1-ed096023b3be` | 姐姐 | None | `audio-teacher-star-1-ed096023b3be.mp3` |
| 14 | `teacher-star-1-cb42fb8775e5` | 弟弟 | None | `audio-teacher-star-1-cb42fb8775e5.mp3` |
| 15 | `teacher-star-1-c39a19585434` | 妹妹 | None | `audio-teacher-star-1-c39a19585434.mp3` |
| 16 | `teacher-star-1-3e6fabf09358` | 爱人 | None | `audio-teacher-star-1-3e6fabf09358.mp3` |
| 17 | `teacher-star-1-1c0cdf0b2b9c` | 丈夫 | None | `audio-teacher-star-1-1c0cdf0b2b9c.mp3` |
| 18 | `teacher-star-1-8fea4ac29b4c` | 妻子 | None | `audio-teacher-star-1-8fea4ac29b4c.mp3` |
| 19 | `teacher-star-1-94757170c2b0` | 孩子 | None | `audio-teacher-star-1-94757170c2b0.mp3` |
| 20 | `teacher-star-1-0cc5799cdbbc` | 儿子 | None | `audio-teacher-star-1-0cc5799cdbbc.mp3` |

Only `小姐/女士` uses a spoken-form override. The visible slash is a learner-facing alternative separator; `小姐，女士` ensures that both terms are pronounced with a natural pause. Every other item uses the exact visible Simplified field as `spokenText`.

Audio IDs and paths are deterministic:

```text
audioId = audio-{vocabularyId}
source filename = {audioId}.mp3
committed path = public/assets/audio/teacher-core-v1/{audioId}.mp3
spokenTextSha256 = sha256(UTF-8 "zh-TW|{vocabularyId}|{spokenText}")
```

## Pronunciation review policy

All files begin at `draft`. Before playback metadata can be treated as reviewed, every one of the 20 files must pass all checks below:

1. The audio pronounces the exact frozen `spokenText`.
2. A Taiwanese Mandarin teacher or native reviewer confirms lexical reading and tones.
3. Neutral-tone handling and Taiwanese Mandarin pronunciation are acceptable for beginners.
4. There is no truncation, click, excessive silence, or synthesis artifact.
5. Intelligibility and perceived level are reasonably consistent across the set.
6. Filename, checksum, duration, MIME type, sample rate, channel count, and file size match the contract.

A failed item blocks only its own publication, but #178 must not claim a complete 20-file corpus until all items exist and pass deterministic binary validation.

## Stop conditions

Stop generation or publication when any of these is true:

- the Azure resource is not on a paid tier;
- the selected voice ID or locale is unavailable;
- the endpoint, voice, SSML, or output format differs from the frozen contract;
- a response is not HTTP `200`;
- a file exceeds the duration or size limit;
- decoded metadata differs from 24 kHz mono MP3;
- the exact spoken form or reading override is disputed;
- permission terms no longer support the intended use;
- credentials, provider logs, personal paths, or unapproved source bytes would be committed.

## Remaining limitations

The voice is generated TTS and remains provisional. Provider implementation changes can alter later responses even when the public voice ID remains stable, so reviewed files are identified by their committed checksums and must not be regenerated casually. A future teacher-recorded corpus requires a separate source contract and permission record.
