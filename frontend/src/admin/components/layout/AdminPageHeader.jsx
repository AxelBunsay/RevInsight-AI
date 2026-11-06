import { useEffect, useState } from 'react';

const dateFormatter = new Intl.DateTimeFormat('en-PH', {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
  year: 'numeric',
  timeZone: 'Asia/Manila'
});
const timeFormatter = new Intl.DateTimeFormat('en-PH', {
  hour: 'numeric',
  minute: '2-digit',
  second: '2-digit',
  hour12: true,
  timeZone: 'Asia/Manila'
});

export default function AdminPageHeader({ title, className = '' }) {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const intervalId = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(intervalId);
  }, []);

  return <div className={`admin-page-heading ${className}`.trim()}>
    <h1>{title}</h1>
    <p><time dateTime={now.toISOString()}>{dateFormatter.format(now)} · {timeFormatter.format(now)}</time></p>
  </div>;
}
