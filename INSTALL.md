# Installing Bridge

Three paths through this doc. If you're comfortable with npm, git, and a terminal, the Fast path takes about 60 seconds. If terms like "clone" or "PowerShell" don't mean anything to you yet, jump to Step-by-step — it assumes nothing. If something broke, Troubleshooting has the named errors people hit. The README's Quick start is the glance version of this doc; INSTALL.md is the full reference. Both describe the same five commands.

## Fast path (you know npm and git)

```bash
git clone https://github.com/Kualarz/bridge.git
cd bridge
npm install
npm run build
npm start
```

Success looks like this banner (paths shown are macOS defaults):

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  bridge — daemon online
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  Root:       ~/Documents/bridge
  Port:       7777
  MCP:        http://localhost:7777/mcp
  Health:     http://localhost:7777/health
  Storage:    ~/Library/Application Support/bridge
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Press Ctrl+C to stop.
```

Verify by opening http://localhost:7777/health in any browser — you should see JSON with `"status": "ok"`. For the chat-to-Code workflow, see the Connecting Claude clients and Tailscale Funnel setup sections in the README.

## macOS step-by-step

### What you're installing

Bridge is a small program that runs on your Mac and lets Claude.ai chat hand off tasks to Claude Code. When you finish planning something in a chat conversation, bridge carries the decisions over to Code automatically — no copy-pasting, no reformatting.

You need two things: Node.js (the runtime that runs bridge) and git (to download the code). Both are easiest to get via Homebrew, the standard macOS package manager. Total install time: 5–10 minutes the first time, 60 seconds every time after.

### 1. Install Homebrew (if you don't have it)

Open **Terminal** (press `⌘ Space`, type `Terminal`, press Enter). Paste this command and press Enter:

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Follow the prompts. When it finishes, close Terminal and open a fresh one.

### 2. Install Node.js and Git

```bash
brew install node git
```

Verify:

```bash
node --version   # should print v20.x.x or v22.x.x
git --version    # should print git version 2.x.x
```

### 3. Download bridge

```bash
cd ~/Documents
git clone https://github.com/Kualarz/bridge.git
cd bridge
```

### 4. Install dependencies and build

```bash
npm install
npm run build
```

No output from `npm run build` means success.

### 5. Configure storage (optional)

Bridge stores briefs and results in `~/Library/Application Support/bridge` by default. If you want to sync briefs between devices, point `BRIDGE_DATA_DIR` at a cloud-synced folder. Create a `.env` file:

```bash
# iCloud Drive
echo 'BRIDGE_DATA_DIR=~/Library/Mobile Documents/com~apple~CloudDocs/bridge' > .env

