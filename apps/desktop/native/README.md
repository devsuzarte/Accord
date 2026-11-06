# native/

Reserved for a **per-process audio** addon (WASAPI process loopback, Windows 10 2004+).

Still empty: stream audio currently uses `loopback-capture` + `koffi` (`src/main/share/native-audio.ts`). Whether to fork it or write our own with napi-rs is tracked in `docs/02-architecture.md` › Screen sharing and `docs/05-roadmap.md` › Phase 0.
