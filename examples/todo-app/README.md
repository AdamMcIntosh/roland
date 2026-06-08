# Roland Todo App

A minimal, zero-dependency todo app used as the `PlanExecRevEx` smoke-test example.

## Features

- Add todos from a text input (submit with Enter or the Add button)
- Remove todos
- Mark todos complete or incomplete
- Filter by All, Active, or Completed
- Clear all completed todos
- Persist todos in `localStorage` across page reloads

## Run locally

Open the app directly:

```bash
xdg-open examples/todo-app/index.html
```

Or serve the folder with any static file server:

```bash
npx serve examples/todo-app
```

Then open the URL printed in the terminal (typically `http://localhost:3000`).

## Storage

Todos are saved under the versioned key `roland-todo-app:v1`. Invalid or missing stored data falls back to an empty list without crashing the app.

## Scope

This example is self-contained under `examples/todo-app/` and does not modify Roland core packages or tests.
