const SUPABASE_URL = "https://xlwrdsrjdgzfqpbigphv.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhsd3Jkc3JqZGd6ZnFwYmlncGh2Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU2ODkyMjIsImV4cCI6MjEwMTI2NTIyMn0.53HUz-sMEdBLpH4OehUA0_50r0wgEmo-pYgDnTMzYbY";

const isLocalDevelopmentHost = ["localhost", "127.0.0.1", "::1"].includes(
    window.location.hostname,
);
const appDiagnosticsEnabled =
    isLocalDevelopmentHost &&
    new URLSearchParams(window.location.search).get("debug") === "1";
if (!appDiagnosticsEnabled) {
    ["log", "debug", "info", "warn", "error", "trace", "table", "dir"].forEach(
        (method) => {
            console[method] = () => {};
        },
    );
}


const SUPABASE_READ_TTL = 24 * 60 * 60 * 1000;
const SUPABASE_READ_CACHE_LIMIT = 120;
const SUPABASE_READ_STORAGE_PREFIX = "tHubSupabaseReadCache:v1:";
const SUPABASE_READ_STORAGE_INVALIDATION_KEY = "tHubSupabaseReadCacheInvalidated";
const SUPABASE_READ_STORAGE_LIMIT_BYTES = 4 * 1024 * 1024;
const SUPABASE_READ_STORAGE_ENTRY_LIMIT_BYTES = 1536 * 1024;
const supabaseReadCache = new Map();
const supabaseReadInflight = new Map();
const defaultSupabaseFetch = window.fetch.bind(window);
let supabaseCacheGeneration = 0;

function supabaseReadCacheKey(request) {
    const varyHeaders = [
        "accept-profile",
        "content-profile",
        "range",
        "prefer",
    ];
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.replace(/^Bearer\s+/i, "");
    let userScope = "anonymous";
    try {
        const payload = token.split(".")[1];
        if (payload) {
            const normalizedPayload = payload.replace(/-/g, "+").replace(/_/g, "/");
            const claims = JSON.parse(atob(normalizedPayload));
            userScope = claims.sub || claims.role || userScope;
        }
    } catch {
        // Requests without a readable user claim remain isolated as anonymous.
    }
    const varyingValues = varyHeaders
        .map((name) => `${name}:${request.headers.get(name) || ""}`)
        .join("\n");
    return `${userScope}\n${request.url}\n${varyingValues}`;
}

function persistentSupabaseReadCacheKey(cacheKey) {
    let hash = 2166136261;
    for (let index = 0; index < cacheKey.length; index += 1) {
        hash ^= cacheKey.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `${SUPABASE_READ_STORAGE_PREFIX}${(hash >>> 0).toString(36)}`;
}

function readPersistentSupabaseResponse(cacheKey) {
    try {
        const storageKey = persistentSupabaseReadCacheKey(cacheKey);
        const serializedEntry = localStorage.getItem(storageKey);
        if (!serializedEntry) return null;

        const entry = JSON.parse(serializedEntry);
        if (
            entry.cacheKey !== cacheKey ||
            !Number.isFinite(entry.expiresAt) ||
            entry.expiresAt <= Date.now()
        ) {
            localStorage.removeItem(storageKey);
            return null;
        }

        return {
            response: new Response(entry.body || null, {
                status: entry.status,
                statusText: entry.statusText || "",
                headers: entry.headers || [],
            }),
            expiresAt: entry.expiresAt,
        };
    } catch {
        return null;
    }
}

async function persistSupabaseReadResponse(cacheKey, response, expiresAt) {
    try {
        const entry = {
            cacheKey,
            status: response.status,
            statusText: response.statusText,
            headers: Array.from(response.headers.entries()),
            body: await response.clone().text(),
            expiresAt,
        };
        const serializedEntry = JSON.stringify(entry);
        if (serializedEntry.length * 2 > SUPABASE_READ_STORAGE_ENTRY_LIMIT_BYTES) return;

        localStorage.setItem(
            persistentSupabaseReadCacheKey(cacheKey),
            serializedEntry,
        );
        trimPersistentSupabaseReadCache();
    } catch {
        // Keep the in-memory cache working when browser storage is unavailable/full.
    }
}

function trimPersistentSupabaseReadCache() {
    try {
        const now = Date.now();
        const entries = [];
        let totalBytes = 0;

        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (!key?.startsWith(SUPABASE_READ_STORAGE_PREFIX)) continue;

            const value = localStorage.getItem(key) || "";
            let expiresAt = 0;
            try {
                expiresAt = JSON.parse(value).expiresAt || 0;
            } catch {
                // Corrupted entries are removed below.
            }

            if (expiresAt <= now) {
                localStorage.removeItem(key);
                index -= 1;
                continue;
            }

            const sizeBytes = (key.length + value.length) * 2;
            totalBytes += sizeBytes;
            entries.push({ key, sizeBytes, expiresAt });
        }

        entries.sort((left, right) => left.expiresAt - right.expiresAt);
        while (totalBytes > SUPABASE_READ_STORAGE_LIMIT_BYTES && entries.length) {
            const oldestEntry = entries.shift();
            localStorage.removeItem(oldestEntry.key);
            totalBytes -= oldestEntry.sizeBytes;
        }
    } catch {
        // Storage cleanup is best effort; query results still work in memory.
    }
}

