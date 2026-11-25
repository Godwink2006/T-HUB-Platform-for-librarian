const THUB_THEME_STORAGE_KEY = "tHubTheme";

function applySavedAppTheme() {
  const savedTheme =
    localStorage.getItem(THUB_THEME_STORAGE_KEY) ||
    localStorage.getItem("tHubDashboardTheme") ||
    "light";
  const isDark = savedTheme === "dark";
  document.body.classList.toggle("app-dark", isDark);

  const updateToggleElement = (themeToggle, dark) => {
    if (!themeToggle) return;
    themeToggle.setAttribute("aria-pressed", String(dark));
    const label = dark ? "Switch to light mode" : "Switch to dark mode";
    themeToggle.setAttribute("aria-label", label);
    themeToggle.title = label;
    themeToggle.innerHTML = dark
      ? '<i class="fa-solid fa-sun" aria-hidden="true"></i><span>Light mode</span>'
      : '<i class="fa-solid fa-moon" aria-hidden="true"></i><span>Dark mode</span>';
  };

  const updateAllToggles = (dark) => {
    document.querySelectorAll(".app-theme-toggle").forEach((themeToggle) => {
      updateToggleElement(themeToggle, dark);
    });
  };

  const dashboardToggle = document.getElementById("dashboardThemeToggle");
  if (dashboardToggle) {
    dashboardToggle.classList.add("app-theme-toggle");
  }

  updateAllToggles(isDark);

  window.setAppTheme = (theme) => {
    const dark = theme === true || theme === "dark";
    localStorage.setItem(THUB_THEME_STORAGE_KEY, dark ? "dark" : "light");
    document.body.classList.toggle("app-dark", dark);
    updateAllToggles(dark);
  };

  document.querySelectorAll(".app-theme-toggle").forEach((themeToggle) => {
    if (!themeToggle.dataset.themeBound) {
      themeToggle.dataset.themeBound = "true";
      themeToggle.addEventListener("click", () => {
        const dark = !document.body.classList.contains("app-dark");
        window.setAppTheme(dark);
      });
    }
  });

  if (!window.__appThemeDelegated) {
    window.__appThemeDelegated = true;
    document.addEventListener("click", (e) => {
      const toggleBtn = e.target.closest(".app-theme-toggle");
      if (!toggleBtn) return;
      const dark = !document.body.classList.contains("app-dark");
      window.setAppTheme(dark);
    });
  }
}

window.applySavedAppTheme = applySavedAppTheme;

function ensureAppThemeStylesheet() {
  if (
    document.querySelector('link[data-app-theme="true"]') ||
    document.querySelector('link[href="/css/app-theme.css"]')
  ) return;
  const themeStylesheet = document.createElement("link");
  themeStylesheet.rel = "stylesheet";
  themeStylesheet.href = "/css/app-theme.css";
  themeStylesheet.dataset.appTheme = "true";
  document.head.append(themeStylesheet);
}

if (isLoginPage()) {
  document.body.classList.remove("app-dark");
  document.querySelectorAll(".app-theme-toggle").forEach((toggle) => {
    toggle.remove();
  });
} else {
  ensureAppThemeStylesheet();
  applySavedAppTheme();
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", applySavedAppTheme);
  }
}

window.formatSchoolMoney = function (amount, currencyCode) {
  const numericAmount = Number(amount);
  if (!Number.isFinite(numericAmount)) return "—";

  const normalizedCode = String(currencyCode || "").trim().toUpperCase();
  const currencyLabel =
    normalizedCode === "LRD" || normalizedCode === "LD"
      ? "LD"
      : normalizedCode === "USD"
        ? "USD"
        : "Currency not set";
  const formattedAmount = numericAmount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return `${currencyLabel} ${formattedAmount}`;
};

function renderNavigation() {
  document.querySelectorAll(".admin-librarian-only").forEach((el) => {
    el.style.setProperty("display", "list-item", "important");
  });
}

window.DEFAULT_PROFILE_AVATAR =
  "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 128 128' width='128' height='128'><circle cx='64' cy='64' r='64' fill='%23E4E6EB'/><circle cx='64' cy='46' r='22' fill='%23B0B3B8'/><path d='M24 112c0-22 18-40 40-40s40 18 40 40' fill='%23B0B3B8'/></svg>";

function isLoginPage() {
  const path = window.location.pathname.toLowerCase();
  return (
    path.endsWith("/index.html") ||
    path.endsWith("index.html") ||
    path === "/" ||
    path === "" ||
    path.endsWith("/login.html")
  );
}

let bodyScrollLockedByModal = false;
let bodyOverflowBeforeModalLock = "";

const MODAL_CONTAINER_SELECTOR =
  '[class*="modal"], [class*="Modal"], [id*="modal"], [id*="Modal"], [role="dialog"], dialog[open]';

