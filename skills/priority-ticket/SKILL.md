---
name: priority-ticket
description: Fetch the highest-priority Jira ticket assigned to the current user (through the Atlassian MCP) and start working on it. Use when starting a new task in a project that uses Jira.
---

# Priority ticket

Ticket moves follow the global CLAUDE.md, section «Jira»: to In Progress when work starts, to Done when the last PR of the ticket is merged. Status names vary per Jira project: use the project's own names for "to do", "in progress" and "done".

1. Through the Atlassian MCP, find the tickets assigned to the current user in the "to do" status, sort them by priority and take the highest. Skip tickets that are already started or closed.
2. Summarize its acceptance criteria.
3. Enter plan mode and propose how to implement it, following the project's `CLAUDE.md` and `AGENTS.md` if they exist.
4. As soon as the user approves the plan, which is when the work starts, move the ticket to "in progress".
5. When the PR is open, leave a comment on the ticket with the PR link.
6. Once the ticket's last PR is merged (the user says so, or `gh pr view` shows it), move it to "done".
