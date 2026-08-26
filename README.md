# Personal CV

A dependency-free personal CV site built with raw HTML, CSS, and JavaScript. The site is ready to publish from this folder.

## Before you publish

You need a GitHub account, a Vercel account, [Git for Windows](https://git-scm.com/download/win) installed, and a text editor. We recommend [Visual Studio Code](https://code.visualstudio.com/download). You do **not** need the GitHub or Vercel command-line tools.

To see the site locally, open `index.html` in a browser. To edit its content, update the placeholder work and project cards in `index.html`; the colours and layout settings are at the top of `styles.css`.

## 1. Sign in to GitHub and create the repository

1. Go to [github.com/login](https://github.com/login) and sign in.
2. Select the **+** menu in the upper-right corner, then select **New repository**.
3. Enter `personal-cv` as the repository name.
4. Choose **Public** so recruiters can view the source, or **Private** if you prefer. Vercel supports either option.
5. Do not add a README, `.gitignore`, or license. This folder already has a README.
6. Select **Create repository**.
7. Leave the GitHub page open. You will copy its HTTPS repository address in the next section. It should look like `https://github.com/brunoport/personal-cv.git`.

## 2. Upload this site to GitHub

Open PowerShell in the `Test CV` folder and run these commands one at a time. Replace the email with the email address associated with your GitHub account.

```powershell
git config user.name "Your Name"
git config user.email "your-github-email@example.com"
git add .
git commit -m "Create personal CV site"
git branch -M main
git remote add origin https://github.com/your_github_user/personal-cv.git
git push -u origin main
```

The first `git push` may open a GitHub sign-in window or ask you to authenticate through Git Credential Manager. Complete that sign-in using your personal GitHub account, then return to the terminal. Refresh the `personal-cv` GitHub repository page to confirm that `index.html`, `styles.css`, `app.js`, and `.github` appear.

If Git says that `origin` already exists, use this instead of the `git remote add` command:

```powershell
git remote set-url origin https://github.com/your_github_user/personal-cv.git
git push -u origin main
```

## 3. Confirm the CI workflow

1. In your GitHub repository, select the **Actions** tab.
2. Select the latest **CI** workflow run.
3. Wait for the `validate` job to show a green check.

The workflow in `.github/workflows/ci.yml` checks JavaScript syntax and confirms the HTML file includes a title and stylesheet reference on every pull request and every push to `main`.

If the workflow is missing, select the **Actions** tab and choose **I understand my workflows, go ahead and enable them**. If it fails, open the failed `validate` job and use the command shown in the failed step locally to reproduce the issue.

## 4. Deploy on Vercel

1. Go to [vercel.com/new](https://vercel.com/new).
2. Select **Continue with GitHub** and authorize Vercel to access your GitHub account.
3. Find `personal-cv` and select **Import**. If the repository is not listed, select **Adjust GitHub App Permissions**, grant Vercel access to `personal-cv`, and try again.
4. On the configuration screen, leave the framework preset as **Other**.
5. Leave **Build Command** empty and leave **Output Directory** empty. This is a static HTML site, so Vercel serves the files directly.
6. Select **Deploy**.
7. When the deployment completes, select **Visit**. Copy the generated `vercel.app` URL for your CV.

Each future push to `main` automatically creates a new Vercel production deployment.

## 5. Publish later changes

After changing the CV, use this sequence from the `Test CV` folder:

```powershell
git add .
git commit -m "Describe your change"
git push
```

GitHub runs CI first. Vercel then publishes the updated site automatically when the push reaches `main`.

## Optional: require CI before production deployment

The default Vercel Git integration deploys every push to `main`. For a more controlled workflow, GitHub Actions can deploy to Vercel only after the `CI` workflow passes. This creates a delivery path of pull request, CI, merge to `main`, CI on `main`, then production deployment.

### Protect the `main` branch

1. In the GitHub repository, open **Settings** then **Branches**.
2. Select **Add branch protection rule** and enter `main` as the branch name pattern.
3. Enable **Require a pull request before merging**.
4. Enable **Require status checks to pass before merging** and select the `CI / validate` check.
5. Save the rule.

This prevents a pull request from merging while its CI checks fail. It does not replace the deployment workflow below; it protects the route into production.

### Stop Vercel's own Git deployments

Vercel no longer has a single dashboard toggle to turn off automatic Git deployments, so use a `vercel.json` file instead. This keeps a direct Vercel deployment from racing the GitHub Actions deployment while still allowing the GitHub Actions `vercel deploy` command to work.

Create `vercel.json` in the repository root with the following content:

```json
{
	"$schema": "https://openapi.vercel.sh/vercel.json",
	"git": {
		"deploymentEnabled": false
	}
}
```

Commit and push this file. `git.deploymentEnabled: false` disables only the deployments that Vercel triggers from Git pushes; deployments started by the Vercel CLI (which GitHub Actions uses) still run.

### Create the Vercel access token

The token page lives under your **Personal Account**, not under a team, so switch context first. Do not use **Key Management**; that feature creates cryptographic signing keys, which are not access tokens.

1. In the dashboard, open the account switcher in the upper-left corner and select your **Personal Account**.
2. Go to [vercel.com/account/tokens](https://vercel.com/account/tokens), also reachable from your avatar in the lower-left corner then **Settings** then **Tokens**.
3. Select **Create**, enter a name such as `github-actions`, and choose an expiration.
4. Set the **Scope** to the account or team that owns the `personal-cv` project. The scope, not where the token lives, is what grants access to a team's project.
5. Select **Create Token** and copy the value immediately. Vercel shows it only once. This value is your `VERCEL_TOKEN`.

### Find the project and organization IDs

1. Open the `personal-cv` project itself from the dashboard, select its **Settings**, then **General**, and scroll to the bottom to find the **Project ID**. This value is your `VERCEL_PROJECT_ID`. The Project ID lives on the project, not in account or team settings.
2. Get the organization ID (`VERCEL_ORG_ID`):
   - **Team project:** open the team's **Settings** then **General** and copy the **Team ID**.
   - **Personal (Hobby) project:** Vercel treats your personal account as a personal team, so the **Team ID** shown in your account's **Settings** then **General** is your `VERCEL_ORG_ID`.

### Add the GitHub secrets

1. In the GitHub repository, open **Settings** then **Secrets and variables** then **Actions**.
2. Add these repository secrets: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, and `VERCEL_PROJECT_ID`.

Never commit Vercel tokens or IDs that are marked secret to the repository.

### Add the production deployment workflow

Create `.github/workflows/deploy-production.yml` with the following content:

```yaml
name: Deploy production

on:
	workflow_run:
		workflows: ["CI"]
		types: [completed]
		branches: [main]

permissions:
	contents: read

jobs:
	deploy:
		name: Deploy to Vercel production
		if: >
			github.event.workflow_run.conclusion == 'success' &&
			github.event.workflow_run.event == 'push'
		runs-on: ubuntu-latest

		steps:
			- name: Check out the commit verified by CI
				uses: actions/checkout@v4
				with:
					ref: ${{ github.event.workflow_run.head_sha }}

			- name: Install Vercel CLI
				run: npm install --global vercel@latest

			- name: Deploy verified commit to production
				run: vercel deploy --prod --yes --token="$VERCEL_TOKEN"
				env:
					VERCEL_TOKEN: ${{ secrets.VERCEL_TOKEN }}
					VERCEL_ORG_ID: ${{ secrets.VERCEL_ORG_ID }}
					VERCEL_PROJECT_ID: ${{ secrets.VERCEL_PROJECT_ID }}
```

The workflow only runs after a successful `CI` workflow triggered by a push to `main`. Checking out `${{ github.event.workflow_run.head_sha }}` is important: it deploys the exact commit that CI verified.

### Use the gated workflow

1. Create a feature branch, for example `git switch -c add-case-study`.
2. Make and commit your change, then push the branch: `git push -u origin add-case-study`.
3. Open a pull request on GitHub and wait for `CI / validate` to pass.
4. Merge the pull request into `main`.
5. In the **Actions** tab, confirm `CI` succeeds on `main`, followed by **Deploy production**.
6. Open the Vercel project dashboard and verify the published site includes the change.

If CI fails on `main`, the `Deploy production` workflow is skipped and the existing production site remains live. Fix the issue in a new commit and push again.
