# Pre-Built Recipes Catalog

> Complete documentation of all 6 pre-built workflow recipes included with samwise

Recipes are YAML-based workflow templates that orchestrate multiple agents to accomplish complex tasks. They're loaded automatically and can be executed via CLI or MCP tools.

**Quick Start:**
```bash
# List all recipes
samwise recipes

# Execute a recipe
samwise recipe PlanExecRevEx

# With custom inputs
samwise workflow PlanExecRevEx --input '{"task": "build auth system"}'
```

---

## Quick Reference

| Recipe | Agents | Steps | Best For | Est. Cost |
|--------|--------|-------|----------|-----------|
| **PlanExecRevEx** | 4 | 4 | Feature development, refactoring | $0.05-$0.80 |
| **BugFix** | 3 | 4 | Bug resolution, error fixes | $0.03-$0.25 |
| **RESTfulAPI** | 4 | 5 | API development, endpoints | $0.15-$1.50 |
| **MicroservicesArchitecture** | 3 | 5 | System design, architecture | $0.20-$1.00 |
| **SecurityAudit** | 3 | 4 | Security review, compliance | $0.15-$1.20 |
| **WebAppFullStack** | 5 | 6 | Full-stack app development | $0.50-$2.00 |

---

## 1. PlanExecRevEx - Plan-Execute-Review-Explain

**File**: `recipes/PlanExecRevEx.yaml`  
**Purpose**: Autonomous 4-agent coding workflow with continuous improvement loop  
**Agents**: 4 (Planner, Executor, Reviewer, Explainer)  
**Models**: Claude Opus → GPT-4o → Gemini Pro → Grok  
**Steps**: 4 sequential with conditional looping  
**Ideal For**: Complex development tasks, feature implementation, refactoring

### Description
"Autonomous loop: Claude plans → GPT-4o executes → Gemini reviews → Grok explains"

This recipe implements a complete development cycle where each agent specializes:
- **Planner** (Claude Opus): Strategic thinking and architecture
- **Executor** (GPT-4o): Code implementation
- **Reviewer** (Gemini Pro): Code review and quality checks
- **Explainer** (Grok): Documentation and explanation

### Flow
```
1. Planner → Analyze task, create detailed plan
   ↓
2. Executor → Implement solution based on plan
   ↓
3. Reviewer → Review code, identify issues
   ↓ (if issues found, loop back to Executor)
   ↓
4. Explainer → Document solution and rationale
```

### Use Cases
- **Feature Development**: New features requiring planning → implementation → review
- **Code Refactoring**: Major refactoring with quality gates
- **Bug Fixes**: Complex bugs needing analysis → fix → verification
- **Architecture Changes**: System redesigns with peer review
- **Learning Projects**: Understand complex code through explained solutions

### Example Usage
```bash
# Basic execution
samwise recipe PlanExecRevEx

# With specific task
samwise workflow PlanExecRevEx --input '{
  "task": "implement OAuth2 authentication",
  "context": "Express.js backend, PostgreSQL database",
  "requirements": "secure, scalable, well-tested"
}'
```

### Cost Estimate
- **Simple tasks**: $0.05 - $0.10 (1-2 iterations)
- **Medium tasks**: $0.15 - $0.30 (2-3 iterations)
- **Complex tasks**: $0.40 - $0.80 (3-4 iterations)

*Note: Costs vary based on task complexity and number of review loops*

---

## 2. BugFix - Automated Bug Resolution

**File**: `recipes/BugFix.yaml`  
**Purpose**: Systematic bug investigation and fixing workflow  
**Agents**: 3 (Analyst, Executor, QA-Tester)  
**Steps**: 4 (analyze → reproduce → fix → verify)  
**Ideal For**: Bug fixes, error resolution, regression fixes

### Description
Methodical approach to bug resolution with verification:
- **Analyst**: Root cause analysis and impact assessment
- **Executor**: Implement fix with proper error handling
- **QA-Tester**: Verify fix and test edge cases

### Flow
```
1. Analyze → Investigate bug, identify root cause
   ↓
2. Reproduce → Create minimal reproduction case
   ↓
3. Fix → Implement solution with tests
   ↓
4. Verify → Validate fix across scenarios
```

### Use Cases
- Production bug fixes
- Regression testing
- Error handling improvements
- Edge case resolution

### Example Usage
```bash
samwise workflow BugFix --input '{
  "bug": "User login fails with 500 error",
  "logs": "Authentication service timeout",
  "affected_users": "All users in EU region"
}'
```

### Cost Estimate
- **Simple bugs**: $0.03 - $0.08
- **Complex bugs**: $0.10 - $0.25

---

## 3. RESTfulAPI - API Development Workflow

