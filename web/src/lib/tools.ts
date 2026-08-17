export type Tool = 'select' | 'pan' | 'pen' | 'rect' | 'ellipse' | 'diamond' | 'connector' | 'text' | 'eraser';

export interface ToolDef {
  id: Tool;
  label: string;
  hint: string;
}

export const TOOLS: ToolDef[] = [
  { id: 'select', label: 'Select', hint: 'Click to select, drag to move; connectors stay attached; double-click to add text; Delete removes' },
  { id: 'pan', label: 'Pan', hint: 'Drag to move around, or hold Space with any tool' },
  { id: 'pen', label: 'Pen', hint: 'Freehand draw' },
  { id: 'rect', label: 'Rectangle', hint: 'Drag out a box' },
  { id: 'ellipse', label: 'Ellipse', hint: 'Drag out an ellipse' },
  { id: 'diamond', label: 'Diamond', hint: 'Drag out a diamond (decision node)' },
  { id: 'connector', label: 'Arrow', hint: 'Drag between two shapes; the ends bind to the shapes and follow them' },
  { id: 'text', label: 'Text', hint: 'Click a shape to label it, or click empty space for a text box' },
  { id: 'eraser', label: 'Eraser', hint: 'Click or drag over things to erase them' },
];
