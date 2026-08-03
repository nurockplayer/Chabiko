import { describe, expect, it } from 'vitest';
import {
  FALLBACK_ANNOTATION,
  selectScript,
  type DirectSelectableStatus,
  type ScriptFormState,
  type ScriptSelectionResult,
} from '../src/domain/scriptSelection';
import type { ScriptPreference } from '../src/lib/scriptPreference';

const PATH_DEFAULT = '標準';
const TRADITIONAL = '繁體';
const SIMPLIFIED = '简体';

function result(
  pathDefault: string,
  pathDefaultStatus: unknown,
  preference: ScriptPreference,
  forms: ScriptFormState,
): ScriptSelectionResult {
  return selectScript(pathDefault, pathDefaultStatus, preference, forms);
}

function available(
  r: ScriptSelectionResult,
): r is Extract<ScriptSelectionResult, { status: DirectSelectableStatus }> {
  return r.status === 'authored' || r.status === 'verified';
}

describe('selectScript', () => {
  describe('path-default preference', () => {
    it('returns the eligible path-default form unchanged', () => {
      const r = result(PATH_DEFAULT, 'verified', 'path-default', {});
      expect(r).toEqual({
        preference: 'path-default',
        script: PATH_DEFAULT,
        status: 'verified',
        isFallback: false,
      });
    });

    it('falls back to traditional, then simplified, when path-default is ineligible', () => {
      const forms: ScriptFormState = {
        traditional: TRADITIONAL,
        traditionalStatus: 'authored',
        simplified: SIMPLIFIED,
        simplifiedStatus: 'verified',
      };
      const r = result(PATH_DEFAULT, 'generated', 'path-default', forms);
      expect(r).toEqual({
        preference: 'path-default',
        script: TRADITIONAL,
        status: 'authored',
        isFallback: true,
        fallbackReason: FALLBACK_ANNOTATION,
      });
    });

    it('falls back to simplified when path-default and traditional are ineligible', () => {
      const forms: ScriptFormState = {
        traditional: TRADITIONAL,
        traditionalStatus: 'generated',
        simplified: SIMPLIFIED,
        simplifiedStatus: 'authored',
      };
      const r = result(PATH_DEFAULT, 'unavailable', 'path-default', forms);
      expect(r).toEqual({
        preference: 'path-default',
        script: SIMPLIFIED,
        status: 'authored',
        isFallback: true,
        fallbackReason: FALLBACK_ANNOTATION,
      });
    });

    it('returns unavailable when no form is eligible', () => {
      const forms: ScriptFormState = {
        traditional: TRADITIONAL,
        traditionalStatus: 'generated',
        simplified: SIMPLIFIED,
        simplifiedStatus: 'unavailable',
      };
      const r = result(PATH_DEFAULT, 'generated', 'path-default', forms);
      expect(r).toEqual({
        preference: 'path-default',
        status: 'unavailable',
      });
    });
  });

  describe('requested eligible form is returned unchanged', () => {
    for (const preference of ['traditional', 'simplified'] as const) {
      for (const status of ['authored', 'verified'] as const) {
        it(`returns the eligible ${preference} (${status}) form unchanged`, () => {
          const requestedKey = preference === 'traditional' ? 'traditional' : 'simplified';
          const forms: ScriptFormState = {
            traditional: TRADITIONAL,
            traditionalStatus: 'verified',
            simplified: SIMPLIFIED,
            simplifiedStatus: 'verified',
            [requestedKey]: preference === 'traditional' ? TRADITIONAL : SIMPLIFIED,
            [`${requestedKey}Status`]: status,
          };
          const r = result(PATH_DEFAULT, 'authored', preference, forms);
          const requestedText = preference === 'traditional' ? TRADITIONAL : SIMPLIFIED;
          expect(available(r)).toBe(true);
          expect(r).toEqual({
            preference,
            script: requestedText,
            status,
            isFallback: false,
          });
        });
      }
    }
  });

  describe('fallback when the requested form is unavailable/generated', () => {
    for (const preference of ['traditional', 'simplified'] as const) {
      const other = preference === 'traditional' ? SIMPLIFIED : TRADITIONAL;
      const otherKey = preference === 'traditional' ? 'simplified' : 'traditional';
      const otherStatusKey = preference === 'traditional' ? 'simplifiedStatus' : 'traditionalStatus';

      it(`${preference}: falls back first to eligible path-default`, () => {
        const forms: ScriptFormState = {
          [otherKey]: other,
          [otherStatusKey]: 'verified',
        } as ScriptFormState;
        const r = result(PATH_DEFAULT, 'verified', preference, forms);
        expect(r).toEqual({
          preference,
          script: PATH_DEFAULT,
          status: 'verified',
          isFallback: true,
          fallbackReason: FALLBACK_ANNOTATION,
        });
      });

      it(`${preference}: falls back to the other eligible form when path-default is ineligible`, () => {
        const forms: ScriptFormState = {
          [otherKey]: other,
          [otherStatusKey]: 'verified',
        } as ScriptFormState;
        const r = result(PATH_DEFAULT, 'generated', preference, forms);
        expect(r).toEqual({
          preference,
          script: other,
          status: 'verified',
          isFallback: true,
          fallbackReason: FALLBACK_ANNOTATION,
        });
      });

      it(`${preference}: returns unavailable when nothing is eligible`, () => {
        const forms: ScriptFormState = {
          [otherKey]: other,
          [otherStatusKey]: 'generated',
        } as ScriptFormState;
        const r = result(PATH_DEFAULT, 'generated', preference, forms);
        expect(r).toEqual({
          preference,
          status: 'unavailable',
        });
      });
    }
  });

  describe('generated forms are never selected directly', () => {
    it('does not return a requested generated form directly', () => {
      const forms: ScriptFormState = {
        traditional: TRADITIONAL,
        traditionalStatus: 'generated',
        simplified: SIMPLIFIED,
        simplifiedStatus: 'generated',
      };
      const r = result(PATH_DEFAULT, 'verified', 'traditional', forms);
      expect(r).toEqual({
        preference: 'traditional',
        script: PATH_DEFAULT,
        status: 'verified',
        isFallback: true,
        fallbackReason: FALLBACK_ANNOTATION,
      });
    });
  });

  describe('absent forms and malformed statuses', () => {
    it('treats an absent form as absent and does not select it', () => {
      const forms: ScriptFormState = {
        traditional: TRADITIONAL,
        traditionalStatus: 'authored',
        // simplified absent entirely
      };
      const r = result(PATH_DEFAULT, 'verified', 'simplified', forms);
      expect(r).toEqual({
        preference: 'simplified',
        script: PATH_DEFAULT,
        status: 'verified',
        isFallback: true,
        fallbackReason: FALLBACK_ANNOTATION,
      });
    });

    it('treats malformed status values as absent', () => {
      const forms: ScriptFormState = {
        traditional: TRADITIONAL,
        traditionalStatus: 'banana' as never,
        simplified: SIMPLIFIED,
        simplifiedStatus: 'unavailable' as never,
      };
      const r = result(PATH_DEFAULT, 'verified', 'traditional', forms);
      expect(r).toEqual({
        preference: 'traditional',
        script: PATH_DEFAULT,
        status: 'verified',
        isFallback: true,
        fallbackReason: FALLBACK_ANNOTATION,
      });
    });
  });

  describe('no conversion, fabrication, or side effects', () => {
    it('returns the exact text of the selected form without conversion', () => {
      const forms: ScriptFormState = {
        traditional: TRADITIONAL,
        traditionalStatus: 'authored',
        simplified: SIMPLIFIED,
        simplifiedStatus: 'verified',
      };
      const r = result(PATH_DEFAULT, 'authored', 'traditional', forms);
      expect(available(r)).toBe(true);
      if (r.status === 'authored' || r.status === 'verified') {
        expect(r.script).toBe(TRADITIONAL);
      }
    });

    it('returns a stable unavailable result without fabricating text', () => {
      const r = result(PATH_DEFAULT, 'generated', 'simplified', {});
      expect(r).toEqual({ preference: 'simplified', status: 'unavailable' });
      // The result is not an available selection: no script text is fabricated.
      expect(available(r)).toBe(false);
    });

    it('returns a fresh object per call (immutability of the result)', () => {
      const forms: ScriptFormState = {
        traditional: TRADITIONAL,
        traditionalStatus: 'authored',
      };
      const a = result(PATH_DEFAULT, 'authored', 'traditional', forms);
      const b = result(PATH_DEFAULT, 'authored', 'traditional', forms);
      expect(a).not.toBe(b);
      expect(a).toEqual(b);
    });

    it('does not mutate the input forms object', () => {
      const forms: ScriptFormState = {
        traditional: TRADITIONAL,
        traditionalStatus: 'authored',
        simplified: SIMPLIFIED,
        simplifiedStatus: 'verified',
      };
      const snapshot = JSON.stringify(forms);
      result(PATH_DEFAULT, 'authored', 'simplified', forms);
      expect(JSON.stringify(forms)).toBe(snapshot);
    });
  });
});
