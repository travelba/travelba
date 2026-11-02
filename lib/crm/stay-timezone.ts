import { cityMapping } from "city-timezones";
import { timezoneForCountryCode } from "./airport-time";
import { cityPlaceKey, foldCityName, isOriginHub } from "./city-names";

/**
 * Fuseau d’un séjour : toujours celui de la ville où l’on dort.
 * Règle de la maison : Nice → Europe/Paris, quoi que dise le champ du dossier.
 * Module serveur : le jeu de villes pèse 2 Mo, il ne doit pas partir dans un composant client.
 */

export type StayTimezoneSource = "ville" | "hotel" | "pays" | "dossier";

export type StayTimezone = { zone: string | null; source: StayTimezoneSource | null };

/** Villes et lieux de séjour, ramenés à un fuseau IANA. La clé est `cityPlaceKey`. */
const CITY_ZONES: Record<string, string> = {
  // France
  paris: "Europe/Paris",
  nice: "Europe/Paris",
  cannes: "Europe/Paris",
  antibes: "Europe/Paris",
  "cap d antibes": "Europe/Paris",
  "juan les pins": "Europe/Paris",
  "saint tropez": "Europe/Paris",
  "st tropez": "Europe/Paris",
  ramatuelle: "Europe/Paris",
  "saint jean cap ferrat": "Europe/Paris",
  "cap ferrat": "Europe/Paris",
  "beaulieu sur mer": "Europe/Paris",
  eze: "Europe/Paris",
  menton: "Europe/Paris",
  "saint paul de vence": "Europe/Paris",
  grasse: "Europe/Paris",
  "saint raphael": "Europe/Paris",
  "sainte maxime": "Europe/Paris",
  hyeres: "Europe/Paris",
  porquerolles: "Europe/Paris",
  cassis: "Europe/Paris",
  marseille: "Europe/Paris",
  "aix en provence": "Europe/Paris",
  avignon: "Europe/Paris",
  gordes: "Europe/Paris",
  "les baux de provence": "Europe/Paris",
  "saint remy de provence": "Europe/Paris",
  arles: "Europe/Paris",
  montpellier: "Europe/Paris",
  toulouse: "Europe/Paris",
  bordeaux: "Europe/Paris",
  "saint emilion": "Europe/Paris",
  arcachon: "Europe/Paris",
  "cap ferret": "Europe/Paris",
  biarritz: "Europe/Paris",
  "saint jean de luz": "Europe/Paris",
  bayonne: "Europe/Paris",
  lyon: "Europe/Paris",
  annecy: "Europe/Paris",
  chamonix: "Europe/Paris",
  "chamonix mont blanc": "Europe/Paris",
  megeve: "Europe/Paris",
  courchevel: "Europe/Paris",
  meribel: "Europe/Paris",
  "val d isere": "Europe/Paris",
  tignes: "Europe/Paris",
  "val thorens": "Europe/Paris",
  "les menuires": "Europe/Paris",
  "la plagne": "Europe/Paris",
  "les arcs": "Europe/Paris",
  avoriaz: "Europe/Paris",
  morzine: "Europe/Paris",
  "les gets": "Europe/Paris",
  "la clusaz": "Europe/Paris",
  "alpe d huez": "Europe/Paris",
  "les deux alpes": "Europe/Paris",
  "serre chevalier": "Europe/Paris",
  evian: "Europe/Paris",
  "evian les bains": "Europe/Paris",
  grenoble: "Europe/Paris",
  strasbourg: "Europe/Paris",
  colmar: "Europe/Paris",
  reims: "Europe/Paris",
  epernay: "Europe/Paris",
  lille: "Europe/Paris",
  "le touquet": "Europe/Paris",
  "le touquet paris plage": "Europe/Paris",
  deauville: "Europe/Paris",
  trouville: "Europe/Paris",
  "trouville sur mer": "Europe/Paris",
  honfleur: "Europe/Paris",
  cabourg: "Europe/Paris",
  etretat: "Europe/Paris",
  "le havre": "Europe/Paris",
  rouen: "Europe/Paris",
  giverny: "Europe/Paris",
  "mont saint michel": "Europe/Paris",
  "le mont saint michel": "Europe/Paris",
  "saint malo": "Europe/Paris",
  dinard: "Europe/Paris",
  rennes: "Europe/Paris",
  nantes: "Europe/Paris",
  "la baule": "Europe/Paris",
  "ile de re": "Europe/Paris",
  "la rochelle": "Europe/Paris",
  tours: "Europe/Paris",
  amboise: "Europe/Paris",
  chambord: "Europe/Paris",
  versailles: "Europe/Paris",
  chantilly: "Europe/Paris",
  fontainebleau: "Europe/Paris",
  "disneyland paris": "Europe/Paris",
  "marne la vallee": "Europe/Paris",
  "roissy": "Europe/Paris",
  orly: "Europe/Paris",
  ajaccio: "Europe/Paris",
  bastia: "Europe/Paris",
  calvi: "Europe/Paris",
  "porto vecchio": "Europe/Paris",
  bonifacio: "Europe/Paris",
  "ile rousse": "Europe/Paris",
  "l ile rousse": "Europe/Paris",
  "saint florent": "Europe/Paris",
  corse: "Europe/Paris",
  corsica: "Europe/Paris",
  // Outre-mer
  "saint barthelemy": "America/St_Barthelemy",
  "saint barth": "America/St_Barthelemy",
  "st barth": "America/St_Barthelemy",
  "st barths": "America/St_Barthelemy",
  "saint barthelemy fwi": "America/St_Barthelemy",
  gustavia: "America/St_Barthelemy",
  "saint martin": "America/Marigot",
  "st martin": "America/Marigot",
  guadeloupe: "America/Guadeloupe",
  martinique: "America/Martinique",
  "la reunion": "Indian/Reunion",
  reunion: "Indian/Reunion",
  "saint denis de la reunion": "Indian/Reunion",
  mayotte: "Indian/Mayotte",
  tahiti: "Pacific/Tahiti",
  papeete: "Pacific/Tahiti",
  "bora bora": "Pacific/Tahiti",
  moorea: "Pacific/Tahiti",
  "polynesie francaise": "Pacific/Tahiti",
  "nouvelle caledonie": "Pacific/Noumea",
  noumea: "Pacific/Noumea",
  // Europe
  monaco: "Europe/Monaco",
  "monte carlo": "Europe/Monaco",
  london: "Europe/London",
  edinburgh: "Europe/London",
  edimbourg: "Europe/London",
  manchester: "Europe/London",
  oxford: "Europe/London",
  cambridge: "Europe/London",
  bath: "Europe/London",
  "les cotswolds": "Europe/London",
  cotswolds: "Europe/London",
  dublin: "Europe/Dublin",
  amsterdam: "Europe/Amsterdam",
  rotterdam: "Europe/Amsterdam",
  brussels: "Europe/Brussels",
  bruges: "Europe/Brussels",
  brugge: "Europe/Brussels",
  anvers: "Europe/Brussels",
  antwerp: "Europe/Brussels",
  luxembourg: "Europe/Luxembourg",
  geneva: "Europe/Zurich",
  zurich: "Europe/Zurich",
  zermatt: "Europe/Zurich",
  lugano: "Europe/Zurich",
  gstaad: "Europe/Zurich",
  verbier: "Europe/Zurich",
  "crans montana": "Europe/Zurich",
  "saint moritz": "Europe/Zurich",
  "st moritz": "Europe/Zurich",
  "sankt moritz": "Europe/Zurich",
  davos: "Europe/Zurich",
  interlaken: "Europe/Zurich",
  lausanne: "Europe/Zurich",
  montreux: "Europe/Zurich",
  bale: "Europe/Zurich",
  basel: "Europe/Zurich",
  berne: "Europe/Zurich",
  bern: "Europe/Zurich",
  lucerne: "Europe/Zurich",
  luzern: "Europe/Zurich",
  vienne: "Europe/Vienna",
  vienna: "Europe/Vienna",
  salzburg: "Europe/Vienna",
  salzbourg: "Europe/Vienna",
  innsbruck: "Europe/Vienna",
  kitzbuhel: "Europe/Vienna",
  "bad gastein": "Europe/Vienna",
  lech: "Europe/Vienna",
  berlin: "Europe/Berlin",
  munich: "Europe/Berlin",
  hamburg: "Europe/Berlin",
  hambourg: "Europe/Berlin",
  francfort: "Europe/Berlin",
  frankfurt: "Europe/Berlin",
  cologne: "Europe/Berlin",
  koln: "Europe/Berlin",
  dusseldorf: "Europe/Berlin",
  "baden baden": "Europe/Berlin",
  dresde: "Europe/Berlin",
  dresden: "Europe/Berlin",
  heidelberg: "Europe/Berlin",
  rome: "Europe/Rome",
  milan: "Europe/Rome",
  venice: "Europe/Rome",
  florence: "Europe/Rome",
  naples: "Europe/Rome",
  napoli: "Europe/Rome",
  capri: "Europe/Rome",
  positano: "Europe/Rome",
  amalfi: "Europe/Rome",
  ravello: "Europe/Rome",
  sorrento: "Europe/Rome",
  sorrente: "Europe/Rome",
  ischia: "Europe/Rome",
  "cote amalfitaine": "Europe/Rome",
  "amalfi coast": "Europe/Rome",
  "lac de come": "Europe/Rome",
  como: "Europe/Rome",
  "lake como": "Europe/Rome",
  bellagio: "Europe/Rome",
  cernobbio: "Europe/Rome",
  "lac de garde": "Europe/Rome",
  "lake garda": "Europe/Rome",
  sirmione: "Europe/Rome",
  "lac majeur": "Europe/Rome",
  stresa: "Europe/Rome",
  turin: "Europe/Rome",
  torino: "Europe/Rome",
  genes: "Europe/Rome",
  genova: "Europe/Rome",
  portofino: "Europe/Rome",
  "santa margherita ligure": "Europe/Rome",
  "cinque terre": "Europe/Rome",
  bologne: "Europe/Rome",
  bologna: "Europe/Rome",
  verone: "Europe/Rome",
  verona: "Europe/Rome",
  sienne: "Europe/Rome",
  siena: "Europe/Rome",
  pise: "Europe/Rome",
  pisa: "Europe/Rome",
  lucca: "Europe/Rome",
  "forte dei marmi": "Europe/Rome",
  toscane: "Europe/Rome",
  tuscany: "Europe/Rome",
  "val d orcia": "Europe/Rome",
  montalcino: "Europe/Rome",
  chianti: "Europe/Rome",
  "cortina d ampezzo": "Europe/Rome",
  cortina: "Europe/Rome",
  dolomites: "Europe/Rome",
  "alta badia": "Europe/Rome",
  "madonna di campiglio": "Europe/Rome",
  courmayeur: "Europe/Rome",
  "puglia": "Europe/Rome",
  "pouilles": "Europe/Rome",
  "les pouilles": "Europe/Rome",
  ostuni: "Europe/Rome",
  lecce: "Europe/Rome",
  bari: "Europe/Rome",
  polignano: "Europe/Rome",
  "polignano a mare": "Europe/Rome",
  matera: "Europe/Rome",
  sicile: "Europe/Rome",
  sicily: "Europe/Rome",
  taormina: "Europe/Rome",
  palerme: "Europe/Rome",
  palermo: "Europe/Rome",
  catane: "Europe/Rome",
  catania: "Europe/Rome",
  noto: "Europe/Rome",
  syracuse: "Europe/Rome",
  siracusa: "Europe/Rome",
  sardaigne: "Europe/Rome",
  sardinia: "Europe/Rome",
  "porto cervo": "Europe/Rome",
  "costa smeralda": "Europe/Rome",
  cagliari: "Europe/Rome",
  olbia: "Europe/Rome",
  barcelona: "Europe/Madrid",
  barcelone: "Europe/Madrid",
  madrid: "Europe/Madrid",
  seville: "Europe/Madrid",
  sevilla: "Europe/Madrid",
  malaga: "Europe/Madrid",
  marbella: "Europe/Madrid",
  "puerto banus": "Europe/Madrid",
  sotogrande: "Europe/Madrid",
  grenade: "Europe/Madrid",
  granada: "Europe/Madrid",
  cordoue: "Europe/Madrid",
  cordoba: "Europe/Madrid",
  valence: "Europe/Madrid",
  valencia: "Europe/Madrid",
  "saint sebastien": "Europe/Madrid",
  "san sebastian": "Europe/Madrid",
  "donostia": "Europe/Madrid",
  bilbao: "Europe/Madrid",
  ibiza: "Europe/Madrid",
  eivissa: "Europe/Madrid",
  formentera: "Europe/Madrid",
  majorque: "Europe/Madrid",
  mallorca: "Europe/Madrid",
  majorca: "Europe/Madrid",
  palma: "Europe/Madrid",
  "palma de majorque": "Europe/Madrid",
  "palma de mallorca": "Europe/Madrid",
  deia: "Europe/Madrid",
  minorque: "Europe/Madrid",
  menorca: "Europe/Madrid",
  tenerife: "Atlantic/Canary",
  lanzarote: "Atlantic/Canary",
  fuerteventura: "Atlantic/Canary",
  "gran canaria": "Atlantic/Canary",
  "grande canarie": "Atlantic/Canary",
  "las palmas": "Atlantic/Canary",
  canaries: "Atlantic/Canary",
  "iles canaries": "Atlantic/Canary",
  "canary islands": "Atlantic/Canary",
  lisbon: "Europe/Lisbon",
  porto: "Europe/Lisbon",
  sintra: "Europe/Lisbon",
  cascais: "Europe/Lisbon",
  comporta: "Europe/Lisbon",
  algarve: "Europe/Lisbon",
  faro: "Europe/Lisbon",
  albufeira: "Europe/Lisbon",
  "quinta do lago": "Europe/Lisbon",
  "vale do lobo": "Europe/Lisbon",
  "vilamoura": "Europe/Lisbon",
  lamego: "Europe/Lisbon",
  douro: "Europe/Lisbon",
  "vallee du douro": "Europe/Lisbon",
  madere: "Atlantic/Madeira",
  madeira: "Atlantic/Madeira",
  funchal: "Atlantic/Madeira",
  acores: "Atlantic/Azores",
  azores: "Atlantic/Azores",
  "ponta delgada": "Atlantic/Azores",
  athens: "Europe/Athens",
  athenes: "Europe/Athens",
  santorin: "Europe/Athens",
  santorini: "Europe/Athens",
  oia: "Europe/Athens",
  mykonos: "Europe/Athens",
  paros: "Europe/Athens",
  naxos: "Europe/Athens",
  milos: "Europe/Athens",
  crete: "Europe/Athens",
  heraklion: "Europe/Athens",
  chania: "Europe/Athens",
  "la canee": "Europe/Athens",
  elounda: "Europe/Athens",
  rhodes: "Europe/Athens",
  corfou: "Europe/Athens",
  corfu: "Europe/Athens",
  kefalonia: "Europe/Athens",
  cephalonie: "Europe/Athens",
  zakynthos: "Europe/Athens",
  hydra: "Europe/Athens",
  "costa navarino": "Europe/Athens",
  peloponnese: "Europe/Athens",
  thessalonique: "Europe/Athens",
  thessaloniki: "Europe/Athens",
  istanbul: "Europe/Istanbul",
  bodrum: "Europe/Istanbul",
  antalya: "Europe/Istanbul",
  cappadoce: "Europe/Istanbul",
  cappadocia: "Europe/Istanbul",
  izmir: "Europe/Istanbul",
  prague: "Europe/Prague",
  budapest: "Europe/Budapest",
  cracovie: "Europe/Warsaw",
  krakow: "Europe/Warsaw",
  varsovie: "Europe/Warsaw",
  warsaw: "Europe/Warsaw",
  copenhague: "Europe/Copenhagen",
  copenhagen: "Europe/Copenhagen",
  stockholm: "Europe/Stockholm",
  oslo: "Europe/Oslo",
  bergen: "Europe/Oslo",
  tromso: "Europe/Oslo",
  lofoten: "Europe/Oslo",
  helsinki: "Europe/Helsinki",
  laponie: "Europe/Helsinki",
  rovaniemi: "Europe/Helsinki",
  reykjavik: "Atlantic/Reykjavik",
  islande: "Atlantic/Reykjavik",
  iceland: "Atlantic/Reykjavik",
  dubrovnik: "Europe/Zagreb",
  split: "Europe/Zagreb",
  hvar: "Europe/Zagreb",
  zagreb: "Europe/Zagreb",
  kotor: "Europe/Podgorica",
  ljubljana: "Europe/Ljubljana",
  "lac de bled": "Europe/Ljubljana",
  bled: "Europe/Ljubljana",
  malte: "Europe/Malta",
  malta: "Europe/Malta",
  "la valette": "Europe/Malta",
  valletta: "Europe/Malta",
  gozo: "Europe/Malta",
  chypre: "Asia/Nicosia",
  cyprus: "Asia/Nicosia",
  limassol: "Asia/Nicosia",
  paphos: "Asia/Nicosia",
  moscow: "Europe/Moscow",
  "saint petersbourg": "Europe/Moscow",
  "saint petersburg": "Europe/Moscow",
  // Afrique, océan Indien
  marrakech: "Africa/Casablanca",
  marrakesh: "Africa/Casablanca",
  casablanca: "Africa/Casablanca",
  rabat: "Africa/Casablanca",
  fes: "Africa/Casablanca",
  fez: "Africa/Casablanca",
  tanger: "Africa/Casablanca",
  tangier: "Africa/Casablanca",
  essaouira: "Africa/Casablanca",
  agadir: "Africa/Casablanca",
  taghazout: "Africa/Casablanca",
  ouarzazate: "Africa/Casablanca",
  "la palmeraie": "Africa/Casablanca",
  tunis: "Africa/Tunis",
  djerba: "Africa/Tunis",
  hammamet: "Africa/Tunis",
  "le caire": "Africa/Cairo",
  cairo: "Africa/Cairo",
  louxor: "Africa/Cairo",
  luxor: "Africa/Cairo",
  assouan: "Africa/Cairo",
  aswan: "Africa/Cairo",
  hurghada: "Africa/Cairo",
  "sharm el sheikh": "Africa/Cairo",
  "el gouna": "Africa/Cairo",
  nairobi: "Africa/Nairobi",
  "masai mara": "Africa/Nairobi",
  "maasai mara": "Africa/Nairobi",
  mombasa: "Africa/Nairobi",
  diani: "Africa/Nairobi",
  zanzibar: "Africa/Dar_es_Salaam",
  "stone town": "Africa/Dar_es_Salaam",
  arusha: "Africa/Dar_es_Salaam",
  serengeti: "Africa/Dar_es_Salaam",
  ngorongoro: "Africa/Dar_es_Salaam",
  kilimandjaro: "Africa/Dar_es_Salaam",
  kilimanjaro: "Africa/Dar_es_Salaam",
  "le cap": "Africa/Johannesburg",
  "cape town": "Africa/Johannesburg",
  johannesburg: "Africa/Johannesburg",
  kruger: "Africa/Johannesburg",
  "parc kruger": "Africa/Johannesburg",
  "sabi sands": "Africa/Johannesburg",
  franschhoek: "Africa/Johannesburg",
  stellenbosch: "Africa/Johannesburg",
  hermanus: "Africa/Johannesburg",
  "route des jardins": "Africa/Johannesburg",
  "garden route": "Africa/Johannesburg",
  "chutes victoria": "Africa/Harare",
  "victoria falls": "Africa/Harare",
  "okavango": "Africa/Gaborone",
  "delta de l okavango": "Africa/Gaborone",
  windhoek: "Africa/Windhoek",
  sossusvlei: "Africa/Windhoek",
  kigali: "Africa/Kigali",
  "ile maurice": "Indian/Mauritius",
  maurice: "Indian/Mauritius",
  mauritius: "Indian/Mauritius",
  "port louis": "Indian/Mauritius",
  "grand baie": "Indian/Mauritius",
  "belle mare": "Indian/Mauritius",
  "le morne": "Indian/Mauritius",
  seychelles: "Indian/Mahe",
  mahe: "Indian/Mahe",
  praslin: "Indian/Mahe",
  "la digue": "Indian/Mahe",
  male: "Indian/Maldives",
  maldives: "Indian/Maldives",
  madagascar: "Indian/Antananarivo",
  "nosy be": "Indian/Antananarivo",
  // Proche et Moyen-Orient
  "tel aviv": "Asia/Jerusalem",
  "tel aviv yafo": "Asia/Jerusalem",
  "tel aviv jaffa": "Asia/Jerusalem",
  jaffa: "Asia/Jerusalem",
  herzliya: "Asia/Jerusalem",
  jerusalem: "Asia/Jerusalem",
  eilat: "Asia/Jerusalem",
  haifa: "Asia/Jerusalem",
  "mer morte": "Asia/Jerusalem",
  "dead sea": "Asia/Jerusalem",
  netanya: "Asia/Jerusalem",
  dubai: "Asia/Dubai",
  "abu dhabi": "Asia/Dubai",
  "abou dabi": "Asia/Dubai",
  "ras al khaimah": "Asia/Dubai",
  doha: "Asia/Qatar",
  mascate: "Asia/Muscat",
  muscat: "Asia/Muscat",
  "salalah": "Asia/Muscat",
  petra: "Asia/Amman",
  amman: "Asia/Amman",
  "wadi rum": "Asia/Amman",
  aqaba: "Asia/Amman",
  beyrouth: "Asia/Beirut",
  beirut: "Asia/Beirut",
  riyad: "Asia/Riyadh",
  riyadh: "Asia/Riyadh",
  djeddah: "Asia/Riyadh",
  jeddah: "Asia/Riyadh",
  alula: "Asia/Riyadh",
  // Asie
  tokyo: "Asia/Tokyo",
  kyoto: "Asia/Tokyo",
  osaka: "Asia/Tokyo",
  hakone: "Asia/Tokyo",
  nara: "Asia/Tokyo",
  hiroshima: "Asia/Tokyo",
  niseko: "Asia/Tokyo",
  okinawa: "Asia/Tokyo",
  seoul: "Asia/Seoul",
  pekin: "Asia/Shanghai",
  beijing: "Asia/Shanghai",
  shanghai: "Asia/Shanghai",
  "hong kong": "Asia/Hong_Kong",
  macao: "Asia/Macau",
  macau: "Asia/Macau",
  taipei: "Asia/Taipei",
  singapore: "Asia/Singapore",
  "kuala lumpur": "Asia/Kuala_Lumpur",
  langkawi: "Asia/Kuala_Lumpur",
  penang: "Asia/Kuala_Lumpur",
  bali: "Asia/Makassar",
  ubud: "Asia/Makassar",
  seminyak: "Asia/Makassar",
  uluwatu: "Asia/Makassar",
  "nusa dua": "Asia/Makassar",
  canggu: "Asia/Makassar",
  lombok: "Asia/Makassar",
  komodo: "Asia/Makassar",
  "labuan bajo": "Asia/Makassar",
  jakarta: "Asia/Jakarta",
  yogyakarta: "Asia/Jakarta",
  bangkok: "Asia/Bangkok",
  phuket: "Asia/Bangkok",
  "koh samui": "Asia/Bangkok",
  samui: "Asia/Bangkok",
  "koh phangan": "Asia/Bangkok",
  "koh tao": "Asia/Bangkok",
  krabi: "Asia/Bangkok",
  "koh lanta": "Asia/Bangkok",
  "koh yao noi": "Asia/Bangkok",
  "phang nga": "Asia/Bangkok",
  "khao lak": "Asia/Bangkok",
  "chiang mai": "Asia/Bangkok",
  "chiang rai": "Asia/Bangkok",
  "hua hin": "Asia/Bangkok",
  pattaya: "Asia/Bangkok",
  "koh kood": "Asia/Bangkok",
  "koh kut": "Asia/Bangkok",
  "koh chang": "Asia/Bangkok",
  "khao yai": "Asia/Bangkok",
  hanoi: "Asia/Ho_Chi_Minh",
  "ho chi minh": "Asia/Ho_Chi_Minh",
  "ho chi minh ville": "Asia/Ho_Chi_Minh",
  "ho chi minh city": "Asia/Ho_Chi_Minh",
  saigon: "Asia/Ho_Chi_Minh",
  "baie d halong": "Asia/Ho_Chi_Minh",
  "ha long": "Asia/Ho_Chi_Minh",
  "halong": "Asia/Ho_Chi_Minh",
  "hoi an": "Asia/Ho_Chi_Minh",
  danang: "Asia/Ho_Chi_Minh",
  "da nang": "Asia/Ho_Chi_Minh",
  hue: "Asia/Ho_Chi_Minh",
  "phu quoc": "Asia/Ho_Chi_Minh",
  "nha trang": "Asia/Ho_Chi_Minh",
  "siem reap": "Asia/Phnom_Penh",
  "angkor": "Asia/Phnom_Penh",
  "phnom penh": "Asia/Phnom_Penh",
  "luang prabang": "Asia/Vientiane",
  vientiane: "Asia/Vientiane",
  yangon: "Asia/Yangon",
  rangoun: "Asia/Yangon",
  bagan: "Asia/Yangon",
  "colombo": "Asia/Colombo",
  "sri lanka": "Asia/Colombo",
  galle: "Asia/Colombo",
  kandy: "Asia/Colombo",
  "new delhi": "Asia/Kolkata",
  delhi: "Asia/Kolkata",
  agra: "Asia/Kolkata",
  jaipur: "Asia/Kolkata",
  udaipur: "Asia/Kolkata",
  jodhpur: "Asia/Kolkata",
  rajasthan: "Asia/Kolkata",
  mumbai: "Asia/Kolkata",
  bombay: "Asia/Kolkata",
  goa: "Asia/Kolkata",
  kerala: "Asia/Kolkata",
  varanasi: "Asia/Kolkata",
  benares: "Asia/Kolkata",
  katmandou: "Asia/Kathmandu",
  kathmandu: "Asia/Kathmandu",
  "bhoutan": "Asia/Thimphu",
  bhutan: "Asia/Thimphu",
  paro: "Asia/Thimphu",
  thimphu: "Asia/Thimphu",
  // Océanie
  sydney: "Australia/Sydney",
  melbourne: "Australia/Melbourne",
  brisbane: "Australia/Brisbane",
  "gold coast": "Australia/Brisbane",
  cairns: "Australia/Brisbane",
  "port douglas": "Australia/Brisbane",
  "whitsundays": "Australia/Brisbane",
  "hamilton island": "Australia/Brisbane",
  perth: "Australia/Perth",
  adelaide: "Australia/Adelaide",
  "kangaroo island": "Australia/Adelaide",
  darwin: "Australia/Darwin",
  uluru: "Australia/Darwin",
  "ayers rock": "Australia/Darwin",
  "alice springs": "Australia/Darwin",
  hobart: "Australia/Hobart",
  tasmanie: "Australia/Hobart",
  tasmania: "Australia/Hobart",
  auckland: "Pacific/Auckland",
  queenstown: "Pacific/Auckland",
  wellington: "Pacific/Auckland",
  christchurch: "Pacific/Auckland",
  rotorua: "Pacific/Auckland",
  fidji: "Pacific/Fiji",
  fiji: "Pacific/Fiji",
  nadi: "Pacific/Fiji",
  // Amériques
  "new york": "America/New_York",
  manhattan: "America/New_York",
  brooklyn: "America/New_York",
  "the hamptons": "America/New_York",
  hamptons: "America/New_York",
  boston: "America/New_York",
  washington: "America/New_York",
  "washington dc": "America/New_York",
  philadelphia: "America/New_York",
  philadelphie: "America/New_York",
  miami: "America/New_York",
  "miami beach": "America/New_York",
  "south beach": "America/New_York",
  "palm beach": "America/New_York",
  "key west": "America/New_York",
  "les keys": "America/New_York",
  "florida keys": "America/New_York",
  orlando: "America/New_York",
  tampa: "America/New_York",
  atlanta: "America/New_York",
  charleston: "America/New_York",
  savannah: "America/New_York",
  nashville: "America/Chicago",
  "new orleans": "America/Chicago",
  "la nouvelle orleans": "America/Chicago",
  "nouvelle orleans": "America/Chicago",
  chicago: "America/Chicago",
  houston: "America/Chicago",
  dallas: "America/Chicago",
  austin: "America/Chicago",
  denver: "America/Denver",
  aspen: "America/Denver",
  vail: "America/Denver",
  "jackson hole": "America/Denver",
  yellowstone: "America/Denver",
  "salt lake city": "America/Denver",
  "park city": "America/Denver",
  "deer valley": "America/Denver",
  moab: "America/Denver",
  phoenix: "America/Phoenix",
  scottsdale: "America/Phoenix",
  sedona: "America/Phoenix",
  "grand canyon": "America/Phoenix",
  tucson: "America/Phoenix",
  "las vegas": "America/Los_Angeles",
  "los angeles": "America/Los_Angeles",
  "beverly hills": "America/Los_Angeles",
  "santa monica": "America/Los_Angeles",
  malibu: "America/Los_Angeles",
  hollywood: "America/Los_Angeles",
  "west hollywood": "America/Los_Angeles",
  "san diego": "America/Los_Angeles",
  "la jolla": "America/Los_Angeles",
  "palm springs": "America/Los_Angeles",
  "santa barbara": "America/Los_Angeles",
  "big sur": "America/Los_Angeles",
  carmel: "America/Los_Angeles",
  "carmel by the sea": "America/Los_Angeles",
  monterey: "America/Los_Angeles",
  "san francisco": "America/Los_Angeles",
  napa: "America/Los_Angeles",
  "napa valley": "America/Los_Angeles",
  sonoma: "America/Los_Angeles",
  "lake tahoe": "America/Los_Angeles",
  yosemite: "America/Los_Angeles",
  seattle: "America/Los_Angeles",
  honolulu: "Pacific/Honolulu",
  hawaii: "Pacific/Honolulu",
  hawai: "Pacific/Honolulu",
  oahu: "Pacific/Honolulu",
  waikiki: "Pacific/Honolulu",
  maui: "Pacific/Honolulu",
  wailea: "Pacific/Honolulu",
  lahaina: "Pacific/Honolulu",
  kauai: "Pacific/Honolulu",
  "big island": "Pacific/Honolulu",
  kona: "Pacific/Honolulu",
  anchorage: "America/Anchorage",
  alaska: "America/Anchorage",
  montreal: "America/Toronto",
  quebec: "America/Toronto",
  toronto: "America/Toronto",
  ottawa: "America/Toronto",
  "niagara falls": "America/Toronto",
  "chutes du niagara": "America/Toronto",
  tremblant: "America/Toronto",
  "mont tremblant": "America/Toronto",
  "charlevoix": "America/Toronto",
  vancouver: "America/Vancouver",
  whistler: "America/Vancouver",
  banff: "America/Edmonton",
  "lake louise": "America/Edmonton",
  jasper: "America/Edmonton",
  calgary: "America/Edmonton",
  "mexico": "America/Mexico_City",
  "mexico city": "America/Mexico_City",
  "ciudad de mexico": "America/Mexico_City",
  oaxaca: "America/Mexico_City",
  "san miguel de allende": "America/Mexico_City",
  guadalajara: "America/Mexico_City",
  "puerto vallarta": "America/Mexico_City",
  "punta mita": "America/Mexico_City",
  "riviera nayarit": "America/Mexico_City",
  cancun: "America/Cancun",
  tulum: "America/Cancun",
  "playa del carmen": "America/Cancun",
  "riviera maya": "America/Cancun",
  cozumel: "America/Cancun",
  "isla mujeres": "America/Cancun",
  holbox: "America/Cancun",
  merida: "America/Merida",
  "los cabos": "America/Mazatlan",
  "cabo san lucas": "America/Mazatlan",
  "san jose del cabo": "America/Mazatlan",
  havane: "America/Havana",
  "la havane": "America/Havana",
  havana: "America/Havana",
  varadero: "America/Havana",
  "punta cana": "America/Santo_Domingo",
  "saint domingue": "America/Santo_Domingo",
  "santo domingo": "America/Santo_Domingo",
  "republique dominicaine": "America/Santo_Domingo",
  "las terrenas": "America/Santo_Domingo",
  "samana": "America/Santo_Domingo",
  jamaique: "America/Jamaica",
  jamaica: "America/Jamaica",
  "montego bay": "America/Jamaica",
  negril: "America/Jamaica",
  bahamas: "America/Nassau",
  nassau: "America/Nassau",
  exumas: "America/Nassau",
  eleuthera: "America/Nassau",
  "harbour island": "America/Nassau",
  "turks et caicos": "America/Grand_Turk",
  "turks and caicos": "America/Grand_Turk",
  providenciales: "America/Grand_Turk",
  anguilla: "America/Anguilla",
  "sainte lucie": "America/St_Lucia",
  "saint lucia": "America/St_Lucia",
  "st lucia": "America/St_Lucia",
  barbade: "America/Barbados",
  barbados: "America/Barbados",
  antigua: "America/Antigua",
  aruba: "America/Aruba",
  curacao: "America/Curacao",
  bermudes: "Atlantic/Bermuda",
  bermuda: "Atlantic/Bermuda",
  "costa rica": "America/Costa_Rica",
  guanacaste: "America/Costa_Rica",
  "nosara": "America/Costa_Rica",
  "manuel antonio": "America/Costa_Rica",
  "panama city": "America/Panama",
  panama: "America/Panama",
  "bocas del toro": "America/Panama",
  carthagene: "America/Bogota",
  cartagena: "America/Bogota",
  bogota: "America/Bogota",
  medellin: "America/Bogota",
  lima: "America/Lima",
  cusco: "America/Lima",
  cuzco: "America/Lima",
  "machu picchu": "America/Lima",
  "vallee sacree": "America/Lima",
  "sacred valley": "America/Lima",
  arequipa: "America/Lima",
  quito: "America/Guayaquil",
  galapagos: "Pacific/Galapagos",
  "iles galapagos": "Pacific/Galapagos",
  "puerto ayora": "Pacific/Galapagos",
  "la paz bolivie": "America/La_Paz",
  "salar d uyuni": "America/La_Paz",
  uyuni: "America/La_Paz",
  santiago: "America/Santiago",
  "santiago du chili": "America/Santiago",
  "santiago de chile": "America/Santiago",
  valparaiso: "America/Santiago",
  atacama: "America/Santiago",
  "san pedro de atacama": "America/Santiago",
  patagonie: "America/Santiago",
  patagonia: "America/Santiago",
  "torres del paine": "America/Santiago",
  "ile de paques": "Pacific/Easter",
  "easter island": "Pacific/Easter",
  "hanga roa": "Pacific/Easter",
  "buenos aires": "America/Argentina/Buenos_Aires",
  mendoza: "America/Argentina/Mendoza",
  bariloche: "America/Argentina/Salta",
  "el calafate": "America/Argentina/Rio_Gallegos",
  ushuaia: "America/Argentina/Ushuaia",
  "iguazu": "America/Argentina/Cordoba",
  "chutes d iguazu": "America/Argentina/Cordoba",
  montevideo: "America/Montevideo",
  "punta del este": "America/Montevideo",
  "jose ignacio": "America/Montevideo",
  rio: "America/Sao_Paulo",
  "rio de janeiro": "America/Sao_Paulo",
  "sao paulo": "America/Sao_Paulo",
  paraty: "America/Sao_Paulo",
  "buzios": "America/Sao_Paulo",
  "salvador de bahia": "America/Bahia",
  trancoso: "America/Bahia",
  "fernando de noronha": "America/Noronha",
  manaus: "America/Manaus",
  amazonie: "America/Manaus",
};