function hasVisibleModal() {
  if (!document.body) return false;

  if (
    document.body.classList.contains("modal-open") ||
    document.body.classList.contains("settings-modal-open")
  ) {
    return true;
  }

  return Array.from(
    document.body.querySelectorAll(MODAL_CONTAINER_SELECTOR),
  ).some((modal) => {
    if (modal === document.body || modal.hidden) return false;
    if (modal.getAttribute("aria-hidden") === "true") return false;

    const isDialogElement =
      modal.tagName?.toLowerCase() === "dialog" ||
      modal.getAttribute("role") === "dialog";
    let element = modal;
    let position = "";
    while (element && element !== document.body) {
      const style = window.getComputedStyle(element);
      if (style.display === "none" || style.visibility === "hidden") {
        return false;
      }
      if (element === modal) position = style.position;
      element = element.parentElement;
    }

    return isDialogElement || position === "fixed";
  });
}

function syncBodyScrollLock(forceLock = false) {
  if (!document.body) return;

  const shouldLock = forceLock || hasVisibleModal();
  if (shouldLock) {
    if (!bodyScrollLockedByModal) {
      bodyOverflowBeforeModalLock =
        document.body.style.overflow === "hidden"
          ? ""
          : document.body.style.overflow;
      bodyScrollLockedByModal = true;
    }
    document.body.style.overflow = "hidden";
    return;
  }

  if (bodyScrollLockedByModal) {
    document.body.style.overflow = bodyOverflowBeforeModalLock;
    bodyOverflowBeforeModalLock = "";
    bodyScrollLockedByModal = false;
  }
}

function lockBodyScroll() {
  syncBodyScrollLock(true);
}

function unLockBodyScroll() {
  syncBodyScrollLock();
}

function observeModalScrollState() {
  if (!document.body || typeof MutationObserver === "undefined") return;

  const observer = new MutationObserver(() => syncBodyScrollLock());
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: ["aria-hidden", "class", "hidden", "open", "style"],
    childList: true,
    subtree: true,
  });
  syncBodyScrollLock();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", observeModalScrollState, {
    once: true,
  });
} else {
  observeModalScrollState();
}

function showToast(message, type = "success", duration = 5000) {
  let container = document.getElementById("toastContainer");

  if (!container) {
    container = document.createElement("div");
    container.id = "toastContainer";
    container.className = "toast-container";
    document.body.appendChild(container);
  }

  const messageText = String(message);
  const existingToast = Array.from(container.children).find(
    (item) =>
      item.classList.contains(`toast-${type}`) &&
      item.textContent === messageText,
  );

  if (existingToast) {
    clearTimeout(existingToast.dismissTimer);
    existingToast.classList.add("show");
    existingToast.dismissTimer = setTimeout(() => {
      existingToast.classList.remove("show");
      existingToast.addEventListener("transitionend", () => existingToast.remove(), {
        once: true,
      });
    }, duration);
    return existingToast;
  }

  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;
  toast.textContent = messageText;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.add("show");
  });

  toast.dismissTimer = setTimeout(() => {
    toast.classList.remove("show");
    toast.addEventListener("transitionend", () => toast.remove(), { once: true });
  }, duration);

  return toast;
}

let _authContextPromise = null;

window.getAuthContext = function (forceRefresh = false) {
  if (!forceRefresh && _authContextPromise) {
    return _authContextPromise;
  }

  _authContextPromise = (async () => {
    if (!window.supabaseClient) return null;

    try {
      const {
        data: { user },
        error: userError,
      } = await window.supabaseClient.auth.getUser();

      if (userError || !user) {
        return null;
      }

      const { data: profile, error: profileError } = await window.supabaseClient
        .from("profiles")
        .select("id, full_name, role, status, school_id")
        .eq("id", user.id)
        .maybeSingle();

      if (profileError) {
        console.warn("Could not load user profile:", profileError);
      }

      return { user, profile: profile || null };
    } catch (err) {
      console.error("Error retrieving auth context:", err);
      return null;
    }
  })();

  return _authContextPromise;
};

window.clearAuthContext = function () {
  _authContextPromise = null;
};

window.loadTransferredStudentIdentitySnapshots = async function (studentIds) {
  const ids = [...new Set((studentIds || []).filter(Boolean))];
  if (ids.length === 0) return new Map();

  const client = window.supabaseClient;
  const authContext = await window.getAuthContext();
  const schoolId = authContext?.profile?.school_id;
  if (!client || !schoolId) return new Map();

  const { data, error } = await client
    .from("student_enrollments")
    .select(
      "student_id, student_name_snapshot, student_code_snapshot, student_photo_snapshot",
    )
    .eq("school_id", schoolId)
    .in("student_id", ids)
    .not("student_name_snapshot", "is", null);

  if (error) {
    console.error("Could not load transferred student identity snapshots:", error);
    return new Map();
  }

  const snapshots = new Map();
  (data || []).forEach((row) => {
    if (!snapshots.has(row.student_id)) snapshots.set(row.student_id, row);
  });
  return snapshots;
};

