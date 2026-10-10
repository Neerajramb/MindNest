# AI Usage Log

The final submission requires a declaration of AI usage. This log records how AI tools were used, so the
declaration in the project report can be accurate.

## Development assistance

| Date | Tool | Used for | Human review |
|---|---|---|---|
| 2026-10-10 | Claude Code (Anthropic) in VS Code | Analysing the specification set, consistency matrix, architecture decisions, plan; scaffolding the backend and mobile projects; writing code, tests and documentation | Plan and decisions approved by the project owner; code reviewed through tests, linters and commits |

## AI inside the product

| Component | Provider | Data sent | Notes |
|---|---|---|---|
| Face detection and recognition | OpenCV YuNet + SFace, run locally | None leaves the server | Biometric data is never sent to third parties |
| Text embeddings | fastembed all-MiniLM-L6-v2, run locally | None leaves the server | Memory search is local; only the top excerpts reach the LLM |
| Assistant responses (memory and general questions) | Google Gemini API (free tier) | Question plus top retrieved memory excerpts | Free tier: Google may train on and human-review inputs. Synthetic demo data only. |
| Room-scan object detection | Google Gemini API (free tier) | Room-scan images | Staged test scenes only |
| Speech-to-text | Google Gemini API (free tier) | Short audio clips | Synthetic demo conversations only |
| Text-to-speech | Device built-in voice | None | |
