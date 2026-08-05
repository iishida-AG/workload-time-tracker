# Firebase Auth Gate Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require Firebase email/password login before shared Firestore data is shown on the public GitHub Pages app.

**Architecture:** Keep local development usable through the existing localStorage fallback when Firebase config is empty. When Firebase config is complete, initialize Firebase Auth first, render a login gate until a user is signed in, then subscribe to the shared Firestore adapter.

**Tech Stack:** Vanilla ES modules, Firebase Auth, Firestore Security Rules, GitHub Pages static hosting.

## Global Constraints

- Do not add paid services.
- Do not add client-side signup.
- Do not hard-code Ishida/Tanoue real email addresses in this public repository.
- Firestore production safety depends on Firebase Console users plus Firestore rules.

---

### Task 1: Firebase Auth Controller

**Files:**
- Create: `src/state/auth.js`
- Test: `tests/auth.test.mjs`

**Interfaces:**
- Produces: `authIsRequired(firebaseConfig): boolean`
- Produces: `createAuthController({ firebaseConfig }): controller`
- Controller API: `{ mode, subscribe(callback), login(email, password), logout() }`

### Task 2: App Login Gate

**Files:**
- Modify: `src/main.js`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `createAuthController`
- Produces UI: Firebase login form, logout button, setup warning when auth fails.

### Task 3: Firestore Rules Template And Docs

**Files:**
- Add: `firestore.rules.example`
- Modify: `README.md`

**Interfaces:**
- Produces exact rules template with placeholder emails for Ishida/Tanoue.

### Task 4: Verification

**Commands:**
- `npm.cmd test --cache .\.npm-cache`
- `npm.cmd run lint --cache .\.npm-cache`
- `npm.cmd run build --cache .\.npm-cache`