window.forceLogout = async function () {
  window.clearAuthContext?.();
  try {
    await window.thubDB?.clearAll();
  } catch (e) {}
  window.libraryPageCache?.clearAll();
  if (window.supabaseClient) {
    try {
      await window.supabaseClient.auth.signOut();
    } catch (e) {
      console.warn("SignOut error ignored:", e);
    }
  }

  localStorage.clear();
  sessionStorage.clear();

  if (!isLoginPage()) {
    window.location.replace("/index.html");
  }
};

(function initPageCacheManager() {
  const CACHE_PREFIX = "thubLibraryPageCache:v1:";
  const LEGACY_CACHE_PREFIX = "thubStudentPageCache:v1:";

  function lastUserKey(page) {
    return `${CACHE_PREFIX}${page}:last-user`;
  }

  function pageDataKey(page, userId) {
    return `${CACHE_PREFIX}${page}:${userId}`;
  }

  function currentStoredUserId() {
    try {
      for (let index = 0; index < localStorage.length; index += 1) {
        const key = localStorage.key(index);
        if (!key?.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
        const session = JSON.parse(localStorage.getItem(key) || "{}");
        const userId = session?.user?.id || session?.currentSession?.user?.id;
        if (userId) return userId;
      }
    } catch {}
    return null;
  }

  function readLast(page) {
    try {
      const userId =
        window.thubDB?.getSync(window.thubDB.STORES.PAGE_CACHE, lastUserKey(page)) ||
        window.thubDB?.getSync(window.thubDB.STORES.PAGE_CACHE, `${LEGACY_CACHE_PREFIX}${page}:last-user`) ||
        localStorage.getItem(lastUserKey(page)) ||
        localStorage.getItem(`${LEGACY_CACHE_PREFIX}${page}:last-user`);
      if (!userId) return null;
      if (userId !== currentStoredUserId()) return null;
      return read(page, userId);
    } catch (error) {
      console.warn(`Could not read the saved ${page} page:`, error);
      return null;
    }
  }

  function read(page, userId) {
    if (!userId) return null;
    try {
      const cached =
        window.thubDB?.getSync(window.thubDB.STORES.PAGE_CACHE, pageDataKey(page, userId)) ||
        window.thubDB?.getSync(window.thubDB.STORES.PAGE_CACHE, `${LEGACY_CACHE_PREFIX}${page}:${userId}`);
      if (cached && cached.data) {
        return cached;
      }
      const raw =
        localStorage.getItem(pageDataKey(page, userId)) ||
        localStorage.getItem(`${LEGACY_CACHE_PREFIX}${page}:${userId}`);
      if (!raw) return null;
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (!parsed || parsed.userId !== userId || !parsed.data) return null;
      return parsed;
    } catch (error) {
      console.warn(`Could not read the saved ${page} page:`, error);
      return null;
    }
  }

  async function readAsync(page, userId) {
    if (!userId) return null;
    const syncResult = read(page, userId);
    if (syncResult) return syncResult;
    try {
      if (window.thubDB) {
        let entry = await window.thubDB.get(window.thubDB.STORES.PAGE_CACHE, pageDataKey(page, userId));
        if (!entry) {
          entry = await window.thubDB.get(window.thubDB.STORES.PAGE_CACHE, `${LEGACY_CACHE_PREFIX}${page}:${userId}`);
        }
        if (entry && entry.data) return entry;
      }
    } catch {}
    return null;
  }

  async function readLastAsync(page) {
    const syncResult = readLast(page);
    if (syncResult) return syncResult;
    try {
      let activeUserId = currentStoredUserId();
      if (!activeUserId && window.supabaseClient?.auth?.getSession) {
        const { data } = await window.supabaseClient.auth.getSession();
        activeUserId = data?.session?.user?.id || null;
      }
      if (!activeUserId) return null;
      if (window.thubDB) {
        let userId = await window.thubDB.get(window.thubDB.STORES.PAGE_CACHE, lastUserKey(page));
        if (!userId) {
          userId = await window.thubDB.get(window.thubDB.STORES.PAGE_CACHE, `${LEGACY_CACHE_PREFIX}${page}:last-user`);
        }
        if (userId && (typeof userId === "string" ? userId : userId.value || userId) === activeUserId) {
          return await readAsync(page, typeof userId === "string" ? userId : userId.value || userId);
        }
      }
    } catch {}
    return null;
  }

  function write(page, userId, data) {
    if (!userId) return;
    try {
      const payload = {
        userId,
        savedAt: Date.now(),
        data,
      };
      if (window.thubDB) {
        window.thubDB.setSync(window.thubDB.STORES.PAGE_CACHE, pageDataKey(page, userId), payload);
        window.thubDB.setSync(window.thubDB.STORES.PAGE_CACHE, lastUserKey(page), userId);
        window.thubDB.setSync(window.thubDB.STORES.PAGE_CACHE, `${LEGACY_CACHE_PREFIX}${page}:${userId}`, payload);
        window.thubDB.setSync(window.thubDB.STORES.PAGE_CACHE, `${LEGACY_CACHE_PREFIX}${page}:last-user`, userId);
      } else {
        const serialized = JSON.stringify(payload);
        localStorage.setItem(pageDataKey(page, userId), serialized);
        localStorage.setItem(lastUserKey(page), userId);
      }
    } catch (error) {
      console.warn(`Could not save the ${page} page locally:`, error);
    }
  }

  function clearLast(page) {
    try {
      if (window.thubDB) {
        window.thubDB.deleteSync(window.thubDB.STORES.PAGE_CACHE, lastUserKey(page));
        window.thubDB.deleteSync(window.thubDB.STORES.PAGE_CACHE, `${LEGACY_CACHE_PREFIX}${page}:last-user`);
      }
      localStorage.removeItem(lastUserKey(page));
      localStorage.removeItem(`${LEGACY_CACHE_PREFIX}${page}:last-user`);
    } catch (error) {
      console.warn(`Could not clear the saved ${page} page pointer:`, error);
    }
  }

  function clear(page, userId) {
    if (!page) return;
    try {
      if (userId) {
        const key = pageDataKey(page, userId);
        window.thubDB?.deleteSync(window.thubDB.STORES.PAGE_CACHE, key);
        window.thubDB?.deleteSync(window.thubDB.STORES.PAGE_CACHE, `${LEGACY_CACHE_PREFIX}${page}:${userId}`);
        localStorage.removeItem(key);
        localStorage.removeItem(`${LEGACY_CACHE_PREFIX}${page}:${userId}`);
      }
      clearLast(page);
    } catch (error) {
      console.warn(`Could not clear the saved ${page} page:`, error);
    }
  }

  function clearAll() {
    try {
      window.thubDB?.clearAll();
    } catch {}
    for (const storage of [localStorage, sessionStorage]) {
      try {
        for (let index = storage.length - 1; index >= 0; index -= 1) {
          const key = storage.key(index);
          if (
            key?.startsWith(CACHE_PREFIX) ||
            key?.startsWith(LEGACY_CACHE_PREFIX) ||
            key?.startsWith("thubLibraryBooksCatalog:") ||
            key?.startsWith("thubStudentBooksCatalog:") ||
            key?.startsWith("thubLibraryInventory:") ||
            key === "thubLibraryBooksAccess:v1" ||
            key === "thubStudentBooksAccess:v1"
          ) {
            storage.removeItem(key);
          }
        }
      } catch (error) {
        console.warn("Could not clear saved library page data:", error);
      }
    }
  }

  function persistExistingSessionCaches() {
    try {
      for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
        const key = sessionStorage.key(index);
        if (
          !key ||
          !(
            key.startsWith(CACHE_PREFIX) ||
            key.startsWith(LEGACY_CACHE_PREFIX) ||
            key.startsWith("thubLibraryBooksCatalog:") ||
            key.startsWith("thubStudentBooksCatalog:") ||
            key === "thubLibraryBooksAccess:v1" ||
            key === "thubStudentBooksAccess:v1"
          )
        )
          continue;

        const value = sessionStorage.getItem(key);
        if (value !== null) {
          try {
            const parsed = JSON.parse(value);
            window.thubDB?.setSync(window.thubDB.STORES.PAGE_CACHE, key, parsed);
          } catch {
            window.thubDB?.setSync(window.thubDB.STORES.PAGE_CACHE, key, value);
          }
        }
        sessionStorage.removeItem(key);
      }
    } catch (error) {
      console.warn("Could not preserve this tab's page cache:", error);
    }
  }

  persistExistingSessionCaches();

  const cacheApi = Object.freeze({
    read,
    readLast,
    readAsync,
    readLastAsync,
    write,
    clear,
    clearLast,
    clearAll,
  });
  window.libraryPageCache = cacheApi;
  window.studentPageCache = cacheApi;
  window.pageCache = cacheApi;

  window.supabaseClient?.auth?.onAuthStateChange((event) => {
    if (event === "SIGNED_OUT") clearAll();
  });
})();

