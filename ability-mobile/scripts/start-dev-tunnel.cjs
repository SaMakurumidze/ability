/**
 * Legacy entrypoint kept for npm `start`.
 * We now always launch via the iOS-safe LAN startup to avoid stale tunnel URLs.
 */
require('./start-ios-safe.cjs');