/** Noms de pays qu’Intl n’écrit pas comme nous. La clé est pliée. */
const COUNTRY_ALIASES: Record<string, string> = {
  uk: "GB",
  "u k": "GB",
  england: "GB",
  angleterre: "GB",
  scotland: "GB",
  ecosse: "GB",
  wales: "GB",
  "grande bretagne": "GB",
  "great britain": "GB",
  "royaume uni": "GB",
  "united kingdom": "GB",
  usa: "US",
  "u s a": "US",
  "u s": "US",
  "etats unis": "US",
  "united states": "US",
  "etats unis d amerique": "US",
  hollande: "NL",
  holland: "NL",
  "pays bas": "NL",
  "republique tcheque": "CZ",
  "czech republic": "CZ",
  tchequie: "CZ",
  birmanie: "MM",
  burma: "MM",
  "coree du sud": "KR",
  "south korea": "KR",
  coree: "KR",
  vietnam: "VN",
  "viet nam": "VN",
  "ile maurice": "MU",
  maurice: "MU",
  "iles maldives": "MV",
  "polynesie francaise": "PF",
  "french polynesia": "PF",
  "emirats arabes unis": "AE",
  emirats: "AE",
  "united arab emirates": "AE",
  uae: "AE",
  "arabie saoudite": "SA",
  "saudi arabia": "SA",
  "costa rica": "CR",
  "republique dominicaine": "DO",
  "dominican republic": "DO",
  "afrique du sud": "ZA",
  "south africa": "ZA",
  "sri lanka": "LK",
  "nouvelle zelande": "NZ",
  "new zealand": "NZ",
  "nouvelle caledonie": "NC",
  "new caledonia": "NC",
  "cap vert": "CV",
  "cape verde": "CV",
  "ile de la reunion": "RE",
  "la reunion": "RE",
  reunion: "RE",
  "saint barthelemy": "BL",
  "saint barth": "BL",
  "st barth": "BL",
  "saint martin": "MF",
  "sint maarten": "SX",
  "hong kong": "HK",
  macao: "MO",
  macau: "MO",
  "taiwan": "TW",
  "the bahamas": "BS",
  "trinite et tobago": "TT",
  "trinidad and tobago": "TT",
  "saint kitts et nevis": "KN",
  "saint christophe et nieves": "KN",
  "iles caimans": "KY",
  "cayman islands": "KY",
  "iles turques et caiques": "TC",
  "turks and caicos": "TC",
  "turks et caicos": "TC",
  "iles vierges britanniques": "VG",
  "british virgin islands": "VG",
  "iles vierges americaines": "VI",
  "us virgin islands": "VI",
  "iles cook": "CK",
  "cook islands": "CK",
  "iles feroe": "FO",
  "faroe islands": "FO",
  "ile de man": "IM",
  "isle of man": "IM",
  kosovo: "XK",
  "vatican": "VA",
  "saint marin": "SM",
  "san marino": "SM",
  "swaziland": "SZ",
  "eswatini": "SZ",
};

