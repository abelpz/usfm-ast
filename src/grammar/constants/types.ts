type UsfmStyleType = 'paragraph' | 'character' | 'milestone' | 'note';

type UsfmRole =
  | 'identification'
  | 'introduction'
  | 'title'
  | 'section'
  | 'body'
  | 'poetry'
  | 'list'
  | 'table'
  | 'formatting'
  | 'break'
  | 'note'
  | 'mark'
  | 'sidebar'
  | 'versification'
  | 'peripheral';

//Get the structure of the marker from the marker name
export type UsfmContextType =
  | 'ScriptureContent' //directly inside scripture content
  | 'PeripheralContent' //directly inside peripheral content
  | 'IntroductionContent' //directly inside introduction content
  | 'ChapterContent' //Can contain paragraphs
  | 'VerseContent' //Can contain formatting characters
  | 'ParagraphContent'
  | 'PoetryContent'
  | 'TableContent'
  | 'NoteContent'
  | 'ListContent'
  | 'SidebarContent';

interface USFMAttributeInfo {
  description: string;
  required?: boolean;
  values?: string[]; // For enumerated values
  type?: 'string' | 'number' | 'boolean';
  defaultValue?: string | number | boolean;
}

export interface USFMMarkerBaseInfo {
  type: UsfmStyleType;
  role?: UsfmRole; //for clasifying the marker in terms of its role in the document
  context?: UsfmContextType[];
  displayName?: string; //for rendering in the UI
  contentType?: 'text' | 'mixed' | 'none'; //if not present mixed should be assumed
  /** usx/usj labels (para, verse, chapter, book, etc.) */
  label?: string;
  /** publishable, vernacular, etc. */
  tags?: string[];
}

export interface USFMMarkerWithoutAttributes extends USFMMarkerBaseInfo {
  allowsAttributes?: false;
  defaultAttribute?: never;
  attributes?: never;
}

export interface USFMMarkerWithAttributes extends USFMMarkerBaseInfo {
  allowsAttributes: true;
  defaultAttribute?: string;
  attributes?: Record<string, USFMAttributeInfo>;
}

export type USFMMarkerInfo = USFMMarkerWithoutAttributes | USFMMarkerWithAttributes;
