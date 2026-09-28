/** Formes juridiques INSEE les plus utiles pour reconnaître une société. */
const LEGAL_FORMS: Record<string, string> = {
  "1000": "Entrepreneur individuel",
  "5202": "SNC",
  "5498": "EURL",
  "5499": "SARL",
  "5599": "SA",
  "5605": "SA à directoire",
  "5699": "SA",
  "5710": "SAS",
  "5720": "SASU",
  "6220": "GIE",
  "6533": "GAEC",
  "6538": "EARL",
  "6540": "SCI",
  "6551": "SCP",
  "9110": "Syndicat de copropriété",
  "9220": "Association déclarée",
  "9230": "Association reconnue d’utilité publique",
};

/** Libellé de division NAF (2 chiffres), assez pour distinguer deux homonymes. */
const NAF_DIVISIONS: Record<string, string> = {
  "01": "Agriculture",
  "10": "Industries alimentaires",
  "41": "Construction de bâtiments",
  "43": "Travaux de construction spécialisés",
  "45": "Commerce et réparation d’automobiles",
  "46": "Commerce de gros",
  "47": "Commerce de détail",
  "49": "Transports terrestres",
  "50": "Transports par eau",
  "51": "Transports aériens",
  "55": "Hébergement",
  "56": "Restauration",
  "58": "Édition",
  "62": "Programmation et conseil informatiques",
  "63": "Services d’information",
  "64": "Activités financières",
  "65": "Assurance",
  "66": "Activités auxiliaires financières",
  "68": "Activités immobilières",
  "69": "Activités juridiques et comptables",
  "70": "Sièges sociaux et conseil de gestion",
  "71": "Architecture et ingénierie",
  "73": "Publicité et études de marché",
  "74": "Autres activités spécialisées",
  "77": "Activités de location",
  "78": "Activités liées à l’emploi",
  "79": "Agences de voyage et voyagistes",
  "81": "Services aux bâtiments",
  "82": "Activités administratives",
  "85": "Enseignement",
  "86": "Santé humaine",
  "90": "Création artistique",
  "93": "Activités sportives et récréatives",
  "94": "Organisations associatives",
  "96": "Autres services personnels",
};

export function legalFormLabel(code: string | null | undefined) {
  const key = (code || "").replace(/\s/g, "");
  return LEGAL_FORMS[key] || null;
}

export function activityLabel(code: string | null | undefined) {
  const naf = (code || "").trim().toUpperCase();
  if (!naf) return null;
  const division = NAF_DIVISIONS[naf.slice(0, 2)];
  return division ? `${naf} · ${division}` : naf;
}
