import { z } from 'zod';

// 닉네임 입력 검증.
// 길이 제한 + 양 끝 공백 제거 + XSS 위험 문자 거부 (< > / \).
// 한글/영문/숫자/공백/일반 기호는 모두 허용.
export const nicknameSchema = z
  .string()
  .trim()
  .min(1, '닉네임을 입력해주세요')
  .max(24, '닉네임은 24자 이내로 입력해주세요')
  .refine((v) => !/[<>\\/]/.test(v), '< > / \\ 문자는 사용할 수 없어요');

// 이메일 검증 (Phase 9 매직 링크용)
export const emailSchema = z.string().email('이메일 형식이 올바르지 않아요');

// 채널 이름. 짧고 한 줄짜리 라벨.
export const channelNameSchema = z
  .string()
  .trim()
  .min(1, '채널 이름을 입력해주세요')
  .max(50, '채널 이름은 50자 이내로 입력해주세요')
  .refine((v) => !/[<>\\/]/.test(v), '< > / \\ 문자는 사용할 수 없어요');

// 스토리 제목. 빈 문자열 거부 + XSS 위험 문자 거부.
export const storyTitleSchema = z
  .string()
  .trim()
  .min(1, '스토리 제목은 비울 수 없어요')
  .max(200, '스토리 제목은 200자 이내로 입력해주세요')
  .refine((v) => !/[<>]/.test(v), '< > 문자는 사용할 수 없어요');

// nanoid 12자 ID (channel.id, story.id 공통 형식)
export const idSchema = z
  .string()
  .length(12)
  .regex(/^[A-Za-z0-9_-]+$/, '잘못된 ID 형식입니다');
