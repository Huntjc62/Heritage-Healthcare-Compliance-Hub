# Heritage Compliance Hub — V1

This is a first working front-end for a Heritage Healthcare Franchise Compliance & Audit platform.

## V1 includes

- Firebase email/password login
- Franchisor (Head Office) role
- Franchisee role
- Role-based dashboards
- Network office overview for Head Office
- Individual office dashboard for franchisees
- Audit list
- Monthly compliance audit
- Four audit sections:
  - Documentation
  - Staff
  - Compliance
  - Marketing
- Compliant / Partial / Non-compliant / N/A responses
- Automatic audit scoring
- Basic Firestore security rules

## Important

Before using real Heritage Healthcare information, properly review and test Firebase Authentication, Firestore Security Rules, data protection, access controls and hosting.

## Firebase setup

1. Create a Firebase project.
2. Add a Web App.
3. Copy its Firebase configuration into `firebase-config.js`.
4. Enable Authentication → Email/Password.
5. Create a Cloud Firestore database.
6. Add the security rules from `firestore.rules`.
7. Create office documents.
8. Create Authentication users.
9. For each Authentication user, create a matching `/users/{UID}` Firestore document.
10. Use `role: "franchisor"` for Head Office or `role: "franchisee"` for a franchise user.
11. Franchisee users must have an `officeId` matching an office document ID.
12. Host the site on GitHub Pages or another static HTTPS host.

## Suggested first test accounts

Create two Authentication accounts yourself:

Head Office:
- email: your own test email
- role: franchisor

Franchise:
- email: another test email
- role: franchisee
- officeId: birmingham-south

Do not put real client/care-plan information into this V1 until the security, privacy and governance design has been properly reviewed.

## Running locally

Because the app uses ES modules, do not rely on opening HTML files directly with `file://`.

Use VS Code with a local server extension such as Live Server, or host the project through GitHub Pages.

