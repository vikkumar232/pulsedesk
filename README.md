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

## Dynamic Supabase backend

The `supabase/` folder contains the shared incidents database schema and secure Gemini Edge Function. To connect it:

1. Create a Supabase project.
2. Run `supabase/schema.sql` in the Supabase SQL Editor.
3. Copy `supabase-config.example.js` to `supabase-config.js` and add the project URL and anon key.
4. Set `GEMINI_API_KEY` as a Supabase Edge Function secret.
5. Deploy the `supabase/functions/gemini` function.

The service-role key and Gemini key must remain server-side and must never be placed in browser files or GitHub.

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
