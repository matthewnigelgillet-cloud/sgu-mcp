import { useEffect, useRef, useState } from "react";
import { ragContext } from "../archive";

const MODELS = [
  { id: "claude-haiku-4-5", label: "Haiku 4.5 — fastest" },
  { id: "claude-sonnet-4-6", label: "Sonnet 4.6 — balanced" },
  { id: "claude-opus-4-8", label: "Opus 4.8 — deepest" },
];

const EXAMPLES = [
  "Why do we get cancer, and what actually treats it?",
  "What's the rogues' take on homeopathy?",
  "Summarise what they've said about UFO sightings.",
];

const SYSTEM =
  "You are the reference desk of the SGU Archive — the transcript archive of the podcast " +
  "The Skeptics' Guide to the Universe. Answer the user's question USING ONLY the transcript " +
  "excerpts provided in their message. Cite episodes inline like (ep 540). If the excerpts do not " +
  "contain the answer, say plainly that the archive doesn't appear to cover it — never use outside " +
  "knowledge or the open web. Write in a calm, precise, scholarly voice; be concise.";

/** A reference librarian, not a chatbot: ask a question, get a cited answer
 *  drawn ONLY from the SGU transcripts, streamed in. BYOK, browser → Anthropic. */
export default function ReferenceDesk() {
  const [key, setKey] = useState("");
  const [model, setModel] = useState("claude-haiku-4-5");
  const [showKey, setShowKey] = useState(true);
  const [thread, setThread] = useState([]); // { role, content, sources? }
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [keyError, setKeyError] = useState("");
  const scroller = useRef(null);

  // Validate at the door, before the desk opens — the clearest place to catch a
  // missing or wrong-type key.
  function openDesk() {
    const k = key.trim();
    if (!k) return setKeyError("Enter your Anthropic key, or use the free search — it needs none.");
    if (!k.startsWith("sk-ant-")) {
      return setKeyError(
        k.startsWith("sk-")
          ? "That looks like an OpenAI key. The reference desk needs an Anthropic key (sk-ant-…). An OpenAI key works under ‘Find by meaning → Best’."
          : "That isn't an Anthropic API key — it should start with sk-ant-. Copy a fresh one from console.anthropic.com."
      );
    }
    setKeyError("");
    setShowKey(false);
  }

  useEffect(() => {
    setKey(localStorage.getItem("sgu_anthropic_key") || "");
    setModel(localStorage.getItem("sgu_model") || "claude-haiku-4-5");
    setShowKey(!localStorage.getItem("sgu_anthropic_key"));
  }, []);

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [thread]);

  async function ask(question) {
    const q = question.trim();
    if (!q || busy) return;
    const k = key.trim();
    if (!k.startsWith("sk-ant-")) {
      setShowKey(true);
      setKeyError("Enter a valid Anthropic key (sk-ant-…) to open the desk.");
      return;
    }
    localStorage.setItem("sgu_anthropic_key", k);
    localStorage.setItem("sgu_model", model);
    setDraft("");
    setBusy(true);

    // 1) retrieve grounding excerpts from the transcripts
    const ctx = await ragContext(q, 10).catch(() => []);
    const sources = [...new Set(ctx.map((c) => c.episode))];
    const context =
      ctx.length > 0
        ? ctx.map((c) => `[Episode ${c.episode}${c.date ? ", " + c.date : ""}] ${c.text}`).join("\n\n")
        : "(no matching transcript excerpts found)";

    const userTurn = { role: "user", content: q };
    const priorForApi = thread.map((m) => ({ role: m.role, content: m.content }));
    setThread((t) => [...t, userTurn, { role: "assistant", content: "", sources, streaming: true }]);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": key.trim(),
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model,
          max_tokens: 1024,
          system: SYSTEM,
          stream: true,
          messages: [
            ...priorForApi,
            { role: "user", content: `SGU transcript excerpts:\n\n${context}\n\n---\nQuestion: ${q}` },
          ],
        }),
      });

      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({}));
        const msg = err?.error?.message || `request failed (${res.status})`;
        let hint = "";
        if (res.status === 401) hint = " — the key was rejected. Re-copy a fresh key from console.anthropic.com (watch for a trailing space or partial paste).";
        else if (/credit|billing/i.test(msg)) hint = " — add credits to your Anthropic account in the console.";
        else if (res.status === 403) hint = " — this key lacks permission; try a default-workspace key.";
        else if (res.status === 429) hint = " — rate limited; wait a moment and try again.";
        patchLast(`✕ ${msg}${hint}`, false, true);
        return;
      }

      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      let acc = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const d = line.slice(5).trim();
          if (!d || d === "[DONE]") continue;
          try {
            const j = JSON.parse(d);
            if (j.type === "content_block_delta" && j.delta?.type === "text_delta") {
              acc += j.delta.text;
              patchLast(acc, true);
            }
          } catch {
            /* keep streaming */
          }
        }
      }
      patchLast(acc || "(no answer returned)", false);
    } catch (e) {
      patchLast(`✕ ${e.message}`, false, true);
    } finally {
      setBusy(false);
    }
  }

  function patchLast(content, streaming, error = false) {
    setThread((t) => {
      const next = t.slice();
      const last = next[next.length - 1];
      if (last && last.role === "assistant") next[next.length - 1] = { ...last, content, streaming, error };
      return next;
    });
  }

  return (
    <div>
      {/* key entry — stated plainly, like a reading-room policy */}
      {showKey ? (
        <div className="border border-rule bg-plate/50 p-5">
          <p className="font-mono text-[0.66rem] uppercase tracking-label text-brass/80">Reference desk</p>
          <p className="mt-3 max-w-[56ch] font-serif text-[1.02rem] italic leading-relaxed text-bone-dim">
            Ask a question and Claude answers from the transcripts alone — nothing from the open web.
            Your key stays in this browser and is sent straight to Anthropic, never to this archive.
          </p>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
            <input
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="sk-ant-…"
              aria-label="Anthropic API key"
              className="flex-1 border-b border-bone/60 bg-transparent py-2 font-mono text-sm text-bone placeholder:text-graphite focus:border-verdigris focus:outline-none"
            />
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="border border-rule bg-ink px-3 py-2 font-mono text-[0.72rem] text-bone-dim"
            >
              {MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <button
              onClick={openDesk}
              className="border border-brass/40 px-4 py-2 font-mono text-[0.68rem] uppercase tracking-label text-verdigris transition-colors hover:bg-slate"
            >
              Open the desk
            </button>
          </div>
          {keyError ? (
            <p className="mt-3 max-w-[60ch] font-mono text-[0.66rem] leading-relaxed text-oxblood">{keyError}</p>
          ) : (
            <p className="mt-3 font-mono text-[0.62rem] text-graphite">
              No key? Use the free search instead — it needs none.
            </p>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-between border-b border-rule pb-3">
          <span className="font-mono text-[0.66rem] uppercase tracking-label text-graphite">
            Reference desk · <span className="text-verdigris">grounded only in the transcripts</span>
          </span>
          <button onClick={() => setShowKey(true)} className="font-mono text-[0.62rem] uppercase tracking-label text-graphite hover:text-bone">
            Key · {MODELS.find((m) => m.id === model)?.label.split(" — ")[0]}
          </button>
        </div>
      )}

      {/* the thread */}
      {!showKey && (
        <>
          <div ref={scroller} className="mt-6 max-h-[58vh] space-y-8 overflow-y-auto pr-1">
            {thread.length === 0 && (
              <div className="py-6">
                <p className="font-serif text-[1.05rem] italic text-graphite">
                  The desk is open. Ask the archive a question — answers are drawn only from twenty
                  years of transcripts.
                </p>
                <div className="mt-5 space-y-2">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => ask(ex)}
                      className="block text-left font-serif text-[1.05rem] text-bone-dim underline-offset-4 transition-colors hover:text-bone hover:underline hover:decoration-brass"
                    >
                      → {ex}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {thread.map((m, i) =>
              m.role === "user" ? (
                <div key={i}>
                  <p className="font-mono text-[0.62rem] uppercase tracking-label text-graphite">Enquiry</p>
                  <p className="mt-1.5 font-serif text-[1.2rem] text-bone">{m.content}</p>
                </div>
              ) : (
                <div key={i} className="border-l-2 border-verdigris/60 pl-5">
                  <p className="font-mono text-[0.62rem] uppercase tracking-label text-verdigris">
                    From the record
                  </p>
                  <p
                    className={`mt-2 whitespace-pre-wrap font-serif text-[1.08rem] leading-relaxed ${
                      m.error ? "text-oxblood" : "text-bone"
                    }`}
                  >
                    {m.content}
                    {m.streaming && <span className="ml-0.5 inline-block animate-pulse text-verdigris">▍</span>}
                  </p>
                  {m.sources?.length > 0 && !m.error && (
                    <p className="mt-3 font-mono text-[0.62rem] uppercase tracking-label text-graphite">
                      Consulted ·{" "}
                      {m.sources.slice(0, 8).map((ep, k) => (
                        <span key={ep} className="text-bone-dim">
                          {k > 0 && " · "}ep {ep}
                        </span>
                      ))}
                    </p>
                  )}
                </div>
              )
            )}
          </div>

          {/* ask line */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              ask(draft);
            }}
            className="mt-6 flex items-center gap-3 border-t border-rule pt-4"
          >
            <span className="select-none font-mono text-verdigris">▸</span>
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              disabled={busy}
              placeholder={busy ? "Consulting the record…" : "Ask the archive…"}
              className="w-full bg-transparent font-serif text-[1.2rem] italic text-bone placeholder:text-graphite focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="shrink-0 font-mono text-[0.68rem] uppercase tracking-label text-verdigris disabled:text-graphite"
            >
              Ask
            </button>
          </form>
        </>
      )}
    </div>
  );
}
