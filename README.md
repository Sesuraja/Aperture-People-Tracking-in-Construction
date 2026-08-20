# Aperture People Tracking in Construction — Complete Project Documentation

**Repository:** `Sesuraja/Aperture-People-Tracking-in-Construction`  
**Branch reviewed:** `main`  
**Document purpose:** Complete functional, technical, architectural, module, data-flow, API, feature, deployment, demo, and investor-level documentation.

> This document describes the implementation visible in the repository. Where the code contains demo/simulation/fallback behavior, it is explicitly identified rather than being presented as a production hardware capability.

---

## 1. Executive Overview

Aperture People Tracking in Construction is a web-based construction-site operations and workforce intelligence application.

At a high level, the system combines:

- UHF RFID personnel/location telemetry
- Real-time worker tracking
- Construction-site maps and zones
- Worker, visitor, asset, vehicle and device management
- Attendance and historical playback
- Alerts and incident management
- Analytics
- AI/EHS assistance
- Hardware and RFID integration
- MongoDB-backed operational data
- WebSocket/SSE-style real-time communication
- Role-based access control
- Demo/simulation mode for presentations
- Custom maps, zones and site configuration
- Maintenance and operational workflows

The repository is a React + TypeScript/Vite application with an Express/Node.js server. It includes MongoDB/Mongoose support, Firebase/Firestore support, MQTT, WebSockets, SSE, JWT authentication, Google Gemini integration, Playwright/Vitest testing infrastructure, and a large component-based dashboard.

---

# 2. Business Problem

Construction sites have several operational problems:

1. Management does not always have a reliable live view of where workers are.
2. Manual attendance is slow and difficult to audit.
3. Safety teams need faster visibility into workers entering sensitive areas.
4. Site supervisors need historical movement data.
5. RFID reader/device failures can affect tracking quality.
6. Large sites contain many workers, contractors, visitors, assets and vehicles.
7. Incident investigation requires evidence, timelines and accountability.
8. Operational information is often spread across different systems.
9. Managers need a single command-center view rather than isolated spreadsheets.
10. Executives need analytics and operational summaries rather than raw RFID scans.

Aperture addresses these problems by converting location/telemetry events into a visual operational system.

---

# 3. Product Vision

The application can be understood as a **Construction Site Operational Intelligence System**.

The core idea is:

**RFID / hardware events → ingestion → normalization → worker/location state → map visualization → alerts → analytics → AI assistance → operational action → audit history**

The system is designed around the concept of a digital representation of the construction site.

---

# 4. Main Actors

| Actor | Main Responsibilities |
|---|---|
| Administrator | Full system configuration, users, permissions, hardware and settings |
| Manager | Operations oversight, workforce, visitors, analytics and safety |
| Operator | Daily site operations and live tracking |
| Security | Live site/security monitoring and alerts |
| Auditor | Historical records, playback and audit information |
| Contractor | Restricted operational access |
| Visitor Manager | Visitor and attendance workflows |
| Viewer | Read-only/limited operational visibility |
| EHS/Safety Officer | Alerts, incidents, investigation and corrective actions |
| Site Operations Executive | High-level operational visibility |

---

# 5. Technology Stack

## Frontend

- React 19
- TypeScript
- Vite
- React Router
- Tailwind CSS
- Radix/Base UI components
- Lucide React icons
- Motion
- Recharts
- QR code generation/scanning

## Backend

- Node.js
- Express
- TypeScript
- HTTP server
- Vite middleware during development
- Static serving in production

## Data

- MongoDB
- Mongoose
- MongoDB native driver
- Firebase/Firestore
- In-memory/demo fallback behavior

## Real-Time

- WebSocket (`ws`)
- Server-Sent Events
- MQTT
- Polling service
- Firestore `onSnapshot`

## Security

- JWT
- bcryptjs
- Firebase token verification
- Helmet
- CORS
- Express rate limiting
- Zod input validation
- Role/page permissions

## AI

- Google Gemini via `@google/genai`
- Multi-model fallback
- AI Copilot
- Incident RCA generation
- Hazard/safety analysis patterns
- Heuristic fallback when Gemini is unavailable

## Testing / Quality

- Vitest
- Playwright
- ESLint
- TypeScript compiler checks

---

# 6. Repository Structure

```text
Aperture-People-Tracking-in-Construction/
│
├── .github/
│   └── workflows/
│
├── .vscode/
│
├── api/
│   └── index.ts
│
├── components/
│   └── ui/
│
├── dist/
│
├── e2e/
│
├── lib/
│
├── src/
│   ├── assets/images/
│   ├── components/
│   ├── constants/
│   ├── context/
│   ├── db/schemas/mongodb/
│   ├── lib/
│   ├── server/
│   │   ├── middleware/
│   │   ├── routes/
│   │   └── services/
│   ├── App.tsx
│   ├── images.d.ts
│   ├── index.css
│   ├── main.tsx
│   └── types.ts
│
├── tests/
│
├── .env.example
├── .gitignore
├── .mongo_runtime.json
├── README.md
├── bun.lock
├── components.json
├── eslint.config.mjs
├── firebase-applet-config.json
├── firebase-blueprint.json
├── firestore.rules
├── index.html
├── metadata.json
├── package.json
├── package-lock.json
├── playwright.config.ts
├── server.ts
├── tsconfig.json
├── vercel.json
└── vite.config.ts
```

---

# 7. Application Architecture

```text
                    ┌─────────────────────────────┐
                    │ Construction Site           │
                    │ Workers / Tags / Readers    │
                    └──────────────┬──────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │ RFID / Hardware Integration │
                    │ Readers / MQTT / HTTP Push   │
                    └──────────────┬──────────────┘
                                   │
                                   ▼
                    ┌─────────────────────────────┐
                    │ Node.js / Express Backend    │
                    │ API + Validation + Auth      │
                    └───────┬──────────┬──────────┘
                            │          │
             ┌──────────────┘          └──────────────┐
             ▼                                         ▼
┌─────────────────────────┐              ┌─────────────────────────┐
│ MongoDB / Mongoose      │              │ Real-Time Layer         │
│ operational records     │              │ WebSocket / SSE / MQTT │
└────────────┬────────────┘              └────────────┬────────────┘
             │                                        │
             └────────────────┬───────────────────────┘
                              ▼
                   ┌─────────────────────────┐
                   │ Tracking / State Engine │
                   │ Worker + Zone + Alerts  │
                   └────────────┬────────────┘
                                │
                                ▼
                   ┌─────────────────────────┐
                   │ React Command Center     │
                   │ Maps / Tables / Charts   │
                   └────────────┬────────────┘
                                │
          ┌─────────────────────┼──────────────────────┐
          ▼                     ▼                      ▼
   Operations             Safety / EHS             Executive
   Workforce              Alerts / Incidents       Analytics
```

---

# 8. Application Startup Flow

```text
Browser
   │
   ▼
index.html
   │
   ▼
main.tsx
   │
   ▼
App.tsx
   │
   ├── ErrorBoundary
   ├── BrowserRouter
   ├── AppModeContext
   └── TrackingProvider
          │
          ▼
     Login / AppContent
          │
          ├── Demo Mode
          │
          └── Real Mode
                 │
                 ├── JWT authentication
                 ├── GAO synchronization
                 ├── MongoDB-backed state
                 └── WebSocket/real-time events
```

---

# 9. Demo Mode vs Real Mode

The application explicitly supports two operating modes.

## Demo Mode

Used for:

- executive demonstrations
- investor presentations
- development
- UI testing
- simulated movement
- simulated alerts
- fallback data

The application defaults to demo mode when no saved authentication/mode state is available.

Demo mode allows the product to appear operational without requiring live RFID hardware.

## Real Mode

Used when:

- a JWT exists
- live backend APIs are configured
- RFID/hardware integrations are available
- real MongoDB/operational data is available

