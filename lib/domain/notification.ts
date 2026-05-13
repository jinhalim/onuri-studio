// D-015: DB 백킹 알림 도메인 타입.
// 한 사용자가 받는 모든 알림은 discriminated union 으로 표현 (type 기준).

export type NotificationType =
  | 'edit_request'
  | 'edit_request_approved'
  | 'edit_request_denied';

export interface EditRequestPayload {
  storyId: string;
  storyTitle: string;
  channelId: string;
  channelName: string;
  requesterUserId: string;
  requesterNickname: string;
  requesterColor: string;
}

export interface EditRequestResponsePayload {
  storyId: string;
  storyTitle: string;
  channelId: string;
  channelName: string;
  ownerUserId: string;
  ownerNickname: string;
}

// type 별 payload 형태 (discriminated union)
export type Notification =
  | {
      id: string;
      type: 'edit_request';
      recipientUserId: string;
      payload: EditRequestPayload;
      readAt: string | null;
      createdAt: string;
    }
  | {
      id: string;
      type: 'edit_request_approved';
      recipientUserId: string;
      payload: EditRequestResponsePayload;
      readAt: string | null;
      createdAt: string;
    }
  | {
      id: string;
      type: 'edit_request_denied';
      recipientUserId: string;
      payload: EditRequestResponsePayload;
      readAt: string | null;
      createdAt: string;
    };

// DB row → domain mapper. 호환성 위해 snake_case 만 받음.
export function mapNotificationRow(row: {
  id: string;
  recipient_user_id: string;
  type: string;
  payload: unknown;
  read_at: string | null;
  created_at: string;
}): Notification | null {
  if (
    row.type !== 'edit_request' &&
    row.type !== 'edit_request_approved' &&
    row.type !== 'edit_request_denied'
  ) {
    return null;
  }
  return {
    id: row.id,
    type: row.type,
    recipientUserId: row.recipient_user_id,
    payload: row.payload as never,
    readAt: row.read_at,
    createdAt: row.created_at,
  };
}
