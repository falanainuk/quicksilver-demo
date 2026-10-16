(() => {
  const menuButton = document.querySelector(".menu-toggle");
  const navLinks = document.querySelector(".nav-links");
  const form = document.querySelector("#enquiry-form");
  const formMessage = document.querySelector("#form-message");
  let csrfToken = "";

  menuButton.addEventListener("click", () => {
    const isOpen = menuButton.getAttribute("aria-expanded") === "true";
    menuButton.setAttribute("aria-expanded", String(!isOpen));
    menuButton.setAttribute("aria-label", isOpen ? "Open navigation menu" : "Close navigation menu");
    navLinks.classList.toggle("is-open", !isOpen);
  });

  navLinks.addEventListener("click", event => {
    if (!event.target.closest("a")) return;
    navLinks.classList.remove("is-open");
    menuButton.setAttribute("aria-expanded", "false");
    menuButton.setAttribute("aria-label", "Open navigation menu");
  });

  function appendText(parent, tag, text, className) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    element.textContent = text;
    parent.append(element);
    return element;
  }

  function buildDestination(item) {
    const card = document.createElement("a");
    card.className = "destination-card";
    card.href = "#enquiry";
    if (item.image_url) {
      const image = document.createElement("img");
      image.src = item.image_url;
      image.alt = item.title;
      image.loading = "lazy";
      card.append(image);
    }
    const copy = document.createElement("div");
    copy.className = "destination-copy";
    appendText(copy, "span", item.subtitle);
    appendText(copy, "h3", item.title);
    card.append(copy);
    return card;
  }

  function buildService(item) {
    const card = document.createElement("article");
    card.className = "package-card";
    if (item.image_url) {
      const image = document.createElement("img");
      image.src = item.image_url;
      image.alt = item.title;
      image.loading = "lazy";
      card.append(image);
    }
    const body = document.createElement("div");
    body.className = "package-body";
    const meta = document.createElement("div");
    meta.className = "package-meta";
    appendText(meta, "span", document.querySelector("#business-name").textContent);
    appendText(meta, "span", item.subtitle);
    appendText(body, "h3", item.title);
    body.insertBefore(meta, body.firstChild);
    appendText(body, "p", item.description);
    const footer = document.createElement("div");
    footer.className = "package-footer";
    const label = document.createElement("span");
    label.className = "price";
    label.textContent = "Enquire with us";
    appendText(label, "small", "Guidance based on your requirements");
    footer.append(label);
    const link = document.createElement("a");
    link.href = "#enquiry";
    link.textContent = "Enquire →";
    footer.append(link);
    body.append(footer);
    card.append(body);
    return card;
  }

  function applySettings(settings) {
    document.title = `${settings.businessName} | ${settings.tagline}`;
    document.querySelector('meta[name="description"]').content =
      `${settings.businessName} — ${settings.heroEyebrow}. ${settings.heroCopy}`;
    document.querySelector("#business-name").textContent = settings.businessName;
    document.querySelector("#contact-business-name").textContent = settings.businessName;
    document.querySelectorAll(".footer-business-name").forEach(item => { item.textContent = settings.businessName; });
    document.querySelector("#tagline").textContent = settings.tagline;
    document.querySelector("#image-tagline").textContent = settings.tagline;
    document.querySelector("#quote-tagline").textContent = `“${settings.tagline}”`;
    document.querySelector("#quote-attribution").textContent = `${settings.businessName} · ${settings.heroEyebrow}`;
    document.querySelectorAll(".footer-tagline").forEach(item => { item.textContent = settings.tagline; });
    document.querySelector("#hero-eyebrow").textContent = settings.heroEyebrow;
    document.querySelector("#topbar-business").textContent = `${settings.heroEyebrow} · ${settings.address}`;
    document.querySelector("#hero-copy").textContent = settings.heroCopy;
    document.querySelector("#about-copy").textContent = settings.aboutCopy;
    document.querySelector("#footer-about").textContent = settings.aboutCopy;
    document.querySelector("#business-address").textContent = settings.address;
    document.querySelector("#business-phone").textContent = settings.phone;
    document.querySelector("#business-phone-link").href = `tel:${settings.phone.replace(/[^\d+]/g, "")}`;
    const topbarPhone = document.querySelector("#topbar-phone-link");
    topbarPhone.href = `tel:${settings.phone.replace(/[^\d+]/g, "")}`;
    topbarPhone.textContent = `Call us: ${settings.phone}`;
    document.querySelector("#business-email").textContent = settings.email;
    document.querySelector("#business-email-link").href = `mailto:${settings.email}`;
    document.querySelector("#footer-phone-link").textContent = settings.phone;
    document.querySelector("#footer-phone-link").href = `tel:${settings.phone.replace(/[^\d+]/g, "")}`;
    document.querySelector("#footer-email-link").textContent = settings.email;
    document.querySelector("#footer-email-link").href = `mailto:${settings.email}`;
    document.documentElement.style.setProperty("--green", settings.colors.green);
    document.documentElement.style.setProperty("--green-light", settings.colors.greenLight);
    document.documentElement.style.setProperty("--saffron", settings.colors.saffron);
    document.documentElement.style.setProperty("--cream", settings.colors.cream);

    for (const [imageId, markId] of [["brand-logo", "brand-mark"], ["footer-brand-logo", "footer-brand-mark"]]) {
      const image = document.getElementById(imageId);
      const mark = document.getElementById(markId);
      const brandName = image.parentElement.querySelector(".brand-name");
      if (settings.logoUrl) {
        image.src = settings.logoUrl;
        image.alt = settings.businessName;
        image.hidden = false;
        mark.hidden = true;
        brandName.hidden = true;
      } else {
        image.hidden = true;
        mark.hidden = false;
        brandName.hidden = false;
      }
    }
  }

  async function getCsrfToken() {
    const response = await fetch("/api/csrf", { credentials: "same-origin" });
    if (!response.ok) throw new Error("We could not start a secure form session. Please try again.");
    csrfToken = (await response.json()).csrfToken;
  }

  async function loadPublicContent() {
    const response = await fetch("/api/public", { credentials: "same-origin" });
    if (!response.ok) throw new Error("Website details could not be loaded.");
    const data = await response.json();
    applySettings(data.settings);
    document.querySelector("#destination-grid").replaceChildren(...data.destinations.map(buildDestination));
    document.querySelector("#service-grid").replaceChildren(...data.services.map(buildService));
    const destinationSelect = form.elements.destination;
    destinationSelect.replaceChildren(new Option("Select a destination", ""));
    for (const item of data.destinations) {
      const option = document.createElement("option");
      option.value = item.title;
      option.textContent = item.title;
      destinationSelect.append(option);
    }
    const serviceSelect = form.elements.service;
    serviceSelect.replaceChildren(new Option("Select a service", ""));
    for (const item of data.services) {
      const option = document.createElement("option");
      option.value = item.title;
      option.textContent = item.title;
      serviceSelect.append(option);
    }
    const otherOption = document.createElement("option");
    otherOption.value = "Other enquiry";
    otherOption.textContent = "Other enquiry";
    serviceSelect.append(otherOption);
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    formMessage.hidden = false;
    formMessage.textContent = "Sending your enquiry…";
    try {
      if (!csrfToken) await getCsrfToken();
      const payload = Object.fromEntries(new FormData(form).entries());
      const response = await fetch("/api/enquiries", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken },
        body: JSON.stringify(payload)
      });
      const result = await response.json();
      if (!response.ok && response.status !== 202) throw new Error(result.error || "Your enquiry could not be sent.");
      formMessage.textContent = result.message;
      if (response.status === 201) form.reset();
    } catch (error) {
      formMessage.textContent = error.message || "Your enquiry could not be sent. Please try again.";
    }
  });

  document.querySelector("#year").textContent = new Date().getFullYear();
  Promise.all([loadPublicContent(), getCsrfToken()]).catch(error => {
    formMessage.hidden = false;
    formMessage.textContent = error.message;
  });
})();