When real mode is enabled, the application starts the GAO synchronization service.

---

# 10. Core UI Navigation

The main application is organized into functional domains.

## Core Workspace

- Dashboard
- Live Tracking
- Custom Map & Assets
- Playback History

## Operations & Trades

- Personnel
- Visitors
- Attendance
- Hardware Devices
- Maintenance

## Safety & Compliance

- Alerts & Triggers
- Incidents
- Analytics
- AI Insights
- Audit Ledger

## System Configuration

- Settings

Additional UI capabilities include:

- Command Palette
- Global search
- Profile
- Logout
- Sidebar collapse
- Top bar
- Demo control bar
- Error boundary

---

# 11. Complete Frontend Component Inventory

The repository contains the following major components.

| Component | Purpose |
|---|---|
| `AIFeed.tsx` | AI activity/insight feed |
| `AIInsightsTab.tsx` | AI operational intelligence |
| `AlertsTab.tsx` | Alert center |
| `AnalyticsCharts.tsx` | Chart visualization |
| `AnalyticsTab.tsx` | Analytics workspace |
| `ApertureLogo.tsx` | Brand/logo UI |
| `AttendanceTab.tsx` | Worker attendance |
| `AuditTab.tsx` | Audit history |
| `CommandCenterTab.tsx` | Command-center operations |
| `CommandPaletteModal.tsx` | Global command/search UI |
| `CustomMapPage.tsx` | Custom map management |
| `DailyReportingTaskModal.tsx` | Daily reporting workflow |
| `DashboardTab.tsx` | Main dashboard |
| `DemoControlBar.tsx` | Demo simulation controls |
| `DeveloperApiTab.tsx` | API/developer tools |
| `DevicesTab.tsx` | Hardware devices |
| `DirectHardwareIntegrationSection.tsx` | Direct hardware configuration |
| `ErrorBoundary.tsx` | React error containment |
| `ExportReportModal.tsx` | Report exporting |
| `HardwareConfigModal.tsx` | Reader configuration |
| `HardwareIntegrationForm.tsx` | Hardware integration setup |
| `IncidentsTab.tsx` | Incident management |
| `LiveFloorMap.tsx` | Floor/site map |
| `LiveTrackingContextDrawer.tsx` | Context details for selected tracking entity |
| `LiveTrackingTab.tsx` | Live tracking |
| `LocationsTab.tsx` | Locations/zones |
| `Login.tsx` | Authentication |
| `MaintenanceTab.tsx` | Maintenance |
| `ManageAssetsModal.tsx` | Asset CRUD |
| `ManageWorkforceModal.tsx` | Workforce CRUD |
| `MapEditorModal.tsx` | Map/zone editing |
| `MongoDbConfigurationSection.tsx` | MongoDB configuration |
| `PeopleTab.tsx` | Personnel management |
| `PlaybackTab.tsx` | Historical playback |
| `ProfileModal.tsx` | User profile |
| `RealTimeConnectionsTab.tsx` | Connection monitoring |
| `RfidApiConfiguration.tsx` | RFID API configuration |
| `SettingsTab.tsx` | System settings |
| `SlaDashboardTab.tsx` | SLA/alert escalation monitoring |
| `StreamDiagnostics.tsx` | Stream diagnostics |
| `SystemHealthWidget.tsx` | Health status |
| `ThirdPartyApiIntegrationSection.tsx` | External API integrations |
| `TopBar.tsx` | Global header |
| `VisitorCheckInForm.tsx` | Visitor registration/check-in |
| `VisitorQrGenerator.tsx` | Visitor QR generation |
| `VisitorsTab.tsx` | Visitor management |
| `WebhookInspector.tsx` | Webhook inspection |
| `WorkerQrScannerModal.tsx` | Worker QR scanning |

---

# 12. Dashboard Module

The dashboard is the executive/site overview.

Typical information represented by the dashboard data model includes:

- active workers
- alerts
- zones
- vehicles
- assets
- operational status
- site activity
- device state

The dashboard consumes the tracking state and renders a summarized operational view.

### Business purpose

A site manager can open the dashboard and immediately answer:

- How many people are on site?
- Where are they?
- Are there active safety/security alerts?
- Are devices operational?
- What is happening across the site?
- Are there unusual conditions?

---

# 13. Live Tracking Module

Live Tracking is the core operational module.

It combines:

- people
- assets
- vehicles
- zones
- reader information
- coordinates
- movement state
- trails
- RSSI
- last-seen information

A tracked person can contain:

```text
Person
├── identity
│   ├── id
│   ├── name
│   ├── role
│   └── tradeCompany
│
├── compliance
│   ├── ppeStatus
│   ├── trainingStatus
│   ├── certifications
│   └── permitToWork
│
├── tracking
│   ├── currentZone
│   ├── presenceState
│   ├── dwellTime
│   ├── x
│   ├── y
│   ├── speed
│   ├── heading
│   ├── rssi
│   ├── battery
│   ├── lastReader
│   └── lastSeen
│
└── intelligence
    ├── activityInsights
    ├── trail
    └── projectId
```

---

# 14. Worker Tracking Flow

```text
UHF RFID Tag
     │
     ▼
RFID Reader
     │
     ├── Reader ID
     ├── Antenna ID
     ├── Tag ID
     ├── RSSI
     └── Timestamp
     │
     ▼
RFID API / Hardware Integration
     │
     ▼
Ingestion Service
     │
     ▼
Normalize Event
     │
     ├── resolve person
     ├── resolve zone
     ├── resolve project
     └── calculate state
     │
     ▼
Tracking Context
     │
     ├── liveTags
     ├── people
     ├── assets
     └── vehicles
     │
     ▼
Live Map
     │
     ▼
Supervisor / Operator
```

---

# 15. Presence State Model

The core person model uses:

```text
MOVING
IDLE
EXITED
```

### MOVING

The person is actively moving between locations.

### IDLE

The person remains stationary beyond configured thresholds.

### EXITED

The system considers the person to have left the tracked area.

The simulation/tracking engine also supports:

- dwell time
- target coordinates
- remaining idle time
- movement speed
- heading
- tracking trails

---

# 16. Zone Management

The system models construction locations as zones.

Examples in the demo/project configuration include:

- Material Storage
- Structure Work Area
- Crane Operating Zone
- Site Office
- Open Work Area
- Equipment Parking
- Excavation Area
- Assembly Point
- High Voltage Area

The system also supports project-specific zone layouts.

Zone data can include:

```text
Zone
├── id
├── zoneId
├── name
├── aliases
├── category
├── hazardLevel
├── capacity
├── siteId
├── buildingId
├── floorId
├── x
├── y
├── width
├── height
├── readerIds
├── antennaIds
├── currentOccupancy
├── polygonPoints
└── proximityAlertEnabled
```

---

# 17. Zone Resolution

The tracking code contains zone normalization logic.

Conceptually:

```text
Incoming Location
      │
      ▼
Exact zone match?
   ┌──┴──┐
  YES    NO
   │      │
   ▼      ▼
Use zone  Fuzzy/partial name match
          │
          ▼
      Matching zone?
        ┌──┴──┐
       YES    NO
        │      │
        ▼      ▼
    Use zone  Default zone
```

This is important because hardware feeds may use location names that do not exactly match the application's configured zone names.

---

# 18. Custom Map & Assets

The map system is not limited to fixed demo geometry.

It supports:

- custom floor plans
- SVG sources
- custom zones
- assets
- vehicles
- cameras
- environmental sensors
- infrastructure
- reader/zone mappings
- map configuration

The `TrackingContext` exposes functions such as:

