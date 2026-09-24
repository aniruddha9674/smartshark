const offers = [
  { who: "Meera Rao", terms: "$80,000 for 8% equity", note: "Can also introduce two retail partners." },
  { who: "Northline Capital", terms: "$120,000 for 12% equity", note: "Wants monthly reporting." },
];

export default function Hero() {
  return (
    <section className="hero wrap">
      <div className="hero__text">
        <h1>Pitch your business. Get offers from investors who fit.</h1>
        <p className="lead">
          SmartShark is a virtual Shark Tank. Businesses post a pitch, we match it to
          investors by industry and ticket size, and investors reply with real offers.
        </p>
        <div className="hero__actions">
          <a className="btn" href="/register?role=business">Post a pitch</a>
          <a className="btn btn--ghost" href="/register?role=investor">Join as an investor</a>
        </div>
        <p className="fineprint">In active development. Accounts and sign-in work today; pitches are next.</p>
      </div>

      <aside className="ticket" aria-label="Example of offers on a pitch">
        <p className="ticket__title">Oat &amp; Ember Bakery</p>
        <p className="ticket__ask">Asking $100,000 for 10%</p>
        <ul className="ticket__offers">
          {offers.map((o) => (
            <li key={o.who}>
              <strong>{o.who}</strong>
              <span className="ticket__terms">{o.terms}</span>
              <span className="ticket__note">{o.note}</span>
            </li>
          ))}
        </ul>
        <p className="ticket__foot">Example pitch, not a real listing.</p>
      </aside>
    </section>
  );
}