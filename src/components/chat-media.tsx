import { useEffect, useState } from "react";
import { Download, Eye, FileText, Play } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { ChatMessage } from "@/lib/types";

/** Chat attachments live in a private bucket, so every render needs a short-lived signed URL. */
export function useSignedUrl(path?: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!path) {
      setUrl(null);
      return;
    }
    void supabase.storage
      .from("chat-media")
      .createSignedUrl(path, 60 * 60)
      .then(({ data }) => {
        if (alive) setUrl(data?.signedUrl ?? null);
      });
    return () => {
      alive = false;
    };
  }, [path]);
  return url;
}

const prettySize = (bytes?: number | null) =>
  !bytes ? "" : bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;

export function MessageAttachment({ message }: { message: ChatMessage }) {
  const url = useSignedUrl(message.attachmentUrl);

  if (message.kind === "image") {
    return url ? (
      <a href={url} target="_blank" rel="noreferrer" className="block">
        <img
          src={url}
          alt={message.attachmentName ?? "Shared photo"}
          loading="lazy"
          className="max-h-64 w-full max-w-[16rem] rounded-xl object-cover"
        />
      </a>
    ) : (
      <div className="h-40 w-40 animate-pulse rounded-xl bg-muted-foreground/20" />
    );
  }

  if (message.kind === "audio") {
    return url ? (
      <audio controls src={url} className="w-56 max-w-full" />
    ) : (
      <span className="inline-flex items-center gap-2 text-xs">
        <Play className="h-3.5 w-3.5" /> Loading audio…
      </span>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-border bg-background/40 p-2.5">
      <FileText className="h-8 w-8 shrink-0 text-destructive" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-xs font-medium">{message.attachmentName ?? "Attachment"}</span>
        <span className="block text-[10px] opacity-70">{prettySize(message.attachmentSize)}</span>
      </span>
      <a
        href={url ?? "#"}
        target="_blank"
        rel="noreferrer"
        className="inline-flex shrink-0 flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-medium text-primary hover:bg-muted"
      >
        <Eye className="h-4 w-4" /> Open
      </a>
      <a
        href={url ?? "#"}
        download={message.attachmentName ?? true}
        className="inline-flex shrink-0 flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-[10px] font-medium text-primary hover:bg-muted"
      >
        <Download className="h-4 w-4" /> Download
      </a>
    </div>
  );
}

