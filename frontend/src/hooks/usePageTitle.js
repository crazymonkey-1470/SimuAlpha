import { useEffect } from 'react';

const BASE_TITLE = 'The Long Screener';

export default function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} | ${BASE_TITLE}` : BASE_TITLE;
    return () => { document.title = BASE_TITLE; };
  }, [title]);
}