/** Codes ISO 3166-1 alpha-2 des pays et territoires où l’on séjourne. */
const ISO_REGIONS = [
  "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AR", "AT", "AU", "AW", "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH",
  "BI", "BJ", "BL", "BM", "BN", "BO", "BQ", "BR", "BS", "BT", "BW", "BY", "BZ", "CA", "CD", "CF", "CG", "CH", "CI", "CK",
  "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CY", "CZ", "DE", "DJ", "DK", "DM", "DO", "DZ", "EC", "EE", "EG", "ER",
  "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR", "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP",
  "GQ", "GR", "GT", "GU", "GW", "GY", "HK", "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN", "IQ", "IR", "IS", "IT",
  "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN", "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK",
  "LR", "LS", "LT", "LU", "LV", "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ",
  "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NC", "NE", "NG", "NI", "NL", "NO", "NP", "NR", "NU", "NZ",
  "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW",
  "SA", "SB", "SC", "SD", "SE", "SG", "SH", "SI", "SK", "SL", "SM", "SN", "SO", "SR", "ST", "SV", "SX", "SY", "SZ", "TC",
  "TD", "TG", "TH", "TJ", "TL", "TM", "TN", "TO", "TR", "TT", "TV", "TW", "TZ", "UA", "UG", "US", "UY", "UZ", "VA", "VC",
  "VE", "VG", "VI", "VN", "VU", "WF", "WS", "XK", "YE", "YT", "ZA", "ZM", "ZW",
];

