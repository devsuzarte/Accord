# 12 — Publishing a release (and automatic updates)

The installed app looks for a new version on its own (at startup and every 6 hours) on the
**Releases** page of the `devsuzarte/Accord` repository. It downloads in the background, shows a
notification and installs when the person quits the app — or right away, from **You → Updates →
Restart and update** (or from the tray).

> **[Verified]** It's `electron-updater` (electron-builder) with `publish: github`. It reads the
> `latest.yml` of the **newest release that is neither a draft nor a pre-release**
> (`releaseType: release`) and downloads only the installer's difference, through the `.blockmap`.
> The repository needs to be **public** for the app to read the releases without a password.

## Step by step (automatic, through GitHub Actions)

1. Raise the version in the three `package.json` files (root, `apps/desktop`, `apps/api`), for example `0.3.0` → `0.3.1`.
   The app only updates if the release version is **higher** than the installed one.
2. Publish in one of these ways:
   - **From the website (no git on your PC):** **Actions → Release → Run workflow**, tick
     **Publish the version** and click **Run workflow**. The workflow creates the `v0.3.1` tag on its own.
   - **With git:** commit and create the tag with the **same** version, with a `v` in front:
     ```bash
     git commit -am "0.3.1"
     git tag v0.3.1
     git push && git push --tags
     ```
3. The **Release** workflow (`.github/workflows/release.yml`) runs on a GitHub Windows machine: it
   downloads the official LiveKit (checking the SHA-256), builds the installer and creates the
   `Accord 0.3.1` release with the three files (`Accord-Setup-0.3.1.exe`, `.blockmap` and
   `latest.yml`) and notes generated from the commits. Follow it under **Actions**; it takes about 10 minutes.
4. Done: within 6 hours (or when they open the app) everyone gets the new version.

If the tag doesn't match the version in `apps/desktop/package.json`, the workflow stops with an
error before spending time on the build. A tag with a hyphen (`v0.3.1-test`) becomes a
**pre-release**: only people who download it by hand get it.

> **[Verified]** GitHub Actions is free with no minute limit on a **public** repository
> (on a private one, the free plan has a monthly quota and Windows counts double).

Running it by hand **without** ticking "Publish the version" only builds the installer and keeps it
as a downloadable artifact (good for testing), with no release and no update for anyone.

## Step by step (by hand, if needed)

1. Raise the version in the three `package.json` files.
2. Build everything on Windows (or on Linux with wine, see `CLAUDE.md`): `bun run package`.
3. On GitHub: **Releases → Draft a new release**, tag `v0.3.1`, attach the **three** files from
   `release/app/` (`.exe`, `.exe.blockmap`, `latest.yml`) and publish without ticking pre-release.

Without `latest.yml` the release doesn't work for automatic updates (the installer can still
be downloaded by hand).

## What goes wrong most often

| Symptom | Cause |
|---|---|
| "Could not check for updates right now" | Private repository, the release is marked as a pre-release, or `latest.yml` is missing |
| It never finds the new version | The `package.json` version isn't higher than the installed one, or the tag doesn't match the version |
| Windows warns "Windows protected your PC" | The installer isn't signed. Signing requires a code signing certificate (paid); until then, "More info → Run anyway" |

## Test version (pre-release)

Releases marked as **pre-release** don't reach anyone through automatic updates.
Use that to send a test version to a few friends before releasing it to everyone.
