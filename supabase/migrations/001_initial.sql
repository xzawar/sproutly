-- Verdant: run once in a new Supabase project using the SQL Editor.
begin;
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null check (char_length(name) between 1 and 100),
 email text not null,
 role text not null default 'user' check (role in ('user','admin')),
 status text not null default 'active' check (status in ('active','disabled')),
 timezone text not null default 'UTC', created_at timestamptz not null default now()
);
create function public.validate_timezone() returns trigger language plpgsql set search_path = '' as $$
begin
 if not exists (select 1 from pg_timezone_names where name = new.timezone) then raise exception 'Invalid timezone'; end if;
 return new;
end $$;
create trigger valid_profile_timezone before insert or update on public.profiles for each row execute function public.validate_timezone();
create function public.handle_auth_user() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 insert into public.profiles(id,name,email) values (new.id, coalesce(nullif(left(trim(new.raw_user_meta_data->>'name'),100),''),'Plant keeper'),new.email);
 return new;
end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_auth_user();
create function public.sync_auth_email() returns trigger language plpgsql security definer set search_path = '' as $$
begin update public.profiles set email = new.email where id = new.id; return new; end $$;
create trigger on_auth_email_updated after update of email on auth.users for each row execute function public.sync_auth_email();
create function public.is_active() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id = auth.uid() and status = 'active'); $$;
create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin' and status = 'active'); $$;
create table public.categories (id uuid primary key default gen_random_uuid(), name text not null check(char_length(trim(name)) between 1 and 80));
create unique index category_name_unique on public.categories(lower(trim(name)));
insert into public.categories(name) values ('Indoor'),('Outdoor'),('Flowering'),('Succulents'),('Herbs'),('Vegetables'),('Decorative'),('Other');
create table public.plants (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
 name text not null check (char_length(trim(name)) between 1 and 100), common_name text not null default '' check(length(common_name)<=100), scientific_name text not null default '' check(length(scientific_name)<=150),
 category_id uuid references public.categories(id) on delete restrict, location text not null default '' check(length(location)<=100),
 sunlight text not null default 'Indirect' check(sunlight in ('Full','Partial','Indirect','Low light')),
 watering text not null default '' check(length(watering)<=2000), fertilizing text not null default '' check(length(fertilizing)<=2000),
 description text not null default '' check(length(description)<=4000), notes text not null default '' check(length(notes)<=4000),
 image_url text check(image_url is null or (image_url ~ '^https://' and length(image_url)<=2048)),
 image_path text check(image_path is null or (image_path like user_id::text || '/%' and length(image_path)<=300)),
 added_on date not null default current_date check(added_on between date '1900-01-01' and date '9999-12-31'), archived_at timestamptz,
 unique(id,user_id), check(image_url is null or image_path is null)
);
create table public.care_schedules (
 id uuid primary key default gen_random_uuid(), user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
 plant_id uuid not null, activity text not null check(activity in ('Water','Fertilize','Prune','Repot','Custom')),
 custom_name text not null default '' check(length(custom_name)<=100), interval_count integer not null check(interval_count between 1 and 3650),
 interval_unit text not null check(interval_unit in ('days','weeks','months')), start_date date not null, next_due_date date not null, end_date date,
 notes text not null default '' check(length(notes)<=4000), active boolean not null default true, archived_at timestamptz,
 foreign key(plant_id,user_id) references public.plants(id,user_id) on delete cascade,
 unique(id,plant_id,user_id), check(activity <> 'Custom' or length(trim(custom_name))>0),
 check(next_due_date >= start_date), check(end_date is null or end_date >= start_date),
 check(not active or end_date is null or next_due_date <= end_date),
 check(start_date >= date '1900-01-01' and next_due_date <= date '9999-12-31' and (end_date is null or end_date <= date '9999-12-31'))
);
create table public.care_history (
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles(id) on delete cascade,
 plant_id uuid not null, schedule_id uuid not null, activity text not null,
 due_date date not null, action_date date not null, status text not null check(status in ('Completed','Skipped')),
 notes text not null default '' check(length(notes)<=4000), created_at timestamptz not null default now(),
 foreign key(schedule_id,plant_id,user_id) references public.care_schedules(id,plant_id,user_id) on delete cascade,
 unique(schedule_id,due_date)
);
create index plants_owner on public.plants(user_id);
create index schedules_owner_due on public.care_schedules(user_id,next_due_date) where active and archived_at is null;
create index history_owner_date on public.care_history(user_id,action_date desc);
create function public.archive_plant_schedules() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.archived_at is not null and old.archived_at is null then
  update public.care_schedules set active=false,archived_at=new.archived_at where plant_id=new.id and user_id=new.user_id;
 end if;
 return new;
end $$;
create trigger archive_related_schedules after update of archived_at on public.plants for each row execute function public.archive_plant_schedules();
create function public.check_schedule_plant() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from public.plants where id=new.plant_id and user_id=new.user_id and archived_at is null) then
  -- Archiving an already archived plant's schedules is permitted by the archive trigger.
  if new.active or new.archived_at is null then raise exception 'Choose an active plant you own'; end if;
 end if;
 return new;