# or Google Drive (adjust the email address)
# echo 'BRIDGE_DATA_DIR=~/Library/CloudStorage/GoogleDrive-you@example.com/My Drive/bridge' > .env
```

Most people skip this on the first try and add it later.

### 6. Start bridge

```bash
npm start
```

You should see the daemon banner with your Mac's paths. Leave Terminal open — closing it stops bridge. Verify by opening http://localhost:7777/health in a browser.

### 7. What's next

- Configure Claude Code to talk to bridge — see the README's [Connecting Claude clients → Claude Code](./README.md#claude-code-cli) section.
- Set up Tailscale Funnel so Claude.ai chat can reach bridge — see the README's [Tailscale Funnel setup](./README.md#tailscale-funnel-setup) section.
- Install the bridge skill so Code picks up briefs automatically — see the README's [Installing the bridge skill](./README.md#installing-the-bridge-skill) section.

## Windows step-by-step

### What you're installing

Bridge is a small program that runs on your PC and lets Claude.ai chat hand off tasks to Claude Code. When you finish planning something in a chat conversation, bridge carries the decisions over to Code automatically — no copy-pasting, no reformatting.

To run it, you need three things: Node.js (the runtime that executes bridge), git (to download the code), and PowerShell (the terminal that comes with Windows). Each is free and from a trusted source. Total install time: 10–15 minutes the first time, 60 seconds every time after.

### 1. Install Node.js

1. Go to [https://nodejs.org](https://nodejs.org).
2. Download the **LTS** version (Long Term Support — the recommended one, currently 20 or 22).
3. Run the installer; accept all defaults.
4. Verify the install: open a **new** PowerShell window, type `node --version`, and press Enter. You should see something like `v20.18.0` or `v22.x.x`.

If you see an error like `'node' is not recognized`, close PowerShell, open a new one, and try again — the installer needs a fresh window to take effect.

### 2. Install Git

1. Go to [https://git-scm.com/download/win](https://git-scm.com/download/win).
2. The download starts automatically.
3. Run the installer; accept all defaults (they're sensible for this use case).
4. Verify in a fresh PowerShell window: `git --version`. You should see `git version 2.x.x`.

### 3. Open PowerShell

1. Press the **Windows key**.
2. Type `PowerShell`.
3. Click **Windows PowerShell** (the regular one, not the ISE). A blue window opens with a prompt like `PS C:\Users\YourName>`.
4. This is where you'll type the commands below. Each line is one command — type it, press Enter, wait for it to finish before typing the next.

### 4. Download bridge

1. In PowerShell, run `cd $HOME\Documents` to move into your Documents folder.
2. Run `git clone https://github.com/Kualarz/bridge.git`. Git downloads the code; you'll see progress lines, then a "done" message.
3. Run `cd bridge` to step into the new folder. Your prompt should now end in `\bridge>`.

### 5. Install bridge's dependencies

1. Run `npm install`. This downloads the libraries bridge depends on. Takes 1–3 minutes the first time. You'll see lots of output — ignore warnings, only worry about errors.
2. When the prompt comes back, run `npm run build`. This compiles the TypeScript source into JavaScript. Takes a few seconds. No output means success.

### 6. Configure storage (optional, but read this)

Bridge needs a folder to store briefs and results. The default is a `Bridge` folder in your home directory — works out of the box, single-device only. If you want chat on your phone to talk to Code on this PC, point bridge at a cloud-synced folder (Google Drive, Dropbox, OneDrive). To do that, create a `.env` file in the bridge folder with one line:

```
BRIDGE_DATA_DIR=G:\My Drive\bridge
```

Replace the path with wherever your cloud sync folder is. Most people skip this on the first try and add it later.

### 7. Start bridge

1. Run `npm start`.
2. You should see the daemon banner with your Windows paths (e.g. `C:\Users\YourName\Documents\bridge` and `C:\Users\YourName\Bridge`).

3. Bridge is now running. Leave this PowerShell window open — closing it stops bridge.
4. Verify by opening http://localhost:7777/health in any browser. You should see JSON with `"status": "ok"`. If you do, bridge is running correctly.

### 8. What's next

Running the daemon is half the setup. To use bridge from Claude, you need to either:

- Configure Claude Code to talk to bridge — see the README's [Connecting Claude clients → Claude Code](./README.md#claude-code-cli) section.
- Set up Tailscale Funnel so Claude.ai chat or Claude Desktop can reach bridge — see the README's [Tailscale Funnel setup](./README.md#tailscale-funnel-setup) section.

