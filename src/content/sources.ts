/**
 * Source registry. `verified: true` means the citation (title/authors/venue
 * and link) was located and checked online while building this version.
 * `verified: false` means it is a well-known citation entered from the
 * builder's knowledge and NOT re-checked online in this build — the UI labels
 * these, and you should confirm them before relying on them.
 */
export type SourceType =
  | 'systematic-review' | 'consensus' | 'rct' | 'primary-research' | 'review' | 'agency' | 'standard'
  | 'reference-data' | 'primary-writing' | 'observational';

export interface Source {
  id: string;
  title: string;
  authors: string;
  year: number | null;
  venue: string;
  url: string;
  type: SourceType;
  verified: boolean;
  note?: string;
}

export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  'systematic-review': 'Systematic review',
  consensus: 'Expert consensus',
  rct: 'Randomised trial',
  'primary-research': 'Primary research',
  review: 'Narrative review',
  agency: 'Public-health agency',
  standard: 'Technical standard',
  'reference-data': 'Reference data',
  'primary-writing': 'Primary writing (proponent)',
  observational: 'Observational study',
};

export const SOURCES: Source[] = [
  // --- public health, UV, standards ---
  { id: 'who-uvi-2002', title: 'Global Solar UV Index: A Practical Guide', authors: 'World Health Organization, WMO, UNEP, ICNIRP', year: 2002, venue: 'WHO (WHO/SDE/OEH/02.2)', url: 'https://www.who.int/publications/i/item/9241590076', type: 'agency', verified: true },
  { id: 'iarc-100d', title: 'IARC Monographs Vol. 100D: Radiation (incl. solar and UV radiation)', authors: 'International Agency for Research on Cancer', year: 2012, venue: 'IARC', url: 'https://publications.iarc.who.int/121', type: 'agency', verified: true },
  { id: 'green-2011', title: 'Reduced melanoma after regular sunscreen use: randomized trial follow-up', authors: 'Green AC, Williams GM, Logan V, Strutton GM', year: 2011, venue: 'Journal of Clinical Oncology 29(3):257–263', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Reduced+melanoma+after+regular+sunscreen+use%3A+randomized+trial+follow-up', type: 'rct', verified: false },
  { id: 'webb-1988', title: 'Influence of season and latitude on the cutaneous synthesis of vitamin D3: exposure to winter sunlight in Boston and Edmonton will not promote vitamin D3 synthesis in human skin', authors: 'Webb AR, Kline L, Holick MF', year: 1988, venue: 'J Clin Endocrinol Metab 67(2):373–378', url: 'https://pubmed.ncbi.nlm.nih.gov/2839537/', type: 'primary-research', verified: true },
  { id: 'holick-2007', title: 'Vitamin D deficiency', authors: 'Holick MF', year: 2007, venue: 'New England Journal of Medicine 357:266–281', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Vitamin+D+deficiency', type: 'review', verified: false },
  { id: 'who-heat', title: 'Climate change, heat and health (fact sheet)', authors: 'World Health Organization', year: null, venue: 'WHO fact sheet', url: 'https://www.who.int/news-room/fact-sheets/detail/climate-change-heat-and-health', type: 'agency', verified: false },
  { id: 'astm-g173', title: 'Reference Air Mass 1.5 Spectra (ASTM G173-03)', authors: 'ASTM / National Renewable Energy Laboratory', year: 2003, venue: 'NREL', url: 'https://www.nrel.gov/grid/solar-resource/spectra-am1.5.html', type: 'reference-data', verified: false, note: 'Band shares in the Spectrum Lab were integrated from the ASTM G173-03 tables as distributed with pvlib-python.' },
  { id: 'noaa-solcalc', title: 'NOAA Solar Calculator (algorithm after Meeus, Astronomical Algorithms)', authors: 'NOAA Global Monitoring Laboratory', year: null, venue: 'NOAA', url: 'https://gml.noaa.gov/grad/solcalc/', type: 'reference-data', verified: false },
  { id: 'kopp-2011', title: 'A new, lower value of total solar irradiance: Evidence and climate significance', authors: 'Kopp G, Lean JL', year: 2011, venue: 'Geophysical Research Letters 38:L01706', url: 'https://doi.org/10.1029/2010GL045777', type: 'primary-research', verified: false },
  { id: 'who-emf', title: 'Electromagnetic fields and public health: mobile phones (fact sheet)', authors: 'World Health Organization', year: null, venue: 'WHO fact sheet', url: 'https://www.who.int/news-room/fact-sheets/detail/electromagnetic-fields-and-public-health-mobile-phones', type: 'agency', verified: false },

  // --- circadian & light ---
  { id: 'hattar-2002', title: 'Melanopsin-containing retinal ganglion cells: architecture, projections, and intrinsic photosensitivity', authors: 'Hattar S, Liao HW, Takao M, Berson DM, Yau KW', year: 2002, venue: 'Science 295:1065–1070', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Melanopsin-containing+retinal+ganglion+cells%3A+architecture%2C+projections%2C+and+intrinsic+photosensitivity', type: 'primary-research', verified: false },
  { id: 'berson-2002', title: 'Phototransduction by retinal ganglion cells that set the circadian clock', authors: 'Berson DM, Dunn FA, Takao M', year: 2002, venue: 'Science 295:1070–1073', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Phototransduction+by+retinal+ganglion+cells+that+set+the+circadian+clock', type: 'primary-research', verified: false },
  { id: 'lucas-2014', title: 'Measuring and using light in the melanopsin age', authors: 'Lucas RJ, Peirson SN, Berson DM, et al.', year: 2014, venue: 'Trends in Neurosciences 37(1):1–9', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Measuring+and+using+light+in+the+melanopsin+age', type: 'consensus', verified: false },
  { id: 'cie-s026', title: 'CIE S 026/E:2018 — System for metrology of optical radiation for ipRGC-influenced responses to light', authors: 'International Commission on Illumination (CIE)', year: 2018, venue: 'CIE standard', url: 'https://doi.org/10.25039/S026.2018', type: 'standard', verified: false },
  { id: 'brown-2022', title: 'Recommendations for daytime, evening, and nighttime indoor light exposure to best support physiology, sleep, and wakefulness in healthy adults', authors: 'Brown TM, Brainard GC, Cajochen C, et al.', year: 2022, venue: 'PLOS Biology 20(3):e3001571', url: 'https://doi.org/10.1371/journal.pbio.3001571', type: 'consensus', verified: true },
  { id: 'wright-2013', title: 'Entrainment of the human circadian clock to the natural light-dark cycle', authors: 'Wright KP Jr, McHill AW, Birks BR, et al.', year: 2013, venue: 'Current Biology 23:1554–1558', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Entrainment+of+the+human+circadian+clock+to+the+natural+light-dark+cycle', type: 'primary-research', verified: true },
  { id: 'stothard-2017', title: 'Circadian entrainment to the natural light-dark cycle across seasons and the weekend', authors: 'Stothard ER, McHill AW, Depner CM, et al.', year: 2017, venue: 'Current Biology (2017; online Dec 2016)', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Circadian+entrainment+to+the+natural+light-dark+cycle+across+seasons+and+the+weekend', type: 'primary-research', verified: false },
  { id: 'chang-2015', title: 'Evening use of light-emitting eReaders negatively affects sleep, circadian timing, and next-morning alertness', authors: 'Chang AM, Aeschbach D, Duffy JF, Czeisler CA', year: 2015, venue: 'PNAS 112(4):1232–1237', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Evening+use+of+light-emitting+eReaders+negatively+affects+sleep%2C+circadian+timing%2C+and+next-morning+alertness', type: 'primary-research', verified: false },
  { id: 'cochrane-2023', title: 'Blue-light filtering spectacle lenses for visual performance, sleep, and macular health in adults', authors: 'Singh S, Keller PR, Busija L, et al.', year: 2023, venue: 'Cochrane Database of Systematic Reviews, CD013244.pub2', url: 'https://doi.org/10.1002/14651858.CD013244.pub2', type: 'systematic-review', verified: true },
  { id: 'jung-2010', title: 'Acute effects of bright light exposure on cortisol levels', authors: 'Jung CM, Khalsa SBS, Scheer FAJL, et al.', year: 2010, venue: 'Journal of Biological Rhythms 25(3):208–216', url: 'https://pubmed.ncbi.nlm.nih.gov/20484692/', type: 'primary-research', verified: true },
  { id: 'negelspach-2018', title: 'The circadian activity rhythm is reset by nanowatt pulses of ultraviolet light', authors: 'Negelspach DC, Kaladchibachi S, Fernandez F', year: 2018, venue: 'Proceedings of the Royal Society B 285:20181288', url: 'https://doi.org/10.1098/rspb.2018.1288', type: 'primary-research', verified: true, note: 'Study in fruit flies (Drosophila), not humans.' },

  // --- sleep ---
  { id: 'watson-2015', title: 'Recommended amount of sleep for a healthy adult: a joint consensus statement of the AASM and Sleep Research Society', authors: 'Watson NF, Badr MS, Belenky G, et al.', year: 2015, venue: 'Sleep 38(6):843–844', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Recommended+amount+of+sleep+for+a+healthy+adult%3A+a+joint+consensus+statement+of+the+AASM+and+Sleep+Research+Society', type: 'consensus', verified: false },
  { id: 'hirshkowitz-2015', title: 'National Sleep Foundation’s sleep time duration recommendations: methodology and results summary', authors: 'Hirshkowitz M, Whiton K, Albert SM, et al.', year: 2015, venue: 'Sleep Health 1(1):40–43', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=National+Sleep+Foundation%E2%80%99s+sleep+time+duration+recommendations%3A+methodology+and+results+summary', type: 'consensus', verified: false },
  { id: 'phillips-2017', title: 'Irregular sleep/wake patterns are associated with poorer academic performance and delayed circadian and sleep/wake timing', authors: 'Phillips AJK, Clerx WM, O’Brien CS, et al.', year: 2017, venue: 'Scientific Reports 7:3216', url: 'https://doi.org/10.1038/s41598-017-03171-4', type: 'observational', verified: true },
  { id: 'drake-2013', title: 'Caffeine effects on sleep taken 0, 3, or 6 hours before going to bed', authors: 'Drake C, Roehrs T, Shambroom J, Roth T', year: 2013, venue: 'Journal of Clinical Sleep Medicine 9(11):1195–1200', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Caffeine+effects+on+sleep+taken+0%2C+3%2C+or+6+hours+before+going+to+bed', type: 'rct', verified: false },

  // --- red/NIR, mitochondria, metabolism ---
  { id: 'karu-1999', title: 'Primary and secondary mechanisms of action of visible to near-IR radiation on cells', authors: 'Karu T', year: 1999, venue: 'J Photochem Photobiol B 49(1):1–17', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Primary+and+secondary+mechanisms+of+action+of+visible+to+near-IR+radiation+on+cells', type: 'review', verified: false },
  { id: 'hamblin-2017', title: 'Mechanisms and applications of the anti-inflammatory effects of photobiomodulation', authors: 'Hamblin MR', year: 2017, venue: 'AIMS Biophysics 4(3):337–361', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Mechanisms+and+applications+of+the+anti-inflammatory+effects+of+photobiomodulation', type: 'review', verified: false },
  { id: 'barolet-2016', title: 'Infrared and skin: Friend or foe', authors: 'Barolet D, Christiaens F, Hamblin MR', year: 2016, venue: 'J Photochem Photobiol B 155:78–85', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Infrared+and+skin%3A+Friend+or+foe', type: 'review', verified: false },
  { id: 'shinhmar-2020', title: 'Optically improved mitochondrial function redeems aged human visual decline', authors: 'Shinhmar H, Grewal M, Sivaprasad S, et al.', year: 2020, venue: 'Journals of Gerontology: Series A (published online June 2020)', url: 'https://doi.org/10.1093/gerona/glaa155', type: 'primary-research', verified: true, note: 'Small study (24 participants), deep-red 670 nm light from a device.' },
  { id: 'mullur-2014', title: 'Thyroid hormone regulation of metabolism', authors: 'Mullur R, Liu YY, Brent GA', year: 2014, venue: 'Physiological Reviews 94(2):355–382', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Thyroid+hormone+regulation+of+metabolism', type: 'review', verified: false },
  { id: 'sacks-2017', title: 'Dietary fats and cardiovascular disease: a presidential advisory from the American Heart Association', authors: 'Sacks FM, Lichtenstein AH, Wu JHY, et al.', year: 2017, venue: 'Circulation 136:e1–e23', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Dietary+fats+and+cardiovascular+disease%3A+a+presidential+advisory+from+the+American+Heart+Association', type: 'consensus', verified: false },
  { id: 'lindqvist-2014', title: 'Avoidance of sun exposure is a risk factor for all-cause mortality: results from the Melanoma in Southern Sweden cohort', authors: 'Lindqvist PG, Epstein E, Landin-Olsson M, et al.', year: 2014, venue: 'Journal of Internal Medicine 276(1):77–86', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Avoidance+of+sun+exposure+is+a+risk+factor+for+all-cause+mortality%3A+results+from+the+Melanoma+in+Southern+Sweden+cohort', type: 'observational', verified: false },
  { id: 'espeland-2022', title: 'Health effects of voluntary exposure to cold water – a continuing subject of debate', authors: 'Espeland D, de Weerd L, Mercer JB', year: 2022, venue: 'International Journal of Circumpolar Health 81(1):2111789', url: 'https://doi.org/10.1080/22423982.2022.2111789', type: 'review', verified: true },
  { id: 'cifra-2014', title: 'Ultra-weak photon emission from biological samples: definition, mechanisms, properties, detection and applications', authors: 'Cifra M, Pospíšil P', year: 2014, venue: 'J Photochem Photobiol B 139:2–10', url: 'https://pubmed.ncbi.nlm.nih.gov/?term=Ultra-weak+photon+emission+from+biological+samples%3A+definition%2C+mechanisms%2C+properties%2C+detection+and+applications', type: 'review', verified: false },

  // --- Ray Peat (primary writings) ---
  { id: 'peat-mito', title: 'Mitochondria and mortality', authors: 'Ray Peat', year: null, venue: 'raypeat.com article', url: 'https://raypeat.com/articles/articles/mitochondria-mortality.shtml', type: 'primary-writing', verified: true },
  { id: 'peat-eyes', title: 'Aging Eyes, Infant Eyes, and Excitable Tissues', authors: 'Ray Peat', year: null, venue: 'raypeat.com article', url: 'https://raypeat.com/articles/articles/aging-eyes.shtml', type: 'primary-writing', verified: true },
  { id: 'peat-radiation-2011', title: 'Radiation and Growth (newsletter)', authors: 'Ray Peat', year: 2011, venue: 'Ray Peat’s Newsletter, January 2011 (PDF on raypeat.com)', url: 'https://raypeat.com/pdf/Radiation-and-Growth-January-2011.pdf', type: 'primary-writing', verified: true },
  { id: 'peat-thyroid', title: 'Thyroid, insomnia, and the insanities: Commonalities in disease', authors: 'Ray Peat', year: null, venue: 'raypeat.com article', url: 'https://raypeat.com/articles/articles/thyroid-insanities.shtml', type: 'primary-writing', verified: true },
  { id: 'peat-oils', title: 'Unsaturated Vegetable Oils: Toxic', authors: 'Ray Peat', year: null, venue: 'raypeat.com article', url: 'https://raypeat.com/articles/articles/unsaturated-oils.shtml', type: 'primary-writing', verified: true },
  { id: 'peat-co2', title: 'Protective CO2 and aging', authors: 'Ray Peat', year: null, venue: 'raypeat.com article', url: 'https://raypeat.com/articles/articles/co2.shtml', type: 'primary-writing', verified: true },
  { id: 'peat-water', title: 'Water: swelling, tension, pain, fatigue, aging', authors: 'Ray Peat', year: null, venue: 'raypeat.com article', url: 'https://raypeat.com/articles/articles/water.shtml', type: 'primary-writing', verified: true },

  // --- Jack Kruse (primary writings) ---
  { id: 'kruse-tensegrity2', title: 'Tensegrity 2: Cortisol = Power of AM Sunlight', authors: 'Jack Kruse', year: null, venue: 'jackkruse.com blog', url: 'https://jackkruse.com/tensegrity-2-cortisolam-sunlight/', type: 'primary-writing', verified: true },
  { id: 'kruse-time11', title: 'Time #11: Can You Supplement Sunlight?', authors: 'Jack Kruse', year: null, venue: 'jackkruse.com blog', url: 'https://jackkruse.com/time-10-can-you-supplement-sunlight/', type: 'primary-writing', verified: true },
  { id: 'kruse-time8', title: 'Time #8: Psoriasis and the Photoelectric Effect', authors: 'Jack Kruse', year: null, venue: 'jackkruse.com blog', url: 'https://jackkruse.com/time-8-psoriasis-and-the-photoelectric-effect/', type: 'primary-writing', verified: true },
  { id: 'kruse-ub24', title: 'Ubiquitination #24: Are Myopia, Light, and Aging Linked?', authors: 'Jack Kruse', year: null, venue: 'jackkruse.com blog', url: 'https://jackkruse.com/ubiquitination-24-are-myopia-light-and-aging-linked/', type: 'primary-writing', verified: true },
  { id: 'kruse-ub8', title: 'Ubiquitination 8: The Mammalian Battery', authors: 'Jack Kruse', year: null, venue: 'jackkruse.com blog', url: 'https://jackkruse.com/ubiquitination-8-the-mammalian-battery/', type: 'primary-writing', verified: true },
  { id: 'kruse-ub2', title: 'Ubiquitination #2: Gravity Bends Light and Time at Your SCN', authors: 'Jack Kruse', year: null, venue: 'jackkruse.com blog', url: 'https://jackkruse.com/ubiquitination-2-gravity-bends-light-and-time-at-your-scn/', type: 'primary-writing', verified: true },
  { id: 'kruse-cortisol', title: 'Cortisol Response', authors: 'Jack Kruse', year: null, venue: 'jackkruse.com', url: 'https://jackkruse.com/primal-cortisol-response/', type: 'primary-writing', verified: true },
  { id: 'kruse-5g', title: 'November 2018 Webinar: 5G Hit, What to do?', authors: 'Jack Kruse', year: 2018, venue: 'jackkruse.com', url: 'https://jackkruse.com/november-2018-webinar-5g-hit-what-to-do/', type: 'primary-writing', verified: true },
  { id: 'kruse-ubrx', title: 'Ubiquitin Rx: Implications for Mankind', authors: 'Jack Kruse', year: null, venue: 'jackkruse.com blog', url: 'https://jackkruse.com/ubiquitin-rx-implications-for-mankind/', type: 'primary-writing', verified: true },
  { id: 'kruse-home', title: 'Jack Kruse — website (Leptin Reset and cold thermogenesis writings)', authors: 'Jack Kruse', year: null, venue: 'jackkruse.com', url: 'https://jackkruse.com/', type: 'primary-writing', verified: false, note: 'A specific post URL for the cold-thermogenesis protocol was not verified in this build.' },
];

export const sourceById = (id: string) => SOURCES.find((s) => s.id === id);
