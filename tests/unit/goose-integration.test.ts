import { describe, it, expect, beforeEach } from 'vitest';
import { ConfigLoader } from '../../src/config/config-loader';
import type { AppConfig } from '../../src/utils/types';
import { initializeSkills, registerSkillsAsTools } from '../../src/skills';
import { skillRegistry } from '../../src/skills/skill-framework';
import { AgentExecutor } from '../../src/agents/agent-executor';
import type { Agent, AgentExecutionContext } from '../../src/agents/types';

const baseConfig: AppConfig = {
  routing: {
    simple: ['grok-3-mini'],
    medium: ['grok-3'],
    complex: ['grok-3'],
    explain: ['grok-3'],
  },
  goose: {
    api_keys: {
      anthropic: '',
      openai: '',
      google: '',
      xai: '',
    },
    mcp_defaults: {
      temperature: 0.7,
      max_tokens: 2000,
    },
  },
};

describe('Goose Integration - Auth & MCP Tools', () => {
  it('should report missing API keys when not configured', () => {
    const missing = ConfigLoader.validateApiKeys(baseConfig, [
      'anthropic',
      'openai',
      'google',
      'xai',
    ]);

    expect(missing).toContain('anthropic');
    expect(missing).toContain('openai');
    expect(missing).toContain('google');
    expect(missing).toContain('xai');
  });

  it('should treat configured API keys as present', () => {
    const config: AppConfig = {
      ...baseConfig,
      goose: {
        ...baseConfig.goose,
        api_keys: {
          anthropic: 'test-key',
          openai: 'test-key',
          google: 'test-key',
          xai: 'test-key',
        },
      },
    };

    const missing = ConfigLoader.validateApiKeys(config, [
      'anthropic',
      'openai',
      'google',
      'xai',
    ]);

    expect(missing).toHaveLength(0);
  });

  it('should register skills as MCP tools', async () => {
    skillRegistry.clear();
    await initializeSkills();

    const tools: Record<string, {
      name: string;
      description: string;
      handler: (args: Record<string, unknown>) => Promise<unknown>;
      inputSchema?: Record<string, unknown>;
    }> = {};

    registerSkillsAsTools((name, description, handler, inputSchema) => {
      tools[name] = { name, description, handler, inputSchema };
    });

    expect(Object.keys(tools)).toContain('refactoring');
    expect(Object.keys(tools)).toContain('documentation');
    expect(Object.keys(tools)).toContain('testing');
    expect(Object.keys(tools)).toContain('security_scan');
    expect(Object.keys(tools)).toContain('performance');

    const result = await tools.refactoring.handler({
      code: 'function test() { return true; }',
      focus: 'readability',
    });

    const response = result as { success?: boolean };
    expect(response?.success).toBe(true);
  });
});

describe('Goose Integration - Agent Execution Wiring', () => {
  const agent: Agent = {
    id: 'agent-1',
    name: 'architect',
    role_prompt: 'Design system architecture',
    recommended_model: 'grok-3',
    model: 'grok-3',
    provider: 'xai',
    temperature: 0.6,
    tools: ['search'],
    skills: ['refactoring'],
    loaded_at: new Date(),
  };

  beforeEach(() => {
    skillRegistry.clear();
  });

  it('should map agent config to session params and prompt', async () => {
    const captured: { params?: unknown; prompt?: unknown } = {};

    const executor = new AgentExecutor(async (params, prompt) => {
      captured.params = params;
      captured.prompt = prompt;
      return { output: 'ok', status: 'success' };
    });

    const context: AgentExecutionContext = {
      agent,
      task: 'Design API',
      user_input: 'Build a scalable REST API',
      session_id: 'session-123',
      mode: 'ultrapilot',
      tools: ['code'],
      skills: ['documentation'],
      parent_result: 'previous result',
      promptTemplate: 'Task: {{task}} User: {{user_input}} Agent: {{agent_name}} Prev: {{parent_result}}',
    };

    const result = await executor.execute(context);

    expect(result.output).toBe('ok');

    const params = captured.params as {
      model: string;
      temperature: number;
      tools: string[];
      skills: string[];
      system_prompt: string;
    };

    expect(params.model).toBe('grok-3');
    expect(params.temperature).toBe(0.6);
    expect(params.tools).toEqual(expect.arrayContaining(['search', 'code']));
    expect(params.skills).toEqual(expect.arrayContaining(['refactoring', 'documentation']));
    expect(params.system_prompt).toContain('Design system architecture');

    const prompt = captured.prompt as { user: string };
    expect(prompt.user).toContain('Design API');
    expect(prompt.user).toContain('Build a scalable REST API');
    expect(prompt.user).toContain('architect');
    expect(prompt.user).toContain('previous result');
  });
});
