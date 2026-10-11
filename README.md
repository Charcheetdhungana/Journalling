# Daybook

A private trading journal and notebook. Plain HTML, CSS and JavaScript, with no build step.

## Areas

| Nav item | What it does |
| --- | --- |
| **Journal** | One entry per day, browsed by year and month. Each day holds a title, mood, text, photos and a **trade log** (any number of trades). |
| **Notebook** | Sections and topics for everything that is not a daily entry. |
| **Weekly recaps** | Per week (Monday to Sunday): trades taken, net profit or loss, winners and losers, win rate, a day-by-day table and every trade. All of it is worked out from the journal, nothing to type twice. Includes a free-text note for the week. |
| **Weekly watch list** | Tickers to watch that week, each with a level or reason and a done tick. Carries unfinished tickers over from the previous week. |

The watch list holds a **relative strength board** (groups, their leaders and one-week change) and a written plan for the week. **Update from Yahoo Finance** fills in the changes: it compares the last close of the week before with the close a week earlier, using Yahoo's public chart data through `functions/api/quotes.js`. That data is unofficial and has no key, so it can be rate limited or change without notice. Typing a change in by hand always works.

A trade counts as **closed** once it has a sold price. Closed trades make up profit or loss and the win rate. A trade with no sold price is shown as **open** and left out of the totals until you fill it in.

## Run it

Open `index.html` in a browser, or serve the folder:

```
npx serve .
```

Data is stored in the browser (IndexedDB), per address. `file://`, `localhost` and your live site are three separate stores, so use **Download backup** and **Restore from backup** (bottom of the Journal page) to move data between them.

## Sync across devices (optional)

`functions/api` is a Cloudflare Pages Function that syncs everything through a KV namespace, behind Cloudflare Access.

1. Create a Cloudflare Pages project from this repository (no build command, output directory `/`).
2. Create a KV namespace and bind it to the project as `DAYBOOK`.
3. Protect the site with a Cloudflare Access application.
4. Add the variables `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD` and, optionally, `ALLOWED_EMAIL`.

Without these the app still works, and the top bar shows "Sync not set up".

## Data keys

`e:YYYY-MM-DD` journal entry, `w:YYYY-MM-DD` week (recap note and watch list, keyed by its Monday), `s:<id>` notebook section, `n:<id>` notebook topic.
