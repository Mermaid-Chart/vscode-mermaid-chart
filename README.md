# Mermaid Chart extension for Visual Studio Code

The official Mermaid extension for Visual Studio Code enables developers to seamlessly create, edit, preview and integrate mermaid diagrams from within the VS Code.

## Now with AI-Powered Diagramming! ✨

Transform ideas into diagrams instantly with our AI integration! Our extension now includes:
- **AI Chat Participant**: Simply describe your diagram needs in natural language with `@mermaid-chart` and watch as beautiful diagrams materialize
- **Smart Diagram Regeneration**: Auto-detect changes in your source files and instantly update referenced diagrams with one click
- **AI-Powered ER Diagrams**: Generate entity relationship diagrams from your codebase with simple commands
- **AI-Powered Cloud Architecture**: Visualize your cloud infrastructure automatically from configuration files
- **AI-Powered Docker Diagrams**: Create Docker architecture diagrams from your containerized applications
- **AI-Powered Ownership Diagram**: Visulize your code Ownership of each packages/folder form you project using the Git commit history 
- **AI-Powered Dependency Diagrams**:  Visualize all packages in your project, categorized by security issues, latest version status, and potential risks

> **Note**<br/>
> To use the AI diagramming feature, you must have the [GitHub Copilot](https://marketplace.visualstudio.com/items?itemName=GitHub.copilot) extension installed.

Now we offer a feature rich experience to create, visualize and edit Mermaid diagrams locally without needing to create any account. Made with ❤️ from the creators of Mermaid.js and we strive to provide the best Mermaid experience and provide regular updates.

Optionally, by creating a free MermaidChart account you can save and sync diagrams on the cloud, explore Mermaid AI, and experience the intuitive best-in-class drag-drop UI for Mermaid diagrams. 

![Image illustrating accessible diagrams in explorer panel](https://docs.mermaidchart.com/img/plugins/vscode-plugin.gif)

## Features

### Works with Latest Mermaid Version
We are the same team behind Mermaid.js, and our official extension works with the latest Mermaid version to provide support for new diagrams, enhancements and bug fixes. 

### Supported Diagrams
Currently supported diagrams and charts:
- Flowchart
- Sequence
- Block
- Class
- Entity Relationship
- Gantt
- Mindmap
- State
- Timeline
- Gitgraph
- C4
- Sankey
- Pie chart
- Quadrant
- Requirement
- User Journey
- Sankey
- XY chart
- Kanban
- Architecture
- Packet
- Radar

### Generate AI-powered diagrams directly from your code!
Transform your ideas and source code into clear, insightful diagrams with our new AI integration in VS Code.<br>
Just mention **@mermaid-chart** in any GitHub Copilot Chat and describe the diagram you want to create — even link specific source code files!<br>
 Whether it's a class diagram, sequence diagram, entity relationship diagram, or more — the AI assistant will analyze the code, generate the appropriate Mermaid syntax, and instantly show a live preview.<br>
Let your code speak for itself — effortlessly.

![Image illustrating accessible diagrams in explorer panel](https://docs.mermaidchart.com/img/plugins/ai-generate-diagram.gif)

With Smart Diagram Regeneration, when your source code or requirements change, the extension can detect these changes and offer to update related diagrams with a single click.

![Image illustrating accessible diagrams in explorer panel](https://docs.mermaidchart.com/img/plugins/vscode-plugin-update-diagram.gif)

### Visualize Cloud Infrastructure from Your Codebase
- Instantly visualize your cloud infrastructure with our AI-powered diagram generator.<br>
- Simply mention:  `@mermaid-chart /generate_cloud_architecture_diagram` in GitHub Copilot Chat or `MermaidChart: Generate Cloud Diagram` in command pallet.
- it will scan your workspace, detect cloud configuration files, and generate a clear, accurate architecture diagram.<br>
- Before generating, you can easily select the specific files you want to include, giving you full control over the output.<br>
- Understand your cloud setup at a glance — no manual effort required.

![vscode-plugin-cloud-diagram](https://docs.mermaidchart.com/img/plugins/vscode-plugin-cloud-diagram.gif)

### Generate Entity Relationship Diagrams from Your Codebase
- Automatically create entity relationship diagrams from your database schemas and code structures.<br>
- Simply mention: `@mermaid-chart /generate_er_diagram` in GitHub Copilot Chat to generate comprehensive ER diagrams.<br>
- The AI analyzes your codebase to identify entities, relationships, and database structures, creating clear visual representations.<br>
- Perfect for documenting database designs, understanding data relationships, and onboarding new team members.<br>
- Visualize your data architecture effortlessly — from code to diagram in seconds.

![vscode-plugin-er-diagram](https://docs.mermaidchart.com/img/plugins/er-diagram-vscode-plugin.gif)

### Generate Docker Architecture Diagrams
- Visualize your containerized applications and Docker infrastructure with AI-powered diagram generation.<br>
- Simply mention: `@mermaid-chart /generate_docker_diagram` in GitHub Copilot Chat to create detailed architecture diagrams.<br>
- Automatically detects and analyzes Docker-related files including Dockerfiles, docker-compose.yml, and stack files.<br>
- Before generating, you can select specific Docker configuration files to include in your diagram.<br>
- Understand your containerized architecture at a glance — perfect for documentation and team collaboration.

![vscode-plugin-docker-diagram](https://docs.mermaidchart.com/img/plugins/docker-diagram-vscode-plugin.gif)

### Generate Code Ownership Diagrams 
- Code ownership analysis provides a visual representation of team contributions to specific files or packages, helping identify maintainers and streamline collaboration.
- Simply mention : `@mermaid-chart /analyze_code_ownership` in GitHub Copilot Chat 
- The AI scans your workspace, analyzes file structures, and identifies ownership metadata such as authorship, contributors, and maintainers using commit history from Git.<br>
- Select specific time frames (e.g., 1 month, 3 months, 6 months, or 12 months) to focus on recent or historical contributions.<br>
-  Ownership is displayed for each package, with nodes color-coded based on contribution levels:
    - 🟢 Green – Actively Maintained
    - 🟠 Orange – Moderately Maintained
    - 🟡 Yellow – Lightly Maintained
    - ⚪ No color – Unmaintained<br>
- Perfect for understanding team responsibilities, improving collaboration, and streamlining code reviews.<br>
- Visualize code ownership effortlessly — from codebase to diagram in seconds.

![vscode-plugin-ownership-diagram](https://docs.mermaidchart.com/img/plugins/vscode-analyze_code_ownership_diagram.gif)

### Generate Dependency Diagrams from Your Codebase
- The Dependency Diagram provides a visual overview of all packages used in your project, highlighting their security and update status. It categorizes dependencies based on their version lag and known vulnerabilities, helping teams identify potential risks and prioritize updates effectively.<br>
- Simply mention: `@mermaid-chart /generate_dependency_diagram` in GitHub Copilot Chat.
- The AI scans your workspace, analyzes dependency files (e.g., package.json, pom.xml, requirements.txt), and generates a detailed diagram of all packages.<br>
- Each dependency is categorized based on Version & Vulnerability Analysis:
   - 🟢 Good – Up-to-date and secure packages
   - 🔵 Low – Slightly outdated but no critical issues
   - 🟡 Medium – Multiple versions behind or moderate vulnerabilities
   - 🟠 High – Known high-severity vulnerabilities
   - 🔴 Critical – Severe vulnerabilities or abandoned packages<br>
- The diagram helps development and security teams maintain package health, prevent exploits, and streamline dependency management.<br>
- Visualize your dependency health effortlessly — from codebase to diagram in seconds.

![vscode-plugin-dependency-diagram](https://docs.mermaidchart.com/img/plugins/vscode-dependency-diagram.gif)

### Real-Time local Edit & Preview 
Now you get a side-by-side real time preview of the mermaid diagram while editing the diagram locally. This helps the user to see the true power of a mermaid's text-based diagram, where each change in text is reflected immediately on the diagram.

![Real-Time local Edit & Preview](https://docs.mermaidchart.com/img/plugins/vscode-plugin-full-view.png)

### Syntax Highlighting 
We now support syntax highlighting for all Mermaid diagrams when writing the Mermaid code. The syntax highlighting works well with the developer selected theme for VS Code. 

![Syntax Highlighting](https://docs.mermaidchart.com/img/plugins/vscode-plugin-highlighting-dark.png)

The extension also provides syntax highlighting for Mermaid diagrams embedded in Markdown files, with specific highlighting based on diagram types.

![Syntax Highlighting in Markdown](https://docs.mermaidchart.com/img/plugins/vscode-plugin-markdown-highlighting.png)

### Pan & Zoom 
We now support Pan and Zoom for the diagram preview, where the user pan to a specific part of a large diagram, and also set different levels of zoom based on his preference. We implemented the zoom with stickiness, so that zoom levels are not changed when you edit your diagram
Users can of course use the reset option to resize the preview diagram to fit the screen.
![Pan & Zoom](https://docs.mermaidchart.com/img/plugins/vscode-plugin-pan.png)

### Export Diagrams
Export your diagrams easily in both SVG and PNG formats. This makes it simple to:
- Include diagrams in documentation
- Share with team members
- Use in presentations
- Version control your diagram assets

The exported files maintain high quality and can be used across different platforms and tools.

![Export Diagrams](https://docs.mermaidchart.com/img/plugins/vscode-plugin-export.png)


### Error Highlighting 
While writing the mermaid code, if you encounter syntax errors, the extension highlights the syntax error with an error message, and also indicates which line in the code might be causing the error. This helps the user to locate and fix the error. 
![Error Highlighting](https://docs.mermaidchart.com/img/plugins/vscode-plugin-error-indicator.png)

### Auto-Detect Mermaid diagrams in Markdown files
The extension automatically detects mermaid diagrams in the markdown files using the ```mermaid``` code block. 

This gives a unique opportunity for the users, they can now preview and edit the diagrams by clicking the edit diagram link directly from within the markdown file.
![Auto-Detect Mermaid diagrams in Markdown files](https://docs.mermaidchart.com/img/plugins/vscode-plugin-markdown-view.png)

### Mermaid Diagram Preview in Markdown File
This extension enables **live preview of Mermaid diagrams** directly within the **Markdown preview** in VS Code. No need to leave your editor!
![Markdown Preview](https://docs.mermaidchart.com/img/plugins/vscode-plugin-markdown-mermaid-preview.png)

### Support .mmd file extension as Mermaid Markdown file
Now we provide native support for the .mmd  extension. All the local mermaid diagrams will be loaded as a .mmd file. You can notice that the .mmd also has the Mermaid logo in the file explorer view.
![Support .mmd file extension as Mermaid Markdown file](https://docs.mermaidchart.com/img/plugins/vscode-plugin-file-icons.png)

### Smart Auto-Suggest with code snippets
Now based on the diagram type auto suggestions for code snippets will be triggered on type of "m", and it will start showing relevant code snippets shorthand, that once selected, will expand to the proper code snippet.
![Smart Auto-Suggest with code snippets](https://docs.mermaidchart.com/img/plugins/vscode-plugin-code-suggestions.png)

### Diagram Help
If you get stuck with a diagram's syntax or want to learn about other features for a given diagram, now you can directly access the respective diagram's detailed documentation on the official mermaid.js docs. 
![Diagram Help](https://docs.mermaidchart.com/img/plugins/vscode-plugin-diagram-help.png)

### Advanced Features when linking with MermaidChart
When you connect the extension with the MermaidChart account to explore some of the advanced features. With the integration to the Mermaid Chart service, this extension allows users to attach diagrams to their code and to gain quick access to updating diagrams.

You can explore all the these options by signing-up for a free account on www.mermaidchart.com 

#### Fetch & Use existing diagrams in Side Panel
Users can start login flow with their Mermaid Chart account and once logged-in, in the side panel all the projects and diagrams from your account will be loaded in the side panel.
![Fetch & Use existing diagrams in Side Panel](https://docs.mermaidchart.com/img/plugins/vscode-plugin-activitybar.png)

#### Link diagram directly in your code files
For each diagram in the Side Panel, user will see two options:
- Download: This will open the mermaid chart diagram locally for editing and will be connected to the Mermaid chart. Once the edited diagram is saved, or the user does a  ctrl+s, it will sync diagrams back to mermaid chart accounts as well
![Download](https://docs.mermaidchart.com/img/plugins/vscode-plugin-download.png)
- Link Diagram : When you click on a diagram, that diagram (its diagram id) will be inserted into the code editor as a comment at the position of the cursor. And users will get an option to preview or edit the diagram from this diagram id.
![Link Diagrams](https://docs.mermaidchart.com/img/plugins/vscode-plugin-link-diagram.png)

#### Smart Sync to promote collaboration
When a  user modifies an existing diagram, before saving it to MermaidChart service, it smartly checks if any modification is made in the web view, and if found, it indicates to the user to resolve any conflicts, and then save the resolved diagram back. 
![Smart Sync to promote collaboration 1](https://docs.mermaidchart.com/img/plugins/vscode-plugin-smart-indicator-view.png)

![Smart Sync to promote collaboration 2](https://docs.mermaidchart.com/img/plugins/vscode-plugin-smart-indicator.png)

#### Refresh 
To get the latest changes of diagrams from Mermaid Chart, click on the button named Refresh at the top in the side panel.

![Refresh ](https://docs.mermaidchart.com/img/plugins/vscode-plugin-refresh.png)

#### Open in Web View 
Users now have the option to open and edit diagrams in the web view on www.mermaidchart.com in the browser. This will enable them to use the best-in-class Visual Editor with drag and drop interface to modify the diagram, Mermaid AI, use diagrams in Presentations etc
![Open in Web View](https://docs.mermaidchart.com/img/plugins/vscode-plugin-mermaidchart.png)

### Commands

| Command | Description |
|---------|------------|
| **MermaidChart: Create Diagram** | Creates a new Mermaid diagram in the editor. |
| **MermaidChart: Login** | Logs in to the Mermaid Chart service to access and manage diagrams. |
| **MermaidChart: Logout** | Logs out from the Mermaid Chart service.. |
| **MermaidChart: Sync Diagram** | Synchronizes the current diagram with Mermaid Chart.. |
| **MermaidChart: Preview Diagram** | Opens a preview of the selected Mermaid diagram within the editor. |


### Extension Settings

This extension contributes the following settings:
- `mermaidChart.baseUrl`: This points to the instance of the mermaid chart you are running, for the public service this is `https://www.mermaidchart.com/`.
- `mermaid.vscode.dark`: Defines the theme used for Mermaid diagrams when VS Code is in dark mode.
- `mermaid.vscode.light`: Defines the theme used for Mermaid diagrams when VS Code is in light mode.
- `mermaid.vscode.maxZoom`: Sets the maximum zoom level for diagram preview (default: 10).
- `mermaid.vscode.maxCharLength`: Sets the maximum text size limit for diagrams.
- `mermaid.vscode.maxEdges`: Sets the maximum number of edges allowed in a diagram.
- `mermaid.vscode.aiExportName`: Determines whether to use GitHub Copilot to generate a name for the exported diagram.

## Release Notes
### 2.5.2 - 2025-08-11
- Added new AI feature **Generate Code Ownership Diagrams**
   - Command to use  `@mermaid-chart /analyze_code_ownership` 

- Added new AI feature **Generate Dependency Diagrams from Your Codebase** 
   - Command to use  `@mermaid-chart /generate_dependency_diagram` 

### 2.5.1 - 2025-07-22
- Bug fix

### 2.5.0 - 2025-07-17
- Added new AI feature **Generate Entity Relationship Diagrams**
- Added new AI feature **Generate Docker Architecture Diagrams** 
- Use `@mermaid-chart /generate_er_diagram` to generate ER diagrams from your codebase
- Use `@mermaid-chart /generate_docker_diagram` to generate Docker architecture diagrams from Docker-related files

### 2.4.1 -2025-06-11
- Command bug fixed

### 2.4.0 -2025-06-04
- Added new AI feature **Generate Cloud Architecture Diagram**
- Use `@mermaid-chart /generate_cloud_architecture_diagram` to generate cloud diagram or `MermaidChart: Generate Cloud Diagram`

### 2.3.0 -2025-05-13
- Added export functionality for SVG and PNG formats
- Added support for additional icon packs:
  - Logos (from iconify-json/logos)
  - Material Design Icons (MDI)
- Added syntax highlighting for markdown mermaid blocks based on diagram types
- Performance improvements and bug fixes
- Added configurable maximum zoom level setting
- Added settings for maximum text size and edges in diagrams

### 2.2.5 -2025-04-30
- Refined authentication behavior to remove unnecessary login prompts and Account badge indicators, ensuring a less intrusive experience.

### 2.2.4 -2025-04-29
- Supports latest Mermaid version
- Bug Fixes
### 2.2.3 -2025-04-22
- Added support to render Mermaid diagrams directly in the VS Code Markdown preview, replacing the raw Mermaid code blocks
- Added support for redux-color & redux-dark-color theme

### 2.2.2 -2025-04-16
- Supports latest Mermaid version

### 2.2.1 -2025-04-14
- Bug Fixes

### 2.2.0 -2025-04-07
- Added three specialized AI tools for improved Mermaid diagramming:
  - **Syntax Documentation Tool**: Provides instant access to detailed diagram syntax guides
  - **Diagram Validation Tool**: Ensures correct syntax before rendering diagrams
  - **Diagram Preview Tool**: Streamlined visualization of Mermaid diagrams
- Enhanced **VS Code Agent Mode** with dedicated **Mermaid tools** for improved accuracy
- Improved AI chat participant capabilities with documentation-powered responses
- Better integration with GitHub Copilot Chat for more reliable diagram generation

### 2.1.3 -2025-04-03
- Bug fixes

### 2.1.2 -2025-03-26
- Supports mermaid 11.6.0
- Renamed `Update Diagram with Latest Changes` to `Regenerate Diagram`
- Added Redux as Default Theme

### 2.1.1 - 2025-03-21
- Bug fix for Ai chat requests

### 2.1.0 - 2025-03-21
- Added AI-powered diagramming capabilities
- Introduced AI chat participant with `@mermaid-chart` command
- Added smart diagram regeneration based on source file changes

### 2.0.4 - 2025-03-13
- Supports mermaid 11.5.0

### 2.0.3 - 2025-03-05
- Fixed performance issues with auto-save
- Improved handling of save operations for Mermaid files

### 2.0.2 - 2025-02-28
- Broken images fix

### 2.0.0 - 2025-02-28
New General Features
- Real-Time Local Edit & Preview
- Syntax Highlight for all Mermaid diagrams
- Pan & Zoom for diagram preview
- Error Highlighting
- Auto-detech `.mmd` file extension
- Handle Mermaid diagram in Markdown files
- Support for Code Snippets
- Diagram Help to link directly to official documentation
- New features for LoggedIn Users
- Smart sync & Save
- Refresh diagram
- Dependency Update
- Upgraded to latest Mermaid version `v11.4.1` 

- Added OAuth support for the MermaidChart plugin.
### 1.0.3 - 2023-07-17

- Added OAuth support for the MermaidChart plugin.

### 1.0.2 - 2023-07-14

- Added support for multiple languages including python, markdown, yamletc.

### 1.0.1 - 2023-06-29

- Added default value "https://www.mermaidchart.com" for baseUrl configuration setting.
- Corrected inserted label in editor code.
- Added info in README.md about the MERMAIDCHART field in the explorer view.

### 1.0.0 - 2023-06-26

- Initial release of the Mermaid Chart extension for Visual Studio Code.


#