**File**: `recipes/RESTfulAPI.yaml`  
**Purpose**: Complete REST API design and implementation  
**Agents**: 4 (Architect, Designer, Executor, QA-Tester)  
**Steps**: 5 (design → spec → implement → test → document)  
**Ideal For**: API development, endpoint creation, service design

### Description
End-to-end API development from design to documentation:
- **Architect**: System design and architecture decisions
- **Designer**: API specifications (OpenAPI/Swagger)
- **Executor**: Endpoint implementation
- **QA-Tester**: API testing and validation

### Flow
```
1. Design → Architecture and data models
   ↓
2. Spec → OpenAPI specification
   ↓
3. Implement → Route handlers and middleware
   ↓
4. Test → Integration tests
   ↓
5. Document → API documentation
```

### Use Cases
- New API endpoints
- Microservice creation
- API versioning
- RESTful service design

### Example Usage
```bash
samwise workflow RESTfulAPI --input '{
  "service": "user-management-api",
  "endpoints": ["users", "sessions", "permissions"],
  "auth": "JWT",
  "database": "PostgreSQL"
}'
```

### Cost Estimate
- **Small API (1-3 endpoints)**: $0.15 - $0.30
- **Medium API (5-10 endpoints)**: $0.40 - $0.70
- **Large API (10+ endpoints)**: $0.80 - $1.50

---

## 4. MicroservicesArchitecture - System Architecture Design

**File**: `recipes/MicroservicesArchitecture.yaml`  
**Purpose**: Design and plan microservices architecture  
**Agents**: 3 (Architect, Researcher, Critic)  
**Steps**: 5 (analyze → design → review → optimize → document)  
**Ideal For**: System design, architecture planning, scalability analysis

### Description
Comprehensive architecture design process:
- **Architect**: Service boundaries and communication patterns
- **Researcher**: Technology stack recommendations
- **Critic**: Architecture review and tradeoff analysis

### Flow
```
1. Analyze → Requirements and constraints
   ↓
2. Design → Service decomposition
   ↓
3. Review → Architecture patterns review
   ↓
4. Optimize → Performance and scalability
   ↓
5. Document → Architecture documentation
```

### Use Cases
- Microservices migration
- System architecture design
- Scalability planning
- Technology stack selection

### Example Usage
```bash
samwise workflow MicroservicesArchitecture --input '{
  "system": "e-commerce platform",
  "scale": "100k concurrent users",
  "constraints": "cloud-native, event-driven",
  "services": ["auth", "catalog", "orders", "payments"]
}'
```

### Cost Estimate
- **Simple architecture**: $0.20 - $0.40
- **Complex architecture**: $0.50 - $1.00

---

## 5. SecurityAudit - Security Review Workflow

**File**: `recipes/SecurityAudit.yaml`  
**Purpose**: Comprehensive security audit and vulnerability assessment  
**Agents**: 3 (Researcher, Analyst, Critic)  
**Steps**: 4 (scan → analyze → remediate → verify)  
**Ideal For**: Security reviews, vulnerability fixes, compliance checks

### Description
Systematic security assessment:
- **Researcher**: Threat modeling and vulnerability research
- **Analyst**: Code analysis and security testing
- **Critic**: Risk assessment and prioritization

### Flow
```
1. Scan → Automated security scanning
   ↓
2. Analyze → Manual code review
   ↓
3. Remediate → Fix vulnerabilities
   ↓
4. Verify → Security validation
```

### Use Cases
- Pre-deployment security audit
- Vulnerability remediation
- Compliance validation (OWASP, etc.)
- Security best practices review

### Example Usage
```bash
samwise workflow SecurityAudit --input '{
  "target": "authentication-service",
  "scope": "OWASP Top 10",
  "severity": "high,critical"
}'
```

### Cost Estimate
- **Module audit**: $0.15 - $0.35
- **Full application audit**: $0.50 - $1.20

---

## 6. WebAppFullStack - Full-Stack Application Development

**File**: `recipes/WebAppFullStack.yaml`
**Purpose**: Complete full-stack web application development from scratch  
**Agents**: 5 (architect, designer, executor, critic, writer)  
**Steps**: 5 sequential  
**Ideal For**: New web application projects, end-to-end development

### Flow
```
1. Architect → Design system architecture
   - Technology stack selection
   - Database schema design
   - API structure planning
   - Infrastructure planning

2. Designer → Create UI/UX design
   - Mockup creation
   - Component design
   - User flow definition
   - Style guide creation

3. Executor → Implement full-stack application
   - Frontend implementation
   - Backend implementation
   - Database setup
   - Integration

4. Critic → QA and testing
   - Functionality testing
   - Performance testing
   - Security testing
   - Edge case handling

5. Writer → Create deployment guide
   - Deployment documentation
   - Configuration guide
   - User manual
   - API documentation
```

### Use Cases
- Building new web applications
- SaaS product development
- Enterprise web platforms
- Customer-facing applications
- Mobile-first web apps