```text
saveMapConfig()
saveZone()
deleteZone()
saveCustomZones()
saveAsset()
deleteAsset()
saveVehicle()
deleteVehicle()
saveCamera()
deleteCamera()
saveEnvSensor()
deleteEnvSensor()
saveInfrastructure()
deleteInfrastructure()
setCustomFloorplan()
setCustomSvgSource()
getZoneByNameOrId()
refreshLiveState()
reportManualScan()
```

---

# 19. Personnel Module

The Personnel screen represents registered workers/personnel.

Personnel data supports:

- worker ID
- name
- role
- trade/company
- RFID/hardhat tag
- PPE status
- shift status
- training status
- certifications
- permit-to-work
- current zone
- presence
- movement
- last seen

The system therefore goes beyond simply showing a tag number.

---

# 20. Attendance Module

Attendance connects RFID/location events to workforce presence.

Conceptual flow:

```text
Worker Tag
   │
   ▼
Entry Reader
   │
   ▼
Tag / Person Resolution
   │
   ▼
Attendance Event
   │
   ├── entry time
   ├── location
   ├── person
   └── tag
   │
   ▼
Attendance Log
   │
   ▼
Attendance UI / Reports
```

History records include:

- Tag ID
- First name
- Last name
- location
- entry time
- leave time
- duration

---

# 21. Visitor Management

Visitor functionality includes:

- visitor registration
- visitor check-in
- visitor QR generation
- visitor access tokens
- visitor security lists
- visitor access logs
- attendance association

Visitor workflow:

```text
Visitor Registration
       │
       ▼
Identity / Visitor Data
       │
       ▼
QR / Access Token
       │
       ▼
Gate / Check-in
       │
       ▼
Visitor Record
       │
       ▼
Access / Attendance Log
       │
       ▼
Exit / Completion
```

---

# 22. QR Worker Workflow

The repository includes a worker QR scanner modal.

Possible operational use:

```text
QR Code
   │
   ▼
Scanner
   │
   ▼
Worker ID
   │
   ▼
Worker Record
   │
   ▼
Manual verification / scan action
```

The tracking context exposes a manual scan reporting capability.

---

# 23. Alerts Module

The alert model is enterprise-oriented.

Alert categories include:

- Emergency
- Safety
- Security
- Equipment
- Reader
- Worker
- Visitor
- Maintenance
- Weather
- System

Priorities:

- Critical
- High
- Medium
- Low

Statuses:

- New
- In Progress
- Escalated
- Resolved
- Suppressed

---

# 24. Alert Lifecycle

```text
Telemetry / Rule / Event
          │
          ▼
      Alert Trigger
          │
          ▼
     Classification
          │
          ├── category
          ├── priority
          └── target zone
          │
          ▼
      Assignment
          │
          ▼
       SLA Timer
          │
          ▼
     Escalation Check
       ┌──┴─────┐
      NO        YES
       │         │
       ▼         ▼
 Continue    Escalate Tier
       │
       ▼
 Investigation
       │
       ▼
 Corrective Action
       │
       ▼
 Verification
       │
       ▼
 Resolved
```

---

# 25. Alert Evidence

Alerts can contain evidence such as:

- CCTV camera ID
- CCTV snapshot URL
- RFID reader ID
- RFID tag ID
- RSSI
- location zone
- coordinates
- telemetry logs
- attached documents

This allows an alert to become an auditable operational record instead of a simple notification.

---

# 26. Alert Escalation

The data model supports three escalation tiers:

```text
Tier 1 — Gatehouse
      │
      ▼
Tier 2 — EHS Director
      │
      ▼
Tier 3 — Site Operations VP
```

Each escalation record can contain:

- SLA minutes
- elapsed minutes
- automatic escalation target
- escalation state

---

# 27. Incident Management

Incidents are more detailed than alerts.

Supported categories include:

- Near Miss
- Injury
- Exclusion Zone Breach
- PPE Non-Compliance
- Fire
- Medical
- Security
- Chemical
- Electrical
- Environmental
- Unregistered RFID Tag

Workflow states:

```text
Open
  ↓
Assigned
  ↓
Investigation
  ↓
Root Cause
  ↓
Corrective Action
  ↓
Approval
  ↓
Closed
```

---

# 28. Incident Data Model

An enterprise incident can contain:

- incident ID
- title
- category
- severity
- workflow status
- location
- reported time
- reporter
- assigned officer
- description
- injured personnel count
- equipment involved
- hazard class
- AI analysis
- witness statements
- attachments
- timeline
- root-cause details
- corrective actions
- approval sign-off

---

# 29. AI Incident RCA

The AI incident analysis model supports:

```text
severityScore
aiSummary
probableRootCause
contributingFactors[]
capaRecommendations[]
regulatoryImpact
```

CAPA means:

**Corrective and Preventive Action**

The system's AI prompt is designed around EHS/RCA concepts and references OSHA 1926 and ISO 45001 in its generated analysis workflow.

---

# 30. AI Copilot

The AI Copilot is one of the project's major intelligence features.

The AI receives:

- worker context
- site telemetry
- database context
- prior chat history
- user question

The intended output is a structured JSON response containing:

```json
{
  "answer": "Human-readable response",
  "suggestedActions": [
    "Action 1",
    "Action 2",
    "Action 3"
  ]
}
```

---

# 31. AI Copilot Example Questions

The AI workflow is explicitly designed to answer questions such as:

### Worker identity

> What is the tag ID of Marcus Vance?

Expected information:

- worker name
- UHF RFID tag ID
- trade/role
- current zone

### Worker activity

> What is Marcus Vance doing?

Expected information:

- current activity
- trade
- zone
- dwell time
- movement state

### Database

> What is the MongoDB status?

Expected information:

- connection state
- database name
- record count
- active collections

### Workforce

> How many workers are currently on site?

Expected information:

- active headcount
- trade distribution
- zone occupancy

---

# 32. AI Failure Strategy

The AI implementation is designed with multiple fallback levels.

```text
User Question
     │
     ▼
Gemini API Key Available?
    ┌┴─────────┐
   YES         NO
    │           │
    ▼           ▼
Gemini      Heuristic
Models      Fallback
    │
    ▼
Model 1
    │ failure
    ▼
Model 2
    │ failure
    ▼
Model 3
    │ failure
    ▼
Model 4
    │
    ▼
Fallback response
```

The code contains a multi-model sequence and stops retrying when authentication failure indicates that further model attempts will not help.

---

# 33. Analytics Module

Analytics provides the management layer over operational data.

The application contains:

- analytics tab
- analytics charts
- equipment analytics
- metrics
- analytics reports
- export report functionality

Potential operational questions include:

- worker distribution
- activity trends
- attendance
- alert trends
- equipment utilization
- zone occupancy
- incident patterns
- operational KPIs

---

# 34. Playback Module

Playback is designed for historical investigation.

Conceptual workflow:

```text
Historical RFID Events
        │
        ▼
Time Filter
        │
        ▼
Historical Event Stream
        │
        ▼
Reconstruct Movement
        │
        ▼
Animate / Visualize
        │
        ▼
Investigate Event
```

Playback is useful for:

- incident investigation
- workforce movement analysis
- security reviews
- compliance review
- operational audits

---

# 35. Hardware Devices Module

The hardware module manages RFID readers.

A reader can include:

```text
readerId
name
model
IP address
port
protocol
power
sensitivity
status
antennas
total scans
last ping
notes
createdAt
updatedAt
```

Default model behavior in the code references a GAO UHF 4-Port Fixed Reader.

---

# 36. RFID Reader + Antenna Model

```text
RFID Reader
├── Reader ID
├── IP Address
├── Port
├── Protocol
├── Power
├── Sensitivity
└── Antennas
    ├── Port 1
    ├── Port 2
    ├── Port 3
    └── Port 4
```

Each antenna can be mapped to:

- zone
- zone name
- direction
- power

This mapping is essential because a tag event must be translated into a physical site location.

---

# 37. Hardware Tag Mapping

