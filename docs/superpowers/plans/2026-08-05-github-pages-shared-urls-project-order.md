# GitHub Pages Shared URLs And Project Order Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let Ishida and Tanoue open user-specific shared URLs and let users reorder the weekly project goal cards into a balanced layout.

**Architecture:** Keep the app static so it can be hosted by GitHub Pages. Store project card order in existing project `order` values, and use query parameters for the selected user without changing the data model.

**Tech Stack:** Vanilla ES modules, localStorage/Firebase adapter, GitHub Pages static hosting.

## Global Constraints

- Use GitHub Pages only in a free-friendly way: public repository/project site.
- Do not add paid services or API billing.
- Preserve existing Firebase local fallback behavior.
- Do not commit in this environment because `.git` writes are blocked.

---

### Task 1: User URL Helpers

**Files:**
- Modify: `src/main.js`
- Test: `tests/ui-view.test.mjs`

**Interfaces:**
- Produces: `getUserIdFromUrl(url, fallbackUserId = 'ishida')`
- Produces: `buildUserUrl(url, userId)`

- [ ] **Step 1: Write failing tests for query URLs**

Add tests that `?user=tanoue` selects `tanoue`, invalid values fall back to `ishida`, and `buildUserUrl` replaces the `user` parameter.

- [ ] **Step 2: Implement URL helpers**

Export the helpers from `src/main.js`; keep them pure so tests do not need a browser.

- [ ] **Step 3: Wire boot and switch-user**

Initialize `activeUserId` from `window.location.href`, update the browser URL when switching users, and render user-specific share links.

### Task 2: Project Order Reordering

**Files:**
- Modify: `src/state/store.js`
- Modify: `src/main.js`
- Modify: `src/styles.css`
- Test: `tests/state.test.mjs`

**Interfaces:**
- Produces: `moveProjectOrder(state, projectId, direction)`

- [ ] **Step 1: Write failing reorder tests**

Test moving a middle project up/down swaps order with its neighbor, and boundary moves leave order unchanged.

- [ ] **Step 2: Implement state helper**

Add `moveProjectOrder(state, projectId, direction)` that swaps project order among active projects.

- [ ] **Step 3: Add UI controls**

Add arrow buttons to weekly project cards. Use the shared project order, so cards can be arranged as top three and bottom three.

- [ ] **Step 4: Style balanced layout**

Use a 3-column grid on desktop and a single column on mobile.

### Task 3: Verify And Prepare GitHub Pages

**Files:**
- Modify: `README.md`
- Modify: `outputs/workload-time-tracker-dist.zip`

- [ ] **Step 1: Run tests, lint, build**

Run `npm.cmd test --cache .\.npm-cache`, `npm.cmd run lint --cache .\.npm-cache`, and `npm.cmd run build --cache .\.npm-cache`.

- [ ] **Step 2: Package outputs**

Refresh `outputs/workload-time-tracker-dist.zip`.

- [ ] **Step 3: Publish handoff**

If a GitHub repository is provided or local remote exists, push and enable Pages. Otherwise report the needed repository name/URL.
