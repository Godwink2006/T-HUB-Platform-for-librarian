let allCatalogBooks = [];
const BOOKS_PAGE_SIZE = 12;
const BOOKS_CACHE_PREFIX = "thubLibraryBooksCatalog:v2:";
const BOOKS_LAST_ACCESS_KEY = "thubLibraryBooksAccess:v1";
const LEGACY_BOOKS_CACHE_PREFIX = "thubStudentBooksCatalog:v2:";
const LEGACY_BOOKS_LAST_ACCESS_KEY = "thubStudentBooksAccess:v1";
let booksOffset = 0;
let booksHasMore = false;
let booksLoading = false;
let booksAccessLoading = false;
let booksAccessVerified = false;
let booksCacheKey = "";
let booksUserId = "";
let booksSchoolId = "";
let booksCacheRestored = false;

function readBooksCache() {
  if (!booksCacheKey) return null;
  try {
    const cached =
      window.thubDB?.getSync(window.thubDB.STORES.BOOKS_CACHE, booksCacheKey) ||
      window.thubDB?.getSync(
        window.thubDB.STORES.BOOKS_CACHE,
        booksCacheKey.replace(BOOKS_CACHE_PREFIX, LEGACY_BOOKS_CACHE_PREFIX),
      );
    if (cached && Array.isArray(cached.books)) return cached;

    const raw =
      localStorage.getItem(booksCacheKey) ||
      localStorage.getItem(booksCacheKey.replace(BOOKS_CACHE_PREFIX, LEGACY_BOOKS_CACHE_PREFIX));
    const parsed = typeof raw === "string" ? JSON.parse(raw || "null") : raw;
    if (!parsed || !Array.isArray(parsed.books)) return null;
    return parsed;
  } catch (error) {
    console.warn("Could not read the saved books catalog:", error);
    return null;
  }
}

async function readBooksCacheAsync() {
  const syncVal = readBooksCache();
  if (syncVal) return syncVal;
  if (!booksCacheKey || !window.thubDB) return null;
  try {
    let cached = await window.thubDB.get(window.thubDB.STORES.BOOKS_CACHE, booksCacheKey);
    if (!cached) {
      cached = await window.thubDB.get(
        window.thubDB.STORES.BOOKS_CACHE,
        booksCacheKey.replace(BOOKS_CACHE_PREFIX, LEGACY_BOOKS_CACHE_PREFIX),
      );
    }
    if (cached && Array.isArray(cached.books)) return cached;
  } catch (error) {
    console.warn("Could not read async saved books catalog from IndexedDB:", error);
  }
  return null;
}

function saveBooksCache() {
  if (!booksCacheKey) return;
  try {
    const payload = {
      savedAt: Date.now(),
      userId: booksUserId,
      schoolId: booksSchoolId,
      books: allCatalogBooks,
      hasMore: booksHasMore,
    };
    if (window.thubDB) {
      window.thubDB.setSync(window.thubDB.STORES.BOOKS_CACHE, booksCacheKey, payload);
      window.thubDB.setSync(
        window.thubDB.STORES.BOOKS_CACHE,
        booksCacheKey.replace(BOOKS_CACHE_PREFIX, LEGACY_BOOKS_CACHE_PREFIX),
        payload,
      );
    } else {
      const serialized = JSON.stringify(payload);
      localStorage.setItem(booksCacheKey, serialized);
    }
  } catch (error) {
    console.warn("Could not save the books catalog locally:", error);
  }
}

function saveBooksAccess() {
  if (!booksUserId) return;
  try {
    const payload = {
      userId: booksUserId,
      schoolId: booksSchoolId,
      cacheKey: booksCacheKey,
    };
    if (window.thubDB) {
      window.thubDB.setSync(window.thubDB.STORES.BOOKS_CACHE, BOOKS_LAST_ACCESS_KEY, payload);
      window.thubDB.setSync(window.thubDB.STORES.BOOKS_CACHE, LEGACY_BOOKS_LAST_ACCESS_KEY, payload);
    } else {
      const serialized = JSON.stringify(payload);
      localStorage.setItem(BOOKS_LAST_ACCESS_KEY, serialized);
    }
  } catch (error) {
    console.warn("Could not save librarian catalog access locally:", error);
  }
}

