# API Contract Guardian

## Overview

API Contract Guardian is a revolutionary feature for CodeGuardian that validates API contracts between frontend and backend in real-time. It detects mismatches before they cause runtime errors, making it perfect for vibecoders who work with AI-generated full-stack code.

## The Problem

When coding with AI, a common pattern emerges:
1. AI generates a backend API route with specific parameters
2. AI generates frontend code that calls the API
3. **Mismatch!** Parameter names differ (`userId` vs `user_id`), types don't match, or endpoints are wrong
4. Developer only discovers this at runtime with 400 Bad Request errors
5. Time wasted debugging what should have been caught immediately

## The Solution

API Contract Guardian automatically:
- Detects frontend/backend project structure
- Extracts API definitions from both sides
- Validates contracts in real-time as you code
- Reports mismatches with specific suggestions
- Works with any frontend/backend combination

## Key Features

### 1. Auto-Detection
- Zero configuration required
- Automatically identifies frontend (Next.js, React, Vue, etc.)
- Automatically identifies backend (FastAPI, Express, Flask, etc.)
- Links them based on configuration files and patterns

### 2. Real-Time Validation
- Validates on every file save
- Checks endpoint existence
- Validates HTTP methods
- Compares request/response schemas
- Detects parameter name mismatches

### 3. Smart Error Messages
```
❌ API Contract Mismatch Detected

File: frontend/src/services/clients.ts:45
Endpoint: POST /api/clients

Issues Found:
1. Parameter name mismatch:
   Frontend sends: { userId: string }
   Backend expects: { user_id: string }
   Suggestion: Rename 'userId' to 'user_id' to match backend

2. Missing required field:
   Backend requires: 'email' (string)
   Frontend missing: 'email'
   Suggestion: Add 'email' field to ClientCreate interface
```

### 4. Framework Agnostic
Works with:
- **Frontend**: Next.js, React, Vue, Angular, Svelte
- **Backend**: FastAPI, Flask, Express, Django, NestJS
- **API Styles**: REST, GraphQL, tRPC, WebSocket

## Use Cases

### For Vibecoders
- Catch AI hallucinations immediately
- Prevent "works on my machine" API issues
- Ship faster with confidence

### For Teams
- Prevent breaking changes
- Maintain API documentation
- Onboard new developers faster

### For Hackathons
- Demo: "Watch me break the API and see immediate feedback"
- Unique differentiator
- Solves real pain point

## Success Metrics

- **Time Saved**: Catch API issues in seconds vs minutes of debugging
- **Bugs Prevented**: Eliminate 90% of API contract mismatches
- **Developer Confidence**: Code full-stack features without fear

## Target Audience

Primary: Vibecoders using AI to generate full-stack applications
Secondary: Full-stack developers, API developers, team leads

## Competitive Advantage

No other vibecoding tool provides:
- Real-time API contract validation
- Cross-language type checking (TypeScript ↔ Python)
- Zero-config auto-detection
- Immediate feedback loop

This feature positions CodeGuardian as the essential tool for AI-assisted full-stack development.
