import "server-only";

import { revalidatePath, revalidateTag, unstable_cache } from "next/cache";
import { createServiceClient } from "@/lib/supabase/admin";
import { productionOnlySecret } from "@/lib/crm/preview-secrets";
import {
  contentSlug,
  groupSupplierRooms,
  GUIDE_DETAIL_COLUMNS,
  GUIDE_LIST_COLUMNS,
  PUBLIC_CONTENT_REVALIDATE,
  PUBLIC_CONTENT_TAGS,
  RANKING_DETAIL_COLUMNS,
  RANKING_ENTRY_COLUMNS,
  RANKING_LIST_COLUMNS,
  SUPPLIER_ROOM_COLUMNS,
  type PublicContentTarget,
  type SupplierHotel,
} from "@/lib/crm/public-catalogue";

export type RankingCard = {
  slug: string;
  title_fr: string | null;
  title_en: string | null;
  kind: string | null;
  hero_image: string | null;
  reviewed_at: string | null;
};

export type RankingEntry = {
  rank: number | null;
  justification_fr: string | null;
  justification_en: string | null;
  badge_fr: string | null;
  badge_en: string | null;
  hotel_name: string;
  hotel_city: string | null;
  hero_image: string | null;
};

export type RankingPage = RankingCard & {
  intro_fr: string | null;
  intro_en: string | null;
  outro_fr: string | null;
  outro_en: string | null;
  faq: unknown;
  factual_summary_fr: string | null;
  factual_summary_en: string | null;
  editorial_sections: unknown;
  author_name: string | null;
  entries: RankingEntry[];
};

export type GuideCard = {
  slug: string;
  name_fr: string | null;
  name_en: string | null;
  scope: string | null;
  country_code: string | null;
  summary_fr: string | null;
  summary_en: string | null;
  hero_image: string | null;
  reviewed_at: string | null;
};

export type GuidePage = GuideCard & {
  summary_long_fr: string | null;
  sections: unknown;
  faq: unknown;
  highlights: unknown;
  practical_info: unknown;
  author_name: string | null;
};

function serviceReady() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").trim();
  const key = productionOnlySecret(process.env.SUPABASE_SERVICE_ROLE_KEY);
  return Boolean(url && key);
}

async function readRankingCards(): Promise<RankingCard[]> {
  if (!serviceReady()) return [];
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("editorial_rankings")
      .select(RANKING_LIST_COLUMNS)
      .eq("is_published", true)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data || []).filter((row) => contentSlug(row.slug));
  } catch (error) {
    console.error("[editorial-rankings]", error instanceof Error ? error.message : "lecture");
    return [];
  }
}

async function readRanking(slug: string): Promise<RankingPage | null> {
  if (!serviceReady() || !contentSlug(slug)) return null;
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("editorial_rankings")
      .select(RANKING_DETAIL_COLUMNS)
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const { data: entries, error: entryError } = await supabase
      .from("editorial_ranking_entries")
      .select(RANKING_ENTRY_COLUMNS)
      .eq("ranking_id", data.id)
      .eq("hotels.is_published", true)
      .order("rank", { ascending: true })
      .limit(50);
    if (entryError) throw new Error(entryError.message);
    return {
      slug: data.slug,
      title_fr: data.title_fr,
      title_en: data.title_en,
      kind: data.kind,
      hero_image: data.hero_image,
      reviewed_at: data.reviewed_at,
      intro_fr: data.intro_fr,
      intro_en: data.intro_en,
      outro_fr: data.outro_fr,
      outro_en: data.outro_en,
      faq: data.faq,
      factual_summary_fr: data.factual_summary_fr,
      factual_summary_en: data.factual_summary_en,
      editorial_sections: data.editorial_sections,
      author_name: data.author_name,
      entries: (entries || []).map(rankingEntry).filter((entry): entry is RankingEntry => Boolean(entry)),
    };
  } catch (error) {
    console.error("[editorial-rankings]", error instanceof Error ? error.message : "lecture");
    return null;
  }
}

