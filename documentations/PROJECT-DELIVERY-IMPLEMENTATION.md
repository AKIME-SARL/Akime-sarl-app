# Private project delivery management

## Overview

The private project-delivery system tracks internal construction work separately
from the public portfolio. The existing `Project` model and its public content
API are unchanged. Delivery records use the dedicated Mongoose model and
MongoDB collection `deliveryprojects`.

## Project data

Each delivery project supports:

- Name, client, client and project references.
- Project manager and assigned team members.
- Lifecycle status: `BACKLOG`, `PLANNED`, `IN_PROGRESS`, `ON_HOLD`,
  `COMPLETED`, or `CANCELLED`.
- Priority: `LOW`, `MEDIUM`, `HIGH`, or `URGENT`.
- Start date, expected completion date, and actual completion date.
- Budget and percentage progress (0-100).
- Milestones, tasks, and document references.
- Notes with author and timestamp, plus an activity history.

Assignments are references to active users. The team-member lookup returns
active administrators and editors for assigning work.

## API

All routes are mounted at `/api/delivery-projects` and require an authenticated
user with the `admin` role.

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/` | List delivery projects |
| `GET` | `/members` | List assignable administrators and editors |
| `GET` | `/:id` | Read project details, tasks, notes, and activity |
| `POST` | `/` | Create a delivery project |
| `PUT` | `/:id` | Update project fields, assignments, milestones, tasks, and documents |
| `POST` | `/:id/documents` | Upload up to 10 documents to a project |
| `POST` | `/:id/notes` | Add a note and record the action in project activity |
| `DELETE` | `/:id` | Delete a delivery project |

Payload validation enforces the status and priority values, date formats,
progress and budget ranges, nested collection limits, valid active user
assignments, and safe document references. Admins upload PDF, DOCX, XLSX, CSV,
TXT, JPG, PNG, GIF, and WEBP files through the project documents endpoint (up
to 10 files per request and 20 MB per file by default). The server checks file
signatures, assigns generated filenames, and serves these files through an
admin-authenticated, non-cacheable download route. Changes, uploads, and notes
append activity entries identifying the acting user.

## Admin interface

The admin dashboard has a distinct **Projets internes** section. Administrators
can list, create, edit, inspect, and delete delivery projects; edit lifecycle,
priority, assignment, dates, budget, progress, milestone/task/document data;
and add project notes. The public **Projets** section continues to manage the
portfolio independently.

The create/edit form groups project details, planning, milestones, tasks, and
documents into separate sections. Team assignments use selectable member
options; progress uses a slider; milestones and tasks use add/remove form rows.
Admins can choose document files from their device, download existing uploads,
and explicitly retain or remove files when editing. The form adapts to narrow
screens and keeps its save controls visible while scrolling.

## Implementation files

- `api/models/DeliveryProject.js` — delivery-project schema and indexes.
- `api/routes/deliveryProjects.js` — admin-protected API and validation.
- `server.js` — API route mounting.
- `public/admin/dashboard.html` — navigation and delivery section.
- `public/admin/js/admin.js` — section routing.
- `public/admin/js/delivery-projects.js` — project-delivery admin interface.
- `README.md` — project-delivery API and setup documentation.
