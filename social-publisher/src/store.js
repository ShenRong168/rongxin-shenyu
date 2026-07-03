import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { config } from "./config.js";

const storePath = resolve(config.tokenStorePath);

const initialState = {
  meta: null,
  threads: null,
  selectedPageId: null,
  selectedInstagramUserId: null,
  pages: [],
  publishLog: []
};

export async function loadStore() {
  try {
    const raw = await readFile(storePath, "utf8");
    return { ...initialState, ...JSON.parse(raw) };
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return { ...initialState };
  }
}

export async function saveStore(nextState) {
  await mkdir(dirname(storePath), { recursive: true });
  await writeFile(storePath, `${JSON.stringify(nextState, null, 2)}\n`);
}

export async function updateStore(mutator) {
  const state = await loadStore();
  const nextState = await mutator(state);
  await saveStore(nextState);
  return nextState;
}

export async function appendPublishLog(entry) {
  return updateStore((state) => ({
    ...state,
    publishLog: [
      {
        at: new Date().toISOString(),
        ...entry
      },
      ...(state.publishLog || [])
    ].slice(0, 50)
  }));
}
