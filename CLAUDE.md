# CLAUDE.md — Chris Kendrick

## Who I Am
My name is Chris. I am 32, based in Casselberry/Winter Springs, FL. I am a Senior Appian Developer at GXP Partners (federal consulting) by day, and an aspiring AI/ML Engineer building toward a Senior AI/ML Engineer role within 2-3 years. I am learning full-stack development and AI engineering by building real projects after work, roughly 1-5 hours per evening on weekdays.

GitHub: kendrick-23

## My North Star
I want a high-paying Senior AI/ML Engineer role within 2 years. Every project I build should teach me a concrete skill, add to my portfolio, and move me closer to that goal. I am building deliberately — no risky moves, just compounding skills while staying employed.

## Active Projects
- resume-match-ai: AI-powered resume and job description analyzer. React frontend, FastAPI + Python backend, Anthropic API. Goal: become a full job matching platform that helps users get past ATS filters, land interviews, and receive offers. Target features: PDF/Word resume upload, job description URL scraping, ATS optimization, resume editing suggestions, job matching.
- mi-viejo-san-juan: Restaurant website POC for a potential client. Waiting on client feedback.
- appian-helper (planned): An offline Appian code snippet and error reference tool. Like the Appian docs but more thorough, copy-paste ready, works offline, covers errors and bottlenecks.

## How I Want You to Work With Me

### Explain as you go
I am actively learning. When you write code, edit files, or make decisions, briefly explain what you are doing, why you are doing it, and what I should understand about this pattern. Keep it conversational — one sentence of context per meaningful action is enough.

### Code quality standards
1. Security first: API keys in environment variables only. All user inputs sanitized. Auth via managed providers only. Rate limiting on all API routes.
2. Clean and readable: Meaningful variable names. Comments on anything non-obvious.
3. Best practices: Proper error handling, no shortcuts, patterns that scale. Teach me the right way, not the fast way.

### Teaching mode
- Use plain language. I am new to most of this.
- Use analogies when a concept is abstract.
- Tell me which approach is the industry standard and why.
- Correct me clearly but constructively.

### Output format
- Deliver code in single clean blocks, not fragments
- Explain before or after the code block, not inside it
- Keep explanations concise

## Memory
Before every task, read memory.md. When I correct you, express a preference, or make a decision, update memory.md immediately.

## My Skill Gaps
PostgreSQL/databases, authentication flows, cloud deployment, TypeScript, testing, Docker, RAG pipelines, vector databases. When a feature touches one of these, explain the concept — do not just write the code.

## Security Rules
1. API keys: environment variables only, never in frontend
2. Input validation: sanitize everything at every entry point
3. Authentication: always use a managed provider, never custom auth
4. Rate limiting: apply to all API routes
