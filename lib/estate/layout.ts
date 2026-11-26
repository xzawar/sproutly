import { blockedLandscape } from "./landscape";
import {
  floorObstructed,
  contains,
  rect,
  HOUSE as house,
  SITE as site,
  type Storey,
} from "./plan";
export { STAIR, FRONT_DOOR, BACK_DOOR } from "./plan";

const balcony = rect(9.96, 2.5, 2.84, 6);
const upperDeck = rect(0, 0, 10, 6);

// Door centres are valid from both adjacent walkable surfaces. The rest of the
// perimeter stays solid at every viewing angle, including the cutaway.
export function walkable(
  x: number,
  z: number,
  floor: Storey,
  radius = 0.2,
): boolean {
  if (floor === "garden") {
    if (!contains(site, x, z, radius) || blockedLandscape(x, z, radius))
      return false;
    const frontDoor = x > 4.24 + radius && x < 5.47 - radius && z >= 8.3;
    const backDoor = x > 3.99 + radius && x < 5.13 - radius && z <= 0.15;
    return (
      frontDoor ||
      backDoor ||
      (!contains(house, x, z, -radius) && !contains(balcony, x, z, -radius))
    );
  }
  if (floor === "upper") {
    return (
      contains(upperDeck, x, z, radius + 0.1) &&
      !floorObstructed(floor, x, z, radius)
    );
  }
  const frontDoor =
    x > 4.19 + radius && x < 5.51 - radius && z > 8.1 && z <= 8.86;
  const backDoor =
    x > 3.98 + radius && x < 5.14 - radius && z < 0.45 && z >= -0.35;
  const sideDoor =
    z > 5.24 + radius && z < 6.46 - radius && x > 9.6 && x < 10.32;
  return (
    (frontDoor ||
      backDoor ||
      sideDoor ||
      contains(house, x, z, radius) ||
      contains(balcony, x, z, radius)) &&
    !floorObstructed(floor, x, z, radius)
  );
}
