#!/usr/bin/env bash
# Notify once per run; no changes or failures means silence, except the heartbeat.
# Inputs are defined in the workflow's Notify Slack step, plus
# GITHUB_REPOSITORY from Actions.
set -u

lines() { printf '%s\n' "$@"; }
project="${GITHUB_REPOSITORY:-}"; project="${project#*/}" # owner/name -> name

# Preserve update failures; otherwise check the publish steps in execution order.
stage="${FAILED_STAGE:-}"
if [ -z "$stage" ]; then
    if   [ "${O_BASE_CHECK:-}" = "failure" ]; then stage="base-moved"
    elif [ "${O_VERIFY:-}"     = "failure" ]; then stage="verify-result-files"
    elif [ "${O_DISARM:-}"     = "failure" ]; then stage="disarm-auto-merge"
    elif [ "${O_CPR:-}"        = "failure" ]; then stage="create-pr"
    elif [ "${O_AUTOMERGE:-}"  = "failure" ]; then stage="auto-merge"
    fi
fi

# Merge failures need specific recovery steps. Dry runs must never claim a PR exists.
if [ "$stage" = "auto-merge" ]; then
    text=$(lines \
        ":x: ${project} deps update: checks passed and the PR was created, but auto-merge FAILED." \
        "Updates: ${DELTA:-}" \
        "Nothing was merged. Review and merge manually: ${PR_URL:-${RUN_URL:-}}")
elif [ "$stage" = "disarm-auto-merge" ]; then
    # No URL means the PR lookup failed before auto-merge could be disabled.
    if [ -n "${DISARM_PR_URL:-}" ]; then
        text=$(lines \
            ":x: ${project} deps update: could not disarm the auto-merge an earlier run left on the bot PR, so this run did not update it." \
            "The PR may still merge on its own once CI passes on it — disable auto-merge on it by hand, then review: ${DISARM_PR_URL}" \
            "Updates detected: ${DELTA:-none}. Excluded groups: ${FAILED_GROUPS:-none}. Details: ${RUN_URL:-}")
    else
        text=$(lines \
            ":x: ${project} deps update: could not check the open bot PR for a leftover auto-merge (the lookup failed), so this run did not update it." \
            "If a bot PR is open, check its auto-merge by hand before the next run." \
            "Updates detected: ${DELTA:-none}. Excluded groups: ${FAILED_GROUPS:-none}. Details: ${RUN_URL:-}")
    fi
elif [ -n "$stage" ]; then
    text=$(lines \
        ":x: ${project} deps auto-update failed at stage: ${stage}" \
        "Updates detected: ${DELTA:-none}" \
        "Nothing was merged. Artifacts are on the run: ${RUN_URL:-}")
elif [ "${UPDATE_RESULT:-success}" != "success" ] || [ "${JOB_STATUS:-success}" != "success" ]; then
    # Unmapped failures and cancellations must not report success or stay silent.
    text=$(lines \
        ":x: ${project} deps auto-update failed (update: ${UPDATE_RESULT:-?}, publish: ${JOB_STATUS:-?})" \
        "Updates detected: ${DELTA:-none}" \
        "Nothing was merged. Details are on the run: ${RUN_URL:-}")
elif [ "${CHANGED:-}" = "true" ] && [ "${DRY_RUN:-}" = "true" ]; then
    text=$(lines \
        ":large_blue_circle: [dry run] ${project} update checks passed: ${DELTA:-}" \
        "Excluded groups (checks failed): ${FAILED_GROUPS:-none}" \
        "No PR created. ${RUN_URL:-}")
elif [ -n "${FAILED_GROUPS:-}" ] && [ "${CHANGED:-}" = "true" ]; then
    text=$(lines \
        ":warning: ${project} deps update: some groups failed checks and were excluded: ${FAILED_GROUPS}" \
        "NOT auto-merged. PR with the passing updates (${DELTA:-}) needs review: ${PR_URL:-${RUN_URL:-}}")