The hardware module supports mapping:

```text
RFID Tag
    │
    ▼
Entity Mapping
    │
    ├── entity type
    ├── entity ID
    ├── entity name
    ├── trade/role
    └── department
```

The entity can be a worker or another tracked object.

---

# 38. Direct Hardware Integration

The project contains a dedicated direct hardware integration section and hardware integration service.

The intended production data path is:

```text
Physical Reader
      │
      ▼
Network
      │
      ▼
HTTP / MQTT / Integration Layer
      │
      ▼
Hardware Integration Service
      │
      ▼
processDirectHardwareScan()
      │
      ▼
RFID Event
      │
      ▼
Tracking / Alert / Database
```

---

# 39. RFID API Compatibility

The code implements GAO-style RFID endpoints including:

```text
GET /GetHistoryTotalCount
GET /GetHistoryRecords/{SkipCount}/{TakeCount}
GET /GetTagsInRealtime
```

It also exposes API aliases under `/api`.

The history endpoint limits the requested page size to 200 in accordance with the implementation's stated API behavior.

---

# 40. RFID Data Contract

Realtime tags can contain:

```text
TagID
Timestamp
Location
LocationName
personName
personId
zoneId
zoneName
x
y
rssi
readerId
antennaId
```

This allows a raw RFID event to become a richer application event.

---

# 41. RFID Ingestion Flow

```text
Reader
 │
 ▼
Tag detected
 │
 ▼
Tag ID + timestamp + reader + antenna + RSSI
 │
 ▼
Schema validation
 │
 ▼
Location/zone resolution
 │
 ▼
Person/entity resolution
 │
 ▼
Persist event
 │
 ├───────────────┐
 ▼               ▼
Live state     History
 │               │
 ▼               ▼
WebSocket      MongoDB
 │
 ▼
UI
```

---

# 42. MongoDB Integration

The project contains MongoDB schema definitions:

```text
history_records.ts
real_time_tags.ts
index.ts
```

The broader application exposes many operational collections.

Important collections include:

- registered_people
- devices
- visitors
- alerts
- live_tags
- real_time_tags
- rfid_realtime_events
- tag_history
- settings
- projects
- floorplans
- visitor_security_list
- visitor_access_tokens
- visitor_access_logs
- attendance_logs
- leave_requests
- shift_schedules
- alerts_enterprise
- alert_rules
- alert_dispatch_logs
- emergency_broadcasts
- incidents_enterprise
- audit_logs
- users
- permissions
- role_permissions
- analytics_reports
- analytics_metrics
- analytics_equipment
- ai_recommendations
- incidents
- ai_rca_reports
- ai_hazard_predictions
- ai_insights
- ai_copilot_chats
- assets
- vehicles
- cameras
- sensors
- infrastructure
- maintenance_nodes
- work_orders
- technicians
- schedules
- compliance_frameworks
- retention_policies
- compliance_reports
- people
- personnel
- zones
- geofences
- map_configurations
- reader_zone_mappings
- quick_notes
- hardware_readers
- hardware_tag_mappings
- third_party_apis
- site_configurations
- shift_assignments
- training_records
- ppe_records
- notifications
- system_events
- daily_reports

---

# 43. Data Access Layer

The server-side database service abstracts common operations.

Conceptually it provides:

```text
getCollectionDocs()
getDocById()
upsertDoc()
deleteDocById()
bulkWriteRealtimeTags()
cleanupStaleRealTimeTags()
logAuditEvent()
isMongoConnected()
initDatabase()
```

This reduces the need for every API route to implement database access independently.

---

# 44. Real-Time State Context

`TrackingContext.tsx` is a central state-management layer.

It exposes:

- active project
- operating mode
- WebSocket connection state
- live tags
- people
- assets
- vehicles
- cameras
- environmental sensors
- infrastructure
- zones
- reader mappings
- map configuration
- custom floorplan
- custom SVG
- loading state
- last update timestamp

It also exposes CRUD and synchronization operations.

---

# 45. Real-Time Communication

The project contains:

- WebSocket service
- WebSocket client hook
- realtime clients
- SSE service
- MQTT integration
- polling service

A conceptual architecture is:

```text
RFID / MQTT / HTTP
        │
        ▼
Backend ingestion
        │
        ├───────────────┐
        ▼               ▼
   MongoDB          WebSocket/SSE
                        │
                        ▼
                 React Context
                        │
                        ▼
                   Components
```

---

# 46. MQTT

MQTT is included as an integration mechanism.

It is appropriate for:

- IoT devices
- readers
- sensors
- telemetry
- event publishing

The repository contains both frontend utility-level MQTT handling and server-side MQTT services.

---

# 47. Connection Monitoring

The project includes:

- RealTimeConnectionsTab
- StreamDiagnostics
- SystemHealthWidget
- connection polling
- connections API
- integration configuration

The purpose is to answer:

- Is the integration connected?
- Is the reader responding?
- Is telemetry flowing?
- Is the stream delayed?
- Is the system healthy?

---

# 48. Authentication

Authentication supports:

- email/password login
- registration
- Firebase login
- JWT
- `/api/auth/me`
- logout
- logout-everywhere
- audit logging
- rate limiting

---

# 49. Authentication Flow

```text
Login
 │
 ▼
Validate input with Zod
 │
 ▼
Find user
 │
 ▼
bcrypt password verification
 │
 ▼
Generate JWT
 │
 ▼
Store token in client localStorage
 │
 ▼
Set Real Mode
 │
 ▼
Load user profile
 │
 ▼
Resolve role
 │
 ▼
Load permissions
 │
 ▼
Render authorized pages
```

---

# 50. Password Security

Passwords are hashed using bcrypt.

The authentication route also contains legacy-password migration logic:

```text
Legacy plaintext password
       │
       ▼
Successful login
       │
       ▼
Generate bcrypt hash
       │
       ▼
Delete legacy password
       │
       ▼
Store passwordHash
```

---

# 51. Role-Based Access Control

The application has role/page permission logic.

Roles visible in the implementation include:

- admin
- manager
- operator
- security
- auditor
- contractor
- visitor_manager
- viewer

Permissions include pages such as:

```text
dashboard
live
customMap
playback
people
visitors
attendance
alerts
incidents
analytics
aiInsights
devices
realtime
maintenance
audit
settings
```

---

# 52. Permission Resolution

```text
User-specific permission override?
        │
      YES ─────► Use override
        │
       NO
        ▼
Role permission?
        │
      YES ─────► Use role permission
        │
       NO
        ▼
Admin?
   │         │
  YES        NO
   │          │
   ▼          ▼
Allow       Default behavior
```

---

# 53. API Server

The main server is `server.ts`.

Startup responsibilities include:

1. Configure DNS resolvers.
2. Load environment variables.
3. Create Express application.
4. Create HTTP server.
5. Initialize database.
6. Start realtime tag cleanup.
7. Start polling service.
8. Bootstrap administrator.
9. Initialize WebSocket server.
10. Configure Helmet.
11. Configure JSON/body limits.
12. Configure CORS.
13. Register health endpoint.
14. Register API routes.
15. Register error handler.
16. Start Vite development middleware or production static serving.
17. Listen on port 3000.

---

# 54. Server Route Groups

The repository contains these server route modules:

```text
admin.ts
ai.ts
apiIntegrations.ts
auth.ts
connections.ts
data.ts
demo.ts
events.ts
hardware.ts
mongodb.ts
realtime.ts
rfid.ts
```

Main route groups registered by the server include:

```text
/api/auth
/api/admin
/api/rfid
/api
/api/data
/api/events
/api/mongodb
/api/connections
/api/integrations
/api/hardware
/api/realtime
/api/demo
```

Direct RFID-compatible aliases also exist.

---

# 55. Data API

Authenticated data APIs provide collection-level access.

The API supports:

