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