You'll also want to install the bridge skill so Code picks up briefs automatically — see the README's [Installing the bridge skill](./README.md#installing-the-bridge-skill) section.

## Troubleshooting

This section covers errors you might hit **during installation**. For errors that happen after bridge is running (schema cache, port conflicts, `.env` not loading, connector issues), see the README's [Troubleshooting](./README.md#troubleshooting) section — each doc covers a different stage.

### `'node' is not recognized as an internal or external command`

**Symptom:** After installing Node.js, typing `node --version` in PowerShell prints this error instead of a version number.

**Cause:** The PowerShell window was open before Node finished installing, so it doesn't have the updated PATH yet.

**Fix:** Close ALL PowerShell windows, open a fresh one, and retry `node --version`. If still failing, restart Windows. The installer modifies your system PATH, and some Windows versions don't propagate that change until a full restart.

### `'git' is not recognized as an internal or external command`

**Symptom:** After installing git, typing `git --version` in PowerShell prints this error.

**Cause:** Same as above — the PATH update from the git installer hasn't taken effect in your current shell.

**Fix:** Close ALL PowerShell windows, open a fresh one, and retry `git --version`. If still failing after a fresh window, the installer's "Add to PATH" step was likely skipped. Reinstall git from [https://git-scm.com/download/win](https://git-scm.com/download/win) and accept all defaults — the default options add git to PATH correctly.

### `npm install` fails with EACCES, EPERM, or permission denied

**Symptom:** `npm install` exits with an error that includes `EACCES`, `EPERM`, or "permission denied", usually pointing at a path inside `node_modules`.

**Cause:** PowerShell doesn't have write permission to the folder where you cloned bridge. This happens most often when you cloned into a protected system directory.

**Fix:** Don't run as Administrator (that often makes things worse by changing file ownership). Instead, make sure you cloned bridge into a folder you own — for example `$HOME\Documents\bridge` or `C:\Users\YourName\bridge`. Not `C:\Program Files\` or `C:\Windows\` or similar. If you're already in the right folder and still seeing the error, try deleting the partial `node_modules` folder and retrying:

```powershell
Remove-Item -Recurse -Force node_modules
npm install
```

### `npm install` hangs or downloads forever

**Symptom:** `npm install` starts printing package names but then stalls for minutes with no progress, or hangs immediately without printing anything.

**Cause:** Slow network, npm registry rate-limiting, or proxy/VPN interference blocking outbound connections to `registry.npmjs.org`.

**Fix:** Cancel with Ctrl+C and retry. If still hanging, check your registry setting:

```powershell
npm config get registry
```

It should show `https://registry.npmjs.org/`. If it shows something else, a previous configuration may have pointed npm at an internal mirror. If you're behind a corporate proxy or VPN, try disconnecting and retrying — those tools often intercept HTTPS in a way that breaks npm's certificate checks.

### `npm run build` fails with TypeScript errors

**Symptom:** `npm run build` exits with one or more lines that say `error TS` followed by a file path and line number.

**Cause:** Usually a Node version mismatch. Bridge requires Node 20 or newer; older Node versions ship an older TypeScript-incompatible V8 engine or miss built-in module types.

**Fix:** Confirm your version:

```powershell
node --version
```

If it shows v18 or earlier, reinstall from [nodejs.org](https://nodejs.org) and pick the LTS version (20 or 22). If you already have the right version and the build still fails, that's a real bug — file an issue at [https://github.com/Kualarz/bridge/issues](https://github.com/Kualarz/bridge/issues) with the full `npm run build` output.

### `npm start` fails immediately with EADDRINUSE

**Symptom:** `npm start` prints an error containing `EADDRINUSE` and exits without showing the daemon banner.

**Cause:** Port 7777 is already occupied by another process — either an orphan bridge instance from a previous session, or an unrelated service.

**Fix:** See the README's [Port 7777 already in use](./README.md#port-7777-already-in-use) section for the exact PowerShell commands to find and kill the occupying process, or how to change bridge's port.

### I cloned the wrong place / want to start over

**Symptom:** You want a clean slate — wrong directory, wrong options, or something got corrupted during setup.

**Fix:** Delete the bridge folder and re-clone. From the **parent** directory of bridge (e.g. `Documents`):

```powershell
Remove-Item -Recurse -Force .\bridge
git clone https://github.com/Kualarz/bridge.git
cd bridge
npm install
npm run build
npm start
```

No state is kept inside the bridge folder itself — your briefs and results live in `BRIDGE_DATA_DIR` (default: `%USERPROFILE%\Bridge`), which is completely separate and untouched by this.