function fold(value: string) {
  return foldCityName(value);
}

export function validTimeZone(value: string | null | undefined): string | null {
  const zone = (value || "").trim();
  if (!zone.includes("/")) return null;
  try {
    Intl.DateTimeFormat("en-US", { timeZone: zone });
    return zone;
  } catch {
    return null;
  }
}

let countryNames: Map<string, string> | null = null;

/** « Thaïlande », « Thailand » ou « TH » → code ISO. Construit une fois, hors ligne, avec Intl. */
function countryCodeFor(raw: string | null | undefined): string | null {
  const text = fold(raw || "");
  if (!text) return null;
  if (COUNTRY_ALIASES[text]) return COUNTRY_ALIASES[text];
  if (/^[a-z]{2}$/.test(text)) return text.toUpperCase();
  if (!countryNames) {
    const names = new Map<string, string>();
    for (const locale of ["fr", "en"]) {
      let display: Intl.DisplayNames | null = null;
      try {
        display = new Intl.DisplayNames([locale], { type: "region" });
      } catch {
        display = null;
      }
      if (!display) continue;
      for (const code of ISO_REGIONS) {
        try {
          const label = display.of(code);
          if (!label || label === code) continue;
          const key = fold(label);
          if (key && !names.has(key)) names.set(key, code);
        } catch {
          // code inconnu de cette version d’ICU
        }
      }
    }
    countryNames = names;
  }
  return countryNames.get(text) || null;
}

