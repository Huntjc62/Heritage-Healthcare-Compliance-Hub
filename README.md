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
