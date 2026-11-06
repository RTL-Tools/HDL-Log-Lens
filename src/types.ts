export type Severity = 'error' | 'warning' | 'info';
export type Tool = 'verilator' | 'yosys' | 'nextpnr' | 'nvc';

export interface Finding {
  file?: string; // undefined => attach to the log file
  line: number; // 1-based
  col: number; // 1-based
  endLine?: number;
  endCol?: number;
  severity: Severity;
  code?: string;
  message: string;
}

export type Parser = (text: string) => Finding[];