type CityRow = { city: string; city_ascii: string; iso2: unknown; country: string; timezone: string; pop: number };

/** Le jeu de données met -99 à la place du code pour un territoire contesté (Kosovo, Somaliland). */
function isoOf(row: CityRow) {
  return typeof row.iso2 === "string" ? row.iso2.toUpperCase() : "";
}

let cityIndex: Map<string, CityRow[]> | null = null;
let countryZones: Map<string, Set<string>> | null = null;

function buildCityIndex() {
  const index = new Map<string, CityRow[]>();
  const zones = new Map<string, Set<string>>();
  for (const row of cityMapping as unknown as CityRow[]) {
    if (!validTimeZone(row.timezone)) continue;
    const iso = isoOf(row);
    if (/^[A-Z]{2}$/.test(iso)) {
      const set = zones.get(iso) || new Set<string>();
      set.add(row.timezone);
      zones.set(iso, set);
    }
    for (const name of new Set([fold(row.city_ascii || ""), fold(row.city || "")])) {
      if (!name) continue;
      const list = index.get(name);
      if (list) list.push(row);
      else index.set(name, [row]);
    }
  }
  cityIndex = index;
  countryZones = zones;
}

/** Villes du jeu de données portant ce nom plié. Index construit au premier appel. */
function citiesNamed(key: string): CityRow[] {
  if (!cityIndex) buildCityIndex();
  return cityIndex?.get(key) || [];
}

