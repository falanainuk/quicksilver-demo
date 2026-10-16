require("dotenv").config();

const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcryptjs");
const Database = require("better-sqlite3");
const express = require("express");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const helmet = require("helmet");
const multer = require("multer");
const nodemailer = require("nodemailer");

const app = express();
const port = Number(process.env.PORT || 3000);
const rootDir = __dirname;
const dataDir = path.resolve(rootDir, process.env.DATA_DIR || "data");
const uploadsDir = path.join(rootDir, "public", "uploads");
const adminUsername = process.env.ADMIN_USERNAME;
const adminPassword = process.env.ADMIN_PASSWORD;
const sessionSecret = process.env.SESSION_SECRET;
const maxRequestBytes = "32kb";
const crmStatuses = ["New", "Contacted", "In progress", "Converted", "Closed"];

if (!adminUsername || !adminPassword || adminPassword.length < 12 || Buffer.byteLength(adminPassword) > 72) {
  throw new Error("Set ADMIN_USERNAME and an ADMIN_PASSWORD between 12 and 72 bytes in .env.");
}
if (!sessionSecret || sessionSecret.length < 32) {
  throw new Error("Set SESSION_SECRET to a random value of at least 32 characters in .env.");
}

fs.mkdirSync(dataDir, { recursive: true });
fs.mkdirSync(uploadsDir, { recursive: true });

