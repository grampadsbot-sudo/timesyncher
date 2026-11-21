# Vacation Keepsake customer suite #1075

The current implementation checks the staging sign-in and public website entry screens at 390×844 and 1280×800. Browser requests are limited to read-only staging pages, assets, and the checkout product catalog. Results record the served SHA before and after a run and are written to `~/tsv-dispatch/customer-suite/results/<run>/`.

```sh
node scripts/customer_suite/preflight.mjs manual --no-report
node scripts/customer_suite/s10_auto_issue.mjs
bash scripts/customer_suite/install-cron.sh
bash scripts/customer_suite/cron.sh post-deploy
```

The installer schedules the browser preflight every two hours. The five-minute deployment watcher runs it when staging serves a new SHA. A deployment operator can call the post-deploy command after any rollout, including a redeploy of the same SHA. The wrapper serializes scheduled and deployment runs with a host lock.

An evidenced assertion failure opens or updates one issue per scenario. Issues have the `customer-suite`, `bug`, and `executor:claude` labels, the failed assertion, and screenshot links. The reporter invokes the host doorbell on issue creation. The acceptance test exercises creation, evidence, and repeat updates with a fake GitHub client.

## Signed-in scenarios

C1 and C3 currently stop at the existing public entry pages. `login.html` has a sign-in form without a functional submission. The product's public flow in `features/post-purchase-email-eula.md` starts at checkout, opens the app from its onboarding link, and accepts terms in the app. The tagged harness in `scripts/harness/live-provision.mjs` and `cleanup.mjs` is a source reference for ownership and teardown. Its direct database fixture bypasses public account creation.

| Rows | Remaining work |
| --- | --- |
| C1, C3 | Drive the existing public onboarding flow with a staging-only synthetic checkout/account lifecycle. Verify account and vacation deletion for every run, including failed runs. |
| C2 | Drive the app composer into vacation creation after confirming the staging chat backend satisfies the provider rule. |
| C4 | Use the product invite action, accept as a second synthetic account, then verify its edit from the owner context. |
| C5 | Create a second vacation through the supported customer path and verify the existing switcher loads both by name. |
| C6 | Drive the MCP through the app import preview, change request, approval, media binding, and a chat correction for a skipped item. |
| C7 | Open a synthetic vacation's public share URL in a fresh viewer context. |
| C8 | Use the existing keepsake control and verify PDF bytes, or record a skip if the control is absent. |
| C9 | Point the installed host commands at the full runner once the signed-in scenarios and cleanup work. |
| C11 | Record two consecutive full green runs on the same staging build. The receipt checker ignores preflights and requires matching account and vacation cleanup totals. |

For C11, write full results with `suite: "vk-customer-suite"`, `full: true`, `status`, `target`, `sha`, `verifiedSha`, `finishedAt`, `cleanup`, and checks `s1` through `s8` with their viewport screenshots and assertions. A preflight never produces a green full-suite result.
