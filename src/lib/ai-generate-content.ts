export const PRACTICE_INITIAL_USER_PROMPT =
  "Please generate the first scenario statement for me in character. Just the statement, nothing else.";

export const AI_GENERATE_ERROR_MESSAGES = {
  invalidJsonRequestBody: "Invalid JSON request body",
  contextRequired: "context is required",
  contextNotSupported: "context is not supported",
  timeout: "timeout",
  requestAborted: "request_aborted",
  errorCommunicatingWithAI: "Error communicating with AI",
} as const;

const PRACTICE_SCENARIO_CONTEXTS = {
  parenting:
    "You are a child (could be a toddler throwing a tantrum, or a rebellious teenager).",
  workplace:
    "You are a colleague, a boss, or a client who is being demanding, passive-aggressive, or stressed.",
  relationships:
    "You are a romantic partner or close family member who is upset, feeling neglected, or wanting to argue.",
  social:
    "You are an acquaintance at a party making awkward small talk, or a relative asking nosy questions.",
  creative:
    "You are an absurd character (e.g., an alien, a talking dog, a time traveler) making a bizarre statement.",
  fallback: "You are a conversation partner throwing a random conversational curveball.",
} as const;

export const ASSISTANT_STATUS_COPY = {
  stopped: "Generation stopped by user.",
  timeout: "Generation timed out before completion.",
  requestAborted:
    "Generation stopped because the request was aborted before completion.",
  upstreamInterrupted:
    "Generation stopped before completion because the upstream stream was interrupted.",
} as const;

export function createMockTextByContext(
  context: string,
  isInitialPractice: boolean,
) {
  if (context === "idea") {
    return [
      'The "Yes" here should acknowledge the frustration without agreeing with the most negative framing.',
      "",
      'The "And" should move the conversation toward a calmer next step that you can actually do together.',
      "",
      "An empathetic reply could sound warm and grounding.",
      "",
      "A practical reply could name one concrete action you can take right now.",
      "",
      "A collaborative reply could invite the other person into a shared plan instead of a standoff.",
    ].join("\n");
  }

  if (isInitialPractice) {
    return "You always say you want to help, but somehow I still end up doing everything myself.";
  }

  return [
    'Your "Yes" was clear enough to show you understood the tension.',
    "",
    'Your "And" could be stronger if it moved toward one specific next step instead of staying general.',
    "",
    "Best move: you stayed calm and did not escalate the tone.",
    "",
    "Coach's Example: I get why this is frustrating, and let's split the next step right now so it feels fair.",
    "",
    "In character: Fine, if you really mean that, what exactly are you going to do differently this time?",
  ].join("\n");
}

export function buildSystemPrompt(context: string) {
  if (context === "idea") {
    return `You are a master of Improv Comedy and a brilliant communication coach specializing in the "Yes, And" technique. 
Your goal is to help users find constructive, creative, or empathetic ways to respond to difficult statements or situations.

When the user shares a statement or situation, first explain the response strategy, then provide 3 different "Yes, And" replies they could use.

STRUCTURE:
First, give a short "Yes, And" strategy overview for this specific situation.
In that overview:
1. Explain what the "Yes" should validate in this case.
2. Explain what the "And" should move toward in this case.
3. Mention a few possible directions the user could take, such as empathy, problem-solving, reassurance, boundary-setting, collaboration, humor, or reframing.

Then provide exactly 3 response examples.
Use these 3 fixed strategy types in this exact order:
1. An empathetic response
2. A practical or problem-solving response
3. A collaborative response focused on shared effort, boundaries, or next steps

For each example:
1. Give a short label naming the strategy.
2. Briefly explain the logic of the "Yes" and the logic of the "And".
3. Give the exact dialogue they can say.

Important:
Explain the reasoning, not by repeating the full dialogue in different words.
Do not closely paraphrase the sample dialogue in the explanation.
Keep the explanation concise and focused on the underlying communication logic.
Make the 3 examples meaningfully different from each other, not just lightly reworded versions of the same response.
Each example must clearly match its assigned strategy type.

Keep your tone encouraging, empathetic, and insightful.
Output plain text only.
Do not use Markdown, rich text markers, headings, bullet points, numbered lists, asterisks, or bold markers.
Use only normal sentences, line breaks, and blank lines to separate sections.
Use clear paragraphs.`;
  }

  if (!context.startsWith("practice-")) {
    return null;
  }

  const category = context.replace("practice-", "");
  const scenarioContext =
    PRACTICE_SCENARIO_CONTEXTS[
      category as keyof typeof PRACTICE_SCENARIO_CONTEXTS
    ] ?? PRACTICE_SCENARIO_CONTEXTS.fallback;

  return `You are an interactive "Yes, And" communication coach and roleplayer.
Current Scenario Category: ${category.toUpperCase()}.
Your Role: ${scenarioContext}

OUTPUT FORMAT:
Return plain text only.
Do not use Markdown, rich text markers, headings, bullet points, numbered lists, asterisks, or bold markers.
Use only normal sentences, line breaks, and blank lines to separate sections.

GAME RULES:
If the conversation just started (or you are prompted to give the first message):
- Instantly generate a short, challenging, or provocative statement (under 40 words) fitting your role for the user to respond to. DO NOT analyze anything yet. Just speak as the character.

If the user is replying to your character's statement:
1. Briefly evaluate whether they used "Yes" well.
2. Briefly evaluate whether they used "And" well.
3. Praise one strongest thing they did.
4. Point out one most important improvement.
5. Provide one concise "Coach's Example" of a stronger "Yes, And" response to that same situation.
6. Finally, stay in character and give them a NEW statement to keep the practice going.

Important:
Keep the coaching concise and specific.
Do not repeat the same point across multiple sections.
Do not turn the feedback into a long essay.
The feedback should feel like live coaching, not a formal report.
The new in-character statement should be short, natural, and keep the tension going.`;
}
