// Universal media engine: virtual media keys + "what's playing?" across Spotify, browsers, foobar2000, Winamp, MusicBee, AIMP and Linux MPRIS.

export type MediaAction = "playpause" | "next" | "previous" | "volumeup" | "volumedown" | "volumemute" | "whatsplaying";

const strip = (t: string) => t.trim().replace(/[.!?]+$/, "").replace(/^(?:can you |could you |would you |please |jarvis,? )+/i, "").trim();

export function parseMediaCommand(text: string): MediaAction | null {
  const s = strip(text).toLowerCase();
  if (!s) return null;
  if (/\bwhat'?s (?:playing|this|the song)|what is playing|what(?:'s| is) this song|now playing|what am i listening/.test(s)) return "whatsplaying";
  if (/^(?:un)?mute (?:the )?(?:volume|media|sound|audio)$/.test(s) || /^(?:mute|unmute)$/.test(s)) return "volumemute";
  if (/^(?:pause|resume)(?: it| playback| the music| the song| the track| the media| the video| music| media| that)?$/.test(s)) return "playpause";
  if (/^(?:play)(?: something| music| some music| the music| it back)?$/.test(s)) return "playpause";
  if (/^(?:next|skip)(?: track| song| it| this)?$/.test(s) || /^go to the next (?:track|song)$/.test(s)) return "next";
  if (/^(?:previous|last|go back|rewind)(?: track| song| it| this)?$/.test(s)) return "previous";
  if (/volume up|louder|turn (?:the volume |it )?up$/.test(s)) return "volumeup";
  if (/volume down|quieter|turn (?:the volume |it )?down$/.test(s)) return "volumedown";
  return null;
}

export type Playing = { player: string; title: string } | null;

/** Jarvis's spoken line for a media action. */
export function mediaReply(action: MediaAction, playing?: Playing): string {
  switch (action) {
    case "playpause": return playing ? `Toggled playback${playing.title ? ` — "${playing.title}"` : ""}, sir.` : "Toggled playback, sir.";
    case "next": return "Skipping ahead, sir.";
    case "previous": return "Back to the previous track, sir.";
    case "volumeup": return "Volume up, sir.";
    case "volumedown": return "Volume down, sir.";
    case "volumemute": return "Media volume toggled, sir.";
    case "whatsplaying": return playing ? `Now playing "${playing.title}" on ${playing.player}, sir.` : "Nothing seems to be playing right now, sir.";
  }
}

/** Cleans a raw player window title into a readable "Artist - Song". */
export function cleanNowPlaying(player: string, title: string): { player: string; title: string } {
  let t = title.trim();
  // Winamp numbers tracks ("1. Artist - Song") and most players append their own name.
  t = t.replace(/^\s*\d+\.\s*/, "");
  t = t.replace(new RegExp(`\\s*[-–—]\\s*${player}\\s*$`, "i"), "");
  t = t.replace(/\s*-\s*YouTube\s*$/i, "");
  return { player, title: t || title.trim() };
}
