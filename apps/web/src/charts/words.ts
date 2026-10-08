/**
 * Words you meet on a band chart, in the glossary's style: what it means, and
 * why it matters when the band talks about it.
 */

export interface ChartWord {
  term: string;
  meaning: string;
  whyItMatters: string;
}

export const CHART_WORDS: readonly ChartWord[] = [
  {
    term: 'chord chart',
    meaning: 'A page with the song\'s chords written bar by bar, split into its sections. No melody, no notes on a staff.',
    whyItMatters: 'It is what most bands actually read. With it you can play a song you have never heard, as long as you know the chords.',
  },
  {
    term: 'section',
    meaning: 'One part of a song with its own name: intro, verse, pre-chorus, chorus, bridge, solo, outro.',
    whyItMatters: 'Bands steer by section names: "go back to the chorus", "skip the second verse", "bridge then out".',
  },
  {
    term: 'verse',
    meaning: 'The part that tells the story. Its chords usually stay the same each time while the words change.',
    whyItMatters: 'Most songs start their singing here, and it often comes back two or three times.',
  },
  {
    term: 'chorus',
    meaning: 'The catchy part that repeats with the same words, usually the biggest moment of the song.',
    whyItMatters: 'When someone says "from the top of the chorus", this is where everyone jumps in together.',
  },
  {
    term: 'bridge',
    meaning: 'A contrasting part, usually heard once near the end, often with chords the song hasn\'t used yet.',
    whyItMatters: 'It is the part people forget in rehearsal. Knowing it is coming keeps you from playing the chorus by mistake.',
  },
  {
    term: 'bar',
    meaning: 'A short box of time holding a fixed number of beats, marked off by bar lines ( | ). Also called a measure.',
    whyItMatters: 'Bands count in bars: "two bars of G, then D". One box on the chart is one bar.',
  },
  {
    term: 'time signature',
    meaning: 'The two numbers like 4/4 or 3/4. The top number is how many beats are in each bar.',
    whyItMatters: 'It tells you how to count the song. 4/4 is "1 2 3 4", 3/4 is a waltz, "1 2 3".',
  },
  {
    term: 'BPM',
    meaning: 'Beats per minute: how fast the song goes. 60 is one beat a second.',
    whyItMatters: 'The drummer counts the band in at this speed, and a metronome set to it lets you practise at the real tempo.',
  },
  {
    term: 'slash chord',
    meaning: 'A chord with a different note in the bass, written chord/bass. D/F# is a D chord with F# as its lowest note.',
    whyItMatters: 'Slash chords make the bass walk smoothly from one chord to the next. The bass player reads the note after the slash.',
  },
  {
    term: 'Nashville number',
    meaning: 'A chord written as its place in the key: 1 is the key\'s home chord, 5 is the chord on the 5th note, "6m" is the minor chord on the 6th.',
    whyItMatters: 'Numbers don\'t change when the singer picks a new key, so the whole band can switch keys without a new chart.',
  },
  {
    term: 'Roman numeral',
    meaning: 'The same idea as Nashville numbers in Roman numerals: capitals for major chords (IV), small letters for minor (vi).',
    whyItMatters: 'Teachers and theory books use them, and "the four chord" or "a one five six four" means the same thing in any key.',
  },
  {
    term: 'transpose',
    meaning: 'Move the whole song up or down to a new key. Every chord moves by the same amount.',
    whyItMatters: 'Singers ask for it all the time: "take it down a step". On this page it is one tap, and the numbers stay the same.',
  },
  {
    term: 'capo',
    meaning: 'A clamp a guitarist puts across the strings at one fret. It raises every open string, so easy chord shapes sound higher.',
    whyItMatters: 'If the song is in E♭, the guitarist can put a capo on fret 1 and play D shapes. You still play E♭ on the keys; you just know why they say "D".',
  },
  {
    term: 'repeat sign (%)',
    meaning: 'A bar with % in it means "play the bar before again".',
    whyItMatters: 'Charts use it to stay short and readable. It is also called a simile mark.',
  },
  {
    term: 'x2',
    meaning: 'Play this section twice in a row before moving on.',
    whyItMatters: 'Saves writing the same section out again; the band counts the times through.',
  },
];
