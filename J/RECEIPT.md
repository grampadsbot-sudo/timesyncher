# Exact live-runtime port of merged #665 passive observer

Source #665 head4d328f77b43f6bb844021cb14efa25add681ad94 is merged, but its capture source differs from installed runtime for unrelated prechecks/replay/traversal. Its full zero-fuzz patch refuses5/7capturehunks. Host narrowed to passive observer imports, row identity, event drain, init and serialization only; screenshot/measurement/wait calls remain byte-identical in sequence. No checker, render, fixture, timeout or baseline change.

Staged capture and passive module syntax pass. Actual Chromium first/second real image events retained, query material stripped, saved/recommendation rows isolated. Runtime preimages capture7865a7bfd893404ac2f4c6580e8d5aa29ece31821554717efb6f0ece4ff64f77 and passive828baf99aa0240ddfb911556c312e37e3cef75150bcf907447a08578f7b46f3b. Candidate capture84f03df8198c7912a92a52605e53ff787c99dc5f7fc73547e39aea6c17df76f9 and passive10746223bc660ed93f94f2de1c12cd5c57c0d37260e03dc39c184b4318725349. Passive module is unchanged from merged #665. This minimal runtime patch has zero context to avoid copying unrelated runtime routing constants into source.

Source bot-admin/receipts/gpt-manager-pass-20261023-0700. No product/Gate B rerun, cap reset, merge or deploy. #590 still requires actual future normal-capture row/event correlation; observer proof is not product-logo acceptance.
