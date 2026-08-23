// User-Agentからパスキーのデフォルト名を推測するguessPasskeyName()のテスト（issue #35）。
import { describe, expect, it } from 'vitest';
import { guessPasskeyName } from '../src/auth/device-name';

describe('guessPasskeyName', () => {
  it('returns a fallback when there is no User-Agent', () => {
    expect(guessPasskeyName(null)).toBe('不明なデバイス');
    expect(guessPasskeyName(undefined)).toBe('不明なデバイス');
    expect(guessPasskeyName('')).toBe('不明なデバイス');
  });

  it('detects iPhone Safari', () => {
    const ua =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
    expect(guessPasskeyName(ua)).toBe('iPhone Safari');
  });

  it('detects Mac Chrome', () => {
    const ua =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
    expect(guessPasskeyName(ua)).toBe('Mac Chrome');
  });

  it('detects Windows Edge', () => {
    const ua =
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0';
    expect(guessPasskeyName(ua)).toBe('Windows Edge');
  });

  it('detects Android Chrome', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36';
    expect(guessPasskeyName(ua)).toBe('Android Chrome');
  });

  it('falls back to the fallback string for an unrecognizable User-Agent', () => {
    expect(guessPasskeyName('some-custom-client/1.0')).toBe('不明なデバイス');
  });
});