function restoreCachedBooksPage() {
  try {
    const savedAccess =
      window.thubDB?.getSync(window.thubDB.STORES.BOOKS_CACHE, BOOKS_LAST_ACCESS_KEY) ||
      window.thubDB?.getSync(window.thubDB.STORES.BOOKS_CACHE, LEGACY_BOOKS_LAST_ACCESS_KEY) ||
      JSON.parse(
        localStorage.getItem(BOOKS_LAST_ACCESS_KEY) ||
          localStorage.getItem(LEGACY_BOOKS_LAST_ACCESS_KEY) ||
          "null",
      );
    const savedUserId = savedAccess?.userId || savedAccess?.studentId;
    if (!savedUserId) return false;

    booksUserId = savedUserId;
    booksSchoolId = savedAccess.schoolId || "";
    booksCacheKey = `${BOOKS_CACHE_PREFIX}${booksUserId}:${booksSchoolId || "no-school"}`;

    const cachedCatalog = readBooksCache();
    if (!cachedCatalog || (cachedCatalog.userId && cachedCatalog.userId !== booksUserId)) {
      return false;
    }

    allCatalogBooks = cachedCatalog.books;
    booksOffset = allCatalogBooks.length;
    booksHasMore = cachedCatalog.hasMore === true;
    booksCacheRestored = true;

    const catalog = document.getElementById("booksCatalog");
    const mainContent = document.querySelector(".books-main-content, .students-main-content");
    if (catalog) catalog.hidden = false;
    mainContent?.classList.remove("books-access-checking");

    const query =
      document.getElementById("catalogSearchInput")?.value.toLowerCase().trim() || "";
    renderBookCards(filterCatalogBooks(query));
    updateBooksNextButton();
    return true;
  } catch (error) {
    console.warn("Could not restore the saved Books page:", error);
    return false;
  }
}

async function restoreCachedBooksPageAsync() {
  if (booksCacheRestored && allCatalogBooks.length > 0) return true;
  try {
    let savedAccess =
      window.thubDB?.getSync(window.thubDB.STORES.BOOKS_CACHE, BOOKS_LAST_ACCESS_KEY) ||
      window.thubDB?.getSync(window.thubDB.STORES.BOOKS_CACHE, LEGACY_BOOKS_LAST_ACCESS_KEY);
    if (!savedAccess && window.thubDB) {
      savedAccess = await window.thubDB.get(window.thubDB.STORES.BOOKS_CACHE, BOOKS_LAST_ACCESS_KEY);
      if (!savedAccess) {
        savedAccess = await window.thubDB.get(window.thubDB.STORES.BOOKS_CACHE, LEGACY_BOOKS_LAST_ACCESS_KEY);
      }
    }
    if (!savedAccess) {
      try {
        savedAccess = JSON.parse(
          localStorage.getItem(BOOKS_LAST_ACCESS_KEY) ||
            localStorage.getItem(LEGACY_BOOKS_LAST_ACCESS_KEY) ||
            "null",
        );
      } catch {}
    }

    const savedUserId = savedAccess?.userId || savedAccess?.studentId;
    if (!savedUserId) return false;

    booksUserId = savedUserId;
    booksSchoolId = savedAccess.schoolId || "";
    booksCacheKey = `${BOOKS_CACHE_PREFIX}${booksUserId}:${booksSchoolId || "no-school"}`;

    const cachedCatalog = await readBooksCacheAsync();
    if (!cachedCatalog || !Array.isArray(cachedCatalog.books) || cachedCatalog.books.length === 0) {
      return false;
    }

    if (cachedCatalog.userId && cachedCatalog.userId !== booksUserId) {
      return false;
    }

    allCatalogBooks = cachedCatalog.books;
    booksOffset = allCatalogBooks.length;
    booksHasMore = cachedCatalog.hasMore === true;
    booksCacheRestored = true;

    const catalog = document.getElementById("booksCatalog");
    const mainContent = document.querySelector(".books-main-content, .students-main-content");
    if (catalog) catalog.hidden = false;
    mainContent?.classList.remove("books-access-checking");

    const query =
      document.getElementById("catalogSearchInput")?.value.toLowerCase().trim() || "";
    renderBookCards(filterCatalogBooks(query));
    updateBooksNextButton();
    return true;
  } catch (error) {
    console.warn("Could not async restore the saved Books page:", error);
    return false;
  }
}

