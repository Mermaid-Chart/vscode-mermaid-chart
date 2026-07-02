# Change Log

### 2.7.2 - 2026-07-2
- Resolved an issue where zoom reset after changing text.

### 2.7.1 - 2026-06-23
- Added **Mermaid Sync Review List** — sidebar listing all bot-updated diagrams with **M** / **A** / **R** badges, per-file accept/reject/close, and bulk **Accept All**, **Reject All**, **Close Review**, and **Open Changes** (login required for bulk actions).

### 2.7.0 - 2026-06-16
- Added **Improve Diagram** — CodeLens commands at the top of .mmd / .mermaid files (**Preview Diagram**, **Save Diagram to Mermaid Chart**, **Repair Diagram**, **Improve Diagram**). 
- **Improve Diagram** opens a sidebar view that generates two AI variants (layout/grouping and styling), with model selection, diff preview, and dual diagram previews before applying changes.
- Updated diagram diff UI for review Mermaid sync command 

### 2.6.9 - 2026-06-9 
- Fixed an bug where Mermaid diagrams were not rendering correctly in Markdown files

### 2.6.7 - 2026-05-29
- Added **Generate Mermaid Diagram from Code** — This command appears at the bottom of supported code files, or you can directly use `@mermaid-chart /generate_diagram_from_code` to select files, choose a diagram type, and generate Mermaid diagrams using AI.
- Added **Review Mermaid Sync** — Provides highlight, diff preview, accept, reject, and commit actions for .mmd/.mermaid files updated by the [Mermaid Diagram Sync GitHub App](https://github.com/marketplace/mermaid-diagram-sync); Also includes automatic detection after `git pull` and support for MermaidChart: Connect GitHub for Mermaid Diagram Sync for PR-aware reviews.
- Added **Pre-commit Diagram Regeneration** —When source files linked to Mermaid diagrams are staged using git add, Mermaid Chart prompts you to regenerate affected diagrams with AI before committing. This can be disabled via Settings → **Mermaid Chart: Pre Commit Sync Enabled**

### 2.6.6 - 2026-05-5
- remove the login pop-up 

### 2.6.5 - 2026-04-29
- Enhanced VS Code theme integration with automatic preview panel UI synchronization

### 2.6.4 - 2026-04-16
- Added **Diagram Diff Highlighting** for Remote Sync and Regenerate Diagram features. it's Enhanced dual preview mode with precise highlighting for both flowchart and sequence diagrams

### 2.6.3 - 2026-04-09
- Enhanced diagram management with comprehensive right-click context menu
- Moved Link Diagram functionality from hover to right-click menu for better accessibility
- Removed "Use Diagram" option for simplified workflow
- Consolidated all diagram operations (Link, View, Edit in Mermaid Chart, Edit Locally) into right-click context menu
- Added Duplicate diagram, Delete diagram, Rename diagram option to context menu 
- Added project-level add diagram button (+) for quick diagram creation

### 2.6.2 - 2026-03-27
- Added privacy policy and data collection documentation detailing user data usage and analytics practices 

### 2.6.0 - 2026-03-09
- Updated preview panel design and it also dynamically adapt to both diagram themes and VS Code themes for better visual consistency.
- Added copy PNG and SVG functionality directly within the export modal, allowing users to copy diagrams to clipboard without downloading.
- Introduced rename and delete options for Mermaid diagram links — right-click on any diagram in the list to access a context menu for renaming or deleting diagrams directly from VS Code.
### 2.5.9 - 2026-02-26
- Updated authentication to support both OAuth and manual token flows.
- Added Repair Diagram with Mermaid AI — when a diagram throws an error, users can run the repair command to fix it using Mermaid AI. It also displays the user’s remaining AI credits.
- Added 2 preview support for Regenerate and Remote Sync, allowing users to visualize diagram differences.
- Improved the login UI design to make it more user-friendly.


### 2.5.6 - 2025-12-04
- Added theme selector in preview allowing users to change diagram themes in real-time during current session
- Enhanced export functionality with custom background color selection for diagram exports

### 2.5.5 - 2025-11-24
- Added new AI feature **Generate C4 Top-Down Architecture Diagrams**
   - Command to use `@mermaid-chart /generate_c4_architecture`
   - Scan your entire codebase to understand components and relationships
   - Create C4 diagrams showing system architecture, containers, components, and their interactions visually

### 2.5.4 - 2025-11-04
- Added new AI feature **Generate Execution Sequence Diagrams**
   - Command to use `@mermaid-chart /generate_execution_sequence`
   - Generate detailed sequence diagrams from modular code showing interactions between components, classes, and methods

### 2.5.2 - 2025-08-11
- Added new AI feature **Generate Code Ownership Diagrams**
   - Command to use  `@mermaid-chart /analyze_code_ownership` 

- Added new AI feature **Generate Dependency Diagrams from Your Codebase** 
   - Command to use  `@mermaid-chart /generate_dependency_diagram`  

### 2.5.0 - 2025-07-17
### New Features
- Added new AI feature **Generate Entity Relationship Diagrams**
- Added new AI feature **Generate Docker Architecture Diagrams** 
- Use `@mermaid-chart /generate_er_diagram` to generate ER diagrams from your codebase
- Use `@mermaid-chart /generate_docker_diagram` to generate Docker architecture diagrams from Docker-related files

### 2.4.0 -2025-06-04
- Added new AI feature **Generate Cloud Architecture Diagram**
- Use `@mermaid-chart /generate_cloud_architecture_diagram` to generate diagram 

### 2.3.0 -2025-05-13
### New Features
- Added export functionality for SVG and PNG formats
- Added new configurable settings:
  - Maximum zoom level control
  - Maximum text size limit
  - Maximum edges limit
- Added support for additional icon packs:
  - Logos (from iconify-json/logos)
  - Material Design Icons (MDI)
- Added support for markdown mermaid block syntax highlighting based on specific diagram types

### 2.2.5 -2025-04-30
- Refined authentication behavior to remove unnecessary login prompts and Account badge indicators, ensuring a less intrusive experience.

### 2.2.3 -2025-04-22
### New Features
- Added support to render Mermaid diagrams directly in the VS Code Markdown preview, replacing the raw Mermaid code blocks
- Added support for redux-color & redux-dark-color theme
### 2.2.0 -2025-04-07
### New Features
- Added three specialized AI tools for improved Mermaid diagramming:
  - **Syntax Documentation Tool**: Provides instant access to detailed diagram syntax guides
  - **Diagram Validation Tool**: Ensures correct syntax before rendering diagrams
  - **Diagram Preview Tool**: Streamlined visualization of Mermaid diagrams
- Enhanced VS Code Agent Mode with dedicated Mermaid tools for improved accuracy
- Improved AI chat participant capabilities with documentation-powered responses
- Better integration with GitHub Copilot Chat for more reliable diagram generation

### 2.1.3 -2025-04-03
### Fixed
- Resolved bugs.

### 2.1.2 -2025-03-26

### Changed 
- Upgraded to Mermaid `v11.6.0`
- Renamed `Update Diagram with Latest Changes` to `Regenerate Diagram`
- Added Redux as Default Theme


### 2.1.1 - 2025-03-21
### Fixed
- Resolved bug in AI chat requests.

### 2.1.0 - 2025-03-21
### New Features
- AI-powered diagramming capabilities.
- AI chat participant with `@mermaid-chart` command.
- Smart diagram regeneration based on source file changes.

### 2.0.4 - 2025-03-13
### Changed
- Upgraded to Mermaid `v11.5.0`.

### 2.0.3 - 2025-03-05
### Fixed
- Performance issues with auto-save.
- Improved Improved handling of save operations for Mermaid files

### 2.0.2 - 2025-02-28
### Fixed
- Broken image rendering issue.

### 2.0.0 - 2025-02-28
### New Features 
- **General Features:**
  - Real-time local edit & preview.
  - Syntax highlighting for all Mermaid diagrams.
  - Pan & zoom support in diagram preview.
  - Error highlighting.
  - Auto-detection of `.mmd` file extensions.
  - Handling of Mermaid diagrams in Markdown files.
  - Support for code snippets.
  - Direct links to official documentation via "Diagram Help".
- **For Mermaid Chart Users:**
  - Smart sync & save functionality.
  - Refresh diagram option.
- **Upgrades:**
  - Updated to Mermaid `v11.4.1`.


### 1.0.3 - 2023-07-17

- Added OAuth support for the MermaidChart plugin.

### 1.0.2 - 2023-07-14

- Added support for multiple languages.

### 1.0.1 - 2023-06-29

- Added default value "https://www.mermaidchart.com" for baseUrl configuration setting.
- Corrected inserted label in editor code.
- Added info in README.md about the MERMAIDCHART field in the explorer view.

### 1.0.0 - 2023-06-26

- Initial release with a first version of the plugin
