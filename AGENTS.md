# Project notes

- Desktop shell (electron/) loads published /mate, /tray-menu, /mainframe pages; settings live in browser storage shared across those windows, and local/custom AI calls go through the main process to avoid browser restrictions.
- The separate vercel-pairing deployment forwards only the phone screen and required assets/RPC/transcription to the published app; it does not deploy desktop pages or replace the hosted backend.
- Both chat surfaces use the shared browser-storage memory module for explicit saved facts and recent conversation; this keeps desktop windows consistent without cloud account requirements.
- Startup news topics are saved as manageable user memory; desktop launches offer opt-in headlines from dated public RSS via a bounded server function, never invented news.
- Resolve Discord channel names through the shared selection module and keep pending relay actions in the companion until a unique channel is selected; this prevents accidental joins and preserves follow-up intent.
- Sequence Discord self-muting through the tested relay helper after successful playback; Windows automation must detect Mute/Unmute state rather than blindly toggle it.
- Phone remote exchanges a hashed, 60-bit single-use code expiring after ten minutes atomically for a separate high-entropy phone capability; desktop/phone tokens are hashed in private tables and verified server-side before device-scoped access. Commands are Discord-only, atomically claimed, short-lived, and executed by the existing mate action path.
