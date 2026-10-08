import { del, get, patch, post } from "./http";
import { ApiError, sendToSignIn } from "./http";
import { MAX_FILE_BYTES } from "@/lib/chat-limits";
import type {
  ActivityItem,
  Attachment,
  ChannelMember,
  CompanyId,
  CompanySummary,
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
  Sprint,
  SystemMeters,
  Task,
  TaskInput,
  TeamMember,
  WeeklyMetric,
} from "@/types/models";

export { ApiError, errorMessage } from "./http";

/* Session & authentication */
export const sessionService = { get: () => get<Session>("/session") };

export const authService = {
  login: (email: string, password: string) => post<Session>("/auth/login", { email, password }),
  signup: (input: { email: string; password: string; name: string; role: string; department: string }) =>
    post<{ message: string }>("/auth/signup", input),
  logout: () => post<{ ok: true }>("/auth/logout"),
};

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
export interface TaskQuery {
  company?: CompanyId;
  /** A sprint id, or "none" for unscheduled work. */
  sprint?: ID | "none";
  /** Only these tasks (used to apply live updates without re-downloading the board). */
  ids?: ID[];
}

export const taskService = {
  list: (query: TaskQuery = {}) => {
    const q = new URLSearchParams();
    if (query.company) q.set("company", query.company);
    if (query.sprint) q.set("sprint", query.sprint);
    if (query.ids) q.set("ids", query.ids.join(","));
    const qs = q.toString();
    return get<Task[]>(`/tasks${qs ? `?${qs}` : ""}`);
  },
  create: (input: Partial<TaskInput> & { title: string }) => post<Task>("/tasks", input),
  update: (id: ID, changes: Partial<TaskInput>) => patch<Task>(`/tasks/${id}`, changes),
  remove: (id: ID) => del<{ id: ID }>(`/tasks/${id}`),
};

export const sprintService = {
  list: (company?: CompanyId) => get<Sprint[]>(`/sprints${company ? `?company=${company}` : ""}`),
  create: (input: { companyId: CompanyId; name?: string; goal?: string; startDate?: string; endDate?: string }) => post<Sprint>("/sprints", input),
  update: (id: ID, changes: Partial<Pick<Sprint, "name" | "goal" | "startDate" | "endDate">>) => patch<Sprint>(`/sprints/${id}`, changes),
  remove: (id: ID) => del<{ id: ID; movedTasks: number }>(`/sprints/${id}`),
  /** Start a planned sprint, optionally adjusting its details in the same step. */
  start: (id: ID, fields: Partial<Pick<Sprint, "name" | "goal" | "startDate" | "endDate">> = {}) => post<Sprint>(`/sprints/${id}/start`, fields),
  /** Complete the active sprint. Unfinished work goes to `moveTo` (a planned sprint) or back to unscheduled when null. */
  complete: (id: ID, moveTo: ID | null) => post<{ sprint: Sprint; movedTasks: number }>(`/sprints/${id}/complete`, { moveTo }),
};

export const companyService = {
  list: () => get<CompanySummary[]>("/companies"),
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
  create: (input: { name: string; description?: string; topic?: string }) => post<Conversation>("/channels", input),
  detail: (id: ID) => get<ConversationDetail>(`/channels/${id}`),
  /** Specific messages as you see them — used to apply live updates without re-downloading the whole thread. */
  messages: (id: ID, ids: ID[]) => get<{ messages: ChatMessage[] }>(`/channels/${id}/messages?ids=${ids.map(encodeURIComponent).join(",")}`),
  update: (id: ID, changes: Partial<Pick<Conversation, "name" | "description" | "topic">>) => patch<Conversation>(`/channels/${id}`, changes),
  remove: (id: ID) => del<{ id: ID }>(`/channels/${id}`),
  /** "I'm looking at this conversation": marks what's addressed to you as Seen. */
  markSeen: (id: ID) => post<{ changed: number }>(`/channels/${id}/seen`),
  markRead: (id: ID) => patch<Conversation>(`/channels/${id}`, { read: true }),
  setFavorite: (id: ID, favorite: boolean) => patch<Conversation>(`/channels/${id}`, { favorite }),
  /** Tell the other participants you are (or stopped) typing. Nothing is stored. */
  typing: (id: ID, typing: boolean) => post<{ ok: true }>(`/channels/${id}/typing`, { typing }),
  send: (id: ID, body: string, attachments: Attachment[] = []) => post<ChatMessage>(`/channels/${id}/messages`, { body, attachments }),
  react: (id: ID, messageId: ID, emoji: string) => post<ChatMessage>(`/channels/${id}/messages/${messageId}/reactions`, { emoji }),
  /** Start (or open) the private 1-on-1 conversation with another registered member. */
  openDirect: (memberId: ID) => post<Conversation>("/channels/dm", { memberId }),
  /** Everyone you can message: other registered members, with presence. */
  directory: () => get<ChannelMember[]>("/channels/directory"),
};

export interface UploadHandle {
  promise: Promise<Attachment>;
  abort: () => void;
}

export const attachmentService = {
  /** Uploads one file with progress. Resolves with the stored attachment (to be referenced when the message is sent). */
  upload(file: File, onProgress?: (fraction: number) => void): UploadHandle {
    const xhr = new XMLHttpRequest();
    const promise = new Promise<Attachment>((resolve, reject) => {
      if (file.size > MAX_FILE_BYTES) return reject(new ApiError(`“${file.name}” is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`, 413));
      const form = new FormData();
      form.append("file", file, file.name);
      xhr.open("POST", "/api/attachments");
      xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
      xhr.onload = () => {
        let data: { attachments?: Attachment[]; error?: string } = {};
        try {
          data = JSON.parse(xhr.responseText);
        } catch {
          /* non-JSON response */
        }
        if (xhr.status === 401) sendToSignIn();
        if (xhr.status >= 200 && xhr.status < 300 && data.attachments?.[0]) resolve(data.attachments[0]);
        else reject(new ApiError(data.error ?? `Upload failed (${xhr.status})`, xhr.status));
      };
      xhr.onerror = () => reject(new ApiError("Can't reach the server. Check your connection and try again.", 0));
      xhr.onabort = () => reject(new ApiError("Upload cancelled", 0));
      xhr.send(form);
    });
    return { promise, abort: () => xhr.abort() };
  },
  /** Remove a file you uploaded but haven't sent. */
  remove: (id: string) => del<{ id: string }>(`/attachments/${id}`),
  textPreview: (id: string) => get<{ text: string; truncated: boolean }>(`/attachments/${id}?preview=text`),
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
