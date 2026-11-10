import { supabase } from '../supabase';
import { href, useApp, useLoad } from '../lib';
import { AVAILABILITY_LABEL, type Availability } from '../types';

/** One line: who's free on a given day (shown on an episode's page for its recording date). */
export default function DayAvailability({ day }: { day: string }) {
  const { profiles } = useApp();
  const res = useLoad<Availability[]>(
    () => supabase.from('availability').select('member_id, day, status, note').eq('day', day),
    [day],
  );
  const crew = [...profiles.values()].sort((a, b) => a.display_name.localeCompare(b.display_name));
  const marks = new Map((res.data ?? []).map((a) => [a.member_id, a]));
  const everyone = crew.length > 0 && crew.every((p) => marks.get(p.id)?.status === 'free');
  return (
    <p className="day-availability">
      <span className="small">{everyone ? 'Everyone’s free that day.' : 'That day:'}</span>
      {crew.map((p) => {
        const a = marks.get(p.id);
        return (
          <span key={p.id} title={a?.note ?? undefined}>
            <i className={`dot ${a?.status ?? 'unset'}`} aria-hidden="true" /> {p.display_name}{' '}
            <span className="muted">{a ? AVAILABILITY_LABEL[a.status] : 'not set'}</span>
          </span>
        );
      })}
      <a href={href('episodes')}>Calendar</a>
    </p>
  );
}