function updateBooksNextButton() {
  const nextButton = document.getElementById("nextBooksPage");
  if (!nextButton) return;
  nextButton.hidden = !booksHasMore;
  nextButton.disabled = false;
  nextButton.textContent = "Next";
}

function booksErrorMessage(error, action = "load") {
  const backendMessage = window.getSupabaseErrorMessage?.(error, "");
  if (backendMessage) return backendMessage;

  const code = String(error?.code || "").toLowerCase();
  const status = Number(error?.status || error?.statusCode || 0);
  const diagnostic = `${code} ${error?.message || ""} ${error?.details || ""} ${error?.hint || ""}`.toLowerCase();

  if (diagnostic.includes("jwt") || status === 401) {
    return "Your sign-in session expired. Please refresh the page and sign in again.";
  }
  if (diagnostic.includes("network") || diagnostic.includes("fetch failed") || diagnostic.includes("failed to fetch")) {
    return "Could not reach the database. Check your internet connection and try again.";
  }
  if (status === 403 || diagnostic.includes("permission denied") || diagnostic.includes("row-level security")) {
    return "You do not have permission to view this library catalog.";
  }
  if (action === "history") {
    return "Could not load borrowing records for this book. Please try again.";
  }
  return error?.message || "Could not load the library catalog. Please try again.";
}

function showBooksNotice(message, type = "info", onRetry = null) {
  const notice = document.getElementById("booksPageNotice");
  if (!notice) return;

  notice.dataset.type = type;
  notice.replaceChildren();

  const icon = document.createElement("i");
  icon.className =
    type === "error"
      ? "fa-solid fa-triangle-exclamation"
      : "fa-solid fa-circle-info";
  icon.setAttribute("aria-hidden", "true");

  const content = document.createElement("div");
  content.className = "books-notice-content";

  const p = document.createElement("p");
  p.textContent = message;
  content.appendChild(p);

  if (typeof onRetry === "function") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Try again";
    button.addEventListener("click", onRetry, { once: true });
    content.appendChild(button);
  }

  notice.append(icon, content);
  notice.hidden = false;
}

function hideBooksNotice() {
  const notice = document.getElementById("booksPageNotice");
  if (notice) {
    notice.hidden = true;
    notice.replaceChildren();
    delete notice.dataset.type;
  }
}

function showBooksCatalogLoading() {
  const gridContainer = document.getElementById("bookCardGrid");
  if (!gridContainer) return;
  gridContainer.innerHTML = `
    <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: #64748b;">
      <i class="fa-solid fa-spinner fa-spin" style="margin-right: 0.5rem; font-size: 1.2rem;"></i>
      Loading library catalog...
    </div>
  `;
}

