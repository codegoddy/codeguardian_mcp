# Code Guardian Tool Test Report

This document summarizes the deliberate injection of code issues (hallucinations, dead code, and API contract mismatches) and the performance of the **Code Guardian** tool in detecting them.

## 🛠 Injected Issues & Detection Results

### 1. Hallucinations
| File | Injected Issue | Detection Status | Verdict |
| :--- | :--- | :--- | :--- |
| `frontend/src/services/api.ts` | Used non-existent `config` object and `config.NON_EXISTENT_KEY` | **DETECTED ✅** | Successfully identified as an undefined variable. |
| `backend/src/controllers/pantryController.ts` | Attempted to call `prisma.ghostItems.findMany()` | **MISSED ❌** | The tool missed deep property access on the Prisma object. |

### 2. Dead Code
| File | Injected Issue | Detection Status | Verdict |
| :--- | :--- | :--- | :--- |
| `backend/src/controllers/pantryController.ts` | Added unused function `unusedInternalHelper` | **DETECTED ✅** | Caught by the dead code analyzer. |
| `frontend/src/components/Inventory.tsx` | Added unused function `formatUnusedDate` | **DETECTED ✅** | Caught by the dead code analyzer. |
| `frontend/src/components/Inventory.tsx` | Added unused constant `unusedThemeConfig` | **DETECTED ✅** | Caught by the dead code analyzer. |

### 3. API Contract Issues
| File | Injected Issue | Detection Status | Verdict |
| :--- | :--- | :--- | :--- |
| `frontend/src/services/api.ts` | Referenced `GET /secret` (missing in backend) | **DETECTED ✅** | Caught by the API contract validator. |
| `frontend/src/services/api.ts` | Sent `quantityToConsume` instead of `amount` in payload | **MISSED ❌** | Dynamic stringified JSON keys are harder to trace across bridges. |

---

## 📊 Summary of Findings

- **Total Issues Injected:** 7
- **Total Issues Detected:** 5
- **Detection Rate:** ~71%

### Strengths
- **Ghost Symbol Detection:** Excellent at catching symbols that look real but aren't imported or defined.
- **Dead Code Analysis:** Highly reliable at spotting unused utilities and constants.
- **Endpoint Validation:** Effectively ensures that frontend requests map to existing backend routes.

### Limitations
- **Deep Property Access:** Hallucinations nested inside valid objects (like `prisma.missingField`) may require stricter typing checks.
- **Dynamic Payloads:** Sub-keys inside `JSON.stringify` or generic `any` types can bypass standard contract scans.

### Conclusion
The **Code Guardian** is a powerful safety net for common "AI hallucinations" and codebase bloat. For 100% coverage, it should be paired with **Strict Mode** validation during critical reviews.
