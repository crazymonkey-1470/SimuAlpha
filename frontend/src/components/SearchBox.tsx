import { useState, type FormEvent } from 'react';
import { navigate } from '../lib';
import { SearchIcon } from './Icons';

export default function SearchBox({ initial = '' }: { initial?: string }) {
  const [q, setQ] = useState(initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (q.trim()) navigate('search', q.trim());
  };
  return (
    <form className="search" onSubmit={submit} role="search">
      <SearchIcon size={18} />
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
