-- Existing plants start unplaced. The existing plant RLS and sync trigger also cover pins.
alter table public.plants
  add column home_room text,
  add column home_x smallint,
  add column home_y smallint,
  add constraint plants_valid_home_placement check (
    (home_room is null and home_x is null and home_y is null)
    or (home_room is not null and home_x is not null and home_y is not null
      and home_room in ('living','bedroom','kitchen','office','balcony')
      and home_x between 0 and 100 and home_y between 0 and 100)
  );