end $$;
create trigger valid_schedule_plant before insert or update on public.care_schedules for each row execute function public.check_schedule_plant();
alter table public.profiles enable row level security;
alter table public.categories enable row level security;
alter table public.plants enable row level security;
alter table public.care_schedules enable row level security;
alter table public.care_history enable row level security;
create policy profile_read on public.profiles for select to authenticated using ((id=auth.uid() and public.is_active()) or public.is_admin());
create policy profile_edit on public.profiles for update to authenticated using(id=auth.uid() and public.is_active()) with check(id=auth.uid() and public.is_active());
create policy categories_read on public.categories for select to authenticated using(public.is_active());
create policy categories_insert on public.categories for insert to authenticated with check(public.is_admin());
create policy categories_update on public.categories for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy categories_delete on public.categories for delete to authenticated using(public.is_admin());
create policy plants_read on public.plants for select to authenticated using(user_id=auth.uid() and public.is_active());
create policy plants_insert on public.plants for insert to authenticated with check(user_id=auth.uid() and public.is_active());
create policy plants_update on public.plants for update to authenticated using(user_id=auth.uid() and public.is_active()) with check(user_id=auth.uid() and public.is_active());
create policy schedules_read on public.care_schedules for select to authenticated using(user_id=auth.uid() and public.is_active());
create policy schedules_insert on public.care_schedules for insert to authenticated with check(user_id=auth.uid() and public.is_active());
create policy schedules_update on public.care_schedules for update to authenticated using(user_id=auth.uid() and public.is_active()) with check(user_id=auth.uid() and public.is_active());
create policy history_read on public.care_history for select to authenticated using(user_id=auth.uid() and public.is_active());
-- Explicit grants: profile role/email/status cannot be updated by authenticated clients.
revoke all on public.profiles,public.categories,public.plants,public.care_schedules,public.care_history from anon,authenticated;
grant select on public.profiles to authenticated;
grant update(name,timezone) on public.profiles to authenticated;
grant select,insert,update,delete on public.categories to authenticated;
grant select,insert,update on public.plants,public.care_schedules to authenticated;
grant select on public.care_history to authenticated;
create function public.resolve_care_task(p_schedule_id uuid,p_expected_due date,p_status text,p_notes text default '') returns void
language plpgsql security definer set search_path = '' as $$
declare s public.care_schedules%rowtype; done_date date; next_date date;
begin
 if auth.uid() is null or not public.is_active() then raise exception 'Authentication required'; end if;
 if p_status not in ('Completed','Skipped') or p_status is null then raise exception 'Invalid status'; end if;
 if p_notes is null or length(p_notes)>4000 then raise exception 'Notes must be at most 4000 characters'; end if;
 select * into s from public.care_schedules where id=p_schedule_id and user_id=auth.uid() for update;
 if not found or not s.active or s.archived_at is not null then raise exception 'Task unavailable'; end if;
 if not exists(select 1 from public.plants where id=s.plant_id and user_id=auth.uid() and archived_at is null) then raise exception 'Plant unavailable'; end if;
 if p_expected_due is null or s.next_due_date <> p_expected_due then raise exception 'Task already changed. Refresh and try again.'; end if;
 select (now() at time zone timezone)::date into done_date from public.profiles where id=auth.uid();
 if s.next_due_date>done_date then raise exception 'This task is not due yet'; end if;
 next_date := case s.interval_unit when 'months' then (done_date + make_interval(months=>s.interval_count))::date
  when 'weeks' then done_date + s.interval_count*7 else done_date + s.interval_count end;
 if next_date > date '9999-12-31' then raise exception 'Next date is outside the supported range'; end if;
 insert into public.care_history(user_id,plant_id,schedule_id,activity,due_date,action_date,status,notes)
 values(auth.uid(),s.plant_id,s.id,case when s.activity='Custom' then s.custom_name else s.activity end,s.next_due_date,done_date,p_status,p_notes);
 update public.care_schedules set next_due_date=next_date,active=(s.end_date is null or next_date<=s.end_date) where id=s.id;
end $$;
revoke execute on function public.resolve_care_task(uuid,date,text,text) from public,anon;
grant execute on function public.resolve_care_task(uuid,date,text,text) to authenticated;
revoke execute on function public.handle_auth_user(),public.sync_auth_email(),public.archive_plant_schedules(),public.check_schedule_plant(),public.validate_timezone() from public,anon,authenticated;
revoke execute on function public.is_admin(),public.is_active() from public,anon;
grant execute on function public.is_admin(),public.is_active() to authenticated;
-- Private images: only JPEG, PNG and WebP, max 5 MiB, paths <user-id>/<random-id>.<extension>.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 values('plant-images','plant-images',false,5242880,array['image/jpeg','image/png','image/webp']);
create policy plant_images_read on storage.objects for select to authenticated
 using(bucket_id='plant-images' and (storage.foldername(name))[1]=auth.uid()::text and public.is_active());
create policy plant_images_insert on storage.objects for insert to authenticated
 with check(bucket_id='plant-images' and (storage.foldername(name))[1]=auth.uid()::text and public.is_active());
create policy plant_images_delete on storage.objects for delete to authenticated
 using(bucket_id='plant-images' and (storage.foldername(name))[1]=auth.uid()::text and public.is_active());
commit;
