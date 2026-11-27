import { createDemo, DEMO_KEY, demoMutation, upgradeDemoHome } from "./demo";
import type { Mutation, WorkspaceData } from "./types";

export function readDemo(fallback: WorkspaceData) {
  const raw = localStorage.getItem(DEMO_KEY);
  if (!raw) return fallback;
  try {
    const data = JSON.parse(raw) as WorkspaceData;
    if (
      data.profile?.id === fallback.profile.id &&
      [
        data.plants,
        data.schedules,
        data.history,
        data.categories,
        data.users,
        data.growth,
        data.photos,
      ].every(Array.isArray)
    )
      return upgradeDemoHome(data);
  } catch {
    /* Ignore a malformed legacy snapshot. */
  }
  return fallback;
}

function commit(fallback: WorkspaceData, mutation?: Mutation) {
  const prior = readDemo(fallback);
  const data = mutation ? demoMutation(prior, mutation) : createDemo();
  const createdId =
    mutation?.kind === "plant.create" ? data.plants.at(-1)?.id : undefined;
  localStorage.setItem(DEMO_KEY, JSON.stringify(data));
  return { data, createdId };
}

/** Serialize read-modify-write across tabs, including older iOS with IndexedDB but no Web Locks. */
async function exclusive<T>(apply: () => T): Promise<T> {
  if (navigator.locks) return navigator.locks.request(DEMO_KEY, apply);
  return new Promise<T>((resolve, reject) => {
    const open = indexedDB.open("sproutly-demo-writer", 1);
    open.onupgradeneeded = () => open.result.createObjectStore("writers");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction("writers", "readwrite");
      let result: T;
      tx.oncomplete = () => {
        db.close();
        resolve(result);
      };
      tx.onabort = () => {
        db.close();
        reject(tx.error ?? Error("The demo write was interrupted."));
      };
      tx.objectStore("writers").get("garden").onsuccess = () => {
        try {
          result = apply();
        } catch (error) {
          reject(error);
          tx.abort();
        }
      };
    };
  });
}

export function initializeDemo(fallback: WorkspaceData) {
  return exclusive(() => {
    const data = readDemo(fallback);
    const json = JSON.stringify(data);
    if (localStorage.getItem(DEMO_KEY) !== json)
      localStorage.setItem(DEMO_KEY, json);
    return data;
  });
}

export function writeDemo(fallback: WorkspaceData, mutation?: Mutation) {
  return exclusive(() => commit(fallback, mutation));
}
