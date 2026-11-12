import { createStore } from "./store.js";
import { ask } from "./api.js";

// Ask-page state lives outside React so it survives switching tabs (same idea as meetingDraft.js).
export const askStore = createStore({
  scope: "", // "" = all saved meetings, otherwise a meeting id
  q: "",
  res: null,
  busy: false,
  error: "",
});

const patch = (changes) => askStore.set((s) => ({ ...s, ...changes }));

export const setQuestion = (q) => patch({ q });
export const clearAskError = () => patch({ error: "" });

// Changing the scope clears the previous answer so it can't be mistaken for the new scope's.
export const setScope = (scope) => patch({ scope: scope || "", res: null, error: "" });

export async function runAsk() {
  const { q, scope, busy } = askStore.get();
  if (!q.trim() || busy) return;
  patch({ busy: true, error: "" });
  try {
    const res = await ask(q, scope);
    if (askStore.get().scope === scope) patch({ res }); // ignore if the scope changed while waiting
  } catch (err) {
    patch({ error: `Search failed: ${err.message}` });
  } finally {
    patch({ busy: false });
  }
}
