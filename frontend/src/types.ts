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

export type QuoteRole = 'opener' | 'closer';

export interface Episode {
  id: string;
  title: string;
  recording_date: string | null;
  status: EpisodeStatus;
  notes: string | null;
  quote_id: string | null;
  quote_role: QuoteRole;
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

export type MemoryKind = 'preference' | 'fact' | 'event' | 'instruction' | 'reflection';

/** Row of the memory_cards view. */
export interface MemoryCard {
  id: string;
  kind: MemoryKind;
  content: string;
  about_member: string | null;
  about_topic: string | null;
  about_item: string | null;
  about_episode: string | null;
  about_entity: string | null;
  tags: string[];
  importance: number;
  confidence: number;
  pinned: boolean;
  source: 'grok' | 'member' | 'producer' | 'system';
  created_by: string | null;
  evidence: string | null;
  invalid_at: string | null;
  retired_reason: string | null;
  reinforced_count: number;
  access_count: number;
  created_at: string;
  updated_at: string;
  subject: string;
  created_by_name: string;
}

export const MEMORY_KIND_LABEL: Record<MemoryKind, string> = {
  preference: 'Preference',
  fact: 'Fact',
  event: 'Event',
  instruction: 'Instruction',
  reflection: 'Insight',
};

export type FeedbackKind = 'discuss' | 'more_like_this' | 'not_interested';

/** Row of the source_inbox view: one story (lead entry + every outlet that covered it). */
export interface SourceStory {
  story_id: string;
  entry_id: string;
  title: string;
  url: string;
  source: string;
  published_at: string | null;
  preview: string | null;
  topics: string[];
  outlet_count: number;
  outlets: string[];
  latest_at: string;
  item_id: string | null;
  in_prep: boolean;
  discuss_count: number;
  more_count: number;
  not_count: number;
  my_feedback: FeedbackKind[];
  read_summary: string | null;
  read_checked_at: string | null;
  read: boolean;
  media_type: 'article' | 'video' | 'podcast';
  media_url: string | null;
  thumbnail_url: string | null;
  duration_seconds: number | null;
  views: number | null;
  transcript_url: string | null;
}

export type FeedKind = 'rss' | 'youtube' | 'podcast';

export interface Feed {
  id: string;
  name: string;
  kind: FeedKind;
  url: string;
  input_url: string | null;
  resolved: boolean;
  site_url: string | null;
  topics: string[];
  active: boolean;
  last_fetched_at: string | null;
  last_status: number | null;
  last_error: string | null;
  last_new_count: number | null;
  backfilled_at: string | null;
  created_at: string;
}

/** Row of the quote_cards view: a quote from the bank, with where it was used. */
export interface QuoteCard {
  id: string;
  text: string;
  author: string;
  source: string | null;
  source_url: string | null;
  context: string | null;
  questions: string[];
  topics: string[];
  verified: boolean;
  added_by: string | null;
  added_by_name: string;
  created_at: string;
  used_count: number;
  used_in: string[];
  last_used: string | null;
}

export const QUOTE_ROLE_LABEL: Record<QuoteRole, string> = {
  opener: 'Opener: wisdom to start the conversation',
  closer: 'Closer: send-off to end the show',
};

export type AvailabilityStatus = 'free' | 'maybe' | 'busy';

export interface Availability {
  member_id: string;
  day: string;
  status: AvailabilityStatus;
  note: string | null;
}

export const AVAILABILITY_LABEL: Record<AvailabilityStatus, string> = {
  free: 'Free',
  maybe: 'Maybe',
  busy: 'Busy',
};

/** Row of crew_board(days): one crew member (or Grok, member_id null). */
export interface CrewStat {
  member_id: string | null;
  name: string;
  added: number;
  from_feed: number;
  nominated: number;
  on_air: number;
  stars_received: number;
  comments: number;
  stars_given: number;
  research: number;
  last_added: string | null;
}