async function initializeBooksPage(options = {}) {
  if (booksAccessLoading) return;
  const forceCatalogRefresh = options.forceCatalogRefresh === true;
  const cachedUserId = booksUserId;
  const cachedSchoolId = booksSchoolId;
  let matchingCachedCatalog = false;
  booksAccessLoading = true;
  hideBooksNotice();

  const refreshButton = document.getElementById("refreshBooksCatalog");
  const catalog = document.getElementById("booksCatalog");
  const mainContent = document.querySelector(".books-main-content, .students-main-content");

  if (allCatalogBooks.length === 0) showBooksCatalogLoading();
  if (!booksCacheRestored && catalog) catalog.hidden = true;
  if (!booksCacheRestored) mainContent?.classList.add("books-access-checking");

  if (forceCatalogRefresh && refreshButton) {
    refreshButton.disabled = true;
    refreshButton.innerHTML =
      '<i class="fa-solid fa-spinner fa-spin" aria-hidden="true"></i><span>Refreshing...</span>';
  }

  try {
    if (!window.supabaseClient) throw new Error("The database client is unavailable.");
    const { data: authData, error: authError } = await window.supabaseClient.auth.getUser();
    if (authError) throw authError;
    if (!authData?.user?.id) {
      const error = new Error("Your session has expired. Please sign in again.");
      error.status = 401;
      throw error;
    }

    matchingCachedCatalog = booksCacheRestored && cachedUserId === authData.user.id;

    const { data: profile, error: profileError } = await window.supabaseClient
      .from("profiles")
      .select("id, role, school_id, full_name")
      .eq("id", authData.user.id)
      .maybeSingle();

    if (profileError) throw profileError;

    const role = String(profile?.role || "").trim().toLowerCase();
    const isLibrarian = ["librarian", "admin", "super_admin", "staff"].includes(role);
    if (profile && !isLibrarian) {
      throw new Error("The library catalog is accessible to librarian and staff accounts only.");
    }

    booksUserId = authData.user.id;
    booksSchoolId = profile?.school_id || "";
    matchingCachedCatalog = matchingCachedCatalog && cachedSchoolId === booksSchoolId;
    booksCacheKey = `${BOOKS_CACHE_PREFIX}${booksUserId}:${booksSchoolId || "no-school"}`;
    booksAccessVerified = true;

    saveBooksAccess();
    mainContent?.classList.remove("books-access-checking");
    if (catalog) catalog.hidden = false;

    if (matchingCachedCatalog && !forceCatalogRefresh) {
      saveBooksCache();
      updateBooksNextButton();
      return;
    }

    await loadBookCatalog({
      preserveCurrent: forceCatalogRefresh && allCatalogBooks.length > 0,
    });
  } catch (error) {
    console.error("Could not determine Books page access:", error);
    mainContent?.classList.remove("books-access-checking");
    showBooksNotice(booksErrorMessage(error), "error", () =>
      initializeBooksPage({ forceCatalogRefresh: true }),
    );
  } finally {
    booksAccessLoading = false;
    if (forceCatalogRefresh && refreshButton) {
      refreshButton.disabled = false;
      refreshButton.innerHTML =
        '<i class="fa-solid fa-rotate" aria-hidden="true"></i><span>Refresh</span>';
    }
  }
}

async function loadBookCatalog(options = {}) {
  const gridContainer = document.getElementById("bookCardGrid");
  if (!gridContainer) return;
  const append = options.append === true;
  const preserveCurrent = options.preserveCurrent === true && !append;
  const nextButton = document.getElementById("nextBooksPage");

  if (booksLoading || (append && !booksHasMore)) return;
  booksLoading = true;

  if (!append && !preserveCurrent) {
    booksOffset = 0;
    booksHasMore = false;
    allCatalogBooks = [];
    if (nextButton) {
      nextButton.hidden = true;
      nextButton.disabled = false;
      nextButton.textContent = "Next";
    }
    showBooksCatalogLoading();
  } else if (nextButton) {
    nextButton.disabled = true;
    nextButton.textContent = "Loading...";
  }
  hideBooksNotice();

  try {
    const queryOffset = append ? booksOffset : 0;
    let query = window.supabaseClient
      .from("books")
      .select(`
        *,
        departments ( name )
      `);

    if (booksSchoolId) {
      query = query.eq("school_id", booksSchoolId);
    }

    query = query
      .order("title", { ascending: true })
      .order("id", { ascending: true })
      .range(queryOffset, queryOffset + BOOKS_PAGE_SIZE);

    const { data: page, error } = await query;
    if (error) throw error;

    const books = page || [];
    const visibleBooks = books.slice(0, BOOKS_PAGE_SIZE);
    booksHasMore = books.length > BOOKS_PAGE_SIZE;

    if (visibleBooks.length === 0) {
      if (!append) {
        allCatalogBooks = [];
        booksOffset = 0;
        renderBookCards([]);
      }
      saveBooksCache();
      return;
    }

    booksOffset = queryOffset + visibleBooks.length;
    const catalogPage = visibleBooks.map((book) => ({
      ...book,
      available_copies: getAvailableBookCopies(book),
    }));

    allCatalogBooks = append ? allCatalogBooks.concat(catalogPage) : catalogPage;
    saveBooksCache();

    const currentSearch =
      document.getElementById("catalogSearchInput")?.value.toLowerCase().trim() || "";
    renderBookCards(filterCatalogBooks(currentSearch));
  } catch (err) {
    console.error("Error loading catalog:", err);
    showBooksNotice(booksErrorMessage(err), "error", () => loadBookCatalog({ append }));
    if (!append && !preserveCurrent) {
      gridContainer.replaceChildren();
    }
  } finally {
    booksLoading = false;
    updateBooksNextButton();
  }
}