const db = new Database(path.join(dataDir, "quicksilver.sqlite"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");
db.exec(`
  CREATE TABLE IF NOT EXISTS admins (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    username TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS settings (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    data TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS catalogue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL CHECK (kind IN ('destination', 'service')),
    title TEXT NOT NULL,
    subtitle TEXT NOT NULL DEFAULT '',
    description TEXT NOT NULL,
    image_url TEXT NOT NULL DEFAULT '',
    active INTEGER NOT NULL DEFAULT 1,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS enquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    full_name TEXT NOT NULL,
    mobile TEXT NOT NULL,
    email TEXT NOT NULL DEFAULT '',
    service TEXT NOT NULL,
    destination TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'New',
    notes TEXT NOT NULL DEFAULT '',
    email_status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

const now = () => new Date().toISOString();
const defaultSettings = {
  businessName: "Quicksilver Journeys",
  tagline: "Your Journey. Our Expertise.",
  address: "508 Kote, Bazbahdur Mohalla, Near Sanjay Gomti, Azamgarh, Uttar Pradesh, India",
  phone: "+91 92146 86599",
  email: "quicksilverjourneys@protonmail.com",
  heroEyebrow: "India inbound & outbound journeys",
  heroCopy: "Discover India's extraordinary heritage and landscapes, or set out from India to explore the world. Quicksilver Journeys helps travellers plan memorable journeys, with personal support from Azamgarh, Uttar Pradesh.",
  aboutCopy: "Based in Azamgarh, Uttar Pradesh, Quicksilver Journeys brings visitors closer to India's diverse destinations and helps travellers from India explore journeys abroad. Tell us what inspires you and we will help shape a trip around your interests.",
  logoUrl: "/assets/quicksilver-journeys-logo.png",
  colors: { green: "#0b5138", greenLight: "#176744", saffron: "#eb8a1b", cream: "#fbf7ef" }
};
const settingsInsert = db.prepare("INSERT OR IGNORE INTO settings (id, data, updated_at) VALUES (1, ?, ?)");
settingsInsert.run(JSON.stringify(defaultSettings), now());

const seedCatalogue = db.prepare(`
  INSERT INTO catalogue (kind, title, subtitle, description, image_url, active, display_order, created_at)
  VALUES (@kind, @title, @subtitle, @description, @image_url, 1, @display_order, @created_at)
`);
if (db.prepare("SELECT COUNT(*) AS count FROM catalogue").get().count === 0) {
  const seed = db.transaction(() => {
    [
      ["destination", "Golden Triangle", "Inbound · Delhi, Agra & Jaipur", "Explore India's celebrated heritage, architecture and local culture on a journey connecting Delhi, Agra and Jaipur.", "https://images.unsplash.com/photo-1564507592333-c60657eea523?auto=format&fit=crop&w=800&q=80"],
      ["destination", "Rajasthan", "Inbound · Forts & desert heritage", "Discover historic cities, colourful traditions and desert landscapes across Rajasthan.", "https://images.unsplash.com/photo-1477587458883-47145ed94245?auto=format&fit=crop&w=800&q=80"],
      ["destination", "Kerala", "Inbound · Backwaters & nature", "Experience Kerala's waterways, green landscapes and coastal culture.", "https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=800&q=80"],
      ["destination", "Kashmir", "Inbound · Mountains & valleys", "Take in the mountain scenery and distinctive landscapes of Kashmir.", "https://images.unsplash.com/photo-1595815771614-ade9d652a65d?auto=format&fit=crop&w=800&q=80"],
      ["destination", "United Arab Emirates", "Outbound · From India", "Plan an international city break to the UAE, tailored to your travel interests.", "https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=800&q=80"],
      ["destination", "Thailand & Singapore", "Outbound · Southeast Asia", "Explore popular Southeast Asian destinations with a journey planned around your preferences.", "https://images.unsplash.com/photo-1508009603885-50cf7c579365?auto=format&fit=crop&w=800&q=80"],
      ["service", "Inbound India tours", "For visitors discovering India", "Plan a visit to India around its historic cities, cultural experiences, regional cuisine and natural landscapes.", "https://images.unsplash.com/photo-1524492412937-b28074a5d7da?auto=format&fit=crop&w=900&q=80"],
      ["service", "Outbound tours from India", "Explore destinations around the world", "Share your preferred dates, interests and budget so we can help you plan an international holiday from India.", "https://images.unsplash.com/photo-1436491865332-7a61a109cc05?auto=format&fit=crop&w=900&q=80"],
      ["service", "Tailor-made holidays", "Personalised travel planning", "Discuss your itinerary, destination and travel preferences with our team to plan a journey that suits you.", "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=900&q=80"]
    ].forEach(([kind, title, subtitle, description, image_url], index) => {
      seedCatalogue.run({ kind, title, subtitle, description, image_url, display_order: index, created_at: now() });
    });
  });
  seed();
}

const admin = db.prepare("SELECT id FROM admins WHERE id = 1").get();
if (!admin) {
  const passwordHash = bcrypt.hashSync(adminPassword, 12);
  db.prepare("INSERT INTO admins (id, username, password_hash, updated_at) VALUES (1, ?, ?, ?)")
    .run(adminUsername, passwordHash, now());
}

const SQLiteStore = require("connect-sqlite3")(session);
app.disable("x-powered-by");
app.set("trust proxy", process.env.TRUST_PROXY === "true" ? 1 : false);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https://images.unsplash.com", "https:"],
      connectSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"]
    }
  }
}));
app.use(express.json({ limit: maxRequestBytes }));
app.use(express.urlencoded({ extended: false, limit: maxRequestBytes }));
app.use(session({
  name: "qsj.sid",
  secret: sessionSecret,
  store: new SQLiteStore({ db: "sessions.sqlite", dir: dataDir, table: "sessions", concurrentDB: true }),
  resave: false,
  saveUninitialized: false,
  cookie: {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    maxAge: 8 * 60 * 60 * 1000
  }
}));

app.get("/health", (request, response) => {
  response.status(200).json({ status: "healthy" });
});

app.use(express.static(path.join(rootDir, "public"), {
  index: "index.html",
  setHeaders(response, filePath) {
    if (filePath.endsWith(".html")) response.setHeader("Cache-Control", "no-store");
  }
}));

const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 8, standardHeaders: "draft-7", legacyHeaders: false });
const enquiryLimiter = rateLimit({ windowMs: 60 * 60 * 1000, limit: 12, standardHeaders: "draft-7", legacyHeaders: false });
const csrfLimiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 80, standardHeaders: "draft-7", legacyHeaders: false });

app.use("/api/admin", (request, response, next) => {
  response.setHeader("Cache-Control", "private, no-store");
  return next();
});

function requireAdmin(request, response, next) {
  if (request.session.adminId === 1) return next();
  return response.status(401).json({ error: "Please sign in to continue." });
}

function csrfToken(request, response, next) {
  if (!request.session.csrfToken) request.session.csrfToken = crypto.randomBytes(32).toString("hex");
  response.setHeader("Cache-Control", "no-store");
  return next();
}

function requireCsrf(request, response, next) {
  const token = request.get("x-csrf-token");
  const expected = request.session.csrfToken || "";
  if (!token || !/^[a-f0-9]{64}$/.test(token) || token.length !== expected.length ||
    !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected))) {
    return response.status(403).json({ error: "The security token expired. Refresh the page and try again." });
  }
  return next();
}

function readSettings() {
  const stored = JSON.parse(db.prepare("SELECT data FROM settings WHERE id = 1").get().data);
  return { ...defaultSettings, ...stored, colors: { ...defaultSettings.colors, ...(stored.colors || {}) } };
}

function validateText(value, label, maxLength, required = false) {
  if (typeof value !== "string") throw new Error(`${label} must be text.`);
  const clean = value.trim();
  if (required && !clean) throw new Error(`${label} is required.`);
  if (clean.length > maxLength) throw new Error(`${label} must be ${maxLength} characters or fewer.`);
  return clean;
}

function escapeHtml(value) {
  return value.replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  })[character]);
}

function createTransport() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASS) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

async function sendEnquiryEmail(enquiry, settings) {
  const transporter = createTransport();
  if (!transporter) throw new Error("SMTP is not configured on the server.");
  const body = [
    `New website enquiry #${enquiry.id}`,
    "",
    `Name: ${enquiry.full_name}`,
    `Mobile: ${enquiry.mobile}`,
    `Email: ${enquiry.email || "Not provided"}`,
    `Service: ${enquiry.service}`,
    `Destination: ${enquiry.destination || "Not specified"}`,
    `Received: ${enquiry.created_at}`,
    "",
    "Update this enquiry's CRM status in the Quicksilver Journeys admin panel."
  ].join("\n");
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: settings.email,
    replyTo: enquiry.email || undefined,
    subject: `Website enquiry #${enquiry.id}`,
    text: body,
    html: `<pre style="font-family:Arial,sans-serif;white-space:pre-wrap">${escapeHtml(body)}</pre>`
  });
}