```text
GET /api/data/stats
GET /api/data/:collection
GET /api/data/:collection/:id
POST /api/data/:collection
...
```

The route restricts collection access to an allow-list rather than allowing arbitrary database collection names.

---

# 56. Hardware API

Representative hardware APIs include:

```text
GET    /api/hardware/readers
POST   /api/hardware/readers
DELETE /api/hardware/readers/:id

GET    /api/hardware/mappings
POST   /api/hardware/mappings
```

The reader API automatically initializes/defaults hardware configuration where required.

---

# 57. AI API

The AI server route contains:

- AI Copilot logic
- Gemini integration
- multi-model fallback
- JSON parsing/normalization
- heuristic fallback
- incident RCA generation
- rate limiting
- authentication/error handling patterns

The incident analysis endpoint is:

```text
POST /api/analyze-incident
```

It receives fields such as:

```text
title
category
severity
locationZone
description
equipmentInvolved
```

---

# 58. AI Incident Flow

```text
Incident Data
     │
     ▼
AI Route
     │
     ▼
Gemini API Key?
   ┌─┴──┐
  YES   NO
   │     │
   ▼     ▼
Gemini  Rule-based
Analysis fallback
   │     │
   └──┬──┘
      ▼
Severity Score
      │
      ▼
Root Cause
      │
      ▼
Contributing Factors
      │
      ▼
CAPA Recommendations
      │
      ▼
Regulatory Impact
      │
      ▼
Incident Record
```

---

# 59. Demo/Simulation Engine

`simulation.ts` provides a significant amount of demo behavior.

It defines:

- site waypoints
- project zones
- zone normalization
- zone rectangles
- simulated people
- simulated assets
- simulated vehicles
- simulated alerts
- thresholds
- movement behavior
- Firestore synchronization

The purpose is to make the application demonstrable even when physical RFID hardware is unavailable.

---

# 60. Example Demo Movement Model

```text
Person
 │
 ▼
Current Zone
 │
 ▼
Choose target zone
 │
 ▼
Calculate target coordinates
 │
 ▼
Move / update position
 │
 ▼
Update trail
 │
 ▼
Update dwell time
 │
 ▼
Determine MOVING / IDLE
 │
 ▼
Generate alerts when thresholds are exceeded
```

---

# 61. Thresholds

The simulation/tracking engine contains configurable thresholds such as:

- loitering threshold
- idle alert threshold
- occupancy limits

These values can be updated from global settings.

Conceptually:

```text
Settings
  │
  ├── loiteringThreshold
  ├── idleAlertThreshold
  └── occupancyThresholds
        │
        ▼
Tracking Engine
        │
        ▼
Rule Evaluation
        │
        ▼
Alert
```

---

# 62. Occupancy Monitoring

Zones can define:

```text
capacity
currentOccupancy
```

This allows the system to reason about overcrowding or occupancy threshold breaches.

Potential business outcome:

```text
Zone Capacity = 20
Current Occupancy = 24
        │
        ▼
Threshold exceeded
        │
        ▼
Alert
        │
        ▼
Safety / Operations response
```

---

# 63. Asset Tracking

Assets are first-class tracked objects.

Asset data includes:

- ID
- name
- type
- coordinates
- status
- battery
- speed
- heading
- RSSI
- last reader
- project

The same map can therefore display both people and non-human tracked objects.

---

# 64. Vehicle Tracking

Vehicle data includes:

- ID
- name
- type
- coordinates
- status
- speed
- heading
- RSSI
- fuel
- operator
- project
- trail
- target
- idle state

This enables a broader site digital-twin model.

---

# 65. Environmental Sensors

The data model includes environmental sensors with:

- temperature
- humidity
- gas level
- PM2.5
- noise
- battery
- online/offline status

This allows future/expanded EHS monitoring alongside RFID.

---

# 66. Camera Devices

Camera devices include:

- camera ID
- name
- position
- status
- project
- resolution
- viewing angle

Alerts can also reference CCTV evidence.

---

# 67. Maintenance Module

Maintenance data is represented through collections and UI modules for:

- maintenance nodes
- work orders
- technicians
- schedules
- device status
- operational maintenance

The goal is to connect physical site infrastructure with maintenance operations.

---

# 68. Audit Ledger

The system records audit events for security-sensitive operations.

Examples include:

- user registration
- successful login
- failed login
- session revocation
- system operations
- configuration changes
- operational events

This supports accountability and post-event investigation.

---

# 69. Export / Reporting

The project contains:

- export report modal
- daily reporting task modal
- analytics reports
- compliance reports
- daily reports

The reporting layer can turn operational data into management-ready outputs.

---

# 70. Command Palette

The command palette provides a faster operational UI.

Shortcut:

```text
Ctrl + K
```

or

```text
Cmd + K
```

Purpose:

- search workers
- navigate quickly
- invoke commands
- reduce dashboard navigation time

---

# 71. Error Handling

The frontend uses an Error Boundary.

The backend uses centralized error handling through:

```text
errorHandler.ts
```

The server also catches startup failures.

This reduces the chance that a single component/API error crashes the entire application.

---

# 72. Security Controls

Security-related implementation includes:

- JWT authentication
- bcrypt password hashing
- Firebase token verification
- Helmet
- CORS
- auth rate limiting
- AI rate limiting
- Zod schema validation
- role-based page permissions
- collection allow-list
- audit logging
- logout-everywhere session invalidation

---

# 73. Real-Time Tag Cleanup

The server starts a cleanup job for realtime tags.

Conceptually:

```text
Live Tags
   │
   ▼
Age Check
   │
   ├── Fresh → keep
   │
   └── stale → remove/cleanup
```

This prevents indefinitely stale realtime records from being treated as current site state.

---

# 74. Full End-to-End Data Flow

```text
                    PHYSICAL SITE
                         │
          ┌──────────────┼───────────────┐
          ▼              ▼               ▼
       Workers         Assets         Vehicles
          │              │               │
       RFID Tag       RFID/IoT        RFID/IoT
          │              │               │
          └──────────────┼───────────────┘
                         ▼
                  RFID / IoT Reader
                         │
                         ▼
                 Network Integration
                         │
                ┌────────┴────────┐
                ▼                 ▼
             HTTP Push          MQTT
                │                 │
                └────────┬────────┘
                         ▼
               Hardware Integration
                         │
                         ▼
                  Ingestion Service
                         │
                         ▼
                    Validation
                         │
                         ▼
                Event Normalization
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
      Tag Identity      Zone         Timestamp
          │              │              │
          └──────────────┼──────────────┘
                         ▼
                  Tracking State
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
     MongoDB         WebSocket/SSE      Rules
        │                │                │
        │                │                ▼
        │                │             Alerts
        │                │                │
        │                ▼                ▼
        │             Live UI         Incident
        │                                 │
        ▼                                 ▼
    History /                         AI Analysis
    Audit / Analytics                     │
        │                                 ▼
        └────────────────────────────► Action
```

---

# 75. Operational Command-Center Flow

```text
LOGIN
  │
  ▼
DASHBOARD
  │
  ├────────► LIVE TRACKING
  │              │
  │              ├── Worker
  │              ├── Asset
  │              ├── Vehicle
  │              └── Zone
  │
  ├────────► ALERTS
  │              │
  │              └── INCIDENT
  │                    │
  │                    ├── Investigation
  │                    ├── AI RCA
  │                    ├── CAPA
  │                    └── Closure
  │
  ├────────► ATTENDANCE
  │
  ├────────► VISITORS
  │
  ├────────► ANALYTICS
  │
  ├────────► AI INSIGHTS
  │
  ├────────► AUDIT
  │
  ├────────► DEVICES
  │
  └────────► SETTINGS
```

---

# 76. Construction Site Safety Flow

