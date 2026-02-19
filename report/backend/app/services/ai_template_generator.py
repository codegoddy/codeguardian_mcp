"""
AI Template Generator Service using OpenRouter API
Generates project templates with milestones and deliverables based on user descriptions.
"""

import json
import logging
import re
from typing import ClassVar, Dict, List, Optional

import httpx

from app.core.config import settings

logger = logging.getLogger(__name__)


class AITemplateGenerator:
    """AI-powered template generation using OpenRouter"""

    # Shared HTTP client for connection reuse
    _client: ClassVar[Optional[httpx.AsyncClient]] = None

    def __init__(self):
        """Initialize OpenRouter API client"""
        self.api_key = settings.openrouter_api_key
        self.model = settings.ai_model
        self.base_url = "https://openrouter.ai/api/v1/chat/completions"

        if not self.api_key:
            logger.warning("OPENROUTER_API_KEY not configured - AI template generation will fail")
        else:
            logger.info(f"AI Template Generator initialized with OpenRouter ({self.model})")

    @classmethod
    async def get_client(cls) -> httpx.AsyncClient:
        """Get or create shared async HTTP client for connection reuse"""
        if cls._client is None or cls._client.is_closed:
            cls._client = httpx.AsyncClient(
                timeout=httpx.Timeout(120.0, connect=10.0),  # Longer timeout for complex generation
                limits=httpx.Limits(max_keepalive_connections=5),
                http2=True,
            )
        return cls._client

    def _extract_json_from_response(self, content: str) -> dict:
        """Extract JSON from AI response that may contain markdown or extra text"""
        if not content or not content.strip():
            raise json.JSONDecodeError("AI returned empty response", "", 0)

        # First, try to parse as-is
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            pass

        # Try to extract JSON from markdown code blocks
        code_block_pattern = r"```(?:json)?\s*([\s\S]*?)\s*```"
        matches = re.findall(code_block_pattern, content)
        if matches:
            for match in matches:
                try:
                    return json.loads(match.strip())
                except json.JSONDecodeError:
                    continue

        # Try to find JSON object starting with { and ending with }
        json_pattern = r"\{[\s\S]*\}"
        matches = re.findall(json_pattern, content)
        if matches:
            for match in sorted(matches, key=len, reverse=True):
                try:
                    return json.loads(match)
                except json.JSONDecodeError:
                    continue

        preview = content[:200] if len(content) > 200 else content
        raise json.JSONDecodeError(f"Could not extract valid JSON from AI response: {preview}", content, 0)

    async def generate_template(
        self,
        description: str,
        project_type: str = "code",
        category_hint: Optional[str] = None,
    ) -> dict:
        """
        Generate a project template based on user description.

        Args:
            description: User's description of the template they want
            project_type: 'code' or 'no-code'
            category_hint: Optional category hint (e.g., 'web_app', 'mobile', 'api')

        Returns:
            {
                'name': str,
                'description': str,
                'category': str,
                'template_type': str,
                'template_data': {
                    'default_hourly_rate': float,
                    'default_change_request_rate': float,
                    'max_revisions': int,
                    'milestones': [
                        {
                            'name': str,
                            'order': int,
                            'deliverables': [
                                {
                                    'title': str,
                                    'description': str,
                                    'estimated_hours': float,
                                    'acceptance_criteria': str
                                }
                            ]
                        }
                    ]
                }
            }
        """
        if not self.api_key:
            raise ValueError("OPENROUTER_API_KEY is not configured")

        logger.info(f"Generating template for: {description[:100]}...")

        prompt = self._build_generation_prompt(description, project_type, category_hint)

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "https://devhq.app",
            "X-Title": "DevHQ Template Generator",
        }

        payload = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": self._get_system_prompt()},
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.5,  # Balanced creativity and consistency
            "response_format": {"type": "json_object"},
        }

        try:
            client = await self.get_client()
            response = await client.post(self.base_url, headers=headers, json=payload)

            logger.info(f"OpenRouter response status: {response.status_code}")

            if response.status_code != 200:
                error_detail = response.text
                logger.error(f"OpenRouter API error ({response.status_code}): {error_detail}")
                raise Exception(f"AI API error: {error_detail}")

            result_data = response.json()
            content = result_data["choices"][0]["message"].get("content", "")

            if not content or content.strip() == "":
                logger.error(f"AI returned empty content. Full response: {result_data}")
                raise ValueError("AI returned empty response")

            logger.info(f"AI response received (first 500 chars): {content[:500]}")

            parsed = self._extract_json_from_response(content)

            # Validate and normalize the response
            template = self._normalize_template(parsed, project_type)

            logger.info(
                f"Template generated: {template['name']} with {len(template['template_data']['milestones'])} milestones"
            )

            return template

        except httpx.TimeoutException:
            logger.error("OpenRouter API timeout during template generation")
            raise ValueError("AI service timeout - please try again")
        except Exception as e:
            logger.error(f"Template generation failed: {e}", exc_info=True)
            raise

    def _get_system_prompt(self) -> str:
        """Get the system prompt for template generation"""
        return """You are an expert software project manager with 15+ years of experience creating project templates.

Your task is to generate detailed, realistic project templates with milestones and deliverables.

CRITICAL CONTEXT:
All estimates MUST be for a SINGLE intermediate-to-senior freelance developer working alone.
Do NOT estimate for a team.
Be conservative but realistic - account for context switching, solo debugging, and self-QA.

Key guidelines:
1. Create 3-5 milestones that represent logical project phases
2. Each milestone should have 2-5 deliverables
3. Estimated hours should be realistic for ONE person
4. Deliverable titles should be specific and actionable
5. Always include acceptance criteria for each deliverable
6. Consider dependencies and logical ordering

For CODE-BASED projects:
- Include setup/planning, development phases, testing, and deployment
- Account for code review (self-review), documentation, and technical debt
- Consider CI/CD, security, and performance optimization

For NO-CODE projects (WordPress, Webflow, etc.):
- Include design, configuration, content, and launch phases
- Account for plugin/integration setup
- Include client training and handoff

Always respond with valid JSON only."""

    def _build_generation_prompt(self, description: str, project_type: str, category_hint: Optional[str]) -> str:
        """Build the prompt for template generation"""

        category_context = ""
        if category_hint:
            category_context = f"\nSuggested category: {category_hint}"

        # Example structure to help the AI understand the format
        example_milestone = {
            "name": "Phase Name",
            "order": 1,
            "deliverables": [
                {
                    "title": "Specific deliverable title",
                    "description": "Detailed description of what this deliverable includes",
                    "estimated_hours": 8,
                    "acceptance_criteria": "Clear criteria for when this is complete",
                }
            ],
        }

        return f"""Generate a project template based on this description:

"{description}"

Project Type: {project_type}{category_context}
EXECUTION CONTEXT: Single Freelance Developer (Intermediate/Senior)

Return a JSON object with this exact structure:
{{
    "name": "Template Name (concise, e.g., 'E-commerce Web App')",
    "description": "Brief description of what this template covers",
    "category": "web_app|mobile_app|api|ecommerce|cms|dashboard|no_code|other",
    "template_data": {{
        "default_hourly_rate": 75.00,
        "default_change_request_rate": 100.00,
        "max_revisions": 3,
        "milestones": [
            {{
                "name": "Milestone Name",
                "order": 1,
                "deliverables": [
                    {{
                        "title": "Deliverable title",
                        "description": "What this includes",
                        "estimated_hours": 8,
                        "acceptance_criteria": "How to know it's done"
                    }}
                ]
            }}
        ]
    }}
}}

Example milestone structure:
{json.dumps(example_milestone, indent=2)}

Requirements:
1. Create 3-5 milestones with logical project flow
2. Each milestone needs 2-5 specific deliverables
3. Total hours should be realistic for ONE person (no team velocity)
4. Include comprehensive acceptance criteria
5. Deliverable descriptions should be detailed but concise
6. Order milestones logically (setup → development → testing → launch)

Generate the complete template now:"""

    def _normalize_template(self, parsed: dict, project_type: str) -> dict:
        """Validate and normalize the AI response into a proper template structure"""

        # Extract template_data (might be nested or at top level)
        if "template_data" in parsed:
            template_data = parsed["template_data"]
        else:
            # If milestones are at top level, construct template_data
            template_data = {
                "default_hourly_rate": parsed.get("default_hourly_rate", 75.0),
                "default_change_request_rate": parsed.get("default_change_request_rate", 100.0),
                "max_revisions": parsed.get("max_revisions", 3),
                "milestones": parsed.get("milestones", []),
            }

        # Ensure milestones is a list
        milestones = template_data.get("milestones", [])
        if not isinstance(milestones, list):
            milestones = []

        # Normalize each milestone
        normalized_milestones = []
        for i, milestone in enumerate(milestones):
            normalized_milestone = {
                "name": milestone.get("name", f"Milestone {i + 1}"),
                "order": milestone.get("order", i + 1),
                "deliverables": [],
            }

            deliverables = milestone.get("deliverables", [])
            if not isinstance(deliverables, list):
                deliverables = []

            for deliverable in deliverables:
                normalized_deliverable = {
                    "title": deliverable.get("title", "Untitled Deliverable"),
                    "description": deliverable.get("description", ""),
                    "estimated_hours": float(deliverable.get("estimated_hours", 4)),
                    "acceptance_criteria": deliverable.get("acceptance_criteria", "To be defined"),
                }
                normalized_milestone["deliverables"].append(normalized_deliverable)

            # Ensure at least one deliverable per milestone
            if not normalized_milestone["deliverables"]:
                normalized_milestone["deliverables"].append(
                    {
                        "title": "Define deliverables",
                        "description": "Specify the deliverables for this milestone",
                        "estimated_hours": 2,
                        "acceptance_criteria": "Deliverables defined and documented",
                    }
                )

            normalized_milestones.append(normalized_milestone)

        # Ensure at least one milestone
        if not normalized_milestones:
            normalized_milestones = [
                {
                    "name": "Project Setup",
                    "order": 1,
                    "deliverables": [
                        {
                            "title": "Initial setup and planning",
                            "description": "Set up the project foundation",
                            "estimated_hours": 4,
                            "acceptance_criteria": "Project structure created",
                        }
                    ],
                }
            ]

        return {
            "name": parsed.get("name", "Custom Template"),
            "description": parsed.get("description", "AI-generated project template"),
            "category": parsed.get("category", "other"),
            "template_type": project_type,
            "template_data": {
                "default_hourly_rate": float(template_data.get("default_hourly_rate", 75.0)),
                "default_change_request_rate": float(template_data.get("default_change_request_rate", 100.0)),
                "max_revisions": int(template_data.get("max_revisions", 3)),
                "milestones": normalized_milestones,
            },
        }
