# Gateway Training Tool: Project Guide

**Document purpose:** A beginner-friendly guide for stakeholders, training coordinators, trainers, and new users.

**Project:** Gateway Training Tool  
**Audience:** Training coordinators, trainers, students/trainees, and leadership reviewers  
**Status:** Working web application prototype / internal training platform  

---

## 1. Overview

Gateway Training Tool is a web-based internal training management application designed for Gateway Casinos training teams. It brings class setup, trainee rosters, schedules, daily reports, trainer hours, audit history, and role-specific dashboards into one organized system.

The goal is to reduce scattered paperwork and manual tracking while giving training coordinators a clearer view of what is happening across active classes. Instead of managing training information across separate spreadsheets, emails, handwritten notes, and shared folders, the web app provides a central place to track the daily training workflow.

**Screenshot placeholder:** Insert a screenshot of the login page or main dashboard here.

## 2. What The Web App Does

The application supports three main user groups:

- **Coordinators** manage the overall training operation.
- **Trainers** view and update their assigned classes.
- **Students/Trainees** view their class information, schedule, progress, and results.

The app is organized around common training tasks:

- Creating and managing classes
- Assigning trainers and students
- Viewing schedules
- Recording and reviewing daily reports
- Tracking trainee progress, attendance, homework, drills, and tests
- Reviewing trainer hours
- Searching historical records
- Auditing changes to important records

## 3. Why It Matters

Training coordination depends on accurate, timely information. This tool is intended to help coordinators answer practical questions quickly:

- What classes are currently active?
- Which trainers are assigned?
- Who is enrolled?
- What sessions are coming up?
- Are daily reports being completed?
- Are students progressing as expected?
- Are there missing records that need follow-up?
- Who changed a record and when?

By centralizing that information, the tool supports better visibility, stronger accountability, and less administrative follow-up.

## 4. User Roles

### Coordinator

Coordinators have the broadest access. They can view the coordinator dashboard, manage classes, review students and trainers, search reports, manage schedules, and review audit or system health information.

Coordinator navigation includes:

- Dashboard
- Classes
- Students
- Trainers
- Reports
- Schedule
- Audit
- Health
- Settings

### Trainer

Trainers have a focused view of the classes assigned to them. They can see their dashboard, assigned classes, reports, schedule, and logged hours.

Trainer navigation includes:

- Dashboard
- My Classes
- Reports
- Schedule
- Hours
- Settings

### Student/Trainee

Students have a simplified self-service view. They can see their classes, upcoming schedule, progress ratings, drill results, test results, and settings.

Student navigation includes:

- Dashboard
- Settings

## 5. Main Features

### 5.1 Dashboard

The dashboard is the starting point after login. It summarizes the most important information for the current user.

For coordinators, the dashboard can show active classes, upcoming sessions, recent reports, attendance-related information, unreported sessions, and recent activity.

For trainers, the dashboard focuses on assigned classes, sessions for today, upcoming sessions, student counts, and hours.

For students, the dashboard shows enrolled classes, upcoming sessions, progress ratings, attendance-related details, and drill or test results.

**Screenshot placeholder:** Insert a screenshot of the coordinator dashboard here.

### 5.2 Class Management

The Classes area allows coordinators to view active and archived classes. Coordinators can filter classes by province, site, game type, or search term. They can also sort class records and perform actions such as archiving or restoring classes.

Class records are designed to hold the core training context, including class name, province, site, game type, dates, assigned trainers, enrolled students, reports, and schedule information.

**Screenshot placeholder:** Insert a screenshot of the Classes page with filters visible here.

### 5.3 Class Detail

The class detail view provides a deeper look at one class. This is where coordinators can review the details of the class and access related training records.

Typical class detail information includes:

- Class overview
- Assigned trainers
- Student enrollments
- Training schedule
- Daily reports
- Drill and test information
- Uploaded class documents, where applicable

**Screenshot placeholder:** Insert a screenshot of an individual class detail page here.

### 5.4 Students And Trainers

The Students and Trainers pages give coordinators a centralized roster view. These pages help coordinators see who is registered in the system and how people relate to training activity.

The student view is especially useful for reviewing trainee progress and following up on training outcomes.

**Screenshot placeholder:** Insert a screenshot of the Students roster here.

### 5.5 Reports

The Reports section centralizes daily training reports. Coordinators can search and filter reports across active or archived classes. Reports can be reviewed in a preview modal, making it easier to inspect training records without leaving the workflow.

Reports may include information such as:

- Class and session details
- Trainer information
- Student attendance
- Daily progress ratings
- Drill or test results
- Notes or training observations

**Screenshot placeholder:** Insert a screenshot of the Reports page and a report preview here.

### 5.6 Schedule

The Schedule section provides visibility into training sessions. Coordinators and trainers can use this area to review upcoming sessions and understand when classes are taking place.

Schedules help answer:

- What is happening today?
- What sessions are coming up?
- Which class or group is scheduled?
- What time does the session start and end?

