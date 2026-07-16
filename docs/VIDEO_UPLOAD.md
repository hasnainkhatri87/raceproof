# RaceProof video upload package

Use [the voiceover-ready visual master](assets/raceproof-build-week-visual-master.mp4) as the video edit. It is a real recording of the working RaceProof application, framed with title and Build Week cards.

- Duration: 2 minutes 36 seconds
- Format: 1280x720 H.264 video, no audio track
- Voiceover: [VOICEOVER_CUES.md](VOICEOVER_CUES.md)
- Captions: [raceproof-build-week-demo.srt](assets/raceproof-build-week-demo.srt)
- Repeatable capture: `scripts/record-demo.mjs`

## Suggested YouTube metadata

**Title:** RaceProof - Explore the timelines your tests never run

**Description:**

RaceProof is a deterministic concurrency-testing tool for TypeScript. It explores bounded event orderings, finds invariant violations, minimizes the resulting counterexample, supports step-by-step replay, and exports a Vitest regression test.

This walkthrough demonstrates the Duplicate Payment race, replay and test export, the fixed bounded-safe result, and the included inventory and chat examples. It also explains how GPT-5.6 and Codex were used during development. RaceProof itself has no AI runtime, API key, model dependency, or remote service requirement.

Source: https://github.com/hasnainkhatri87/raceproof

## Finalize the video

1. Record your voice against the cue sheet.
2. Combine the voice track with the visual master in a video editor.
3. Export H.264 video with AAC audio at 1280x720 or higher.
4. Upload the SRT captions to YouTube and set the video to **Public**.
5. Paste the public YouTube URL into Devpost.
