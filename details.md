details.txt

# Project Pack Application - Integration & Replication Guide

This document provides a highly detailed breakdown of the core systems within the Project Pack Application. It serves as a blueprint for replicating the Project Workspace, CRM, and Storage sections in any modern web application.

---

## 1. Project Creation Workspace (PackWorkspace.jsx)
The Workspace is the "command center" for individual construction projects. It handles automated data gathering, AI-driven analysis, and document management.

### Key Functional Components
*   **Initialization & Scraping (`handleStartWorkspace`):**
    *   Triggers a backend Cloud Function (`createProjectWorkspace`) with the planning portal reference.
    *   Expected Result: A scraped set of PDF/Image documents (Floor Plans, Elevations) saved to a specific storage path.
    *   System creates a corresponding Google Drive folder and Docs ID for long-term document hosting.
*   **AI Technical Summary (`handleGenerateAI`):**
    *   Uses Vertex AI (Gemini 2.5 Flash) to analyze project documents.
    *   Logic: Filters the first 5 relevant files (Plans/Elevations), converts them to `fileUri` (gs://), and sends them to the model with a technical construction prompt.
    *   Prompt Focus: Floor-by-floor technical summary, structural requirements (RSJs), technical challenges (drainage, roof types), and homeowner intent.
*   **Document Management:**
    *   Drag-and-drop file uploading directly to Firebase Storage/Google Drive via Cloud Functions.
    *   Real-time file listing with previewing, deletion, and link copying.
*   **Unique Project ID Generation:**
    *   Logic: Combination of Address + Reference + GPS Coordinates.
    *   Ensures consistent identification across systems even if addresses are entered slightly differently.

### Replication Steps
1.  **Database Strategy:** Store project metadata in Firestore. Require fields for `address`, `reference`, `projectFiles` (array), and `aiDescription`.
2.  **Storage Logic:** Define a standardized naming convention (e.g., `projects/[address_slug]_[id]`).
3.  **AI Integration:** Set up a Vertex AI endpoint. Use multi-modal capabilities to "read" PDF plans.

---

## 2. CRM Section (CRM.jsx)
A Master-Detail dashboard designed for managing Builders and Homeowners separately with a focus on "Next Actions" and "Timelines".

### Logic Flow
*   **Entity Separation:**
    *   `Homeowners View`: Logic based on `projects` collection. Projects are tagged `crm_active: true` when linked.
    *   `Builders View`: Logic based on `contacts` collection where `contact_type: 'Builder'`.
*   **The Pop-Out Profile Architecture:**
    *   Instead of standard page routing, profiles open as fullscreen-centered pop-out windows. This provides maximum space for the Universal Timeline and Situation/Next Step blocks.
*   **Builder Profile System:**
    *   **Last Contact Timer:** Auto-calculates `new Date() - last_interaction_timestamp`. Returns red if > 14 days.
    *   **The Next Step Block:** A high-priority, auto-saving text area for immediate workflow clarity.
*   **Homeowner Profile System:**
    *   **The Situation Box:** Contextual description of the job (lifecycle/scoping).
    *   **Interactive Scoping Checklist:** Hard-coded boolean steps (House Visited -> Specs Gathered -> Details Sent) that sync to Firestore.
*   **Universal Timeline (`UniversalTimeline.jsx`):**
    *   A generic feed that renders the `interactions` collection.
    *   Filtered by `contact_id` (Builders) or `project_id` (Homeowners).
    *   Supports types: `Call`, `Email`, `Meeting`, `Note`.

### Replication Steps
1.  **Collection Structure:** `contacts` (builders/homeowners), `projects` (scoped jobs), and `interactions` (the timeline logs).
2.  **Indexing:** Ensure `interactions` are sorted by `timestamp` desc.
3.  **State Management:** Use Firebase real-time listeners (`onSnapshot`) so saving a "Next Step" or checking a box on one screen updates all linked views instantly.

---

## 3. Storage Section (StorageExplorer.jsx)
A global manager for all physical project files stored in the cloud.

### Key Features
*   **Folder Discovery:** Recursively lists prefixes in the `projects/` storage bucket.
*   **Project Mapping:** Attempts to cross-reference folder names (slugs) with Firestore Project IDs to provide human-readable names (`projectName`) instead of just IDs.
*   **Status Tagging:** Labels folders as "Synced" (matching a project) or "Orphaned" (files exist but no database project found).
*   **Vault Controls:**
    *   Grid/List view for files.
    *   Metadata extraction: File size, Content-type, Last updated.
    *   Security: Deep delete (removes both the storage object and the reference in the project document).

### Replication Steps
1.  **Storage API:** Use `listAll()` from Firebase Storage.
2.  **Hydration Logic:** Fetch the full list of projects first. When listing storage folders, map the `folder_id` to the `project_id` to replace raw paths with addresses.
3.  **Cleanup Hooks:** Always ensure that deleting a file in Storage triggers a filter update on the `projectFiles` array in the database.

---

## 4. How to Replicate (The "Engine" Recap)
To copy this system into a new app, you need:
1.  **Frontend:** React + Tailwind CSS + Lucide Icons.
2.  **Backend:** Firebase (Firestore, Storage, Auth, Functions).
3.  **AI:** Vertex AI (Google Cloud) with Gemini 2.5 Flash.
4.  **APIs:** axios for calling Cloud Functions (Robot Scrapers & Drive Uploaders).
5.  **State:** Context Providers for Toasts and Confirmations (to handle deletions/saves gracefully).

### Database Schema Schema
*   **Project:** `{ id, address, reference, customId, aiDescription, projectFiles: [], crm_active: bool, situation: string, situationChecklist: { ... } }`
*   **Contact:** `{ id, name, company, phone, email, contact_type, status, next_step }`
*   **Interaction:** `{ id, project_id, contact_id, type, summary, timestamp, next_action_date }`

---
*Generated by Antigravity AI for Project Pack Application Development.*
