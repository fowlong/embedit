declare module '@embedpdf/viewer' {
  export interface Viewer {
    readonly container: HTMLElement;
    readonly document?: {
      readonly title?: string;
      readonly pageCount: number;
    };
    pages: {
      onRender(cb: (ctx: PageRenderContext) => void): () => void;
      getViewport(pageIndex: number): PageViewport | undefined;
      rerender(pageIndex: number): void;
      renderBitmap(pageIndex: number, options?: RenderBitmapOptions): Promise<PageBitmap>;
    };
    toolbar: {
      registerButton(config: ToolbarButton): void;
      unregisterButton(id: string): void;
    };
    keyboard: {
      bind(keys: string | string[], handler: (event: KeyboardEvent) => void): () => void;
    };
    storage?: {
      saveBlob(blob: Blob, suggestedName?: string): Promise<void>;
    };
    ui?: {
      showToast(message: string, options?: { type?: 'info' | 'error' | 'success' }): void;
    };
  }

  export interface ToolbarButton {
    id: string;
    label: string;
    tooltip?: string;
    onClick: () => void;
    isActive?: () => boolean;
    group?: string;
    order?: number;
  }

  export interface Plugin {
    name: string;
    onAttach(viewer: Viewer): void | (() => void);
  }

  export interface PageRenderContext {
    pageIndex: number;
    container: HTMLElement;
    rotation: number;
    scale: number;
    text?: TextRun[];
    images?: ImageAsset[];
    viewport: PageViewport;
  }

  export interface RenderBitmapOptions {
    scale?: number;
    rotation?: number;
    format?: 'png' | 'jpeg';
  }

  export interface PageBitmap {
    dataUrl: string;
    width: number;
    height: number;
  }

  export interface TextRun {
    id: string;
    pageIndex: number;
    content: string;
    box: PageBox;
    style: {
      fontSize: number;
      fontWeight?: 'normal' | 'bold';
      fontStyle?: 'normal' | 'italic';
    };
  }

  export interface ImageAsset {
    id: string;
    pageIndex: number;
    box: PageBox;
  }

  export interface PageViewport {
    width: number;
    height: number;
    transform: DOMMatrix;
  }

  export interface PageBox {
    x: number;
    y: number;
    w: number;
    h: number;
  }
}