**Screenshot placeholder:** Insert a screenshot of the Schedule page here.

### 5.7 Trainer Hours

The trainer hours area gives trainers a place to view hours connected to their assigned training work. This supports better visibility into training time and may help coordinators review training workload.

**Screenshot placeholder:** Insert a screenshot of the Trainer Hours page here.

### 5.8 Audit Log

The Audit Log records important changes made in the system. Coordinators can filter by table, action type, and date range.

This helps answer:

- What changed?
- Who made the change?
- When did it happen?
- Which record was affected?

This feature is especially useful for accountability, troubleshooting, and maintaining a defensible training record.

**Screenshot placeholder:** Insert a screenshot of the Audit Log page here.

### 5.9 System Health

The System Health area gives coordinators visibility into the operational status of the app. This is useful for identifying whether the system is working as expected.

**Screenshot placeholder:** Insert a screenshot of the System Health page here.

### 5.10 Settings

The Settings page gives users access to role-aware settings. The exact options may differ depending on whether the user is a coordinator, trainer, or student.

**Screenshot placeholder:** Insert a screenshot of the Settings page here.

## 6. How To Use The Web App

### Step 1: Sign In

Open the web app and sign in using the provided account method. After login, the system will route the user to the correct experience based on their assigned role.

**Screenshot placeholder:** Insert a screenshot of the sign-in page here.

### Step 2: Start From The Dashboard

Use the dashboard to get oriented. Coordinators should check active classes, upcoming sessions, missing reports, and recent activity. Trainers should check today's work and assigned classes. Students should check their enrolled class and progress.

### Step 3: Open The Relevant Area

Use the left-side navigation to move through the app. The available menu items depend on the user's role.

For example:

- Coordinators use **Classes** to manage class records.
- Trainers use **My Classes** to work with assigned classes.
- Students use **Dashboard** to review their own training information.

### Step 4: Review Or Update Records

Depending on the user's permissions, they can view, filter, create, update, archive, or review records. Coordinators have the broadest access. Trainers and students have access scoped to their own training responsibilities.

### Step 5: Use Filters To Find Information

Many pages include filters, sorting, or search. These are useful when there are many classes, reports, or records.

Examples:

- Filter reports by class, site, province, date range, or search term.
- Filter classes by province, site, or game type.
- Filter audit history by table, action type, or date range.

### Step 6: Review Reports And Progress

Reports and student progress views should be used to understand how training is going. Coordinators can use these records to follow up with trainers, identify incomplete reporting, and support students who need attention.

## 7. Suggested Demo Workflow

For presentations or onboarding, the following flow communicates the app clearly:

1. Sign in as a coordinator.
2. Show the dashboard and explain the daily overview.
3. Open Classes and show filtering.
4. Open one class detail page.
5. Review the class roster, trainers, schedule, and reports.
6. Open Reports and preview a daily report.
7. Show Schedule for upcoming sessions.
8. Briefly show Trainer and Student views to explain role-specific access.
9. End with Audit Log to show accountability.

## 8. Current Strengths

- Centralized training records
- Role-specific user experiences
- Coordinator dashboard for operational visibility
- Class, report, schedule, student, and trainer workflows
- Report filtering and previewing
- Trainer self-service views
- Student progress visibility
- Audit history for important system changes
- Beginner-friendly navigation model

## 9. Future Improvements

The following improvements would make the tool stronger as it moves toward wider use:

- Add a graduation checklist that confirms attendance, reports, drills, tests, and required sign-offs.
- Add configurable drill templates with par times, scoring bands, and pass/fail thresholds.
- Add notification reminders for missed reports, upcoming sessions, and pending sign-offs.
- Add stronger dashboard analytics for coordinators, including progress trends and at-risk students.
- Add mobile-first workflows for trainers using the tool on the floor.
- Add offline support so trainers can keep working when Wi-Fi is unreliable.
- Add document upload improvements for scanned reports, PDFs, and supporting training files.
- Add manager read-only access for leaders who need visibility but should not edit records.
- Add export options for reports, student records, and compliance documentation.
- Add Gateway single sign-on if the app is adopted more broadly.
- Add integration points for HR, LMS, or other training systems.

## 10. Implementation Notes

The current web app uses a React and TypeScript frontend with role-aware routing. The backend API is built around authenticated requests and structured data resources such as classes, schedules, reports, profiles, audit entries, and self-service trainer or student data.

The application is designed to be expanded over time. The current structure supports coordinator workflows first while also giving trainers and students focused access to their own information.

## 11. Summary

Gateway Training Tool is intended to make training coordination easier, more visible, and more consistent. It gives coordinators a central operational view while allowing trainers and students to interact with the parts of the training process that apply to them.

The strongest value of the app is not just that it stores records. Its value is that it connects records to daily training decisions: what is scheduled, who is assigned, what has been reported, who needs follow-up, and what changed over time.

