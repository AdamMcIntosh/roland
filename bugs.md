## 🐛 Bug Fix Workflow

### **Setup: Run Samwise in Your Project**

```bash
# Navigate to your project directory
cd /path/to/your-project

# Start samwise (it uses the current directory as workspace)
npm run samwise
# or
samwise  # if installed globally
```

### **Tell Samwise About the Bug**

You have several options depending on complexity:

#### **Option 1: Quick Fix with Agent Mode** (Recommended)
```bash
> agent "There's a bug in src/auth.ts - users can't login because the password hash comparison is failing"
```

**What happens:**
1. ✅ **Reads project files** - Samwise uses `read_file` tool to examine `src/auth.ts`
2. ✅ **Understands context** - It loads related files if needed
3. ✅ **Proposes fix** - Shows you the code change
4. ✅ **Asks for confirmation** - "Write file: src/auth.ts?"
5. ✅ **Applies the fix** - Writes the corrected code
6. ✅ **Can run tests** - "Execute command: npm test?"

#### **Option 2: Multi-Agent Pipeline** (Complex Bugs)
```bash
> pipeline: "Fix the authentication bug in src/auth.ts where password validation fails"
```

**What happens:**
1. **Planning Step** (architect agent) - Analyzes the bug, creates fix plan
2. **Execution Step** (executor agent) - Implements the fix
3. **Review Step** (critic agent) - Reviews the code for correctness
4. **Documentation Step** (writer agent) - Documents what was changed

#### **Option 3: Recipe-Based Fix**
```bash
> recipe BugFix --input '{"description": "Login fails due to password hash mismatch", "file": "src/auth.ts"}'
```

---

## 🎯 Real Example Flow

### **Scenario: Bug in a Todo App**

```bash
cd ~/projects/todo-app
samwise

# You describe the bug
> agent "There's a NullReferenceException in TodoController.cs when deleting a todo that doesn't exist. Fix this by adding proper null checking."
```

**Samwise's Response:**
```
🔧 Processing query...

📖 Reading file: src/controllers/TodoController.cs
🤖 Analyzing code...
💡 Found issue: Missing null check in DeleteTodo method

Proposed fix:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
public IActionResult DeleteTodo(int id)
{
    var todo = _repository.GetById(id);
+   if (todo == null)
+   {
+       return NotFound($"Todo with ID {id} not found");
+   }
    _repository.Delete(todo);
    return Ok();
}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  Write file: src/controllers/TodoController.cs? (y/n)
```

**You confirm:** `y`

```
✅ File written: src/controllers/TodoController.cs

🧪 Would you like me to:
1. Run tests to verify the fix?
2. Generate a unit test for this case?

Execute command: dotnet test? (y/n)
```

---

## 🛠️ Key Features for Bug Fixing

### **1. Project Context Awareness**
- ✅ **Workspace Directory**: All file operations are scoped to your project
  ```typescript
  workspaceDirectory: process.cwd()  // Your current project
  ```
- ✅ **Reads ANY file**: `readFile('src/auth.ts')`
- ✅ **Lists directories**: `listFiles('src/models')`
- ✅ **Checks file info**: `getFileInfo('package.json')`

### **2. Safe File Modifications**
- ✅ **Confirmation before writes**: You approve every file change
- ✅ **Path validation**: Can't write outside your project
- ✅ **Overwrite protection**: Warns before overwriting existing files

### **3. Tool Calling Capabilities**
```typescript
// Tools samwise can use for bug fixing:
read_file          // Examine buggy code
write_file         // Apply fixes
edit_file          // Make targeted edits
list_files         // Explore project structure
execute_command    // Run tests, build, etc.
run_skill          // Use refactoring/testing skills
```

### **4. Terminal Integration**
```bash
# Samwise can run commands to verify the fix
> agent "Fix the bug, then run npm test to verify"

# It will:
1. Read the buggy file
2. Propose and apply fix
3. Ask: "Execute command: npm test?"
4. Show you test results
```

---

## 📋 Complete Bug Fix Session Example

```bash
$ cd ~/projects/my-api
$ samwise

samwise> agent "There's a bug in src/api/users.ts - the GET /users endpoint returns 500 when the database is empty. It should return an empty array instead."

🔧 Agent Processing...

📖 Reading: src/api/users.ts
📖 Reading: src/database/userRepo.ts

💡 Analysis:
- UserRepository.getAll() returns null instead of []
- API doesn't handle null case

📝 Proposed Changes:

File: src/database/userRepo.ts
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  async getAll(): Promise<User[]> {
    const users = await this.db.query('SELECT * FROM users');
-   return users;
+   return users || [];
  }
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

⚠️  Write file: src/database/userRepo.ts? (y/n) y

✅ File written successfully

🧪 Running tests...
⚠️  Execute command: npm test? (y/n) y

✅ Tests passed! (12/12)

📊 Session Summary:
  • Files modified: 1
  • Commands executed: 1
  • Cost: $0.003
  • Duration: 4.2s
```

---

## 🚀 Advanced Usage

### **Multi-File Bug Fixes**
```bash
> agent "Fix the race condition between AuthService.ts and SessionManager.ts that causes duplicate sessions"
```
Samwise will:
1. Read both files
2. Identify the race condition
3. Propose fixes to both files
4. Ask for confirmation for each

### **With Auto-Confirm** (Faster, but careful!)
```bash
> agent --auto-confirm "Quick fix: typo in variable name userNmae -> userName in all files"
```

### **Interactive Mode** (Conversational)
```bash
> agent --interactive

Agent> What would you like me to help with?
You> There's a bug in the login flow
Agent> I'll need more details. Which file contains the bug?
You> src/auth/LoginController.ts
Agent> *reads file* I see the issue - missing await on the authenticate call...
```

---

## 🎯 Best Practices

### ✅ **Do:**
- Describe the bug clearly and which file(s) are affected
- Review proposed changes before confirming
- Let samwise run tests after fixes
- Use `pipeline` mode for complex, multi-step fixes

### ❌ **Don't:**
- Use `--auto-confirm` for critical code without review
- Forget to commit your working code before bug fixing
- Skip running tests after fixes

---

## 💡 Pro Tips

1. **Use Git First**
   ```bash
   git add -A && git commit -m "Before samwise bug fix"
   samwise
   ```

2. **Combine with Tests**
   ```bash
   > agent "Fix the bug in auth.ts and generate a unit test that prevents it from happening again"
   ```

3. **Use Pipeline for Thorough Fixes**
   ```bash
   > pipeline: "Fix authentication bug with comprehensive testing and documentation"
   ```

4. **Let It Explore**
   ```bash
   > agent "Find and fix the bug causing users to logout unexpectedly. Check all session-related files."
   ```

---

## 📊 Cost & Performance

| Mode | Agents | Typical Cost | Best For |
|------|--------|-------------|----------|
| **agent** | 1 | $0.001-0.01 | Simple bugs, single file |
| **autopilot** | 3 | $0.01-0.05 | Multi-step fixes |
| **pipeline** | 4 | $0.02-0.08 | Complex bugs needing review |

---

## 🔗 More Information

- See full tool list: [Search for more workspace tools](https://github.com/AdamMcIntosh/samwise/search?q=workspaceDirectory)
- Interactive CLI docs: `EXAMPLE_USAGE.md`
- Recipe catalog: `RECIPES_CATALOG.md`

**Ready to fix bugs with samwise?** It's like having a persistent, tireless debugging assistant that never gives up! 🧑‍🌾