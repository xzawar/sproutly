begin;

alter table public.plants
  add column home_layout_version smallint not null default 0,
  drop constraint plants_valid_home_placement,
  add constraint plants_valid_home_placement check (
    (home_room is null and home_x is null and home_y is null) or (
      home_room is not null and home_x is not null and home_y is not null and
      home_room in ('living','bedroom','kitchen','office','balcony','studio','terrace',
                    'countertop','shelf','window','hall','front-garden','backyard','patio') and
      home_x between 0 and 100 and home_y between 0 and 100
    )
  );

-- An older map allowed two plants to share one coordinate. Preserve the first and
-- let the shared surface allocator seat the others when their owner opens the workspace.
with ranked as (
  select id, row_number() over (partition by user_id, home_room, home_x, home_y order by id) as ordinal
  from public.plants where archived_at is null and home_room is not null
)
update public.plants p set location = case when p.location='' then replace(p.home_room,'-',' ') else p.location end,
  home_room=null,home_x=null,home_y=null
from ranked where ranked.id=p.id and ranked.ordinal>1;

create unique index plants_active_home_position on public.plants(user_id,home_room,home_x,home_y)
where archived_at is null and home_room is not null;

alter table public.care_history
  alter column schedule_id drop not null,
  add column care_request_id uuid,
  add constraint history_plant_owner foreign key (plant_id,user_id) references public.plants(id,user_id) on delete cascade;
create unique index history_care_request on public.care_history(care_request_id) where care_request_id is not null;
create unique index history_one_off_day on public.care_history(plant_id,activity,action_date) where schedule_id is null;

-- Called only after the tool animation finishes. The same UUID can be replayed
-- after a lost response. Existing dashboard completions keep using resolve_care_task.
create function public.complete_home_visit(
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

-- In Supabase, realtime invalidations use the same owner-scoped revision feed as delta sync.
do $$
begin
  if exists(select 1 from pg_catalog.pg_publication where pubname='supabase_realtime' and not puballtables)
    and not exists(select 1 from pg_catalog.pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='sync_events')
  then execute 'alter publication supabase_realtime add table public.sync_events'; end if;
end $$;
commit;
