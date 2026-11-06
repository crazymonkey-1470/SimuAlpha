// Mirrors supabase/migrations/20261106215937_init.sql
export type Role = 'host' | 'producer';
export type ItemType = 'article' | 'video' | 'note' | 'fun_fact' | 'guest_idea';
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
