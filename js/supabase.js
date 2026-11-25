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

// 5-minute persistent read cache TTL: instant navigation, automatic freshness
const SUPABASE_READ_TTL = 5 * 60 * 1000;
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
    return `${request.method}\n${userScope}\n${request.url}\n${varyingValues}`;
}

function persistentSupabaseReadCacheKey(cacheKey) {
    let hash = 2166136261;
    for (let index = 0; index < cacheKey.length; index += 1) {
        hash ^= cacheKey.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `${SUPABASE_READ_STORAGE_PREFIX}${(hash >>> 0).toString(36)}`;
}

async function readPersistentSupabaseResponse(cacheKey, { allowExpired = false } = {}) {
    try {
        const storageKey = persistentSupabaseReadCacheKey(cacheKey);
        let entry = null;
        if (window.thubDB) {
            entry = await window.thubDB.get(window.thubDB.STORES.SUPABASE_CACHE, storageKey);
        }
        if (!entry) {
            const serializedEntry = localStorage.getItem(storageKey);
            if (serializedEntry) {
                try {
                    entry = JSON.parse(serializedEntry);
                } catch {
                    entry = null;
                }
            }
        }
        if (!entry) return null;

        if (entry.cacheKey !== cacheKey || !Number.isFinite(entry.expiresAt)) {
            if (window.thubDB) window.thubDB.delete(window.thubDB.STORES.SUPABASE_CACHE, storageKey);
            localStorage.removeItem(storageKey);
            return null;
        }

        const isExpired = entry.expiresAt <= Date.now();
        if (isExpired && !allowExpired) {
            if (window.thubDB) window.thubDB.delete(window.thubDB.STORES.SUPABASE_CACHE, storageKey);
            localStorage.removeItem(storageKey);
            return null;
        }

        // Response status 204 (No Content), 205, or 304 cannot have a body per Fetch API specification
        const nullBodyStatuses = [204, 205, 304];
        const status = entry.status || 200;
        const isNullBody = nullBodyStatuses.includes(status) || entry.body === null || entry.body === undefined;
        const responseBody = isNullBody ? null : entry.body;

        return {
            response: new Response(responseBody, {
                status,
                statusText: entry.statusText || "",
                headers: entry.headers || [],
            }),
            expiresAt: entry.expiresAt,
            isExpired,
        };
    } catch {
        return null;
    }
}

async function persistSupabaseReadResponse(cacheKey, response, expiresAt) {
    try {
        let bodyText = null;
        const nullBodyStatuses = [204, 205, 304];
        if (!nullBodyStatuses.includes(response.status)) {
            try {
                bodyText = await response.clone().text();
            } catch {
                bodyText = null;
            }
        }

        const entry = {
            cacheKey,
            status: response.status,
            statusText: response.statusText,
            headers: Array.from(response.headers.entries()),
            body: bodyText,
            expiresAt,
        };
        const storageKey = persistentSupabaseReadCacheKey(cacheKey);

        if (window.thubDB) {
            await window.thubDB.set(window.thubDB.STORES.SUPABASE_CACHE, storageKey, entry);
        } else {
            const serializedEntry = JSON.stringify(entry);
            if (serializedEntry.length * 2 <= SUPABASE_READ_STORAGE_ENTRY_LIMIT_BYTES) {
                localStorage.setItem(storageKey, serializedEntry);
            }
        }
    } catch {
        // Keep the in-memory cache working when browser storage is unavailable.
    }
}

function trimPersistentSupabaseReadCache() {
    // IndexedDB manages its own quota dynamically; no aggressive trimming required.
}

function clearPersistentSupabaseReadCache() {
    try {
        if (window.thubDB) {
            window.thubDB.clear(window.thubDB.STORES.SUPABASE_CACHE);
        }
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

window.getSupabaseCacheStats = async function () {
    try {
        let persistentEntries = 0;
        let persistentBytes = 0;
        if (window.thubDB) {
            const all = await window.thubDB.getAll(window.thubDB.STORES.SUPABASE_CACHE);
            persistentEntries = all.length;
            persistentBytes = JSON.stringify(all).length * 2;
        } else {
            for (let index = 0; index < localStorage.length; index += 1) {
                const key = localStorage.key(index);
                if (key?.startsWith(SUPABASE_READ_STORAGE_PREFIX)) {
                    persistentEntries += 1;
                    const value = localStorage.getItem(key) || "";
                    persistentBytes += (key.length + value.length) * 2;
                }
            }
        }
        return {
            memoryEntries: supabaseReadCache.size,
            persistentEntries,
            persistentBytes,
            generation: supabaseCacheGeneration,
            ttlMinutes: SUPABASE_READ_TTL / (60 * 1000),
        };
    } catch {
        return {
            memoryEntries: supabaseReadCache.size,
            generation: supabaseCacheGeneration,
            ttlMinutes: SUPABASE_READ_TTL / (60 * 1000),
        };
    }
};

window.addEventListener("storage", (event) => {
    // Only invalidate in-memory cache when a mutation invalidates or storage is cleared,
    // NOT when another tab writes a normal cached entry.
    if (
        event.key === null ||
        event.key === SUPABASE_READ_STORAGE_INVALIDATION_KEY
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
    const isSupabaseRestOrigin =
        url.origin === new URL(SUPABASE_URL).origin &&
        url.pathname.startsWith("/rest/v1/");

    // Only GET and HEAD queries on /rest/v1/ tables are idempotent reads to cache
    const isTableReadMethod = request.method === "GET" || request.method === "HEAD";
    const isSupabaseTableRead = isSupabaseRestOrigin && isTableReadMethod;

    if (!isSupabaseTableRead) {
        const response = await defaultSupabaseFetch(request);
        // Only actual mutation methods (POST, PATCH, PUT, DELETE) clear the read cache.
        // HEAD and OPTIONS requests will never wipe out cached data.
        const isMutationMethod = ["POST", "PATCH", "PUT", "DELETE"].includes(request.method);
        if (isSupabaseRestOrigin && isMutationMethod && response.ok) {
            window.clearSupabaseReadCache();
        }
        return response;
    }

    trimSupabaseReadCache();
    const key = supabaseReadCacheKey(request);

    // 1. Check fast in-memory cache
    const cached = supabaseReadCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.response.clone();
    }

    // 2. Check persistent IndexedDB cache
    const persistentEntry = await readPersistentSupabaseResponse(key);
    if (persistentEntry && !persistentEntry.isExpired) {
        supabaseReadCache.set(key, {
            response: persistentEntry.response.clone(),
            expiresAt: persistentEntry.expiresAt,
        });
        trimSupabaseReadCache();
        return persistentEntry.response;
    }

    // 3. Deduplicate in-flight concurrent requests for the same query
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
            .catch(async (error) => {
                // Offline fallback: if network fails, serve persistent cached entry if available
                const fallbackEntry = await readPersistentSupabaseResponse(key, { allowExpired: true });
                if (fallbackEntry) {
                    return fallbackEntry.response;
                }
                throw error;
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
    if (event === "SIGNED_OUT" || event === "USER_UPDATED") {
        window.clearSupabaseReadCache();
    }
});
