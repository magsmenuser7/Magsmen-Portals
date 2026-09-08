/**
 * Server-only LiveKit helpers. LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET
 * are read here and never reach the browser: the frontend only receives a
 * short-lived access token, the room name and the LiveKit ws URL.
 */
import { AccessToken, TrackSource } from 'livekit-server-sdk';
import { CallError, type CallType } from '@/lib/calls-state';

type LiveKitConfig = {
  url: string;
  apiKey: string;
  apiSecret: string;
};

function liveKitConfig(): LiveKitConfig {
  const url = process.env['LIVEKIT_URL']?.trim();
  const apiKey = process.env['LIVEKIT_API_KEY']?.trim();
  const apiSecret = process.env['LIVEKIT_API_SECRET']?.trim();

  let hostname = 'invalid';
  if (url) {
    try {
      const parsed = new URL(url);
      hostname = parsed.hostname;
      if (parsed.protocol !== 'wss:' && parsed.protocol !== 'ws:') {
        throw new Error('LiveKit URL must use ws:// or wss://.');
      }
    } catch {
      console.info('[LiveKit config]', {
        hostname,
        apiKeyPresent: Boolean(apiKey),
        apiKeyPrefix: apiKey?.slice(0, 3) ?? '',
        apiSecretPresent: Boolean(apiSecret),
      });
      throw new CallError('Calling is not configured.');
    }
  }

  console.info('[LiveKit config]', {
    hostname,
    apiKeyPresent: Boolean(apiKey),
    apiKeyPrefix: apiKey?.slice(0, 3) ?? '',
    apiSecretPresent: Boolean(apiSecret),
  });

  if (!url || !apiKey || !apiSecret) throw new CallError('Calling is not configured.');
  return { url, apiKey, apiSecret };
}

export function livekitUrl(): string {
  return liveKitConfig().url;
}

/**
 * Mint a short-lived LiveKit access token. Identity is always the caller's
 * authenticated Supabase user id, so a client cannot impersonate anyone.
 */
export async function mintLiveKitToken(opts: {
  identity: string;
  name: string;
  room: string;
  callType: CallType;
}): Promise<string> {
  const { apiKey, apiSecret } = liveKitConfig();

  const at = new AccessToken(apiKey, apiSecret, {
    identity: opts.identity,
    name: opts.name,
    // Short-lived: enough to join and reconnect once, not to be stockpiled.
    ttl: '15m',
  });

  at.addGrant({
    room: opts.room,
    roomJoin: true,
    roomCreate: true,
    canSubscribe: true,
    canPublish: true,
    // Audio always; camera only for video calls; screen share for both video
    // and dedicated screen-share calls.
    canPublishSources:
      opts.callType === 'audio'
        ? [TrackSource.MICROPHONE]
        : opts.callType === 'screen_share'
          ? [TrackSource.MICROPHONE, TrackSource.SCREEN_SHARE, TrackSource.SCREEN_SHARE_AUDIO]
          : [
              TrackSource.MICROPHONE,
              TrackSource.CAMERA,
              TrackSource.SCREEN_SHARE,
              TrackSource.SCREEN_SHARE_AUDIO,
            ],
    canPublishData: true,
    canUpdateOwnMetadata: true,
  });

  return await at.toJwt();
}
