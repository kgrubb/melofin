# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Synced + plain lyrics on Now Playing (Jellyfin Lyrics API, tap line to seek, offline lyrics sidecar on download)
- Genre browse (Library Genres segment → albums)
- Stream/download quality presets (Wi‑Fi, cellular, Automatic, download) with MP3 bitrate tiers
- ReplayGain Off/Track/Album volume normalization (≤100%; needs Jellyfin LUFS/tags)
- CarPlay list item play wiring (flag remains off until entitlement)
- Library sort/filter (Name, Date added, Recently played; All/Favorites/Unplayed) and Mark played/unplayed
- Play next + shared track action menus; queue swipe-remove, Move up/down, and Clear upcoming
- Favorite / unfavorite (Jellyfin UserLibrary) with Now Playing heart and long-press actions
- Per-download delete from Downloads; Spotify-style sleep timer (presets + end of track)
- Liquid Glass retrofit via official `expo-glass-effect` (`GlassView` / `GlassContainer`, dual availability gates, BlurView fallback)
- Spotty-network playback: prefer local files, stall failover to disk, Jellyfin reachability, adaptive prefetch (5 Wi‑Fi / 2 cellular). Undownloaded tracks still need the server
- Offline Jellyfin listen sync: qualifying completed listens (4 min or half the track) that fail to report while offline are queued and flushed on reconnect via PlaybackStart/Stop plus MarkPlayedItem(datePlayed). ListenBrainz timestamps for delayed flushes reflect approximately when Melio regained network (Jellyfin has no historical playstate import yet)
- Spotify-style Devices casting: AirPlay (iOS), Chromecast, and Jellyfin remote sessions
- Playlist create, rename, delete, and add/remove tracks synced with Jellyfin
- Artist and album links from Now Playing (dismisses into the collection screen)
- Lock-screen / Control Center next and previous track controls (`expo-audio` patch)
- CarPlay gated behind a `CARPLAY_ENABLED` feature flag
- Domain tests for audio-session playback rules and pause/resume scrobble intents

### Changed

- Gapless playback evaluated on stock `expo-audio` (single-player replace); deferred — needs an audio-stack change beyond Melio’s deny-list
- Remote streams report `playMethod: Transcode` when not playing from the offline cache
- Library songs use SQLite as catalog source of truth with a keyset-paged Zustand window (lower RAM on large libraries); play-all pages ids from SQLite
- Offline index is JSON-only (removed SQLite dual-write)
- Playback engine split into load/scrobble/lifecycle modules; cast uses `outputPolicy` instead of importing the engine
- Atomic JSON writes (temp + rename) for crash-safer caches
- Faster remote track transitions: shorter first-URI failover, pause downloads during handoff; prefer local prefetch only when the file exists (sync check), with a 250ms safety cap if AVPlayer hangs on a corrupt file
- Now Playing is full-screen and morphs back into the mini player on dismiss
- Collections live under a `(main)` stack with shared floating tab bar / mini player chrome
- Local iOS builds target macOS 15 / Xcode 16.4 (Expo SDK 54)

### Fixed

- Artist Songs uses ArtistIds (not ParentId); Previous >3s seeks cast sinks; Jellyfin remote play passes startIndex + NowPlaying itemId; Chromecast queue follows shuffle; enqueue appends shuffle order
- CarPlay artist play uses ArtistIds; cast fail falls back to local UI; Jellyfin status won’t snap to duplicate item ids; Previous at queue start seeks; remote syncs on queue/shuffle edits
- Chromecast buffering no longer pauses the session; Melio scrobbles Chromecast; Clear upcoming + Jellyfin remote respect shuffle order
- Stale Library songs expand ignored after a new play; remove current follows shuffle-next; collection Shuffle starts that collection; Cast advances past a finished window
- Chromecast Repeat All no longer loops the 20-track window; cast honors end-of-track sleep; Queue list follows shuffle order from the current track
- Native Songs SQLite keeps favorite/played/date/ReplayGain; Jellyfin remote status picks the next duplicate itemId in play order
- Songs A–Z scrub matches the filtered list; non-name Play loads the full catalog; favorite/played patches write SQLite; unknown duration doesn’t auto mark-played
- Guard missing ExpoSQLite / null CastContext (no uncaught console crashes); break settings↔downloader require cycle
- No mid-play write-through of the active stream (prefetch upcoming only)
- Empty track Artists inherit album/sibling artists; ArtistItems fallbacks; sync progress UI
- Shuffle keeps the playing track first in order
- Listen Now rail no longer collapses to a single Instant Mix seed — pads with artist / recently played / random tracks
- Lock screen / CarPlay Now Playing progress: supply Jellyfin track duration when native stream duration is 0/NaN (`expo-audio` metadata)
- Auto-advance after track end when native duration is unknown; clear stuck `advancing` so the next song still starts
- Mid-track reload after a network blip no longer restarts from 0 — resume seek is guarded and near-zero position snaps are rejected
- Playback handoff hardening: no double-skip while the prior item is still at EOF, no stall-failover replace loops at t=0, re-bind lock screen on resume
- Now Playing / scrubber performance: throttle lock-screen updates, cache artwork, smoother in-app progress (ignore engine sync ticks), lock-screen play/pause/seek sync through Melio
- Shuffle builds a fresh random order each time (was seeded from playlist length, so every shuffle of the same list played identically)
- Casting: AirPlay module now autolinks (podspec); cast router no longer shadows `state` (broke remote play/pause and transfer timeouts); Devices sheet shows Cast button so iOS can grant Local Network
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
