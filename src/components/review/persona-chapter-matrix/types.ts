/**
 * 文件定位（人物 x 章节矩阵共享类型）：
 * - 统一矩阵窗口化与网格渲染的基础常量，避免行高、列宽、选中单元格语义散落在多个组件里。
 * - 这里仅保留 T13/T15 会复用的轻量 UI 类型，不引入服务端依赖。
 */

export const PERSONA_CHAPTER_MATRIX_ROW_HEIGHT = 96;
export const PERSONA_CHAPTER_MATRIX_COLUMN_WIDTH = 224;
export const PERSONA_CHAPTER_MATRIX_OVERSCAN_ROWS = 2;
export const PERSONA_CHAPTER_MATRIX_OVERSCAN_COLUMNS = 1;

export interface MatrixCellSelection {
  personaId: string;
  chapterId: string;
}

export function toMatrixCellKey(selection: MatrixCellSelection): string {
  return `${selection.chapterId}::${selection.personaId}`;
}

export interface MatrixWindowInput {
  totalRows           : number;
  totalColumns        : number;
  viewportHeight      : number;
  viewportWidth       : number;
  scrollTop           : number;
  scrollLeft          : number;
  rowHeight        ?  : number;
  columnWidth      ?  : number;
  overscanRows     ?  : number;
  overscanColumns  ?  : number;
  selectedRowIndex ?  : number | null;
  selectedColumnIndex?: number | null;
}

export interface MatrixWindowResult {
  rowStart           : number;
  rowEnd             : number;
  columnStart        : number;
  columnEnd          : number;
  rowIndexes         : number[];
  columnIndexes      : number[];
  pinnedRowIndexes   : number[];
  pinnedColumnIndexes: number[];
  rowHeight          : number;
  columnWidth        : number;
  totalHeight        : number;
  totalWidth         : number;
}