app.get("/admin", (request, response) => response.sendFile(path.join(rootDir, "public", "admin.html")));
app.get("/api/csrf", csrfLimiter, csrfToken, (request, response) => {
  response.json({ csrfToken: request.session.csrfToken });
});

app.get("/api/public", (request, response) => {
  const settings = readSettings();
  const catalogue = db.prepare("SELECT id, kind, title, subtitle, description, image_url FROM catalogue WHERE active = 1 ORDER BY display_order, id").all();
  response.setHeader("Cache-Control", "no-store");
  response.json({
    settings,
    destinations: catalogue.filter(item => item.kind === "destination"),
    services: catalogue.filter(item => item.kind === "service")
  });
});

app.post("/api/enquiries", enquiryLimiter, requireCsrf, async (request, response) => {
  let fullName;
  let mobile;
  let email;
  let service;
  let destination;
  try {
    fullName = validateText(request.body.fullName, "Full name", 120, true);
    mobile = validateText(request.body.mobile, "Mobile number", 30, true);
    if (!/^\+?[0-9 ()-]{10,15}$/.test(mobile)) throw new Error("Enter a valid mobile number.");
    email = validateText(request.body.email || "", "Email address", 254);
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("Enter a valid email address.");
    service = validateText(request.body.service, "Service", 100, true);
    destination = validateText(request.body.destination || "", "Destination", 100);
    const availableServices = db.prepare("SELECT title FROM catalogue WHERE kind = 'service' AND active = 1").all().map(row => row.title);
    if (!availableServices.includes(service) && service !== "Other enquiry") throw new Error("Choose one of the available services.");
    const availableDestinations = db.prepare("SELECT title FROM catalogue WHERE kind = 'destination' AND active = 1").all().map(row => row.title);
    if (destination && !availableDestinations.includes(destination)) throw new Error("Choose one of the available destinations.");
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }

  const timestamp = now();
  const insert = db.prepare(`
    INSERT INTO enquiries (full_name, mobile, email, service, destination, status, email_status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, 'New', 'pending', ?, ?)
  `);
  const result = insert.run(fullName, mobile, email, service, destination, timestamp, timestamp);
  let emailStatus = "sent";
  let responseStatus = 201;
  let message = "Your enquiry has been sent to Quicksilver Journeys.";
  try {
    await sendEnquiryEmail({ id: result.lastInsertRowid, full_name: fullName, mobile, email, service, destination, created_at: timestamp }, readSettings());
    db.prepare("UPDATE enquiries SET email_status = 'sent', updated_at = ? WHERE id = ?").run(now(), result.lastInsertRowid);
  } catch (error) {
    emailStatus = createTransport() ? "failed" : "not_configured";
    responseStatus = 202;
    message = "Your enquiry has been saved, but we could not notify the team by email. Please call or email us directly.";
    console.error(`Enquiry ${result.lastInsertRowid} email notification failed:`, error.message);
    db.prepare("UPDATE enquiries SET email_status = ?, updated_at = ? WHERE id = ?").run(
      emailStatus, now(), result.lastInsertRowid
    );
  }
  return response.status(responseStatus).json({ message, emailStatus });
});

