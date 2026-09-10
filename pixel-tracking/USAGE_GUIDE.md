# Pixel Tracking System — Usage Guide

> **Audience:** Store admins with no technical background.
> **Last updated:** February 2026

---

## What This System Does

This is a **marketing pixel and conversion tracking system** built into your store. It does what Shopify charges $50+/month for third-party apps to do: it sends data about what your customers do (view products, add to cart, purchase) to advertising platforms so they can:

1. **Track conversions** — "Did my Facebook ad actually lead to a sale?"
2. **Build audiences** — "Show my ad to people similar to my buyers"
3. **Optimize ad spend** — Platforms learn which users convert and show ads to similar people

---

## Dashboard Pages

| Page | URL | What it does |
|------|-----|--------------|
| **Pixels & Tracking** | `/dashboard/admin/pixels` | Connect your ad platform accounts |
| **Custom Events** | `/dashboard/admin/pixels/custom-events` | Create custom tracking events |
| **Event Log** | `/dashboard/admin/pixels/events` | See every event your store fired |
| **Analytics** | `/dashboard/admin/analytics` | Overview of sessions, funnels, channels |

---

## 1. Connecting a Pixel

Go to **`/dashboard/admin/pixels`** → Click **"Add Pixel"**.

### Which platform & what credentials do I need?