elif [ -n "${FAILED_GROUPS:-}" ]; then
    text=$(lines \
        ":x: ${project} deps update: all update groups failed checks: ${FAILED_GROUPS}" \
        "No PR created, nothing merged. Artifacts are on the run: ${RUN_URL:-}")
elif [ "${CHANGED:-}" = "true" ] && [ "${ARMED:-}" = "true" ]; then
    text=$(lines \
        ":white_check_mark: ${project} deps update v${NEXT_VERSION:-} (${DELTA:-}) passed all checks — auto-merge armed." \
        "GitHub merges the PR as soon as CI passes on it; the release follows. ${PR_URL:-${RUN_URL:-}}")
elif [ "${CHANGED:-}" = "true" ] && [ "${MERGE_SKIPPED:-}" = "no-token" ]; then
    if [ "${O_APP_TOKEN:-}" = "failure" ]; then
        why="the App token could not be issued (App uninstalled, key revoked or permission missing)"
    else
        why="the deps-update GitHub App is not configured (vars.APP_CLIENT_ID / secrets.APP_PRIVATE_KEY)"
    fi
    text=$(lines \
        ":warning: ${project} update PR passed all checks but was NOT auto-merged: ${why}." \
        "PR: v${NEXT_VERSION:-} (${DELTA:-}) ${PR_URL:-${RUN_URL:-}}")
elif [ "${CHANGED:-}" = "true" ]; then
    text=$(lines \
        ":white_check_mark: ${project} update PR is ready for review: v${NEXT_VERSION:-} (${DELTA:-})" \
        "Merging it will release automatically. ${PR_URL:-${RUN_URL:-}}")
elif [ $(( $(date +%s) / 86400 % 10 )) -eq 0 ]; then
    # Count days from the epoch so month boundaries do not affect the interval.
    text=$(lines \
        ":wave: ${project} deps heartbeat: the daily update check is alive, nothing to update." \
        "Sent every 10 days — if these stop coming, the schedule is no longer running. ${RUN_URL:-}")
else
    echo "Nothing to notify."
    exit 0
fi

# Append recovery steps only when the PR was successfully created or found.
if [ "${CHANGED:-}" = "true" ] && [ "${O_CPR:-}" = "success" ] && [ -n "${PR_URL:-}" ]; then
    if [ "${DISARMED:-}" = "true" ]; then
        text=$(lines "$text" \
            "Removed the auto-merge that ${DISARM_ARMED_BY:-someone} had armed on the PR earlier; merge it by hand once CI passes.")
    fi
    if [ "${O_APP_TOKEN:-}" != "success" ]; then
        # Without a new push, CI may reflect a different token used in an earlier run.
        case "${PR_OPERATION:-}" in
            created|updated)
                text=$(lines "$text" \
                    "CI on a PR pushed with github.token waits for approval: press 'Approve workflows to run' on the PR (or close and reopen it), then merge once CI passes.") ;;
            *)
                text=$(lines "$text" \
                    "This run pushed nothing new to the PR. If its CI is still waiting for approval, press 'Approve workflows to run' (or close and reopen it); merge once CI passes.") ;;
        esac
        if [ "${O_APP_TOKEN:-}" = "failure" ]; then
            text=$(lines "$text" \
                "Fix the App before the next run — the error is in the 'Issue the App token' step: ${RUN_URL:-}")
        fi
    elif [ "${ARMED:-}" = "true" ] && [ "${PR_OPERATION:-}" != "created" ] && [ "${PR_OPERATION:-}" != "updated" ]; then
        # Arming auto-merge does not approve CI left pending by an earlier run.
        text=$(lines "$text" \
            "This run pushed nothing new. If the PR's CI is still waiting for approval (its commit came from a run without the App), press 'Approve workflows to run' or it will not merge.")
    fi
fi

if [ -z "${SLACK_WEBHOOK_URL:-}" ]; then
    echo "::warning::SLACK_WEBHOOK_URL secret is not set. Skipped notification: ${text}"
    exit 0
fi
jq -n --arg text "$text" '{text: $text}' |
    curl -sf -X POST -H 'Content-type: application/json' --data @- "$SLACK_WEBHOOK_URL" ||
    echo "::warning::Slack notification failed"