// Add one consistent manual refresh action to librarian pages. A refresh clears
// only the current page's snapshot plus cached Supabase reads, then reloads it.
(function initLibrarianPageRefresh() {
  const pageCacheKeys = {
    "dashboard.html": ["dashboard"],
    "books.html": ["books"],
    "library.html": ["library"],
    "library-reports.html": ["library-reports"],
    "notifications.html": ["notifications"],
    "my-profile.html": ["my-profile"],
    "school-information.html": ["school-information"],
  };

  window.ensureLibrarianRefreshButton = function () {
    if (isLoginPage()) return;
    let button = document.getElementById("librarianPageRefresh");
    if (!button) {
      if (document.querySelector('main button[id^="refresh"], main button[aria-label*="Refresh"]')) return;
      const header = document.querySelector("main .topbar, main .notifications-header, main .page-header, main header") ||
        document.querySelector(".my-profiles-page .page-header, .settings-page .page-header");
      if (!header) return;
      button = document.createElement("button");
      button.type = "button";
      button.id = "librarianPageRefresh";
      button.className = "librarian-page-refresh";
      button.title = "Load the latest data";
      button.setAttribute("aria-label", "Refresh page data");
      button.innerHTML = '<i class="fa-solid fa-rotate" aria-hidden="true"></i><span>Refresh</span>';
      const adjacentActions = header.matches(".page-header") && header.nextElementSibling?.querySelector("button")
        ? header.nextElementSibling
        : null;
      const actions = header.querySelector(".topbar-actions, .dashboard-topbar-actions, .header-actions") || adjacentActions;
      (actions || header).appendChild(button);
    }

    // Use the button's property handler so the SPA router does not remove it
    // when it pauses the outgoing page's document listeners.
    button.onclick = async () => {
      if (button.disabled) return;
      const refreshStartedAt = performance.now();
      button.disabled = true;
      button.classList.add("is-refreshing");
      button.innerHTML = '<i class="fa-solid fa-rotate fa-spin" aria-hidden="true"></i><span>Refreshing...</span>';
      try {
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const page = location.pathname.split("/").pop();
        const { data } = await window.supabaseClient?.auth?.getSession?.() || {};
        const userId = data?.session?.user?.id;
        (pageCacheKeys[page] || []).forEach((key) => window.libraryPageCache?.clear(key, userId));
        window.clearSupabaseReadCache?.();
        // Keep the changed label visible long enough to register before navigation.
        const remainingFeedbackTime = 600 - (performance.now() - refreshStartedAt);
        if (remainingFeedbackTime > 0) {
          await new Promise((resolve) => setTimeout(resolve, remainingFeedbackTime));
        }
        location.reload();
      } catch (error) {
        console.error("Could not refresh librarian page data:", error);
        button.disabled = false;
        button.classList.remove("is-refreshing");
        button.innerHTML = '<i class="fa-solid fa-rotate" aria-hidden="true"></i><span>Refresh</span>';
      }
    };
  };

  window.ensureLibrarianSidebarControls = function () {
    const sidebar = document.querySelector(".sidebar");
    const overlay = document.getElementById("sidebarOverlay");
    const menuToggle = document.getElementById("menuToggle");
    if (!sidebar || !overlay || !menuToggle) return;

    menuToggle.onclick = () => {
      sidebar.classList.toggle("active");
      overlay.classList.toggle("active");
    };
    overlay.onclick = () => {
      sidebar.classList.remove("active");
      overlay.classList.remove("active");
    };
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", window.ensureLibrarianRefreshButton);
  } else {
    window.ensureLibrarianRefreshButton();
  }
})();
async function checkPageAccess() {
  if (isLoginPage() || !window.supabaseClient) return;
  const authCtx = await window.getAuthContext();
  if (!authCtx?.user) {
    await window.forceLogout();
    return;
  }
  const accountStatus = String(authCtx?.profile?.status || "active").trim().toLowerCase();
  if (accountStatus !== "active") {
    await window.forceLogout();
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const sidebar = document.querySelector(".sidebar");
  const overlay = document.getElementById("sidebarOverlay");

  function closeMenu() {
    sidebar?.classList.remove("active");
    overlay?.classList.remove("active");
  }

  window.ensureLibrarianSidebarControls?.();

  document.querySelectorAll(".menu a").forEach((link) => {
    link.addEventListener("click", (e) => {
      closeMenu();
      const href = link.getAttribute("href");
      if (!href || href === "#") return;
      try {
        const targetPath = new URL(link.href, location.href).pathname.split("/").pop();
        const currentPath = location.pathname.split("/").pop();
        if (targetPath && targetPath === currentPath) {
          e.preventDefault();
        }
      } catch {
        // ignore url parsing error
      }
    });
  });

  document.addEventListener(
    "error",
    (event) => {
      const image = event.target;
      if (
        image instanceof HTMLImageElement &&
        image.matches(
          ".student-photo, .teacher-photo, .systemUser-photo, .app-person-avatar, #profileAvatar, .view-student-photo, .view-teacher-photo",
        ) &&
        image.src !== window.DEFAULT_PROFILE_AVATAR
      ) {
        image.src = window.DEFAULT_PROFILE_AVATAR;
      }
    },
    true,
  );

  const modalIds = [
    "periodModal",
    "editPeriodModal",
    "editSystemUserModal",
    "systemUserModal",
    "editSubjectModal",
    "subjectModal",
    "structureModal",
    "editStructureModal",
    "viewStructureModal",
    "termModal",
    "editTermModal",
    "editDepartmentModal",
    "departmentModal",
    "classModal",
    "editClassModal",
    "academicYearModal",
    "editAcademicYearModal",
  ];

  document.addEventListener("click", (event) => {
    modalIds.forEach((id) => {
      const modal = document.getElementById(id);
      if (modal && event.target === modal) {
        modal.classList.remove("active");
        unLockBodyScroll();
      }
    });
  });

  if (!window.supabaseClient) return;

  await loadHeaderSchoolLogo();

  const authCtx = await window.getAuthContext();
  if (typeof renderNavigation === "function") {
    renderNavigation(authCtx?.profile?.role || null);
  }
});