/** Le pays figure dans le jeu de données : un nom de ville absent n’y sera pas deviné ailleurs. */
function countryInDataset(code: string): boolean {
  if (!countryZones) buildCityIndex();
  return Boolean(countryZones?.has(code));
}

let ianaIndex: Map<string, string> | null = null;

/** « Nairobi » → Africa/Nairobi, « New York » → America/New_York, depuis les zones IANA d’ICU. */
function ianaZoneNamed(key: string): string | null {
  if (!ianaIndex) {
    const index = new Map<string, string>();
    const supported =
      typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : ([] as string[]);
    for (const zone of supported) {
      if (zone.startsWith("Etc/") || zone.startsWith("Antarctica/") || !zone.includes("/")) continue;
      const name = fold(zone.slice(zone.lastIndexOf("/") + 1).replace(/_/g, " "));
      if (name && !index.has(name)) index.set(name, zone);
    }
    ianaIndex = index;
  }
  return ianaIndex.get(key) || null;
}

/** Le pays départage les homonymes (Victoria aux Seychelles, pas au Canada). Sinon la plus peuplée. */
function pickCity(rows: CityRow[], countryCode: string | null): CityRow | null {
  if (!rows.length) return null;
  const byPop = [...rows].sort((a, b) => (b.pop || 0) - (a.pop || 0));
  if (!countryCode) return byPop[0];
  const inCountry = byPop.find((row) => isoOf(row) === countryCode);
  if (inCountry) return inCountry;
  return countryInDataset(countryCode) ? null : byPop[0];
}

