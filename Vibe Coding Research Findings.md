# Vibe Coding Research Findings

## Source
Arxiv paper: "Vibe Coding in Practice: Motivations, Challenges, and a Future Outlook – a Grey Literature Review"
URL: https://arxiv.org/html/2510.00328v1

## Definition
Vibe coding is the practice of using AI tools to produce software primarily by describing goals in natural language and iteratively prompting, while relying on minimal review of the generated code.

## Key Pain Points and Challenges

### 1. Quality Assurance Crisis
- **Skipped QA (36%)**: Vibe coders accept AI-generated code without validation, bypassing traditional testing entirely
- **Uncritical Trust (18%)**: Users believe code works without checking it, placing unwarranted faith in generated code
- **Delegated QA to AI (10%)**: Over-reliance on the same LLMs that introduced errors to also fix them
- **Manual Testing (29%)**: Only minority applies careful quality control

### 2. Speed-Quality Trade-off Paradox
- Users motivated by speed and accessibility
- Experience "instant success and flow"
- BUT: Most perceive resulting code as "fast but flawed"
- Creates vulnerable software developers who can build products but cannot debug when issues arise

### 3. Understanding Gap
- Users accept AI suggestions without deeply understanding them
- Students struggle with only 32.5% success in comprehension tasks
- Non-software developers struggle to verify if generated code is correct
- Leads to confusion when errors arise

### 4. The 70% Problem
- Users can get 70% of the way quickly
- Final 30% becomes frustrating wall
- Unable to debug or fix issues when they arise

### 5. Security and Maintainability Risks
- AI-generated code frequently contains vulnerabilities
- Risk of technical debt
- Hidden bugs and security vulnerabilities
- Performance inefficiencies

### 6. Prompt Engineering Challenges
- Non-developers struggle to articulate intent clearly in prompts
- Trial-and-error prompting dominates
- Difficulty fixing generated code when bugs appear

### 7. Information Overload
- Too many AI suggestions cause developers to ignore them
- Developers experience cognitive overload

## Implications for Tool Design
- Need tools that encourage review and validation
- Prevent uncritical acceptance of AI-generated code
- Help users understand generated code
- Support debugging and fixing AI-generated code
- Manage context and complexity better
