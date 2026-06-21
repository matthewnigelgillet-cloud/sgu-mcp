// Representative collection data for the homepage. (A design implementation —
// figures reflect the real archive; the record list is a curated sample.)

export const COLLECTION = {
  established: 2005,
  records: 1026,
  daysOnAir: 7598,
  spanFrom: 2005,
  spanTo: 2026,
  latest: {
    accession: "SGU·1092",
    date: "13 Jun 2026",
    title: "Ben Franklin's Anti-Counterfeiting Innovations",
  },
};

export const CENSUS = [
  { n: 1026, suffix: "", caption: "records catalogued · May 2005 – Feb 2026", lead: true },
  { n: 177842, suffix: "", caption: "speaker turns transcribed and indexed" },
  { n: 9100, suffix: "≈", caption: "hours of recorded discourse" },
  { n: 612, suffix: "", caption: "Science or Fiction items adjudicated" },
  { n: 6, suffix: "", caption: "rogues of record · one host emeritus" },
  { n: 100, suffix: "%", caption: "of released episodes, transcribed" },
];

// Sample finding-aid records (specimen labels).
export const RECORDS = [
  {
    ord: "12",
    accession: "SGU·0540",
    date: "14 Nov 2015",
    title: "Australia Reviews Homeopathy",
    rogues: ["Steve", "Bob", "Cara", "Jay", "Evan"],
    guest: null,
    condition: "complete",
    snippet: "…we focused on the ones that continue to fund homeopathy…",
    timecode: "1:04:58",
    seeAlso: 3,
  },
  {
    ord: "13",
    accession: "SGU·0900",
    date: "08 Oct 2022",
    title: "A Homeopathy Lawsuit",
    rogues: ["Steve", "Bob", "Cara", "Jay", "Evan"],
    guest: null,
    condition: "complete",
    snippet: "All right, Jay, tell us about this homeopathy lawsuit…",
    timecode: "0:48:12",
    seeAlso: 2,
  },
  {
    ord: "14",
    accession: "SGU·0997",
    date: "17 Aug 2024",
    title: "The Persistence of Pseudoscience",
    rogues: ["Steve", "Bob", "Cara", "Jay", "Evan"],
    guest: null,
    condition: "complete",
    snippet: "We say, like homeopathy, which we're going to talk about in a moment…",
    timecode: "0:22:40",
    seeAlso: 5,
  },
  {
    ord: "15",
    accession: "SGU·0658",
    date: "17 Feb 2018",
    title: "Ontario College Plans a Program in Homeopathy",
    rogues: ["Steve", "Bob", "Jay", "Evan"],
    guest: "George Hrab",
    condition: "complete",
    snippet: "An accredited college, offering a program in homeopathy…",
    timecode: "0:35:02",
    seeAlso: 1,
  },
  {
    ord: "16",
    accession: "SGU·0506",
    date: "21 Mar 2015",
    title: "Australia Pans Homeopathy",
    rogues: ["Steve", "Bob", "Cara", "Jay", "Evan"],
    guest: null,
    condition: "partial",
    snippet: "A sweeping review found no quality evidence that homeopathy works…",
    timecode: "0:51:19",
    seeAlso: 4,
  },
];

export const ROGUES = [
  { name: "Steven Novella", role: "host", tenure: "2005–", count: 1026, note: "Academic neurologist; founder and host." },
  { name: "Bob Novella", role: "rogue", tenure: "2005–", count: 980, note: "Science and technology; the future report." },
  { name: "Jay Novella", role: "rogue", tenure: "2005–", count: 940, note: "Who's That Noisy; the human angle." },
  { name: "Evan Bernstein", role: "rogue", tenure: "2005–", count: 905, note: "History, scams, and the lighter record." },
  { name: "Cara Santa Maria", role: "rogue", tenure: "2015–", count: 520, note: "Psychologist; the mind and method." },
  { name: "Perry DeAngelis", role: "in memoriam", tenure: "2005–07", count: 70, note: "Founding rogue. In memoriam.", memorial: true },
  { name: "Rebecca Watson", role: "alumna", tenure: "2006–14", count: 360, note: "Founder, Skepchick. Alumna of the record." },
];

export const SEGMENTS = [
  { name: "Science or Fiction", count: 612, note: "Three items, one fabricated — adjudicated." },
  { name: "Who's That Noisy", count: 540, note: "A sound, identified." },
  { name: "Interviews", count: 410, note: "Scientists, authors, and skeptics of note." },
  { name: "Quote of the Week", count: 1010, note: "A line worth keeping." },
];

export const THEMES = [
  { name: "Pseudoscience & Debunking", count: 1180 },
  { name: "Space & Cosmology", count: 940 },
  { name: "Neuroscience & Mind", count: 760 },
  { name: "Medicine & Health", count: 1320 },
  { name: "Critical Thinking", count: 880 },
];

export const ERAS = [
  { name: "The Early Record", span: "2005–2010", records: 260 },
  { name: "The Long Middle", span: "2011–2019", records: 470 },
  { name: "The Pandemic Years", span: "2020–2022", records: 156 },
  { name: "The Latest Decade", span: "2023–2026", records: 140 },
];

export const SOF = {
  episode: "SGU·1075",
  theme: "Astronomy",
  items: [
    "Astronomers confirm, for the first time, a lava tube skylight on the far side of the Moon.",
    "A supergiant star is observed collapsing quietly into a black hole, with no supernova.",
    "Exoplanet hunters describe a rare “inside-out” stellar system with the gas giants nearest the star.",
  ],
  fiction: 2, // index of the fiction (0-based)
};
