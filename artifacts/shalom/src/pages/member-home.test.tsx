import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ConvoView } from "./member-home";

describe("ConvoView verification banner", () => {
  it("renders the broken sequence while keeping the conversation visible", () => {
    const html = renderToStaticMarkup(
      <ConvoView
        convo={{
          id: "conversation-1",
          partnerName: "Partner",
          mode: "witness",
          updatedAt: "2026-09-22T00:00:00.000Z",
          messages: [{
            id: "message-1",
            sender: "bridget",
            text: "The record remains visible.",
            createdAt: "2026-09-22T00:00:00.000Z",
          }],
        }}
        onBack={() => undefined}
        addMsg={async () => null}
        updateTopic={async () => null}
        messageLoading={false}
        messageError={false}
        onRetryMessages={() => undefined}
        connectionLost={false}
        verification={{ valid: false, brokenAtSeq: 12 }}
      />,
    );

    expect(html).toContain("Record verification failed at sequence 12");
    expect(html).toContain("The record remains visible.");
  });
});