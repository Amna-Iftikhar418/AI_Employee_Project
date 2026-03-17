# Personal AI Employee – Bronze Tier

## System Overview

This project builds a personal AI employee using:

- Obsidian vault for memory
- Claude Code for reasoning
- Python watchers for task detection
- Agent Skills for task processing

## Folder Structure

```
AI_Employee_Project
├── vault/
│   └── AI_Employee_Vault/
│       ├── Inbox/              # Drop tasks here
│       ├── Needs_Action/       # Tasks waiting for Claude
│       ├── Plans/              # Execution plans (MANDATORY)
│       ├── Done/               # Completed tasks
│       ├── Logs/               # Activity logs
│       ├── Skills/             # Agent Skills
│       ├── Dashboard.md        # System status
│       └── Company_Handbook.md # Operating rules
└── watchers/
    ├── base_watcher.py
    ├── filesystem_watcher.py
    └── run_watcher.py
```

## Workflow (REQUIRED)

The Bronze Tier workflow MUST follow this exact pipeline:

```
Inbox → Needs_Action → Plans → Dashboard → Logs → Done
```

### Steps:

1. **User creates task** in Inbox
2. **Watcher detects task** → Creates TASK_ file in Needs_Action
3. **Claude reads task** → Creates PLAN_ file in Plans/ (MANDATORY - NEVER SKIP)
4. **Claude updates** Dashboard.md
5. **Claude writes** log entry in Logs/
6. **Claude moves** task to Done/

## Architecture

### Agent Skills

All AI functionality is implemented as Agent Skills in `/Skills/`:

- **basic_file_handler.md**: Processes tasks from Needs_Action folder
  - Reads task metadata
  - Creates execution plan (REQUIRED)
  - Updates Dashboard
  - Writes logs
  - Moves task to Done

### Watchers

Python scripts that monitor for new tasks:

- **filesystem_watcher.py**: Monitors Inbox folder for new files
- **base_watcher.py**: Abstract base class for all watchers
- **run_watcher.py**: Entry point to start watcher

## How to Run

### Start Watcher:

```bash
cd watchers
python run_watcher.py
```

### Start Claude:

```bash
claude
```

## Compliance Rules

- **NEVER skip plan creation** - Plans/ folder must contain plan for every processed task
- **NEVER write fake entries** - Dashboard and Logs must reflect actual actions
- **ALWAYS follow Company_Handbook.md** - All actions must comply with defined rules
- **Financial actions require approval**
- **Communication actions require approval**
