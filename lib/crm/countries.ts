export type Country = {
  iso2: string;
  iso3: string;
  name: string;
};

const RAW = `
AF|AFG|Afghanistan
ZA|ZAF|Afrique du Sud
AL|ALB|Albanie
DZ|DZA|Algérie
DE|DEU|Allemagne
AD|AND|Andorre
AO|AGO|Angola
SA|SAU|Arabie saoudite
AR|ARG|Argentine
AM|ARM|Arménie
AU|AUS|Australie
AT|AUT|Autriche
AZ|AZE|Azerbaïdjan
BH|BHR|Bahreïn
BD|BGD|Bangladesh
BE|BEL|Belgique
BZ|BLZ|Belize
BJ|BEN|Bénin
BT|BTN|Bhoutan
BY|BLR|Biélorussie
BO|BOL|Bolivie
BA|BIH|Bosnie-Herzégovine
BW|BWA|Botswana
BR|BRA|Brésil
BN|BRN|Brunei
BG|BGR|Bulgarie
BF|BFA|Burkina Faso
BI|BDI|Burundi
KH|KHM|Cambodge
CM|CMR|Cameroun
CA|CAN|Canada
CV|CPV|Cap-Vert
CL|CHL|Chili
CN|CHN|Chine
CY|CYP|Chypre
CO|COL|Colombie
KM|COM|Comores
CG|COG|Congo
CD|COD|Congo (RDC)
KR|KOR|Corée du Sud
CR|CRI|Costa Rica
CI|CIV|Côte d’Ivoire
HR|HRV|Croatie
CU|CUB|Cuba
DK|DNK|Danemark
DJ|DJI|Djibouti
DM|DMA|Dominique
EG|EGY|Égypte
AE|ARE|Émirats arabes unis
EC|ECU|Équateur
ER|ERI|Érythrée
ES|ESP|Espagne
EE|EST|Estonie
SZ|SWZ|Eswatini
US|USA|États-Unis
ET|ETH|Éthiopie
FI|FIN|Finlande
FR|FRA|France
GA|GAB|Gabon
GM|GMB|Gambie
GE|GEO|Géorgie
GH|GHA|Ghana
GR|GRC|Grèce
GT|GTM|Guatemala
GN|GIN|Guinée
GQ|GNQ|Guinée équatoriale
GW|GNB|Guinée-Bissau
GY|GUY|Guyana
HT|HTI|Haïti
HN|HND|Honduras
HU|HUN|Hongrie
IN|IND|Inde
ID|IDN|Indonésie
IQ|IRQ|Irak
IR|IRN|Iran
IE|IRL|Irlande
IS|ISL|Islande
IL|ISR|Israël
IT|ITA|Italie
JM|JAM|Jamaïque
JP|JPN|Japon
JO|JOR|Jordanie
KZ|KAZ|Kazakhstan
KE|KEN|Kenya
KG|KGZ|Kirghizistan
KW|KWT|Koweït
LA|LAO|Laos
LS|LSO|Lesotho
LV|LVA|Lettonie
LB|LBN|Liban
LR|LBR|Libéria
LY|LBY|Libye
LI|LIE|Liechtenstein
LT|LTU|Lituanie
LU|LUX|Luxembourg
MG|MDG|Madagascar
MY|MYS|Malaisie
MW|MWI|Malawi
MV|MDV|Maldives
ML|MLI|Mali
MT|MLT|Malte
MA|MAR|Maroc
MU|MUS|Maurice
MR|MRT|Mauritanie
MX|MEX|Mexique
MD|MDA|Moldavie
MC|MCO|Monaco
MN|MNG|Mongolie
ME|MNE|Monténégro
MZ|MOZ|Mozambique
MM|MMR|Myanmar
NA|NAM|Namibie
NP|NPL|Népal
NI|NIC|Nicaragua
NE|NER|Niger
NG|NGA|Nigéria
NO|NOR|Norvège
NZ|NZL|Nouvelle-Zélande
OM|OMN|Oman
UG|UGA|Ouganda
UZ|UZB|Ouzbékistan
PK|PAK|Pakistan
PA|PAN|Panama
PG|PNG|Papouasie-Nouvelle-Guinée
PY|PRY|Paraguay
NL|NLD|Pays-Bas
PE|PER|Pérou
PH|PHL|Philippines
PL|POL|Pologne
PT|PRT|Portugal
QA|QAT|Qatar
DO|DOM|République dominicaine
CZ|CZE|République tchèque
RO|ROU|Roumanie
GB|GBR|Royaume-Uni
RU|RUS|Russie
RW|RWA|Rwanda
LC|LCA|Sainte-Lucie
SM|SMR|Saint-Marin
SN|SEN|Sénégal
RS|SRB|Serbie
SC|SYC|Seychelles
SL|SLE|Sierra Leone
SG|SGP|Singapour
SK|SVK|Slovaquie
SI|SVN|Slovénie
SO|SOM|Somalie
SD|SDN|Soudan
LK|LKA|Sri Lanka
SE|SWE|Suède
CH|CHE|Suisse
SR|SUR|Suriname
SY|SYR|Syrie
TW|TWN|Taïwan
TZ|TZA|Tanzanie
TD|TCD|Tchad
TH|THA|Thaïlande
TL|TLS|Timor oriental
TG|TGO|Togo
TT|TTO|Trinité-et-Tobago
TN|TUN|Tunisie
TM|TKM|Turkménistan
TR|TUR|Turquie
UA|UKR|Ukraine
UY|URY|Uruguay
VU|VUT|Vanuatu
VA|VAT|Vatican
VE|VEN|Venezuela
VN|VNM|Viêt Nam
YE|YEM|Yémen
ZM|ZMB|Zambie
ZW|ZWE|Zimbabwe
`.trim();

