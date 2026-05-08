export interface ExternalLinks {
  // TODO[Phase8]: Google Workspace 연계 시 채움
  googleSheets?: { url: string; embedded: boolean }[];
  googleSlides?: { url: string; embedded: boolean }[];
}

export interface Story {
  id: string; // nanoid(12)
  channelId: string;
  title: string; // 기본 "이름 N"
  titleUpdatedAt: string;
  createdAt: string;
  thumbnailUrl: string | null;
  externalLinks: ExternalLinks;
}
