export type Tool = 'select' | 'pan' | 'pen' | 'rect' | 'ellipse' | 'diamond' | 'connector' | 'eraser';

export interface ToolDef {
  id: Tool;
  label: string;
  hint: string;
}

export const TOOLS: ToolDef[] = [
  { id: 'select', label: 'Select', hint: 'Click to select, drag to move — connectors stay attached; Delete removes' },
  { id: 'pan', label: 'Pan', hint: 'Drag to move around — or hold Space with any tool' },
  { id: 'pen', label: 'Pen', hint: 'Freehand draw' },
  { id: 'rect', label: 'Rectangle', hint: 'Drag out a box' },
  { id: 'ellipse', label: 'Ellipse', hint: 'Drag out an ellipse' },
  { id: 'diamond', label: 'Diamond', hint: 'Drag out a diamond (decision node)' },
  { id: 'connector', label: 'Arrow', hint: 'Drag to connect two shapes — snaps to edges' },
  { id: 'eraser', label: 'Eraser', hint: 'Click or drag over things to erase them' },
];
