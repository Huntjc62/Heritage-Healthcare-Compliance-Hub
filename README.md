# Heritage Compliance Hub V1 — Full Navigation Package

This package replaces the earlier V1 and gives every item in the sidebar a working page.

## Pages

- Dashboard
- Audits
- Actions
- Evidence
- Reports
- Offices (Head Office only)
- Users (Head Office only)

## Firebase

The supplied Heritage Compliance Hub Firebase Web App configuration is already included.

Enable:
1. Authentication → Email/Password
2. Firestore Database
3. Publish `firestore.rules`

## Firestore collections

- `users`
- `offices`
- `audits`
- `actions`
- `evidence`

## User profiles

Head Office:
```text
name: Head Office Admin
email: your@email.com
role: franchisor
officeId: null
```

Franchisee:
```text
name: Birmingham South Manager
email: manager@email.com
role: franchisee
officeId: birmingham-south
```

The role values are case-sensitive. Use lowercase `franchisor` and `franchisee`.

## Important

The Users page creates the Firestore profile only. It does not create a Firebase Authentication account. Create the login first in Firebase Authentication, copy its UID, then create the matching profile in the Users page.

## Running

Use VS Code Live Server or GitHub Pages. Do not open the HTML directly using `file://`.


## Audit system update

The V1 audit system now supports five tracked compliance topics:

1. Marketing
2. Staff
3. Documentation
4. Compliance
5. Quality & Governance (additional topic)

The first four are the minimum required audits for an office. Quality & Governance is an additional fifth topic.

### Adding an audit

Head Office > Audits > + Add an audit.

Complete:
- Franchise office
- Audit type
- Completed by
- Date completed
- Score (0–100%)
- Future changes / notes

Saving the audit:
- Creates a completed audit in Firestore
- Updates the office's latest score for that topic
- Recalculates overall compliance
- Recalculates minimum audit completion (4 required audits)
- Updates the office record used by the franchisee dashboard
- Makes the completed audit visible to the franchisee

### Office fields automatically maintained

Each office can now contain:
- `complianceScore`
- `auditCompletion`
- `completedAudits`
- `requiredAuditsCompleted`
- `requiredAudits`
- `scores.documentation`
- `scores.staff`
- `scores.compliance`
- `scores.marketing`
- `scores.quality-governance`
- `lastAuditDate`

If an office has more than one audit for the same topic, the most recent completed audit becomes that topic's current score.
