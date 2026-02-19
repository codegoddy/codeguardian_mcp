"""
AI-Powered Scheduling Service
Generates intelligent work schedules using AI to optimize deliverable scheduling.
"""

import json
import logging
import re
from datetime import date, datetime, time, timedelta
from typing import Dict, List, Optional
from uuid import UUID

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.deliverable import Deliverable
from app.models.planned_time_block import PlannedTimeBlock
from app.models.project import Project

logger = logging.getLogger(__name__)


class AIScheduler:
    """AI-powered intelligent scheduling service"""

    def __init__(self):
        """Initialize AI scheduler with OpenRouter"""
        self.api_key = settings.openrouter_api_key
        self.model = settings.ai_model
        self.base_url = "https://openrouter.ai/api/v1/chat/completions"

        if not self.api_key:
            logger.warning("OPENROUTER_API_KEY not configured - AI scheduling will use fallback")
        else:
            logger.info(f"AI Scheduler initialized with {self.model}")

    def _extract_json_from_response(self, content: str) -> Dict:
        """Extract JSON from AI response that may contain markdown or extra text"""
        # Check for empty or None content
        if not content or content.strip() == "":
            raise json.JSONDecodeError("AI returned empty response", "", 0)

        # First, try to parse as-is
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            pass

        # Try to extract JSON from markdown code blocks
        # Match ```json ... ``` or ``` ... ```
        code_block_pattern = r"```(?:json)?\s*([\s\S]*?)\s*```"
        matches = re.findall(code_block_pattern, content)
        if matches:
            for match in matches:
                try:
                    return json.loads(match.strip())
                except json.JSONDecodeError:
                    continue

        # Try to find JSON object starting with { and ending with }
        # This handles cases where there's text before/after the JSON
        json_pattern = r"\{[\s\S]*\}"
        matches = re.findall(json_pattern, content)
        if matches:
            # Try from longest to shortest match (most complete JSON first)
            for match in sorted(matches, key=len, reverse=True):
                try:
                    return json.loads(match)
                except json.JSONDecodeError:
                    continue

        # If all else fails, raise error with content preview
        preview = content[:200] if len(content) > 200 else content
        raise json.JSONDecodeError(
            f"Could not extract valid JSON from AI response. Content preview: {preview}",
            content,
            0,
        )

    async def generate_smart_schedule(
        self,
        deliverable_ids: List[UUID],
        start_date: date,
        end_date: date,
        preferences: Dict,
        user_id: UUID,
        db: AsyncSession,
    ) -> Dict:
        """
        Generate AI-optimized work schedule

        Args:
            deliverable_ids: List of deliverable UUIDs to schedule
            start_date: Schedule start date
            end_date: Schedule end date
            preferences: User scheduling preferences
            user_id: User ID for historical data
            db: Database session

        Returns:
            {
                'schedule': List[PlannedBlock],
                'analysis': {
                    'feasibility': 'aggressive' | 'realistic' | 'comfortable',
                    'total_hours': float,
                    'buffer_hours': float,
                    'confidence': int,
                    'warnings': List[str],
                    'recommendations': List[str]
                }
            }
        """
        logger.info(f"Generating AI schedule for {len(deliverable_ids)} deliverables")

        # Ensure start_date is not in the past
        today = date.today()
        if start_date < today:
            logger.info(f"Adjusting start_date from {start_date} to {today} (cannot schedule in past)")
            start_date = today

        # Ensure end_date is after start_date
        if end_date <= start_date:
            end_date = start_date + timedelta(days=7)
            logger.info(f"Adjusted end_date to {end_date}")

        # Get deliverables with project context
        deliverables_result = await db.execute(
            select(Deliverable).join(Project).where(Deliverable.id.in_(deliverable_ids), Project.user_id == user_id)
        )
        deliverables = deliverables_result.scalars().all()

        if not deliverables:
            raise ValueError("No valid deliverables found")

        # Calculate deliverable details
        deliverable_data = []
        total_hours_needed = 0

        for deliverable in deliverables:
            hours_tracked = float(deliverable.actual_hours or 0)
            estimated_hours = float(deliverable.estimated_hours or 0)
            hours_remaining = max(0, estimated_hours - hours_tracked)

            if hours_remaining > 0:
                priority_map = {"high": 1, "medium": 2, "low": 3}
                deliverable_data.append(
                    {
                        "id": str(deliverable.id),
                        "project_id": str(deliverable.project_id),
                        "title": deliverable.title,
                        "description": deliverable.description or "",
                        "hours_remaining": hours_remaining,
                        "priority": deliverable.priority or "medium",
                        "priority_score": priority_map.get(deliverable.priority or "medium", 2),
                        "deadline": (deliverable.deadline.isoformat() if deliverable.deadline else None),
                        "status": deliverable.status,
                    }
                )
                total_hours_needed += hours_remaining

        # Calculate available days
        days_available = (end_date - start_date).days + 1
        working_days = sum(1 for i in range(days_available) if (start_date + timedelta(days=i)).weekday() < 5)

        # Get user's historical velocity
        historical_data = await self._get_user_historical_velocity(user_id, db)

        # Extract preferences
        max_daily_hours = preferences.get("max_daily_hours", 8)
        work_pattern = preferences.get("work_pattern", "balanced")
        include_buffer = preferences.get("include_buffer", True)

        # Use AI to generate optimal schedule
        try:
            schedule_result = await self._generate_ai_schedule(
                deliverables=deliverable_data,
                start_date=start_date,
                end_date=end_date,
                working_days=working_days,
                max_daily_hours=max_daily_hours,
                work_pattern=work_pattern,
                include_buffer=include_buffer,
                historical_data=historical_data,
            )

            # Prepare preview blocks (don't save to DB - user must click Apply)
            preview_blocks = self._prepare_schedule_preview(schedule_result["schedule"], deliverable_data)

            return {"schedule": preview_blocks, "analysis": schedule_result["analysis"]}

        except Exception as e:
            logger.error(f"AI scheduling failed: {e}, using fallback algorithm")
            # Fallback to smart rule-based scheduling
            return await self._fallback_smart_schedule(
                deliverable_data,
                start_date,
                end_date,
                max_daily_hours,
                include_buffer,
                user_id,
                db,
            )

    async def _generate_ai_schedule(
        self,
        deliverables: List[Dict],
        start_date: date,
        end_date: date,
        working_days: int,
        max_daily_hours: float,
        work_pattern: str,
        include_buffer: bool,
        historical_data: Dict,
    ) -> Dict:
        """Use AI to generate optimal schedule"""

        # Build AI prompt - include IDs and EXACT hours to use
        deliverable_list = "\n".join(
            [
                f"  - ID: {d['id']}\n    Title: {d['title']}\n    Hours Remaining: {d['hours_remaining']}h (USE THIS EXACT AMOUNT)\n    Priority: {d['priority']}\n    Deadline: {d['deadline'] or 'None'}"
                for d in deliverables
            ]
        )

        total_hours = sum(d["hours_remaining"] for d in deliverables)
        max_capacity = working_days * max_daily_hours

        # Determine if we need weekends
        include_weekends = total_hours > max_capacity

        work_pattern_guidance = {
            "focused": "3-4 hour blocks with minimal task switching. Deep work sessions.",
            "balanced": "2-3 hour blocks with moderate variety. Mix of deep and light work.",
            "flexible": "1-2 hour blocks with more variety. Frequent task switching is OK.",
        }

        prompt = f"""You are an expert project scheduler. Create a work schedule that distributes the EXACT hours specified for each deliverable.

**CRITICAL RULES - MUST FOLLOW:**
1. ONLY schedule dates from {start_date} to {end_date} - NEVER schedule before {start_date}
2. Use the EXACT "Hours Remaining" for each deliverable - DO NOT change or make up hours
3. Schedule ALL {len(deliverables)} deliverables listed below - do not skip any
4. Each deliverable should appear ONLY ONCE per day (split across multiple days if needed)
5. Total scheduled hours MUST equal {total_hours:.1f}h (sum of all deliverables)
6. {"Include weekends (Sat/Sun) since timeline is tight" if include_weekends else "Skip weekends (Sat/Sun)"}
7. Maximum {max_daily_hours}h per day per deliverable block

**Project Context:**
- Date Range: {start_date} to {end_date} ({working_days} working days)
- Total Hours to Schedule: {total_hours:.1f}h
- Max Daily Work Hours: {max_daily_hours}h/day
- Work Pattern: {work_pattern} - {work_pattern_guidance[work_pattern]}
{"- Buffer: Add 20% extra time" if include_buffer else ""}

**Deliverables to Schedule ({len(deliverables)} total - SCHEDULE ALL):**
{deliverable_list}

**How to Split Work:**
- If a deliverable has 8h, split into two 4h blocks on different days
- If a deliverable has 16h, split into four 4h blocks on different days
- Use morning (09:00-13:00) for high priority, afternoon (14:00-18:00) for others

**IMPORTANT:**
- Use EXACT deliverable_id values from above
- Use EXACT hours_remaining values - DO NOT invent different hours
- Start from {start_date}, NOT before
- Include ALL deliverables

Respond ONLY with valid JSON:
{{
  "schedule": [
    {{
      "deliverable_id": "<exact ID>",
      "title": "<exact title>",
      "planned_date": "YYYY-MM-DD",
      "start_time": "HH:MM",
      "end_time": "HH:MM",
      "planned_hours": <use portion of hours_remaining>,
      "reasoning": "brief reason"
    }}
  ],
  "analysis": {{
    "feasibility": "realistic|aggressive|comfortable",
    "total_scheduled_hours": {total_hours:.1f},
    "buffer_hours": 0,
    "confidence": 85,
    "warnings": [],
    "recommendations": []
  }}
}}"""

        try:
            async with httpx.AsyncClient(timeout=90.0) as client:
                response = await client.post(
                    self.base_url,
                    headers={
                        "Authorization": f"Bearer {self.api_key}",
                        "Content-Type": "application/json",
                        "HTTP-Referer": "https://devhq.app",
                    },
                    json={
                        "model": self.model,
                        "messages": [{"role": "user", "content": prompt}],
                        "temperature": 0.3,  # Lower temperature for more consistent scheduling
                        "max_tokens": 4000,  # Increased for larger schedules
                    },
                )

                if response.status_code == 200:
                    result = response.json()
                    content = result["choices"][0]["message"]["content"]

                    # Log the raw response for debugging
                    logger.info(f"AI raw response (first 500 chars): {content[:500] if content else 'EMPTY'}")

                    # Parse JSON response (handle markdown wrapping, etc.)
                    schedule_data = self._extract_json_from_response(content)

                    logger.info(f"AI generated schedule with {len(schedule_data['schedule'])} blocks")
                    return schedule_data
                else:
                    logger.error(f"AI API error: {response.status_code} - {response.text}")
                    raise Exception(f"AI API failed with status {response.status_code}")

        except Exception as e:
            logger.error(f"AI scheduling error: {e}")
            raise

    def _prepare_schedule_preview(self, schedule: List[Dict], deliverable_data: List[Dict]) -> List[Dict]:
        """Prepare preview blocks without saving to database."""

        preview_blocks = []
        deliverable_map = {d["id"]: d for d in deliverable_data}
        title_map = {d["title"].lower().strip(): d for d in deliverable_data}

        for block_data in schedule:
            deliverable_id = block_data.get("deliverable_id", "")
            deliverable = deliverable_map.get(deliverable_id)

            # Fallback: try to match by title if ID doesn't match
            if not deliverable:
                block_title = block_data.get("title", "").lower().strip()
                deliverable = title_map.get(block_title)

                # Try partial matching if exact match fails
                if not deliverable:
                    for title, d in title_map.items():
                        if title in block_title or block_title in title:
                            deliverable = d
                            deliverable_id = d["id"]
                            break
                elif deliverable:
                    deliverable_id = deliverable["id"]

            if not deliverable:
                logger.warning(f"Deliverable {deliverable_id} not found in preview map")
                continue

            # Add to preview (no database operations)
            preview_blocks.append(
                {
                    "deliverable_id": deliverable_id,
                    "deliverable_title": deliverable["title"],
                    "planned_date": block_data["planned_date"],
                    "start_time": block_data["start_time"],
                    "end_time": block_data["end_time"],
                    "planned_hours": block_data["planned_hours"],
                    "reasoning": block_data.get("reasoning", f"AI-scheduled work on {deliverable['title']}"),
                }
            )

        return preview_blocks

    async def _create_planned_blocks(
        self,
        schedule: List[Dict],
        deliverable_data: List[Dict],
        user_id: UUID,
        db: AsyncSession,
    ) -> List[Dict]:
        """Create PlannedTimeBlock objects from AI schedule"""

        planned_blocks = []
        deliverable_map = {d["id"]: d for d in deliverable_data}
        # Also create a title-based map for fallback matching
        title_map = {d["title"].lower().strip(): d for d in deliverable_data}

        for block_data in schedule:
            deliverable_id = block_data.get("deliverable_id", "")
            deliverable = deliverable_map.get(deliverable_id)

            # Fallback: try to match by title if ID doesn't match
            if not deliverable:
                block_title = block_data.get("title", "").lower().strip()
                deliverable = title_map.get(block_title)

                # Try partial matching if exact match fails
                if not deliverable:
                    for title, d in title_map.items():
                        if title in block_title or block_title in title:
                            deliverable = d
                            deliverable_id = d["id"]
                            logger.info(f"Matched by title: '{block_title}' -> '{d['title']}'")
                            break
                else:
                    deliverable_id = deliverable["id"]
                    logger.info(f"Matched by exact title: '{block_title}'")

            if not deliverable:
                logger.warning(f"Deliverable {deliverable_id} not found in map")
                continue

            # Parse date and times
            planned_date = datetime.fromisoformat(block_data["planned_date"]).date()
            start_time_obj = datetime.strptime(block_data["start_time"], "%H:%M").time()
            end_time_obj = datetime.strptime(block_data["end_time"], "%H:%M").time()

            # Create planned block
            block = PlannedTimeBlock(
                user_id=user_id,
                project_id=UUID(deliverable["project_id"]),
                deliverable_id=UUID(deliverable_id),
                planned_date=planned_date,
                start_time=start_time_obj,
                end_time=end_time_obj,
                planned_hours=block_data["planned_hours"],
                description=block_data.get("reasoning", f"AI-scheduled work on {deliverable['title']}"),
                status="planned",
            )

            db.add(block)
            planned_blocks.append(
                {
                    "deliverable_id": deliverable_id,
                    "deliverable_title": deliverable["title"],
                    "planned_date": block_data["planned_date"],
                    "start_time": block_data["start_time"],
                    "end_time": block_data["end_time"],
                    "planned_hours": block_data["planned_hours"],
                    "reasoning": block_data.get("reasoning", ""),
                }
            )

        await db.commit()

        return planned_blocks

    async def _fallback_smart_schedule(
        self,
        deliverable_data: List[Dict],
        start_date: date,
        end_date: date,
        max_daily_hours: float,
        include_buffer: bool,
        user_id: UUID,
        db: AsyncSession,
    ) -> Dict:
        """Smart rule-based scheduling fallback when AI fails"""

        logger.info("Using smart fallback scheduling algorithm")

        # Sort by priority then deadline
        sorted_deliverables = sorted(
            deliverable_data,
            key=lambda x: (x["priority_score"], x["deadline"] or "9999-12-31"),
        )

        # Calculate buffer
        total_hours = sum(d["hours_remaining"] for d in sorted_deliverables)
        if include_buffer:
            buffer_percentage = 0.20
            total_with_buffer = total_hours * (1 + buffer_percentage)
        else:
            buffer_percentage = 0
            total_with_buffer = total_hours

        # Smart work block sizing based on complexity
        def get_optimal_block_size(hours_remaining: float, title: str) -> float:
            # Complex keywords suggest smaller blocks
            complex_keywords = [
                "ai",
                "ml",
                "algorithm",
                "architecture",
                "design",
                "integration",
            ]
            is_complex = any(kw in title.lower() for kw in complex_keywords)

            if is_complex:
                return min(hours_remaining, 3.0)  # Max 3h for complex tasks
            else:
                return min(hours_remaining, 5.0)  # Max 5h for simpler tasks

        # Generate schedule
        schedule = []
        current_date = start_date

        for deliverable in sorted_deliverables:
            remaining_hours = deliverable["hours_remaining"]

            while remaining_hours > 0 and current_date <= end_date:
                # Skip weekends
                if current_date.weekday() >= 5:
                    current_date += timedelta(days=1)
                    continue

                # Determine optimal block size
                block_hours = get_optimal_block_size(remaining_hours, deliverable["title"])

                # Create time block
                # High priority in morning, lower priority in afternoon
                if deliverable["priority"] == "high":
                    start_time = time(9, 0)
                else:
                    start_time = time(13, 0)

                end_hour = start_time.hour + int(block_hours)
                end_minute = int((block_hours % 1) * 60)
                end_time = time(min(end_hour, 17), end_minute)

                schedule.append(
                    {
                        "deliverable_id": deliverable["id"],
                        "deliverable_title": deliverable["title"],
                        "planned_date": current_date.isoformat(),
                        "start_time": start_time.strftime("%H:%M"),
                        "end_time": end_time.strftime("%H:%M"),
                        "planned_hours": block_hours,
                        "reasoning": f"Priority: {deliverable['priority']}, scheduled in optimal time block",
                    }
                )

                remaining_hours -= block_hours
                current_date += timedelta(days=1)

        # Create planned blocks
        planned_blocks = []
        for block_data in schedule:
            planned_date = datetime.fromisoformat(block_data["planned_date"]).date()
            start_time_obj = datetime.strptime(block_data["start_time"], "%H:%M").time()
            end_time_obj = datetime.strptime(block_data["end_time"], "%H:%M").time()

            deliverable = next(d for d in deliverable_data if d["id"] == block_data["deliverable_id"])

            block = PlannedTimeBlock(
                user_id=user_id,
                project_id=UUID(deliverable["project_id"]),
                deliverable_id=UUID(block_data["deliverable_id"]),
                planned_date=planned_date,
                start_time=start_time_obj,
                end_time=end_time_obj,
                planned_hours=block_data["planned_hours"],
                description=block_data["reasoning"],
                status="planned",
            )

            db.add(block)
            planned_blocks.append(block_data)

        await db.commit()

        # Generate analysis
        days_scheduled = len(set(b["planned_date"] for b in schedule))
        working_days = sum(
            1 for i in range((end_date - start_date).days + 1) if (start_date + timedelta(days=i)).weekday() < 5
        )

        feasibility = (
            "comfortable"
            if days_scheduled < working_days * 0.8
            else "realistic" if days_scheduled <= working_days else "aggressive"
        )

        total_scheduled = sum(b["planned_hours"] for b in schedule)
        buffer_hours = total_scheduled - total_hours

        warnings = []
        recommendations = []

        if days_scheduled > working_days:
            warnings.append("⚠️ Timeline is tight - schedule extends beyond available days")
            recommendations.append("Consider extending end date by 2-3 days")

        if buffer_hours < total_hours * 0.15:
            warnings.append("⚠️ Limited buffer time - unexpected issues may cause delays")
            recommendations.append("Add at least 20% buffer time for unknowns")

        return {
            "schedule": planned_blocks,
            "analysis": {
                "feasibility": feasibility,
                "total_scheduled_hours": round(total_scheduled, 1),
                "buffer_hours": round(buffer_hours, 1),
                "confidence": 75,  # Fallback has lower confidence
                "warnings": warnings,
                "recommendations": recommendations,
            },
        }

    async def _get_user_historical_velocity(self, user_id: UUID, db: AsyncSession) -> Dict:
        """Get user's historical project completion velocity"""

        # Get completed deliverables from last 3 months
        three_months_ago = datetime.now() - timedelta(days=90)

        result = await db.execute(
            select(Deliverable)
            .join(Project)
            .where(
                Project.user_id == user_id,
                Deliverable.status == "completed",
                Deliverable.updated_at >= three_months_ago,
            )
        )
        completed_deliverables = result.scalars().all()

        if not completed_deliverables:
            return {"avg_velocity": 1.0, "sample_size": 0}

        # Calculate average velocity (actual_hours / estimated_hours)
        velocities = []
        for deliverable in completed_deliverables:
            if deliverable.estimated_hours and deliverable.estimated_hours > 0:
                velocity = (deliverable.actual_hours or 0) / deliverable.estimated_hours
                velocities.append(velocity)

        avg_velocity = sum(velocities) / len(velocities) if velocities else 1.0

        return {"avg_velocity": avg_velocity, "sample_size": len(velocities)}
