// Pluggable embedding providers for semantic search.
//
//   local  (default) — runs Xenova/all-MiniLM-L6-v2 via transformers.js. No API
//                      key, no per-query cost. The SAME library + model is used
//                      in the browser, so index-time and query-time vectors live
//                      in the same space. Slower; heavier dependency.
//   openai           — text-embedding-3-small. Best quality. Needs OPENAI_API_KEY.
//   voyage           — voyage-3-lite (Anthropic's recommended provider). Needs VOYAGE_API_KEY.
//
// Doc vectors are computed ONCE at index time (cheap), so picking a paid provider
// is a one-time cost of a few cents — only per-query embeddings recur, and on the
// website those run in the visitor's browser with the visitor's own key.
export type Provider = "local" | "openai" | "voyage";

export interface Embedder {
  provider: Provider;
  model: string;
  dim: number;
  embed(texts: string[]): Promise<Float32Array[]>;
}

export const PROVIDER_MODELS: Record<Provider, { model: string; dim: number }> = {
  local: { model: "Xenova/all-MiniLM-L6-v2", dim: 384 },
  openai: { model: "text-embedding-3-small", dim: 1536 },
  voyage: { model: "voyage-3-lite", dim: 512 },
};

export function providerFromEnv(): Provider {
  const p = (process.env.EMBED_PROVIDER || "local").toLowerCase();
  if (p === "local" || p === "openai" || p === "voyage") return p;
  throw new Error(`Unknown EMBED_PROVIDER '${p}' (use local | openai | voyage)`);
}

function normalize(v: Float32Array): Float32Array {
  let n = 0;
  for (let i = 0; i < v.length; i++) n += v[i] * v[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < v.length; i++) v[i] /= n;
  return v;
}

// Cosine similarity of unit vectors == dot product.
export function dot(a: Float32Array, b: Float32Array): number {
  let s = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) s += a[i] * b[i];
  return s;
}

async function localEmbedder(): Promise<Embedder> {
  let pipe: any;
  try {
    // Optional dependency — only needed for the local provider. Use a non-literal
    // specifier so the type-checker treats it as `any` and doesn't require the
    // module to be installed at build time.
    const mod = "@xenova/transformers";
    const t: any = await import(mod);
    t.env.allowLocalModels = false;
    pipe = await t.pipeline("feature-extraction", PROVIDER_MODELS.local.model);
  } catch (e: any) {
    throw new Error(
      "Local embeddings need @xenova/transformers. Install it (`npm i @xenova/transformers`) " +
        "or set EMBED_PROVIDER=openai|voyage with the matching API key. Cause: " + e.message
    );
  }
  return {
    provider: "local",
    model: PROVIDER_MODELS.local.model,
    dim: PROVIDER_MODELS.local.dim,
    async embed(texts: string[]): Promise<Float32Array[]> {
      const out: Float32Array[] = [];
      for (const text of texts) {
        const r = await pipe(text, { pooling: "mean", normalize: true });
        out.push(normalize(Float32Array.from(r.data as Float32Array)));
      }
      return out;
    },
  };
}

async function apiEmbedder(provider: "openai" | "voyage"): Promise<Embedder> {
  const { model, dim } = PROVIDER_MODELS[provider];
  const cfg =
    provider === "openai"
      ? {
          url: "https://api.openai.com/v1/embeddings",
          key: process.env.OPENAI_API_KEY,
          keyName: "OPENAI_API_KEY",
        }
      : {
          url: "https://api.voyageai.com/v1/embeddings",
          key: process.env.VOYAGE_API_KEY,
          keyName: "VOYAGE_API_KEY",
        };
  if (!cfg.key) throw new Error(`${provider} provider needs ${cfg.keyName} in the environment.`);

  return {
    provider,
    model,
    dim,
    async embed(texts: string[]): Promise<Float32Array[]> {
      const out: Float32Array[] = [];
      // Batch to keep requests reasonable.
      for (let i = 0; i < texts.length; i += 128) {
        const batch = texts.slice(i, i + 128);
        const res = await fetch(cfg.url, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${cfg.key}` },
          body: JSON.stringify({ model, input: batch }),
        });
        if (!res.ok) throw new Error(`${provider} embeddings HTTP ${res.status}: ${await res.text()}`);
        const data = (await res.json()) as any;
        for (const d of data.data) out.push(normalize(Float32Array.from(d.embedding)));
      }
      return out;
    },
  };
}

export async function getEmbedder(provider: Provider = providerFromEnv()): Promise<Embedder> {
  return provider === "local" ? localEmbedder() : apiEmbedder(provider);
}
