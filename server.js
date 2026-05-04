// server.js
const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = 3000;
const DATA_FILE = path.join(__dirname, "todos.json");

// ─── Helpers ────────────────────────────────────────────────────────────────

function loadTodos() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
}

function saveTodos(todos) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(todos, null, 2));
}

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function sendJSON(res, status, data) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(data, null, 2));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
  });
}

// ─── Seed Data ──────────────────────────────────────────────────────────────

const DEFAULT_TODOS = [
  { title: "Buy groceries", description: "Milk, eggs, and bread" },
  { title: "Read a book", description: "Finish 'Clean Code' by Robert Martin" },
  { title: "Exercise", description: "30 minutes of cardio" },
  { title: "Write unit tests", description: "Cover all CRUD endpoints" },
  { title: "Call the bank", description: "Ask about the new account" },
];

function seedIfEmpty() {
  const todos = loadTodos();
  if (todos.length === 0) {
    const seeded = DEFAULT_TODOS.map((t) => ({
      id: generateId(),
      title: t.title,
      description: t.description,
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }));
    saveTodos(seeded);
    console.log(`🌱  Seeded ${seeded.length} default todos into todos.json`);
  }
}

// ─── Router ─────────────────────────────────────────────────────────────────

const routes = {
  // GET /todos — list all
  "GET /todos": async (req, res) => {
    const todos = loadTodos();
    sendJSON(res, 200, { count: todos.length, todos });
  },

  // GET /todos/:id — get one
  "GET /todos/:id": async (req, res, id) => {
    const todos = loadTodos();
    const todo = todos.find((t) => t.id === id);
    if (!todo) return sendJSON(res, 404, { error: "Todo not found" });
    sendJSON(res, 200, todo);
  },

  // POST /todos — create
  "POST /todos": async (req, res) => {
    let body;
    try {
      body = await parseBody(req);
    } catch {
      return sendJSON(res, 400, { error: "Invalid JSON body" });
    }

    const { title, description = "" } = body;
    if (!title || typeof title !== "string" || !title.trim()) {
      return sendJSON(res, 400, { error: '"title" is required and must be a non-empty string' });
    }

    const newTodo = {
      id: generateId(),
      title: title.trim(),
      description: description.trim(),
      completed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const todos = loadTodos();
    todos.push(newTodo);
    saveTodos(todos);

    sendJSON(res, 201, newTodo);
  },

  // PUT /todos/:id — full update
  "PUT /todos/:id": async (req, res, id) => {
    let body;
    try {
      body = await parseBody(req);
    } catch {
      return sendJSON(res, 400, { error: "Invalid JSON body" });
    }

    const todos = loadTodos();
    const index = todos.findIndex((t) => t.id === id);
    if (index === -1) return sendJSON(res, 404, { error: "Todo not found" });

    const { title, description, completed } = body;
    if (title !== undefined && (typeof title !== "string" || !title.trim())) {
      return sendJSON(res, 400, { error: '"title" must be a non-empty string' });
    }
    if (completed !== undefined && typeof completed !== "boolean") {
      return sendJSON(res, 400, { error: '"completed" must be a boolean' });
    }

    const updated = {
      ...todos[index],
      ...(title !== undefined && { title: title.trim() }),
      ...(description !== undefined && { description: description.trim() }),
      ...(completed !== undefined && { completed }),
      updatedAt: new Date().toISOString(),
    };

    todos[index] = updated;
    saveTodos(todos);
    sendJSON(res, 200, updated);
  },

  // DELETE /todos/:id — delete one
  "DELETE /todos/:id": async (req, res, id) => {
    const todos = loadTodos();
    const index = todos.findIndex((t) => t.id === id);
    if (index === -1) return sendJSON(res, 404, { error: "Todo not found" });

    const [removed] = todos.splice(index, 1);
    saveTodos(todos);
    sendJSON(res, 200, { message: "Deleted successfully", todo: removed });
  },

  // DELETE /todos — clear all
  "DELETE /todos": async (req, res) => {
    saveTodos([]);
    sendJSON(res, 200, { message: "All todos deleted" });
  },
};

// ─── Server ─────────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const { method, url } = req;
  const [pathname] = url.split("?");
  const parts = pathname.split("/").filter(Boolean); // e.g. ["todos", "abc123"]

  let handler = null;
  let id = null;

  if (parts[0] === "todos") {
    if (parts.length === 1) {
      // /todos
      handler = routes[`${method} /todos`];
    } else if (parts.length === 2) {
      // /todos/:id
      id = parts[1];
      handler = routes[`${method} /todos/:id`];
    }
  }

  if (!handler) {
    return sendJSON(res, 404, {
      error: "Route not found",
      availableRoutes: [
        "GET    /todos",
        "GET    /todos/:id",
        "POST   /todos",
        "PUT    /todos/:id",
        "DELETE /todos/:id",
        "DELETE /todos",
      ],
    });
  }

  try {
    await handler(req, res, id);
  } catch (err) {
    sendJSON(res, 500, { error: "Internal server error" });
  }
});

seedIfEmpty();

server.listen(PORT, () => {
  console.log(`\n✅  Todo API running at http://localhost:${PORT}`);
  console.log("\nAvailable routes:");
  console.log("  GET    /todos          → list all todos");
  console.log("  GET    /todos/:id      → get a single todo");
  console.log("  POST   /todos          → create a todo  { title, description? }");
  console.log("  PUT    /todos/:id      → update a todo  { title?, description?, completed? }");
  console.log("  DELETE /todos/:id      → delete a todo");
  console.log("  DELETE /todos          → clear all todos\n");
});
