const steps = [
  ["Pitch", "A business describes what it does, what it needs and what it will give up."],
  ["Match", "Investors are ranked against the pitch using their stated industries and cheque size."],
  ["Offer", "Interested investors send an amount and terms. The business sees every offer side by side."],
  ["Talk", "Both sides move to a conversation, and verified documents back up the claims."],
];

export default function Flow() {
  return (
    <section id="how" className="section wrap">
      <h2>From pitch to handshake in four steps</h2>
      <ol className="flow">
        {steps.map(([title, body], i) => (
          <li key={title}>
            <span className="flow__n">{i + 1}</span>
            <h3>{title}</h3>
            <p>{body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}