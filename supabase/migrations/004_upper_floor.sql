-- Retain existing coordinates and allow the two upstairs spaces.
alter table public.plants
  drop constraint plants_valid_home_placement,
  add constraint plants_valid_home_placement check (
    (home_room is null and home_x is null and home_y is null)
    or (home_room is not null and home_x is not null and home_y is not null
      and home_room in ('living','bedroom','kitchen','office','balcony','studio','terrace')
      and home_x between 0 and 100 and home_y between 0 and 100)
  );
