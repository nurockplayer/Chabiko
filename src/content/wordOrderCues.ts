import type { WordOrderItem } from '../domain/wordOrderPractice';

interface CueBundle {
  source: string;
  reviewStatus: string;
  humanReview: boolean;
  items: Array<{
    recordId: string;
    targetTraditional: string;
    meaningJa: string;
    acceptableAnswersTraditional: string[];
  }>;
}

/** Bind provisional cues to exact source targets; never silently apply stale data. */
export function applyWordOrderCues(items: WordOrderItem[], bundle: CueBundle): WordOrderItem[] {
  if (bundle.reviewStatus !== 'draft' || bundle.humanReview !== false || !bundle.source.trim()) {
    throw new Error('Word-order cues must retain truthful provisional provenance');
  }
  const cues = new Map(bundle.items.map((cue) => [cue.recordId, cue]));
  if (cues.size !== bundle.items.length || cues.size !== items.length) {
    throw new Error('Word-order cue set does not match the practice corpus');
  }
  return items.map((item) => {
    const cue = cues.get(item.recordId);
    const target = item.canonicalOrder.map((index) => item.chunks[index].text).join(item.separator);
    const characters = (text: string) => Array.from(text).sort().join('');
    if (!cue || cue.targetTraditional !== target || !cue.meaningJa.trim() ||
      !cue.acceptableAnswersTraditional.every((answer) => characters(answer) === characters(target))) {
      throw new Error(`Invalid or stale word-order cue for '${item.recordId}'`);
    }
    return {
      ...item,
      promptJa: `この意味の文を作りましょう：${cue.meaningJa}`,
      acceptableAnswersTraditional: cue.acceptableAnswersTraditional,
    };
  });
}
