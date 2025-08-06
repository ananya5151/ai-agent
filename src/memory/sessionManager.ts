export interface ChatMessage {
  role: 'user' | 'model';
  parts: { text: string }[];
}

const sessions = new Map<string, ChatMessage[]>();

export const sessionManager = {
  addMessage: (sessionId: string, message: ChatMessage) => {
    const history = sessions.get(sessionId) || [];
    history.push(message);
    sessions.set(sessionId, history);
  },

  getHistory: (sessionId: string): ChatMessage[] => {
    return sessions.get(sessionId) || [];
  },
};