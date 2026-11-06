import { useState, type FormEvent } from 'react';
import { navigate } from '../lib';

export default function SearchBox({ initial = '' }: { initial?: string }) {
  const [q, setQ] = useState(initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate('search', q.trim());
  };
  return (
    <form className="search" onSubmit={submit} role="search">
      <input
        type="search"
        placeholder="Search articles…"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        aria-label="Search"
      />
    </form>
  );
}
