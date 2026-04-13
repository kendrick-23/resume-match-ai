import { useNavigate } from 'react-router-dom';
import ScreenWrapper from '../components/ui/ScreenWrapper';
import Card from '../components/ui/Card';
import Button from '../components/ui/Button';
import { BarChart3, Search, FileText, ClipboardList, Flame } from 'lucide-react';
import './Help.css';

const SECTIONS = [
  {
    icon: BarChart3,
    title: 'Your Holt Score',
    body: "Every job gets a Holt Score — not just a keyword match, but a real assessment of how your experience, salary expectations, schedule, and location align with the role. The hospitality and retail work you've done translates directly into corporate operations language. Holt does that translation for you.",
  },
  {
    icon: Search,
    title: 'Finding Jobs',
    body: "Tap 'Find jobs that fit me' and Holt searches federal and private listings simultaneously, scored against your profile. Tap Analyze on any job card to get a full breakdown — no copy-pasting needed.",
  },
  {
    icon: FileText,
    title: 'Your Resume Vault',
    body: 'Store up to 5 resumes. Your default resume is used automatically every time you analyze a job. Generate a tailored ATS-ready resume for any specific role in about 15 seconds.',
  },
  {
    icon: ClipboardList,
    title: 'Tracking Applications',
    body: 'Log every application in the Tracker and update your status as things move. When you hit Interview status, something special happens.',
  },
  {
    icon: Flame,
    title: 'Your Streak',
    body: "Every day you run an analysis or log an application, your streak grows. Otters are creatures of habit — they return to the same spots, the same routines. Your streak is your rhythm.",
  },
];

export default function Help() {
  const navigate = useNavigate();

  return (
    <ScreenWrapper screenName="Help">
      <div className="help-page">
        {/* Hero — Ott in his holt */}
        <div className="help-page__hero">
          <img
            src="/ott/ott-in-holt.png"
            alt="Ott peeking from his cozy den"
            className="help-page__hero-img"
          />
          <h2 className="help-page__title">How Holt Works</h2>
          <p className="help-page__subtitle">
            Holt is your private job search companion. Everything here is built
            around you — your resume, your goals, your timeline. Ott's been
            waiting to show you around.
          </p>
        </div>

        {/* Illustrated section cards */}
        <div className="help-page__sections">
          {SECTIONS.map((s) => {
            const Icon = s.icon;
            return (
              <Card key={s.title} className="help-page__card">
                <div className="help-page__card-header">
                  <div className="help-page__card-icon">
                    <Icon size={20} />
                  </div>
                  <h3 className="help-page__card-title">{s.title}</h3>
                </div>
                <p className="help-page__card-body">{s.body}</p>
              </Card>
            );
          })}
        </div>

        {/* Footer — nurturing goodbye */}
        <div className="help-page__footer">
          <img
            src="/ott/ott-with-pup.png"
            alt="Ott holding a pup"
            className="help-page__footer-img"
          />
          <Button variant="secondary" onClick={() => navigate(-1)}>
            &larr; Back
          </Button>
        </div>
      </div>
    </ScreenWrapper>
  );
}
