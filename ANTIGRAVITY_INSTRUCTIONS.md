# Antigravity IDE: existing BallBattlee v20 simulator SFX integration

Use only the WAV files in `sfx/`. Inspect the current project, then integrate the existing events using `sound-map.json`.

Requirements:
- Preserve all game mechanics, visuals, strings, rendering, user data, and export features.
- Preload/decode via Web Audio API AudioBuffers or reuse the project's existing audio engine.
- Bind string snap ONLY to a confirmed one-time string-break event, deduped by permanent string ID.
- Choose randomly among four provided string snap WAV variations. Do not synthesize or replace these samples.
- Use at most 2 overlapping snap voices initially and about 55ms minimum separation between accepted snaps; adjust only based on testing. Never queue a late backlog; drop redundant/excess audio only, not visual break events.
- Map wall collisions, participant collisions, circle growth, acceleration state, eliminations, final duel, match start, and victory to their matching WAVs.
- Avoid sounds being retriggered on each frame or continuous contact. Keep per-event cooldowns.
- Keep combined output clean without clipping. Avoid unnecessary new dependencies.
- Check sound after a full 8-player simulation and after multiple simultaneous string breaks. Preserve original audio files alongside these for safe rollback.
