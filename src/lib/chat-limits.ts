/** Messaging limits, shared by the server (which enforces them) and the UI (which tells people before they hit them). */
export const MAX_BODY = 20_000;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_FILES_PER_MESSAGE = 5;
