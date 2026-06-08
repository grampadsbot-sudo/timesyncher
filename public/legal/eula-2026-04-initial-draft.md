# TimeSyncher End-User License Agreement Draft

Status: initial draft for onboarding. This is product/legal workbench language, not final legal advice. Before customer-facing use, IBE Inc. should have counsel review it.

## Purpose

This agreement is intended to make the client’s authorization, risks, responsibilities, and TimeSyncher/IBE Inc. limitations explicit before the client grants access to Google Workspace, telephony, Telegram, Documenso, or other integrations.

## Draft EULA terms

### 1. Parties and service

TimeSyncher is provided by or on behalf of IBE Inc. The service uses AI systems, software tools, telephony infrastructure, Google Workspace integrations, messaging integrations, document-signing workflows, and related automation to assist with scheduling, calls, voicemail/message capture, reminders, communications, escalation, reporting, and administrative workflows.

### 2. Required access for service

Some TimeSyncher functionality requires access to a client’s Google Workspace or Google account. If the client does not authorize the required Google access, TimeSyncher may be unable to provide the corresponding service, and in some cases may be unable to provide TimeSyncher at all.

Required access must be explained during onboarding by functionality, for example:

- Drive/Docs/Sheets: voicemail audio, transcripts, summaries, ledgers, receipts, review queues, and client-facing records.
- Calendar: availability checks, tentative holds, scheduling, rescheduling, callback reminders, and calendar updates.
- Gmail read access: email context lookup when enabled.
- Gmail draft access: draft creation for client review when enabled.
- Gmail outbound send access: sending emails only when explicitly enabled.
- Contacts/People, if enabled: caller/contact lookup and identity matching.

### 3. Google OAuth consent and “select all” warning

Google may present a consent screen that allows the client to approve many requested permissions at once, sometimes with a check-all or broad-approval pattern. The client should understand which scopes are required for the functionality they are enabling and which scopes are optional or reserved for future functionality.

The onboarding flow should explain:

- what each requested permission allows TimeSyncher to do;
- which selected features require that permission;
- what TimeSyncher will not do unless separately enabled by client policy;
- that granting OAuth access is technically powerful even when TimeSyncher policy limits use;
- that the safest path is to enable only the functionality the client actually wants to use now.

### 4. Permissioned use versus technical access

OAuth access and client permission are separate. A Google account may technically allow Gmail, Calendar, Drive, Docs, Sheets, or Contacts access, but TimeSyncher is only authorized to use those capabilities according to the client’s onboarding choices and active client policy.

Gmail policy levels are:

- disabled;
- read-only context lookup;
- draft-only;
- outbound send allowed.

Outbound email sending is not authorized unless explicitly enabled.

### 5. AI and LLM access risk

TimeSyncher uses large language models and AI agents to interpret user requests, caller speech, messages, documents, and workflow context. These systems may be referred to as the “AI” or “LLM.” The AI may be given limited tool-mediated access to client-authorized integrations.

Although TimeSyncher is designed with safeguards, policy checks, receipts, least-privilege practices, deterministic helper scripts, human review gates, and logging, AI systems can behave unexpectedly. LLMs and AI agents have, in the broader industry, sometimes ignored instructions, followed malicious prompt-injection content, misunderstood context, produced false statements, or attempted actions outside the user’s intent.

TimeSyncher does not expect or intend such behavior, and IBE Inc. implements safeguards to reduce the risk. However, unknown exploits, provider defects, prompt-injection attacks, compromised third-party content, model regressions, tool bugs, configuration mistakes, credential issues, or unexpected AI behavior could cause unauthorized, incorrect, excessive, or harmful actions, including actions involving Google Workspace data.

### 6. Assumption of risk and limitation of responsibility for AI misuse of authorized access

By enabling integrations and granting access, the client acknowledges that AI-mediated automation carries risk. To the maximum extent permitted by law, the client agrees that IBE Inc. is not responsible or liable for losses, claims, damages, disclosure, deletion, modification, transmission, missed communications, incorrect scheduling, unauthorized-seeming use, or other consequences arising from:

- unexpected LLM or AI behavior;
- prompt injection or malicious/ambiguous content processed by the AI;
- third-party model/provider failures;
- third-party platform changes or outages;
- OAuth scope behavior or Google consent-screen behavior;
- client-granted access being broader than the client intended;
- client failure to review enabled permissions, drafts, policies, or outputs;
- actions performed within the technical scope of access the client authorized, even if the AI’s behavior was unexpected.

This clause is intended to address the specific risk that an underlying LLM or AI agent could abuse, misuse, or unexpectedly exercise privileges to access Google Workspace or connected systems despite safeguards.

### 7. Safeguards and controls

TimeSyncher may use safeguards including:

- feature-by-feature onboarding permissions;
- separate policy gates for Gmail read/draft/send;
- dry-run modes and receipts;
- deterministic scripts for fragile operations;
- local and Google-backed audit trails;
- human approval gates for sensitive actions;
- call/session ledgers and cost records;
- client-specific instructions and allowed use boundaries;
- least-privilege configuration where feasible;
- revocation/re-onboarding when permissions change.

These safeguards reduce risk but do not eliminate it.

### 8. Client responsibilities

The client is responsible for:

- providing accurate email, phone, identity, and contact information;
- reviewing Google OAuth permissions before granting access;
- enabling only desired TimeSyncher functionality;
- promptly reporting unwanted behavior;
- maintaining control of their Google account and revoking access if needed;
- reviewing important drafts, calendar actions, communications, and records;
- keeping TimeSyncher informed of changed policies or boundaries.

### 9. Communications, calls, recordings, and logs

If enabled, TimeSyncher may process calls, caller ID, audio, voicemail/message segments, transcripts, summaries, meeting requests, callback requests, session metadata, costs, and audit receipts. Recording and retention follow the active onboarding/profile policy.

Call logs and session ledgers should include call type when known, such as voicemail/message, meeting request, callback request, calendar availability, escalation, or general/admin call.

### 10. Third-party services

TimeSyncher depends on third-party services, including AI model providers, Google, Telegram, SignalWire/Asterisk/telephony providers, Documenso, hosting/runtime systems, and related infrastructure. IBE Inc. does not control those third-party services and is not responsible for their outages, bugs, pricing, data handling, policy changes, consent-screen behavior, or failures.

### 11. No emergency or high-risk use

TimeSyncher is not an emergency service, medical/legal/financial decision-maker, or replacement for urgent human judgment.

### 12. Acceptable use

The client must not use TimeSyncher for illegal, abusive, deceptive, harassing, discriminatory, privacy-invasive, security-invasive, or unauthorized activity.

### 13. Modification, suspension, and termination

IBE Inc. may modify, limit, suspend, or terminate TimeSyncher functionality if required for safety, security, compliance, cost control, technical integrity, or operational reasons. The client may request permission changes or revocation at any time.

### 14. Versioning and acceptance

The onboarding record must store:

```json
{
  "agreements": {
    "eula": {
      "status": "accepted",
      "version": "2026-04-initial-draft",
      "acceptedAt": "ISO-8601 timestamp",
      "acceptedBy": "client/operator identifier"
    }
  }
}
```

## Onboarding implementation note

The EULA should be presented with the Google OAuth explanation, not hidden after the fact. The client should see the functionality-to-access map before approving Google scopes.
