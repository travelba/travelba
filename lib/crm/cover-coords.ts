/**
 * Villes du catalogue qui ont leur propre photo, avec un point réel.
 * Sert à rattacher un lieu géocodé à la ville photographiée la plus proche.
 */
export type PhotographedCity = {
  key: string;
  country: string;
  lat: number;
  lon: number;
  photo: string;
};

export const PHOTOGRAPHED_CITIES: PhotographedCity[] = [
  { key: "avoriaz", country: "fr", lat: 46.19243, lon: 6.77341, photo: "photo-1674043613875-eabfa5a45425" },
  { key: "antibes", country: "fr", lat: 43.58127, lon: 7.12487, photo: "photo-antibes-garoupe" },
  { key: "paris", country: "fr", lat: 48.85341, lon: 2.3488, photo: "photo-1502602898657-3e91760cbb34" },
  { key: "london", country: "gb", lat: 51.50853, lon: -0.12574, photo: "photo-1513635269975-59663e0ac1ad" },
  { key: "amsterdam", country: "nl", lat: 52.37403, lon: 4.88969, photo: "photo-1534351590666-13e3e96b5017" },
  { key: "vienne", country: "at", lat: 48.20835, lon: 16.3725, photo: "photo-1516550893923-42d28e5677af" },
  { key: "zermatt", country: "ch", lat: 46.01998, lon: 7.74863, photo: "photo-1666434307886-92f240066e18" },
  { key: "lugano", country: "ch", lat: 46.01008, lon: 8.96004, photo: "photo-1756755510958-9f02ec73445c" },
  { key: "rome", country: "it", lat: 41.89193, lon: 12.51133, photo: "photo-1552832230-c0197dd311b5" },
  { key: "venise", country: "it", lat: 45.43719, lon: 12.33459, photo: "photo-1523906834658-6e24ef2386f9" },
  { key: "barcelone", country: "es", lat: 41.38258, lon: 2.17707, photo: "photo-1583422409516-2895a77efded" },
  { key: "lisbonne", country: "pt", lat: 38.70775, lon: -9.13659, photo: "photo-1585208798174-6cedd86e019a" },
  { key: "lamego", country: "pt", lat: 41.09741, lon: -7.80991, photo: "photo-lamego-remedios" },
  { key: "santorin", country: "gr", lat: 36.40572, lon: 25.45682, photo: "photo-1533105079780-92b9be482077" },
  { key: "istanbul", country: "tr", lat: 41.01384, lon: 28.94966, photo: "photo-1524231757912-21f4fe3a7200" },
  { key: "prague", country: "cz", lat: 50.08804, lon: 14.42076, photo: "photo-1541849546-216549ae216d" },
  { key: "budapest", country: "hu", lat: 47.49835, lon: 19.04045, photo: "photo-1551867633-194f125bddfa" },
  { key: "dubrovnik", country: "hr", lat: 42.64125, lon: 18.10909, photo: "photo-1555990793-da11153b2473" },
  { key: "moscou", country: "ru", lat: 55.62558, lon: 37.60639, photo: "photo-1513326738677-b964603b136d" },
  { key: "marrakech", country: "ma", lat: 31.62583, lon: -7.98916, photo: "photo-1677837488142-a85ffbffe408" },
  { key: "le caire", country: "eg", lat: 30.04439, lon: 31.23573, photo: "photo-1539768942893-daf53e448371" },
  { key: "serengeti", country: "tz", lat: -2.33333, lon: 34.83333, photo: "photo-1516426122078-c23e76319801" },
  { key: "tel aviv", country: "il", lat: 32.08088, lon: 34.78057, photo: "photo-1528791075103-b149f525eb22" },
  { key: "dubai", country: "ae", lat: 25.07725, lon: 55.30927, photo: "photo-1512453979798-5ea266f8880c" },
  { key: "petra", country: "jo", lat: 30.32584, lon: 35.47457, photo: "photo-1548786811-dd6e453ccca7" },
  { key: "tokyo", country: "jp", lat: 35.6895, lon: 139.69171, photo: "photo-1540959733332-eab4deabeeaf" },
  { key: "kyoto", country: "jp", lat: 35.02107, lon: 135.75385, photo: "photo-1493976040374-85c8e12f0c0e" },
  { key: "hong kong", country: "cn", lat: 22.27832, lon: 114.17469, photo: "photo-1536599018102-9f803c140fc1" },
  { key: "singapour", country: "sg", lat: 1.28967, lon: 103.85007, photo: "photo-1525625293386-3f8f99389edd" },
  { key: "kuala lumpur", country: "my", lat: 3.1412, lon: 101.68653, photo: "photo-1596422846543-75c6fc197f07" },
  { key: "bali", country: "id", lat: -8.22713, lon: 115.19192, photo: "photo-1537996194471-e657df975ab4" },
  { key: "agra", country: "in", lat: 27.18333, lon: 78.01667, photo: "photo-1524492412937-b28074a5d7da" },
  { key: "male", country: "mv", lat: 4.17521, lon: 73.50916, photo: "photo-1514282401047-d79a71a590e8" },
  { key: "sydney", country: "au", lat: -33.86785, lon: 151.20732, photo: "photo-1506973035872-a4ec16b8e8d9" },
  { key: "new york", country: "us", lat: 40.71427, lon: -74.00597, photo: "photo-1496442226666-8d4d0e62e6e9" },
  { key: "miami", country: "us", lat: 25.77427, lon: -80.19366, photo: "photo-1533106497176-45ae19e68ba2" },
  { key: "banff", country: "ca", lat: 51.17622, lon: -115.56982, photo: "photo-1503614472-8c93d56e92ce" },
  { key: "havane", country: "cu", lat: 23.13302, lon: -82.38304, photo: "photo-1500759285222-a95626b934cb" },
  { key: "panama city", country: "pa", lat: 8.9936, lon: -79.51973, photo: "photo-1675090696282-b97a00d22f07" },
  { key: "machu picchu", country: "pe", lat: -13.16434, lon: -72.54501, photo: "photo-1526392060635-9d6019884377" },
  { key: "rio", country: "br", lat: -22.90642, lon: -43.18223, photo: "photo-1483729558449-99ef09a8c325" },
  { key: "buenos aires", country: "ar", lat: -34.61315, lon: -58.37723, photo: "photo-1589909202802-8f4aadce1849" },
];
