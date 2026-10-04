import { del, get, patch, post } from "./http";
import type {
  ActivityItem,
  AppNotification,
  CalendarEvent,
  ChatMessage,
  Conversation,
  ConversationDetail,
  ConversationList,
  EventInput,
  ID,
  NewTeamMember,
  ReportDraft,
  ReportTemplate,
  SearchResult,
  Session,
  Settings,
  SystemMeters,
  Task,
  TaskInput,
  TeamMember,
  WeeklyMetric,
} from "@/types/models";

export { ApiError, errorMessage } from "./http";

/* Session & settings */
export const sessionService = { get: () => get<Session>("/session") };

export const settingsService = {
  get: () => get<Settings>("/settings"),
  update: (changes: Partial<Omit<Settings, "notifications">> & { notifications?: Partial<Settings["notifications"]> }) =>
    patch<Settings>("/settings", changes),
};

/* Team */
export const memberService = {
  list: () => get<TeamMember[]>("/members"),
  create: (input: NewTeamMember) => post<TeamMember>("/members", input),
  update: (id: ID, changes: Partial<Omit<TeamMember, "id">>) => patch<TeamMember>(`/members/${id}`, changes),
  remove: (id: ID) => del<{ id: ID }>(`/members/${id}`),
};

/* Actions */
export const taskService = {
  list: () => get<Task[]>("/tasks"),
  create: (input: Partial<TaskInput> & { title: string }) => post<Task>("/tasks", input),
  update: (id: ID, changes: Partial<TaskInput>) => patch<Task>(`/tasks/${id}`, changes),
  remove: (id: ID) => del<{ id: ID }>(`/tasks/${id}`),
};

/* Calendar */
export const eventService = {
  list: () => get<CalendarEvent[]>("/events"),
  create: (input: EventInput) => post<CalendarEvent>("/events", input),
  update: (id: ID, changes: Partial<EventInput>) => patch<CalendarEvent>(`/events/${id}`, changes),
  remove: (id: ID) => del<{ id: ID }>(`/events/${id}`),
};

/* Channels */
export const channelService = {
  list: () => get<ConversationList>("/channels"),
  detail: (id: ID) => get<ConversationDetail>(`/channels/${id}`),
  markRead: (id: ID) => patch<Conversation>(`/channels/${id}`, { read: true }),
  setFavorite: (id: ID, favorite: boolean) => patch<Conversation>(`/channels/${id}`, { favorite }),
  send: (id: ID, body: string, attachments: { name: string; size: number }[] = []) =>
    post<ChatMessage>(`/channels/${id}/messages`, { body, attachments }),
  react: (id: ID, messageId: ID, emoji: string) => post<ChatMessage>(`/channels/${id}/messages/${messageId}/reactions`, { emoji }),
  openDirect: (memberId: ID) => post<Conversation>("/channels/dm", { memberId }),
};

/* Document Center */
export const reportService = {
  templates: () => get<ReportTemplate[]>("/templates"),
  upload: (input: { name: string; description?: string; fileName?: string }) => post<ReportTemplate>("/templates", input),
  createDraft: (templateId: ID, title?: string) => post<ReportDraft>("/drafts", { templateId, title }),
};

/* Dashboard, shell */
export const dashboardService = {
  metrics: () => get<WeeklyMetric[]>("/metrics"),
  activity: () => get<ActivityItem[]>("/activity"),
};
export const systemService = { meters: () => get<SystemMeters>("/system") };

export const notificationService = {
  list: () => get<AppNotification[]>("/notifications"),
  markRead: (ids?: ID[]) => post<{ ok: true }>("/notifications", { ids }),
};

export const searchService = {
  query: (q: string) => get<SearchResult[]>(`/search?q=${encodeURIComponent(q)}`),
};
