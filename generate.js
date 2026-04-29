// Parses the cleaned English CSV (Passenger Arrivals by Nationality, Gender, Year)
// into the passengers.json shape used by the visualization.
//
// Input:  data/passengers_clean.csv
// Output: data/passengers.json
const fs = require('fs');
const path = require('path');

const SRC = path.join(__dirname, 'passengers_clean.csv');
const OUT = path.join(__dirname, 'passengers.json');

// Aggregator / non-country rows to NOT count as origin countries.
const AGGREGATORS = new Set([
  'Resident Dominicans', 'Resident Foreigners',
  'Non-Resident Dominicans', 'Non-Resident Foreigners',
  'North America', 'Central America and Caribbean', 'South America',
  'Europe', 'Asia', 'Rest of the World',
]);

// "Other …" rows are real travellers but cannot be placed on the map -
// keep them in the ungeolocalizable bucket and global totals.
const UNGEO_NAMES = new Set([
  'Other Caribbean', 'Other South America',
  'Other Europe', 'Other Asia', 'Other Rest of the World',
]);

// Country directory: clean-CSV English name -> { iso3, isoNum, displayName, continent, lon, lat }
const C = (iso3, isoNum, name, continent, lon, lat) => ({ iso3, isoNum, name, continent, lon, lat });
const COUNTRY_DIR = {
  // North America
  'United States':              C('USA','840','United States','North America', -98.35,  39.50),
  'Canada':                     C('CAN','124','Canada',        'North America',-106.35,  56.13),
  'Mexico':                     C('MEX','484','Mexico',        'North America',-102.55,  23.63),
  // Central America & Caribbean
  'Aruba':                      C('ABW','533','Aruba',         'Caribbean',     -69.97,  12.52),
  'Bahamas':                    C('BHS','044','Bahamas',       'Caribbean',     -77.40,  24.25),
  'Turks and Caicos Islands':   C('TCA','796','Turks & Caicos','Caribbean',     -71.80,  21.69),
  'Costa Rica':                 C('CRI','188','Costa Rica',    'Central America',-84.07,   9.93),
  'Cuba':                       C('CUB','192','Cuba',          'Caribbean',     -77.78,  21.52),
  'Curacao':                    C('CUW','531','Curaçao',       'Caribbean',     -68.99,  12.16),
  'El Salvador':                C('SLV','222','El Salvador',   'Central America',-88.92,  13.79),
  'Guadeloupe':                 C('GLP','312','Guadeloupe',    'Caribbean',     -61.55,  16.27),
  'Guatemala':                  C('GTM','320','Guatemala',     'Central America',-90.43,  15.78),
  'Haiti':                      C('HTI','332','Haiti',         'Caribbean',     -72.29,  18.97),
  'Honduras':                   C('HND','340','Honduras',      'Central America',-86.24,  14.65),
  'Jamaica':                    C('JAM','388','Jamaica',       'Caribbean',     -77.31,  18.10),
  'Martinique':                 C('MTQ','474','Martinique',    'Caribbean',     -61.02,  14.64),
  'Nicaragua':                  C('NIC','558','Nicaragua',     'Central America',-85.20,  12.87),
  'Panama':                     C('PAN','591','Panama',        'Central America',-80.12,   8.54),
  'Puerto Rico':                C('PRI','630','Puerto Rico',   'Caribbean',     -66.59,  18.22),
  'Saint Martin':               C('MAF','663','Saint Martin',  'Caribbean',     -63.07,  18.07),
  'Trinidad and Tobago':        C('TTO','780','Trinidad & Tobago','Caribbean',  -61.22,  10.69),
  'U.S. Virgin Islands':        C('VIR','850','U.S. Virgin Is.','Caribbean',    -64.90,  18.34),
  // South America
  'Argentina':                  C('ARG','032','Argentina',     'South America', -64.18, -38.42),
  'Bolivia':                    C('BOL','068','Bolivia',       'South America', -64.00, -16.29),
  'Brazil':                     C('BRA','076','Brazil',        'South America', -51.92, -14.24),
  'Colombia':                   C('COL','170','Colombia',      'South America', -74.30,   4.57),
  'Chile':                      C('CHL','152','Chile',         'South America', -71.54, -35.68),
  'Ecuador':                    C('ECU','218','Ecuador',       'South America', -78.18,  -1.83),
  'Peru':                       C('PER','604','Peru',          'South America', -75.02,  -9.19),
  'Uruguay':                    C('URY','858','Uruguay',       'South America', -55.77, -32.52),
  'Venezuela':                  C('VEN','862','Venezuela',     'South America', -66.59,   6.42),
  // Europe
  'Germany':                    C('DEU','276','Germany',       'Europe',         10.45,  51.17),
  'Austria':                    C('AUT','040','Austria',       'Europe',         14.55,  47.52),
  'Belgium':                    C('BEL','056','Belgium',       'Europe',          4.47,  50.50),
  'Bulgaria':                   C('BGR','100','Bulgaria',      'Europe',         25.49,  42.73),
  'Czechoslovakia':             C('CSK','200','Czechoslovakia','Europe',         16.00,  49.50),
  'Denmark':                    C('DNK','208','Denmark',       'Europe',          9.50,  56.26),
  'Scotland':                   C('SCT','998','Scotland',      'Europe',         -4.20,  56.49),
  'Spain':                      C('ESP','724','Spain',         'Europe',         -3.75,  40.46),
  'Finland':                    C('FIN','246','Finland',       'Europe',         25.75,  61.92),
  'France':                     C('FRA','250','France',        'Europe',          2.21,  46.23),
  'Greece':                     C('GRC','300','Greece',        'Europe',         21.82,  39.07),
  'Hungary':                    C('HUN','348','Hungary',       'Europe',         19.50,  47.16),
  'Netherlands':                C('NLD','528','Netherlands',   'Europe',          5.29,  52.13),
  'United Kingdom':             C('GBR','826','United Kingdom','Europe',         -1.17,  52.36),
  'Ireland':                    C('IRL','372','Ireland',       'Europe',         -7.69,  53.41),
  'Italy':                      C('ITA','380','Italy',         'Europe',         12.57,  41.87),
  'Luxembourg':                 C('LUX','442','Luxembourg',    'Europe',          6.13,  49.81),
  'Norway':                     C('NOR','578','Norway',        'Europe',          8.47,  60.47),
  'Poland':                     C('POL','616','Poland',        'Europe',         19.13,  51.92),
  'Portugal':                   C('PRT','620','Portugal',      'Europe',         -8.22,  39.40),
  'Czech Republic':             C('CZE','203','Czech Republic','Europe',         15.47,  49.82),
  'Romania':                    C('ROU','642','Romania',       'Europe',         24.97,  45.94),
  'Russia':                     C('RUS','643','Russia',        'Europe',        105.32,  61.52),
  'Sweden':                     C('SWE','752','Sweden',        'Europe',         18.64,  60.13),
  'Switzerland':                C('CHE','756','Switzerland',   'Europe',          8.23,  46.82),
  'Ukraine':                    C('UKR','804','Ukraine',       'Europe',         31.17,  48.38),
  // Asia
  'South Korea':                C('KOR','410','South Korea',   'Asia',          127.77,  35.91),
  'China':                      C('CHN','156','China',         'Asia',          104.20,  35.86),
  'India':                      C('IND','356','India',         'Asia',           78.96,  20.59),
  'Israel':                     C('ISR','376','Israel',        'Asia',           34.85,  31.05),
  'Japan':                      C('JPN','392','Japan',         'Asia',          138.25,  36.20),
  'Thailand':                   C('THA','764','Thailand',      'Asia',          100.99,  15.87),
  'Taiwan':                     C('TWN','158','Taiwan',        'Asia',          120.96,  23.70),
  // Oceania
  'Australia':                  C('AUS','036','Australia',     'Oceania',       133.78, -25.27),
};

