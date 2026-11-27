import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { createPlantWithRoutines } from "../lib/plant-create";
import { createDemo } from "../lib/demo";
import { addInterval, todayIn } from "../lib/dates";
const A = "20000000-0000-4000-8000-000000000001",
  B = "20000000-0000-4000-8000-000000000002",
  ADMIN = "20000000-0000-4000-8000-000000000003";
const PA = "20000000-0000-4000-8000-000000000010",
  PB = "20000000-0000-4000-8000-000000000011",
  S = "20000000-0000-4000-8000-000000000020";
test("actual migration: permissions and complete/skip integration", async (t) => {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;
 create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,storage to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
 `);
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/001_initial.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/002_sproutly.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/003_home.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/004_upper_floor.sql", import.meta.url),
      "utf8",
    ),
  );
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/005_living_home.sql", import.meta.url),
      "utf8",
    ),
  );
  const repair = await readFile(
    new URL("../supabase/migrations/006_repair.sql", import.meta.url),
    "utf8",
  );
  await db.exec(repair);
  await db.exec(repair); // idempotent
  await db.exec(
    `insert into auth.users(id,email,raw_user_meta_data) values('${A}','a@example.test','{"name":"Alice"}'),('${B}','b@example.test','{"name":"Bob"}'),('${ADMIN}','admin@example.test','{"name":"Admin"}');update public.profiles set role='admin' where id='${ADMIN}';update public.profiles set timezone='Asia/Karachi' where id='${A}';insert into public.plants(id,user_id,name) values('${PA}','${A}','Aloe'),('${PB}','${B}','Basil');`,
  );
  const as = async <T>(uid: string, fn: () => Promise<T>): Promise<T> => {
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      uid,
    ]);
    await db.exec("set role authenticated");
    try {
      return await fn();
    } finally {
      await db.exec("reset role");
    }
  };
  const scalar = async (sql: string, params: unknown[] = []) =>
    Number((await db.query<{ n: number }>(sql, params)).rows[0].n);
  const today = todayIn("Asia/Karachi");
  await t.test(
    "signup creates profile without trusting metadata role",
    async () => {
      await db.exec(
        `insert into auth.users(id,email,raw_user_meta_data) values('20000000-0000-4000-8000-000000000004','c@example.test','{"name":"Eve","role":"admin"}')`,
      );
      const r = await db.query<{ role: string }>(
        "select role from public.profiles where email='c@example.test'",
      );
      assert.equal(r.rows[0].role, "user");
    },
  );
  await t.test(
    "owners see only their rows, admins cannot read their plants",
    async () => {
      assert.equal(
        await as(A, () => scalar("select count(*) as n from public.plants")),
        1,
      );
      assert.equal(
        await as(B, () => scalar("select count(*) as n from public.plants")),
        1,
      );
      assert.equal(
        await as(ADMIN, () =>
          scalar("select count(*) as n from public.plants"),
        ),
        0,
      );
    },
  );
  await t.test(
    "profile role, status and email escalation are blocked",
    async () => {
      for (const column of ["role", "status", "email"])
        await assert.rejects(
          as(A, () =>
            db.exec(
              `update public.profiles set ${column}='admin' where id='${A}'`,
            ),
          ),
        );
      assert.equal(
        await as(A, () => scalar("select count(*) as n from public.profiles")),
        1,
      );
      assert.equal(
        await as(ADMIN, () =>
          scalar("select count(*) as n from public.profiles"),
        ),
        4,
      );
    },
  );
  await t.test(
    "ordinary users cannot create categories, admins can",
    async () => {
      await assert.rejects(
        as(A, () =>
          db.exec("insert into public.categories(name) values('Trees')"),
        ),
      );
      await as(ADMIN, () =>
        db.exec("insert into public.categories(name) values('Trees')"),
      );
      await assert.rejects(
        as(ADMIN, () =>
          db.exec("insert into public.categories(name) values('trees')"),
        ),
      );
    },
  );
  await t.test(
    "home pins follow plant ownership, validate coordinates and emit a plant delta",
    async () => {
      const previous = await scalar(
        "select max(revision) as n from public.sync_events",
      );
      await as(A, () =>
        db.query(
          "update public.plants set home_room='living', home_x=21, home_y=82 where id=$1",
          [PA],
        ),
      );
      assert.equal(
        await as(A, () =>
          scalar(
            "select count(*) as n from public.sync_events where revision>$1 and entity='plants' and row_id=$2",
            [previous, PA],
          ),
        ),
        1,
      );
      assert.equal(
        (
          await as(B, () =>
            db.query(
              "update public.plants set home_x=23 where id=$1 returning id",
              [PA],
            ),
          )
        ).rows.length,
        0,
      );
      await as(A, () =>
        db.query("update public.plants set home_room='terrace' where id=$1", [
          PA,
        ]),
      );
      for (const set of ["home_x=120", "home_room='attic'", "home_y=null"])
        await assert.rejects(
          as(A, () =>
            db.query(`update public.plants set ${set} where id=$1`, [PA]),
          ),
        );
      await as(A, () =>
        db.query(
          "update public.plants set home_room=null,home_x=null,home_y=null where id=$1",
          [PA],
        ),
      );
    },
  );
  await t.test("cross-owner inserts and plant links are blocked", async () => {
    await assert.rejects(
      as(A, () =>
        db.exec(
          `insert into public.plants(user_id,name) values('${B}','Injected')`,
        ),
      ),
    );
    await assert.rejects(
      as(A, () =>
        db.exec(
          `insert into public.care_schedules(user_id,plant_id,activity,interval_count,interval_unit,start_date,next_due_date) values('${A}','${PB}','Water',7,'days',current_date,current_date)`,
        ),
      ),
    );
  });
  await t.test("cannot change another user’s plant", async () => {
    await as(A, () =>
      db.exec(`update public.plants set name='Hacked' where id='${PB}'`),
    );
    assert.equal(
      (
        await db.query<{ name: string }>(
          `select name from public.plants where id='${PB}'`,
        )
      ).rows[0].name,
      "Basil",
    );
  });
  await t.test(
    "complete: actual day, snapshot history and atomic recurrence",
    async () => {
      await as(A, () =>
        db.query(
          `insert into public.care_schedules(id,plant_id,activity,interval_count,interval_unit,start_date,next_due_date) values($1,$2,'Water',7,'days',$3::date-10,$3::date-2)`,
          [S, PA, today],
        ),
      );
      await assert.rejects(
        as(B, () =>
          db.query("select public.resolve_care_task($1,$2,$3,$4)", [
            S,
            addInterval(today, 1, "days"),
            "Completed",
            "intrusion",
          ]),
        ),
      );
      const due = (
        await db.query<{ next_due_date: string }>(
          "select next_due_date::text from public.care_schedules where id=$1",
          [S],
        )
      ).rows[0].next_due_date;
      await as(A, () =>
        db.query("select public.resolve_care_task($1,$2,$3,$4)", [
          S,
          due,
          "Completed",
          "Soil checked",
        ]),
      );
      const s = (
        await db.query<{ next_due_date: string }>(
          "select next_due_date::text from public.care_schedules where id=$1",
          [S],
        )
      ).rows[0];
      assert.equal(s.next_due_date, addInterval(today, 7, "days"));
      const h = (
        await as(A, () =>
          db.query<{ status: string; notes: string; action_date: string }>(
            "select status,notes,action_date::text from public.care_history",
          ),
        )
      ).rows[0];
      assert.equal(h.status, "Completed");
      assert.equal(h.notes, "Soil checked");
      assert.equal(h.action_date, today);
      assert.equal(
        await as(B, () =>
          scalar("select count(*) as n from public.care_history"),
        ),
        0,
      );
      await assert.rejects(
        as(A, () =>
          db.query("select public.resolve_care_task($1,$2,$3,$4)", [
            S,
            due,
            "Completed",
            "retry",
          ]),
        ),
      );
      assert.equal(
        await scalar("select count(*) as n from public.care_history"),
        1,
      );
    },
  );
  await t.test("future task cannot be completed", async () => {
    const due = addInterval(today, 7, "days");
    await assert.rejects(
      as(A, () =>
        db.query("select public.resolve_care_task($1,$2,$3,$4)", [
          S,
          due,
          "Completed",
          "",
        ]),
      ),
    );
  });
  await t.test(
    "history cannot be inserted, edited or deleted by clients",
    async () => {
      await assert.rejects(
        as(A, () => db.exec("delete from public.care_history")),
      );
      await assert.rejects(
        as(A, () => db.exec("update public.care_history set notes='hacked'")),
      );
      await assert.rejects(
        as(A, () =>
          db.exec(
            `insert into public.care_history(user_id,plant_id,schedule_id,activity,due_date,action_date,status) values('${A}','${PA}','${S}','Water',current_date,current_date,'Completed')`,
          ),
        ),
      );
    },
  );
  await t.test(
    "skip uses the same transaction and ends after inclusive end date",
    async () => {
      const sid = "20000000-0000-4000-8000-000000000021";
      await as(A, () =>
        db.query(
          `insert into public.care_schedules(id,plant_id,activity,interval_count,interval_unit,start_date,next_due_date,end_date) values($1,$2,'Prune',1,'months',$3,$3,$3)`,
          [sid, PA, today],
        ),
      );
      await as(A, () =>
        db.query("select public.resolve_care_task($1,$2,$3,$4)", [
          sid,
          today,
          "Skipped",
          "Not needed",
        ]),
      );
      const r = await db.query<{ active: boolean; next_due_date: string }>(
        "select active,next_due_date::text from public.care_schedules where id=$1",
        [sid],
      );
      assert.equal(r.rows[0].active, false);
      assert.equal(r.rows[0].next_due_date, addInterval(today, 1, "months"));
      assert.equal(
        await scalar(
          "select count(*) as n from public.care_history where status='Skipped'",
        ),
        1,
      );
    },
  );
  await t.test(
    "failed history insertion rolls back the whole completion",
    async () => {
      const sid = "20000000-0000-4000-8000-000000000022";
      await db.query(
        `insert into public.care_schedules(id,user_id,plant_id,activity,interval_count,interval_unit,start_date,next_due_date) values($1,$2,$3,'Water',2,'days',$4,$4)`,
        [sid, A, PA, today],
      );
      await db.query(
        `insert into public.care_history(user_id,plant_id,schedule_id,activity,due_date,action_date,status) values($1,$2,$3,'Water',$4,$4,'Completed')`,
        [A, PA, sid, today],
      );
      const n = await scalar("select count(*) as n from public.care_history");
      await assert.rejects(
        as(A, () =>
          db.query("select public.resolve_care_task($1,$2,$3,$4)", [
            sid,
            today,
            "Completed",
            "",
          ]),
        ),
      );
      assert.equal(
        await scalar("select count(*) as n from public.care_history"),
        n,
      );
      assert.equal(
        (
          await db.query<{ due: string }>(
            "select next_due_date::text as due from public.care_schedules where id=$1",
            [sid],
          )
        ).rows[0].due,
        today,
      );
    },
  );
  await t.test("private Storage paths are isolated", async () => {
    await as(A, () =>
      db.exec(
        `insert into storage.objects(bucket_id,name) values('plant-images','${A}/a.jpg')`,
      ),
    );
    assert.equal(
      await as(B, () => scalar("select count(*) as n from storage.objects")),
      0,
    );
    await assert.rejects(
      as(B, () =>
        db.exec(
          `insert into storage.objects(bucket_id,name) values('plant-images','${A}/b.jpg')`,
        ),
      ),
    );
    await as(B, () => db.exec("delete from storage.objects"));
    assert.equal(
      await as(A, () => scalar("select count(*) as n from storage.objects")),
      1,
    );
  });
  await t.test(
    "archiving plant stops schedules without deleting history",
    async () => {
      const n = await scalar("select count(*) as n from public.care_history");
      await as(A, () =>
        db.exec(`update public.plants set archived_at=now() where id='${PA}'`),
      );
      assert.equal(
        await scalar(
          `select count(*) as n from public.care_schedules where plant_id='${PA}' and active`,
        ),
        0,
      );
      assert.equal(
        await scalar("select count(*) as n from public.care_history"),
        n,
      );
    },
  );
  await t.test(
    "category in use cannot be deleted, even for archived plants",
    async () => {
      const c = (
        await db.query<{ id: string }>(
          "select id from public.categories where name='Indoor'",
        )
      ).rows[0].id;
      await db.query("update public.plants set category_id=$1 where id=$2", [
        c,
        PA,
      ]);
      await assert.rejects(
        as(ADMIN, () =>
          db.query("delete from public.categories where id=$1", [c]),
        ),
      );
    },
  );
  await t.test("disabled account loses read and write access", async () => {
    await db.exec(
      `update public.profiles set status='disabled' where id='${B}'`,
    );
    assert.equal(
      await as(B, () => scalar("select count(*) as n from public.plants")),
      0,
    );
    await assert.rejects(
      as(B, () =>
        db.exec("insert into public.plants(name) values('No access')"),
      ),
    );
  });
  await t.test("anonymous access is denied", async () => {
    await db.exec("set role anon");
    try {
      await assert.rejects(db.exec("select * from public.plants"));
      await assert.rejects(
        db.exec(
          `select public.resolve_care_task('${S}',current_date,'Completed','')`,
        ),
      );
    } finally {
      await db.exec("reset role");
    }
  });
  await t.test(
    "SQL month arithmetic matches the shared date module",
    async () => {
      for (const date of [
        "2026-01-31",
        "2028-01-31",
        "2026-03-31",
        "2026-12-31",
        "2028-02-29",
      ]) {
        for (const count of [1, 2, 7, 12]) {
          const r = await db.query<{ date: string }>(
            "select ($1::date + make_interval(months => $2::integer))::date::text as date",
            [date, count],
          );
          assert.equal(r.rows[0].date, addInterval(date, count, "months"));
        }
      }
    },
  );

  await t.test(
    "restore is owner-only, selective and resets stale due dates",
    async () => {
      await assert.rejects(
        as(ADMIN, () =>
          db.query("select public.restore_plant($1,$2::uuid[])", [PA, [S]]),
        ),
      );
      await assert.rejects(
        as(A, () =>
          db.query("select public.restore_plant($1,$2::uuid[])", [PA, [PB]]),
        ),
      );
      assert.equal(
        await scalar(
          `select count(*) as n from public.plants where id='${PA}' and archived_at is not null`,
        ),
        1,
      );
      await as(A, () =>
        db.query("select public.restore_plant($1,$2::uuid[])", [PA, [S]]),
      );
      assert.equal(
        await scalar(
          `select count(*) as n from public.plants where id='${PA}' and archived_at is null`,
        ),
        1,
      );
      const r = await db.query<{
        next_due_date: string;
        interval_count: number;
        interval_unit: "days" | "weeks" | "months";
      }>(
        `select next_due_date::text,interval_count,interval_unit from public.care_schedules where id='${S}'`,
      );
      assert.equal(
        r.rows[0].next_due_date,
        addInterval(today, r.rows[0].interval_count, r.rows[0].interval_unit),
      );
    },
  );
  await t.test(
    "growth is owner-scoped, validated, editable and removable",
    async () => {
      await as(A, () =>
        db.query(
          "insert into public.growth_records(user_id,plant_id,recorded_on,height_cm) values($1,$2,$3,21.5)",
          [A, PA, today],
        ),
      );
      assert.equal(
        await as(ADMIN, () =>
          scalar("select count(*) as n from public.growth_records"),
        ),
        0,
      );
      await assert.rejects(
        as(A, () =>
          db.query(
            "insert into public.growth_records(user_id,plant_id,recorded_on,height_cm) values($1,$2,$3,1)",
            [A, PB, today],
          ),
        ),
      );
      await assert.rejects(
        as(A, () => db.query("update public.growth_records set height_cm=-1")),
      );
      await as(A, () =>
        db.exec("update public.growth_records set leaf_count=12"),
      );
      assert.equal(
        await as(A, () =>
          scalar("select leaf_count as n from public.growth_records limit 1"),
        ),
        12,
      );
      await as(A, () => db.exec("delete from public.growth_records"));
    },
  );
  await t.test(
    "private photos reject cross-owner paths and ambiguous sources",
    async () => {
      await as(A, () =>
        db.query(
          "insert into public.plant_photos(user_id,plant_id,taken_on,image_path) values($1,$2,$3,$4)",
          [A, PA, today, A + "/photo.webp"],
        ),
      );
      await assert.rejects(
        as(A, () =>
          db.query(
            "insert into public.plant_photos(user_id,plant_id,taken_on,image_path) values($1,$2,$3,$4)",
            [A, PA, today, B + "/photo.webp"],
          ),
        ),
      );
      await assert.rejects(
        as(A, () =>
          db.query(
            "insert into public.plant_photos(user_id,plant_id,taken_on,image_url,image_path) values($1,$2,$3,'https://example.test/photo.jpg',$4)",
            [A, PA, today, A + "/photo.webp"],
          ),
        ),
      );
      assert.equal(
        await as(ADMIN, () =>
          scalar("select count(*) as n from public.plant_photos"),
        ),
        0,
      );
      await as(A, () => db.exec("delete from public.plant_photos"));
    },
  );
  await t.test(
    "delta log includes deletes, scopes owner and prevents writes",
    async () => {
      const a = await as(A, () =>
        db.query<{ entity: string; user_id: string; deleted: boolean }>(
          "select entity,user_id,deleted from public.sync_events",
        ),
      );
      assert.ok(a.rows.some((x) => x.entity === "growth_records" && x.deleted));
      assert.ok(
        a.rows.every((x) => x.user_id === A || x.entity === "categories"),
      );
      await assert.rejects(
        as(A, () => db.exec("delete from public.sync_events")),
      );
      assert.equal(
        await as(B, () =>
          scalar("select count(*) as n from public.sync_events"),
        ),
        0,
      );
    },
  );
  await t.test(
    "plant and initial routines commit together and roll back on SQL failure",
    async () => {
      const source = createDemo().plants[0];
      const plant = { ...source, id: undefined };
      const request = {
        plant: {
          ...plant,
          category_id: null,
          name: "Atomic fern",
          image_url: null,
          image_path: null,
        },
        routines: [
          { activity: "Water", interval_count: 4, first_due_date: today },
          { activity: "Fertilize", interval_count: 21, first_due_date: today },
        ],
      };
      const run = (fail: boolean) =>
        db.transaction(async (tx) => {
          await tx.exec("SET LOCAL ROLE authenticated");
          await tx.query("select set_config('request.jwt.claim.sub',$1,true)", [
            A,
          ]);
          let count = 0;
          return createPlantWithRoutines(request, async (table, row) => {
            // Inject an actual SQL constraint failure on the second routine.
            const values = {
              ...row,
              user_id: A,
              ...(fail && ++count === 3 ? { interval_count: 0 } : {}),
            };
            const keys = Object.keys(values).filter(
              (k) => values[k as keyof typeof values] !== undefined,
            );
            const inserted = await tx.query<{ id: string }>(
              `insert into public.${table} (${keys.join(",")}) values (${keys.map((_, i) => "$" + (i + 1)).join(",")}) returning id`,
              keys.map((k) => values[k as keyof typeof values]),
            );
            return inserted.rows[0].id;
          });
        });
      const before = await scalar("select count(*) as n from public.plants");
      await assert.rejects(run(true));
      assert.equal(
        await scalar("select count(*) as n from public.plants"),
        before,
      );
      assert.equal(
        await scalar(
          "select count(*) as n from public.plants where name='Atomic fern'",
        ),
        0,
      );
      const id = await run(false);
      assert.equal(
        await scalar(
          "select count(*) as n from public.care_schedules where plant_id=$1",
          [id],
        ),
        2,
      );
      assert.equal(
        await as(B, () =>
          scalar(
            "select count(*) as n from public.care_schedules where plant_id=$1",
            [id],
          ),
        ),
        0,
      );
    },
  );
  await t.test(
    "living home saves care at the verified surface exactly once and signals the owner",
    async () => {
      const rose = "20000000-0000-4000-8000-000000000090";
      const routine = "20000000-0000-4000-8000-000000000091";
      const request = crypto.randomUUID(),
        scheduled = crypto.randomUUID();
      const visit = (
        user: string,
        token: string,
        activity: string,
        x = 26,
        schedule: string | null = null,
        due: string | null = null,
      ) =>
        as(user, () =>
          db.query<{ event: string }>(
            "select public.complete_home_visit($1::uuid,$2::uuid,'front-garden',$3::integer,50,$4::text,$5::uuid,$6::date,'')::text as event",
            [token, rose, x, activity, schedule, due],
          ),
        );
      await as(A, () =>
        db.query(
          "insert into public.plants(id,user_id,name,location,home_room,home_x,home_y,home_layout_version) values($1,$2,'Rose','Front garden','front-garden',26,50,1)",
          [rose, A],
        ),
      );
      await assert.rejects(
        as(A, () =>
          db.query(
            "insert into public.plants(user_id,name,home_room,home_x,home_y) values($1,'Overlapping rose','front-garden',26,50)",
            [A],
          ),
        ),
        /unique/i,
      );
      await assert.rejects(visit(ADMIN, request, "Water"), /unavailable/);
      await assert.rejects(visit(A, request, "Water", 25), /moved/);
      await assert.rejects(
        visit(A, request, "Imaginary"),
        /Check the care visit/,
      );
      assert.equal(
        await scalar(
          "select count(*) as n from public.care_history where plant_id=$1",
          [rose],
        ),
        0,
      );
      const first = (await visit(A, request, "Water")).rows[0].event;
      assert.equal((await visit(A, request, "Water")).rows[0].event, first);
      await assert.rejects(
        visit(A, crypto.randomUUID(), "Water"),
        /already recorded/,
      );
      await assert.rejects(visit(A, request, "Prune"), /request changed/);
      const history = await as(A, () =>
        db.query<{
          schedule_id: string | null;
          action_date: string;
          activity: string;
        }>(
          "select schedule_id,action_date::text,activity from public.care_history where id=$1",
          [first],
        ),
      );
      assert.deepEqual(history.rows, [
        { schedule_id: null, action_date: today, activity: "Water" },
      ]);
      assert.equal(
        await as(B, () =>
          scalar(
            "select count(*) as n from public.care_history where plant_id=$1",
            [rose],
          ),
        ),
        0,
      );
      assert.equal(
        await as(A, () =>
          scalar(
            "select count(*) as n from public.sync_events where entity='care_history' and row_id=$1",
            [first],
          ),
        ),
        1,
      );
      await as(A, () =>
        db.query(
          "insert into public.care_schedules(id,plant_id,activity,custom_name,interval_count,interval_unit,start_date,next_due_date) values($1,$2,'Custom','Misting',3,'days',$3,$3)",
          [routine, rose, today],
        ),
      );
      await assert.rejects(
        visit(A, crypto.randomUUID(), "Mist"),
        /routine is due/,
      );
      await assert.rejects(
        visit(A, scheduled, "Prune", 26, routine, today),
        /routine changed/i,
      );
      await assert.rejects(
        visit(A, scheduled, "Mist", 25, routine, today),
        /moved/,
      );
      const done = (await visit(A, scheduled, "Mist", 26, routine, today))
        .rows[0].event;
      assert.equal(
        (await visit(A, scheduled, "Mist", 26, routine, today)).rows[0].event,
        done,
      );
      assert.equal(
        (
          await db.query<{ d: string }>(
            "select next_due_date::text as d from public.care_schedules where id=$1",
            [routine],
          )
        ).rows[0].d,
        addInterval(today, 3, "days"),
      );
      await assert.rejects(
        visit(A, crypto.randomUUID(), "Mist", 26, routine, today),
        /Task already changed/,
      );
      await as(A, () =>
        db.query("update public.plants set archived_at=now() where id=$1", [
          rose,
        ]),
      );
      await assert.rejects(
        visit(A, crypto.randomUUID(), "Prune"),
        /Plant unavailable/,
      );
      assert.equal((await visit(A, request, "Water")).rows[0].event, first);
      assert.equal(
        await scalar(
          "select count(*) as n from public.care_history where plant_id=$1",
          [rose],
        ),
        2,
      );
    },
  );
  await db.close();
});

test("006 repairs a database that skipped 003-005 and lets Auth delete users", async () => {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;
 create schema auth;create schema storage;
 create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth,storage to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;
 create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);
 alter table storage.objects enable row level security;grant select,insert,delete on storage.objects to authenticated;
 create function storage.foldername(text) returns text[] language sql immutable as $$select string_to_array($1,'/')$$;
 `);
  for (const file of ["001_initial.sql", "002_sproutly.sql", "006_repair.sql"])
    await db.exec(
      await readFile(
        new URL(`../supabase/migrations/${file}`, import.meta.url),
        "utf8",
      ),
    );
  const columns = await db.query<{ column_name: string }>(
    "select column_name from information_schema.columns where table_schema='public' and table_name='plants' and column_name like 'home_%' order by 1",
  );
  assert.deepEqual(
    columns.rows.map((r) => r.column_name),
    ["home_layout_version", "home_room", "home_x", "home_y"],
  );
  const fn = await db.query(
    "select 1 from pg_proc where proname='complete_home_visit'",
  );
  assert.equal(fn.rows.length, 1);
  await db.exec(
    `insert into auth.users(id,email) values('${A}','a@example.test');
     insert into public.plants(id,user_id,name,home_room,home_x,home_y) values('${PA}','${A}','Aloe','kitchen',10,10);
     insert into public.growth_records(user_id,plant_id,recorded_on,height_cm) values('${A}','${PA}',current_date,12);
     insert into public.plant_photos(user_id,plant_id,taken_on,image_url) values('${A}','${PA}',current_date,'https://example.test/a.jpg');`,
  );
  await db.exec(`delete from auth.users where id='${A}'`);
  const left = await db.query<{ n: number }>(
    "select (select count(*) from public.growth_records)+(select count(*) from public.plant_photos)+(select count(*) from public.plants) as n",
  );
  assert.equal(Number(left.rows[0].n), 0);
});
