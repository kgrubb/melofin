# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Playlist create, rename, delete, and add/remove tracks synced with Jellyfin
- Domain tests for audio-session playback rules and pause/resume scrobble intents

### Fixed

- Scrub/seek no longer snaps back (esp. seeking backwards) — seek guard keeps the target and retries instead of accepting stale native time
- First scrub waits for the playback engine before seekTo, so UI position and audio stay in sync
- Seek immediately reports PlaybackProgress to Jellyfin (was only on a 10s interval)
- Playstate Start/Progress/Stop are serialized so Progress cannot race ahead of Start
- Now Playing dismiss gesture no longer wraps the scrubber (gesture steal on first drag)
- Pause/unpause no longer mints a new PlaySessionId or re-sends PlaybackStart (Jellyfin scrobbling)
- Play session IDs no longer use `crypto.randomUUID` (unavailable in Hermes) — was aborting load before audio started
- Play intents re-bind the playback engine after Fast Refresh so UI “playing” cannot orphan a dead player
- Playback uses `/Audio/{id}/stream.mp3` so AVPlayer can decode remote Jellyfin streams

## [1.0.0] - 2026-08-04

### Added

- Expo 54 Melio client: Jellyfin auth (password, Quick Connect, SSO)
- Library browse/search, queue player, offline downloads + prefetch
- Playstate reporting, CarPlay templates
- Lint, typecheck, Vitest ≥85%, GitHub Actions CI
- Local iOS builds on macOS 15 / Xcode 16.4 (SDK 54; not Expo 55+)
