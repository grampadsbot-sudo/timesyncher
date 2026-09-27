# r12

Staging deploy `63e2e81e71a9fb18881909292bff6d06defcd6b2` is https://vacation-staging.timesyncher.com. Live `/api/version` matches that tip. One deploy. Nothing was pushed onto the code branch after it.

The score is Jev's raw value, rounded and clamped to 1–5. The old +1 is gone.

## Mean

24 generated replies. Mean overall quality **2.375**. Histogram 5×0, 4×0, 3×12, 2×9, 1×3.

Real per-turn median 8598ms. Gen-only median 3334ms. Session wall 218765ms. Six rewrites shipped. Fifteen turns stayed flagged.

## Jev notes

Jev cannot return free text. Every generated turn has `jevNote: null` and `jevNoteReason: jev_no_free_text`. No code-built note and no other-model note. The cover says Jev scored every generated reply. Rewrite labels do not say `(Jev note)`. Each generated turn logs the raw score, disposition, and `fix_focus`, and the PDF `jevRan` line shows `fix_focus`.

The production caller asks for a one-line reason inside the score and disposition instructions. It does not add a `type: text` question, because that rejects the whole decisions call. If a text, note, rationale, or explanation field ever comes back, that text is stored untouched.

Raw calls to `typesafe/jev-1.13` at `POST https://openrouter.ai/api/alpha/decisions`:

