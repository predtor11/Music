export function tuningText(cents: number): string {
  if (Math.abs(cents) <= 5) return 'In tune';
  return `${Math.round(Math.abs(cents))} cents ${cents < 0 ? 'flat' : 'sharp'}`;
}

export const MICROPHONE_HELP = {
  idle: 'Play one string at a time. Start the microphone to see the note and how close it is to being in tune.',
  requesting: 'Allow microphone access in your browser. You can cancel while it asks.',
  listening: 'Listening. Pluck one string, then let it ring. Mute the other strings.',
  denied: 'Microphone access was denied. Allow it in your browser’s site settings, then try again. You can still tap the fretboard.',
  unsupported: 'Microphone input needs a browser with microphone access on HTTPS or localhost. You can still tap the fretboard.',
  error: 'The microphone could not be read. Check that it is connected and available, then try again. You can still tap the fretboard.',
} as const;
