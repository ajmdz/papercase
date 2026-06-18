export type ReaderNavigationTarget = number | string;

export type ReaderContentsItem = {
  id: string;
  title: string;
  target: ReaderNavigationTarget | null;
  label: string | null;
  level: number;
};
