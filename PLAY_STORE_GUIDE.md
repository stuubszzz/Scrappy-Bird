# Publishing Scrappy Bird on Google Play, step by step

Written for a first-time publisher. Each numbered step is one thing to do. Expect the whole process to take about two weeks of calendar time, most of it waiting.

## Before you start: what you already have

- `release/scrappy-bird-<version>.aab` is the file you upload. Google calls it an "app bundle".
- `store/icon-512.png` and `store/feature-graphic-1024x500.png` are the required pictures.
- `store/LISTING.md` has the text to paste.
- `store/PRIVACY_POLICY.md` is your privacy policy. It must be online at a public web address before you can publish.

## Part 1: Create your developer account (day 1)

1. Go to https://play.google.com/console and sign in with the Google account you want to own the app. Use an account you will keep for years; transferring later is painful.
2. Choose the account type. **Organisation** if you have a business (a Finnish Oy or toiminimi counts). **Personal** if not. Organisation accounts skip the testing requirement in Part 5, so pick that if you can.
3. Pay the one-time registration fee (25 USD).
4. Verify your identity. Google asks for an ID document and, for organisations, proof of the business such as a D-U-N-S number. This takes 1 to 7 days. You can continue with Part 2 while waiting.

## Part 2: Put the privacy policy online (day 1, 10 minutes)

Google requires a public URL. Easiest options:
- Paste the contents of `store/PRIVACY_POLICY.md` onto a page on your existing website, or
- Create a free GitHub account, make a new public repository, upload the file, and turn on GitHub Pages in the repository settings.

Write down the URL. You need it in Part 4.

## Part 3: Facebook login (optional, day 1, 30 minutes)

Skip this if you are happy launching with email sign-in and guest play only. Facebook can be added in a later update.

1. Go to https://developers.facebook.com, sign in, and click **Create App**. Choose "Consumer" type. Name it Scrappy Bird.
2. In the app dashboard, add the **Facebook Login** product.
3. Under **Facebook Login > Settings**, in "Valid OAuth Redirect URIs" paste:
   `https://wbfloxbqeykiwtnzruiu.supabase.co/auth/v1/callback`
4. Under **App settings > Basic**, copy the **App ID** and **App Secret**.
5. Open https://supabase.com/dashboard/project/wbfloxbqeykiwtnzruiu, go to **Authentication > Providers > Facebook**, turn it on, paste the App ID and App Secret, save.
6. Still in Supabase, go to **Authentication > URL Configuration** and add `scrappybird://auth` to Redirect URLs. Save.
7. Back in the Meta dashboard, switch the app from Development to **Live** mode (top of the page). Meta may ask you to add a privacy policy URL; use the one from Part 2.

## Part 4: Set up the app in Play Console (day 2, about 1 hour)

1. In Play Console click **Create app**. Name: Scrappy Bird. Default language: English (or Finnish if you prefer). App or game: **Game**. Free or paid: **Free** (this cannot be changed later). Accept the declarations.
2. You land on the dashboard. It shows a checklist called "Set up your app". Work through it top to bottom:
   - **Privacy policy**: paste the URL from Part 2.
   - **App access**: choose "All functionality is available without special access". (Guest play means reviewers do not need an account.)
   - **Ads**: No, the app has no ads.
   - **Content rating**: start the questionnaire, email address, category "Game". Answer No to everything (no violence, no gambling, no user-generated content that others see, no location). Note: the leaderboard shows display names chosen by users; when asked about "user-generated content", answer that users can share only a short display name and there is no messaging. You will get an "Everyone" or "PEGI 3" rating.
   - **Target audience**: pick **13 and over**. Choosing younger ages triggers the Families policy, which adds a lot of extra work.
   - **News app**: No.
   - **COVID-19 apps**: No.
   - **Data safety**: this one matters because the app now collects account data. Answer:
     - Does your app collect or share user data? **Yes**.
     - Data types collected: **Personal info > Email address** (collected, not shared, required for account features, used for account management). If Facebook login is on, also **Name**.
     - **App activity > Other actions** (game scores, collected, not shared, used for app functionality).
     - Is all data encrypted in transit? **Yes**.
     - Can users request deletion? **Yes**. Deletion path: users can email you, and you delete them from the Supabase dashboard under Authentication > Users. Provide your email as the deletion request contact. Google also asks for a web page describing deletion; a paragraph on the privacy policy page is enough.
   - **Government apps**: No.
   - **Financial features**: No.
   - **Health**: No.
3. **Main store listing** (left menu under "Grow"):
   - App name, short description, full description: copy from `store/LISTING.md`.
   - App icon: upload `store/icon-512.png`.
   - Feature graphic: upload `store/feature-graphic-1024x500.png`.
   - Phone screenshots: at least 2, ideally 4 to 6. Install the `.apk` from `release/` on an Android phone, play each bird, and take screenshots with the phone's own screenshot button. Portrait screenshots from a modern phone are the right size already.
   - Save.
4. **App integrity** (left menu under "Test and release" > "App integrity"): Google shows "Play App Signing". Accept it. This means Google holds the final signing key and the key on your PC is only the upload key. That is what you want.

## Part 5: Testing before production (personal accounts only)

Personal developer accounts created after November 2023 must run a closed test with at least 12 testers for 14 days before they can publish to production. Organisation accounts skip this.

1. Left menu: **Testing > Closed testing > Create track**. Name it "Beta".
2. **Testers** tab: create an email list and add 12 or more Gmail addresses of friends, colleagues, students. They must opt in via the link Google shows you and keep the app installed for 14 days.
3. **Releases** tab: Create new release, upload `release/scrappy-bird-<version>.aab`, add release notes ("First release"), Save, then Review release, then Start rollout.
4. After 14 days with 12 active testers, the dashboard shows an "Apply for production" button. Fill in the short questionnaire.

## Part 6: Publish to production

1. Left menu: **Production > Create new release**.
2. Upload `release/scrappy-bird-<version>.aab` (if you already used this version in testing, that is fine; you can promote the testing release instead: Closed testing > Promote release > Production).
3. Release notes: a sentence or two.
4. Countries: **Add countries/regions**, pick all or just the ones you want.
5. Review release. Fix any red errors it lists (yellow warnings are fine).
6. Start rollout to Production. Google reviews the app; first reviews take 1 to 7 days. You get an email when it is live.

## Part 7: Updating the app later

1. Change the game files.
2. In `android/app/build.gradle` raise `versionCode` by one and set a new `versionName`. Google refuses uploads where versionCode did not increase.
3. Run `.\build-release.ps1`.
4. Play Console > Production > Create new release > upload the new `.aab` > rollout.

## Common first-timer mistakes

- Uploading the `.apk` instead of the `.aab`. Play needs the `.aab`.
- Losing the upload keystore. Back it up now.
- Choosing "under 13" in Target audience. Pick 13+.
- Forgetting to put the privacy policy online before the review.
- Leaving the Meta app in Development mode, which makes Facebook login fail for everyone except you.