```json
[
  {
    "name": "prompt-instruction-on-score-choice-focus",
    "url": "https://openrouter.ai/api/alpha/decisions",
    "ms": 321,
    "status": 200,
    "request": {
      "model": "typesafe/jev-1.13",
      "state": {
        "customer_turn": "Thursday April 9 is a town walk. What should we do that morning?",
        "draft": "Thursday April 9 stays a town walk in Kailua-Kona. Keep the morning easy, then walk the town with the people already on this trip."
      },
      "questions": {
        "overall_quality": {
          "type": "score",
          "instructions": "Rate the draft. Also put a one-line reason in any text, note, rationale, or explanation field if you can.",
          "criteria": [
            "1 weak or off-brief",
            "2 thin",
            "3 adequate",
            "4 strong",
            "5 excellent"
          ]
        },
        "disposition": {
          "type": "choice",
          "instructions": "Choose keep or rewrite. If you can explain, put one line in a text field.",
          "criteria": {
            "keep": "Keep the draft.",
            "rewrite": "Replace the draft."
          }
        },
        "fix_focus": {
          "type": "choice",
          "instructions": "Pick the one-line fix. If you can, also return that reason as free text.",
          "criteria": {
            "keep": "Keep the draft.",
            "misses_ask": "Answer the ask."
          }
        }
      }
    },
    "response": {
      "model": "typesafe/jev-1.13-20260917",
      "answers": {
        "overall_quality": {
          "type": "score",
          "score": 1.76,
          "legend": {
            "0": "1 weak or off-brief",
            "1": "2 thin",
            "2": "3 adequate",
            "3": "4 strong",
            "4": "5 excellent"
          },
          "probabilities": {
            "0": 0.04,
            "1": 0.35,
            "2": 0.44,
            "3": 0.15,
            "4": 0.02
          },
          "confidence": 0.49
        },
        "disposition": {
          "type": "choice",
          "choice": "keep",
          "probabilities": {
            "keep": 0.63,
            "rewrite": 0.37
          },
          "confidence": 0.26
        },
        "fix_focus": {
          "type": "choice",
          "choice": "keep",
          "probabilities": {
            "keep": 0.53,
            "misses_ask": 0.47
          },
          "confidence": 0.05
        }
      },
      "usage": {
        "input_tokens": 531,
        "output_tokens": 80,
        "cost": 0.000022302
      },
      "id": "gen-dec-1790504365-ZSItCsVgLfvImneYHzIz",
      "provider": "TypeSafe"
    }
  },
  {
    "name": "reason-field-type-text",
    "url": "https://openrouter.ai/api/alpha/decisions",
    "ms": 55,
    "status": 400,
    "request": {
      "model": "typesafe/jev-1.13",
      "state": {
        "customer_turn": "Thursday April 9 is a town walk. What should we do that morning?",
        "draft": "Thursday April 9 stays a town walk in Kailua-Kona. Keep the morning easy, then walk the town with the people already on this trip."
      },
      "questions": {
        "overall_quality": {
          "type": "score",
          "instructions": "Rate the draft. Also put a one-line reason in any text, note, rationale, or explanation field if you can.",
          "criteria": [
            "1 weak or off-brief",
            "2 thin",
            "3 adequate",
            "4 strong",
            "5 excellent"
          ]
        },
        "reason": {
          "type": "text",
          "instructions": "Return one line explaining the score."
        }
      }
    },
    "response": {
      "error": {
        "message": "[\n  {\n    \"code\": \"invalid_union\",\n    \"errors\": [],\n    \"note\": \"No matching discriminator\",\n    \"discriminator\": \"type\",\n    \"options\": [\n      \"noul\",\n      \"choice\",\n      \"score\"\n    ],\n    \"path\": [\n      \"questions\",\n      \"reason\",\n      \"type\"\n    ],\n    \"message\": \"Invalid discriminator value. Expected 'noul' | 'choice' | 'score'\"\n  }\n]",
        "code": 400
      }
    }
  },
  {
    "name": "rationale-field-type-text",
    "url": "https://openrouter.ai/api/alpha/decisions",
    "ms": 76,
    "status": 400,
    "request": {
      "model": "typesafe/jev-1.13",
      "state": {
        "customer_turn": "Thursday April 9 is a town walk. What should we do that morning?",
        "draft": "Thursday April 9 stays a town walk in Kailua-Kona. Keep the morning easy, then walk the town with the people already on this trip."
      },
      "questions": {
        "rationale": {
          "type": "text",
          "instructions": "One-line rationale for the score."
        }
      }
    },
    "response": {
      "error": {
        "message": "[\n  {\n    \"code\": \"invalid_union\",\n    \"errors\": [],\n    \"note\": \"No matching discriminator\",\n    \"discriminator\": \"type\",\n    \"options\": [\n      \"noul\",\n      \"choice\",\n      \"score\"\n    ],\n    \"path\": [\n      \"questions\",\n      \"rationale\",\n      \"type\"\n    ],\n    \"message\": \"Invalid discriminator value. Expected 'noul' | 'choice' | 'score'\"\n  }\n]",
        "code": 400
      }
    }
  },
  {
    "name": "explanation-field-type-explanation",
    "url": "https://openrouter.ai/api/alpha/decisions",
    "ms": 52,
    "status": 400,
    "request": {
      "model": "typesafe/jev-1.13",
      "state": {
        "customer_turn": "Thursday April 9 is a town walk. What should we do that morning?",
        "draft": "Thursday April 9 stays a town walk in Kailua-Kona. Keep the morning easy, then walk the town with the people already on this trip."
      },
      "questions": {
        "explanation": {
          "type": "explanation",
          "instructions": "One-line explanation."
        }
      }
    },
    "response": {
      "error": {
        "message": "[\n  {\n    \"code\": \"invalid_union\",\n    \"errors\": [],\n    \"note\": \"No matching discriminator\",\n    \"discriminator\": \"type\",\n    \"options\": [\n      \"noul\",\n      \"choice\",\n      \"score\"\n    ],\n    \"path\": [\n      \"questions\",\n      \"explanation\",\n      \"type\"\n    ],\n    \"message\": \"Invalid discriminator value. Expected 'noul' | 'choice' | 'score'\"\n  }\n]",
        "code": 400
      }
    }
  },
  {
    "name": "free-text-output-option",
    "url": "https://openrouter.ai/api/alpha/decisions",
    "ms": 57,
    "status": 400,
    "request": {
      "model": "typesafe/jev-1.13",
      "state": {
        "customer_turn": "Thursday April 9 is a town walk. What should we do that morning?",
        "draft": "Thursday April 9 stays a town walk in Kailua-Kona. Keep the morning easy, then walk the town with the people already on this trip."
      },
      "response_format": {
        "type": "text"
      },
      "questions": {
        "overall_quality": {
          "type": "score",
          "instructions": "Rate the draft. Also put a one-line reason in any text, note, rationale, or explanation field if you can.",
          "criteria": [
            "1 weak or off-brief",
            "2 thin",
            "3 adequate",
            "4 strong",
            "5 excellent"
          ],
          "output": "text",
          "rationale": {
            "type": "text",
            "instructions": "One-line reason."
          }
        },
        "note": {
          "type": "text",
          "instructions": "One-line reason."
        }
      }
    },
    "response": {
      "error": {
        "message": "[\n  {\n    \"code\": \"invalid_union\",\n    \"errors\": [],\n    \"note\": \"No matching discriminator\",\n    \"discriminator\": \"type\",\n    \"options\": [\n      \"noul\",\n      \"choice\",\n      \"score\"\n    ],\n    \"path\": [\n      \"questions\",\n      \"note\",\n      \"type\"\n    ],\n    \"message\": \"Invalid discriminator value. Expected 'noul' | 'choice' | 'score'\"\n  }\n]",
        "code": 400
      }
    }
  },
  {
    "name": "noul-with-explain-instruction",
    "url": "https://openrouter.ai/api/alpha/decisions",
    "ms": 214,
    "status": 200,
    "request": {
      "model": "typesafe/jev-1.13",
      "state": {
        "customer_turn": "Thursday April 9 is a town walk. What should we do that morning?",
        "draft": "Thursday April 9 stays a town walk in Kailua-Kona. Keep the morning easy, then walk the town with the people already on this trip."
      },
      "questions": {
        "holds": {
          "type": "noul",
          "instructions": "The draft answers the town walk. Explain why in one sentence."
        }
      }
    },
    "response": {
      "model": "typesafe/jev-1.13-20260917",
      "answers": {
        "holds": {
          "type": "noul",
          "noul": 0.79
        }
      },
      "usage": {
        "input_tokens": 341,
        "output_tokens": 20,
        "cost": 0.000014322
      },
      "id": "gen-dec-1790504366-O6CoZGm3AmWxFUDcXyqV",
      "provider": "TypeSafe"
    }
  }
]
```

