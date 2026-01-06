
import { preventHallucinationsTool } from '../../src/tools/preventHallucinations';
import { describe, expect, test } from '@jest/globals';

const PYTHON_CODE_V2 = `
import json
import httpx
from app.core.logging_config import get_logger

class AIEstimator:
    def __init__(self):
        self.logger = get_logger()
        self.client = httpx.AsyncClient(
            timeout=httpx.Timeout(10.0),
            limits=httpx.Limits(max_keepalive_connections=5)
        )

    def _get_user_historical_data(self, user_id):
        return []

    def _estimate_batch_deliverables(self, items):
        return len(items)

    async def estimate(self, user_id, prompt):
        # String literal check
        provider = "OpenRouter"
        
        try:
            history = self._get_user_historical_data(user_id)
            history.append("new_item")
            
            clean_prompt = prompt.strip()
            
            result = self._estimate_batch_deliverables(history)
            
        except json.JSONDecodeError:
            self.logger.error("Failed to decode")
        
        return result
`;

const TYPESCRIPT_CODE_V2 = `
interface RiskFactor {
  level: string;
}

interface TemplateData {
  id: string;
}

interface DeliverableEstimate {
  hours: number;
}

interface BudgetAnalysis {
  total: number;
}

function aiApiCall(prompt: string): Promise<string> {
  return Promise.resolve("result");
}

export class AIEstimator {
  async estimate(): Promise<BudgetAnalysis> {
    const risk: RiskFactor = { level: "high" };
    const data: TemplateData = { id: "123" };
    
    await aiApiCall("test");
    
    const est: DeliverableEstimate = { hours: 10 };
    
    return { total: 100 };
  }
}
`;

describe('Hallucination Tool Fixes V2', () => {
  test('should not report false positives for Python class methods, strings, and httpx', async () => {
    const result = await preventHallucinationsTool.handler({
      codebase: PYTHON_CODE_V2,
      newCode: PYTHON_CODE_V2,
      language: 'python',
      options: { checkNonExistentReferences: true }
    });

    const content = JSON.parse(result.content[0].text);
    if (content.issues.length > 0) {
      console.log('Python V2 Issues:', JSON.stringify(content.issues, null, 2));
    }
    expect(content.issues).toHaveLength(0);
  });

  test('should not report false positives for TypeScript interfaces and complex return types', async () => {
    const result = await preventHallucinationsTool.handler({
      codebase: TYPESCRIPT_CODE_V2,
      newCode: TYPESCRIPT_CODE_V2,
      language: 'typescript',
      options: { checkNonExistentReferences: true }
    });

    const content = JSON.parse(result.content[0].text);
    if (content.issues.length > 0) {
      console.log('TypeScript V2 Issues:', JSON.stringify(content.issues, null, 2));
    }
    expect(content.issues).toHaveLength(0);
  });
});
