import { ShieldCheck, BarChart2, Users, ListCheck, MessageSquare, History } from "lucide-react";

export default function FeatureGrid() {
  return (
    <section id="features" className="section">
      <div className="wrap features">
        <h2>What's inside</h2>
        <div className="features__grid">
          <div className="features__card">
            <ShieldCheck className="features__icon" />
            <h3 className="features__title">Verified businesses</h3>
            <p className="features__description">
              Udyam, GST and Shop Act documents are checked before a business can pitch.
            </p>
          </div>
          <div className="features__card">
            <BarChart2 className="features__icon" />
            <h3 className="features__title">Readiness score</h3>
            <p className="features__description">
              Every business gets a score from 0–100 so investors know how much groundwork has been done.
            </p>
          </div>
          <div className="features__card">
            <Users className="features__icon" />
            <h3 className="features__title">Smart matching</h3>
            <p className="features__description">
              Investors only see pitches that match their sector and cheque size.
            </p>
          </div>
          <div className="features__card">
            <ListCheck className="features__icon" />
            <h3 className="features__title">Structured offers</h3>
            <p className="features__description">
              Every bid captures amount, equity and terms. No email threads.
            </p>
          </div>
          <div className="features__card">
            <MessageSquare className="features__icon" />
            <h3 className="features__title">In-platform chat</h3>
            <p className="features__description">
              Businesses and investors talk inside SmartShark, with the deal context attached.
            </p>
          </div>
          <div className="features__card">
            <History className="features__icon" />
            <h3 className="features__title">Full audit trail</h3>
            <p className="features__description">
              Every profile edit, offer and status change is logged and timestamped.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}