# Heritage Compliance Hub — V1 Phase 1 Audit System

This package adds the first production-style audit management layer to the Heritage Compliance Hub prototype.

## Included in Phase 1

- Five audit topics:
  - Marketing
  - Staff
  - Documentation
  - Compliance
  - Quality & Governance
- Four minimum required audit topics: Marketing, Staff, Documentation and Compliance.
- Audit scoring from 0–100%.
- Overall compliance score calculated from the latest completed topic scores.
- Audit completion percentage based on the four required topics.
- Full historical audit register.
- Comparison against the previous audit for the same topic: Improved / Unchanged / Declined.
- Compliance trend chart for the selected office/network and topic.
- Audit scheduling with:
  - Monthly
  - Quarterly
  - Every 6 months
  - Annual
- Schedule statuses:
  - Scheduled
  - In progress
  - Completed
  - Overdue
- Automatic next-due-date calculation after a completed audit is saved.
- Office profile scores continue to update automatically after every completed audit.
- Head Office can view network-wide schedules and overdue audits.
- Franchisees can see their own upcoming/overdue audit schedule.

## Firestore collections

Existing collections remain in place. This version adds:

```text
auditSchedules
```

Each schedule document contains fields such as:

```text
officeId
officeName
auditType
auditTypeName
frequency
nextDueDate
lastCompletedDate
status
createdBy
updatedBy
createdAt
updatedAt
```

## Firebase rules

The `firestore.rules` file includes access rules for `auditSchedules`:

- Head Office can create, update, delete and read schedules.
- Franchisees can read schedules belonging to their own office.

Publish the rules in Firebase after replacing the project files.

## Recommended default frequencies

The interface starts with:

| Audit | Default frequency |
|---|---|
| Marketing | Quarterly |
| Staff | Quarterly |
| Documentation | Quarterly |
| Compliance | Quarterly |
| Quality & Governance | Annual |

These can be changed by Head Office.

## Important

This is still an internal prototype/pilot build. Before network-wide rollout, tighten Firebase role security, add an audit trail, add evidence uploads, and test the workflow with a small number of offices.


## Scheduling permissions
Audit schedules are controlled by Head Office only. Franchisees have a read-only view of schedules for their own office and cannot create, edit, start, or delete schedules. Completed audits are also recorded by Head Office.


## Phase 2 — Actions, Evidence and Audit Follow-up

The Hub now supports the workflow:

**Audit → Finding → Action → Evidence → Head Office verification → Re-audit**

### Actions
- Head Office creates actions and can link them to an audit.
- Actions include finding, required change, office, owner, due date, priority and status.
- Franchisees can submit an action as complete.
- Head Office approves or re-opens the action.

### Evidence
- Franchisees and Head Office can upload real files to Firebase Storage.
- Supported examples: PDF, Word, Excel and images.
- Evidence can be linked to an action.
- Uploaded evidence is initially `awaiting-review`.
- Head Office can approve or re-open evidence.

### Firebase setup
1. Enable **Storage** in Firebase Console.
2. Publish `firestore.rules`.
3. Publish `storage.rules` in Firebase Storage Rules.
4. Test uploads with a small PDF/image before network rollout.


## Audit loading fix
This build normalises existing Firestore role values such as `Franchisor` / `Franchisee` to the expected lowercase values in the app. Firestore rules also accept both legacy and lowercase role values. The Audits page now reads only the franchisee's own office document instead of attempting to read the entire offices collection.


## Audits clean build
The Audits page has been rebuilt with a self-contained, defensive implementation to avoid the previous module initialisation/loading failure. Existing Firestore collections and data remain compatible.


## Audits standalone replacement
The Audits page has been rebuilt as a standalone Firestore module. It does not initialise Firebase Storage, Actions or Evidence code. It only depends on Firebase Authentication, Firestore and the existing common shell. The script URL has a cache-busting version query.
