export type Operator = "港台" | "HOY" | "TVB" | "ViuTV";

export type Channel = {
  id: string;
  number: number;
  name: string;
  operator: Operator;
  accent: string;
  sourceUrl: string;
};

export type Programme = {
  id: string;
  channelId: string;
  title: string;
  start: string;
  end: string;
  description?: string;
  source: string;
  url?: string;
  endEstimated?: boolean;
};

export type SourceStatus = Record<string, boolean>;

export type DaySchedule = {
  date: string;
  updatedAt: string;
  channels: Channel[];
  programmes: Programme[];
  sourceStatus?: SourceStatus;
  errors?: string[];
};

export type ScheduleIndex = {
  updatedAt: string;
  dates: string[];
  errors?: string[];
  sourceStatus?: SourceStatus;
};
