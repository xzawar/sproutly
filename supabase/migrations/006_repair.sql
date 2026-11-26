-- 006: repair and tune. Safe to run on any database that has 001 and 002, whether
-- or not 003-005 were applied, and safe to run more than once.
--   1. Brings the 3D Home columns, care-visit history and complete_home_visit() up to date
--      (the app fails with "Unable to open garden" when these are missing).
--   2. Lets Supabase Auth delete a user who has growth records or photos (cascade FKs).
--   3. Rewrites RLS policies to evaluate auth.uid()/is_active() once per statement.
--   4. Indexes the foreign keys flagged by the performance advisor.
begin;

-- 1. Home placement columns (003, 004, 005) -------------------------------------
alter table public.plants
  add column if not exists home_room text,
  add column if not exists home_x smallint,
  add column if not exists home_y smallint,
  add column if not exists home_layout_version smallint not null default 0;

alter table public.plants drop constraint if exists plants_valid_home_placement;

-- Older maps allowed shared coordinates or room ids that no longer exist. Unseat those
-- plants; the app reseats them on the owner's next visit.
update public.plants set home_room = null, home_x = null, home_y = null
where home_room is not null and (
  home_x is null or home_y is null or home_x not between 0 and 100 or home_y not between 0 and 100
  or home_room not in ('living','bedroom','kitchen','office','balcony','studio','terrace',
                       'countertop','shelf','window','hall','front-garden','backyard','patio'));
update public.plants set home_room = null, home_x = null, home_y = null
where home_room is null and (home_x is not null or home_y is not null);
with ranked as (
  select id, row_number() over (partition by user_id, home_room, home_x, home_y order by id) as ordinal
  from public.plants where archived_at is null and home_room is not null
)
update public.plants p set
  location = case when p.location = '' then replace(p.home_room, '-', ' ') else p.location end,
  home_room = null, home_x = null, home_y = null
from ranked where ranked.id = p.id and ranked.ordinal > 1;

alter table public.plants add constraint plants_valid_home_placement check (
  (home_room is null and home_x is null and home_y is null) or (
    home_room is not null and home_x is not null and home_y is not null and
    home_room in ('living','bedroom','kitchen','office','balcony','studio','terrace',
                  'countertop','shelf','window','hall','front-garden','backyard','patio') and
    home_x between 0 and 100 and home_y between 0 and 100
  )
);
create unique index if not exists plants_active_home_position
  on public.plants(user_id, home_room, home_x, home_y)
  where archived_at is null and home_room is not null;

-- Care visits recorded from the 3D home (005) -----------------------------------
alter table public.care_history alter column schedule_id drop not null;
alter table public.care_history add column if not exists care_request_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'history_plant_owner'
                 and conrelid = 'public.care_history'::regclass) then
    alter table public.care_history add constraint history_plant_owner
      foreign key (plant_id, user_id) references public.plants(id, user_id) on delete cascade;
  end if;
end $$;
create unique index if not exists history_care_request on public.care_history(care_request_id)
  where care_request_id is not null;
create unique index if not exists history_one_off_day on public.care_history(plant_id, activity, action_date)
  where schedule_id is null;

create or replace function public.complete_home_visit(
  p_request uuid,p_plant uuid,p_room text,p_x integer,p_y integer,
  p_activity text,p_schedule uuid default null,p_due date default null,p_notes text default ''
) returns uuid language plpgsql security definer set search_path='' as $$
declare
  u uuid := auth.uid();
  target public.plants%rowtype;
  routine public.care_schedules%rowtype;
  prior public.care_history%rowtype;
  action_day date;
  label text;
  event_id uuid;
