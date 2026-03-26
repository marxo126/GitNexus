export type SignalStatus = 'violation' | 'needs-review' | 'pass';
export type SignalSeverity = 'critical' | 'serious' | 'moderate' | 'minor';
export type SignalConfidence = 'definite' | 'likely' | 'heuristic';
export type ComplianceTag = 'eu-required' | 'eu-recommended' | 'wcag-aaa' | 'deaf-specific';

export interface ExtractedJSXElement {
  tag: string;
  filePath: string;
  lineNumber: number;
  attributes: Map<string, string | true>;
  hasChildren: boolean;
  textContent?: string;
  enclosingFunction: string;
  parentTag?: string;
  classNames?: string[];
  resolved?: boolean;  // true if this element came from component resolution (not directly in source)
}

export interface A11ySignal {
  name: string;
  criterion: string;
  status: SignalStatus;
  severity: SignalSeverity;
  element: string;
  filePath: string;
  startLine: number;
  confidence: SignalConfidence;
  complianceTag: ComplianceTag;
  enclosingFunction?: string;
}

export interface WCAGRule {
  id: string;
  criterion: string;
  wcagName: string;
  severity: SignalSeverity;
  complianceTag: ComplianceTag;
  check: (elements: ExtractedJSXElement[], filePath: string, source?: string) => A11ySignal[];
}