function clearPersistentSupabaseReadCache() {
    try {
        const keysToRemove = [];
        for (let index = 0; index < localStorage.length; index += 1) {
            const key = localStorage.key(index);
            if (key?.startsWith(SUPABASE_READ_STORAGE_PREFIX)) keysToRemove.push(key);
        }
        keysToRemove.forEach((key) => localStorage.removeItem(key));
        localStorage.setItem(SUPABASE_READ_STORAGE_INVALIDATION_KEY, String(Date.now()));
    } catch {
        // Storage may be disabled by browser policy.
    }
}

window.clearSupabaseReadCache = function () {
    supabaseCacheGeneration += 1;
    supabaseReadCache.clear();
    supabaseReadInflight.clear();
    clearPersistentSupabaseReadCache();
};

window.addEventListener("storage", (event) => {
    if (
        event.key === null ||
        event.key === SUPABASE_READ_STORAGE_INVALIDATION_KEY ||
        event.key?.startsWith(SUPABASE_READ_STORAGE_PREFIX)
    ) {
        supabaseReadCache.clear();
        supabaseReadInflight.clear();
        supabaseCacheGeneration += 1;
    }
});

function trimSupabaseReadCache() {
    const now = Date.now();
    for (const [key, entry] of supabaseReadCache) {
        if (entry.expiresAt <= now) supabaseReadCache.delete(key);
    }
    while (supabaseReadCache.size > SUPABASE_READ_CACHE_LIMIT) {
        supabaseReadCache.delete(supabaseReadCache.keys().next().value);
    }
}

async function cachedSupabaseFetch(input, init) {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const isSupabaseTableRead =
        url.origin === new URL(SUPABASE_URL).origin &&
        url.pathname.startsWith("/rest/v1/") &&
        request.method === "GET";

    if (!isSupabaseTableRead) {
        const response = await defaultSupabaseFetch(request);
        if (
            url.origin === new URL(SUPABASE_URL).origin &&
            url.pathname.startsWith("/rest/v1/") &&
            request.method !== "GET" &&
            response.ok
        ) {
            window.clearSupabaseReadCache();
        }
        return response;
    }

    trimSupabaseReadCache();
    const key = supabaseReadCacheKey(request);
    const cached = supabaseReadCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.response.clone();
    }

    const persistentEntry = readPersistentSupabaseResponse(key);
    if (persistentEntry) {
        supabaseReadCache.set(key, {
            response: persistentEntry.response.clone(),
            expiresAt: persistentEntry.expiresAt,
        });
        trimSupabaseReadCache();
        return persistentEntry.response;
    }

    let pending = supabaseReadInflight.get(key);
    if (!pending) {
        const generation = supabaseCacheGeneration;
        pending = defaultSupabaseFetch(request)
            .then(async (response) => {
                if (response.ok && generation === supabaseCacheGeneration) {
                    const expiresAt = Date.now() + SUPABASE_READ_TTL;
                    supabaseReadCache.set(key, {
                        response: response.clone(),
                        expiresAt,
                    });
                    trimSupabaseReadCache();
                    await persistSupabaseReadResponse(key, response, expiresAt);
                }
                return response;
            })
            .finally(() => {
                if (supabaseReadInflight.get(key) === pending) {
                    supabaseReadInflight.delete(key);
                }
            });
        supabaseReadInflight.set(key, pending);
    }

    return (await pending).clone();
}

const supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    { global: { fetch: cachedSupabaseFetch } },
);

window.supabaseClient = supabaseClient;

supabaseClient.auth.onAuthStateChange((event) => {
    supabaseCacheGeneration += 1;
    supabaseReadCache.clear();
    supabaseReadInflight.clear();
    if (event === "SIGNED_OUT") window.clearSupabaseReadCache();
});