/**
 * Un libellé peut porter un code postal, une parenthèse, plusieurs villes (« Tel Aviv et Seychelles »,
 * « Paris → Nice »). Une ville de départ n’est pas une ville de séjour dès qu’une autre est citée.
 */
function cityTokens(raw: string): string[] {
  const cleaned = raw.replace(/\([^)]*\)/g, " ");
  const parts = cleaned
    .split(/\s*(?:,|;|\/|\||→|->|>|&|\+|\n)\s*/)
    .flatMap((part) => fold(part).split(/\s+(?:et|and|puis|then)\s+/))
    .map((part) =>
      part
        .replace(/^\d{3,7}\s+/, "")
        .replace(/^(?:a|au|aux|en|vers|the)\s+/, "")
        .replace(/\s+cedex(?:\s+\d+)?$/, "")
        .trim()
    )
    .filter(Boolean);
  const unique = [...new Set(parts)];
  const stays = unique.filter((part) => !isOriginHub(part));
  return stays.length ? stays : unique;
}

function curatedZone(token: string): string | null {
  const key = cityPlaceKey(token);
  if (!key) return null;
  if (CITY_ZONES[key]) return CITY_ZONES[key];
  const words = key.split(" ");
  for (let keep = words.length - 1; keep >= 1; keep -= 1) {
    const shorter = words.slice(0, keep).join(" ");
    if (CITY_ZONES[shorter]) return CITY_ZONES[shorter];
  }
  return null;
}

