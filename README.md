# PulseDesk · AI Dispatch Console

A browser-based emergency dispatch workspace with a local operator-first AI assistant.

## Run locally

No build tools or dependencies are required. Open `index.html` in a browser, or use the included `launch-app.bat` file.

## Connect Gemini

1. Open `config.js`.
2. Replace `PASTE_YOUR_GEMINI_API_KEY_HERE` with your Gemini API key.
3. Reload the app.

The assistant will use Gemini for chat responses when the key is configured. If Gemini is unavailable, it falls back to the built-in local assistant.

**Never upload `config.js` or a real API key to GitHub.** The repository includes `config.example.js` as a safe template, and `config.js` is excluded by `.gitignore`.

For a local web address, run a simple static server from this folder:

```powershell
npx serve .
```

## Publish on GitHub Pages

1. Create a new **public** GitHub repository.
2. Upload `index.html`, `styles.css`, `app.js`, `launch-app.bat`, and this README.
3. In the repository, open **Settings → Pages**.
4. Under **Build and deployment**, select **Deploy from a branch**.
5. Select the `main` branch and `/ (root)`, then click **Save**.
6. GitHub will provide a shareable website link.

## Collaborate

Give your partner access from the repository’s **Settings → Collaborators** page. They can edit the files directly on GitHub or clone the repository to their computer.

## Important

The assistant currently runs locally in the browser using built-in rules. It does not require an API key and does not send incident information to an external AI service. This is a prototype and AI suggestions must be reviewed by a trained operator.
