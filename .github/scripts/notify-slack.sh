#!/usr/bin/env bash
# Slack notification for the Dependency Auto Update workflow. Reads the step
# outcomes (O_*) and the update step's outputs from the environment — see the
# Notify Slack step in deps-autoupdate.yml for the full list.
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
elif [ "${O_UPDATE:-}"       = "failure" ]; then stage="update"
elif [ "${O_CPR:-}"          = "failure" ]; then stage="create-pr"
fi

# Pick the message. The dry-run branch must come before the FAILED_GROUPS
# ones: a dry run never opens a PR, even when some groups pass.
if [ -n "$stage" ]; then
    text=$(lines \
        ":x: leaflet-starter deps auto-update failed at stage: ${stage}" \
        "Updates detected: ${DELTA:-none}" \
        "Nothing was pushed. Artifacts are on the run: ${RUN_URL:-}")
elif [ "${CHANGED:-}" = "true" ] && [ "${DRY_RUN:-}" = "true" ]; then
    text=$(lines \
        ":large_blue_circle: [dry run] leaflet-starter update checks passed: ${DELTA:-}" \
        "Excluded groups (checks failed): ${FAILED_GROUPS:-none}" \
        "No PR created. ${RUN_URL:-}")
elif [ -n "${FAILED_GROUPS:-}" ] && [ "${CHANGED:-}" = "true" ]; then
    text=$(lines \
        ":warning: leaflet-starter deps update: some groups failed checks and were excluded: ${FAILED_GROUPS}" \
        "PR created for the passing updates (${DELTA:-}): ${PR_URL:-${RUN_URL:-}}")
elif [ -n "${FAILED_GROUPS:-}" ]; then
    text=$(lines \
        ":x: leaflet-starter deps update: all update groups failed checks: ${FAILED_GROUPS}" \
        "No PR created. Artifacts are on the run: ${RUN_URL:-}")
elif [ "${CHANGED:-}" = "true" ]; then
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