### Variables
- `project_name`: Name of the project
- `project_description`: Project description
- `target_users`: Target user base
- `key_features`: Main features to implement
- `technology_preferences`: Preferred tech stack

### Outputs
- `architecture`: System architecture design
- `ui_design`: UI/UX mockups and designs
- `implementation`: Complete source code
- `test_results`: QA findings and test coverage
- `deployment_guide`: Deployment and setup documentation

### Advanced Features
- Cost constraints per stage (optional)
- Mode selection per step (e.g., ultrapilot for parallel design)
- Timeout configuration for long-running steps
- Retry logic for API integration issues

---

## 3. RESTfulAPI - Production REST API Design & Implementation

**File**: `recipes/RESTfulAPI.yaml`  
**Purpose**: Design and build production-grade REST API  
**Agents**: 4 (architect, executor, critic, writer)  
**Steps**: 4 sequential  
**Ideal For**: API development, backend services, microservices

### Flow
```
1. Architect → Design API specification
   - RESTful endpoint design
   - Resource structure
   - HTTP method planning
   - Status code definitions
   - Error handling strategy

2. Executor → Implement API endpoints
   - Route implementation
   - Business logic
   - Database integration
   - Error handling
   - Input validation

3. Critic → Testing and code review
   - Endpoint testing
   - Error scenario validation
   - Performance testing
   - Code quality review
   - Security review

4. Writer → Create API documentation
   - API reference
   - Endpoint documentation
   - Example requests/responses
   - Authentication guide
   - Rate limiting documentation
```

### Use Cases
- Building new REST APIs
- Microservice development
- Third-party API development
- Backend for mobile apps
- Backend for web applications

### Variables
- `api_name`: Name of the API
- `base_resources`: Primary resources to model
- `authentication_type`: Auth method (JWT, OAuth, etc.)
- `rate_limiting`: Rate limit strategy
- `api_version`: API version

### Outputs
- `api_specification`: Complete API specification
- `implementation`: API implementation code
- `test_results`: Test coverage and results
- `documentation`: Complete API documentation

### Features
- Retry logic for transient failures
- Cost tracking per endpoint
- Timeout protection
- Conditional skipping of steps

---

## 4. MicroservicesArchitecture - Distributed System Design

**File**: `recipes/MicroservicesArchitecture.yaml`  
**Purpose**: Design and implement microservices architecture  
**Agents**: 4 (architect, executor, critic, writer)  
**Steps**: 4 sequential  
**Ideal For**: Scalable systems, distributed architectures, enterprise platforms

### Flow
```
1. Architect → Service decomposition
   - Domain-driven design
   - Service boundary definition
   - Communication patterns
   - Data ownership
   - Deployment strategy

2. Executor → Implement services
   - Individual service implementation
   - Service communication layer
   - API gateway setup
   - Database per service
   - Containerization (Docker)

3. Critic → Integration testing
   - End-to-end testing
   - Service communication verification
   - Load balancing testing
   - Failure scenario handling
   - Performance profiling

4. Writer → Deployment documentation
   - Architecture diagram documentation
   - Service deployment guide
   - Configuration management guide
   - Monitoring setup guide
   - Scaling guide
```

### Use Cases
- Building scalable systems
- Distributed application development
- Enterprise microservices
- High-traffic systems
- Cloud-native applications

### Variables
- `system_name`: Name of the system
- `business_domains`: Business domains to decompose
- `scale_requirements`: Scaling requirements
- `deployment_target`: Cloud/on-premise target
- `communication_protocol`: Inter-service protocol (REST, gRPC, etc.)

### Outputs
- `architecture_design`: Complete architecture design
- `service_implementations`: All service implementations
- `integration_tests`: Integration test suite
- `deployment_guide`: Full deployment documentation

### Advanced Features
- Complex step dependencies
- Service communication patterns
- Conditional deployment strategies
- Cost tracking for distributed systems

---

## 5. SecurityAudit - Comprehensive Security Assessment

**File**: `recipes/SecurityAudit.yaml`  
**Purpose**: Comprehensive security assessment and hardening  
**Agents**: 4 (architect, critic, executor, writer)  
**Steps**: 4 sequential  
**Ideal For**: Security audits, compliance verification, hardening

### Flow
```
1. Architect → Create threat model
   - Threat identification
   - Attack surface mapping
   - Risk assessment
   - Mitigation strategy
   - Security requirements definition

2. Critic → Security code review
   - Source code analysis
   - Dependency scanning
   - API security review
   - Authentication/authorization review
   - Cryptography implementation review

3. Executor → Vulnerability assessment
   - Penetration testing
   - Dynamic security testing
   - Configuration review
   - Access control testing
   - Data protection verification

4. Writer → Remediation plan
   - Vulnerability documentation
   - Risk prioritization
   - Remediation recommendations
   - Implementation roadmap
   - Compliance checklist
```

