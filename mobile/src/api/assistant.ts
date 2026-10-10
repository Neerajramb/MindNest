import { useQuery } from '@tanstack/react-query';

import { api } from '@/api/client';

export type AssistantAnswer = {
  question: string;
  answer: string;
  intent: string;
  confidence: 'high' | 'medium' | 'low';
  used_llm: boolean;
  sources: { type: string; id: string; label: string; time: string }[];
  action: { type: 'OPEN_SCREEN'; screen: string } | null;
};

export type ConversationSummary = {
  id: string;
  started_at: string;
  source: 'VOICE' | 'TEXT';
  person: { id: string; name: string } | null;
  turns: number;
  messages?: { speaker: 'PATIENT' | 'PERSON' | 'SYSTEM'; text: string }[];
};

export type PersonLite = { id: string; name: string; relationship: string };

export const askAssistant = (query: string, sessionId?: string, contextPersonId?: string) =>
  api<AssistantAnswer>('/assistant/query', {
    method: 'POST',
    body: { query, session_id: sessionId, context_person_id: contextPersonId },
  });

export const startSession = (contextPersonId?: string) =>
  api<{ id: string }>('/assistant/sessions', { method: 'POST', body: { context_person_id: contextPersonId } });

export const useConversations = (patientId: string | undefined) =>
  useQuery({
    queryKey: ['patient', patientId ?? '', 'conversations'],
    queryFn: () =>
      api<{ access: 'NONE' | 'METADATA' | 'FULL'; conversations: ConversationSummary[] }>(
        `/patients/${patientId}/conversations`,
      ),
    enabled: !!patientId,
    retry: false,
  });

export const usePeopleList = (patientId: string | undefined) =>
  useQuery({
    queryKey: ['patient', patientId ?? '', 'people'],
    queryFn: () => api<PersonLite[]>(`/patients/${patientId}/people`),
    enabled: !!patientId,
  });
