import { chromium } from "@playwright/test";
const base = "http://127.0.0.1:4173";
const b = await chromium.launch();
const p = await b.newPage();
await p.goto(`${base}/partner`, { waitUntil: "networkidle" });
console.log("URL after /partner :", new URL(p.url()).pathname);
console.log("H1               :", (await p.locator("h1,h2").first().textContent().catch(() => "?"))?.trim().slice(0, 60));
// Back must not bounce: <Navigate replace> means Back leaves the app, not returns to /partner
await p.goto(`${base}/`, { waitUntil: "networkidle" });
await p.click('header a[href="/partner/join"]').catch(() => p.goto(`${base}/partner`));
console.log("URL from nav link:", new URL(p.url()).pathname);
await b.close();
