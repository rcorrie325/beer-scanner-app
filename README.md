# Beer Scanner

A drink tracker for a small group of friends at a shared event. Scan a barcode
(or type it in), see your count go up, argue about the leaderboard.

Built for a phone held one-handed at a party: big targets, dark UI, and no path
that dead-ends if the camera doesn't work.

- Next.js 15 (App Router) + TypeScript + Tailwind v4
- SQLite via Prisma in dev, one line from Postgres
- No passwords, no email, no OAuth — you type a name and that's your account
- Barcode lookup against [Open Food Facts](https://world.openfoodfacts.org)

---

## Quick start

```bash
npm install
```

```bash
cp .env.example .env
```

```bash
npx prisma migrate dev
```

```bash
npm run db:seed
```

```bash
npm run dev
```

Open http://localhost:3000, type a name, and start logging.

`db:seed` loads the [beer catalog](#the-beer-catalog) — a few hundred common
beers, ciders and seltzers with real barcodes — so the first thing anyone points
a camera at is likely to resolve instantly, offline, with its ABV already
filled in. It's optional: skip it and every scan falls through to a live Open
Food Facts lookup exactly as before.

No users and no drinks are seeded. The first name you type is the first `User`
row, and every `DrinkLog` is something someone actually logged.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server on http://localhost:3000 |
| `npm run dev:https` | Dev server over HTTPS — **this laptop only**, the certificate doesn't cover your LAN IP |
| `npm run dev:lan` | Dev server over HTTPS with the LAN certificate, so phones can use the camera ([setup](#getting-the-scanner-working-on-phones)) |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Vitest suite |
| `npm run db:migrate` | Create/apply a migration |
| `npm run db:seed` | Load the beer catalog into `Beverage` (safe to re-run) |
| `npm run db:catalog` | Rebuild the catalog from Open Food Facts (slow, needs network) |
| `npm run db:reset` | Wipe everything, including the catalog — follow with `db:seed` to get it back |
| `npm run db:studio` | Browse/edit the data in Prisma Studio |

---

## Configuration

`.env`:

```bash
DATABASE_URL="file:./dev.db"
EVENT_TIMEZONE="America/New_York"
EVENT_DAY_START_HOUR="6"
```

`EVENT_TIMEZONE` and `EVENT_DAY_START_HOUR` decide what "today" and "this week"
mean. See [Time boundaries](#time-boundaries) below.

---

## Running it locally

This runs on your own machine only — nothing is deployed anywhere. Which command
you want depends on where the camera has to work:

| You want to… | Run | Camera? |
| --- | --- | --- |
| Use it on the laptop that's running it | `npm run dev` → `http://localhost:3000` | ✅ |
| Log drinks from phones, typing them in by hand | `npm run dev` → `http://<your-lan-ip>:3000` | ❌ |
| **Scan barcodes from phones** | See [Getting the scanner working on phones](#getting-the-scanner-working-on-phones) | ✅ |

Everything except the camera works fine over plain HTTP, so if you only need
phones to tap `+1` and argue about the leaderboard, `npm run dev` and your LAN
address is the whole setup.

### Getting the scanner working on phones

**Start the server and open your LAN address on the phone. That's it.**

```bash
npm run dev
```

```bash
ipconfig getifaddr en0
```

Open `http://<that address>:3000` on the phone, tap *Take a photo*. No
certificate, no tunnel, nothing to install — `/scan` hands the job to the
phone's own camera app and decodes the picture on the server. The rest of this
section is only needed for the **live** scanner at `/scan/live`.

#### Why the live scanner needs more

Browsers only hand out the camera in a *secure context*. `localhost` counts as
one even over HTTP, which is why the laptop just works. A LAN address like
`http://192.168.15.174:3000` does not — `navigator.mediaDevices` isn't merely
blocked there, it doesn't exist.

A file input has no such rule, which is the whole reason the photo scanner is
the default: it is the one that works on the network you actually have. The
live scanner is worth the setup only if you want the instant read of a video
stream — it gets several frames a second and needs just one to be sharp, where
a photo is a single attempt that a blurry shot wastes.

If you want it, the phones need to reach the dev server over **HTTPS, at your
LAN IP, with a certificate they trust**. That's three things, and the shortcut
only does one of them:

> `npm run dev:https` (i.e. `next dev --experimental-https`) issues a
> certificate for `localhost`, `127.0.0.1` and `::1` **only**. Phones hitting
> your LAN IP get a name-mismatch warning. It's for the laptop, not the party.

Do this instead, once:

**1. Install mkcert.**

```bash
brew install mkcert
```

**2. Create a local certificate authority and trust it on this Mac.** This
prompts for your password — it's writing to the system trust store.

```bash
mkcert -install
```

**3. Find your LAN address.** It was `192.168.15.174` when this was written, but
it changes when you rejoin a network, so check rather than assume.

```bash
ipconfig getifaddr en0
```

**4. Issue a certificate covering that address.** Substitute your own IP if step
3 printed something different. mkcert won't create the folder for you, so make
it first — `certificates/` is gitignored.

```bash
mkdir -p certificates
```

```bash
mkcert -key-file certificates/lan-key.pem -cert-file certificates/lan.pem localhost 127.0.0.1 192.168.15.174
```

**5. Start the server with it.**

```bash
npm run dev:lan
```

**6. Trust the CA on each phone.** The phones don't know your homemade authority
yet, so they'll refuse the certificate. Print the folder holding `rootCA.pem`:

```bash
mkcert -CAROOT
```

AirDrop or email `rootCA.pem` to the phone, then:

- **iOS** — two separate steps, and people always miss the second. First open
  the file and install it: Settings → General → **VPN & Device Management** →
  tap the downloaded profile → Install. Then turn it on: Settings → General →
  **About** → **Certificate Trust Settings** → toggle the mkcert entry on.
- **Android** — Settings → Security → Encryption & credentials → **Install a
  certificate** → **CA certificate**, then pick the file.

**7. Open `https://192.168.15.174:3000` on the phone** — `https`, not `http`,
and the IP, not `localhost`. Tap *Turn on camera* and allow the permission
prompt.

Steps 1, 2, 4 and 6 are one-time. Next party you just run `npm run dev:lan` —
unless your LAN IP changed, in which case redo 3, 4 and 5.

#### When it still doesn't work

The scanner names its own failure on screen. Match the message:

| On screen | What's wrong | Fix |
| --- | --- | --- |
| *"The live camera needs HTTPS"* | The phone is on `http://` | Go back to `/scan` and photo it, or finish the certificate steps above |
| Certificate / "Not Private" warning | The phone doesn't trust your CA | Step 6 — on iOS, check you did **both** halves |
| Page won't load at all | Not the certificate | Same wifi? Guest networks isolate clients. Also check the macOS firewall isn't blocking incoming connections for Node |
| *"Camera permission denied"* | You dismissed the prompt | Allow it in the browser's site settings, then *Try again* |
| *"No camera available"* | Rare on phones | Another app may hold the camera — close it |
| *"The scanner couldn't start"* | No barcode reader | Both engines failed; manual entry still works |

Every one of these ends at manual entry rather than a dead end, so nobody at the
party is ever stuck — worst case they type the beer in, or search the
[catalog](#the-beer-catalog).

### A word on who can log what

There is no auth beyond a cookie holding a user id. Anyone who can reach the
server can log a drink as anyone. That's the intended trade-off for a party app
on a private wifi — just don't expose the port to the internet and expect the
leaderboard to stay honest.

---

## Moving to Postgres

Not needed to run locally — SQLite is fine, and the whole database is one file
at `prisma/dev.db`. If you ever do want Postgres, it's one line in
`prisma/schema.prisma`:

```prisma
datasource db {
  provider = "postgresql"   // was "sqlite"
  url      = env("DATABASE_URL")
}
```

Then point `DATABASE_URL` at your Postgres instance and run
`npx prisma migrate dev`.

Nothing else changes. The schema deliberately avoids SQLite-only and
Postgres-only features: no native enums, no `@db.*` attributes, and the two
places where `LIKE` semantics differ between the databases (user name matching
and beverage search) filter in application code instead of SQL.

---

## How it works

### Screens

| Route | What it is |
| --- | --- |
| `/welcome` | Name entry / user picker |
| `/` | Today + all-time counts, big scan button, recent drinks with `+1` and undo |
| `/scan` | Photograph a barcode; the server decodes it. The default, and the only one that works without HTTPS |
| `/scan/live` | Live camera preview, for when you have a secure context |
| `/confirm/[id]` | Beverage details, quantity stepper, Save |
| `/add` | Searchable list of known beverages + new-beverage form |
| `/leaderboard` | Everyone ranked, filterable by today / week / all time |
| `/beverage/[id]` | Who has drunk it and how many times |

### Auth

First visit asks for a display name and creates a `User`. The id goes into a
ten-year httpOnly cookie, so the device stays signed in indefinitely. "Switch
user" clears the cookie and returns to the picker, which lists existing names so
a shared phone is a single tap. Typing a name that already exists adopts that
user rather than creating a near-duplicate — at a party there is one Dave.

There is no password reset, no OAuth and no session expiry, by design.

### Barcode scanning

Two scanners, and the default is the photo one.

**`/scan` — photograph it.** The phone's own camera app takes the picture, the
browser shrinks it to 1600px (which also turns an iPhone's HEIC into a JPEG),
and the server decodes it: zbar first, ZXing as a second attempt on anything it
misses. Every phone gets the same reader this way, and because a file input
isn't gated on a secure context, it works over plain HTTP — no certificate, no
tunnel. zbar is unfussy enough to read a barcode sideways, or at a couple of
pixels per bar.

zbar has to sit in `serverExternalPackages`; bundling mangles its WebAssembly
loader into a `t is not a function` that surfaces as "no barcode here" rather
than as a build error.

**`/scan/live` — watch it.** Two engines picked at runtime:

- **`BarcodeDetector`** (Chrome/Android) — native, no bundle cost.
- **ZXing**, lazily imported, everywhere else. iOS Safari has no
  `BarcodeDetector`.

Both read the whole video frame, not a cropped region, so a barcode anywhere in
the picture counts — the corner marks on screen are decoration.

The trade between them is frames. The live scanner gets several a second and
needs only one to be sharp; a photo is a single attempt, and a blurry one is a
failure you have to notice and repeat. That's the cost of not needing a
certificate.

Either way the result goes through the same `resolveBarcodeAction`, so the two
can't drift apart or create competing rows for one tin.

EAN-13, EAN-8 and UPC-A are supported. UPC-A is normalised to its EAN-13 form
(leading zero) so the same bottle can't become two rows.

A decoded barcode is resolved in this order:

1. **Our own `Beverage` table** — beverages are global, so a barcode anyone has
   ever scanned resolves with no network call. This is also where the seeded
   [beer catalog](#the-beer-catalog) lives, so common beers land here on the
   first scan rather than the second.
2. **Open Food Facts** — a hit is written to `Beverage` with `source: "scan"`,
   which is what makes step 1 work next time.
3. **"Which beer is it?"** — the catalog, searchable, with the guessed brand
   already applied as the filter. Tapping a beer attaches the scanned code to
   that row rather than making a second one, so the beer is scannable from then
   on. Not listed? The form below it creates a new beverage, `source: "manual"`.

Step 3 is where the catalog's gaps get filled. Open Food Facts has no usable
code for a fair few well-known beers — Samuel Adams, Fat Tire, Shiner Bock —
and no product database reliably does, because US beer is regulated by the TTB
rather than the FDA, carries no nutrition label, and so never enters one. Those
beers are seeded with a null barcode so they're at least findable by name, and
the can in someone's hand supplies the code that a database can't.

Nothing learned this way is per-user: `Beverage` has no `userId`, only
`DrinkLog` does. One person identifying a case fixes it for the whole party.

The brand guess in step 3 comes from the barcode itself. A GTIN opens with a GS1
company prefix issued to one manufacturer, so an unknown code sharing a long
enough head with catalog beers almost certainly came from that brewery. The app
tries 9, then 8, then 7 digits, and only uses a prefix where every beer under it
agrees on a brand — a split vote means the prefix pool is shared and the guess
is worthless. It can never name the beer, only the brewery, so it lands in an
editable field and is never saved on its own.

Explicitly handled:

- **Duplicate rapid scans** — one physical scan emits a burst of identical
  reads. The scanner ignores repeats of the same code for 3 seconds and never
  runs two lookups at once.
- **Open Food Facts down or slow** — 6-second timeout; the error is shown with a
  link straight to the manual form.
- **Non-beer products** — OFF will happily return crisps. The mapper flags a
  product whose categories don't look alcoholic, and the confirm screen warns
  before you add shampoo to your total.
- **Camera permission denied / no camera / unsupported browser / insecure
  context** — each gets its own message, and all four keep the manual path one
  tap away.

### The beer catalog

`npm run db:seed` pre-loads a few hundred common beers — US macros, the big
imports, German and Belgian staples, the usual craft IPAs, plus ciders, hard
seltzers and Twisted Tea — as ordinary `Beverage` rows with `source: "catalog"`.

The point isn't that Open Food Facts can't find these. It's that the lookup is
the part that breaks: a phone on crowded guest wifi, six people scanning at
once, OFF occasionally timing out. Seeded rows resolve from the local database
in milliseconds with no network at all, and because each one carries a pinned
ABV and a single-serving volume, the standard-drink maths works on the first
scan instead of showing *"no ABV data"*. They're searchable too, so the
camera-free path is useful on night one rather than after everyone has scanned
their way through the fridge.

**Barcodes are never invented.** A GTIN can't be derived from a beer's name, and
a wrong one is worse than a missing one — it would silently attach the wrong
drink, and the wrong strength, to somebody's scan. So the catalog is built in
two halves:

| File | What's in it | Who writes it |
| --- | --- | --- |
| `scripts/beer-catalog.source.mjs` | Facts about each beer: name, brand, style, ABV, serving size, and the keywords that identify it | You, by hand |
| `prisma/beer-catalog.json` | The same beers with real barcodes attached | `npm run db:catalog`, from Open Food Facts |

`db:catalog` asks OFF which codes it holds for each brand and keeps only those
whose product name confirms the specific beer: every keyword present, no
excluded term, exactly one catalog entry matched, a category that looks like a
drink, and an ABV within 1% of what we expected. Where OFF has its own ABV it
wins — the same brand is brewed to different strengths for different markets,
and the barcode is what identifies the market. Volumes are read from the
free-text `quantity` field first, because that keeps the per-bottle size in a
multipack ("6 x 33 cl" → 330) where the numeric `product_quantity` gives the
1980 ml total. Anything outside 100–1000 ml is treated as a keg or a data-entry
slip and replaced with the entry's own serving size.

Two things it will not accept: a barcode whose GS1 check digit doesn't add up
(OFF is crowd-sourced and holds plenty of hand-typed codes that are a digit
off — one of those in the catalog would shadow a real beer forever), and a
product OFF categorises as something other than a drink. Uncategorised products
*are* accepted, because most American beers on OFF have no categories at all
and requiring one threw away nearly every US brand. EAN-8 is accepted too:
Mexican brewers really do print it, and excluding it cost every Corona, Tecate
and Dos Equis.

To add beers, append to `scripts/beer-catalog.source.mjs` and re-run
`npm run db:catalog` (or `-- --brand <off-slug>` for one brand — it's rate
limited to OFF's 10 requests a minute and a full run takes a while), then
`npm run db:seed`. The generated JSON is committed, so seeding itself needs no
network.

When a beer you expected doesn't come back with a barcode, ask why:

```bash
node scripts/probe-brand.mjs samuel-adams yuengling
```

It prints what OFF holds under each brand slug and which rule turned each
product away. Usually the answer is that OFF names the beer differently —
Yuengling is filed as plain "Yuengling", with the word "Lager" nowhere in it —
which is a keyword fix. Sometimes OFF simply doesn't have the beer, and about
45 entries in the catalog are in that position: searchable by hand, but nothing
to match a scan against. That's the honest outcome, and better than attaching a
guessed code to them.

Re-seeding is safe and idempotent. Rows with `source: "scan"` or `"manual"` are
never touched, so a beer someone corrected by hand stays corrected; only
`"catalog"` rows are refreshed, which is what makes fixing an ABV in the catalog
actually take effect. Catalog rows that have dropped out of the JSON are cleared
away so rebuilds don't leave their rejects behind — but only while nothing has
been logged against them. A row with drinks on it stays forever, because
deleting it would cascade those logs off the leaderboard.

### Time boundaries

`loggedAt` is stored in UTC. "Today" and "this week" are computed against a
single event timezone (`EVENT_TIMEZONE`), never the server locale or the phone's
clock, so everyone's leaderboard agrees.

The day rolls over at `EVENT_DAY_START_HOUR` (default 6am), so a night that runs
past midnight stays on one day: a drink logged at 2am belongs to the previous
evening's session. Weeks start on Monday at the same hour.

All of it is implemented with `Intl.DateTimeFormat` — no date library — and
resolves wall-clock times through the zone twice so daylight-saving days come
out right (the fall-back session really is 25 hours long).

### Standard drinks

Where both ABV and volume are known:

```
grams of alcohol = volumeMl × (abv / 100) × 0.789
standard drinks  = grams / 14
```

Where either is missing, the drink counts towards the raw number only and the UI
says how many servings it couldn't score. **A missing ABV is never replaced with
a default** — one guessed number quietly poisons every total on the board.

### Undo

Every `DrinkLog` is soft-deleted by setting `deletedAt`, and only by the user who
created it. Every count, the leaderboard and the beverage detail page filter on
`deletedAt: null`, so an undone drink disappears everywhere at once. You get a
toast with undo immediately after saving, plus a permanent undo on the newest
entry in the recent list. The saved log id travels back on the URL
(`/?undo=<id>`), so undo survives a refresh with no client-side state.

---

## Tests

```bash
npm test
```

Vitest, no database or browser needed. Covers:

- **Barcode lookup** against a mocked Open Food Facts — hit, miss (`status: 0`,
  HTTP 404, nameless product), network failure, timeout, 5xx, malformed JSON —
  plus the field mapping: volume parsing (`330 ml`, `33 cl`, `0,33 l`, `12 fl oz`,
  `6 x 330 ml`), ABV extraction, style derivation, non-beer detection, and
  UPC-A → EAN-13 normalisation.
- **Day-boundary logic** — 6am rollover, event timezone vs UTC, month and year
  boundaries, both daylight-saving transitions, and week starts.
- **Standard-drink maths** — including every missing-data case, so a regression
  that starts guessing an ABV fails the suite.
- **The beer catalog itself** — every shipped barcode is checked for being
  scannable, unique to one beer, and carrying one plausible serving. Seeded rows
  bypass Open Food Facts forever, which makes bad catalog data permanent and
  invisible; a multipack volume sneaking in would score six drinks for one can.
  Plus the GS1 prefix helper behind the brand guess.

---

## Data model

```
User      id, displayName (unique), createdAt
Beverage  id, barcode (unique, nullable), name, brand, style, abv, volumeMl,
          imageUrl, source ('scan' | 'manual' | 'catalog'), createdAt
DrinkLog  id, userId, beverageId, quantity, loggedAt, deletedAt
```

Beverages are global and shared: scanning a barcode someone else already scanned
reuses their row. `abv` and `volumeMl` are nullable and stay null when unknown.

### Layout

```
prisma/
  schema.prisma          datasource provider is the only Postgres switch
  migrations/            checked in
  seed.mjs               loads the catalog; never overwrites user-owned rows
  beer-catalog.json      generated — beers with real Open Food Facts barcodes
scripts/
  beer-catalog.source.mjs  the hand-written beer list (no barcodes)
  catalog-matching.mjs     pure rules for "is this product that beer?"
  build-beer-catalog.mjs   fetches and verifies barcodes for it
  probe-brand.mjs          why did this brand match nothing?
src/
  app/                   routes (see the table above) + /api/beverages search
  actions/               server actions: users, beverages, logs
  components/            Scanner, stepper, undo toast, forms, shell
  lib/
    time.ts              event timezone + 6am day boundary
    standard-drinks.ts   grams of ethanol -> standard drinks
    openfoodfacts.ts     lookup + field mapping (hit / miss / error)
    barcode.ts           EAN-13, EAN-8, UPC-A normalisation
    queries.ts           read models; every one filters deletedAt
    validation.ts        zod schemas for every input
    session.ts           the cookie
tests/                   vitest
```

All server logic lives in Server Actions or Route Handlers, and every input is
validated with zod before it reaches the database.

### Empty states

No users and no drinks are ever seeded, so every screen has to look deliberate
with nothing in it: the welcome screen shows just the name box until someone
signs in, Home says *"Nothing yet. Scan something."*, the leaderboard says *"No
one has signed in yet."*, and the manual list says *"Nothing matches. Add it
below."* — which it still does if you skip `db:seed`, or search for a beer the
catalog doesn't carry.

---

## Out of scope, deliberately

No analytics, no external auth provider, no payments, no PWA or offline sync.
