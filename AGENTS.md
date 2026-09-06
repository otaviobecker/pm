# The Project Management web app

## Business Requirements

This project is building a Project Management App. Key features:
- Anyone can register an account, sign in, manage their profile, and change their password
- Administrators can promote, deactivate, and delete accounts; the workspace always keeps one active administrator
- A signed-in user sees the boards they own or have been invited to, and can create as many as they need
- A board can be shared with editors and viewers, archived, and deleted by its owner
- A board's columns can be renamed, added, reordered, deleted, and given a work-in-progress limit
- Cards can be created, edited, deleted, moved with drag and drop, and carry a priority, due date, and assignee
- The board can be filtered by text, priority, and assignee
- There is an AI chat feature in a sidebar; the AI is able to create / edit / move one or more cards on the open board

## Limitations

The bundled `user` / `password` account exists so a fresh database is usable immediately. It is an ordinary administrator account and its password can be changed.

Sharing is per board. There are no organizations or teams.

This runs locally, in a docker container.

## Technical Decisions

- NextJS frontend
- Python FastAPI backend, including serving the static NextJS site at /
- Everything packaged into a Docker container
- Use "uv" as the package manager for python in the Docker container
- Use OpenRouter for the AI calls. An OPENROUTER_API_KEY is in .env in the project root
- Use `openai/gpt-oss-120b` as the model
- Use SQLLite local database for the database, creating a new db if it doesn't exist
- Start and Stop server scripts for Mac, PC, Linux in scripts/

## Starting Point

A working MVP of the frontend has been built and is already in frontend. This is not yet designed for the Docker setup. It's a pure frontend-only demo.

## Color Scheme

- Accent Yellow: `#ecad0a` - accent lines, highlights
- Blue Primary: `#209dd7` - links, key sections
- Purple Secondary: `#753991` - submit buttons, important actions
- Dark Navy: `#032147` - main headings
- Gray Text: `#888888` - supporting text, labels

## Coding standards

1. Use latest versions of libraries and idiomatic approaches as of today
2. Keep it simple - NEVER over-engineer, ALWAYS simplify, NO unnecessary defensive programming. No extra features - focus on simplicity.
3. Be concise. Keep README minimal. IMPORTANT: no emojis ever
4. When hitting issues, always identify root cause before trying a fix. Do not guess. Prove with evidence, then fix the root cause.

## Working documentation

All documents for planning and executing this project will be in the docs/ directory.
Please review the docs/PLAN.md document before proceeding.