begin
  if u is null or not public.is_active() then raise exception 'Authentication required'; end if;
  if p_request is null or p_plant is null or p_room is null or p_x is null or p_y is null
     or (p_activity is not null and p_activity not in ('Water','Fertilize','Prune','Mist'))
     or (p_schedule is null and (p_activity is null or p_due is not null))
     or (p_schedule is not null and p_due is null)
     or p_notes is null or length(p_notes)>4000 then raise exception 'Check the care visit and try again'; end if;
  select * into target from public.plants where id=p_plant and user_id=u for update;
  if not found then raise exception 'Plant unavailable'; end if;
  select * into prior from public.care_history where care_request_id=p_request and user_id=u;
  if found then
    if prior.plant_id<>p_plant or prior.schedule_id is distinct from p_schedule
      or (p_schedule is not null and prior.due_date<>p_due)
      or (p_activity is not null and (case when lower(trim(prior.activity)) in ('mist','misting') then 'Mist' else prior.activity end)<>p_activity)
    then raise exception 'This care request changed. Start a new visit.'; end if;
    return prior.id;
  end if;
  if target.archived_at is not null then raise exception 'Plant unavailable'; end if;
  if target.home_room is distinct from p_room or target.home_x is distinct from p_x or target.home_y is distinct from p_y then
    raise exception 'Plant moved during the visit. Open its new location and try again.';
  end if;
  select (now() at time zone timezone)::date into action_day from public.profiles where id=u;
  if p_schedule is not null then
    select * into routine from public.care_schedules where id=p_schedule and plant_id=p_plant and user_id=u for update;
    if not found then raise exception 'Routine unavailable'; end if;
    label := case when routine.activity='Custom' and lower(trim(routine.custom_name)) in ('mist','misting') then 'Mist' else routine.activity end;
    if label not in ('Water','Fertilize','Prune','Mist') or (p_activity is not null and label<>p_activity) then
      raise exception 'This routine changed. Open the updated task.';
    end if;
    perform public.resolve_care_task(p_schedule,p_due,'Completed',p_notes);
    update public.care_history set care_request_id=p_request where user_id=u and schedule_id=p_schedule and due_date=p_due returning id into event_id;
  else
    if exists(select 1 from public.care_schedules s where s.plant_id=p_plant and s.user_id=u and s.active and s.archived_at is null and s.next_due_date<=action_day
      and (s.activity=p_activity or (p_activity='Mist' and s.activity='Custom' and lower(trim(s.custom_name)) in ('mist','misting')))) then
      raise exception 'A matching routine is due. Refresh and complete its task.';
    end if;
    if exists(select 1 from public.care_history h where h.user_id=u and h.plant_id=p_plant and h.status='Completed' and h.action_date=action_day
      and (h.activity=p_activity or (p_activity='Mist' and lower(trim(h.activity)) in ('mist','misting')))) then
      raise exception 'This care was already recorded today.';
    end if;
    insert into public.care_history(user_id,plant_id,activity,schedule_id,due_date,action_date,status,notes,care_request_id)
      values(u,p_plant,p_activity,null,action_day,action_day,'Completed',p_notes,p_request) returning id into event_id;
  end if;
  return event_id;
end $$;
revoke all on function public.complete_home_visit(uuid,uuid,text,integer,integer,text,uuid,date,text) from public,anon;
grant execute on function public.complete_home_visit(uuid,uuid,text,integer,integer,text,uuid,date,text) to authenticated;

do $$
begin
  if exists(select 1 from pg_catalog.pg_publication where pubname='supabase_realtime' and not puballtables)
    and not exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='sync_events')
  then execute 'alter publication supabase_realtime add table public.sync_events'; end if;
end $$;

-- 2. Deleting a user from Supabase Auth must remove their journal too -----------
alter table public.growth_records
  drop constraint if exists growth_records_user_id_fkey,
  drop constraint if exists growth_records_plant_id_user_id_fkey,
  add constraint growth_records_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade,
  add constraint growth_records_plant_id_user_id_fkey foreign key (plant_id, user_id) references public.plants(id, user_id) on delete cascade;
alter table public.plant_photos
  drop constraint if exists plant_photos_user_id_fkey,
  drop constraint if exists plant_photos_plant_id_user_id_fkey,
  add constraint plant_photos_user_id_fkey foreign key (user_id) references public.profiles(id) on delete cascade,
  add constraint plant_photos_plant_id_user_id_fkey foreign key (plant_id, user_id) references public.plants(id, user_id) on delete cascade;

