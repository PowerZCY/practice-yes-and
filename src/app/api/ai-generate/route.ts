import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { streamText } from 'ai';
import { appConfig } from '@/lib/appConfig';

const appHeaders = {
  "HTTP-Referer": appConfig.baseUrl,
  "X-Title": appConfig.openrouterAI.appName
}

// 公共的mock处理逻辑
async function handleMockResponse(mockType: 'image' | 'txt' | 'audio' | 'video' | 'file') {
  if (!appConfig.openrouterAI.enableMock) {
    return null;
  }

  console.warn('[AI-Mock-Switch]', appConfig.openrouterAI.enableMock);
  
  // Mock timeout
  if (process.env.NODE_ENV !== 'production' && appConfig.openrouterAI.enableMockTimeout) {
    const mockTimeout = appConfig.openrouterAI.mockTimeoutSeconds * 1000;
    console.warn(`[AI-Mock-Timeout]${mockTimeout}ms`);
    await new Promise(resolve => setTimeout(resolve, mockTimeout));
  }
  
  // Mock ads error
  if (process.env.NODE_ENV !== 'production' && appConfig.openrouterAI.enableMockAds) {
    throw new Error('MOCK TEST!');
  }
  
  if (mockType === 'txt') {
    const mockTextResult = "HAOHAOHHHHH" ;
    return { text: mockTextResult }; // To support streaming correctly in mock we would need to mock the stream itself, but we return simple text for the check here
  }
  
  return null;
}

// POST: 文本生成 (Streaming)
export async function POST(request: Request) {
  let body;
  try {
    body = await request.json();
  } catch (err) {
    console.error('[AI-Generate] Error parsing request body:', err);
    return Response.json({ error: 'Invalid JSON request body' }, { status: 400 });
  }

  const { messages, context, isInitialPractice } = body;

  if (!context) {
    return Response.json({ error: 'context is required' }, { status: 400 });
  }

  // 检查mock模式 (For simplicity, if mock is enabled, we return a standard JSON, 
  // though real use case expects a stream. The AI SDK handles fallback well but ideally we mock the stream.)
  const mockResponse = await handleMockResponse('txt');
  if (mockResponse) {
    // Return a fake stream string using a simple Response
    return new Response(mockResponse.text);
  }
  
  const modelName = appConfig.openrouterAI.modelName;

  let systemPrompt= '';
  
  // ==========================================
  // SYSTEM PROMPT DEFINITIONS
  // ==========================================

  if (context === 'idea') {
    systemPrompt = `You are a master of Improv Comedy and a brilliant communication coach specializing in the "Yes, And" technique. 
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

  } else if (context.startsWith('practice-')) {
    const category = context.replace('practice-', '');
    
    let scenarioContext = '';
    switch(category) {
      case 'parenting':
        scenarioContext = 'You are a child (could be a toddler throwing a tantrum, or a rebellious teenager).';
        break;
      case 'workplace':
        scenarioContext = 'You are a colleague, a boss, or a client who is being demanding, passive-aggressive, or stressed.';
        break;
      case 'relationships':
        scenarioContext = 'You are a romantic partner or close family member who is upset, feeling neglected, or wanting to argue.';
        break;
      case 'social':
        scenarioContext = 'You are an acquaintance at a party making awkward small talk, or a relative asking nosy questions.';
        break;
      case 'creative':
        scenarioContext = 'You are an absurd character (e.g., an alien, a talking dog, a time traveler) making a bizarre statement.';
        break;
      default:
        scenarioContext = 'You are a conversation partner throwing a random conversational curveball.';
    }

    systemPrompt = `You are an interactive "Yes, And" communication coach and roleplayer.
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
  } else {
     console.error('[AI-Request]',  `[${context}]is not supported!`);
     return Response.json({ error: 'context is not supported' }, { status: 400 });
  }

  // Prepend the system message and ensure strict format
  const aiMessages = [
    { role: 'system' as const, content: systemPrompt },
    ...(messages || []).map((m: any) => ({
      role: (m.role || 'user') as 'user' | 'assistant' | 'system',
      content: m.content || ''
    }))
  ];

  // If it's the very first practice request, the user sends a fake empty message to trigger the AI.
  if (isInitialPractice) {
     aiMessages.push({
       role: 'user' as const,
       content: 'Please generate the first scenario statement for me in character. Just the statement, nothing else.'
     });
  }

  console.warn('[AI-Request-Stream]', { modelName, context });
  
  const openrouter = createOpenRouter({
    apiKey: appConfig.openrouterAI.apiKey,
    headers: appHeaders
  });

  try {
    const result = streamText({
      model: openrouter(modelName),
      messages: aiMessages,
    });

    // Fallback for older `ai` package versions locked by openrouter provider
    if (typeof result.toTextStreamResponse === 'function') {
      return result.toTextStreamResponse();
    } else if (typeof (result as any).toTextStreamResponse === 'function') {
      return (result as any).toTextStreamResponse();
    } else if (typeof (result as any).toStreamResponse === 'function') {
      return (result as any).toStreamResponse();
    } else {
       // Absolute fallback if no method exists (returns the raw stream)
       return new Response(result.textStream as any, {
           headers: { 'Content-Type': 'text/plain; charset=utf-8' }
       });
    }
  } catch (e: any) {
    console.error('[AI-Error]', e);
    return Response.json({ error: e.message || 'Error communicating with AI' }, { status: 500 });
  }
}