| Platform | Pixel ID | Access Token | Where to get them |
|----------|----------|-------------|-------------------|
| **Meta (Facebook / Instagram)** | 15-digit number, e.g. `123456789012345` | Starts with `EAAGm0PX4ZCps...` | [Meta Events Manager](https://business.facebook.com/events_manager) → Your Pixel → Settings → **Pixel ID**. For server-side: Settings → **Generate Access Token** |
| **Google Analytics 4** | Measurement ID, e.g. `G-XXXXXXXXXX` | API Secret string | [Google Analytics](https://analytics.google.com) → Admin → Data Streams → your stream → **Measurement ID**. For server-side: Admin → Data Streams → **Measurement Protocol API secrets** → Create |
| **TikTok** | Pixel Code, starts with `C`, e.g. `CXXXXXXXXXXXXXXXXX` | TikTok Marketing API token | [TikTok Ads Manager](https://ads.tiktok.com) → Assets → Events → Web Events → your pixel |
| **Snapchat** | Pixel ID (UUID format) | Snapchat Marketing API token | [Snapchat Ads Manager](https://ads.snapchat.com) → Events Manager → your pixel |
| **Pinterest** | Tag ID (13-digit number) | Pinterest API token | [Pinterest Ads](https://ads.pinterest.com) → Conversions → your tag |

### What are the toggles?

| Toggle | What it does |
|--------|-------------|
| **Enabled** | Master on/off switch for this pixel |
| **Client-Side** | Loads the platform's JavaScript on your store pages (e.g., Facebook's `fbq` script). Easy setup but ad-blockers can block it |
| **Server-Side** | Your server sends events directly to the platform's API. Can't be blocked by ad-blockers. **Requires an Access Token** |
| **Consent Required** | If ON, this pixel only fires after the visitor accepts cookies (GDPR compliance) |
| **Consent Category** | `analytics` = GA4-type tracking, `marketing` = ad pixels (Meta, TikTok, Snapchat, Pinterest) |

### Example: Adding a Meta (Facebook) Pixel

1. Click **Add Pixel**
2. Platform: **Meta (Facebook/Instagram)**
3. Pixel ID: `123456789012345` *(from Meta Events Manager)*
4. Access Token: `EAAGm0PX4ZCps...` *(from Meta Events Manager → Settings → Generate Access Token)*
5. Enable both **Client-Side** and **Server-Side**
6. Turn on **Consent Required** → set category to **marketing**
7. Click **Save**

### Example: Adding Google Analytics 4

1. Click **Add Pixel**
2. Platform: **Google Analytics 4**
3. Pixel ID: `G-ABC123XYZ` *(your GA4 Measurement ID)*
4. Access Token: `xYz1234...` *(your Measurement Protocol API secret)*
5. Enable **Client-Side** (and optionally **Server-Side**)
6. Turn on **Consent Required** → set category to **analytics**
7. Click **Save**

### Testing your pixel

Click the **test tube icon** (🧪) on any pixel card. This fires a test `page_viewed` event. Then check your platform's dashboard (Meta Events Manager, Google Analytics Realtime, etc.) — you should see it appear within a few minutes.

---

## 2. What Gets Tracked Automatically

Once at least one pixel is connected, these events fire **with zero configuration**:

| Event | When it fires |
|-------|--------------|
| `page_viewed` | Every page load and client-side navigation |
| `product_viewed` | Customer views a product detail page |
| `product_added_to_cart` | Customer adds an item to their cart |
| `product_removed_from_cart` | Customer removes an item from their cart |
| `cart_viewed` | Customer views their cart |
| `checkout_started` | Customer begins the checkout flow |
| `checkout_completed` | Customer completes a purchase |
| `search_submitted` | Customer searches for something |
| `registration_completed` | New customer creates an account |
| `login_completed` | Customer logs in |

### Engagement events (also automatic)

| Event | When it fires |
|-------|--------------|
| `scroll_depth_25` | Customer scrolls 25% down the page |
| `scroll_depth_50` | Customer scrolls 50% down the page |
| `scroll_depth_75` | Customer scrolls 75% down the page |
| `scroll_depth_90` | Customer scrolls 90% down the page |
| `time_on_page_30` | Customer spends 30 seconds on a page |
| `time_on_page_60` | Customer spends 60 seconds on a page |
| `time_on_page_120` | Customer spends 2 minutes on a page |
| `time_on_page_300` | Customer spends 5 minutes on a page |

---

## 3. Custom Events

Go to **`/dashboard/admin/pixels/custom-events`** → Click **"Create Event"**.

Custom events let you track things **specific to your store** that aren't covered by the automatic events above.

### Fields

| Field | What it means | Example |
|-------|--------------|---------|
| **Event Name** | Internal snake_case identifier | `newsletter_signup` |
| **Display Name** | Human-readable label | `Newsletter Signup` |
| **Description** | Optional notes for yourself | `Fires when visitor subscribes to our mailing list` |
| **Trigger Type** | When should this event fire? | See below |

### Trigger Types

| Type | What it does | What to configure |
|------|-------------|-------------------|
| **Manual** | Only fires when you call it from code | Nothing — you invoke `trackEvent('your_event')` in your code |
| **CSS Selector Click** | Fires when someone **clicks** an element matching a CSS selector | Enter a CSS selector, e.g. `.buy-now-btn`, `#hero-cta`, `button[data-action="download"]` |
| **URL Pattern Match** | Fires when customer **visits a URL** matching a regex pattern | Enter a regex, e.g. `/products/.*sale`, `/thank-you` |
| **Time on Page** | Fires after the customer has been on a page for **X seconds** | Enter seconds, e.g. `30` |

### Practical Examples

| Goal | Trigger Type | Config |
|------|-------------|--------|
| Track "Download Catalog" button clicks | CSS Selector Click | `#download-catalog-btn` |
| Track visits to sale pages | URL Pattern Match | `/collections/.*sale` |
| Track highly engaged visitors (2+ minutes) | Time on Page | `120` |
| Track a custom JS interaction | Manual | *(call `trackEvent('your_event')` in code)* |

### Custom Data

You can attach key-value data to any custom event. For example, a `catalog_download` event might include `{ format: "pdf", catalog_name: "Spring 2026" }`.

### Platform Name Overrides

Different platforms may use different event names. You can map your custom event to platform-specific names:
- Your event: `newsletter_signup`
- Meta: `Lead`
- Google GA4: `generate_lead`
- TikTok: `SubmitForm`

### Test Fire

Click the **Test Fire** button to verify the event fires correctly. Check your Event Log (`/dashboard/admin/pixels/events`) to confirm.

---

## 4. Event Log

Go to **`/dashboard/admin/pixels/events`**.

This page shows **every tracking event** your store has fired:

- **Event name** and timestamp
- **Page URL** where it was triggered
- **Delivery status** per platform — did it successfully reach Meta, Google, etc.?
- **Stats cards** — total events for last 24 hours, 7 days, 30 days
- **Filters** — filter by status (all / success / failed / pending)

### Use this to debug:
- "Did my purchase event actually get sent to Meta?" → Check the log
- "Why isn't my TikTok pixel receiving events?" → Look for failed deliveries
- "How many events are we firing per day?" → Check the stats cards

---

## 5. Analytics Dashboard

Go to **`/dashboard/admin/analytics`**.

### Overview Cards
High-level metrics: total sessions, pageviews, conversion rate, average order value — with 7-day trend indicators.

### Conversion Funnel
Visual bar chart showing the customer journey and where people drop off:

```
Page Viewed (48,293)  →  Product Viewed (18,742)  →  Added to Cart (5,621)  →  Checkout Started (2,103)  →  Purchase Completed (1,562)
                           ↓ -61.2% drop                ↓ -70.0% drop             ↓ -62.6% drop                ↓ -25.7% drop
```

### Channel Breakdown
Which traffic sources drive the most revenue:

| Channel | What it means |
|---------|--------------|
| **Organic** | People who found you via Google/Bing search |
| **Paid Meta** | People who clicked a Facebook/Instagram ad |
| **Paid Google** | People who clicked a Google ad |
| **Paid TikTok** | People who clicked a TikTok ad |
| **Direct** | People who typed your URL directly |
| **Email** | People who clicked a link in your emails |
| **Social** | Organic social media traffic (not paid) |
| **Referral** | People who came from another website |

You can switch between **attribution models**:
- **First Touch** — 100% credit to whatever first brought the customer to your store
- **Last Touch** — 100% credit to the last thing before they purchased
- **Linear** — Equal credit split across all touchpoints

### Platform Health
Shows whether your pixel connections are working:
- ✅ **Healthy** — 99%+ delivery success rate
- ⚠️ **Degraded** — Some failures, investigate in Event Log
- 🔴 **Down** — Platform not receiving events

---

## 6. Consent Banner (GDPR)

When a customer first visits your store, a cookie consent banner appears at the bottom.

| Choice | What happens |
|--------|-------------|
| **Accept All** | All pixels fire (analytics + marketing) |
| **Reject All** | Only essential/functional tracking — no ad pixels fire |
| **Customize** | Customer picks which categories to allow |

Consent categories:
- **Functional** — Always on. Session tracking, shopping cart. No pixel data sent to ad platforms.
- **Analytics** — Page views, scroll depth, engagement. Affects: Google GA4.
- **Marketing** — Ad pixels, retargeting, conversion tracking. Affects: Meta, TikTok, Snapchat, Pinterest.

If you marked a pixel as **Consent Required** (recommended for GDPR compliance), it only fires after the visitor consents to that category.

The system stores consent decisions in the database for **audit trail** purposes (required by GDPR).

---

## 7. UTM & Campaign Tracking

When someone clicks your ad or email link with UTM parameters, the system **automatically captures** everything:

### UTM Parameters
| Parameter | Example | Purpose |
|-----------|---------|---------|
| `utm_source` | `facebook`, `google`, `newsletter` | Where the traffic came from |
| `utm_medium` | `cpc`, `social`, `email` | Type of traffic |
| `utm_campaign` | `summer_sale_2026` | Which campaign |
| `utm_term` | `blue sneakers` | Search keyword (for paid search) |
| `utm_content` | `banner_v2` | Which ad variation |

### Click IDs (automatic)
| Parameter | Platform | Example |
|-----------|----------|---------|
| `fbclid` | Meta (Facebook) | Auto-appended to Facebook ad clicks |
| `gclid` | Google Ads | Auto-appended to Google ad clicks |
| `ttclid` | TikTok | Auto-appended to TikTok ad clicks |
| `ScCid` | Snapchat | Auto-appended to Snapchat ad clicks |
| `epik` | Pinterest | Auto-appended to Pinterest ad clicks |

The system saves both **first-touch** (the very first visit) and **last-touch** (the most recent visit) UTM data in cookies, so you can see the full customer journey.

---

## Quick Start Checklist

- [ ] Go to `/dashboard/admin/pixels`
- [ ] Add at least one pixel (Meta or Google GA4 are the most common)
- [ ] Click the test button (🧪) to verify events reach the platform
- [ ] Check `/dashboard/admin/pixels/events` to see events flowing
- [ ] *(Optional)* Create custom events for store-specific actions
- [ ] *(Optional)* View `/dashboard/admin/analytics` for funnel and channel insights

---

## Troubleshooting

| Problem | Check |
|---------|-------|
| Events not appearing in Meta Events Manager | Is the pixel enabled? Is client-side and/or server-side toggled on? Is the Pixel ID correct? Check Event Log for delivery failures. |
| Event Log shows "failed" deliveries | Usually an invalid Access Token. Re-generate it from the platform and update the pixel config. |
| GA4 real-time not showing events | Measurement Protocol events can take a few minutes. Ensure your Measurement ID starts with `G-` and the API Secret is correct. |
| Consent banner not showing | It only shows on the first visit. Clear cookies or open an incognito window. |
| Ad-blocker blocking events | Enable **Server-Side** tracking — it sends events from your server, not the customer's browser. |
| Custom event not firing | Check the trigger type config. For CSS Selector: make sure the element exists on the page. For URL Match: test your regex pattern. |
