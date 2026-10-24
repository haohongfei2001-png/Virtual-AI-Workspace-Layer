// Fixed mutations from VA-HOST/1.1 FINAL §5.2. No production edits are retained.
export const mutations = [
  {
    "id": "origin",
    "specIds": [
      "MAP-07"
    ],
    "file": "src/host/url-policy.mjs",
    "before": "url.origin!==origin||",
    "after": "",
    "testFile": "tests/host/url-policy.test.mjs",
    "testName": "reject unsafe or ambiguous URL \"https://evil.test/c/11111111-2222-4333-8444-555555555555\"",
    "evidence": "L",
    "limitations": ""
  },
  {
    "id": "missing-as-null",
    "specIds": [
      "MAP-04"
    ],
    "file": "src/host/surface-batch.mjs",
    "before": "membership:[...membership.values()]",
    "after": "membership:[...refs.values()].map(r=>membership.get(r.id)??{id:r.id,state:'NONE',projectId:null})",
    "testFile": "tests/host/surface-batch.test.mjs",
    "testName": "maps native IDs and exact titles without name merge or invented coverage",
    "evidence": "L",
    "limitations": ""
  },
  {
    "id": "merge-by-name",
    "specIds": [
      "MAP-02"
    ],
    "file": "src/host/surface-batch.mjs",
    "before": "projects:[...projects.values()]",
    "after": "projects:[...new Map([...projects.values()].map(p=>[p.nativeName,p])).values()]",
    "testFile": "tests/host/surface-batch.test.mjs",
    "testName": "maps native IDs and exact titles without name merge or invented coverage",
    "evidence": "L",
    "limitations": ""
  },
  {
    "id": "old-epoch",
    "specIds": [
      "SEC-06"
    ],
    "file": "src/host/surface-batch.mjs",
    "before": "&&proposal.routeEpoch===binding.routeEpoch",
    "after": "",
    "testFile": "tests/host/surface-batch.test.mjs",
    "testName": "old epoch rejected",
    "evidence": "L",
    "limitations": "Late proposal route-epoch fence, not full asynchronous account-switch or MV3 certification."
  },
  {
    "id": "self-certified-receipt",
    "specIds": [
      "SEC-02"
    ],
    "file": "src/host/surface-batch.mjs",
    "before": "&&v.receiptId===null",
    "after": "",
    "testFile": "tests/host/surface-batch.test.mjs",
    "testName": "unknown receipt rejected",
    "evidence": "L",
    "limitations": ""
  },
  {
    "id": "pre-ack-send",
    "specIds": [
      "ACT-07"
    ],
    "file": "src/host/conversation-acceptance.mjs",
    "before": "||!validated.ack.acceptedStates.includes(message.status)",
    "after": "",
    "testFile": "tests/host/conversation-acceptance.test.mjs",
    "testName": "absent status cannot establish acceptance",
    "evidence": "L",
    "limitations": "Acceptance parser guard; complete send/network pipeline remains separately required."
  },
  {
    "id": "current-leaf-key",
    "specIds": [
      "ACT-06",
      "ACT-11"
    ],
    "file": "src/runtime/host-send-ack-owner.mjs",
    "before": "[scope.key,snapshot.conversationId,snapshot.messageId]",
    "after": "[scope.key,snapshot.conversationId,snapshot.messageId,context.currentLeaf]",
    "testFile": "tests/host/guard-mutations/ack-key.test.mjs",
    "testName": "ACT-06/11 current leaf cannot change durable event key",
    "evidence": "L",
    "limitations": ""
  },
  {
    "id": "poll-renews-anchor",
    "specIds": [
      "ACT-16"
    ],
    "file": "src/data/free-activity.mjs",
    "before": "if(keys.has(key))continue;",
    "after": "if(keys.has(key)){result[h.id]=structuredClone(h);continue;}",
    "testFile": "tests/host/observed-anchor-repository.test.mjs",
    "testName": "MOCK_IDB repeated message preserves first observation interval and calibration due",
    "evidence": "L/MOCK_IDB",
    "limitations": ""
  },
  {
    "id": "auto-popover",
    "specIds": [
      "UI-08"
    ],
    "file": "src/navigation/mount-surface.mjs",
    "before": "node.setAttribute('popover','manual')",
    "after": "node.setAttribute('popover','auto')",
    "testFile": "tests/host/mount-closed-layout.test.mjs",
    "testName": "closed layout retention is confined to both exact owned IDs and closed state",
    "evidence": "L",
    "limitations": "DOM double declaration contract only; real-browser dismissal is NOT_RUN."
  },
  {
    "id": "remove-background-inert",
    "specIds": [
      "UI-06"
    ],
    "file": "src/navigation/mount-surface.mjs",
    "before": "[data-va-mask-${role}=\"${id}\"]{visibility:hidden;interactivity:inert;}",
    "after": "[data-va-mask-${role}=\"${id}\"]{visibility:hidden;}",
    "testFile": "tests/host/mount-closed-layout.test.mjs",
    "testName": "native masks still depend only on owned popover-open and never receive inline display or inert",
    "evidence": "L",
    "limitations": "CSS declaration contract only; browser focus/AX isolation is NOT_RUN."
  },
  {
    "id": "async-prevent-default",
    "specIds": [
      "UI-01"
    ],
    "file": "src/navigation/navigation.mjs",
    "before": "      event.preventDefault();\n      const dto=",
    "after": "      queueMicrotask(()=>event.preventDefault());\n      const dto=",
    "testFile": "tests/host/guard-mutations/navigation.test.mjs",
    "testName": "UI-01 delegated action prevents default before asynchronous RPC",
    "evidence": "L",
    "limitations": "Renderer event timing with DOM double; real native handler/browser navigation is NOT_RUN."
  },
  {
    "id": "post-commit-continuation",
    "specIds": [
      "SYS-01"
    ],
    "file": "src/data/native-repository.mjs",
    "before": "...(continuation?{continuation}:{})",
    "after": "...({})",
    "testFile": "tests/host/native-continuation-repository.test.mjs",
    "testName": "MOCK_IDB native, shared anchor and pending evidence commit together; replay remains single and scoped",
    "evidence": "L/MOCK_IDB",
    "limitations": "Crash-window mutant: native commits without continuation; process loss before the moved post-commit continuation write. Real IndexedDB crash evidence is NOT_RUN."
  }
];