function filterCatalogBooks(query) {
  if (!query) return allCatalogBooks;
  return allCatalogBooks.filter((book) => {
    const title = (book.title || "").toLowerCase();
    const author = (book.author || "").toLowerCase();
    const dept = (book.departments?.name || "").toLowerCase();
    const code = (book.book_code || "").toLowerCase();
    const shelf = (book.shelf_location || "").toLowerCase();

    return (
      title.includes(query) ||
      author.includes(query) ||
      dept.includes(query) ||
      code.includes(query) ||
      shelf.includes(query)
    );
  });
}

function getAvailableBookCopies(book) {
  const availableCopies = Number(book.available_copies);
  if (!Number.isFinite(availableCopies)) return 0;
  return Math.max(0, Math.floor(availableCopies));
}

function renderBookCards(booksToRender) {
  const gridContainer = document.getElementById("bookCardGrid");
  if (!gridContainer) return;

  gridContainer.innerHTML = "";

  if (!booksToRender || booksToRender.length === 0) {
    gridContainer.innerHTML = `
      <div style="grid-column: 1 / -1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 5rem 2rem; min-height: 250px; text-align: center; color: #64748b;">
        <i class="fa-solid fa-book-open" style="font-size: 6rem; margin-bottom: 1rem; color: #cbd5e1; display: block;"></i>
        <span style="font-size: 1.1rem; font-weight: 700; color: #334155;">No books found in the library catalog.</span>
        <p style="font-size: 0.9rem; color: #64748b; margin-top: 0.5rem;">Try adjusting your search or add books from the Inventory & Circulation page.</p>
      </div>
    `;
    return;
  }

  booksToRender.forEach((book) => {
    const card = document.createElement("div");
    card.className = "book-card";

    const coverSrc =
      book.cover_image_url ||
      "https://cdn-icons-png.flaticon.com/512/29/29302.png";
    const departmentName = book.departments ? book.departments.name : "General";
    const availableCopies = Number(book.available_copies) || 0;
    const totalCopies = Number(book.total_copies) || 0;

    const isAvailable = availableCopies > 0;
    const badgeClass = isAvailable ? "badge-available" : "badge-unavailable";
    const badgeText = isAvailable
      ? `${availableCopies} Available`
      : "Out of Stock";

    card.innerHTML = `
      <div class="book-card-img-wrapper">
        <span class="book-card-badge ${badgeClass}">${badgeText}</span>
        <img
          src="${escapeHtml(coverSrc)}"
          alt="${escapeHtml(book.title)}"
          onerror="this.onerror=null; this.src='https://cdn-icons-png.flaticon.com/512/149/149071.png';"
        />
      </div>
      <div class="book-card-body">
        <span class="book-card-category">${escapeHtml(departmentName)}</span>
        <h3 class="book-card-title">${escapeHtml(book.title)}</h3>
        <p class="book-card-author">By ${escapeHtml(book.author || "Unknown")}</p>
        <div class="book-card-meta-line" style="font-size:0.8rem; color:#64748b; margin-bottom: 0.5rem;">
          <span>Code: <strong>${escapeHtml(book.book_code || "-")}</strong></span> &bull; 
          <span>Total: <strong>${totalCopies}</strong></span>
        </div>
        <div class="book-card-footer">
          <span class="book-copies-text">Shelf: <strong>${escapeHtml(book.shelf_location || "N/A")}</strong></span>
          <button class="book-view-details-btn" onclick="openStudentBookHistoryModal('${escapeHtml(book.id)}')">
            <i class="fa-solid fa-eye" aria-hidden="true" style="margin-right:4px;"></i> View Details
          </button>
        </div>
      </div>
    `;

    gridContainer.appendChild(card);
  });
}

const catalogSearchInput = document.getElementById("catalogSearchInput");
if (catalogSearchInput) {
  catalogSearchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase().trim();
    renderBookCards(filterCatalogBooks(query));
  });
}

// Restore cache immediately synchronously
restoreCachedBooksPage();

