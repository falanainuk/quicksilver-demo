# Quicksilver Journeys website

This is a Node.js website for Quicksilver Journeys, an India-based travel business offering inbound India tours and outbound holidays. It includes a password-protected administration area, a SQLite enquiry CRM, and SMTP email notifications.

## Run locally

1. Install Node.js 22.
2. In this folder, run `npm install`.
3. Copy `.env.example` to `.env`.
4. Set a private `ADMIN_USERNAME`, a unique `ADMIN_PASSWORD` (12-72 bytes), and a random `SESSION_SECRET` (at least 32 characters). For example, generate a session secret with `node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"`.
5. Set `NODE_ENV=development` for local HTTP testing.
6. Configure the SMTP variables below.
7. Run `npm start` and open `http://localhost:3000`. The private admin sign-in page is at `http://localhost:3000/admin`.

The first run creates the admin account from `.env`. The database is not overwritten on later starts; change the admin password in the signed-in panel. If the database is deleted, it will be recreated from the current `.env` values.

## Email delivery

The enquiry form saves each request in the CRM and sends an email to the contact email currently saved in the admin profile. Set `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` and `SMTP_FROM` to the values from an SMTP relay or transactional email provider. Use a sender address verified with that provider. Do not put SMTP credentials in browser code, public files, or a public repository.

The supplied contact address is Proton Mail. Receiving enquiry notifications there works when the configured SMTP provider can deliver to it; sending mail *from* Proton Mail may require a supported Proton Mail Bridge setup and is not configured by this project. The admin CRM records enquiries even when notification delivery fails and provides a retry action.

## Admin features

- Update business name, tagline, description, address, phone, contact/notification email and logo.
- Change the primary, accent, highlight and background theme colours.
- Add, update, hide and delete India and international destination cards and travel service cards.
- View website enquiries, add private follow-up notes, filter and update CRM status (`New`, `Contacted`, `In progress`, `Converted`, `Closed`).
- Retry failed or unconfigured email notifications and change the admin password.

## Production notes

- Deploy to a Node.js host with HTTPS. Set `NODE_ENV=production`; session cookies are then marked `Secure`.
- Keep `.env`, SMTP credentials, the SQLite database, and uploaded logos private. Do not commit `.env`.
- Set `DATA_DIR` to persistent storage on the host and back up that directory, including the SQLite database and session database. Back up `public/uploads/` separately to preserve uploaded logos.
- If the app runs behind one trusted reverse proxy/load balancer, configure `TRUST_PROXY=true` so secure cookies and rate limiting use the correct connection information.
- Keep the admin password unique and protect access to the `/admin` URL; the login, not URL obscurity, secures the panel.
- The admin profile email controls where enquiry alerts are delivered. Changing the contact email also changes the notification recipient.
- Visa decisions and processing remain with the relevant authorities; the website does not guarantee outcomes.

## Render free demo

`render.yaml` prepares a Singapore-region Render free web service with a `/health` check, production cookies, and Render-generated values for the session secret and admin password. To publish it, put this project in a Git repository you control, connect that repository to your Render account, and create a Blueprint from `render.yaml`. The initial admin username is `admin`; retrieve the generated password from the service's environment settings after the first deployment, then change it after signing in.

If you created the Render service manually instead of creating a Blueprint, the YAML changes do not automatically configure that existing service. In the Render Dashboard, open the service's **Environment** settings and set `ADMIN_USERNAME` to `admin`, `ADMIN_PASSWORD` to a private unique password of 12-72 bytes, and `SESSION_SECRET` to a private random value of at least 32 characters. Save the changes and redeploy. Do not put any of these secret values in GitHub, `render.yaml`, or chat.

This free tier is for demonstration only. The service can sleep after inactivity, and its filesystem is temporary: the CRM database, sessions and uploaded logos can be lost on restarts or redeploys. Enquiry records are retained only while that instance's local storage survives. Render's free web services block outbound SMTP ports 25, 465 and 587, so email notifications will not be delivered from this demo; the website can still record enquiries in the CRM. Use a persistent paid service/storage and a supported email delivery provider for a live business site.

The deployment is not published by this project preparation. You control the source repository and must connect it and deploy through your Render account to create the public URL.