// --- Parse CSV ---
// Header: Passenger Arrivals by Nationality, Gender, Total Passenger Arrivals by Nationality, Year
const text = fs.readFileSync(SRC, 'utf8');
const lines = text.split(/\r?\n/);
const ROW_RE = /^("(?:[^"]|"")*"|[^,]*),(Female|Male),(-?\d+),(\d{4})$/;

const years = new Set();
const countries = {};
const ungeo = {};
const unknownNames = new Map();

function ensureCountry(iso3, info) {
  if (!countries[iso3]) {
    countries[iso3] = { name: info.name, continent: info.continent, isoNum: info.isoNum, data: {} };
  }
  return countries[iso3];
}
function ensureUngeo(name) {
  if (!ungeo[name]) ungeo[name] = { data: {} };
  return ungeo[name];
}
function ensureYear(bucket, year) {
  if (!bucket.data[year]) bucket.data[year] = { female: 0, male: 0, total: 0 };
  return bucket.data[year];
}

let parsed = 0, skippedAgg = 0;
for (let i = 1; i < lines.length; i++) {
  const ln = lines[i].trim();
  if (!ln) continue;
  const m = ln.match(ROW_RE);
  if (!m) continue;
  let name = m[1];
  if (name.startsWith('"') && name.endsWith('"')) name = name.slice(1, -1).replace(/""/g, '"');
  const sex = m[2];
  const value = parseInt(m[3], 10);
  const year = parseInt(m[4], 10);
  years.add(year);

  if (AGGREGATORS.has(name)) { skippedAgg++; continue; }

  let bucket;
  if (UNGEO_NAMES.has(name)) {
    bucket = ensureUngeo(name);
  } else if (COUNTRY_DIR[name]) {
    const info = COUNTRY_DIR[name];
    bucket = ensureCountry(info.iso3, info);
  } else {
    unknownNames.set(name, (unknownNames.get(name) || 0) + 1);
    continue;
  }
  const slot = ensureYear(bucket, year);
  if (sex === 'Female') slot.female += value;
  else                  slot.male   += value;
  slot.total = slot.female + slot.male;
  parsed++;
}

