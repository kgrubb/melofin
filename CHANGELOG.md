# Changelog

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Gapless local transitions (always on): prime next URI, cover EOF on secondary, seek-match primary
- Lock screen Now Playing updates at gapless handoff start (title/art); clear stale artwork while the new image loads
- Crossfade (Off / 5s / 8s / 12s): local overlap fade; cast ignores
- Start radio track action (Instant Mix + padding into a shuffled queue with Autoplay on)
- Autoplay (default on): when a queue ends with repeat off, keep playing similar Instant Mix tracks. Settings + Now Playing infinity toggle, Recommended section in Queue
- Direct Play stream candidates first (FLAC/ALAC/AAC/MP3 static) with universal + `/stream.mp3` failover. Report real `playMethod`
- Per-account offline indexes, packs, and audio/lyrics paths
- CarPlay browse: albums tab, artist/album "More..." paging, Play all downloads queue (flag still off until `com.apple.developer.carplay-audio` entitlement)
- Keep offline sync packs for albums/playlists
- Multi-Jellyfin accounts in Settings (Add server / switch / long-press remove) with per-account offline indexes + packs
- Synced + plain lyrics on Now Playing (Jellyfin Lyrics API, tap line to seek, offline lyrics sidecar on download)
- Genre browse (Library Genres segment -> albums)
- Stream/download quality presets (Wi-Fi, cellular, Automatic, download) with MP3 bitrate tiers
- ReplayGain Off/Track/Album volume normalization (<=100%, needs Jellyfin LUFS/tags)
- CarPlay list item play wiring (flag remains off until entitlement)
- Library sort/filter (Name, Date added, Recently played / All, Favorites, Unplayed) and Mark played/unplayed
- Play next + shared track action menus. Queue swipe-remove, Move up/down, and Clear upcoming
- Favorite / unfavorite (Jellyfin UserLibrary) with Now Playing heart and long-press actions
- Per-download delete from Downloads. Sleep timer (presets + end of track)
- Liquid Glass via `expo-glass-effect` (`GlassView` / `GlassContainer`, BlurView fallback)
- Spotty-network playback: prefer local files, stall failover to disk, Jellyfin reachability, adaptive prefetch (5 Wi-Fi / 2 cellular). Undownloaded tracks still need the server
- Offline listen sync: completed listens (4 min or half the track) that fail to report while offline are queued and flushed on reconnect
- Devices casting: AirPlay (iOS), Chromecast, and Jellyfin remote sessions
- Playlist create, rename, delete, and add/remove tracks synced with Jellyfin
- Artist and album links from Now Playing (dismisses into the collection screen)
- Lock-screen / Control Center next and previous track controls (`expo-audio` patch)
- CarPlay gated behind a `CARPLAY_ENABLED` feature flag (templates + play wiring ready, awaiting `com.apple.developer.carplay-audio` on App ID `app.melio.player`)

### Changed

- Dependency bumps within Expo SDK 54: zustand 5.0.15, @shopify/flash-list 2.3.2, vitest 4.1.10, react-native-web 0.21.2 (Expo packages stay on SDK 54)
- Downloads is collection-first (Albums / Playlists / Songs) with Play/Shuffle, a storage meter + limit picker, and artwork rows. Prefetch cache is listed and playable like explicit downloads
- Home shows Continue Listening, Favorites, and artists as soon as listen history returns. Albums, playlists, and genres follow on their own
- Your Mixes: 6 Instant Mix cards from top artists (genre fill), seed-based titles, disk cache for a day, rebuild on Home focus or app foreground
- Instant Mix filters cross-genre noise. Home layout is greeting + chips, then mixes / artists / recently added / genres / continue / playlists / favorites
- Library Sync Now uses the same incremental song path as On open (full pull only on first sync, schema bump, or count mismatch). Wi-Fi pages songs in larger parallel pairs. Failed full pulls leave the on-device catalog intact
- Queue drag-reorder lifts the row and opens a drop gap while dragging
- Queue lists now-playing + upcoming only (linear matches shuffle)
- Settings Sync Now is an accent action with live sync % / phase on the row
- Streaming Automatic explains High-on-Wi-Fi / Normal-on-cellular under the group
- Remote playback prefers Direct Play when decodable. MP3 transcoder remains last-resort failover
- Library songs use SQLite with a keyset-paged Zustand window. Play-all pages ids from SQLite
- Offline index is JSON-only (removed SQLite dual-write), stored per account under `scopes/<key>/`
- Atomic JSON writes (temp + rename)
- Faster remote track transitions: shorter first-URI failover, pause downloads during handoff, prefer local prefetch only when the file exists, 250ms safety cap if AVPlayer hangs on a corrupt file
- Floating tab bar + mini player: iOS 26 platter geometry (62pt capsule, 21pt margin, equal-width selection) with BlurView fallback
- Now Playing dismisses as a vertical sheet/drawer (slide + fade, no scale morph into the mini player)
- Collections live under a `(main)` stack with shared floating tab bar / mini player chrome
- Local iOS builds target macOS 15 / Xcode 16.4 (Expo SDK 54)

### Fixed

