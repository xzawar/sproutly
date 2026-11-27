import {
  allocateLegacyPlacement,
  findPlacement,
  validPlacement,
  rooms,
  roomIds,
  type Placement,
  type RoomId,
} from "./home";

interface PlantPosition {
  id: string;
  location: string;
  environment?: string;
  home_room?: string | null;
  home_x?: number | null;
  home_y?: number | null;
  home_layout_version?: number;
  archived_at?: Date | string | null;
}

export const HOME_LAYOUT_VERSION = 1;
export function recordPlacement(plant: PlantPosition): Placement | null {
  const { home_room, home_x, home_y } = plant;
  if (
    !roomIds.includes(home_room as RoomId) ||
    !Number.isInteger(home_x) ||
    !Number.isInteger(home_y)
  )
    return null;
  return { room: home_room as RoomId, x: home_x!, y: home_y! };
}
export function placementFields(placement: Placement | null) {
  return {
    home_room: placement?.room ?? null,
    home_x: placement?.x ?? null,
    home_y: placement?.y ?? null,
    home_layout_version: HOME_LAYOUT_VERSION,
  };
}
export function locationHint(location: string, environment?: string) {
  return (
    location.trim() ||
    (environment === "outdoor" ? "Front garden" : "Living room")
  );
}

export function allocatePlant(
  rows: PlantPosition[],
  location: string,
  environment?: string,
  current?: PlantPosition | null,
  preferred?: Placement | null,
) {
  const occupied = rows
    .filter((p) => !p.archived_at && p.id !== current?.id)
    .flatMap((p) => recordPlacement(p) ?? []);
  const placement = findPlacement(
    locationHint(location, environment),
    occupied,
    preferred,
  );
  if (!placement)
    throw Error("This location is full. Choose another room or garden bed.");
  return placementFields(placement);
}

export function movedPlantFields(
  rows: PlantPosition[],
  plant: PlantPosition,
  placement: Placement | null,
) {
  // Older clients remove an indoor pin with null. Preserve their intent by allocating a real garden spot.
  const old = recordPlacement(plant);
  const room = placement?.room ?? "front-garden";
  const location =
    old?.room === room && plant.location.trim()
      ? plant.location
      : rooms[room].name;
  return {
    ...allocatePlant(
      rows,
      rooms[room].name,
      plant.environment,
      plant,
      placement,
    ),
    location,
  };
}

export function restoredPlantFields(
  rows: PlantPosition[],
  plant: PlantPosition,
) {
  const occupied = rows
    .filter((p) => !p.archived_at && p.id !== plant.id)
    .flatMap((p) => recordPlacement(p) ?? []);
  const old = recordPlacement(plant);
  const place = allocateLegacyPlacement(
    locationHint(plant.location, plant.environment),
    occupied,
    old,
  );
  if (!place)
    throw Error(
      "Your home is full. Move or archive another plant before restoring this one.",
    );
  return {
    ...placementFields(place),
    location:
      old && old.room !== place.room ? rooms[place.room].name : plant.location,
  };
}

export function samePlacement(left: Placement | null, right: Placement | null) {
  return (
    left?.room === right?.room && left?.x === right?.x && left?.y === right?.y
  );
}

/** Existing coordinates keep first choice; missing ones fill the nearest safe open surfaces in ID order. */
export function backfillHome(rows: PlantPosition[]) {
  const occupied = rows
    .filter(
      (p) => !p.archived_at && p.home_layout_version === HOME_LAYOUT_VERSION,
    )
    .flatMap((p) => recordPlacement(p) ?? []);
  const priority = (p: PlantPosition) => {
    const place = recordPlacement(p);
    return place ? (validPlacement(place) ? 2 : 1) : 0;
  };
  const legacy = rows
    .filter(
      (p) => !p.archived_at && p.home_layout_version !== HOME_LAYOUT_VERSION,
    )
    .sort((a, b) => priority(b) - priority(a) || a.id.localeCompare(b.id));
  let full = false;
  return legacy.map((plant) => {
    const saved = recordPlacement(plant);
    const placement = full
      ? null
      : allocateLegacyPlacement(
          locationHint(plant.location, plant.environment),
          occupied,
          saved,
        );
    if (placement) occupied.push(placement);
    else full = true;
    return { id: plant.id, ...placementFields(placement) };
  });
}
