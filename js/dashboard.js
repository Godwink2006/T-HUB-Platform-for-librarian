function escapeDashboardText(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function announcementTargetsRole(targetAudience, role) {
  const targets = String(targetAudience || "")
    .split(",")
    .map((audience) => audience.trim().toLowerCase().replace(/s$/, ""));
  return targets.includes("all") || targets.includes(String(role || "").toLowerCase());
}

function renderDashboardAnnouncements(container, announcements, role) {
  const visibleAnnouncements = (announcements || []).filter((announcement) =>
    announcementTargetsRole(announcement.target_audience, role),
  );

  if (!visibleAnnouncements.length) {
    container.innerHTML = `
      <div class="announcement-item empty-state dashboard-announcement-empty">
        <i class="fa-solid fa-bullhorn" aria-hidden="true"></i>
        <h4>No announcements</h4>
        <p>Library announcements for your account will appear here.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = visibleAnnouncements.map((announcement) => {
    const status = String(announcement.status || "Normal");
    const statusClass = status.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    const date = announcement.created_at
      ? new Date(announcement.created_at).toLocaleDateString()
      : "";
    return `
      <article class="announcement-item dashboard-announcement">
        <div class="dashboard-announcement-heading">
          <h4>${escapeDashboardText(announcement.title || "Announcement")}</h4>
          <span class="announcement-status announcement-status-${escapeDashboardText(statusClass)}">${escapeDashboardText(status)}</span>
        </div>
        <p>${escapeDashboardText(announcement.message || "")}</p>
        ${date ? `<time datetime="${escapeDashboardText(announcement.created_at)}">${escapeDashboardText(date)}</time>` : ""}
      </article>
    `;
  }).join("");
}

const DASHBOARD_CACHE_PAGE = "dashboard";

function renderDashboardData(data) {
  if (!data) return;

  if (data.librarian) {
    const image = document.getElementById("dashboardLibrarianAvatar");
    if (image) {
      if (data.librarian.photoUrl) image.src = data.librarian.photoUrl;
      if (data.librarian.alt) image.alt = data.librarian.alt;
    }
  }

  if (data.userCount !== undefined) {
    const count = document.getElementById("libraryUsersCount");
    const subtext = document.getElementById("libraryUsersSubtext");
    if (count) count.textContent = data.userCount;
    if (subtext) subtext.textContent = data.userSubtext || "Profiles linked to this school";
  }

  if (data.metrics) {
    Object.entries(data.metrics).forEach(([metricId, val]) => {
      const countEl = document.getElementById(`${metricId}Count`);
      const subtextEl = document.getElementById(`${metricId}Subtext`);
      if (countEl && val.count !== undefined) countEl.textContent = val.count;
      if (subtextEl && val.detail) subtextEl.textContent = val.detail;
    });
  }

  if (data.announcements) {
    const announcementContainer = document.getElementById("announcementPreviewContainer");
    if (announcementContainer) {
      renderDashboardAnnouncements(announcementContainer, data.announcements, data.role || "librarian");
    }
  }
}

function restoreCachedDashboard() {
  try {
    const cached = window.libraryPageCache?.readLast(DASHBOARD_CACHE_PAGE);
    if (cached?.data) {
      renderDashboardData(cached.data);
      return true;
    }
  } catch (error) {
    console.warn("Could not restore cached dashboard:", error);
  }
  return false;
}

async function loadLibraryUserCount(schoolId) {
  const count = document.getElementById("libraryUsersCount");
  const subtext = document.getElementById("libraryUsersSubtext");
  if (!count || !subtext) return null;

  const { count: totalUsers, error } = await window.supabaseClient
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId);

  if (error) throw error;
  const formattedCount = new Intl.NumberFormat().format(totalUsers ?? 0);
  count.textContent = formattedCount;
  subtext.textContent = "Profiles linked to this school";
  return { userCount: formattedCount, userSubtext: "Profiles linked to this school" };
}

async function loadLibraryMetrics(schoolId) {
  const metrics = [
    {
      id: "dashboardBookTitles",
      query: () => window.supabaseClient
        .from("books")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId),
      detail: "Titles in the school catalog",
    },
    {
      id: "dashboardBorrowed",
      query: () => window.supabaseClient
        .from("book_borrowings")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .in("status", ["borrowed", "overdue"]),
      detail: "Books currently out",
    },
    {
      id: "dashboardReturned",
      query: () => window.supabaseClient
        .from("book_borrowings")
        .select("id", { count: "exact", head: true })
        .eq("school_id", schoolId)
        .eq("status", "returned"),
      detail: "Completed returns on record",
    },
  ];

  const results = {};
  await Promise.all(metrics.map(async (metric) => {
    const countElement = document.getElementById(`${metric.id}Count`);
    const subtextElement = document.getElementById(`${metric.id}Subtext`);
    if (!countElement || !subtextElement) return;

    try {
      const { count, error } = await metric.query();
      if (error) throw error;
      const formatted = new Intl.NumberFormat().format(count ?? 0);
      countElement.textContent = formatted;
      subtextElement.textContent = metric.detail;
      results[metric.id] = { count: formatted, detail: metric.detail };
    } catch (error) {
      console.error(`Could not load ${metric.id} dashboard count:`, error);
      countElement.textContent = "—";
      subtextElement.textContent = "Count is unavailable.";
      results[metric.id] = { count: "—", detail: "Count is unavailable." };
    }
  }));
  return results;
}

async function loadLibraryAnnouncements(schoolId, role) {
  const container = document.getElementById("announcementPreviewContainer");
  if (!container) return [];

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await window.supabaseClient
    .from("announcements")
    .select("title, message, status, target_audience, created_at")
    .eq("school_id", schoolId)
    .or(`expiry_date.is.null,expiry_date.gte.${today}`)
    .order("created_at", { ascending: false });

  if (error) throw error;
  renderDashboardAnnouncements(container, data, role);
  return data || [];
}

async function loadDashboardLibrarianPhoto(userId) {
  const image = document.getElementById("dashboardLibrarianAvatar");
  if (!image || !userId) return null;

  const { data, error } = await window.supabaseClient
    .from("profiles")
    .select("full_name, photo_url")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  const alt = `${data?.full_name || "Librarian"} profile photo`;
  image.alt = alt;

  const photoUrl = data?.photo_url;
  if (!photoUrl) return { photoUrl: "", alt };
  try {
    const parsedPhotoUrl = new URL(photoUrl, window.location.href);
    if (["https:", "http:"].includes(parsedPhotoUrl.protocol)) {
      image.src = parsedPhotoUrl.href;
      return { photoUrl: parsedPhotoUrl.href, alt };
    }
  } catch (error) {
    console.warn("Ignoring invalid librarian photo URL:", error);
  }
  return { photoUrl: "", alt };
}

document.addEventListener("DOMContentLoaded", async () => {
  restoreCachedDashboard();

  const announcementContainer = document.getElementById("announcementPreviewContainer");
  const count = document.getElementById("libraryUsersCount");
  const subtext = document.getElementById("libraryUsersSubtext");

  try {
    const authContext = await window.getAuthContext();
    const schoolId = authContext?.profile?.school_id;
    if (!schoolId) throw new Error("Your account is not linked to a school.");

    const librarianPromise = loadDashboardLibrarianPhoto(authContext.user?.id).catch((error) => {
      console.error("Could not load the librarian profile photo:", error);
      return null;
    });

    const [userCountResult, metricsResult, announcementsResult, librarianResult] =
      await Promise.allSettled([
        loadLibraryUserCount(schoolId),
        loadLibraryMetrics(schoolId),
        loadLibraryAnnouncements(schoolId, authContext.profile.role),
        librarianPromise,
      ]);

    const dashboardSnapshot = {
      role: authContext.profile?.role || "librarian",
      schoolId,
    };

    if (userCountResult.status === "fulfilled" && userCountResult.value) {
      dashboardSnapshot.userCount = userCountResult.value.userCount;
      dashboardSnapshot.userSubtext = userCountResult.value.userSubtext;
    } else if (userCountResult.status === "rejected") {
      console.error("Could not count school profiles:", userCountResult.reason);
      if (count && count.textContent === "—") count.textContent = "—";
      if (subtext && subtext.textContent === "Loading user count…") subtext.textContent = "User count is unavailable.";
    }

    if (metricsResult.status === "fulfilled" && metricsResult.value) {
      dashboardSnapshot.metrics = metricsResult.value;
    }

    if (announcementsResult.status === "fulfilled" && announcementsResult.value) {
      dashboardSnapshot.announcements = announcementsResult.value;
    } else if (announcementsResult.status === "rejected" && announcementContainer) {
      console.error("Could not load library announcements:", announcementsResult.reason);
      if (!announcementContainer.querySelector(".announcement-item.dashboard-announcement")) {
        announcementContainer.innerHTML = `
          <div class="announcement-item empty-state">
            <h4>Announcements are unavailable</h4>
            <p>Please try again later.</p>
          </div>
        `;
      }
    }

    if (librarianResult.status === "fulfilled" && librarianResult.value) {
      dashboardSnapshot.librarian = librarianResult.value;
    }

    if (authContext.user?.id) {
      window.libraryPageCache?.write(DASHBOARD_CACHE_PAGE, authContext.user.id, dashboardSnapshot);
    }
  } catch (error) {
    console.error("Could not load the library dashboard:", error);
    if (count && count.textContent === "—") count.textContent = "—";
    if (subtext && subtext.textContent === "Loading user count…") subtext.textContent = "User count is unavailable.";
    if (announcementContainer && !announcementContainer.querySelector(".announcement-item.dashboard-announcement")) {
      announcementContainer.innerHTML = `
        <div class="announcement-item empty-state">
          <h4>Announcements are unavailable</h4>
          <p>Please try again later.</p>
        </div>
      `;
    }
  }
});