```text
Worker
  │
  ▼
RFID Detection
  │
  ▼
Current Zone
  │
  ▼
Is zone high-risk?
 ┌─┴────┐
NO     YES
 │       │
 ▼       ▼
Normal  Rule evaluation
          │
          ▼
       Violation?
        ┌─┴───┐
       NO     YES
        │       │
        ▼       ▼
      Track   Alert
                │
                ▼
             Assign
                │
                ▼
             Escalate
                │
                ▼
             Incident
                │
                ▼
              AI RCA
                │
                ▼
               CAPA
                │
                ▼
             Approval
                │
                ▼
              Close
```

---

# 77. Visitor Flow

```text
Visitor
  │
  ▼
Registration
  │
  ▼
Security Validation
  │
  ▼
QR / Token
  │
  ▼
Gate Check-in
  │
  ▼
Visitor Active
  │
  ├── Access events
  ├── Attendance
  └── Location context
  │
  ▼
Checkout
  │
  ▼
Access Log
```

---

# 78. Hardware Health Flow

```text
Reader
 │
 ▼
Ping / Connection
 │
 ▼
Status
 │
 ├── ONLINE
 │
 └── OFFLINE
       │
       ▼
    Alert / Diagnostics
       │
       ▼
    Maintenance
       │
       ▼
    Work Order
```

---

# 79. Project / Site Configuration

The application supports multiple project identifiers.

The simulation includes project-specific zone configurations, including examples such as:

- `metro-tower`
- `highrise-phase2`

The active project is persisted in browser local storage.

Conceptually:

```text
Project
  │
  ├── Site
  ├── Zones
  ├── Floorplan
  ├── Readers
  ├── Workers
  ├── Assets
  └── Vehicles
```

---

# 80. Database / Application Relationship

```text
                 ┌──────────────┐
                 │   Projects   │
                 └──────┬───────┘
                        │
       ┌────────────────┼────────────────┐
       ▼                ▼                ▼
   Floorplans         Zones          Readers
       │                │                │
       │                │                ▼
       │                │          Tag Mappings
       │                │                │
       └────────────┬───┴────────────────┘
                    ▼
                Personnel
                    │
                    ▼
                 Live Tags
                    │
          ┌─────────┼─────────┐
          ▼         ▼         ▼
      Attendance   Alerts   History
                    │
                    ▼
                Incidents
                    │
                    ▼
                 AI/RCA
```

---

# 81. Main Data Entities

The project can be viewed through these core entities:

### People

Workers/personnel.

### Tags

UHF RFID identifiers.

### Readers

Physical RFID reader devices.

### Antennas

Reader antenna ports.

### Zones

Physical/logical site areas.

### Projects

Construction projects/sites.

### Assets

Tracked equipment/assets.

### Vehicles

Tracked vehicles.

### Visitors

Temporary people on site.

### Alerts

Real-time operational/safety notifications.

### Incidents

Formal investigation records.

### Attendance

Entry/exit and presence history.

### Audit Logs

Security/accountability history.

### AI Insights

AI-generated operational intelligence.

---

# 82. Function Inventory by Layer

## Frontend Application

Major functional responsibilities:

```text
App initialization
Mode selection
Authentication state
Routing
Protected routes
Role permissions
Project selection
Worker search
Command palette
Navigation
Profile
Logout
Dashboard rendering
Live map
Playback
People
Visitors
Attendance
Alerts
Incidents
Analytics
AI Insights
Devices
Maintenance
Audit
Settings
```

## Tracking Context

```text
State synchronization
WebSocket status
Live tag storage
People state
Asset state
Vehicle state
Camera state
Sensor state
Infrastructure state
Zone state
Reader mappings
Map configuration
Custom floorplans
CRUD persistence
Manual scan reporting
Live refresh
```

## Simulation

```text
Zone lookup
Zone normalization
Zone rectangle resolution
Demo worker movement
Demo alerts
Threshold processing
Firestore listeners
Project-specific simulation
```

## GAO API Client

```text
setHost()
getHost()
getProxyHeaders()
getHistoryTotalCount()
getHistoryRecords()
getTagsInRealtime()
```

## Server

```text
Database initialization
Admin bootstrap
Realtime cleanup
Polling
WebSocket startup
Authentication
Authorization
RFID ingestion
AI
Data access
Events
MongoDB status/configuration
Hardware
Realtime
Demo
Error handling
```

---

# 83. Example RFID Event

Input:

```json
{
  "tagId": "E28011606000020788842D31",
  "readerId": "GAO-UHF-READER-01",
  "antennaId": 1,
  "rssi": -62,
  "location": "Zone1",
  "timestamp": "2026-08-20T10:15:20Z"
}
```

Processing:

```text
1. Validate event
2. Normalize TagID
3. Resolve worker
4. Resolve reader
5. Resolve antenna
6. Resolve zone
7. Update live state
8. Store realtime event
9. Update last-seen
10. Evaluate rules
11. Broadcast realtime update
12. Update UI
```

---

# 84. Example Worker State

```json
{
  "id": "P-101",
  "name": "Marcus Vance",
  "role": "Crane Operator",
  "currentZone": "Crane Operating Zone",
  "presenceState": "MOVING",
  "dwellTime": 1680,
  "x": 82.4,
  "y": 16.2,
  "speed": 1.2,
  "heading": 90,
  "rssi": -62,
  "lastReader": "GAO-UHF-READER-01"
}
```

This object is sufficient for the UI to show:

- who the worker is
- where they are
- whether they are moving
- how long they have been there
- telemetry quality
- reader source
- map coordinates

---

# 85. Example Alert

```json
{
  "id": "ALT-001",
  "category": "Safety",
  "priority": "High",
  "status": "New",
  "title": "High-Risk Zone Occupancy",
  "message": "Occupancy threshold exceeded",
  "evidence": {
    "rfidReaderId": "GAO-UHF-READER-01",
    "locationZone": "Crane Operating Zone"
  }
}
```

---

# 86. Example Incident

```json
{
  "id": "INC-001",
  "title": "Exclusion Zone Breach",
  "category": "Exclusion Zone Breach",
  "severity": "High",
  "workflowStatus": "Investigation",
  "locationZone": "Crane Operating Zone",
  "reportedBy": "Security Officer",
  "assignedOfficer": "EHS Officer"
}
```

---

# 87. Demo Presentation Flow

For an executive/investor demonstration, the recommended application flow is:

```text
1. Login / Landing
        ↓
2. Dashboard
        ↓
3. Live Tracking
        ↓
4. Click a worker
        ↓
5. Show current zone / state / telemetry
        ↓
6. Show alerts
        ↓
7. Open incident
        ↓
8. Show AI RCA
        ↓
9. Open analytics
        ↓
10. Show attendance
        ↓
11. Show hardware
        ↓
12. Show AI Copilot
        ↓
13. Ask a worker/site question
        ↓
14. Show playback
        ↓
15. Explain production hardware integration
```

---

# 88. What the Demo Proves

The demo proves the software-side capability to:

- visualize workforce data
- represent physical construction zones
- display moving personnel
- display assets/vehicles
- process RFID-shaped telemetry
- provide realtime-style interfaces
- manage alerts
- manage incidents
- generate AI analysis
- manage users and roles
- manage hardware metadata
- maintain historical records
- provide analytics
- provide operational dashboards

---

# 89. Important Distinction: Demo vs Production

This is important when presenting the project professionally.

The repository contains substantial demo/simulation/fallback logic.

Therefore, do not claim that every visible dashboard movement is currently coming from physical RFID hardware.

A professional explanation is:

> "The software has a demo/simulation mode for validation and presentation, and a real mode designed to consume the RFID integration APIs and realtime telemetry services."

For a production deployment, the actual reader network, RFID reader configuration, tag population, antenna-zone calibration, network security, MongoDB infrastructure and hardware event feed must be connected and validated.

---

