import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  Briefcase,
  Building2,
  Car,
  Clock,
  ConciergeBell,
  MessageCircle,
  Plane,
  Play,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Users,
  Wallet,
} from "lucide-react";
import { Photo } from "@/components/vitrine/Photo";
import { contactPath, PREVIEW, voyagePath } from "@/lib/vitrine/paths";

const privileges = [
  {
    n: "01",
    title: "Petit-déjeuner offert quotidiennement",
    text: "Buffet gastronomique ou servi à la carte en suite pour deux convives durant l'intégralité du séjour.",
    foot: "SYSTÉMATIQUE · 5 ÉTOILES",
    icon: ConciergeBell,
  },
  {
    n: "02",
    title: "Early Check-in & Late Check-out",
    text: "Arrivée matinale et départ tardif jusqu'à 16h00 garantis selon disponibilité pour un confort sans contrainte horaire.",
    foot: "SOUPLESSE HORAIRE VIP",
    icon: Clock,
  },
  {
    n: "03",
    title: "Surclassement prioritaire",
    text: "Passage à la catégorie supérieure de chambre ou suite dès la confirmation de réservation par votre concierge.",
    foot: "PRIORITÉ HAUT DE RANG",
    icon: Sparkles,
  },
  {
    n: "04",
    title: "Crédit de séjour exclusif (100 $ à 200 $)",
    text: "À faire valoir sur les tables gastronomiques, les rituels de spa ou les activités privées de l'établissement.",
    foot: "CRÉDIT SPA & DINING",
    icon: Wallet,
  },
];

const creations = [
  {
    roman: "I.",
    title: "JAPON",
    href: voyagePath("japon"),
    image: "photo-1493976040374-85c8e12f0c0e",
    alt: "Sanctuaire et allée de torii, lumière du soir",
    quote: "« Sérénité impériale, des ruelles de Gion aux cimes du Mont Fuji »",
    body: "Ryokans centenaires réservés en exclusivité, dégustation kaiseki avec chefs triples étoilés et transferts en hélicoptère privé au-dessus de la baie de Sagami.",
    badge: "IMMERSION PRIVATIVE · 12 JOURS",
    cta: "Consulter le dossier d'itinéraire",
    span: "is-7",
    shot: "is-tall",
    quoteSize: "is-quote-lg",
  },
  {
    roman: "II.",
    title: "NAMIBIE",
    href: voyagePath("namibie"),
    image: "photo-1484318571209-661cf29a69c3",
    alt: "Dunes du Namib au crépuscule",
    quote: "« Les dunes de Sossusvlei & safaris aériens en lodge privé »",
    body: "Vols en Cessna privé entre les concessions sauvages du Namib et les réserves préservées de la côte des Squelettes.",
    badge: "SAFARI AÉRIEN · 10 JOURS",
    cta: "Consulter le dossier d'itinéraire",
    span: "is-5",
    shot: "is-mid",
    quoteSize: "is-quote-md",
  },
  {
    roman: "III.",
    title: "POLYNÉSIE",
    href: `${PREVIEW}/voyages`,
    image: "photo-1507525428034-b723cf961d3e",
    alt: "Lagon et pilotis au-dessus de l'eau",
    quote: "« Atolls secrets & pilotis suspendus sur le lagon turquoise »",
    body: "",
    badge: "",
    cta: "Découvrir la création",
    span: "is-4",
    shot: "is-short",
    quoteSize: "",
  },
  {
    roman: "IV.",
    title: "PATAGONIE ARGENTINE",
    href: voyagePath("argentine"),
    image: "photo-1531761535209-180857e963b9",
    alt: "Glacier et aiguilles de Patagonie",
    quote: "« Glaciers millénaires et estancias australes au bout du monde »",
    body: "",
    badge: "",
    cta: "Découvrir la création",
    span: "is-4",
    shot: "is-short",
    quoteSize: "",
  },
  {
    roman: "V.",
    title: "SEYCHELLES",
    href: voyagePath("seychelles"),
    image: "photo-1540202404-a2f29016b523",
    alt: "Rochers de granit dans l'océan Indien",
    quote: "« Sanctuaires granitiques et criques sauvages de l'Océan Indien »",
    body: "",
    badge: "",
    cta: "Découvrir la création",
    span: "is-4",
    shot: "is-short",
    quoteSize: "",
  },
];