export const COUNTRIES: Country[] = RAW.split("\n").map((line) => {
  const [iso2, iso3, name] = line.split("|");
  return { iso2, iso3, name };
});

const BY_ISO2 = new Map(COUNTRIES.map((c) => [c.iso2, c]));
const BY_ISO3 = new Map(COUNTRIES.map((c) => [c.iso3, c]));
const BY_NAME = new Map(COUNTRIES.map((c) => [normalizeCountryKey(c.name), c]));

const PRIORITY = [
  "FR",
  "BE",
  "CH",
  "LU",
  "MC",
  "DE",
  "IT",
  "ES",
  "PT",
  "GB",
  "NL",
  "US",
  "CA",
  "MA",
  "TN",
  "DZ",
  "SN",
  "CI",
  "AE",
  "AU",
  "BR",
];

const MRZ_ALIASES: Record<string, string> = {
  D: "DE",
  GBD: "GB",
  GBN: "GB",
  GBO: "GB",
  GBP: "GB",
  GBS: "GB",
  EUE: "FR",
  UK: "GB",
};

/** Adjectifs / dénominations fréquents sur un passeport (vision OCR). */
const NATIONALITY_ALIASES: Record<string, string> = {
  francais: "FR",
  francaise: "FR",
  french: "FR",
  marocain: "MA",
  marocaine: "MA",
  moroccan: "MA",
  tunisien: "TN",
  tunisienne: "TN",
  tunisian: "TN",
  algerien: "DZ",
  algerienne: "DZ",
  algerian: "DZ",
  belge: "BE",
  belgian: "BE",
  suisse: "CH",
  swiss: "CH",
  luxembourgeois: "LU",
  luxembourgeoise: "LU",
  monegasque: "MC",
  allemand: "DE",
  allemande: "DE",
  german: "DE",
  italien: "IT",
  italienne: "IT",
  italian: "IT",
  espagnol: "ES",
  espagnole: "ES",
  spanish: "ES",
  portugais: "PT",
  portugaise: "PT",
  portuguese: "PT",
  britannique: "GB",
  british: "GB",
  anglais: "GB",
  anglaise: "GB",
  english: "GB",
  neerlandais: "NL",
  neerlandaise: "NL",
  hollandais: "NL",
  hollandaise: "NL",
  dutch: "NL",
  americain: "US",
  americaine: "US",
  american: "US",
  canadien: "CA",
  canadienne: "CA",
  canadian: "CA",
  senegalais: "SN",
  senegalaise: "SN",
  senegalese: "SN",
  ivoirien: "CI",
  ivoirienne: "CI",
  ivorian: "CI",
  emirati: "AE",
  emiratie: "AE",
  australien: "AU",
  australienne: "AU",
  australian: "AU",
  bresilien: "BR",
  bresilienne: "BR",
  brazilian: "BR",
  turc: "TR",
  turque: "TR",
  turkish: "TR",
  chinois: "CN",
  chinoise: "CN",
  chinese: "CN",
  japonais: "JP",
  japonaise: "JP",
  japanese: "JP",
  indien: "IN",
  indienne: "IN",
  indian: "IN",
  israelien: "IL",
  israelienne: "IL",
  israeli: "IL",
  russe: "RU",
  russian: "RU",
  grec: "GR",
  grecque: "GR",
  greek: "GR",
  irlandais: "IE",
  irlandaise: "IE",
  irish: "IE",
  polonais: "PL",
  polonaise: "PL",
  polish: "PL",
  roumain: "RO",
  roumaine: "RO",
  romanian: "RO",
  libanais: "LB",
  libanaise: "LB",
  lebanese: "LB",
  egyptien: "EG",
  egyptienne: "EG",
  egyptian: "EG",
  malien: "ML",
  malienne: "ML",
  camerounais: "CM",
  camerounaise: "CM",
  haitien: "HT",
  haitienne: "HT",
  haitian: "HT",
  malgache: "MG",
  mauricien: "MU",
  mauricienne: "MU",
  mexicain: "MX",
  mexicaine: "MX",
  mexican: "MX",
  thailandais: "TH",
  thailandaise: "TH",
  vietnamien: "VN",
  vietnamienne: "VN",
  vietnamese: "VN",
  coreen: "KR",
  coreenne: "KR",
  korean: "KR",
  suedois: "SE",
  suedoise: "SE",
  swedish: "SE",
  norvegien: "NO",
  norvegienne: "NO",
  norwegian: "NO",
  danois: "DK",
  danoise: "DK",
  danish: "DK",
  autrichien: "AT",
  autrichienne: "AT",
  austrian: "AT",
};

