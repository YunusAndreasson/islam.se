# Check islam.se store attribution

Use the signed-in store consoles to check the two website campaigns that went live on **November 21, 2026**. This is a read-only check.

1. **App Store Connect.** Open islam.se (App Store ID `6774383118`), go to **Analytics → Metrics**, choose **First-Time Downloads**, and filter by campaign `web-safari-banner`. Apple may hide the campaign until it has five first-time downloads and has been live for at least 24 hours.
2. **Google Play Console.** Open islam.se (package `se.islam.mobile`), go to **Grow users → Store listing performance**, filter traffic to **Ads and referrals**, and select UTM campaign `web-android-strip`. Use the downloadable acquisition report for **store listing acquisitions** if the dashboard shows clicks.

Every other store link on the site carries a campaign of its own, the same token in both stores (`APP_CAMPAIGNS` in `src/lib/app.ts`): `web-home` (the front page's closing band), `web-app-page` (/app/), `web-city` (every /bonetider/<stad>/), `web-metod` and `web-ramadan`. Check them the same way once they have been live for a day.

For each store, report the count and the latest date covered. If the campaign is missing, say whether the report covers any dates on or after November 21. Record a missing or suppressed result separately from a reported zero.

## Result, November 21, 2026 (evening)

Both campaigns are live: the Safari banner meta on islam.se and islam-se.pages.dev carries `affiliate-data=pt=2189605&ct=web-safari-banner`, and `/bonetider/` links to Play with `utm_campaign=web-android-strip`.

| Store | Campaign | Count | Latest date covered | Status |
| - | - | - | - | - |
| App Store Connect | `web-safari-banner` | — | Nov 20, 2026 | **Missing, not zero**: the report ends the day before launch. **Acquisition → Campaigns** says »There isn't enough data to display campaigns« for Oct 22 – Nov 20. |
| Google Play Console | `web-android-strip` | — | Nov 20, 2026 | **Missing, not zero**: the reports end the day before launch. A requested range of Nov 14–21 was cut back to Nov 14–20. |

App Store Connect notes:
- Without a campaign filter, **First-Time Downloads** totals 115 for Oct 22 – Nov 20, with 3 on Nov 20. Days are counted in UTC.
- **Analytics → Acquisition → Campaigns** is the most direct place to look; the **Metrics** filter is the other route.

Play Console notes:
- The old **Store listing performance** page is now **Grow users → Store performance → Store analysis**. That page sends acquisition and traffic-source data to the **Grow users** overview, and its **Dive deeper** link opens **Statistics**.
- The overview's **Device acquisitions** breakdown by traffic source covers Oct 24 – Nov 20: 57 acquisitions, of which 17 came from Google Play explore, 36 were paid and direct, and 4 were not attributed. It has no UTM campaign dimension, so referral campaigns have to come from the downloadable store listing acquisitions report.

Run it again on **November 23 or later**. Apple needs 24 hours and five first-time downloads before a campaign shows, and Play's data runs about a day behind.
