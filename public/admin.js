(() => {
  const loginSection = document.querySelector("#login-section");
  const adminApp = document.querySelector("#admin-app");
  const messageBox = document.querySelector("#global-message");
  const loginForm = document.querySelector("#login-form");
  const settingsForm = document.querySelector("#settings-form");
  const catalogueForm = document.querySelector("#catalogue-form");
  const catalogueList = document.querySelector("#catalogue-list");
  const enquiryList = document.querySelector("#enquiry-list");
  const statusFilter = document.querySelector("#status-filter");
  let csrfToken = "";
  let catalogue = [];
  let statuses = [];

  function showMessage(text, isError = false) {
    messageBox.textContent = text;
    messageBox.classList.toggle("error", isError);
    messageBox.hidden = false;
    messageBox.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }

  async function refreshCsrf() {
    const response = await fetch("/api/csrf", { credentials: "same-origin" });
    if (!response.ok) throw new Error("Could not start a secure session. Refresh and try again.");
    csrfToken = (await response.json()).csrfToken;
  }

  async function api(url, options = {}) {
    const headers = new Headers(options.headers || {});
    if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
    if (["POST", "PUT", "PATCH", "DELETE"].includes(options.method)) headers.set("X-CSRF-Token", csrfToken);
    const response = await fetch(url, { ...options, headers, credentials: "same-origin" });
    const result = response.status === 204 ? {} : await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) setSignedIn(false);
      throw new Error(result.error || "The request could not be completed.");
    }
    return result;
  }

  function setSignedIn(isSignedIn) {
    loginSection.hidden = isSignedIn;
    adminApp.hidden = !isSignedIn;
    document.querySelector("#logout-button").hidden = !isSignedIn;
  }

  async function signIn(event) {
    event.preventDefault();
    try {
      await refreshCsrf();
      const result = await api("/api/admin/login", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(loginForm).entries()))
      });
      csrfToken = result.csrfToken;
      loginForm.reset();
      setSignedIn(true);
      await loadAdmin();
      showMessage("Signed in successfully.");
    } catch (error) {
      showMessage(error.message, true);
    }
  }

  async function loadSettings() {
    const settings = await api("/api/admin/settings");
    for (const field of ["businessName", "tagline", "address", "phone", "email", "logoUrl", "heroEyebrow", "heroCopy", "aboutCopy"]) {
      settingsForm.elements[field].value = settings[field] || "";
    }
    for (const color of ["green", "greenLight", "saffron", "cream"]) {
      settingsForm.elements[color].value = settings.colors[color];
    }
  }

  function cardFromForm(form) {
    return {
      kind: form.elements.kind.value,
      title: form.elements.title.value,
      subtitle: form.elements.subtitle.value,
      description: form.elements.description.value,
      imageUrl: form.elements.imageUrl.value,
      displayOrder: Number(form.elements.displayOrder.value),
      active: form.elements.active.checked
    };
  }

  function resetCatalogueForm() {
    catalogueForm.reset();
    catalogueForm.elements.id.value = "";
    catalogueForm.elements.displayOrder.value = "0";
    catalogueForm.elements.active.checked = true;
    catalogueForm.querySelector('button[type="submit"]').textContent = "Save card";
  }

  function renderCatalogue() {
    if (!catalogue.length) {
      catalogueList.innerHTML = '<p class="empty-state">No destination or service cards yet.</p>';
      return;
    }
    catalogueList.replaceChildren();
    for (const item of catalogue) {
      const wrapper = document.createElement("article");
      wrapper.className = "catalogue-item";
      const top = document.createElement("div");
      top.className = "item-top";
      const text = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = item.title;
      const meta = document.createElement("div");
      meta.className = "item-meta";
      meta.textContent = `${item.kind === "service" ? "Service" : "Destination"} · ${item.active ? "Visible" : "Hidden"} · Order ${item.display_order}`;
      text.append(title, meta);
      const actions = document.createElement("div");
      actions.className = "item-actions";
      const edit = document.createElement("button");
      edit.className = "small-button";
      edit.type = "button";
      edit.textContent = "Edit";
      edit.addEventListener("click", () => {
        catalogueForm.elements.id.value = item.id;
        catalogueForm.elements.kind.value = item.kind;
        catalogueForm.elements.title.value = item.title;
        catalogueForm.elements.subtitle.value = item.subtitle;
        catalogueForm.elements.description.value = item.description;
        catalogueForm.elements.imageUrl.value = item.image_url;
        catalogueForm.elements.displayOrder.value = item.display_order;
        catalogueForm.elements.active.checked = Boolean(item.active);
        catalogueForm.querySelector('button[type="submit"]').textContent = "Update card";
        catalogueForm.scrollIntoView({ behavior: "smooth", block: "center" });
      });
      const remove = document.createElement("button");
      remove.className = "small-button danger";
      remove.type = "button";
      remove.textContent = "Delete";
      remove.addEventListener("click", async () => {
        if (!window.confirm(`Delete “${item.title}”?`)) return;
        try {
          await api(`/api/admin/catalogue/${item.id}`, { method: "DELETE" });
          await loadCatalogue();
          showMessage("Card deleted.");
        } catch (error) {
          showMessage(error.message, true);
        }
      });
      actions.append(edit, remove);
      top.append(text, actions);
      wrapper.append(top);
      catalogueList.append(wrapper);
    }
  }

  async function loadCatalogue() {
    catalogue = await api("/api/admin/catalogue");
    renderCatalogue();
  }

  function addSelectOptions(select, values, selected = "") {
    select.replaceChildren();
    for (const value of values) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = value;
      option.selected = value === selected;
      select.append(option);
    }
  }

  function renderEnquiries(enquiries) {
    if (!enquiries.length) {
      enquiryList.innerHTML = '<p class="empty-state">No enquiries match this filter.</p>';
      return;
    }
    enquiryList.replaceChildren();
    for (const item of enquiries) {
      const wrapper = document.createElement("article");
      wrapper.className = "enquiry-item";
      const top = document.createElement("div");
      top.className = "enquiry-top";
      const titleGroup = document.createElement("div");
      const title = document.createElement("h3");
      title.textContent = `#${item.id} · ${item.full_name}`;
      const date = document.createElement("p");
      date.className = "muted";
      date.textContent = new Date(item.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
      titleGroup.append(title, date);
      const emailState = document.createElement("span");
      emailState.className = `email-state ${item.email_status}`;
      emailState.textContent = `Email notification: ${item.email_status.replace("_", " ")}`;
      top.append(titleGroup, emailState);

      const details = document.createElement("div");
      details.className = "enquiry-details";
      for (const [label, value] of [
        ["Mobile", item.mobile], ["Email", item.email || "Not provided"],
        ["Service", item.service], ["Destination", item.destination || "Not specified"]
      ]) {
        const field = document.createElement("p");
        const strong = document.createElement("strong");
        strong.textContent = `${label}: `;
        field.append(strong, document.createTextNode(value));
        details.append(field);
      }

      const controls = document.createElement("div");
      controls.className = "enquiry-tools";
      const statusLabel = document.createElement("label");
      statusLabel.textContent = "CRM status";
      const statusSelect = document.createElement("select");
      addSelectOptions(statusSelect, statuses, item.status);
      statusLabel.append(statusSelect);
      const notesLabel = document.createElement("label");
      notesLabel.textContent = "Internal notes";
      const notesInput = document.createElement("input");
      notesInput.value = item.notes || "";
      notesInput.maxLength = 2000;
      notesInput.placeholder = "Add a follow-up note";
      notesLabel.append(notesInput);
      const save = document.createElement("button");
      save.type = "button";
      save.className = "small-button";
      save.textContent = "Save CRM update";
      save.addEventListener("click", async () => {
        try {
          await api(`/api/admin/enquiries/${item.id}`, {
            method: "PATCH",
            body: JSON.stringify({ status: statusSelect.value, notes: notesInput.value })
          });
          await loadEnquiries();
          showMessage(`Enquiry #${item.id} updated.`);
        } catch (error) {
          showMessage(error.message, true);
        }
      });
      controls.append(statusLabel, notesLabel, save);
      wrapper.append(top, details, controls);
      if (item.email_status !== "sent") {
        const resend = document.createElement("button");
        resend.type = "button";
        resend.className = "small-button";
        resend.textContent = "Retry email notification";
        resend.addEventListener("click", async () => {
          try {
            await api(`/api/admin/enquiries/${item.id}/resend`, { method: "POST", body: "{}" });
            await loadEnquiries();
            showMessage(`Email notification for enquiry #${item.id} sent.`);
          } catch (error) {
            showMessage(error.message, true);
          }
        });
        wrapper.append(resend);
      }
      enquiryList.append(wrapper);
    }
  }

  async function loadEnquiries() {
    const result = await api(`/api/admin/enquiries${statusFilter.value ? `?status=${encodeURIComponent(statusFilter.value)}` : ""}`);
    statuses = result.statuses;
    if (statusFilter.options.length === 1) {
      for (const status of statuses) {
        const option = document.createElement("option");
        option.value = status;
        option.textContent = status;
        statusFilter.append(option);
      }
    }
    renderEnquiries(result.enquiries);
  }

  async function loadAdmin() {
    await Promise.all([loadSettings(), loadCatalogue(), loadEnquiries()]);
  }

  loginForm.addEventListener("submit", signIn);
  settingsForm.addEventListener("submit", async event => {
    event.preventDefault();
    const form = new FormData(settingsForm);
    const body = Object.fromEntries(form.entries());
    body.colors = Object.fromEntries(["green", "greenLight", "saffron", "cream"].map(color => [color, form.get(color)]));
    try {
      await api("/api/admin/settings", { method: "PUT", body: JSON.stringify(body) });
      showMessage("Business details and theme saved.");
    } catch (error) {
      showMessage(error.message, true);
    }
  });

  catalogueForm.addEventListener("submit", async event => {
    event.preventDefault();
    const id = catalogueForm.elements.id.value;
    try {
      await api(id ? `/api/admin/catalogue/${id}` : "/api/admin/catalogue", {
        method: id ? "PUT" : "POST",
        body: JSON.stringify(cardFromForm(catalogueForm))
      });
      resetCatalogueForm();
      await loadCatalogue();
      showMessage("Destination or service saved.");
    } catch (error) {
      showMessage(error.message, true);
    }
  });

  document.querySelector("#reset-catalogue").addEventListener("click", resetCatalogueForm);
  statusFilter.addEventListener("change", () => loadEnquiries().catch(error => showMessage(error.message, true)));

  document.querySelector("#upload-logo").addEventListener("click", async () => {
    const file = document.querySelector("#logo-file").files[0];
    if (!file) return showMessage("Choose a logo image first.", true);
    const body = new FormData();
    body.append("logo", file);
    try {
      const result = await api("/api/admin/logo", { method: "POST", body });
      settingsForm.elements.logoUrl.value = result.logoUrl;
      showMessage("Logo uploaded and selected for your website.");
    } catch (error) {
      showMessage(error.message, true);
    }
  });

  document.querySelector("#password-form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    try {
      await api("/api/admin/password", {
        method: "PUT",
        body: JSON.stringify(Object.fromEntries(new FormData(form).entries()))
      });
      form.reset();
      showMessage("Admin password changed.");
    } catch (error) {
      showMessage(error.message, true);
    }
  });

  document.querySelector("#logout-button").addEventListener("click", async () => {
    try {
      await api("/api/admin/logout", { method: "POST", body: "{}" });
      setSignedIn(false);
      await refreshCsrf();
      showMessage("You have signed out.");
    } catch (error) {
      showMessage(error.message, true);
    }
  });

  (async () => {
    try {
      await refreshCsrf();
      await api("/api/admin/me");
      setSignedIn(true);
      await loadAdmin();
    } catch (error) {
      setSignedIn(false);
      if (error.message !== "Please sign in to continue.") showMessage(error.message, true);
    }
  })();
})();