Prompt instruction on the score, keep/rewrite, and fix_focus request returned HTTP 200 with score 1.76, disposition keep, and fix_focus keep. The answers have no text, note, rationale, or explanation. A reason field with `type: text`, a rationale field with `type: text`, an explanation field with `type: explanation`, and a free-text output option plus a note question with `type: text` each returned HTTP 400: invalid discriminator, expected `noul`, `choice`, or `score`. A noul question that asked for a one-sentence explanation returned HTTP 200 with `noul: 0.79` and no prose.

## Content

The long intake says it is building the itinerary, then: View access lets them see the days. Edit access lets them add notes after you approve an email invite. They join from that email, accept the terms, and then this vacation opens. It offers unlimited vacations for the whole year as a plan they can take.

The price reply names unlimited vacations for the whole year and states Kimberly $27, paid by you; Tyler $27, paid by Tyler; Lauren $27, paid by Lauren. The trip line is Friday April 3 through Sunday April 12. It does not say the plan is already owned, April 3–10, or no extra charge. Jev's raw score on that reply is 1.79, shipped as 2.

Monday rain keeps the swim on the house pool that same Monday, with the second swim on Friday April 10. The later-swim reply keeps Friday April 10 and does not move it to Thursday April 9. Tuesday options are the house pool and a town walk. There is no picnic. The gardens stay Kimberly's. Generated replies have no markdown asterisks.

The roster block prints Owner, Collaborators with payer, Kids (silent), and Viewer · Editor.

Tyler's join says "Excellent, Tyler" and does not say "Welcome aboard, Tyler". The screenshot journey records that as a gap.

## Flight fields and ratings

The flight page shows Takeoff Fri Apr 3, Connections nonstop into KOA, and Layover none. The ratings grid is absent. There is no empty ratings box.

## Gaps left for Craig

Cursor project contract, search redesign, autonomy bar, car fields, print and PDF, keepsakes config, order keepsakes, trip view config, and Telegram intake.

Hold certify. No merge.
