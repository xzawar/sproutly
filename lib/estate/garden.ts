import type { Category, Plant } from "../types";
import { roomFloor, savedPlacement } from "../home";
import { backfillHome } from "../home-records";
import {
  healthByPlant,
  unknownHealth,
  type HealthContext,
  type PlantHealth,
} from "./health";

export type Level = "garden" | "dollhouse" | "ground" | "upper";
export const levelNames: Record<Level, string> = {
  garden: "Exterior",
  dollhouse: "Dollhouse",
  ground: "Ground floor",
  upper: "First floor",
};
export const roomLevel = roomFloor;

// Each entry maps a recognizable silhouette to botanical and common names. Group
// models disclose their approximation even when a plant matches one of their aliases.
export const plantModels = {
  monstera: { label: "Monstera", match: /\b(monstera|swiss cheese)\b/ },
  sword: {
    label: "Snake plant",
    match:
      /\b(snake plants?|sansevieria|dracaena trifasciata|mother in law.?s tongue)\b/,
  },
  lily: { label: "Peace lily", match: /\b(peace lil(y|ies)|spathiphyllum)\b/ },
  aloe: { label: "Aloe rosette", match: /\baloe\b/ },
  rose: { label: "Rose", match: /\b(roses?|rosa)\b/ },
  sunflower: { label: "Sunflower", match: /\b(sunflowers?|helianthus)\b/ },
  tulip: { label: "Tulip", match: /\b(tulips?|tulipa)\b/ },
  basil: { label: "Basil", match: /\b(basil|ocimum)\b/ },
  cactus: {
    label: "Ribbed cactus",
    match: /\b(cacti|cactus|echinopsis|ferocactus|echinocactus)\b/,
  },
  fern: { label: "Fern", match: /\b(ferns?|nephrolepis)\b/ },
  vine: {
    label: "Trailing pothos",
    match: /\b(pothos|epipremnum|money plant)\b/,
  },
  herb: {
    label: "Leafy herb",
    match: /\b(mint|thyme|rosemary|oregano|parsley|cilantro|mentha|herbs?)\b/,
    approximate: true,
  },
  tree: {
    label: "Small tree",
    match: /\b(olive|citrus|lemon|ficus|bonsai|pachira|money tree|trees?)\b/,
    approximate: true,
  },
  vegetable: {
    label: "Fruiting vegetable",
    match: /\b(tomato|pepper|capsicum|solanum|vegetables?)\b/,
    approximate: true,
  },
  flower: {
    label: "Flowering perennial",
    match: /\b(dais(y|ies)|dahlia|geranium|marigold|flowers?)\b/,
    approximate: true,
  },
  broadleaf: {
    label: "Broadleaf houseplant",
    match: /\b(broadleaf|pilea|chinese money plant)\b/,
    approximate: true,
  },
} as const;
export type Species = keyof typeof plantModels;
const categories: Record<string, Species> = {
  indoor: "broadleaf",
  outdoor: "tree",
  flowering: "flower",
  succulents: "aloe",
  herbs: "herb",
  vegetables: "vegetable",
  decorative: "vine",
  other: "broadleaf",
};
const models = Object.entries(plantModels) as [
  Species,
  { label: string; match: RegExp; approximate?: boolean },
][];
const approximateNames: [RegExp, Species][] = [
  [/\b(chinese money plant|pilea)\b/, "broadleaf"],
  [/\b(opuntia|prickly pear|schlumbergera)\b/, "cactus"],
  [/\b(agave|echeveria|succulents?)\b/, "aloe"],
  [/\b(ivy|hedera|philodendron)\b/, "vine"],
  [/\b(desert rose|adenium|rose of sharon|hibiscus)\b/, "flower"],
];
type SpeciesName = Pick<Plant, "name" | "common_name" | "scientific_name">;
function matchName(text: string) {
  const name = text.toLowerCase().trim().replace(/[-_]/g, " ");
  const alternative = approximateNames.find(([pattern]) => pattern.test(name));
  if (alternative)
    return {
      model: alternative[1],
      modelLabel: plantModels[alternative[1]].label,
      modelFallback: true,
    };
  const found = models.find(([, descriptor]) => descriptor.match.test(name));
  return found
    ? {
        model: found[0],
        modelLabel: found[1].label,
        modelFallback: Boolean(found[1].approximate),
      }
    : null;
}
export function resolvePlantModel(p: SpeciesName, category: string) {
  // A nickname can contain another plant's name. Prefer the recorded taxonomy.
  for (const field of [p.scientific_name, p.common_name, p.name]) {
    const match = matchName(field ?? "");
    if (match) return match;
  }
  const model =
    categories[category.toLowerCase().trim()] ??
    matchName(category)?.model ??
    "broadleaf";
  return { model, modelLabel: plantModels[model].label, modelFallback: true };
}
export function modelFor(p: SpeciesName, category: string): Species {
  return resolvePlantModel(p, category).model;
}
export function gardenPlants(
  plants: Plant[],
  groups: Category[],
  care?: HealthContext,
) {
  const names = new Map(groups.map((c) => [c.id, c.name]));
  const health = care ? healthByPlant(care) : new Map<string, PlantHealth>();
  const active = plants.filter((p) => !p.archived_at);
  const placements = new Map(active.map((p) => [p.id, savedPlacement(p)]));
  // Legacy snapshots use the same allocation pass as server migration and demo storage.
  for (const row of backfillHome(active))
    placements.set(row.id, savedPlacement(row));
  return active
    .sort(
      (a, b) =>
        a.added_on.localeCompare(b.added_on) || a.id.localeCompare(b.id),
    )
    .map((p) => {
      const category = names.get(p.category_id ?? "") ?? "Uncategorized";
      return {
        id: p.id,
        name: p.name,
        category,
        ...resolvePlantModel(p, category),
        placement: placements.get(p.id) ?? null,
        health: health.get(p.id) ?? unknownHealth,
      };
    });
}
export type Specimen = ReturnType<typeof gardenPlants>[number];

// Retained for callers of the original collection display. Saved placements use worldPoint.
export const gardenColumns = 6;
export function potPosition(index: number, count: number) {
  const row = Math.floor(index / gardenColumns),
    rowCount = Math.min(gardenColumns, count - row * gardenColumns);
  return {
    x: 5.6 + ((index % gardenColumns) - (rowCount - 1) / 2) * 2.15,
    z: 11.25 + row * 2.2,
  };
}
