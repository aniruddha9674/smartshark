export default function Roles() {
  return (
    <section id="who" className="section section--tint">
      <div className="wrap roles">
        <div>
          <h2>If you run a business</h2>
          <p>
            Skip the cold emails. Write one pitch, set your ask, and let matching put it in
            front of investors who already back your kind of company.
          </p>
          <a className="textlink" href="/register?role=business">Create a business account</a>
        </div>
        <div>
          <h2>If you invest</h2>
          <p>
            Tell us the sectors and cheque sizes you care about. You only see pitches that
            fit, and you can make an offer without leaving the page.
          </p>
          <a className="textlink" href="/register?role=investor">Create an investor account</a>
        </div>
      </div>
    </section>
  );
}