async function loadHeaderSchoolLogo() {
  const logoImg = document.getElementById("appHeaderLogo");
  if (!logoImg || !window.supabaseClient) return;

  const DEFAULT_AVATAR =
    "https://api.dicebear.com/7.x/initials/svg?seed=School";

  try {
    const authCtx = await window.getAuthContext();
    if (!authCtx?.user) return;

    let schoolNameEl = document.querySelector(".sidebar-school-name");
    const logo = logoImg.closest(".logo");
    if (logo) {
      if (!schoolNameEl) {
        schoolNameEl = document.createElement("p");
        schoolNameEl.className = "sidebar-school-name";
        schoolNameEl.setAttribute("aria-live", "polite");
        logo.insertAdjacentElement("afterend", schoolNameEl);
      }
      schoolNameEl.textContent = "";
      schoolNameEl.hidden = true;
    }

    if (!authCtx.profile?.school_id) {
      logoImg.src = DEFAULT_AVATAR;
      return;
    }

    const { data, error } = await window.supabaseClient
      .from("schools")
      .select("school_name, logo_url")
      .eq("id", authCtx.profile.school_id)
      .maybeSingle();

    if (error) {
      console.error("Could not load the signed-in user's school:", error);
      logoImg.src = DEFAULT_AVATAR;
      return;
    }

    logoImg.src = data?.logo_url ? data.logo_url : DEFAULT_AVATAR;
    if (schoolNameEl) {
      schoolNameEl.textContent = data?.school_name || "";
      schoolNameEl.hidden = !data?.school_name;
    }
  } catch (err) {
    console.error("Unexpected error loading header logo:", err);
    logoImg.src = DEFAULT_AVATAR;
  }
}

