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

async function loadLibraryUserCount(schoolId) {
  const count = document.getElementById("libraryUsersCount");
  const subtext = document.getElementById("libraryUsersSubtext");
  if (!count || !subtext) return;

  const { count: totalUsers, error } = await window.supabaseClient
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId);

  if (error) throw error;
  count.textContent = new Intl.NumberFormat().format(totalUsers ?? 0);
  subtext.textContent = "Profiles linked to this school";
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

  await Promise.all(metrics.map(async (metric) => {
    const countElement = document.getElementById(`${metric.id}Count`);
    const subtextElement = document.getElementById(`${metric.id}Subtext`);
    if (!countElement || !subtextElement) return;

    try {
      const { count, error } = await metric.query();
      if (error) throw error;
      countElement.textContent = new Intl.NumberFormat().format(count ?? 0);
      subtextElement.textContent = metric.detail;
    } catch (error) {
      console.error(`Could not load ${metric.id} dashboard count:`, error);
      countElement.textContent = "—";
      subtextElement.textContent = "Count is unavailable.";
    }
  }));
}

async function loadLibraryAnnouncements(schoolId, role) {
  const container = document.getElementById("announcementPreviewContainer");
  if (!container) return;

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await window.supabaseClient
    .from("announcements")
    .select("title, message, status, target_audience, created_at")
    .eq("school_id", schoolId)
    .or(`expiry_date.is.null,expiry_date.gte.${today}`)
    .order("created_at", { ascending: false });

  if (error) throw error;
  renderDashboardAnnouncements(container, data, role);
}

async function loadDashboardLibrarianPhoto(userId) {
  const image = document.getElementById("dashboardLibrarianAvatar");
  if (!image || !userId) return;

  const { data, error } = await window.supabaseClient
    .from("profiles")
    .select("full_name, photo_url")
    .eq("id", userId)
    .maybeSingle();

  if (error) throw error;
  image.alt = `${data?.full_name || "Librarian"} profile photo`;

  const photoUrl = data?.photo_url;
  if (!photoUrl) return;
  try {
    const parsedPhotoUrl = new URL(photoUrl, window.location.href);
    if (["https:", "http:"].includes(parsedPhotoUrl.protocol)) {
      image.src = parsedPhotoUrl.href;
    }
  } catch (error) {
    console.warn("Ignoring invalid librarian photo URL:", error);
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const announcementContainer = document.getElementById("announcementPreviewContainer");
  const count = document.getElementById("libraryUsersCount");
  const subtext = document.getElementById("libraryUsersSubtext");

  try {
    const authContext = await window.getAuthContext();
    const schoolId = authContext?.profile?.school_id;
    if (!schoolId) throw new Error("Your account is not linked to a school.");

    loadDashboardLibrarianPhoto(authContext.user?.id).catch((error) => {
      console.error("Could not load the librarian profile photo:", error);
    });

    const results = await Promise.allSettled([
      loadLibraryUserCount(schoolId),
      loadLibraryMetrics(schoolId),
      loadLibraryAnnouncements(schoolId, authContext.profile.role),
    ]);

    if (results[0].status === "rejected") {
      console.error("Could not count school profiles:", results[0].reason);
      if (count) count.textContent = "—";
      if (subtext) subtext.textContent = "User count is unavailable.";
    }
    if (results[2].status === "rejected" && announcementContainer) {
      console.error("Could not load library announcements:", results[2].reason);
      announcementContainer.innerHTML = `
        <div class="announcement-item empty-state">
          <h4>Announcements are unavailable</h4>
          <p>Please try again later.</p>
        </div>
      `;
    }
  } catch (error) {
    console.error("Could not load the library dashboard:", error);
    if (count) count.textContent = "—";
    if (subtext) subtext.textContent = "User count is unavailable.";
    if (announcementContainer) {
      announcementContainer.innerHTML = `
        <div class="announcement-item empty-state">
          <h4>Announcements are unavailable</h4>
          <p>Please try again later.</p>
        </div>
      `;
    }
  }
});
