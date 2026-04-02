/**
 * Label type definition used across the label system.
 * Default labels were removed — users create all labels via the wizard.
 */
export interface LabelDef {
  name: string;
  aiPrompt: string | null;
  color: { backgroundColor: string; textColor: string } | null;
  category: 'workflow' | 'semantic' | 'suppression' | 'custom';
  suppressUrgency: boolean;
  mutuallyExclusiveWith: string[];
  defaultLane: string | null;
}