-- 3. RLS: evaluate the caller once per statement, not once per row --------------
drop policy if exists profile_read on public.profiles;
drop policy if exists profile_edit on public.profiles;
create policy profile_read on public.profiles for select to authenticated
  using ((id = (select auth.uid()) and (select public.is_active())) or (select public.is_admin()));
create policy profile_edit on public.profiles for update to authenticated
  using (id = (select auth.uid()) and (select public.is_active()))
  with check (id = (select auth.uid()) and (select public.is_active()));

drop policy if exists categories_read on public.categories;
drop policy if exists categories_insert on public.categories;
drop policy if exists categories_update on public.categories;
drop policy if exists categories_delete on public.categories;
create policy categories_read on public.categories for select to authenticated using ((select public.is_active()));
create policy categories_insert on public.categories for insert to authenticated with check ((select public.is_admin()));
create policy categories_update on public.categories for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));
create policy categories_delete on public.categories for delete to authenticated using ((select public.is_admin()));

drop policy if exists plants_read on public.plants;
drop policy if exists plants_insert on public.plants;
drop policy if exists plants_update on public.plants;
create policy plants_read on public.plants for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active()));
create policy plants_insert on public.plants for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active()));
create policy plants_update on public.plants for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active()))
  with check (user_id = (select auth.uid()) and (select public.is_active()));

drop policy if exists schedules_read on public.care_schedules;
drop policy if exists schedules_insert on public.care_schedules;
drop policy if exists schedules_update on public.care_schedules;
create policy schedules_read on public.care_schedules for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active()));
create policy schedules_insert on public.care_schedules for insert to authenticated
  with check (user_id = (select auth.uid()) and (select public.is_active()));
create policy schedules_update on public.care_schedules for update to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active()))
  with check (user_id = (select auth.uid()) and (select public.is_active()));

drop policy if exists history_read on public.care_history;
create policy history_read on public.care_history for select to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active()));

drop policy if exists growth_owner on public.growth_records;
create policy growth_owner on public.growth_records for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active()))
  with check (user_id = (select auth.uid()) and (select public.is_active()) and exists (
    select 1 from public.plants p where p.id = growth_records.plant_id
      and p.user_id = (select auth.uid()) and p.archived_at is null));

drop policy if exists photos_owner on public.plant_photos;
create policy photos_owner on public.plant_photos for all to authenticated
  using (user_id = (select auth.uid()) and (select public.is_active()))
  with check (user_id = (select auth.uid()) and (select public.is_active()) and exists (
    select 1 from public.plants p where p.id = plant_photos.plant_id
      and p.user_id = (select auth.uid()) and p.archived_at is null));

drop policy if exists sync_read on public.sync_events;
create policy sync_read on public.sync_events for select to authenticated
  using ((select public.is_active()) and (user_id = (select auth.uid()) or entity = 'categories'
    or (entity = 'profiles' and (select public.is_admin()))));

drop policy if exists plant_images_read on storage.objects;
drop policy if exists plant_images_insert on storage.objects;
drop policy if exists plant_images_delete on storage.objects;
create policy plant_images_read on storage.objects for select to authenticated
  using (bucket_id = 'plant-images' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_active()));
create policy plant_images_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'plant-images' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_active()));
create policy plant_images_delete on storage.objects for delete to authenticated
  using (bucket_id = 'plant-images' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_active()));

-- 4. Foreign-key indexes ---------------------------------------------------------
create index if not exists plants_category on public.plants(category_id);
create index if not exists schedules_plant_owner on public.care_schedules(plant_id, user_id);
create index if not exists history_schedule_owner on public.care_history(schedule_id, plant_id, user_id);
create index if not exists history_plant_owner_idx on public.care_history(plant_id, user_id);
create index if not exists growth_plant_owner on public.growth_records(plant_id, user_id);
create index if not exists photos_plant_owner on public.plant_photos(plant_id, user_id);

commit;
