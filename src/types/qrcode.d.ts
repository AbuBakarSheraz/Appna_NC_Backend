declare module 'qrcode' {
  export function toDataURL(
    text: string,
    options?: {
      errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
      margin?: number;
      scale?: number;
    },
  ): Promise<string>;

  export function create(
    text: string,
    options?: {
      errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
    },
  ): {
    modules: {
      size: number;
      get(col: number, row: number): boolean;
    };
  };
}
