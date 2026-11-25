let schoolInformationUser = null;
const SCHOOL_INFO_CACHE_PAGE = "school-information";

function setValue(id, value) {
  const field = document.getElementById(id);
  if (!field) return;
  const nextValue = value == null ? "" : String(value);
  if (field.tagName === "SELECT") {
    const matchingOption = [...field.options].find((option) =>
      option.value === nextValue || option.textContent.trim() === nextValue,
    );
    field.value = matchingOption?.value || "";
    return;
  }
  field.value = nextValue;
}

function populateSchoolForm(data) {
  if (!data) return;
  const logoImg = document.getElementById("schoolLogoPreview");
  if (logoImg && data.logo_url) {
    logoImg.src = data.logo_url;
  }

  setValue("schoolName", data.school_name);
  setValue("schoolMotto", data.school_motto);
  setValue("schoolEmail", data.email);
  setValue("alternativePhone", data.alternative_phone);
  setValue("schoolWebsite", data.website);
  setValue("schoolAddress", data.address);
  setValue("schoolCity", data.city);
  setValue("schoolCountry", data.country);

  setValue("principalName", data.principal_name);
  setValue("principalEmail", data.principal_email);
  setValue("principalPhone", data.principal_phone);

  setValue("schoolType", data.school_type);
  setValue("educationLevel", data.education_level);
}

async function restoreCachedSchoolInformation() {
  try {
    await window.thubDBReady;
    const cached = window.libraryPageCache?.readLast(SCHOOL_INFO_CACHE_PAGE) ||
      await window.libraryPageCache?.readLastAsync(SCHOOL_INFO_CACHE_PAGE);
    if (cached?.data) {
      populateSchoolForm(cached.data);
      const loader = document.getElementById("formLoader");
      const form =
        document.getElementById("schoolInformationForm") ||
        document.getElementById("schoolProfileForm") ||
        document.querySelector("form");
      if (loader) loader.style.display = "none";
      if (form) form.classList.add("auth-ready");
      return true;
    }
  } catch (error) {
    console.warn("Could not restore cached school info:", error);
  }
  return false;
}

async function compressImageToBlob(file, maxWidth = 800, quality = 0.7) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = (e) => {
      const img = new Image();
      img.src = e.target.result;
      img.onload = () => {
        const canvas = document.createElement("canvas");
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) =>
            blob ? resolve(blob) : reject(new Error("Canvas export failed")),
          "image/jpeg",
          quality,
        );
      };
      img.onerror = (err) => reject(err);
    };
    reader.onerror = (err) => reject(err);
  });
}

async function getSchoolInformationUser() {
  if (!window.supabaseClient) throw new Error("The database client is unavailable.");
  const { data, error } = await window.supabaseClient.auth.getSession();
  if (error) throw error;
  const user = data?.session?.user;
  if (!user) {
    const sessionError = new Error("Your session has expired. Sign in again.");
    sessionError.status = 401;
    throw sessionError;
  }
  return user;
}

function showSchoolInformationMessage(message, type = "info") {
  const notice = document.getElementById("schoolInformationNotice");
  if (notice) {
    notice.textContent = message;
    notice.dataset.type = type;
    notice.hidden = false;
  }
  if (type === "error" && typeof showToast === "function") showToast(message, "error");
}

function schoolInformationErrorMessage(error, action = "load") {
  const code = String(error?.code || "").toLowerCase();
  const status = Number(error?.status || error?.statusCode || 0);
  const diagnostic = `${error?.message || ""} ${error?.details || ""}`.toLowerCase();

  if (status === 401 || /invalid jwt|session.*expired|refresh token/.test(diagnostic)) {
    return "Your session has expired. Sign in again, then reopen School Information.";
  }
  if (/school.{0,30}inactive|inactive.{0,30}school/.test(diagnostic)) {
    return "This school is inactive. You can view its information, but changes are unavailable until the school is active.";
  }
  if (code === "42501" || status === 403 || /row-level security|permission denied|not authorized|access denied/.test(diagnostic)) {
    return action === "save"
      ? "School information could not be saved because your account or school does not have permission to make changes."
      : "You do not have permission to load some school information. Contact your school administrator for help.";
  }
  if (/failed to fetch|network|connection|timeout/.test(diagnostic)) {
    return `Could not connect to ${action === "save" ? "save" : "load"} school information. Check your internet connection and try again.`;
  }
  if (code === "pgrst116") return "The requested school information could not be found.";
  return action === "save"
    ? "School information could not be saved. Please try again."
    : "School information could not be loaded. Refresh the page or contact your school administrator.";
}

function makeSchoolInformationReadOnly(form) {
  if (!form) return;
  form.querySelectorAll('input:not([type="file"]), textarea').forEach((field) => {
    field.readOnly = true;
    field.setAttribute("aria-readonly", "true");
  });
  form.querySelectorAll("select, input[type=file]").forEach((field) => {
    field.disabled = true;
  });
  form.querySelectorAll('button[type="submit"], button[type="reset"], #changeSchoolLogo, label[for="schoolLogo"]')
    .forEach((control) => {
      control.hidden = true;
      control.disabled = true;
    });
  form.addEventListener("submit", (event) => event.preventDefault());
}

async function loadSchoolProfile() {
  try {
    const user = schoolInformationUser;
    if (!user) return;

    const { data: userProfile, error: profileError } = await supabaseClient
      .from("profiles")
      .select("school_id")
      .eq("id", user.id)
      .single();
    if (profileError) throw profileError;

    if (!userProfile?.school_id) {
      showSchoolInformationMessage("Your account is not linked to a school.", "error");
      return;
    }

    const { data, error } = await supabaseClient
      .from("schools")
      .select("*")
      .eq("id", userProfile.school_id)
      .maybeSingle();

    if (error) throw error;

    if (data) {
      populateSchoolForm(data);
      if (user?.id) {
        window.libraryPageCache?.write(SCHOOL_INFO_CACHE_PAGE, user.id, data);
      }
    }

  } catch (err) {
    console.error("Error loading school profile:", err);
    showSchoolInformationMessage(schoolInformationErrorMessage(err), "error");
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const schoolInfoThemeToggle = document.getElementById("schoolInfoThemeToggle");
  if (schoolInfoThemeToggle && !schoolInfoThemeToggle.dataset.themeBound) {
    schoolInfoThemeToggle.dataset.themeBound = "true";
    schoolInfoThemeToggle.addEventListener("click", () => {
      const dark = !document.body.classList.contains("app-dark");
      if (typeof window.setAppTheme === "function") {
        window.setAppTheme(dark);
      } else {
        document.body.classList.toggle("app-dark", dark);
        localStorage.setItem("tHubTheme", dark ? "dark" : "light");
      }
    });
  }

  const schoolInfoRestored = await restoreCachedSchoolInformation();

  const form =
    document.getElementById("schoolInformationForm") ||
    document.getElementById("schoolProfileForm") ||
    document.querySelector("form");
  const loader = document.getElementById("formLoader");

  try {
    schoolInformationUser = await getSchoolInformationUser();
  } catch (error) {
    console.error("Could not load School Information account:", error);
    showSchoolInformationMessage(schoolInformationErrorMessage(error), "error");
  }

  if (!schoolInfoRestored) await loadSchoolProfile();

  makeSchoolInformationReadOnly(form);
  if (loader) loader.style.display = "none";
  if (form) form.classList.add("auth-ready");
});
