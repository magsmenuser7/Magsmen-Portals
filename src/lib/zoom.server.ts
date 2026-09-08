/**
 * Zoom meeting creation (server-only).
 *
 * Requires a Zoom Server-to-Server OAuth app with the scopes
 * `meeting:write:admin` and `meeting:read:admin`, exposed through the secrets
 * ZOOM_ACCOUNT_ID, ZOOM_CLIENT_ID and ZOOM_CLIENT_SECRET. Nothing here is ever
 * bundled into the browser — only the resulting join URL reaches the client.
 */

export interface ZoomMeeting {
  zoomMeetingId: string;
  zoomUuid: string | null;
  joinUrl: string;
  startUrl: string;
}

export function zoomConfigured() {
  return Boolean(
    process.env['ZOOM_ACCOUNT_ID'] && process.env['ZOOM_CLIENT_ID'] && process.env['ZOOM_CLIENT_SECRET'],
  );
}

async function zoomToken(): Promise<string | null> {
  const accountId = process.env['ZOOM_ACCOUNT_ID'];
  const clientId = process.env['ZOOM_CLIENT_ID'];
  const clientSecret = process.env['ZOOM_CLIENT_SECRET'];
  if (!accountId || !clientId || !clientSecret) return null;

  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(accountId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
    },
  );
  if (!res.ok) {
    console.error(`[zoom] token failed [${res.status}]: ${await res.text()}`);
    return null;
  }
  const json = (await res.json()) as { access_token?: string };
  return json.access_token ?? null;
}

/** Creates a scheduled Zoom meeting. Returns null when Zoom is not configured or errors. */
export async function createZoomMeeting(input: {
  topic: string;
  agenda: string;
  startsAt: string;
  durationMins: number;
}): Promise<ZoomMeeting | null> {
  const token = await zoomToken();
  if (!token) return null;

  const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: input.topic.slice(0, 200),
      type: 2,
      start_time: new Date(input.startsAt).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      duration: input.durationMins,
      timezone: 'UTC',
      agenda: input.agenda.slice(0, 2000),
      settings: { join_before_host: true, waiting_room: false, approval_type: 2 },
    }),
  });

  if (!res.ok) {
    console.error(`[zoom] create failed [${res.status}]: ${await res.text()}`);
    return null;
  }
  const json = (await res.json()) as { id?: number | string; uuid?: string; join_url?: string; start_url?: string };
  if (!json.id || !json.join_url) return null;
  return {
    zoomMeetingId: String(json.id),
    zoomUuid: json.uuid ?? null,
    joinUrl: json.join_url,
    startUrl: json.start_url ?? json.join_url,
  };
}

/** Updates an existing Zoom meeting's time/topic. Never throws. */
export async function updateZoomMeeting(
  zoomMeetingId: string,
  input: { topic: string; agenda: string; startsAt: string; durationMins: number },
) {
  const token = await zoomToken();
  if (!token) return false;
  const res = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(zoomMeetingId)}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      topic: input.topic.slice(0, 200),
      agenda: input.agenda.slice(0, 2000),
      start_time: new Date(input.startsAt).toISOString().replace(/\.\d{3}Z$/, 'Z'),
      duration: input.durationMins,
      timezone: 'UTC',
    }),
  });
  if (!res.ok) console.error(`[zoom] update failed [${res.status}]: ${await res.text()}`);
  return res.ok;
}

/** Deletes/cancels a Zoom meeting. Never throws. */
export async function deleteZoomMeeting(zoomMeetingId: string) {
  const token = await zoomToken();
  if (!token) return false;
  const res = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(zoomMeetingId)}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.ok;
}