const universes = [
  {
    title: "Voyages sur mesure",
    href: `${PREVIEW}/sur-mesure`,
    text: "Itinéraires entièrement façonnés selon vos aspirations. De la villa privée sur île déserte aux accès exclusifs dans les musées fermés au public.",
    icon: SlidersHorizontal,
  },
  {
    title: "Univers Kids",
    href: `${PREVIEW}/kids`,
    text: "L'excellence du voyage familial avec conciergerie parentale dédiée. Équipements de puériculture d'exception livrés sur place, nounous certifiées et aventures adaptées.",
    icon: Users,
  },
  {
    title: "Séminaires & événements",
    href: `${PREVIEW}/seminaires`,
    text: "Retraites d'exception et sommets d'entreprise inoubliables. Privatisation de domaines viticoles, de châteaux historiques ou d'îlots pour comités de direction.",
    icon: Building2,
  },
  {
    title: "Déplacements professionnels",
    href: `${PREVIEW}/professionnels`,
    text: "Prise en charge IATA des exigences d'affaires les plus complexes. Billetterie aérienne corporate d'urgence, charters court préavis et conciergerie 24/7 sans interruption.",
    icon: Briefcase,
  },
];

export function HomeView() {
  return (
    <>
      <section className="vz-home-hero">
        <div className="vz-aura vz-aura-a" aria-hidden />
        <div className="vz-aura vz-aura-b" aria-hidden />
        <div className="vz-frame vz-hero-grid">
          <div className="vz-hero-copy">
            <div className="vz-eyebrow">
              <span />
              <p>Haute conciergerie privée & charter</p>
            </div>
            <h1>
              L&apos;art du voyage, <br />
              <em>orchestré pour vous.</em>
            </h1>
            <p className="vz-hero-lede">
              Agence IATA de voyages de luxe et d&apos;accompagnement VIP. Votre voyage, en temps réel, dans
              l&apos;application Travel BA.
            </p>
            <div className="vz-hero-cta">
              <Link className="vz-btn" href={contactPath("projet")}>
                Concevoir mon voyage
              </Link>
              <Link className="vz-btn is-ghost" href={`${PREVIEW}/application`}>
                Découvrir l&apos;application
              </Link>
            </div>
            <div className="vz-accredit">
              <p>
                <BadgeCheck size={18} strokeWidth={1.5} />
                IATA Accrédité 20-2 4910
              </p>
              <i />
              <p>
                <Shield size={18} strokeWidth={1.5} />
                Garantie APST & RCP Pro
              </p>
            </div>
          </div>

          <div className="vz-device-wrap" id="app">
            <div className="vz-amoled">
              <div className="vz-island" aria-hidden>
                <i />
                <i />
              </div>
              <div className="vz-amoled-screen">
                <div className="vz-screen-glow" aria-hidden />
                <div>
                  <div className="vz-app-head">
                    <p>
                      <i className="is-live" />
                      Travel BA App · Voyage en cours
                    </p>
                    <Bell size={18} strokeWidth={1.5} />
                  </div>
                  <p className="vz-app-k">Destination active</p>
                  <h3>
                    Japon — <em>Voyage signature</em>
                  </h3>
                  <p className="vz-app-sub">Itinéraire 12 jours · Kyoto & Tokyo Impérial</p>

                  <div className="vz-app-card is-gold">
                    <div>
                      <span>Étape du moment</span>
                      <span>10:00 JST</span>
                    </div>
                    <p>Jour 3 · Kyoto — Ryokan d&apos;exception, cérémonie du thé privée au temple Kodai-ji</p>
                    <small>Maître de thé réservé en exclusivité pour vos convives.</small>
                  </div>

                  <div className="vz-app-row">
                    <span>
                      <Car size={18} strokeWidth={1.5} />
                    </span>
                    <div>
                      <p>Transfert Privé VIP</p>
                      <strong>Berline Classe S & chauffeur dédié (14h30)</strong>
                    </div>
                  </div>

                  <div className="vz-app-row">
                    <span>
                      <Plane size={18} strokeWidth={1.5} />
                    </span>
                    <div>
                      <p>
                        Billet IATA Émis <b>Confirmé</b>
                      </p>
                      <strong>Vol AF272 · Paris CDG → Osaka KIX</strong>
                      <small>Première Classe · Siège 1A & 1E</small>
                    </div>
                  </div>

                  <div className="vz-app-concierge">
                    <div>
                      <i className="is-live" />
                      <div>
                        <p>Conseiller 24/7 en direct</p>
                        <small>Temps de réponse moyen : 45 sec</small>
                      </div>
                    </div>
                    <MessageCircle size={18} strokeWidth={1.5} />
                  </div>
                </div>
                <div className="vz-stores">
                  <div>
                    <Play size={14} strokeWidth={1.5} />
                    <p>
                      <small>Disponible sur</small>
                      App Store
                    </p>
                  </div>
                  <div>
                    <Play size={14} strokeWidth={1.5} />
                    <p>
                      <small>Disponible sur</small>
                      Google Play
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="vz-band" id="club">
        <div className="vz-frame vz-center">
          <div className="vz-diamond">
            <span />
            <b>♦</b>
            <span />
          </div>
          <p className="vz-caps">Accès privé aux palaces & retraites du monde</p>
          <h2>
            LE CLUB TRAVEL BA — <em>Privilèges Exclusifs</em>
          </h2>
          <p className="vz-center-lede">
            Grâce à notre affiliation IATA et nos accords bilatéraux avec les plus prestigieuses enseignes hôtelières de
            la planète, nos membres bénéficient d&apos;égards incomparables à chaque escale.
          </p>
          <div className="vz-priv">
            {privileges.map((item) => (
              <article key={item.n}>
                <div>
                  <div className="vz-priv-top">
                    <span>{item.n}</span>
                    <i>
                      <item.icon size={20} strokeWidth={1.5} />
                    </i>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
                <small>{item.foot}</small>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="vz-canvas" id="signature">
        <div className="vz-frame">
          <header className="vz-sig-head">
            <div>
              <p className="vz-caps">Collection éditoriale haute couture</p>
              <h2>VOYAGES SIGNATURE</h2>
            </div>
            <p className="vz-sig-count">
              <em>43</em>
              <span>créations exclusives à travers le monde</span>
            </p>
          </header>
          <div className="vz-creations">
            {creations.map((item) => (
              <Link key={item.roman} href={item.href} className={`vz-creation ${item.span}`}>
                <div className={`vz-shot ${item.shot}`}>
                  <Photo id={item.image} alt={item.alt} priority={item.span === "is-7"} />
                  {item.badge ? <b>{item.badge}</b> : null}
                </div>
                <div className={item.body ? "vz-creation-copy" : "vz-creation-copy is-tight"}>
                  <div className="vz-creation-title">
                    <span>{item.roman}</span>
                    <h3 className={item.body ? "is-lg" : ""}>{item.title}</h3>
                  </div>
                  <p className={`vz-creation-quote ${item.quoteSize}`}>{item.quote}</p>
                  {item.body ? <p className="vz-creation-body">{item.body}</p> : null}
                  <span className="vz-creation-cta">
                    {item.cta} <ArrowRight size={16} strokeWidth={1.5} />
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </section>

      <section className="vz-band" id="univers">
        <div className="vz-frame vz-center">
          <p className="vz-caps">L&apos;éventail des expertises</p>
          <h2>LES UNIVERS TRAVEL BA</h2>
          <p className="vz-center-lede">
            Quatre départements spécialisés conduits par des artisans de haute conciergerie et des gestionnaires
            d&apos;aviation privée.
          </p>
          <div className="vz-uni">
            {universes.map((item) => (
              <article key={item.title}>
                <div>
                  <item.icon size={30} strokeWidth={1.25} />
                  <h3>{item.title}</h3>
                  <p>{item.text}</p>
                </div>
                <Link href={item.href}>
                  <span>Découvrir l&apos;univers</span>
                  <span>→</span>
                </Link>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="vz-witness">
        <div className="vz-witness-mark" aria-hidden>
          ♦
        </div>
        <div className="vz-frame vz-center">
          <div className="vz-diamond is-wide">
            <span />
            <p className="vz-caps">Témoignage de confiance</p>
            <span />
          </div>
          <blockquote>
            « Plus qu’un voyage, Travel BA nous a offert une sérénité absolue. Chaque détail était anticipé avant même
            que nous n&apos;ayons à le formuler. »
          </blockquote>
          <p className="vz-witness-name">Famille de R.</p>
          <p className="vz-witness-meta">Voyage privé aux confins de Kyoto et Naoshima — Membres Club Travel BA</p>
        </div>
      </section>
    </>
  );
}
