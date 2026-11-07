import type { LineRow } from './timing';

export interface Annotation { line: number; text: string; hover: string; negative: boolean } // line is 0-based

const sign = (n: number) => `${n >= 0 ? '+' : ''}${n.toFixed(2)}`;

export function inlineAnnotations(rows: LineRow[], file: string): Annotation[] {
  return rows.filter((r) => r.src.file === file).map((r) => {
    const n = r.endpoints ? ` · ${r.endpoints} endpoint${r.endpoints === 1 ? '' : 's'}` : '';
    const slack = r.slackNs === undefined ? '' : `, slack ${sign(r.slackNs)} ns`;
    return {
      line: r.src.line - 1,
      text: r.slackNs === undefined ? `${r.arrivalNs.toFixed(2)} ns` : `slack ${sign(r.slackNs)} ns${n}`,
      negative: r.slackNs !== undefined && r.slackNs < 0,
      hover: [`Worst: ${r.worst}`, `arrives at ${r.arrivalNs.toFixed(2)} ns${slack} [${r.report}]`,
        ...(r.endpoints ? [`${r.endpoints} endpoint${r.endpoints === 1 ? '' : 's'} end on this line`] : [])].join('\n'),
    };
  });
}