window.addEventListener("pageshow", async (event) => {
  if (
    event.persisted ||
    (window.performance && window.performance.navigation.type === 2)
  ) {
    if (!window.supabaseClient) return;

    if (isLoginPage()) {
      document.body.classList.add("login-auth-checking");
    }

    window.clearAuthContext?.();
    const authCtx = await window.getAuthContext(true);
    const user = authCtx?.user;
    const profile = authCtx?.profile;

    if (isLoginPage()) {
      if (user) {
        const destination =
          String(profile?.role || "").toLowerCase() === "parent"
            ? "/html/parent-dashboard.html"
            : "/html/dashboard.html";
        window.location.replace(destination);
        return;
      }
      document.body.classList.remove("login-auth-checking");
    }

    if (!isLoginPage() && !user) {
      await window.forceLogout();
      return;
    }

    // Librarian-only app: no per-page role restrictions needed.
  }
});

(async function initPageGuard() {
  if (document.readyState === "loading") {
    await new Promise((resolve) =>
      document.addEventListener("DOMContentLoaded", resolve),
    );
  }

  const path = window.location.pathname.toLowerCase();
  const isLogin =
    path.endsWith("index.html") || path === "/" || path.endsWith("/login.html");

  if (!window.supabaseClient) {
    console.error("Supabase client not initialized in window.supabaseClient");
    if (!isLogin)
      window.location.replace("/index.html?error=service_unavailable");
    return;
  }

  const authCtx = await window.getAuthContext();
  const user = authCtx?.user;

  if (!isLogin && !user) {
    console.warn("Session expired or invalid user. Redirecting to login...");
    await window.supabaseClient.auth.signOut();
    window.clearAuthContext?.();
    localStorage.clear();
    sessionStorage.clear();
    window.location.replace("/index.html");
    return;
  }

  window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
    if ((event === "SIGNED_OUT" || !session) && !isLogin) {
      window.clearAuthContext?.();
      localStorage.clear();
      sessionStorage.clear();
      window.location.replace("/index.html");
    }
  });
})();

window.initAuthListener = async function (supabase) {
  if (!supabase) return;

  const path = window.location.pathname.toLowerCase();
  const isLogin =
    path.endsWith("index.html") || path === "/" || path.endsWith("/login.html");

  const authCtx = await window.getAuthContext();
  const user = authCtx?.user;

  if (!isLogin && !user) {
    await supabase.auth.signOut();
    window.clearAuthContext?.();
    localStorage.clear();
    sessionStorage.clear();
    window.location.replace("/index.html");
    return;
  }

  supabase.auth.onAuthStateChange(async (event, session) => {
    if ((event === "SIGNED_OUT" || !session) && !isLogin) {
      window.clearAuthContext?.();
      localStorage.clear();
      sessionStorage.clear();
      window.location.replace("/index.html");
    }
  });
};

window.escapeHTML = function (str) {
  if (str === null || str === undefined) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
};