app.post("/api/admin/login", loginLimiter, requireCsrf, (request, response, next) => {
  const username = typeof request.body.username === "string" ? request.body.username : "";
  const password = typeof request.body.password === "string" ? request.body.password : "";
  const record = db.prepare("SELECT id, username, password_hash FROM admins WHERE id = 1").get();
  const passwordMatches = record && Buffer.byteLength(password) <= 72 && bcrypt.compareSync(password, record.password_hash);
  if (!record || username !== record.username || !passwordMatches) {
    return response.status(401).json({ error: "Username or password is incorrect." });
  }
  request.session.regenerate(error => {
    if (error) return next(error);
    request.session.adminId = record.id;
    request.session.username = record.username;
    request.session.csrfToken = crypto.randomBytes(32).toString("hex");
    return request.session.save(saveError => {
      if (saveError) return next(saveError);
      return response.json({ csrfToken: request.session.csrfToken, username: record.username });
    });
  });
});

app.post("/api/admin/logout", requireAdmin, requireCsrf, (request, response, next) => {
  request.session.destroy(error => {
    if (error) return next(error);
    response.clearCookie("qsj.sid", { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production" });
    return response.json({ ok: true });
  });
});

app.get("/api/admin/me", requireAdmin, (request, response) => {
  response.json({ username: request.session.username });
});
app.put("/api/admin/password", requireAdmin, requireCsrf, (request, response) => {
  const oldPassword = typeof request.body.oldPassword === "string" ? request.body.oldPassword : "";
  const newPassword = typeof request.body.newPassword === "string" ? request.body.newPassword : "";
  const record = db.prepare("SELECT password_hash FROM admins WHERE id = 1").get();
  if (!bcrypt.compareSync(oldPassword, record.password_hash)) {
    return response.status(400).json({ error: "Current password is incorrect." });
  }
  if (newPassword.length < 12 || Buffer.byteLength(newPassword) > 72) {
    return response.status(400).json({ error: "New password must be at least 12 characters and no more than 72 bytes." });
  }
  db.prepare("UPDATE admins SET password_hash = ?, updated_at = ? WHERE id = 1")
    .run(bcrypt.hashSync(newPassword, 12), now());
  return response.json({ ok: true });
});

app.get("/api/admin/settings", requireAdmin, (request, response) => response.json(readSettings()));
app.put("/api/admin/settings", requireAdmin, requireCsrf, (request, response) => {
  const input = request.body;
  try {
    const settings = {
      businessName: validateText(input.businessName, "Business name", 100, true),
      tagline: validateText(input.tagline, "Tagline", 160),
      address: validateText(input.address, "Address", 400, true),
      phone: validateText(input.phone, "Phone number", 30, true),
      email: validateText(input.email, "Contact email", 254, true),
      logoUrl: validateText(input.logoUrl || "", "Logo URL", 500),
      heroEyebrow: validateText(input.heroEyebrow, "Introduction heading", 100),
      heroCopy: validateText(input.heroCopy, "Introduction", 500),
      aboutCopy: validateText(input.aboutCopy, "About text", 800, true),
      colors: {}
    };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(settings.email)) throw new Error("Enter a valid contact email.");
    if (settings.logoUrl && !/^\/(?:uploads|assets)\/[A-Za-z0-9_-]+\.(?:png|jpe?g|webp)$/i.test(settings.logoUrl) &&
      !/^https:\/\/[^ ]+$/i.test(settings.logoUrl)) {
      throw new Error("Logo must use HTTPS or be uploaded through this panel.");
    }
    for (const color of ["green", "greenLight", "saffron", "cream"]) {
      const value = input.colors && input.colors[color];
      if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error(`Choose a valid ${color} colour.`);
      settings.colors[color] = value;
    }
    db.prepare("UPDATE settings SET data = ?, updated_at = ? WHERE id = 1").run(JSON.stringify(settings), now());
    return response.json(settings);
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }
});

const imageStorage = multer.diskStorage({
  destination: uploadsDir,
  filename(request, file, callback) {
    callback(null, `${crypto.randomUUID()}${file.safeExtension}`);
  }
});
const logoUpload = multer({
  storage: imageStorage,
  limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  fileFilter(request, file, callback) {
    const allowed = { "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp" };
    if (!allowed[file.mimetype]) return callback(new Error("Upload a PNG, JPG or WebP image."));
    file.safeExtension = allowed[file.mimetype];
    return callback(null, true);
  }
});
app.post("/api/admin/logo", requireAdmin, requireCsrf, logoUpload.single("logo"), (request, response) => {
  if (!request.file) return response.status(400).json({ error: "Choose a logo image first." });
  const header = fs.readFileSync(request.file.path).subarray(0, 12);
  const imageSignatures = {
    "image/png": header.length >= 8 && header.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
    "image/jpeg": header.length >= 3 && header[0] === 255 && header[1] === 216 && header[2] === 255,
    "image/webp": header.length >= 12 && header.toString("ascii", 0, 4) === "RIFF" && header.toString("ascii", 8, 12) === "WEBP"
  };
  if (!imageSignatures[request.file.mimetype]) {
    fs.unlinkSync(request.file.path);
    return response.status(400).json({ error: "The uploaded file is not a valid PNG, JPG or WebP image." });
  }
  const logoUrl = `/uploads/${path.basename(request.file.path)}`;
  const settings = readSettings();
  settings.logoUrl = logoUrl;
  db.prepare("UPDATE settings SET data = ?, updated_at = ? WHERE id = 1").run(JSON.stringify(settings), now());
  return response.json({ logoUrl });
});

function catalogueInput(input) {
  const kind = input.kind;
  if (!["destination", "service"].includes(kind)) throw new Error("Choose a valid content type.");
  const title = validateText(input.title, "Title", 100, true);
  const subtitle = validateText(input.subtitle || "", "Subtitle", 160);
  const description = validateText(input.description, "Description", 600, true);
  const imageUrl = validateText(input.imageUrl || "", "Image URL", 500);
  if (imageUrl && !imageUrl.startsWith("/uploads/") && !/^https:\/\/[^ ]+$/i.test(imageUrl)) {
    throw new Error("Image must use HTTPS or be uploaded through this panel.");
  }
  const displayOrder = Number(input.displayOrder || 0);
  if (!Number.isInteger(displayOrder) || displayOrder < 0 || displayOrder > 10000) throw new Error("Sort order must be a whole number from 0 to 10000.");
  return { kind, title, subtitle, description, image_url: imageUrl, display_order: displayOrder };
}

app.get("/api/admin/catalogue", requireAdmin, (request, response) => {
  response.json(db.prepare("SELECT * FROM catalogue ORDER BY kind, display_order, id").all());
});
app.post("/api/admin/catalogue", requireAdmin, requireCsrf, (request, response) => {
  try {
    const item = catalogueInput(request.body);
    const result = db.prepare(`
      INSERT INTO catalogue (kind, title, subtitle, description, image_url, display_order, created_at)
      VALUES (@kind, @title, @subtitle, @description, @image_url, @display_order, @created_at)
    `).run({ ...item, created_at: now() });
    return response.status(201).json({ id: result.lastInsertRowid });
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }
});
app.put("/api/admin/catalogue/:id", requireAdmin, requireCsrf, (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id < 1) return response.status(400).json({ error: "Invalid item." });
  try {
    const item = catalogueInput(request.body);
    const result = db.prepare(`
      UPDATE catalogue SET kind = @kind, title = @title, subtitle = @subtitle,
        description = @description, image_url = @image_url, display_order = @display_order,
        active = @active WHERE id = @id
    `).run({ ...item, active: request.body.active === false ? 0 : 1, id });
    if (!result.changes) return response.status(404).json({ error: "Item not found." });
    return response.json({ ok: true });
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }
});
app.delete("/api/admin/catalogue/:id", requireAdmin, requireCsrf, (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id < 1) return response.status(400).json({ error: "Invalid item." });
  const result = db.prepare("DELETE FROM catalogue WHERE id = ?").run(id);
  if (!result.changes) return response.status(404).json({ error: "Item not found." });
  return response.json({ ok: true });
});

