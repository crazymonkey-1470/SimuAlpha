// Mirrors supabase/migrations/*.sql
export type Role = 'host' | 'producer';
export type ItemType = 'article' | 'video' | 'note' | 'fun_fact' | 'guest_idea' | 'topic_idea';
export type ItemStatus = 'inbox' | 'this_week' | 'used' | 'archived';
export type EpisodeStatus = 'planning' | 'recorded' | 'published';
export type ContactStatus = 'not_contacted' | 'reached_out' | 'confirmed' | 'declined';

export interface Topic {
  slug: string;
  name: string;
  sort_order: number;
  description: string | null;
}

export interface Profile {
  id: string;
  display_name: string;
  role: Role;
}

export interface Item {
  id: string;
  title: string;
  url: string | null;
  url_key: string | null;
  source: string | null;
  published_at: string | null;
  summary: string | null;
  talking_points: string[];
  quote: string | null;
  item_type: ItemType;
  status: ItemStatus;
  guest_name: string | null;
  why_them: string | null;
  contact_status: ContactStatus | null;
  added_by: string | null;
  added_by_role: Role;
  created_at: string;
  updated_at: string;
}

/** Row of the item_cards view. */
export interface ItemCard extends Item {
  topics: string[];
  episode_ids: string[];
  comment_count: number;
  added_by_name: string;
  highlighted_by: string[];
  highlight_count: number;
  research_open: number;
  research_done: number;
}

export interface Episode {
  id: string;
  title: string;
  recording_date: string | null;
  status: EpisodeStatus;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Comment {
  id: string;
  item_id: string;
  author_id: string | null;
  author_role: Role;
  body: string;
  created_at: string;
}

export const ITEM_TYPES: { value: ItemType; label: string }[] = [
  { value: 'article', label: 'Article' },
  { value: 'video', label: 'Video' },
  { value: 'note', label: 'Note' },
  { value: 'fun_fact', label: 'Fun fact' },
  { value: 'guest_idea', label: 'Guest idea' },
  { value: 'topic_idea', label: 'Topic idea' },
];

export const STATUS_LABEL: Record<ItemStatus, string> = {
  inbox: 'Inbox',
  this_week: 'This week',
  used: 'Used',
  archived: 'Archived',
};

export const CONTACT_LABEL: Record<ContactStatus, string> = {
  not_contacted: 'Not contacted',
  reached_out: 'Reached out',
  confirmed: 'Confirmed',
  declined: 'Declined',
};

export const EPISODE_STATUS_LABEL: Record<EpisodeStatus, string> = {
  planning: 'Planning',
  recorded: 'Recorded',
  published: 'Published',
};

export type ResearchKind = 'deep_research' | 'stats' | 'fact_check' | 'counterpoints' | 'guest_lookup' | 'other';
export type ResearchStatus = 'open' | 'in_progress' | 'done' | 'cancelled';

export interface ResearchRequest {
  id: string;
  item_id: string | null;
  episode_id: string | null;
  kind: ResearchKind;
  request: string;
  status: ResearchStatus;
  requested_by: string | null;
  requested_by_role: Role;
  response: string | null;
  sources: string[];
  answered_by: string | null;
  answered_at: string | null;
  created_at: string;
  updated_at: string;
  items?: { id: string; title: string; url: string | null; source: string | null; summary: string | null } | null;
}

export const RESEARCH_KIND_LABEL: Record<ResearchKind, string> = {
  deep_research: 'Deep research',
  stats: 'Stats',
  fact_check: 'Fact check',
  counterpoints: 'Counterpoints',
  guest_lookup: 'Guest lookup',
  other: 'Other',
};

export const RESEARCH_STATUS_LABEL: Record<ResearchStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  done: 'Answered',
  cancelled: 'Cancelled',
};
