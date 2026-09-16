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
};

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

export function countriesForSelect(priorityFirst = true): Country[] {
  if (!priorityFirst) return COUNTRIES;
  const head = PRIORITY.map((iso2) => BY_ISO2.get(iso2)).filter(Boolean) as Country[];
  const rest = COUNTRIES.filter((c) => !PRIORITY.includes(c.iso2));
  return [...head, ...rest];
}