# 90. Production Deployment Architecture

Recommended production architecture based on the repository's application design:

```text
                    Construction Site
                           │
                ┌──────────┴──────────┐
                │                     │
          UHF RFID Readers       Other Sensors
                │                     │
                └──────────┬──────────┘
                           │
                      Secure Network
                           │
                           ▼
                    Integration Gateway
                           │
             ┌─────────────┴─────────────┐
             ▼                           ▼
        HTTP/MQTT                    WebSocket
             │                           │
             ▼                           ▼
          Backend ───────────────► Realtime Layer
             │
             ▼
        MongoDB Atlas
             │
             ▼
       AI / Analytics
             │
             ▼
       Web Dashboard
```

---

# 91. Environment Configuration

The repository expects environment-based configuration.

The README specifically indicates:

```text
GEMINI_API_KEY
```

The application also references environment configuration for areas such as:

```text
ADMIN_INITIAL_EMAIL
ADMIN_INITIAL_PASSWORD
CORS_ORIGINS
NODE_ENV
MongoDB configuration
Firebase configuration
```

Secrets should never be committed to source control.

---

# 92. Local Development

The repository README gives the basic flow:

```bash
npm install
```

Configure:

```text
.env.local
```

with:

```text
GEMINI_API_KEY
```

Then:

```bash
npm run dev
```

The package scripts also include:

```bash
npm run build
npm run preview
npm start
npm test
npm run lint
```

---

# 93. Build Flow

```text
TypeScript / React
       │
       ▼
Vite Build
       │
       ▼
Frontend dist
       │
       +
       ▼
esbuild server.ts
       │
       ▼
dist/server.cjs
       │
       ▼
Production Node Server
```

---

# 94. Testing Strategy

The repository contains:

- `tests/`
- `e2e/`
- Playwright configuration
- Vitest
- TypeScript validation
- ESLint

The package scripts define:

```text
npm test
npm run lint
```

The project therefore has infrastructure for both unit-style and end-to-end validation.

---

# 95. API / Integration Boundary

A useful way to understand the system is:

```text
                    EXTERNAL WORLD
                         │
       ┌─────────────────┼──────────────────┐
       ▼                 ▼                  ▼
   RFID Hardware       Firebase          Gemini
       │                 │                  │
       └─────────────────┼──────────────────┘
                         ▼
                    APPLICATION
                         │
              ┌──────────┼───────────┐
              ▼          ▼           ▼
            API        DB        Realtime
              │          │           │
              └──────────┼───────────┘
                         ▼
                     React UI
```

---

# 96. Why the Architecture Is Modular

The codebase separates:

- UI components
- shared state
- simulation
- API client
- database helpers
- server routes
- server services
- middleware
- schemas
- configuration

This allows individual capabilities to evolve independently.

For example:

```text
RFID hardware integration
        ↓
hardwareIntegrationService
        ↓
rfid route
        ↓
TrackingContext
        ↓
LiveTrackingTab
```

The UI does not need to know the physical details of how the reader communicates.

---

# 97. Key Strengths

## 1. Broad functional scope

The application goes beyond basic RFID visualization.

## 2. Real-time design

WebSocket/SSE/MQTT/polling mechanisms indicate a realtime-oriented architecture.

## 3. Hardware-aware

Reader, antenna, tag mapping and direct integration concepts are built into the codebase.

## 4. Enterprise workflows

Alerts, incidents, audit, SLA, permissions and compliance concepts are represented.

## 5. AI layer

The project integrates Gemini for operational/EHS assistance.

## 6. Demo capability

Simulation/fallback logic makes the product easier to demonstrate.

## 7. Extensible data model

The collection allow-list and schemas cover many future operational modules.

## 8. Multi-project concept

Project-specific zones and configuration support expansion to multiple construction sites.

---

# 98. Important Technical Risks / Gaps to Validate

These are not necessarily defects; they are areas that should be validated before production deployment.

### Hardware calibration

RFID location accuracy depends on physical reader/antenna placement, RF behavior, tag orientation and site geometry.

### Identity resolution

A production system needs a reliable tag-to-worker assignment lifecycle.

### Duplicate reads

RFID readers can generate repeated observations. Production ingestion should deduplicate/aggregate events appropriately.

### Zone accuracy

Reader/antenna-to-zone mappings need physical calibration.

### Security hardening

Production secrets, admin bootstrap credentials, CORS rules, token handling and infrastructure security must be reviewed.

### Database scalability

High-frequency RFID telemetry should use indexes, retention policies and suitable write/read strategies.

### Realtime scalability

A production multi-site deployment may need message queues, event streaming and horizontally scalable realtime services.

### AI governance

AI responses should be treated as decision support, especially for safety/compliance decisions.

---

# 99. Recommended Production Data Lifecycle

```text
RAW RFID EVENT
      │
      ▼
VALIDATE
      │
      ▼
NORMALIZE
      │
      ▼
DEDUPLICATE
      │
      ▼
ENRICH
 ┌────┼─────────────┐
 ▼    ▼             ▼
Person Zone       Reader
      │
      ▼
EVENT STORE
      │
      ├───────────────┐
      ▼               ▼
LIVE STATE         HISTORY
      │               │
      ▼               ▼
RULE ENGINE       ANALYTICS
      │
      ▼
ALERTS
      │
      ▼
INCIDENTS
      │
      ▼
AI / RCA
      │
      ▼
AUDIT / REPORTING
```

---

# 100. Investor-Level Product Positioning

The strongest product narrative is not:

> "This is a map that shows RFID tags."

A stronger positioning is:

> **"Aperture converts real-time construction-site telemetry into an operational intelligence layer for workforce visibility, safety, compliance and site decision-making."**

The RFID tag is the data source.

The product value is the software intelligence built around that data.

---

# 101. Value Chain

```text
RFID DATA
   ↓
LOCATION
   ↓
WORKER VISIBILITY
   ↓
CONTEXT
   ↓
RULES
   ↓
ALERTS
   ↓
INCIDENTS
   ↓
AI ANALYSIS
   ↓
CORRECTIVE ACTION
   ↓
ANALYTICS
   ↓
MANAGEMENT DECISION
```

---

# 102. Example Business Scenario

### Scenario

A worker carrying RFID tag `TAG-101` enters a crane exclusion zone.

### System processing

```text
TAG-101 detected
      ↓
Reader-01 / Antenna-2
      ↓
Zone = Crane Exclusion Zone
      ↓
Worker = Assigned Personnel
      ↓
Worker role = General Contractor
      ↓
Zone hazard = Critical
      ↓
Rule matched
      ↓
High-priority alert
      ↓
Security/EHS notified
      ↓
Worker location displayed
      ↓
Alert acknowledged
      ↓
Incident created if required
      ↓
AI RCA available
      ↓
Corrective action assigned
      ↓
Audit record retained
```

---

# 103. Example Executive Question → System Answer

### Question

"How many workers are in the high-risk area right now?"

### System path

```text
Live RFID Events
      ↓
Worker Resolution
      ↓
Zone Resolution
      ↓
Occupancy Calculation
      ↓
High-Risk Zone Filter
      ↓
Current Count
      ↓
Dashboard / AI Copilot
```

---

# 104. Example Safety Question

### Question

"Who has been idle for more than the configured threshold?"

### System path

```text
Live Worker State
      ↓
presenceState = IDLE
      ↓
dwellTime
      ↓
idleAlertThreshold
      ↓
Filter
      ↓
Alert / Analytics / AI
```

---

# 105. Example Hardware Question

### Question

"Which RFID readers are offline?"

### System path

```text
Hardware Readers
      ↓
Connection / Status
      ↓
Filter status = OFFLINE
      ↓
Devices UI
      ↓
Diagnostics
      ↓
Maintenance workflow
```

---

# 106. Example Incident Question

### Question

