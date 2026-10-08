import { fail, ok } from "@/server/http";
import { MAX_FILES_PER_MESSAGE, MAX_FILE_BYTES, pendingCount, saveFile } from "@/server/files";
import { authed } from "@/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const MAX_PENDING = 25;

/**
 * POST multipart/form-data, field "file" (repeatable) — upload files to attach to a message.
 * The files are stored privately for the uploader until a message that references them is sent.
 */
export const POST = authed(async (req: Request, _ctx, me) => {
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > MAX_FILE_BYTES * MAX_FILES_PER_MESSAGE + 1024 * 1024) return fail(`Files can be up to ${MAX_FILE_BYTES / 1024 / 1024} MB each.`, 413);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return fail("Couldn't read the upload. Try again.");
  }
  const files = form.getAll("file").filter((f): f is File => typeof f !== "string");
  if (files.length === 0) return fail("Choose a file to attach.");
  if (files.length > MAX_FILES_PER_MESSAGE) return fail(`You can attach up to ${MAX_FILES_PER_MESSAGE} files to one message.`);
  for (const f of files) {
    if (f.size === 0) return fail(`“${f.name}” is empty.`);
    if (f.size > MAX_FILE_BYTES) return fail(`“${f.name}” is larger than ${MAX_FILE_BYTES / 1024 / 1024} MB.`, 413);
  }
  if ((await pendingCount(me.id)) + files.length > MAX_PENDING) return fail("You have too many unsent attachments. Send or remove some first.", 429);

  const saved = [];
  for (const f of files) saved.push((await saveFile(me.id, f.name, Buffer.from(await f.arrayBuffer()))).attachment);
  return ok({ attachments: saved }, 201);
});
