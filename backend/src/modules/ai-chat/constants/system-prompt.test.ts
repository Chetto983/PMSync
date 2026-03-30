import { describe, expect, it } from "vitest";
import {
  buildExtendedRuntimeContext,
  buildSystemPrompt,
} from "./system-prompt";

describe("buildExtendedRuntimeContext", () => {
  it("includes user identity and saved AI profile preferences", () => {
    const context = buildExtendedRuntimeContext({
      timezone: "Europe/Rome",
      providerType: "google",
      locale: "it",
      displayName: "Davide Marchetto",
      jobTitle: "Developer",
      communicationStyle: "CASUAL",
      responseLength: "MODERATE",
      proactivityLevel: "HIGH",
    });

    expect(context).toContain("Authenticated user: Davide Marchetto");
    expect(context).toContain("Profile role/title: Developer");
    expect(context).toContain("Preferred communication style: CASUAL");
    expect(context).toContain("Preferred response length: MODERATE");
    expect(context).toContain("Preferred proactivity level: HIGH");
    expect(context).toContain("Email provider: google");
    expect(context).toContain("User locale: it");
  });
});

describe("buildSystemPrompt", () => {
  it("tells the model to ask for clarification instead of issuing multiple delete_memory calls", () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain(
      "Never issue multiple delete_memory calls in one turn.",
    );
    expect(prompt).toContain("- delete_memory (forgetting stored user memory)");
    expect(prompt).toContain(
      "Do NOT call delete_memory to deduplicate or replace an existing memory.",
    );
  });

  it("forces explicit remember requests through save_memory even when similar facts already exist", () => {
    const prompt = buildSystemPrompt();

    expect(prompt).toContain(
      'If the user says "remember this", "save this", "store this", "keep this in mind", or "remember this exactly", call save_memory',
    );
    expect(prompt).toContain(
      "Even if the fact looks similar to an existing Known Fact, still call save_memory",
    );
    expect(prompt).toContain(
      "If the user asks you to remember something \"exactly\", pass the exact user-provided text into save_memory.content.",
    );
  });
});
