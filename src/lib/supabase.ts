import "server-only";

type QueryValue = string | number | boolean;
type QueryOperator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "in";
type QueryFilter = QueryValue | { op: Exclude<QueryOperator, "in">; value: QueryValue } | { op: "in"; value: QueryValue[] };

type SupabaseConfig = {
  url: string;
  serviceRoleKey: string;
  bucket: string;
};

export type SupabaseHealthResult = {
  mode: "supabase";
  ok: boolean;
  configured: boolean;
  database: "bereikbaar" | "niet bereikbaar";
  fileStorage: "bereikbaar" | "niet bereikbaar";
  bucket: string;
  message: string;
};

export function usesSupabaseStorage() {
  return process.env.HELDER_STORAGE === "supabase";
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "helder";
  if (!url || !serviceRoleKey) return null;
  return { url, serviceRoleKey, bucket };
}

function requireSupabaseConfig() {
  const config = getSupabaseConfig();
  if (!config) throw new Error("Supabase is niet volledig ingesteld. Vul SUPABASE_URL en SUPABASE_SERVICE_ROLE_KEY in.");
  return config;
}

function buildQuery(filters?: Record<string, QueryFilter>, extra?: Record<string, string>) {
  const params = new URLSearchParams(extra);
  for (const [key, value] of Object.entries(filters ?? {})) {
    if (typeof value === "object") {
      if (value.op === "in") {
        params.set(key, `in.(${value.value.map(String).join(",")})`);
      } else {
        params.set(key, `${value.op}.${String(value.value)}`);
      }
    } else {
      params.set(key, `eq.${String(value)}`);
    }
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

async function supabaseFetch(path: string, init: RequestInit = {}) {
  const config = requireSupabaseConfig();
  const response = await fetch(`${config.url}${path}`, {
    ...init,
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`Supabase gaf een fout terug (${response.status}): ${body || response.statusText}`);
  }
  return response;
}

export async function supabaseSelect<T>(
  table: string,
  options: { select?: string; filters?: Record<string, QueryFilter>; order?: string; limit?: number } = {},
) {
  const query = buildQuery(options.filters, {
    select: options.select ?? "*",
    ...(options.order ? { order: options.order } : {}),
    ...(options.limit ? { limit: String(options.limit) } : {}),
  });
  const response = await supabaseFetch(`/rest/v1/${table}${query}`);
  return await response.json() as T[];
}

export async function supabaseSingle<T>(
  table: string,
  options: { select?: string; filters?: Record<string, QueryFilter>; order?: string } = {},
) {
  const rows = await supabaseSelect<T>(table, { ...options, limit: 1 });
  return rows[0] ?? null;
}

export async function supabaseInsert<T>(table: string, row: Record<string, unknown>) {
  const response = await supabaseFetch(`/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(row),
  });
  const rows = await response.json() as T[];
  return rows[0] ?? null;
}

export async function supabaseInsertMany<T>(table: string, rows: Array<Record<string, unknown>>) {
  if (!rows.length) return [] as T[];
  const response = await supabaseFetch(`/rest/v1/${table}`, {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(rows),
  });
  return await response.json() as T[];
}

export async function supabaseUpdate<T>(table: string, filters: Record<string, QueryFilter>, patch: Record<string, unknown>) {
  const response = await supabaseFetch(`/rest/v1/${table}${buildQuery(filters)}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(patch),
  });
  return await response.json() as T[];
}

export async function supabaseDelete(table: string, filters: Record<string, QueryFilter>) {
  await supabaseFetch(`/rest/v1/${table}${buildQuery(filters)}`, { method: "DELETE" });
}

export async function supabaseHealthCheck(): Promise<SupabaseHealthResult> {
  const config = getSupabaseConfig();
  if (!config) {
    return {
      mode: "supabase",
      ok: false,
      configured: false,
      database: "niet bereikbaar",
      fileStorage: "niet bereikbaar",
      bucket: "",
      message: "Supabase is nog niet volledig ingesteld. Controleer de project-URL, geheime sleutel en bucketnaam.",
    };
  }

  let databaseOk = false;
  let storageOk = false;

  try {
    await supabaseFetch("/rest/v1/users?select=id&limit=1");
    databaseOk = true;
  } catch {
    databaseOk = false;
  }

  try {
    await supabaseFetch(`/storage/v1/bucket/${encodeURIComponent(config.bucket)}`);
    storageOk = true;
  } catch {
    storageOk = false;
  }

  const ok = databaseOk && storageOk;
  return {
    mode: "supabase",
    ok,
    configured: true,
    database: databaseOk ? "bereikbaar" : "niet bereikbaar",
    fileStorage: storageOk ? "bereikbaar" : "niet bereikbaar",
    bucket: config.bucket,
    message: ok
      ? "Supabase is goed bereikbaar. Klanten, facturen, kosten en bonnetjes kunnen online worden opgeslagen."
      : "Supabase is ingesteld, maar nog niet alles is bereikbaar. Controleer de database-tabellen, storage bucket en sleutels.",
  };
}

export async function uploadSupabaseObject(path: string, contents: Buffer, contentType: string) {
  const config = requireSupabaseConfig();
  await supabaseFetch(`/storage/v1/object/${config.bucket}/${encodeURI(path)}`, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      "x-upsert": "false",
    },
    body: new Uint8Array(contents) as BodyInit,
  });
}

export async function downloadSupabaseObject(path: string) {
  const config = requireSupabaseConfig();
  const response = await supabaseFetch(`/storage/v1/object/${config.bucket}/${encodeURI(path)}`);
  return Buffer.from(await response.arrayBuffer());
}

export async function deleteSupabaseObject(path: string) {
  const config = requireSupabaseConfig();
  await supabaseFetch(`/storage/v1/object/${config.bucket}`, {
    method: "DELETE",
    body: JSON.stringify({ prefixes: [path] }),
  });
}