function escapeAttribute(str) {
  if (!str) return "";
  return String(str)
    .replace(/\\/g, "\\\\")
    .replace(/'/g, "\\'")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
document.addEventListener("DOMContentLoaded", () => {
  if (window.supabaseClient?.auth) {
    window.supabaseClient.auth.onAuthStateChange(async (event, session) => {
      const isLoginPage =
        window.location.pathname.endsWith("index.html") ||
        window.location.pathname === "/";
      if (isLoginPage) return;

      if (session?.user) {
        const { data: profile, error } = await window.supabaseClient
          .from("profiles")
          .select("status")
          .eq("id", session.user.id)
          .maybeSingle();

        if (error || !profile || profile.status !== "active") {
          await window.supabaseClient.auth.signOut();
          localStorage.clear();
          sessionStorage.clear();
          window.location.replace("/index.html?error=account_disabled");
        }
      }
    });
  }
});

async function logActivity(
  schoolId,
  description,
  color,
  targetAudience = "Everyone",
) {
  const { error } = await window.supabaseClient
    .from("recent_activities")
    .insert([
      {
        school_id: schoolId,
        message: description,
        dot_color: color,
        target_audience: targetAudience,
      },
    ]);

  if (error) console.error("Error logging activity:", error);
}

async function loadRecentActivities(schoolId) {
  const listContainer = document.getElementById("recentActivitiesList");
  if (!listContainer) return;

  try {
    const { data: activities, error } = await window.supabaseClient
      .from("recent_activities")
      .select("message, dot_color, created_at")
      .eq("school_id", schoolId)
      .order("created_at", { ascending: false })
      .limit(5);

    if (!error && activities && activities.length > 0) {
      listContainer.innerHTML = activities
        .map(
          (act) => `
  <li>
  <i class="fas fa-bullhorn fa-2x dashboard-icon ${/^(green|blue|red|yellow|orange)$/.test(act.dot_color) ? act.dot_color : "green"}"></i>
  ${escapeHTML(act.message || "")}
</li>
      `,
        )
        .join("");
    } else {
      listContainer.innerHTML = `
        <div class="empty-state">
          <i class="fas fa-bullhorn fa-10x"></i>
          <p>No recent activities found</p>
        </div>
      `;
    }
  } catch (err) {
    console.error("Error loading recent activities:", err);
  }
}

async function subscribeToRecentActivities(schoolId, userRole) {
  const existingChannel = window.supabaseClient
    .getChannels()
    .find((c) => c.topic === "realtime:public:recent_activities");

  if (existingChannel) {
    await window.supabaseClient.removeChannel(existingChannel);
  }

  window.supabaseClient
    .channel("public:recent_activities")
    .on(
      "postgres_changes",
      {
        event: "INSERT",
        schema: "public",
        table: "recent_activities",
        filter: `school_id=eq.${schoolId}`,
      },
      (payload) => {
        const activity = payload.new;
        const targetAudience = activity.target_audience || "Everyone";

        const allowedAudiences = targetAudience.split(",").map((a) => a.trim());

        if (
          allowedAudiences.includes("Everyone") ||
          allowedAudiences.includes("All") ||
          allowedAudiences.includes(userRole)
        ) {
          prependActivityToUI(activity);
        }
      },
    )
    .subscribe();
}

function getAssessmentPeriodNumber(name) {
  const value = String(name || "").trim().toLowerCase();
  const wordNumbers = {
    first: 1,
    one: 1,
    second: 2,
    two: 2,
    third: 3,
    three: 3,
    fourth: 4,
    four: 4,
    fifth: 5,
    five: 5,
    sixth: 6,
    six: 6,
  };
  const match =
    value.match(/\bperiod\s*(\d+|first|one|second|two|third|three|fourth|four|fifth|five|sixth|six)\b/) ||
    value.match(/\b(\d+)(?:st|nd|rd|th)?\s*period\b/) ||
    value.match(/\b(first|one|second|two|third|three|fourth|four|fifth|five|sixth|six)\s+period\b/);
  if (!match) return null;

  const token = match[1] ?? match[0].match(/\d+|first|one|second|two|third|three|fourth|four|fifth|five|sixth|six/)?.[0];
  const number = /^\d+$/.test(token) ? Number(token) : wordNumbers[token];
  return Number.isInteger(number) ? number : null;
}

function getAssessmentPeriodKey(name) {
  const number = getAssessmentPeriodNumber(name);
  if (number !== null) return `period-${number}`;
  return `name-${String(name || "").trim().toLocaleLowerCase()}`;
}

function getAssessmentPeriodLabel(name) {
  const number = getAssessmentPeriodNumber(name);
  if (number === null) return String(name || "Assessment period");
  const suffix =
    number % 100 >= 11 && number % 100 <= 13
      ? "th"
      : { 1: "st", 2: "nd", 3: "rd" }[number % 10] || "th";
  return `${number}${suffix} Period`;
}

function groupAssessmentPeriods(assessments) {
  const groups = new Map();
  (assessments || []).forEach((assessment) => {
    if (!assessment?.id || !assessment?.name) return;
    const number = getAssessmentPeriodNumber(assessment.name);
    if (number !== null && (number < 1 || number > 6)) return;

    const key = getAssessmentPeriodKey(assessment.name);
    const group = groups.get(key) || {
      key,
      number,
      label: getAssessmentPeriodLabel(assessment.name),
      ids: [],
    };
    const id = String(assessment.id);
    if (!group.ids.includes(id)) group.ids.push(id);
    groups.set(key, group);
  });

  return [...groups.values()]
    .sort((a, b) => {
      if (a.number !== null && b.number !== null) return a.number - b.number;
      if (a.number !== null) return -1;
      if (b.number !== null) return 1;
      return a.label.localeCompare(b.label, undefined, { sensitivity: "base" });
    })
    .slice(0, 6);
}

function setAssessmentPeriodOptions(
  select,
  assessments,
  placeholder,
  placeholderValue = "",
) {
  if (!select) return;
  const previousValue = select.value;
  select.replaceChildren(new Option(placeholder, placeholderValue));
  groupAssessmentPeriods(assessments).forEach((group) => {
    select.add(new Option(group.label, JSON.stringify(group.ids)));
  });
  if ([...select.options].some((option) => option.value === previousValue)) {
    select.value = previousValue;
  }
}

function parseAssessmentPeriodIds(value) {
  if (!value) return [];
  try {
    const ids = JSON.parse(value);
    return Array.isArray(ids) ? ids.map(String) : [String(value)];
  } catch {
    return [String(value)];
  }
}

const AUTH_WELCOME_STARTED_AT_KEY = "tHubAuthWelcomeStartedAt";
let authWelcomeCompletionPromise = null;

window.beginAuthWelcome = function () {
  document.documentElement.classList.add("auth-welcome-open");
  try {
    if (!sessionStorage.getItem(AUTH_WELCOME_STARTED_AT_KEY)) {
      sessionStorage.setItem(AUTH_WELCOME_STARTED_AT_KEY, String(Date.now()));
    }
  } catch (error) {
    console.warn("Could not record the welcome screen start time:", error);
  }
};

window.clearAuthWelcome = function () {
  document.documentElement.classList.remove("auth-welcome-open");
  try {
    sessionStorage.removeItem(AUTH_WELCOME_STARTED_AT_KEY);
  } catch (error) {
    console.warn("Could not clear the welcome screen start time:", error);
  }
};

window.completeAuthWelcome = function () {
  if (authWelcomeCompletionPromise) return authWelcomeCompletionPromise;

  let startedAt = 0;
  try {
    startedAt = Number(sessionStorage.getItem(AUTH_WELCOME_STARTED_AT_KEY)) || 0;
  } catch (error) {
    console.warn("Could not read the welcome screen start time:", error);
  }
  if (!startedAt) return Promise.resolve();

  const remainingMs = Math.max(0, 5000 - (Date.now() - startedAt));
  authWelcomeCompletionPromise = new Promise((resolve) => {
    window.setTimeout(resolve, remainingMs);
  }).finally(() => {
    window.clearAuthWelcome();
    authWelcomeCompletionPromise = null;
  });
  return authWelcomeCompletionPromise;
};

function prependActivityToUI(activity) {
  const listContainer = document.getElementById("recentActivitiesList");
  if (!listContainer) return;

  if (listContainer.innerHTML.includes("No recent activities")) {
    listContainer.innerHTML = "";
  }

  const li = document.createElement("li");
  li.innerHTML = `
    <span class="dashboard-dot ${/^(green|blue|red|yellow|orange)$/.test(activity.dot_color) ? activity.dot_color : "green"}"></span>
    ${escapeHTML(activity.message || "")}
  `;

  listContainer.prepend(li);

  const items = listContainer.getElementsByTagName("li");
  if (items.length > 5) {
    listContainer.removeChild(items[items.length - 1]);
  }
}

window.sendNotification = async function (
  schoolId,
  userId,
  title,
  message,
  type = "general",
) {
  try {
    const payload = {
      user_id: userId,
      title: title,
      message: message,
      type: type,
      is_read: false,
    };

    if (schoolId) {
      payload.school_id = schoolId;
    }

    const { data, error } = await window.supabaseClient
      .from("notifications")
      .insert([payload]);

    if (error) throw error;
    return { success: true, data };
  } catch (err) {
    console.error("Failed to send notification:", err);
    return { success: false, error: err };
  }
};

// Load the client-side router before page-specific scripts when the document
// is still being parsed. That lets it manage each page's existing listeners.
(function loadSPARouter() {
  if (window.SPARouter || window.__spaRouterLoading) return;
  window.__spaRouterLoading = true;

  if (document.readyState === "loading" && document.currentScript) {
    document.write('<script src="/js/spa-router.js"><\/script>');
    return;
  }

  const routerScript = document.createElement("script");
  routerScript.src = "/js/spa-router.js";
  document.head.appendChild(routerScript);
})();
