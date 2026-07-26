#!/usr/bin/env bash
# Slack notification for the Dependency Auto Update workflow. Reads the step
# outcomes (O_*), the overall job status (JOB_STATUS) and the update step's
# outputs from the environment — see the Notify Slack step in
# deps-autoupdate.yml for the full list.
#
# Sends at most one message per run. Quiet days (nothing changed, nothing
# failed) send nothing — silence = checked and all good — except a heartbeat
# every 10th day, so silence-because-healthy can be told apart from the
# schedule silently not running at all.
set -u

# Join arguments with newlines.
lines() { printf '%s\n' "$@"; }

# Which step failed, if any?
stage=""
if   [ "${O_INSTALL_BASE:-}" = "failure" ]; then stage="install-base"
elif [ "${O_BUILD_BASE:-}"   = "failure" ]; then stage="build-base"
elif [ "${O_BROWSERS:-}"     = "failure" ]; then stage="playwright-install"
elif [ "${O_BASELINE:-}"     = "failure" ]; then stage="baseline"
elif [ "${O_BEFORE_IMG:-}"   = "failure" ]; then stage="before-image"
elif [ "${O_UPDATE:-}"       = "failure" ]; then stage="update"
elif [ "${O_AFTER_IMG:-}"    = "failure" ]; then stage="after-image"
elif [ "${O_CPR:-}"          = "failure" ]; then stage="create-pr"
elif [ "${O_AUTOMERGE:-}"    = "failure" ]; then stage="auto-merge"
fi

# Pick the message. The auto-merge failure branch must come before the
# generic stage one: by then a PR exists, so "nothing was pushed" would be
# wrong. The dry-run branch must come before the FAILED_GROUPS ones: a dry
# run never opens a PR, even when some groups pass.
if [ "$stage" = "auto-merge" ]; then
    text=$(lines \
        ":x: leaflet-starter deps update: checks passed and the PR was created, but auto-merge FAILED." \
        "Updates: ${DELTA:-}" \
        "Nothing was merged. Review and merge manually: ${PR_URL:-${RUN_URL:-}}")
elif [ -n "$stage" ]; then
    text=$(lines \
        ":x: leaflet-starter deps auto-update failed at stage: ${stage}" \
        "Updates detected: ${DELTA:-none}" \
        "Nothing was merged. Artifacts are on the run: ${RUN_URL:-}")
elif [ "${JOB_STATUS:-success}" != "success" ]; then
    # A step failed that the stage map above doesn't know (newly added and
    # not mapped in, or the job was cancelled) — a red run must never fall
    # through to a success message or to silence.
    text=$(lines \
        ":x: leaflet-starter deps auto-update failed (job status: ${JOB_STATUS:-})" \
        "Updates detected: ${DELTA:-none}" \
        "Nothing was merged. Details are on the run: ${RUN_URL:-}")
elif [ "${CHANGED:-}" = "true" ] && [ "${DRY_RUN:-}" = "true" ]; then
    text=$(lines \
        ":large_blue_circle: [dry run] leaflet-starter update checks passed: ${DELTA:-}" \
        "Excluded groups (checks failed): ${FAILED_GROUPS:-none}" \
        "No PR created. ${RUN_URL:-}")
elif [ -n "${FAILED_GROUPS:-}" ] && [ "${CHANGED:-}" = "true" ]; then
    text=$(lines \
        ":warning: leaflet-starter deps update: some groups failed checks and were excluded: ${FAILED_GROUPS}" \
        "NOT auto-merged. PR with the passing updates (${DELTA:-}) needs review: ${PR_URL:-${RUN_URL:-}}")
elif [ -n "${FAILED_GROUPS:-}" ]; then
    text=$(lines \
        ":x: leaflet-starter deps update: all update groups failed checks: ${FAILED_GROUPS}" \
        "No PR created, nothing merged. Artifacts are on the run: ${RUN_URL:-}")
elif [ "${CHANGED:-}" = "true" ] && [ "${MERGED:-}" = "true" ]; then
    text=$(lines \
        ":white_check_mark: leaflet-starter deps update v${NEXT_VERSION:-} (${DELTA:-}) passed all checks and was auto-merged." \
        "CI, the release and the Pages deploy follow automatically. ${PR_URL:-${RUN_URL:-}}")
elif [ "${CHANGED:-}" = "true" ] && [ "${MERGE_SKIPPED:-}" = "no-token" ]; then
    text=$(lines \
        ":warning: leaflet-starter update PR passed all checks but was NOT auto-merged: secrets.PR_TOKEN is not set." \
        "Merge manually: v${NEXT_VERSION:-} (${DELTA:-}) ${PR_URL:-${RUN_URL:-}}")
elif [ "${CHANGED:-}" = "true" ]; then
    # Safety net: PR exists but the auto-merge step reported neither outcome.
    text=$(lines \
        ":white_check_mark: leaflet-starter update PR is ready for review: v${NEXT_VERSION:-} (${DELTA:-})" \
        "Merging it will release automatically. ${PR_URL:-${RUN_URL:-}}")
elif [ $(( $(date +%s) / 86400 % 10 )) -eq 0 ]; then
    # Days-since-epoch modulo 10: fires on the same 1-in-10 days regardless
    # of month boundaries, with no state to store.
    text=$(lines \
        ":wave: leaflet-starter deps heartbeat: the daily update check is alive, nothing to update." \
        "Sent every 10 days — if these stop coming, the schedule is no longer running. ${RUN_URL:-}")
else
    echo "Nothing to notify."
    exit 0
fi

if [ -z "${SLACK_WEBHOOK_URL:-}" ]; then
    echo "::warning::SLACK_WEBHOOK_URL secret is not set. Skipped notification: ${text}"
    exit 0
fi
jq -n --arg text "$text" '{text: $text}' |
    curl -sf -X POST -H 'Content-type: application/json' --data @- "$SLACK_WEBHOOK_URL" ||
    echo "::warning::Slack notification failed"