### Use Cases
- Security audits
- Compliance verification (GDPR, HIPAA, SOC 2)
- Pre-launch security assessment
- Post-incident analysis
- Security hardening projects

### Variables
- `project_name`: Project to audit
- `compliance_requirements`: Needed compliance standards
- `data_sensitivity`: Data sensitivity level
- `deployment_environment`: Where system will run
- `audit_scope`: Scope of audit (full/partial)

### Outputs
- `threat_model`: Complete threat model
- `security_findings`: All security findings
- `vulnerability_report`: Detailed vulnerability report
- `remediation_plan`: Prioritized remediation plan

### Advanced Features
- Conditional steps based on compliance requirements
- Detailed findings aggregation
- Multi-stage risk assessment
- Compliance checklist generation

---

## Recipe Usage Examples

### Load and Execute a Pre-Built Recipe

```typescript
import { WorkflowEngine, RecipeLoader } from './src/workflows';

const loader = new RecipeLoader();
await loader.loadAllRecipes();

const engine = new WorkflowEngine();

// Get WebAppFullStack recipe
const recipe = loader.getRecipe('WebAppFullStack');

// Register the workflow from recipe
engine.registerWorkflow(recipe.workflow);

// Execute with variables
const result = await engine.executeWorkflow('WebAppFullStack', {
  project_name: 'MyAwesomeApp',
  project_description: 'A new web application',
  target_users: 'Small business owners',
  key_features: ['Dashboard', 'Reporting', 'Export'],
  technology_preferences: 'React, Node.js, PostgreSQL'
});

console.log('Project created!');
console.log('Cost: $' + result.cost.toFixed(2));
console.log('Duration: ' + (result.duration / 1000) + 's');
console.log('Outputs:', result.outputs);
```

### Customize a Pre-Built Recipe

```typescript
// Create custom version of a recipe
const customRecipe = loader.createRecipeFromTemplate({
  name: 'CustomSecurityAudit',
  baseRecipe: 'SecurityAudit',
  customizeVariables: {
    compliance_requirements: ['GDPR', 'PCI-DSS'],
    data_sensitivity: 'high',
    audit_scope: 'full'
  }
});

// Register and execute
engine.registerWorkflow(customRecipe.workflow);
const result = await engine.executeWorkflow('CustomSecurityAudit', {
  project_name: 'PaymentSystem',
  compliance_requirements: 'GDPR, PCI-DSS',
  data_sensitivity: 'high',
  deployment_environment: 'AWS',
  audit_scope: 'full'
});
```

### List Available Recipes

```typescript
const recipes = loader.listRecipes();

recipes.forEach(recipe => {
  console.log(`${recipe.name} v${recipe.version}`);
  console.log(`  Description: ${recipe.description}`);
  console.log(`  Tags: ${recipe.tags.join(', ')}`);
  console.log(`  Agents: ${recipe.workflow.agents.join(', ')}`);
  console.log(`  Steps: ${recipe.workflow.steps.length}`);
  console.log('');
});
```

---

## Recipe Features Summary

| Feature | PlanExecRevEx | WebAppFullStack | RESTfulAPI | Microservices | SecurityAudit |
|---------|---|---|---|---|---|
| **Agents** | 4 | 5 | 4 | 4 | 4 |
| **Steps** | 4 | 5 | 4 | 4 | 4 |
| **Variables** | 3 | 5+ | 5+ | 5+ | 5+ |
| **Cost Tracking** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Timeout Support** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Retry Logic** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Conditional Steps** | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Mode Selection** | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## Integration with CLI (Phase 8)

Future CLI commands will enable easy recipe execution:

```bash
# List available recipes
samwise list-recipes

# Execute a recipe with variables
samwise execute-recipe WebAppFullStack \
  --project_name "MyApp" \
  --framework "React" \
  --deployment "AWS"

# Create custom recipe
samwise create-recipe MyCustomRecipe \
  --base PlanExecRevEx \
  --variables "{...}"

# View recipe details
samwise describe-recipe WebAppFullStack

# Run workflow from YAML
samwise run-workflow ./my-workflow.yaml \
  --variables "{...}"
```

---

## Summary

The 5 pre-built recipes provide production-ready templates for:
- **Classic Development**: PlanExecRevEx
- **Full-Stack Development**: WebAppFullStack
- **API Development**: RESTfulAPI
- **Distributed Systems**: MicroservicesArchitecture
- **Security Assessment**: SecurityAudit

All recipes are:
- ✅ Fully tested (32 comprehensive tests)
- ✅ Ready for immediate use
- ✅ Customizable and extensible
- ✅ Documented with clear workflows
- ✅ Integrated with cost and duration tracking

---

**Phase 6 Recipes Complete** ✅ Ready for CLI integration and real-world use