if (unknownNames.size) {
  console.warn('Unmapped names (will be skipped):');
  [...unknownNames.entries()].forEach(([n, c]) => console.warn('  ', n, '×', c));
}

Object.entries(COUNTRY_DIR).forEach(([enName, info]) => {
  const c = countries[info.iso3];
  if (c) { c.lon = info.lon; c.lat = info.lat; c.englishName = enName; }
});

const YEARS = [...years].sort((a, b) => a - b);
function fillYears(bucket) {
  for (const y of YEARS) ensureYear(bucket, y);
}
Object.values(countries).forEach(fillYears);
Object.values(ungeo).forEach(fillYears);

const globalTotals = {};
for (const y of YEARS) {
  let f = 0, m = 0;
  Object.values(countries).forEach(c => { f += c.data[y].female; m += c.data[y].male; });
  Object.values(ungeo).forEach(c => { f += c.data[y].female; m += c.data[y].male; });
  globalTotals[y] = { female: f, male: m, total: f + m };
}

const out = { years: YEARS, countries, ungeolocalizable: ungeo, globalTotals };
fs.writeFileSync(OUT, JSON.stringify(out));

console.log(`Parsed ${parsed} rows · skipped ${skippedAgg} aggregator rows`);
console.log(`Years ${YEARS[0]}–${YEARS[YEARS.length-1]} · ${Object.keys(countries).length} countries · ${Object.keys(ungeo).length} ungeo buckets`);
console.log(`2024 global total: ${globalTotals[2024].total.toLocaleString()} (F ${globalTotals[2024].female.toLocaleString()} · M ${globalTotals[2024].male.toLocaleString()})`);
