# Scrappy Bird

Flappy Bird with four playable birds. Birdie, Trumpet and Sammich lose wings as you score; Persu is hit by random scandal events on the way to Parliament. Characters live in the CHARACTERS registry in `www/index.html`, each with its own sprite, animation, background, obstacle style and difficulty text. Built as a single HTML5 canvas game in `www/`, packaged for Android with Capacitor.

## Layout

| Path | What it is |
|---|---|
| `www/index.html` | The whole game. Edit this, then run `npx cap sync android`. |
| `android/` | Native Android project (Capacitor). Open in Android Studio if you want. |
| `android/upload-keystore.jks` + `android/keystore.properties` | Play upload signing key and its passwords. **Back these up. Never commit them.** |
| `release/` | Latest signed `.aab` (for Play Console) and `.apk` (for sideloading to a phone). |
| `store/` | Icon, feature graphic, listing text and privacy policy for the Play Console. |
| `tools/make_assets.py` | Regenerates icons, splash screens and store graphics from code. |
| `build-release.ps1` | One-command release build. |

## Building

Already installed on this machine: Node, Temurin JDK 21 (`C:\Program Files\Eclipse Adoptium`), Android SDK (`C:\AndroidSdk`, API 36, build-tools 36).

```powershell
.\build-release.ps1
```

Outputs `release\scrappy-bird-<version>.aab` and `.apk`.

To test on a phone with USB debugging enabled:

```powershell
C:\AndroidSdk\platform-tools\adb.exe install -r release\scrappy-bird-1.0.0.apk
```

## Releasing a new version

1. Edit the game in `www/index.html`.
2. In `android/app/build.gradle`, bump `versionCode` (must increase by at least 1 every upload) and `versionName`.
3. Run `.\build-release.ps1`.
4. Upload the new `.aab` in Play Console.

## Publishing on Google Play (first time)

1. Create a Google Play developer account at https://play.google.com/console (one-time fee, identity verification takes a few days).
2. **Create app**: name "Scrappy Bird", Game, Free.
3. **Set up your app** checklist in the console:
   - Privacy policy: host `store/PRIVACY_POLICY.md` somewhere public (a GitHub page or your website) and paste the URL.
   - App access: "All functionality is available without special access".
   - Ads: No.
   - Content rating: fill the questionnaire (no violence, no user interaction, no data). Gets "Everyone".
   - Target audience: 13+ is simplest (choosing under-13 triggers Families policy requirements).
   - Data safety: "No data collected", "No data shared".
   - News app / COVID / Government app: No.
4. **Main store listing**: paste from `store/LISTING.md`; upload `store/icon-512.png`, `store/feature-graphic-1024x500.png`, and at least two phone screenshots taken from the installed app.
5. **App integrity / signing**: accept Play App Signing. The `.aab` is signed with the upload key in `android/upload-keystore.jks`; Google holds the final app signing key.
6. **Release**: Production (or Internal testing first) > Create new release > upload `release/scrappy-bird-1.0.0.aab` > release notes > review > roll out.
7. New personal developer accounts must run a closed test with 12+ testers for 14 days before production access is granted. Business accounts skip this.

Review usually takes 1 to 7 days.

## Package ID

`education.finestfuture.scrappybird`. This cannot change after the first upload.