const DEMONYM_SUFFIXES = [
  "iennes",
  "ienne",
  "iens",
  "ien",
  "aises",
  "aise",
  "ais",
  "oises",
  "oise",
  "ois",
  "euses",
  "euse",
  "aines",
  "aine",
  "ains",
  "ain",
  "iques",
  "ique",
  "eses",
  "ese",
  "ians",
  "ian",
  "ish",
];

function normalizeCountryKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

export function flagEmoji(iso2: string) {
  return iso2
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
}

export function flagImageUrl(iso2: string, width = 40) {
  return `https://flagcdn.com/w${width}/${iso2.toLowerCase()}.png`;
}

export function countryByIso2(iso2: string | null | undefined) {
  if (!iso2) return null;
  return BY_ISO2.get(iso2.toUpperCase()) || null;
}

export function countryName(iso2: string | null | undefined) {
  return countryByIso2(iso2)?.name || iso2 || "";
}

export function resolveCountryCode(value: string | null | undefined): string | null {
  if (!value) return null;
  const raw = value.trim();
  if (!raw) return null;
  const upper = raw.toUpperCase();
  if (MRZ_ALIASES[upper]) return MRZ_ALIASES[upper];
  if (/^[A-Z]{2}$/.test(upper) && BY_ISO2.has(upper)) return upper;
  if (/^[A-Z]{3}$/.test(upper) && BY_ISO3.has(upper)) return BY_ISO3.get(upper)!.iso2;
  const byName = BY_NAME.get(normalizeCountryKey(raw));
  if (byName) return byName.iso2;
  const starts = COUNTRIES.find((c) => normalizeCountryKey(c.name).startsWith(normalizeCountryKey(raw)));
  return starts?.iso2 || null;
}

function peelNationalityLabel(value: string) {
  return value
    .trim()
    .replace(/^(nationalit[eé]|nationality|citoyennet[eé]|citizenship)\s*[:=-]?\s*/i, "")
    .replace(/^(de la|de l['’]|des|du|de|d['’]|of the|of)\s+/i, "")
    .replace(/^(r[eé]publique|republic)\s+(de la|de l['’]|des|du|de|d['’]|of the|of)?\s*/i, "")
    .split(/[/,;|]/)[0]
    .trim();
}

function matchCountryStem(normalized: string): string | null {
  if (normalized.length < 4) return null;
  let stem = normalized;
  for (const suffix of DEMONYM_SUFFIXES) {
    if (stem.length - suffix.length >= 4 && stem.endsWith(suffix)) {
      stem = stem.slice(0, -suffix.length);
      break;
    }
  }
  const hits = COUNTRIES.filter((country) => {
    const name = normalizeCountryKey(country.name);
    return name === stem || name.startsWith(stem);
  });
  if (hits.length === 1) return hits[0].iso2;
  const exact = hits.filter((country) => normalizeCountryKey(country.name) === stem);
  return exact.length === 1 ? exact[0].iso2 : null;
}

function resolveNationalityToken(value: string | null | undefined): string | null {
  if (!value) return null;
  const peeled = peelNationalityLabel(value);
  if (!peeled) return null;
  const direct = resolveCountryCode(peeled);
  if (direct) return direct;
  const key = normalizeCountryKey(peeled);
  if (!key) return null;
  if (NATIONALITY_ALIASES[key]) return NATIONALITY_ALIASES[key];
  return matchCountryStem(key);
}

/**
 * Nationalité fiche / passeport → ISO2 uniquement (CountrySelect).
 * Accepte FR, FRA, France, « Française », « Nationalité : FR »,
 * et se rabat sur le pays d’émission si la mention est illisible.
 */
export function resolveNationality(
  value: string | null | undefined,
  fallback?: string | null | undefined
): string | null {
  return resolveNationalityToken(value) || resolveNationalityToken(fallback);
}

export function countriesForSelect(priorityFirst = true): Country[] {
  if (!priorityFirst) return COUNTRIES;
  const head = PRIORITY.map((iso2) => BY_ISO2.get(iso2)).filter(Boolean) as Country[];
  const rest = COUNTRIES.filter((c) => !PRIORITY.includes(c.iso2));
  return [...head, ...rest];
}