/**
 * Fuseau IANA d’une ville de séjour. Une ville du pays indiqué dans le jeu de 7 000 villes hors ligne
 * passe d’abord (Victoria au Canada, Florence aux États-Unis). Puis la liste maison, qui connaît les
 * lieux de villégiature que les jeux de données ignorent (Deauville, Courchevel, Saint-Barth), puis le
 * jeu de villes sans pays, puis le nom de zone IANA.
 */
export function timezoneForCity(city: string | null | undefined, country?: string | null): string | null {
  if (!city) return null;
  const tokens = cityTokens(city);
  if (!tokens.length) return null;
  const countryCode = countryCodeFor(country);
  for (const token of tokens) {
    if (countryCode) {
      const inCountry = pickCity(citiesNamed(cityPlaceKey(token)).filter((row) => isoOf(row) === countryCode), countryCode);
      if (inCountry) return inCountry.timezone;
    }
    const curated = curatedZone(token);
    if (curated && validTimeZone(curated)) return curated;
  }
  for (const token of tokens) {
    const key = cityPlaceKey(token);
    if (!key) continue;
    const dataset = pickCity(citiesNamed(key), countryCode);
    if (dataset) return dataset.timezone;
    const iana = ianaZoneNamed(key);
    if (iana && (!countryCode || !countryInDataset(countryCode) || countryZonesHas(countryCode, iana))) return iana;
  }
  return null;
}

function countryZonesHas(code: string, zone: string) {
  if (!countryZones) buildCityIndex();
  return Boolean(countryZones?.get(code)?.has(zone));
}

/** Fuseau d’un pays à fuseau unique (code ou nom, français ou anglais). Null pour les grands pays. */
export function timezoneForCountry(country: string | null | undefined): string | null {
  const code = countryCodeFor(country);
  return code ? timezoneForCountryCode(code) : null;
}

/**
 * Fuseau d’un soir de séjour. La ville où l’on dort passe avant tout :
 * ville de la carte hôtel, puis fuseau de la carte, puis destination du dossier, puis pays.
 * Le champ `timezone` du dossier ne sert que si rien ne se résout.
 */
export function timezoneForStay(input: {
  stored?: string | null;
  hotelZone?: string | null;
  city?: string | null;
  country?: string | null;
  destination?: string | null;
}): StayTimezone {
  const fromHotelCity = timezoneForCity(input.city, input.country);
  if (fromHotelCity) return { zone: fromHotelCity, source: "ville" };
  const hotel = validTimeZone(input.hotelZone);
  if (hotel) return { zone: hotel, source: "hotel" };
  const fromDestination = timezoneForCity(input.destination, input.country);
  if (fromDestination) return { zone: fromDestination, source: "ville" };
  const country = timezoneForCountry(input.country);
  if (country) return { zone: country, source: "pays" };
  const stored = validTimeZone(input.stored);
  if (stored) return { zone: stored, source: "dossier" };
  return { zone: null, source: null };
}

export const STAY_TIMEZONE_SOURCE_LABELS: Record<StayTimezoneSource, string> = {
  ville: "ville du séjour",
  hotel: "carte hôtel",
  pays: "pays",
  dossier: "champ du dossier",
};
