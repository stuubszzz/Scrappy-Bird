# Scrappy Bird security notes

Plain-language summary of what protects the app, what it does not, and what you must keep safe.

## What is protected

**Accounts and passwords.** Handled entirely by Supabase Auth. Passwords are hashed with bcrypt on Supabase's servers. The app never stores or sees a password; it sends it once over HTTPS at sign-in. Facebook sign-in uses OAuth with PKCE, so no Facebook password ever touches the app. Sessions are short-lived tokens that refresh automatically.

**The database.** Row Level Security is on for every table. Signed-in users can read profiles and scores, edit only their own profile, and cannot write scores directly at all. The only way to record a score is the `submit_score` function, which runs on the server and rejects:
- scores that are impossible for the elapsed time (more than one pipe per second plus slack)
- scores above 5000, negative values, unknown birds
- more than one submission every two seconds per user
- anything from a user who is not signed in

The key shipped in the app (`www/config.js`) is a publishable key. It is meant to be public. It can only do what Row Level Security allows, which for an anonymous caller is nothing. The service_role key is never in this project and must never be added to it.

**The Android package.**
- R8 shrinks and obfuscates the native code in release builds. Resources are shrunk too.
- `debuggable` is off and WebView remote debugging is off in release builds.
- Cleartext (HTTP) traffic is blocked. Only system certificate authorities are trusted, so a proxy with a user-installed certificate cannot intercept traffic on an unrooted device.
- App data is excluded from Android cloud backup and device transfer, so session tokens are not copied around.
- The WebView loads only local files. A Content Security Policy allows scripts from the app itself only, no inline scripts, and network calls only to your Supabase project.
- Test hooks used during development are compiled out when running inside the native app.
- The upload signing key is stored outside version control (`android/keystore.properties` and `android/upload-keystore.jks` are gitignored).

## What is not protected, and why that is fine

A single-player game running on a phone the player owns can always be tampered with by that player. A determined person with a rooted device could modify the game to, say, make the bird invincible. That is why the server does not trust the client: it independently checks that every submitted score was physically possible in the time reported. Cheating the local game is possible; cheating the leaderboard in a way that looks plausible is much harder, and outright impossible scores are rejected.

There is no personal data in the app beyond an email address (or a Facebook-provided name) and scores.

## Settings you must confirm in the Supabase dashboard

Open https://supabase.com/dashboard/project/wbfloxbqeykiwtnzruiu

1. **Authentication > Providers > Email**: keep "Confirm email" ON. Set minimum password length to 8.
2. **Authentication > URL Configuration**: add `scrappybird://auth` to Redirect URLs. Without it, Facebook sign-in and email confirmation links cannot return to the app.
3. **Authentication > Providers > Facebook**: turn on and paste the App ID and App Secret from your Meta app (see PLAY_STORE_GUIDE.md, section "Facebook login").
4. **Authentication > Rate Limits**: defaults are fine.
5. **Settings > API**: never copy the service_role key anywhere near the app.

## Keep safe, never commit, back up

- `android/upload-keystore.jks` and `android/keystore.properties`. Lose these and you cannot publish updates.
- Your Meta app secret.
- Your Supabase dashboard login.
