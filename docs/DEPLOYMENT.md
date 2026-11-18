# Deploying the web app

How `apps/web` reaches **https://app.pagework.dev**. This covers the 0.2 web app only: static files, no server, with scripts kept in each writer's browser and files they open or save. The self-hosted Docker image arrives with the server in 0.3 and gets its own guide.

## How it works

- Every push to `main` runs CI (`.github/workflows/ci.yml`). When CI passes, `.github/workflows/deploy.yml` builds `apps/web` from the same commit and publishes `apps/web/dist` to the Cloudflare Pages project **`pagework-app`**, which serves `app.pagework.dev`.
- Nothing deploys from pull requests, from other branches, or from a failed CI run. You can also run **Deploy** by hand from the Actions tab (on `main` only).
- The build writes `apps/web/dist/_headers` (from `apps/web/build/headers.ts`). Cloudflare sends those headers with every page: a content security policy that lets the app load and contact **only its own origin**, plus the usual hardening headers. Hashed files under `/assets/` are cached for a year; `index.html` is always revalidated, so a new deployment is picked up on the next load.
- The browser tests run against `vite preview` with the same headers, so a change that breaks the policy fails CI before it can deploy.

## One-off setup (an account owner does this once)

### 1. Cloudflare: create the Pages project
1. In the Cloudflare dashboard, open **Workers & Pages › Create › Pages**. Choose **Direct Upload** (or "Upload assets"), not "Connect to Git": GitHub Actions does the building, so Cloudflare needs no access to the repository.
2. Name the project **`pagework-app`**. If you choose another name, change `--project-name` in `deploy.yml` to match.
3. Upload anything to finish creating it (for example a folder with one `index.html`). The first real deployment replaces it.
4. Under **Settings**, set the production branch to **`main`**.

Or with Wrangler, from any machine:
```bash
npx wrangler@4.162.0 pages project create pagework-app --production-branch=main
```

### 2. Cloudflare: the custom domain
1. In the project, open **Custom domains › Set up a custom domain** and enter `app.pagework.dev`.
2. If `pagework.dev` uses Cloudflare DNS, Cloudflare adds the record itself. If not, add the DNS record it shows you at your DNS provider: a **CNAME** from `app` to `pagework-app.pages.dev`.
3. Wait until the domain shows **Active**. Cloudflare issues the HTTPS certificate.

### 3. Cloudflare: an API token for GitHub Actions
1. **My Profile › API Tokens › Create Token › Create Custom Token.**
2. Permissions: **Account › Cloudflare Pages › Edit**. Nothing else.
3. Account resources: only the account that owns `pagework-app`.
4. Copy the token. You also need the **Account ID** (shown on the account's overview page, or in the URL `dash.cloudflare.com/<account id>/…`).

### 4. GitHub: secrets and an environment
In `pagework-dev/pagework` › **Settings**:
1. **Environments › New environment** named **`production`**. Under **Deployment branches and tags**, choose **Selected branches** and add `main`. Optionally add yourself as a **required reviewer**, so each deployment waits for your approval.
2. In that environment, add two **environment secrets**:
   - `CLOUDFLARE_API_TOKEN`: the token from step 3
   - `CLOUDFLARE_ACCOUNT_ID`: the account ID

Environment secrets are only available to jobs that use the `production` environment, and that environment only to `main`.

### 5. First deployment
Merge to `main` (or open **Actions › Deploy › Run workflow** on `main`). When it finishes, the run links to https://app.pagework.dev.

## Checking a deployment
- Open https://app.pagework.dev, write a line, reload: the app offers to restore it.
- In the browser's developer tools › Network, every request goes to `app.pagework.dev`.
- To check the headers:
  ```bash
  curl -sI https://app.pagework.dev | grep -i -E 'content-security|x-frame|referrer'
  ```

## Rolling back
In Cloudflare, **Workers & Pages › pagework-app › Deployments**, open an earlier deployment and choose **Rollback to this deployment**. The next push to `main` deploys again as usual.

## Privacy
The app sends no analytics and makes no requests except to `app.pagework.dev` (ADR 0010; enforced by the content security policy). Scripts stay in the writer's browser and in files they save. Cloudflare, as the host, sees requests for the app's files, as any web host does. Don't enable Cloudflare Web Analytics or other features that inject scripts into the pages; the policy would block them anyway.

## Licence
AGPL-3.0 section 13 requires anyone who runs a **modified** version for users over a network to offer those users its source code. The project's own deployment of its own code isn't bound in the same way, but offering the source is the point of choosing the AGPL (ADR 0002), and the app has no "About" screen with a source link yet. While `pagework-dev/pagework` is private, decide where the source will be offered before inviting people outside the project.
