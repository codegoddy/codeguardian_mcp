
import { preventHallucinationsTool } from '../../src/tools/preventHallucinations';
import { describe, expect, test } from '@jest/globals';

const VALID_PYTHON_CODE = `
import traceback
import hmac
import uuid
from datetime import datetime
from app.utils.currency import format_currency
from app.db import db
from flask import request

def test_contract_email(payload):
    try:
        # Standard lib usage
        trace = traceback.format_exc()
        digest = hmac.new(b'key', b'msg', 'sha256').hexdigest()
        uid = uuid.UUID('12345678-1234-5678-1234-567812345678')
        now = datetime.utcnow()
        
        # Object methods (SQLAlchemy-like)
        db.execute("SELECT * FROM users")
        result = db.scalars("SELECT * FROM users")
        db.commit()
        
        # Request object
        body = request.body
        
        # Custom import
        price = format_currency(100)
        
        # Argument method call (accepted via lenient unknown object policy)
        val = payload.get('key')
        
    except Exception as e:
        print(f"Error: {e}")
`;

describe('Hallucination Tool Fixes', () => {
  test('should not report false positives for standard library and valid methods', async () => {
    const result = await preventHallucinationsTool.handler({
      codebase: VALID_PYTHON_CODE,
      newCode: VALID_PYTHON_CODE,
      language: 'python',
      options: {
        checkNonExistentReferences: true
      }
    });

    const content = JSON.parse(result.content[0].text);
    
    // Log issues for debugging if any
    if (content.issues.length > 0) {
      console.log('Found issues:', JSON.stringify(content.issues, null, 2));
    }

    expect(content.hallucinationDetected).toBe(false);
    expect(content.hallucinationScore).toBe(0);
    expect(content.issues).toHaveLength(0);
  });
});
