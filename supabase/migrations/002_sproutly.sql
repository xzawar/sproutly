-- Apply AFTER 001_initial.sql. Transactional expansion; do not run twice.
begin;
alter table public.plants add column environment text not null default 'indoor' check(environment in ('indoor','outdoor'));
create table public.growth_records (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), plant_id uuid not null,
 recorded_on date not null check(recorded_on between date '1900-01-01' and date '9999-12-31'),
 height_cm numeric(10,2) not null check(height_cm between 0 and 100000), leaf_count integer check(leaf_count between 0 and 1000000),
 notes text not null default '' check(length(notes)<=4000),
 foreign key(plant_id,user_id) references public.plants(id,user_id)
);
create table public.plant_photos (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id), plant_id uuid not null,
 taken_on date not null check(taken_on between date '1900-01-01' and date '9999-12-31'), caption text not null default '' check(length(caption)<=500),
 image_url text check(image_url ~ '^https://' and length(image_url)<=2048), image_path text check(image_path like user_id::text || '/%' and length(image_path)<=300),
 check((image_url is null) <> (image_path is null)),
 foreign key(plant_id,user_id) references public.plants(id,user_id)
);
create index growth_owner_plant_date on public.growth_records(user_id,plant_id,recorded_on);
create index photos_owner_plant_date on public.plant_photos(user_id,plant_id,taken_on);
alter table public.growth_records enable row level security;
alter table public.plant_photos enable row level security;
create policy growth_owner on public.growth_records for all to authenticated using(user_id=auth.uid() and public.is_active()) with check(user_id=auth.uid() and public.is_active() and exists(select 1 from public.plants p where p.id=plant_id and p.user_id=auth.uid() and p.archived_at is null));
create policy photos_owner on public.plant_photos for all to authenticated using(user_id=auth.uid() and public.is_active()) with check(user_id=auth.uid() and public.is_active() and exists(select 1 from public.plants p where p.id=plant_id and p.user_id=auth.uid() and p.archived_at is null));
revoke all on public.growth_records,public.plant_photos from anon,public;
grant select,insert,update,delete on public.growth_records,public.plant_photos to authenticated;

-- Restoring does NOT restore every routine. Resume only explicitly selected routines,
-- with a fresh next date based on today rather than stale archived dates.
create function public.restore_plant(p_id uuid, p_schedule_ids uuid[] default '{}') returns void
language plpgsql security definer set search_path='' as $$
declare s public.care_schedules; next_day date; action_day date;
begin
 if not public.is_active() then raise exception 'Account unavailable'; end if;
 perform 1 from public.plants where id=p_id and user_id=auth.uid() and archived_at is not null for update;
 if not found then raise exception 'Archived plant unavailable'; end if;
 if exists(select 1 from unnest(p_schedule_ids) x where not exists(select 1 from public.care_schedules where id=x and plant_id=p_id and user_id=auth.uid())) then raise exception 'Invalid routine selection'; end if;
 select (now() at time zone timezone)::date into action_day from public.profiles where id=auth.uid();
 update public.plants set archived_at=null where id=p_id and user_id=auth.uid();
 for s in select * from public.care_schedules where plant_id=p_id and user_id=auth.uid() and id=any(p_schedule_ids) for update loop
  next_day := (action_day + case s.interval_unit when 'days' then make_interval(days=>s.interval_count) when 'weeks' then make_interval(days=>s.interval_count*7) else make_interval(months=>s.interval_count) end)::date;
  if s.end_date is not null and next_day>s.end_date then raise exception 'An ended routine cannot be resumed. Create a new routine.'; end if;
  update public.care_schedules set archived_at=null,active=true,next_due_date=next_day where id=s.id;
 end loop;
end $$;
revoke all on function public.restore_plant(uuid,uuid[]) from public,anon;
grant execute on function public.restore_plant(uuid,uuid[]) to authenticated;

-- Append-only, owner-scoped invalidation log. Advisory lock serializes revision
-- allocation with commits, preventing a later-committing lower revision being missed.
create table public.sync_events (
 revision bigint generated always as identity primary key,
 entity text not null, row_id uuid not null, user_id uuid, deleted boolean not null,
 created_at timestamptz not null default now()
);
alter table public.sync_events enable row level security;
create policy sync_read on public.sync_events for select to authenticated using(public.is_active() and (user_id=auth.uid() or entity='categories' or (entity='profiles' and public.is_admin())));
revoke all on public.sync_events from public,anon,authenticated;
grant select on public.sync_events to authenticated;
create function public.record_sync_event() returns trigger language plpgsql security definer set search_path='' as $$
declare j jsonb;
begin
 perform pg_advisory_xact_lock(739121700);
 if TG_OP='DELETE' then j=to_jsonb(old); else j=to_jsonb(new); end if;
 insert into public.sync_events(entity,row_id,user_id,deleted) values(TG_TABLE_NAME,(j->>'id')::uuid,case when TG_TABLE_NAME='profiles' then (j->>'id')::uuid else (j->>'user_id')::uuid end,TG_OP='DELETE');
 if TG_OP='DELETE' then return old; else return new; end if;
end $$;
create trigger sync_profiles after insert or update or delete on public.profiles for each row execute function public.record_sync_event();
create trigger sync_categories after insert or update or delete on public.categories for each row execute function public.record_sync_event();
create trigger sync_plants after insert or update or delete on public.plants for each row execute function public.record_sync_event();
create trigger sync_schedules after insert or update or delete on public.care_schedules for each row execute function public.record_sync_event();
create trigger sync_history after insert or update or delete on public.care_history for each row execute function public.record_sync_event();
create trigger sync_growth after insert or update or delete on public.growth_records for each row execute function public.record_sync_event();
create trigger sync_photos after insert or update or delete on public.plant_photos for each row execute function public.record_sync_event();
revoke all on function public.record_sync_event() from public,anon,authenticated;
commit;
