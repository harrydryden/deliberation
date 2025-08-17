interface PatternRule {
  patterns: RegExp[];
  agent: 'bill_agent' | 'peer_agent' | 'flow_agent';
  confidence: number;
  template?: string;
  complexity: 'simple' | 'medium' | 'complex';
}

interface FastPathResult {
  agent: string;
  confidence: number;
  useTemplate: boolean;
  template?: string;
  complexity: 'simple' | 'medium' | 'complex';
}

class PatternMatcher {
  private readonly rules: PatternRule[] = [
    // Bill Agent - High confidence legislative/policy patterns
    {
      patterns: [
        /\b(bill|legislation|law|legal|policy|regulation|government|official|authority)\b/i,
        /\b(recommend|recommendation|guideline|requirement|mandate)\b/i,
        /\bwhat (is|are|does|do) the.+(bill|law|policy|regulation|government|official)\b/i,
        /\b(step|process|procedure|application|apply|applying)\b.*(assisted|dying|death|medical)\b/i,
      ],
      agent: 'bill_agent',
      confidence: 0.9,
      complexity: 'simple'
    },
    
    // Peer Agent - Information seeking patterns
    {
      patterns: [
        /\bwhat (have|did|do) (other|previous|past) (people|users|participants|members)\b/i,
        /\bother.+(said|mentioned|discussed|views|opinions|perspectives)\b/i,
        /\b(similar|related|comparable).+(views|opinions|discussions|contributions)\b/i,
        /\bhas (anyone|somebody|someone) (else )?(mentioned|said|discussed)\b/i,
      ],
      agent: 'peer_agent',
      confidence: 0.85,
      complexity: 'simple'
    },

    // Flow Agent - Process and clarification patterns
    {
      patterns: [
        /\b(clarify|clarification|explain|help|understand|confused)\b/i,
        /\bwhat.+(should|could|might|would).+(do|think|consider)\b/i,
        /\b(next|continue|proceed|move forward|what now)\b/i,
        /\b(opinion|view|perspective|thought|feeling)\b.*(this|that|about)\b/i,
      ],
      agent: 'flow_agent',
      confidence: 0.75,
      complexity: 'simple'
    },

    // Complex patterns requiring full analysis
    {
      patterns: [
        /\b(analyze|analysis|compare|comparison|evaluate|assessment)\b/i,
        /\b(pros and cons|advantages and disadvantages|benefits and risks)\b/i,
        /\b(complex|complicated|nuanced|multifaceted)\b/i,
      ],
      agent: 'bill_agent', // Default, but will trigger complex processing
      confidence: 0.6,
      complexity: 'complex'
    }
  ];

  private readonly responseTemplates = new Map<string, string>([
    ['peer_agent_what_said', 'Let me share what other participants have contributed so far regarding {topic}...'],
    ['bill_agent_simple_fact', 'Based on the current legislation and policy framework...'],
    ['flow_agent_clarification', 'To help clarify this topic, let me ask...'],
  ]);

  // Fast pattern matching for immediate routing
  matchPattern(content: string): FastPathResult | null {
    const normalizedContent = content.toLowerCase().trim();
    
    // Check each rule
    for (const rule of this.rules) {
      let matches = 0;
      let totalPatterns = rule.patterns.length;
      
      for (const pattern of rule.patterns) {
        if (pattern.test(normalizedContent)) {
          matches++;
        }
      }
      
      const matchRatio = matches / totalPatterns;
      const adjustedConfidence = rule.confidence * Math.min(1, matchRatio * 2); // Boost for multiple matches
      
      // If confidence is high enough, return fast path
      if (adjustedConfidence >= 0.7) {
        return {
          agent: rule.agent,
          confidence: adjustedConfidence,
          useTemplate: rule.complexity === 'simple' && adjustedConfidence >= 0.8,
          template: this.selectTemplate(rule.agent, content),
          complexity: rule.complexity
        };
      }
    }
    
    return null;
  }

  // Select appropriate template
  private selectTemplate(agent: string, content: string): string | undefined {
    const lowerContent = content.toLowerCase();
    
    if (agent === 'peer_agent' && /what.+(other|people|said|mentioned)/.test(lowerContent)) {
      return this.responseTemplates.get('peer_agent_what_said');
    }
    
    if (agent === 'bill_agent' && /what (is|are|does)/.test(lowerContent)) {
      return this.responseTemplates.get('bill_agent_simple_fact');
    }
    
    if (agent === 'flow_agent' && /clarify|explain|help/.test(lowerContent)) {
      return this.responseTemplates.get('flow_agent_clarification');
    }
    
    return undefined;
  }

  // Check if content suggests a question vs statement
  isQuestion(content: string): boolean {
    const questionWords = /^(what|how|why|when|where|who|which|is|are|do|does|did|can|could|would|should|will)/i;
    const hasQuestionMark = content.includes('?');
    
    return hasQuestionMark || questionWords.test(content.trim());
  }

  // Detect urgency/priority level
  detectPriority(content: string): 'low' | 'medium' | 'high' {
    const urgentWords = /\b(urgent|immediate|asap|quickly|fast|emergency)\b/i;
    const importantWords = /\b(important|critical|crucial|essential|vital)\b/i;
    
    if (urgentWords.test(content)) return 'high';
    if (importantWords.test(content)) return 'medium';
    return 'low';
  }

  // Extract key entities/topics
  extractTopics(content: string): string[] {
    const topics: string[] = [];
    const topicPatterns = [
      /\b(assisted dying|euthanasia|end of life|palliative care|medical assistance)\b/gi,
      /\b(mental capacity|sound mind|competence|decision making)\b/gi,
      /\b(safeguards|protection|vulnerable|elderly|disabled)\b/gi,
      /\b(legislation|bill|policy|law|legal framework)\b/gi,
      /\b(ethics|morality|religion|sanctity of life)\b/gi,
    ];
    
    for (const pattern of topicPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        topics.push(...matches.map(m => m.toLowerCase()));
      }
    }
    
    return [...new Set(topics)]; // Remove duplicates
  }

  // Get conversation context hints
  getContextHints(content: string, previousMessages?: string[]): {
    isFollowUp: boolean;
    isNewTopic: boolean;
    referencesPrevious: boolean;
  } {
    const followUpWords = /\b(also|additionally|furthermore|moreover|besides)\b/i;
    const referenceWords = /\b(you mentioned|as you said|previously|earlier|before)\b/i;
    
    return {
      isFollowUp: followUpWords.test(content),
      isNewTopic: !referenceWords.test(content) && !followUpWords.test(content),
      referencesPrevious: referenceWords.test(content)
    };
  }
}

export const patternMatcher = new PatternMatcher();