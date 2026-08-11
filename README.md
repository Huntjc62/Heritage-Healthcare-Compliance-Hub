# Heritage Compliance Hub — V1

## Included

- Firebase email/password login
- Franchisor / Head Office role
- Franchisee role
- Role-based dashboards
- Network office overview
- Individual franchise dashboard
- Audit list
- Monthly compliance audit
- Documentation, Staff, Compliance and Marketing sections
- Compliant / Partial / Non-compliant / N/A answers
- Automatic scoring
- Firestore security rules

## Firebase configuration

The project is already configured with the Firebase Web App configuration supplied for:

heritage-compliance-hub

You should still review Firebase Authentication, Firestore Security Rules, App Check, hosting, privacy and data governance before using real operational or care information.

## Firebase setup

1. Open Firebase Console.
2. Open the `heritage-compliance-hub` project.
3. Enable Authentication → Email/Password.
4. Create a Cloud Firestore database.
5. Publish `firestore.rules`.
6. Create office documents using `firestore.seed.json` as a guide.
7. Create Authentication users.
8. For every Authentication user, create `/users/{UID}` in Firestore.
9. Use `role: "franchisor"` for Head Office.
10. Use `role: "franchisee"` for franchise users.
11. Franchise users must have an `officeId` matching an `/offices/{officeId}` document.

## Running

Use VS Code with Live Server or GitHub Pages. Do not open the files directly with `file://`, because the project uses ES modules.

## First test

Create:
- One Head Office Authentication user + Firestore profile with `role: franchisor`
- One Birmingham South Authentication user + Firestore profile with `role: franchisee` and `officeId: birmingham-south`
- One `offices/birmingham-south` document

Log in as Head Office first, create the demo audit, then sign in as the Birmingham South franchisee and complete it.
