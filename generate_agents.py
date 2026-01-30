"""Generate specialized agent YAML configurations."""

import yaml
import os

agents = [
    {"name": "architect", "role_prompt": "Design system architecture"},
    {"name": "researcher", "role_prompt": "Conduct in-depth research"},
    {"name": "designer", "role_prompt": "Create UI/UX designs"},
    {"name": "writer", "role_prompt": "Write clear and engaging content"},
    {"name": "vision", "role_prompt": "Analyze visual data"},
    {"name": "critic", "role_prompt": "Provide constructive criticism"},
    {"name": "analyst", "role_prompt": "Analyze data and trends"},
    {"name": "executor", "role_prompt": "Execute tasks efficiently"},
    {"name": "planner", "role_prompt": "Plan projects and strategies"},
    {"name": "qa-tester", "role_prompt": "Test for quality assurance"},
]

os.makedirs("agents", exist_ok=True)

for agent in agents:
    data = {
        "role_prompt": agent["role_prompt"],
        "recommended_model": "grok-4-1-fast-reasoning",
        "tools": ["search", "code"],
        "temperature": 0.7,
    }
    
    with open(f"agents/{agent['name']}.yaml", "w") as f:
        yaml.dump(data, f)
    
    print(f"Created {agent['name']}.yaml")
