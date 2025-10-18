export type OpBase = {
  id: string;
  pageIndex: number;
};

export type Box = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type TextStyle = {
  fontSize: number;
  fontWeight?: 'normal' | 'bold';
  fontStyle?: 'normal' | 'italic';
};

export type TextOp = OpBase & {
  type: 'text';
  box: Box;
  content: string;
  style: TextStyle;
  sourceRunId?: string;
};

export type ImageOp = OpBase & {
  type: 'image';
  box: Box;
  sourceImageId?: string;
  sourceBox?: Box;
  remove?: boolean;
};

export type EditorOp = TextOp | ImageOp;

export type EditorDoc = {
  ops: EditorOp[];
};

export type SerializedEditorDoc = EditorDoc;

export type SelectionState = {
  ids: string[];
  marquee?: Box | null;
};

export interface EditorOverlayMetrics {
  scale: number;
  rotation: number;
}
