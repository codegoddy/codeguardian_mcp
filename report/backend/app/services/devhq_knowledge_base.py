"""
DevHQ Knowledge Base
Comprehensive context for the AI support assistant to provide accurate help.
"""

DEVHQ_KNOWLEDGE_BASE = """
# DevHQ - Freelance Developer Platform Knowledge Base

## Overview
DevHQ is a comprehensive project management and billing platform designed specifically for freelance developers. It helps developers manage their client projects, track time, generate invoices, and handle change requests professionally.

---

## Core Features

### 1. Projects
**Location:** Dashboard → Projects page (web UI)

**How to create a project:**
1. Go to the **Projects** page from the sidebar
2. Click **"Create Project"** button
3. Fill in project details (name, client, budget, hourly rate)
4. Optionally select a project template to pre-fill deliverables
5. Click **"Create"** - this generates a contract automatically
6. The contract is sent to the client for signing

**Project Statuses:**
- **Awaiting Contract**: Project created, contract not yet generated/sent
- **Contract Sent**: Contract sent to client, awaiting signature
- **Active**: Contract signed, work can begin
- **Paused**: Project temporarily paused
- **Completed**: All work finished
- **Cancelled**: Project cancelled

**Important:** Projects are created through the web UI, NOT through the CLI.

---

### 2. Clients
**Location:** Dashboard → Clients page

**How to add a client:**
1. Go to the **Clients** page from the sidebar
2. Click **"Add Client"** button
3. Fill in client details (name, email, company, payment preferences)
4. Click **"Save"**

**Client Features:**
- Store client contact information
- Track all projects per client
- Configure payment methods per client
- Send client portal access links

---

### 3. Time Tracking
**There are TWO ways to track time in DevHQ:**

#### A. CLI Time Tracking (For coding work)
The DevHQ CLI is used for time tracking while coding. It automatically tracks your work session.

**Setup:**
1. Go to **Integrations** page from the sidebar
2. Scroll to the **CLI & API** section
3. Click **"Generate CLI Token"**
4. Install the DevHQ CLI: `npm install -g devhq-cli`
5. Configure with: `devhq login --token YOUR_TOKEN`

**Usage:**
```bash
# Start tracking time on a deliverable
devhq start DEL-001

# Pause tracking
devhq pause

# Resume tracking
devhq resume

# Stop tracking and record time
devhq stop --notes "Brief description of work done"
```

**Important:** The CLI does NOT create projects. It only tracks time against existing deliverables.

#### B. Third-Party Time Trackers (For non-coding work)
For meetings, research, planning, and other non-coding work, DevHQ integrates with:

- **Toggl Track**: Connect via Integrations page to import time entries
- **Harvest**: Connect via Integrations page to import time entries

**Note:** DevHQ does NOT have built-in manual time entry. Use Toggl or Harvest for non-coding time tracking, then sync via integrations.

---

### 4. Deliverables
**Location:** Projects page → View a project → Project Detail Sidebar → "Manage Deliverables" button

Deliverables are the tasks/work items within a project.

**How to access deliverables:**
1. Go to the **Projects** page
2. Click **"View"** on a project
3. In the **Project Detail Sidebar**, click **"Manage Deliverables"**
4. This opens the Deliverables page for that project

**How to create deliverables:**
Deliverables are created when setting up a project using Templates:
1. Go to **Projects** page → **Templates** tab
2. Either:
   - Use **AI** to generate milestones and deliverables from a description
   - Create them **manually from scratch**
3. Apply the template to a project

**Deliverable Statuses:**
- **Pending**: Work hasn't started yet
- **In Progress**: Currently being worked on
- **Completed**: Work finished
- **Verified**: Verified via merged PR or client approval
- **Billed**: Included in an invoice

**Tracking Codes:** Each deliverable gets a code like `DEL-001` that you use with the CLI.

---

### 5. Milestones
Milestones group related deliverables together for organized billing and progress tracking.

**How to create milestones:**
Milestones are created as part of project templates:
1. Go to **Projects** page → **Templates** tab
2. Either:
   - Use **AI** to generate milestones and deliverables automatically
   - Create them **manually from scratch**
3. Apply the template to a project

---

### 6. Contracts
**Location:** Projects page → Contracts tab

DevHQ generates professional contracts automatically when you create a project.

**Contract Flow:**
1. Create a project → Contract is generated from your template
2. Contract is sent to client via email
3. Client reviews and signs electronically
4. Project becomes "Active" after signing

**Contract Templates:**
- Go to **Projects** page → **Contracts** tab
- Click **"Edit Contract Template"** button
- Customize your contract template
- Click **Save** - this becomes your default template for all new projects

**Important Notes:**
- Users have only ONE contract template
- When you edit and save the system template, it becomes YOUR default template
- You cannot create multiple contract templates
- To change your contract, simply edit your current template and save it
- Templates support placeholders like {{CLIENT_NAME}}, {{PROJECT_BUDGET}}, etc.

---

### 7. Invoices
**Location:** Dashboard → Invoices page

The Invoices page has TWO tabs:

#### A. Invoices Tab
Displays all created invoices.

**Invoice Statuses:**
- **Draft**: Not yet sent
- **Sent**: Emailed to client
- **Awaiting Verification**: Client marked as paid (for manual payments)
- **Paid**: Payment confirmed

#### B. Payment Schedule Tab
Create payment schedules and invoices based on the contract used in the project.

**How to create a payment schedule:**
1. Go to the **Invoices** page
2. Click the **Payment Schedule** tab
3. Select a project
4. AI parses your contract to suggest payment milestones
5. Review and adjust the schedule
6. Trigger invoices based on the schedule

**Invoice Generation:**
- Invoices can be generated from the payment schedule
- Payment milestones automatically create invoices when triggered

**Sending an Invoice:**
1. Open the invoice from the Invoices tab
2. Click **"Send to Client"**
3. Client receives email with payment link

---

### 8. Payment Methods
**Location:** Settings → Payment Methods

Configure how clients can pay you.

**IMPORTANT:** DevHQ does NOT store or hold client payments. Payments go directly to you based on the terms agreed in your contract with the client.

**Automatic Payments:**
- **Paystack**: Online credit/debit card payments
  - Payments are processed automatically
  - You receive your money within **2-3 business days**
  - Set up your Paystack subaccount to receive payments

**Manual Payment Methods:**
- **Bank Transfer**: Wire transfers
- **Mobile Money**: M-Pesa, Airtel Money, etc.
- **PayPal**: PayPal payments
- **Wise**: Wise (TransferWise) payments
- **Cryptocurrency**: Bitcoin, Ethereum, etc.
- **Other**: Configure your own custom payment method type

**Note:** For manual payment methods, clients pay you directly using the details you provide. You then verify payment receipt in DevHQ when they mark invoices as paid.

---

### 9. Change Requests
**Location:** Within a project → Change Requests tab

When a client wants work outside the original scope:

**How to create a change request:**
1. Open the **Project**
2. Go to **Change Requests** tab
3. Click **"Create Change Request"**
4. Describe the additional work and estimated cost
5. Submit - client receives notification in their portal
6. Client approves or rejects

**Approved CRs:** Get added to project scope and can be invoiced.

---

### 10. Client Portal
Clients access their own portal to:
- View project progress
- See deliverable status and activity
- Review and sign contracts
- Approve change requests
- View and pay invoices
- Track payment history

**Sending Portal Access:**
1. Go to **Project** or **Client** details
2. Click **"Send Portal Link"**
3. Client receives magic link via email (no password needed)

---

### 11. Integrations
**Location:** Integrations page from the sidebar

#### GitHub Integration
1. Go to **Integrations** page from the sidebar
2. Click **"Connect GitHub"**
3. Authorize DevHQ
4. Once connected, projects are **automatically linked** to your GitHub repositories

**Note:** You don't need to manually link each project to GitHub. Once your GitHub account is connected, projects are connected automatically.

#### Time Tracker Integrations
- **Toggl Track**: Connect to import time entries for non-coding work
- **Harvest**: Connect to import time entries for non-coding work

#### Google Calendar Integration
1. Go to **Integrations** page
2. Click **"Connect Google Calendar"**
3. Authorize DevHQ
4. Once connected, you can sync planned work blocks to your calendar

---

### 12. Planning (Time Blocks)
**Location:** Dashboard → Time Tracker page → Planning section

Plan your work week:
1. View deliverables in the planning panel
2. Drag deliverables to calendar time slots
3. Toggle **"Sync to Google Calendar"** to automatically add plans to your Google Calendar (requires Google account connection)
4. Use **AI Auto-Schedule** to automatically plan your week

**Google Calendar Sync:**
- Connect your Google account in **Integrations** page first
- In the planning view, turn ON the **"Sync to Google Calendar"** toggle
- Your planned time blocks will automatically appear in your Google Calendar

---

### 13. AI Features

**AI Estimation:** When creating deliverables, click "Estimate" to get AI-suggested hours based on task description.

**AI Template Generation:** Create project templates from descriptions using AI.

**AI Scheduling:** Automatically plan your work week based on deadlines and preferences.

---

### 14. Project Templates
**Location:** Projects page → Templates tab

Pre-configured project structures you can reuse:

**System Templates:**
- Landing Page Development
- Full Stack Web App
- API Integration Project
- And more...

**Custom Templates:** Create your own from a completed project or from scratch.

---

## Settings

**Profile:** Change name, profile picture
**Security:** Change password
**Business:** Company name, currency preferences
**Payment Methods:** Configure how clients can pay you

**Note:** Hourly rates are NOT set in Settings. They are configured when creating a project.
**Note:** Contract templates are edited in the Projects page → Contracts tab, not in Settings.

---

## Common Questions

**Q: How do I start tracking time on a task?**
A: For coding work, use the DevHQ CLI with `devhq start DEL-XXX`. For non-coding work (meetings, research), use Toggl or Harvest and sync via the Integrations page.

**Q: How do I get paid?**
A: Set up Paystack in Settings → Payment Methods for automatic online payments, or configure mobile money/bank transfer for manual payments.

**Q: Can clients see my hourly rate?**
A: By default, clients see project totals and deliverable costs, not your hourly rate. You can customize contract visibility.

**Q: How do I handle scope changes?**
A: Create a Change Request from the project page. The client can approve it in their portal, and the additional cost gets added to the project.

**Q: Where do I manage my projects?**
A: All project management is done through the web app at devhq.site. The CLI is only for time tracking.

---

## Support
For billing or account issues: support@devhq.site
"""
