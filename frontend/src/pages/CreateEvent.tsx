import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, MailCheck } from 'lucide-react';
import { EventForm } from '@/components/events/EventForm';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Primitives';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/context/AuthContext';
import {
  describeAuthError,
  needsEmailVerification,
  refreshEmailVerified,
  resendVerificationEmail,
} from '@/lib/firebase';

export default function CreateEvent() {
  const { user } = useAuth();
  const [mustVerify, setMustVerify] = useState(() => needsEmailVerification(user));

  useEffect(() => {
    document.title = 'Create an event — Nearby-Events';
  }, []);

  useEffect(() => {
    setMustVerify(needsEmailVerification(user));
  }, [user]);

  return (
    <div className="container-page max-w-3xl py-8">
      <nav aria-label="Breadcrumb" className="mb-4">
        <ol className="flex items-center gap-1.5 text-xs font-medium text-ink-muted">
          <li>
            <Link to="/" className="transition-colors hover:text-brand">
              Home
            </Link>
          </li>
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          <li aria-current="page" className="text-ink">
            Create event
          </li>
        </ol>
      </nav>

      <header className="mb-8">
        <h1 className="text-display-lg">Put something on the board</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-soft sm:text-base">
          Add the details and your event is live straight away, with its own shareable link. If
          writing is not your thing, the AI assistant will tidy up a rough note for you.
        </p>
      </header>

      {mustVerify ? (
        <VerifyEmailNotice email={user?.email ?? ''} onVerified={() => setMustVerify(false)} />
      ) : (
        <EventForm mode="create" />
      )}
    </div>
  );
}

/**
 * Shown instead of the form to email/password accounts that have not confirmed their
 * address yet. Keeps made-up addresses off the board; Google sign-ins never see it.
 */
function VerifyEmailNotice({ email, onVerified }: { email: string; onVerified: () => void }) {
  const toast = useToast();
  const [checking, setChecking] = useState(false);
  const [sending, setSending] = useState(false);

  async function check() {
    setChecking(true);
    try {
      if (await refreshEmailVerified()) {
        toast.success('Email verified', 'You can post events now.');
        onVerified();
      } else {
        toast.info('Not verified yet', 'Open the link in the email we sent you, then try again.');
      }
    } catch (error) {
      toast.error('Could not check', describeAuthError(error));
    } finally {
      setChecking(false);
    }
  }

  async function resend() {
    setSending(true);
    try {
      await resendVerificationEmail();
      toast.success('Email sent', `Check ${email || 'your inbox'} (and the spam folder).`);
    } catch (error) {
      toast.error('Could not send the email', describeAuthError(error));
    } finally {
      setSending(false);
    }
  }

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex items-start gap-4">
        <MailCheck className="mt-0.5 h-7 w-7 shrink-0 text-brand" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-semibold text-ink">Verify your email to post</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            We sent a link to <span className="font-medium text-ink">{email || 'your email address'}</span>.
            Open it to confirm the address is yours, then come back here. This keeps fake accounts off the
            board. You can already browse and RSVP.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Button onClick={check} loading={checking} loadingLabel="Checking">
              I&apos;ve verified
            </Button>
            <Button variant="secondary" onClick={resend} loading={sending} loadingLabel="Sending">
              Resend email
            </Button>
          </div>
          <p className="mt-4 text-xs text-ink-muted">
            Signed up with Google instead? Google accounts are verified automatically.
          </p>
        </div>
      </div>
    </Card>
  );
}