"What is the probable root cause of this incident?"

### System path

```text
Incident Record
      ↓
AI Route
      ↓
Gemini / fallback engine
      ↓
Severity
      ↓
Root Cause
      ↓
Contributing Factors
      ↓
CAPA
      ↓
Regulatory Impact
```

---

# 107. Full Module Map

```text
APERTURE
│
├── Authentication
│   ├── Login
│   ├── Registration
│   ├── Firebase Login
│   ├── JWT
│   └── RBAC
│
├── Command Center
│   ├── Dashboard
│   ├── Live Tracking
│   ├── Custom Map
│   └── Playback
│
├── Workforce
│   ├── People
│   ├── Attendance
│   ├── Visitors
│   └── QR
│
├── Tracking
│   ├── RFID
│   ├── Zones
│   ├── Assets
│   ├── Vehicles
│   ├── Cameras
│   └── Sensors
│
├── Safety
│   ├── Alerts
│   ├── Incidents
│   ├── SLA
│   ├── Emergency Broadcast
│   └── Compliance
│
├── Intelligence
│   ├── AI Feed
│   ├── AI Insights
│   ├── AI Copilot
│   └── AI RCA
│
├── Operations
│   ├── Devices
│   ├── Maintenance
│   ├── Connections
│   └── Diagnostics
│
├── Data
│   ├── MongoDB
│   ├── History
│   ├── Analytics
│   ├── Reports
│   └── Audit
│
└── Configuration
    ├── Settings
    ├── Permissions
    ├── Hardware
    ├── APIs
    ├── Maps
    └── Integrations
```

---

# 108. Complete System Flowchart

```text
┌───────────────────────────────┐
│      CONSTRUCTION SITE        │
└───────────────┬───────────────┘
                │
        RFID / IoT Telemetry
                │
                ▼
┌───────────────────────────────┐
│ RFID Readers / Antennas       │
│ Reader ID / Tag / RSSI / Time │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ Integration Layer             │
│ HTTP / MQTT / Hardware API    │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ Ingestion + Validation        │
│ Zod / Normalization           │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ Identity + Location Resolution│
│ Tag → Person → Zone           │
└───────────────┬───────────────┘
                │
                ▼
┌───────────────────────────────┐
│ Tracking State Engine         │
│ MOVING / IDLE / EXITED        │
└───────┬───────────────┬───────┘
        │               │
        ▼               ▼
┌──────────────┐   ┌──────────────┐
│ MongoDB      │   │ Realtime     │
│ History      │   │ WS/SSE       │
└──────┬───────┘   └──────┬───────┘
       │                  │
       └─────────┬────────┘
                 ▼
       ┌──────────────────┐
       │ React Dashboard  │
       └────────┬─────────┘
                │
   ┌────────────┼─────────────┐
   ▼            ▼             ▼
Live Map     Alerts       Analytics
   │            │             │
   │            ▼             │
   │        Incidents         │
   │            │             │
   │            ▼             │
   │        AI / RCA           │
   │            │             │
   └────────────┼─────────────┘
                ▼
       ┌──────────────────┐
       │ Management       │
       │ Decision / Action│
       └──────────────────┘
```

---

# 109. Technical Component Flowchart

```text
React UI
   │
   ▼
App.tsx
   │
   ├── Router
   ├── Permissions
   ├── Mode
   └── TrackingProvider
          │
          ▼
    TrackingContext
          │
     ┌────┼───────────┐
     ▼    ▼           ▼
  gaoApi simulation   db
     │      │          │
     └──────┼──────────┘
            ▼
      Live Application State
            │
            ▼
       UI Components
```

---

# 110. Backend Service Flowchart

```text
server.ts
   │
   ├── Database
   ├── Auth
   ├── Polling
   ├── WebSocket
   └── Middleware
        │
        ▼
     Routes
        │
 ┌──────┼─────────────────────────┐
 ▼      ▼       ▼       ▼         ▼
Auth   RFID     AI     Data    Hardware
 │      │       │       │         │
 ▼      ▼       ▼       ▼         ▼
DB     DB      Gemini   DB       DB
 │      │       │       │         │
 └──────┴───────┴───────┴─────────┘
                │
                ▼
          Realtime Services
```

---

# 111. Production Readiness Checklist

## Infrastructure

- [ ] Production MongoDB cluster
- [ ] Secure network
- [ ] TLS/HTTPS
- [ ] Production domain
- [ ] Reverse proxy
- [ ] Monitoring
- [ ] Backup strategy
- [ ] Database indexes
- [ ] Data retention policy

## RFID

- [ ] Physical reader installation
- [ ] Antenna placement
- [ ] Zone calibration
- [ ] Reader IDs
- [ ] Tag assignment
- [ ] RSSI calibration
- [ ] Duplicate-read handling
- [ ] Reader health monitoring

## Security

- [ ] Rotate bootstrap admin password
- [ ] Secure JWT secret
- [ ] Secure Gemini API key
- [ ] Restrict CORS
- [ ] HTTPS only
- [ ] Secure local storage strategy
- [ ] Audit logging
- [ ] Role review
- [ ] Penetration testing

## Operations

- [ ] Incident workflow
- [ ] Alert escalation
- [ ] SLA definitions
- [ ] Emergency procedures
- [ ] Daily reports
- [ ] Compliance reporting
- [ ] User training

## AI

- [ ] Production Gemini credentials
- [ ] Prompt governance
- [ ] AI response validation
- [ ] Human approval for safety decisions
- [ ] AI audit trail
- [ ] Cost monitoring
- [ ] Failure fallback

---

# 112. Recommended Demo Narrative

A professional presentation should start with the problem, not the technology.

### Opening

> "Construction companies know who is employed on a project, but they often do not have a continuous operational view of where people are, what zones are occupied, what devices are functioning, and what safety events are developing. Aperture is designed to turn that fragmented information into a single operational view."

### Then show

1. Dashboard
2. Live worker
3. Zone
4. Alert
5. Incident
6. AI analysis
7. Attendance
8. Hardware
9. Analytics
10. Playback
11. AI Copilot

### Closing

> "The core value is not simply RFID tracking. RFID provides the telemetry. Aperture converts that telemetry into workforce visibility, safety workflows, historical evidence, analytics and AI-assisted operational decisions."

---

# 113. Executive Summary

Aperture People Tracking in Construction is a broad construction operations application centered on real-time people/location telemetry.

Its major capabilities include:

- UHF RFID tracking
- Live worker visualization
- Zone mapping
- Worker/personnel management
- Visitor management
- Attendance
- Asset tracking
- Vehicle tracking
- Hardware/reader management
- Realtime connections
- Alerts
- Incident management
- AI EHS Copilot
- AI incident RCA
- Analytics
- Playback
- Audit
- Maintenance
- Custom maps
- Role-based access
- MongoDB data management
- Demo/simulation mode

The repository is architected as a React/Vite frontend backed by an Express/Node.js server, with MongoDB/Mongoose, Firebase/Firestore, WebSocket/SSE/MQTT integrations and Gemini AI.

The key architectural concept is:

**Physical-world telemetry → digital site state → operational rules → alerts/incidents → AI intelligence → management action.**

---

# 114. Repository Review Notes

The repository currently contains a substantial application implementation rather than only a static UI mockup. It includes:

- frontend routes/components
- backend API routes
- database services
- authentication
- hardware integration services
- realtime services
- AI services
- simulation/fallback mechanisms
- configuration and testing infrastructure

At the same time, the presence of demo/fallback code means that production claims should distinguish between **implemented software integration capability** and **validated physical-site deployment**.

---

# 115. One-Sentence Product Definition

> **Aperture is a construction-site operational intelligence system that transforms RFID and site telemetry into real-time workforce visibility, safety alerts, incident workflows, analytics and AI-assisted decision support.**

---

## End of Documentation