document.addEventListener("DOMContentLoaded", () => {
  document
    .getElementById("nextBooksPage")
    ?.addEventListener("click", () => loadBookCatalog({ append: true }));
  document
    .getElementById("refreshBooksCatalog")
    ?.addEventListener("click", () => initializeBooksPage({ forceCatalogRefresh: true }));

  const booksThemeToggle = document.getElementById("booksThemeToggle");
  if (booksThemeToggle && !booksThemeToggle.dataset.themeBound) {
    booksThemeToggle.dataset.themeBound = "true";
    booksThemeToggle.addEventListener("click", () => {
      const dark = !document.body.classList.contains("app-dark");
      if (typeof window.setAppTheme === "function") {
        window.setAppTheme(dark);
      } else {
        document.body.classList.toggle("app-dark", dark);
        localStorage.setItem("tHubTheme", dark ? "dark" : "light");
      }
    });
  }

  restoreCachedBooksPage();
  restoreCachedBooksPageAsync().finally(() => {
    initializeBooksPage();
  });
});

async function openStudentBookHistoryModal(bookId) {
  const modal = document.getElementById("studentHistoryModal");
  if (!modal) {
    if (typeof showToast === "function") showToast("Modal element not found.", "error");
    return;
  }

  modal.style.display = "flex";
  if (typeof lockBodyScroll === "function") lockBodyScroll();

  const historyContainer = document.getElementById("studentHistoryContent");
  if (historyContainer) {
    historyContainer.innerHTML = `
      <div style="text-align: center; padding: 2.5rem; color: #64748b;">
        <i class="fa-solid fa-spinner fa-spin" style="margin-right: 0.5rem; font-size: 1.2rem;"></i> Loading book details & circulation records...
      </div>
    `;
  }

  try {
    const book =
      allCatalogBooks.find((item) => item.id === bookId) || {};

    const { data: borrowings, error: borrowError } = await window.supabaseClient
      .from("book_borrowings")
      .select(`
        *,
        profiles (
          id,
          full_name,
          email,
          role,
          photo_url,
          students ( student_id )
        )
      `)
      .eq("book_id", bookId)
      .order("created_at", { ascending: false });

    if (borrowError) throw borrowError;

    if (!historyContainer) return;

    const availableCopies = Number(book.available_copies) || 0;
    const totalCopies = Number(book.total_copies) || 0;
    const isAvailable = availableCopies > 0;
    const availabilityBadgeClass = isAvailable ? "modal-pill-available" : "modal-pill-unavailable";
    const availabilityText = isAvailable
      ? `${availableCopies} Available / ${totalCopies} Total`
      : "Out of Stock";

    const coverSrc =
      book.cover_image_url ||
      "https://cdn-icons-png.flaticon.com/512/29/29302.png";
    const deptName = book.departments?.name || "General";
    const bookCode = book.book_code || "-";
    const shelfLoc = book.shelf_location || "-";
    const description = book.description || "No description provided.";
    const totalCircCount = borrowings?.length || 0;

    const bookSummary = `
      <div class="modal-book-hero">
        <img
          class="modal-book-cover"
          src="${escapeHtml(coverSrc)}"
          alt="${escapeHtml(book.title || "Book")}"
          onerror="this.onerror=null; this.src='https://cdn-icons-png.flaticon.com/512/149/149071.png';"
        />
        <div class="modal-book-info">
          <h4 class="modal-book-title">${escapeHtml(book.title || "Book Details")}</h4>
          <p class="modal-book-author">By <strong>${escapeHtml(book.author || "Unknown")}</strong></p>
          <div class="modal-book-pills">
            <span class="modal-pill modal-pill-dept"><i class="fa-solid fa-graduation-cap"></i> ${escapeHtml(deptName)}</span>
            <span class="modal-pill modal-pill-meta"><i class="fa-solid fa-barcode"></i> Code: ${escapeHtml(bookCode)}</span>
            <span class="modal-pill modal-pill-meta"><i class="fa-solid fa-layer-group"></i> Shelf: ${escapeHtml(shelfLoc)}</span>
            <span class="modal-pill ${availabilityBadgeClass}"><i class="fa-solid ${isAvailable ? "fa-circle-check" : "fa-circle-xmark"}"></i> ${escapeHtml(availabilityText)}</span>
          </div>
          <p class="modal-book-desc">${escapeHtml(description)}</p>
          <div>
            <a href="library.html" class="modal-manage-btn">
              <i class="fa-solid fa-arrow-right-arrow-left"></i> Manage in Inventory
            </a>
          </div>
        </div>
      </div>
      <div class="modal-circulation-header">
        <h4 class="modal-circulation-title">
          <i class="fa-solid fa-clock-rotate-left"></i> Circulation Records
        </h4>
        <span class="modal-circulation-badge">${totalCircCount} records</span>
      </div>
    `;

    if (!borrowings || borrowings.length === 0) {
      historyContainer.innerHTML = `
        ${bookSummary}
        <div class="circulation-empty">
          <i class="fa-solid fa-box-open"></i>
          <p>No active borrowings or circulation history for this book.</p>
        </div>
        <div class="modal-bottom-spacer"></div>
      `;
      return;
    }

    const rows = borrowings.map((record) => {
      const borrower = record.profiles || {};
      const student = Array.isArray(borrower.students) ? borrower.students[0] : borrower.students;
      const borrowerName = borrower.full_name || borrower.email || "Unknown Borrower";
      const studentId = student?.student_id ? ` (ID: ${student.student_id})` : "";
      const roleText = borrower.role ? `[${borrower.role}]` : "";
      const isOverdue = record.status === "borrowed" && record.due_date && new Date(record.due_date) < new Date();
      const statusClass = isOverdue ? "status-overdue" : `status-${escapeHtml(record.status || "borrowed")}`;
      const statusLabel = isOverdue ? "Overdue" : (record.status || "Borrowed");
      const statusIcon = isOverdue
        ? "fa-circle-exclamation"
        : (record.status === "returned" ? "fa-circle-check" : "fa-book-open");

      return `
        <div class="circulation-record-card">
          <div class="circulation-record-top">
            <div>
              <span class="circulation-borrower-name">${escapeHtml(borrowerName)}${escapeHtml(studentId)}</span>
              <span class="circulation-borrower-sub">${escapeHtml(roleText)}</span>
            </div>
            <span class="status-badge ${statusClass}">
              <i class="fa-solid ${statusIcon}"></i> ${escapeHtml(statusLabel)}
            </span>
          </div>
          <div class="circulation-dates-grid">
            <div class="circulation-date-col">
              <span class="circulation-date-lbl">Borrowed</span>
              <span class="circulation-date-val">${formatDate(record.borrow_date)}</span>
            </div>
            <div class="circulation-date-col">
              <span class="circulation-date-lbl">Due Date</span>
              <span class="circulation-date-val">${formatDate(record.due_date)}</span>
            </div>
            <div class="circulation-date-col">
              <span class="circulation-date-lbl">Returned</span>
              <span class="circulation-date-val">${record.return_date ? formatDate(record.return_date) : "Active"}</span>
            </div>
          </div>
        </div>
      `;
    }).join("");

    historyContainer.innerHTML = `${bookSummary}${rows}<div class="modal-bottom-spacer"></div>`;
  } catch (err) {
    console.error("Error loading book history:", err);
    if (historyContainer) {
      historyContainer.replaceChildren();
      const message = document.createElement("p");
      message.style.cssText = "text-align:center;color:#dc2626;padding:2rem;";
      message.textContent = booksErrorMessage(err, "history");
      const retry = document.createElement("button");
      retry.type = "button";
      retry.className = "book-view-details-btn";
      retry.textContent = "Try again";
      retry.addEventListener("click", () => openStudentBookHistoryModal(bookId), { once: true });
      historyContainer.append(message, retry);
    }
  }
}

function formatDate(dateString) {
  if (!dateString) return "-";
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return escapeHtml(dateString);

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function closeStudentHistoryModal() {
  const studentModal = document.getElementById("studentHistoryModal");
  if (studentModal) {
    studentModal.style.display = "none";
  }
  if (typeof unLockBodyScroll === "function") {
    unLockBodyScroll();
  }
}

window.addEventListener("click", (e) => {
  const studentModal = document.getElementById("studentHistoryModal");
  if (studentModal && e.target === studentModal) {
    closeStudentHistoryModal();
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    closeStudentHistoryModal();
  }
});
