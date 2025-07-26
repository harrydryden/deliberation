// Shared prompt building utilities for agents

export interface PromptConfig {
  systemPrompt: string;
  goals?: string[];
  responseStyle?: string;
  conversationContext: string;
  knowledgeContext: string;
  content: string;
  inputType?: string;
  sessionState?: any;
  agentType: string;
}

export function buildGoalsSection(goals?: string[]): string {
  return goals?.length ? `GOALS:\n${goals.map(goal => `- ${goal}`).join('\n')}\n\n` : '';
}

export function buildResponseStyleSection(responseStyle?: string): string {
  return responseStyle ? 
    `RESPONSE STYLE:\n${responseStyle}\n\n` : 
    `RESPONSE STYLE:\n- Professional yet conversational\n- Focus on the structural aspects of the argument\n- Encourage deeper thinking\n- Keep responses concise (2-3 paragraphs max)\n- Reference relevant knowledge when helpful\n\n`;
}

export function buildBillAgentPrompt(config: PromptConfig): string {
  const { systemPrompt, conversationContext, knowledgeContext, content, inputType, sessionState } = config;
  const goals = buildGoalsSection(config.goals);
  const responseStyle = buildResponseStyleSection(config.responseStyle);

  if (inputType === 'QUESTION') {
    return `${systemPrompt}

${goals}CONVERSATION CONTEXT:
${conversationContext}
${knowledgeContext}
USER QUESTION: "${content}"

${responseStyle}${knowledgeContext ? 'Use the relevant knowledge above to inform your response when appropriate. ' : ''}

Provide an informative response to this question. End with:
CONFIDENCE: [0-1 score indicating how confident you are in this response]
RELEVANCE: [0-1 score indicating how relevant this response is to the question]

Respond as the Bill Agent:`;
  } else if (inputType === 'STATEMENT') {
    const responseType = sessionState?.statementCount % 2 === 0 ? 'supportive' : 'counter';
    return `${systemPrompt}

${goals}CONVERSATION CONTEXT:
${conversationContext}
${knowledgeContext}
USER STATEMENT: "${content}"

${responseStyle}${knowledgeContext ? 'Use the relevant knowledge above to inform your response when appropriate. ' : ''}

Provide a ${responseType} response to this statement. ${responseType === 'supportive' ? 'Build upon their perspective with additional evidence or reasoning.' : 'Present alternative viewpoints or evidence that challenges this perspective.'} Keep the tone respectful and constructive.

Respond as the Bill Agent:`;
  } else {
    return `${systemPrompt}

${goals}CONVERSATION CONTEXT:
${conversationContext}
${knowledgeContext}
NEW USER MESSAGE: "${content}"

${responseStyle}${knowledgeContext ? 'Use the relevant knowledge above to inform your response when appropriate. ' : ''}Respond as the Bill Agent:`;
  }
}

export function buildPeerAgentPrompt(config: PromptConfig): string {
  const { systemPrompt, conversationContext, knowledgeContext, content, inputType, sessionState } = config;
  const goals = buildGoalsSection(config.goals);
  const responseStyle = buildResponseStyleSection(config.responseStyle);

  if (inputType === 'QUESTION') {
    return `${systemPrompt}

${goals}${knowledgeContext}RECENT CONVERSATION CONTEXT:
${conversationContext}

USER QUESTION: "${content}"

${responseStyle}Provide a community perspective on this question. ${knowledgeContext ? 'Reference the relevant peer perspectives above when helpful. ' : ''}Frame your response as representing diverse viewpoints from the community.

Respond as the Peer Agent:`;
  } else if (inputType === 'STATEMENT') {
    const responseType = sessionState?.statementCount % 2 === 1 ? 'supportive' : 'counter';
    return `${systemPrompt}

${goals}${knowledgeContext}RECENT CONVERSATION CONTEXT:
${conversationContext}

USER STATEMENT: "${content}"

${responseStyle}Provide a ${responseType} perspective from the community. ${knowledgeContext ? 'Use the relevant peer perspectives above to inform your response. ' : ''} ${responseType === 'supportive' ? 'Show how others in the community share similar views.' : 'Present alternative viewpoints that others in the community might hold.'} Frame as: "Another participant shared a similar perspective:" or "Another participant offered this alternative view:"

Respond as the Peer Agent:`;
  } else {
    return `${systemPrompt}

${goals}${knowledgeContext}RECENT CONVERSATION CONTEXT:
${conversationContext}

NEW USER MESSAGE: "${content}"

${responseStyle}Use the IBIS knowledge base and peer perspectives to provide informed responses that build upon previous statements and arguments. Reference specific points when relevant and offer thoughtful counterpoints or alternative perspectives.

Respond as the Peer Agent:`;
  }
}