import { attachmentPreview } from "@/lib/messages/attachment";
import { taskForwardPreview } from "@/lib/messages/task-ref";
import { messagePreview } from "@/lib/validations/messages";
import type { MessageAttachment, MessageTaskRef } from "@/types/message";

interface PreviewSource {
  text?: string | null;
  attachment?: Pick<MessageAttachment, "kind"> | null;
  taskRef?: Pick<MessageTaskRef, "title"> | null;
}

/**
 * The rail's one-line account of a message, the same wording each send
 * path writes. Used when the last line is edited or deleted, so the
 * preview never goes on quoting words that are no longer there.
 */
export function railPreview(message: PreviewSource): string {
  const text = typeof message.text === "string" ? message.text.trim() : "";
  if (message.taskRef?.title) return taskForwardPreview(message.taskRef.title, text);
  if (text) return messagePreview(text);
  return attachmentPreview(message.attachment?.kind ?? "gif");
}