function rankingEntry(row: {
  rank: number | null;
  justification_fr: string | null;
  justification_en: string | null;
  badge_fr: string | null;
  badge_en: string | null;
  hotels: { name?: string; city?: string | null; hero_image?: string | null; is_published?: boolean } | { name?: string; city?: string | null; hero_image?: string | null; is_published?: boolean }[] | null;
}): RankingEntry | null {
  const hotel = Array.isArray(row.hotels) ? row.hotels[0] : row.hotels;
  const name = hotel?.name?.trim();
  if (!name || hotel?.is_published === false) return null;
  return {
    rank: row.rank,
    justification_fr: row.justification_fr,
    justification_en: row.justification_en,
    badge_fr: row.badge_fr,
    badge_en: row.badge_en,
    hotel_name: name,
    hotel_city: hotel?.city || null,
    hero_image: hotel?.hero_image || null,
  };
}

async function readGuideCards(): Promise<GuideCard[]> {
  if (!serviceReady()) return [];
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("editorial_guides")
      .select(GUIDE_LIST_COLUMNS)
      .eq("is_published", true)
      .order("updated_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data || []).filter((row) => contentSlug(row.slug));
  } catch (error) {
    console.error("[editorial-guides]", error instanceof Error ? error.message : "lecture");
    return [];
  }
}

async function readGuide(slug: string): Promise<GuidePage | null> {
  if (!serviceReady() || !contentSlug(slug)) return null;
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("editorial_guides")
      .select(GUIDE_DETAIL_COLUMNS)
      .eq("slug", slug)
      .eq("is_published", true)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  } catch (error) {
    console.error("[editorial-guides]", error instanceof Error ? error.message : "lecture");
    return null;
  }
}

async function readSupplierHotels(): Promise<SupplierHotel[]> {
  if (!serviceReady()) return [];
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("supplier_room_catalog")
      .select(SUPPLIER_ROOM_COLUMNS)
      .eq("hotels.is_published", true)
      .limit(500);
    if (error) throw new Error(error.message);
    return groupSupplierRooms(data || []);
  } catch (error) {
    console.error("[supplier-data]", error instanceof Error ? error.message : "lecture");
    return [];
  }
}

const cacheOptions = (tag: string) => ({
  revalidate: PUBLIC_CONTENT_REVALIDATE,
  tags: [tag],
});

export const loadRankingCards = unstable_cache(readRankingCards, ["editorial-rankings-list"], cacheOptions(PUBLIC_CONTENT_TAGS.classements));

export function loadRanking(slug: string) {
  return unstable_cache(() => readRanking(slug), ["editorial-ranking", slug], cacheOptions(PUBLIC_CONTENT_TAGS.classements))();
}

export const loadGuideCards = unstable_cache(readGuideCards, ["editorial-guides-list"], cacheOptions(PUBLIC_CONTENT_TAGS.guides));

export function loadGuide(slug: string) {
  return unstable_cache(() => readGuide(slug), ["editorial-guide", slug], cacheOptions(PUBLIC_CONTENT_TAGS.guides))();
}

export const loadSupplierHotels = unstable_cache(readSupplierHotels, ["supplier-data-list"], cacheOptions(PUBLIC_CONTENT_TAGS.fournisseurs));

const CONTENT_PATHS: Record<PublicContentTarget, string[]> = {
  classements: ["/fr/classement", "/en/classement", "/fr/classement/[slug]", "/en/classement/[slug]"],
  guides: ["/fr/guide", "/en/guide", "/fr/guide/[slug]", "/en/guide/[slug]"],
  fournisseurs: [
    "/fr/donnees-fournisseur",
    "/en/donnees-fournisseur",
    "/fr/donnees-fournisseur/[slug]",
    "/en/donnees-fournisseur/[slug]",
  ],
};

/** Invalide le cache après une édition. Le HTML et la lecture Supabase repartent. */
export function invalidatePublicContent(target: PublicContentTarget | "tout") {
  const targets: PublicContentTarget[] =
    target === "tout" ? ["classements", "guides", "fournisseurs"] : [target];
  for (const item of targets) {
    revalidateTag(PUBLIC_CONTENT_TAGS[item], "max");
    for (const path of CONTENT_PATHS[item]) revalidatePath(path, "page");
  }
}
