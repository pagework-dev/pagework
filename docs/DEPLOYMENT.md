# Deploying the web app

How `apps/web` reaches **https://app.pagework.dev**. This covers the 0.2 web app only: static files, no server, with scripts kept in each writer's browser and in files they open or save. The self-hosted Docker image arrives with the server in 0.3 and gets its own guide.

## How it works

- The app is served by a **Cloudflare Worker** named **`pagework-app`**. It has static files only and no Worker script.
- `wrangler.jsonc` at the root of the repository says how: build the app (`pnpm build`) and serve `apps/web/dist`.
- Every push to `main` runs CI (`.github/workflows/ci.yml`). When CI passes, `.github/workflows/deploy.yml` runs `wrangler deploy` on the same commit, which builds the app and publishes it to the Worker. Nothing is published from pull requests, other branches, forks or a failed CI run. You can also run **Deploy** by hand from the Actions tab (on `main` only).
- The Worker is **not** connected to the repository in Cloudflare (its **Builds › Git repository** shows "Connect"). Leave it that way: GitHub Actions does the building, after the tests pass.
- The build writes `apps/web/dist/_headers` (from `apps/web/build/headers.ts`). Cloudflare sends those headers with every page: a content security policy that lets the app load and contact **only its own origin**, plus the usual hardening headers. Hashed files under `/assets/` are cached for a year; `index.html` is always revalidated, so a new deployment is picked up on the next load.
- The browser tests run against `vite preview` with the same headers, so a change that breaks the policy fails CI before it can deploy.

## One-off setup

### 1. Cloudflare: a deploy token for the Worker
1. Open **Workers & Pages › `pagework-app` › Settings › Builds**.
2. Under **API token for external CI/CD**, choose **Create token**. It can deploy only this Worker. Copy it.
3. Note your **Account ID** (on the account's overview page, or in the dashboard address: `dash.cloudflare.com/<account id>/…`).

The Worker's name must be **`pagework-app`**, the `name` in `wrangler.jsonc`. If yours has another name, change one of them to match.

### 2. GitHub: two repository secrets
In `pagework-dev/pagework` › **Settings › Secrets and variables › Actions › Repository secrets**, add (or replace):
- `CLOUDFLARE_API_TOKEN`: the token from step 1
- `CLOUDFLARE_ACCOUNT_ID`: the account ID

They must be **repository** secrets. Secrets saved in an environment (such as `production`, from an earlier version of this guide) aren't used by the workflow; you can delete that environment.

### 3. First deployment
Open **Actions › Deploy › Run workflow** on `main` (from then on it runs by itself after CI passes on `main`). When it finishes, the app is at the Worker's `workers.dev` address, shown in the run's log and on the Worker's page.

### 4. Cloudflare: the custom domain
1. **Workers & Pages › `pagework-app` › Settings › Domains & Routes › Add › Custom domain**, and enter `app.pagework.dev`.
2. `pagework.dev` must use Cloudflare DNS for a Worker custom domain; Cloudflare then adds the DNS record itself.
3. Wait until it shows **Active**. Cloudflare issues the HTTPS certificate.

## Checking a deployment
- Open https://app.pagework.dev, write a line, reload: the app offers to restore it.
- In the browser's developer tools › Network, every request goes to `app.pagework.dev`.
- To check the headers:
  ```bash
  curl -sI https://app.pagework.dev | grep -i -E 'content-security|x-frame|referrer'
  ```
- To try the build Cloudflare would get, without publishing anything:
  ```bash
  npx wrangler@4.162.0 deploy --dry-run
  ```

## Rolling back
In Cloudflare, **Workers & Pages › `pagework-app` › Deployments**, choose an earlier version and **Deploy** it. The next deployment from `main` publishes again as usual.

## Privacy
The app sends no analytics and makes no requests except to `app.pagework.dev` (ADR 0010; enforced by the content security policy). Scripts stay in the writer's browser and in files they save. Cloudflare, as the host, sees requests for the app's files, as any web host does. `wrangler.jsonc` turns off Wrangler's own usage statistics. Don't enable Cloudflare Web Analytics or other features that inject scripts into the pages; the policy would block them anyway.

## Licence
AGPL-3.0 section 13 requires anyone who runs a **modified** version for users over a network to offer those users its source code. The project's own deployment of its own code isn't bound in the same way, but offering the source is the point of choosing the AGPL (ADR 0002), and the app has no "About" screen with a source link yet. While `pagework-dev/pagework` is private, decide where the source will be offered before inviting people outside the project.