app.get("/api/admin/enquiries", requireAdmin, (request, response) => {
  const status = typeof request.query.status === "string" ? request.query.status : "";
  if (status && !crmStatuses.includes(status)) return response.status(400).json({ error: "Choose a valid CRM status." });
  const rows = status
    ? db.prepare("SELECT * FROM enquiries WHERE status = ? ORDER BY created_at DESC").all(status)
    : db.prepare("SELECT * FROM enquiries ORDER BY created_at DESC").all();
  response.json({ statuses: crmStatuses, enquiries: rows });
});
app.patch("/api/admin/enquiries/:id", requireAdmin, requireCsrf, (request, response) => {
  const id = Number(request.params.id);
  const status = request.body.status;
  try {
    if (!Number.isInteger(id) || id < 1) throw new Error("Invalid enquiry.");
    if (!crmStatuses.includes(status)) throw new Error("Choose a valid CRM status.");
    const notes = validateText(request.body.notes || "", "Internal notes", 2000);
    const result = db.prepare("UPDATE enquiries SET status = ?, notes = ?, updated_at = ? WHERE id = ?")
      .run(status, notes, now(), id);
    if (!result.changes) return response.status(404).json({ error: "Enquiry not found." });
    return response.json({ ok: true });
  } catch (error) {
    return response.status(400).json({ error: error.message });
  }
});
app.post("/api/admin/enquiries/:id/resend", requireAdmin, requireCsrf, async (request, response) => {
  const id = Number(request.params.id);
  if (!Number.isInteger(id) || id < 1) return response.status(400).json({ error: "Invalid enquiry." });
  const enquiry = db.prepare("SELECT * FROM enquiries WHERE id = ?").get(id);
  if (!enquiry) return response.status(404).json({ error: "Enquiry not found." });
  try {
    await sendEnquiryEmail(enquiry, readSettings());
    db.prepare("UPDATE enquiries SET email_status = 'sent', updated_at = ? WHERE id = ?").run(now(), id);
    return response.json({ ok: true });
  } catch (error) {
    console.error(`Enquiry ${id} email resend failed:`, error.message);
    db.prepare("UPDATE enquiries SET email_status = ?, updated_at = ? WHERE id = ?").run(
      createTransport() ? "failed" : "not_configured", now(), id
    );
    return response.status(502).json({ error: "Email could not be sent. Check server SMTP settings and try again." });
  }
});

app.use((error, request, response, next) => {
  if (response.headersSent) return next(error);
  if (error instanceof multer.MulterError) {
    const message = error.code === "LIMIT_FILE_SIZE" ? "Logo files must be 3 MB or smaller." : "The logo upload could not be completed.";
    return response.status(400).json({ error: message });
  }
  if (error.message === "Upload a PNG, JPG or WebP image.") return response.status(400).json({ error: error.message });
  console.error("Request failed:", error);
  return response.status(500).json({ error: "An unexpected server error occurred." });
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Quicksilver Journeys listening on port ${port}`);
  if (!createTransport()) {
    console.warn("SMTP is not configured; enquiries will be saved, but email notifications will not be delivered.");
  }
});
