# Deploying the web app

How `apps/web` reaches **https://app.pagework.dev**. This covers the 0.2 web app only: static files, no server, with scripts kept in each writer's browser and in files they open or save. The self-hosted Docker image arrives with the server in 0.3 and gets its own guide.

## How it works

- The app is served by a **Cloudflare Worker** named **`pagework-app`**, connected to this repository with Cloudflare's **Workers Builds**. It has static files only and no Worker script.
- `wrangler.jsonc` at the root of the repository tells Cloudflare what to do: build the app (`pnpm build`) and serve `apps/web/dist`.
- **Pushes to `main`** are built and published to app.pagework.dev. **Other branches and pull requests** get a preview version, which isn't published to the domain, and a "Workers Builds" check on GitHub.
- The build writes `apps/web/dist/_headers` (from `apps/web/build/headers.ts`). Cloudflare sends those headers with every page: a content security policy that lets the app load and contact **only its own origin**, plus the usual hardening headers. Hashed files under `/assets/` are cached for a year; `index.html` is always revalidated, so a new deployment is picked up on the next load.
- The browser tests run against `vite preview` with the same headers, so a change that breaks the policy fails CI.
- CI (GitHub Actions) and the Cloudflare build run separately. Cloudflare publishes a push to `main` whether or not CI has passed, so keep `main` green by merging only pull requests whose checks pass.

## One-off setup in Cloudflare

### 1. The Worker's build settings
In the Cloudflare dashboard, open **Workers & Pages › `pagework-app` › Settings › Build**:

| Setting | Value |
|---|---|
| Git repository | `pagework-dev/pagework` |
| Build command | *(leave empty: `wrangler.jsonc` runs the build)* |
| Deploy command | `npx wrangler deploy` |
| Non-production branch deploy command | `npx wrangler versions upload` |
| Root directory | `/` |
| Production branch (under **Branch control**) | `main` |

The Worker's name must be **`pagework-app`**, the `name` in `wrangler.jsonc`. If yours has another name, change one of them to match.

If **Branch control** won't let you choose `main`, check the Worker is connected to `pagework-dev/pagework`, and that the Cloudflare app on GitHub has access to that repository (GitHub › Settings › Applications › Cloudflare Workers and Pages › Configure). Cloudflare uses the repository's default branch, `main`, unless told otherwise.

### 2. The custom domain
1. **Workers & Pages › `pagework-app` › Settings › Domains & Routes › Add › Custom domain**, and enter `app.pagework.dev`.
2. `pagework.dev` must use Cloudflare DNS for a Worker custom domain; Cloudflare then adds the DNS record itself.
3. Wait until it shows **Active**. Cloudflare issues the HTTPS certificate.

### 3. First deployment
Merge to `main`. Cloudflare builds it and publishes the Worker for the first time; https://app.pagework.dev then serves the app (once the custom domain is added). Until that first publish from `main`, the "Workers Builds" check on pull requests fails with "This Worker does not exist on your account": Cloudflare can only make previews of a Worker that has been published once.

The `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` secrets and the `production` environment from an earlier version of this guide aren't used any more. You can delete them in GitHub and revoke the token in Cloudflare.

## Checking a deployment
- Open https://app.pagework.dev, write a line, reload: the app offers to restore it.
- In the browser's developer tools › Network, every request goes to `app.pagework.dev`.
- To check the headers:
  ```bash
  curl -sI https://app.pagework.dev | grep -i -E 'content-security|x-frame|referrer'
  ```
- To try the Cloudflare build locally without publishing anything:
  ```bash
  npx wrangler@4.162.0 deploy --dry-run
  ```

## Rolling back
In Cloudflare, **Workers & Pages › `pagework-app` › Deployments**, choose an earlier version and **Deploy** it. The next push to `main` publishes again as usual.

## Privacy
The app sends no analytics and makes no requests except to `app.pagework.dev` (ADR 0010; enforced by the content security policy). Scripts stay in the writer's browser and in files they save. Cloudflare, as the host, sees requests for the app's files, as any web host does. `wrangler.jsonc` turns off Wrangler's own usage statistics. Don't enable Cloudflare Web Analytics or other features that inject scripts into the pages; the policy would block them anyway.

## Licence
AGPL-3.0 section 13 requires anyone who runs a **modified** version for users over a network to offer those users its source code. The project's own deployment of its own code isn't bound in the same way, but offering the source is the point of choosing the AGPL (ADR 0002), and the app has no "About" screen with a source link yet. While `pagework-dev/pagework` is private, decide where the source will be offered before inviting people outside the project.