- Lock screen / CarPlay keep the pause glyph between tracks
- Artist albums tab unions album-artist, appears-on, contributing, and song-derived albums
- Explore Your Genres keeps catalog artwork and ranks genres from listening
- Home shows empty/error only after listen history and remaining rails settle
- Direct Play uses extensionless `/stream?static=true` (AVPlayer sniffs Content-Type) instead of guessing `.flac`/`.m4a` first. Silent "playing" candidates fail over to universal/MP3. Prefetch failures log as warnings
- Instant Mix / radio queues no longer label every track Recommended (that badge is only for Autoplay refill)
- Queue row height matches TrackRow (drag/scrub offsets were 4px short per row)
- Tapping a shuffled Queue row plays it without dropping the other upcoming tracks
- Removing a queued track no longer reshuffles remaining play order
- Collection Shuffle toggles shuffle without auto-starting playback (Play still starts the collection)
- Account switch no longer deletes the previous account's downloads (per-account offline index + packs)
- Settings Autoplay stays in sync with the Now Playing infinity session toggle
- Removed Settings Gapless toggle (always on for local playback); EQ remains hidden until AVAudioEngine insert
- Autoplay / cast near-EOF no longer double-advances
- Artist Songs uses ArtistIds (not ParentId)
- Previous >3s seeks cast sinks
- Jellyfin remote play passes startIndex + NowPlaying itemId
- Chromecast queue follows shuffle. Enqueue appends shuffle order
- CarPlay artist play uses ArtistIds
- Cast fail falls back to local UI
- Jellyfin status won't snap to duplicate item ids
- Previous at queue start seeks. Remote syncs on queue/shuffle edits
- Chromecast buffering no longer pauses the session. Melio scrobbles Chromecast
- Clear upcoming + Jellyfin remote respect shuffle order
- Stale Library songs expand ignored after a new play
- Remove current follows shuffle-next. Collection Shuffle starts that collection
- Cast advances past a finished window
- Chromecast Repeat All no longer loops the 20-track window
- Cast honors end-of-track sleep
- Queue list follows shuffle order from the current track
- Native Songs SQLite keeps favorite/played/date/ReplayGain
- Jellyfin remote status picks the next duplicate itemId in play order
- Songs A-Z scrub matches the filtered list
- Non-name Play loads the full catalog
- Favorite/played patches write SQLite
- Unknown duration doesn't auto mark-played
- Guard missing ExpoSQLite / null CastContext (no uncaught console crashes)
- Break settings<->downloader require cycle
- No mid-play write-through of the active stream (prefetch upcoming only)
- Empty track Artists inherit album/sibling artists. ArtistItems fallbacks. Sync progress UI
- Shuffle keeps the playing track first in order
- Listen Now rail no longer collapses to a single Instant Mix seed. Pads with artist / recently played / random tracks
- Lock screen / CarPlay Now Playing progress: supply Jellyfin track duration when native stream duration is 0/NaN (`expo-audio` metadata)
- Auto-advance after track end when native duration is unknown. Clear stuck `advancing` so the next song still starts
- Mid-track reload after a network blip no longer restarts from 0. Resume seek is guarded and near-zero position snaps are rejected
- Playback handoff: no double-skip while the prior item is still at EOF, no stall-failover replace loops at t=0, re-bind lock screen on resume
- Now Playing / scrubber performance: throttle lock-screen updates, cache artwork, smoother in-app progress (ignore engine sync ticks), lock-screen play/pause/seek sync through Melio
- Shuffle builds a fresh random order each time (was seeded from playlist length, so every shuffle of the same list played identically)
- Casting: AirPlay module now autolinks (podspec). Cast router no longer shadows `state` (broke remote play/pause and transfer timeouts). Devices sheet shows Cast button so iOS can grant Local Network
- Scrub/seek no longer snaps back (esp. seeking backwards). Seek guard keeps the target and retries instead of accepting stale native time
- First scrub waits for the playback engine before seekTo, so UI position and audio stay in sync
- Seek immediately reports PlaybackProgress to Jellyfin (was only on a 10s interval)
- Playstate Start/Progress/Stop are serialized so Progress cannot race ahead of Start
- Now Playing dismiss gesture no longer wraps the scrubber (gesture steal on first drag)
- Now Playing cover art uses a 2048px hero URL and its own image cache, so the mini player's 44pt decode is not reused
- Pause/unpause no longer mints a new PlaySessionId or re-sends PlaybackStart (Jellyfin scrobbling)
- Play session IDs no longer use `crypto.randomUUID` (unavailable in Hermes). Was aborting load before audio started
- Play intents re-bind the playback engine after Fast Refresh
- Playback uses `/Audio/{id}/stream.mp3` so AVPlayer can decode remote Jellyfin streams

## [1.0.0] - 2026-08-04

### Added

- Expo 54 Melio client: Jellyfin auth (password, Quick Connect, SSO)
- Library browse/search, queue player, offline downloads + prefetch
- Playstate reporting, CarPlay templates
- Lint, typecheck, Vitest >=85%, GitHub Actions CI
- Local iOS builds on macOS 15 / Xcode 16.4 (SDK 54, not Expo 55+)
