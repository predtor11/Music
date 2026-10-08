import { Button, Card } from '@music/ui';
import s from '../lesson/lesson.module.css';

export function Loading() {
  return (
    <Card padding="lg" className={s.loading} data-testid="loading">
      <div className={`ui-skeleton ${s.skTitle}`} />
      <div className={`ui-skeleton ${s.skLine}`} />
      <div className={`ui-skeleton ${s.skBlock}`} />
    </Card>
  );
}

/** Shown when the curriculum can't be loaded, with what to do about it. */
export function LoadError({ what, message }: { what: string; message: string }) {
  const offline = message.startsWith("Can't reach");
  return (
    <Card padding="lg" className={s.errorCard} data-testid="load-error">
      <h2 className="ui-heading">Couldn't load {what}</h2>
      <p className="ui-muted">
        {offline ? (
          <>
            The lesson server isn't running. Start everything with <code>npm run dev:all</code>, then try again.
          </>
        ) : (
          message
        )}
      </p>
      <div>
        <Button variant="secondary" onClick={() => location.reload()}>
          Try again
        </Button>
      </div>
    </Card>
  );
}
